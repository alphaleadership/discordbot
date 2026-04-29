import { SlashCommandBuilder, EmbedBuilder, PermissionsBitField } from 'discord.js';

export default {
    data: new SlashCommandBuilder()
        .setName('ban')
        .setDescription('Bannir un utilisateur du serveur')
        .addUserOption(option =>
            option.setName('utilisateur')
                .setDescription('L\'utilisateur à bannir')
                .setRequired(true)
        )
        .addStringOption(option =>
            option.setName('raison')
                .setDescription('La raison du bannissement')
                .setRequired(false)
        )
        .addIntegerOption(option =>
            option.setName('supprimer-messages')
                .setDescription('Nombre de jours de messages à supprimer (0-7)')
                .setMinValue(0)
                .setMaxValue(7)
                .setRequired(false)
        ),
    async execute(interaction, adminManager, warnManager, guildConfig, sharedConfig, backupToGitHub, reportManager, banlistManager, blockedWordsManager, watchlistManager, telegramIntegration, funCommandsManager, raidDetector, doxDetector, enhancedReloadSystem, permissionValidator) {
        try {
            const targetUser = interaction.options.getUser('utilisateur');
            const reason = interaction.options.getString('raison') || 'Aucune raison spécifiée';
            const deleteMessageDays = interaction.options.getInteger('supprimer-messages') || 0;
            
            // Try to get target member from guild (they might not be in the guild)
            let targetMember = null;
            try {
                targetMember = await interaction.guild.members.fetch(targetUser.id);
            } catch (error) {
                // User is not in the guild, we can still ban them by ID
                console.log(`Utilisateur ${targetUser.tag} non trouvé sur le serveur, bannissement par ID`);
            }

            // Validate permissions using PermissionValidator
            // If user is not in guild, we pass the user object instead of member
            const permissionResult = permissionValidator.validateBanPermission(
                interaction.member,
                targetMember || targetUser
            );

            if (!permissionResult.success) {
                // Log permission denial
                if (reportManager && reportManager.moderationLogger) {
                    await reportManager.moderationLogger.logPermissionDenial({
                        action: 'ban',
                        userId: interaction.user.id,
                        userTag: interaction.user.tag,
                        targetId: targetUser.id,
                        targetTag: targetUser.tag,
                        guildId: interaction.guild.id,
                        guildName: interaction.guild.name,
                        reason: permissionResult.message || 'Permission denied',
                        requiredPermission: 'BAN_MEMBERS',
                        userPermissions: interaction.member.permissions.toArray()
                    });
                }
                
                return interaction.reply({
                    content: permissionResult.message || '❌ Vous n\'avez pas la permission d\'effectuer cette action.',
                    ephemeral: true
                });
            }

            // Handle agents: create pending request instead of direct ban
            if (permissionResult.isAgent) {
                const pendingResult = await banlistManager.addPendingRequest({
                    userId: targetUser.id,
                    username: targetUser.tag,
                    reason: reason,
                    moderatorId: interaction.user.id,
                    moderatorTag: interaction.user.tag,
                    guildId: interaction.guild.id,
                    guildName: interaction.guild.name,
                    deleteMessageDays: deleteMessageDays
                });

                if (!pendingResult.success) {
                    return interaction.reply({
                        content: `❌ Erreur lors de la création de la demande: ${pendingResult.error}`,
                        ephemeral: true
                    });
                }

                const pendingEmbed = new EmbedBuilder()
                    .setColor('#FFFF00')
                    .setTitle('⏳ Demande de bannissement soumise')
                    .setDescription('Votre demande a été enregistrée et doit être validée par un administrateur du bot.')
                    .addFields(
                        { name: 'Utilisateur', value: `${targetUser.tag} (${targetUser.id})` },
                        { name: 'Raison', value: reason },
                        { name: 'Agent', value: interaction.user.tag }
                    )
                    .setFooter({ text: 'ID de la demande: ' + pendingResult.request.id });

                await interaction.reply({ embeds: [pendingEmbed] });

                if (reportManager && reportManager.sendSystemAlert) {
                    await reportManager.sendSystemAlert(
                        interaction.client,
                        '🔨 Nouvelle demande de bannissement (Agent)',
                        `L'agent **${interaction.user.tag}** demande le bannissement de **${targetUser.tag}**.`,
                        [
                            { name: 'Raison', value: reason, inline: false },
                            { name: 'ID Demande', value: pendingResult.request.id, inline: true }
                        ],
                        0xFFFF00
                    );
                }

                return;
            }

            // Create ban embed for DM
            const banEmbed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('🔨 Bannissement')
                .setDescription(`Vous avez été banni de **${interaction.guild.name}**.`)
                .addFields(
                    { name: 'Raison', value: reason },
                    { name: 'Modérateur', value: interaction.user.tag },
                    { name: 'Date', value: new Date().toLocaleString('fr-FR') }
                )
                .setFooter({ text: 'Ce bannissement est permanent sauf décision contraire des modérateurs.' });

            // Try to send DM before banning (only if user is in guild)
            let dmSent = false;
            if (targetMember) {
                try {
                    await targetUser.send({ embeds: [banEmbed] });
                    dmSent = true;
                } catch (error) {
                    console.log(`Impossible d'envoyer un MP à ${targetUser.tag} avant le bannissement`);
                }
            }

            // Execute ban
            try {
                await interaction.guild.members.ban(targetUser.id, {
                    reason: reason,
                    deleteMessageSeconds: deleteMessageDays * 24 * 60 * 60 // Convert days to seconds
                });
                
                // Create success embed
                const successEmbed = new EmbedBuilder()
                    .setColor('#FF0000')
                    .setTitle('🔨 Bannissement réussi')
                    .addFields(
                        { name: 'Utilisateur', value: `${targetUser.tag} (${targetUser.id})` },
                        { name: 'Raison', value: reason },
                        { name: 'Modérateur', value: interaction.user.tag },
                        { name: 'Messages supprimés', value: `${deleteMessageDays} jour(s)` },
                        { name: 'MP envoyé', value: dmSent ? '✅ Oui' : '❌ Non' },
                        { name: 'Date', value: new Date().toLocaleString('fr-FR') }
                    );

                await interaction.reply({ embeds: [successEmbed] });

                // Log the action with ModerationLogger
                if (reportManager && reportManager.moderationLogger) {
                    await reportManager.moderationLogger.logModerationAction({
                        type: 'ban',
                        moderatorId: interaction.user.id,
                        moderatorTag: interaction.user.tag,
                        targetId: targetUser.id,
                        targetTag: targetUser.tag,
                        guildId: interaction.guild.id,
                        guildName: interaction.guild.name,
                        reason: reason,
                        success: true,
                        channelId: interaction.channel.id,
                        details: {
                            deleteMessageDays: deleteMessageDays,
                            dmSent: dmSent,
                            targetInGuild: !!targetMember
                        }
                    });
                }
                
                // Legacy console logging
                console.log(`[BAN] ${targetUser.tag} (${targetUser.id}) banni par ${interaction.user.tag} (${interaction.user.id}) - Raison: ${reason} - Messages supprimés: ${deleteMessageDays} jour(s)`);

            } catch (error) {
                console.error('Erreur lors du bannissement:', error);
                
                // Log failed action with ModerationLogger
                if (reportManager && reportManager.moderationLogger) {
                    await reportManager.moderationLogger.logModerationAction({
                        type: 'ban',
                        moderatorId: interaction.user.id,
                        moderatorTag: interaction.user.tag,
                        targetId: targetUser.id,
                        targetTag: targetUser.tag,
                        guildId: interaction.guild.id,
                        guildName: interaction.guild.name,
                        reason: reason,
                        success: false,
                        channelId: interaction.channel.id,
                        details: {
                            deleteMessageDays: deleteMessageDays,
                            errorCode: error.code,
                            errorMessage: error.message
                        }
                    });
                }
                
                let errorMessage = '❌ Une erreur est survenue lors du bannissement.';
                
                if (error.code === 50013) {
                    errorMessage = '❌ Je n\'ai pas les permissions nécessaires pour bannir cet utilisateur.';
                } else if (error.code === 10007) {
                    errorMessage = '❌ Utilisateur non trouvé.';
                } else if (error.code === 50001) {
                    errorMessage = '❌ Accès manquant pour effectuer cette action.';
                } else if (error.code === 10026) {
                    errorMessage = '❌ Cet utilisateur est déjà banni.';
                }

                return interaction.reply({
                    content: errorMessage,
                    ephemeral: true
                });
            }

        } catch (error) {
            console.error('Erreur dans la commande ban:', error);
            
            const errorMessage = '❌ Une erreur inattendue est survenue lors de l\'exécution de la commande.';
            
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp({
                    content: errorMessage,
                    ephemeral: true
                });
            } else {
                await interaction.reply({
                    content: errorMessage,
                    ephemeral: true
                });
            }
        }
    },
};