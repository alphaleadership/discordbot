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
            const permissionResult = permissionValidator.validateModerationAction(
                interaction.member,
                targetMember || targetUser,
                PermissionsBitField.Flags.BanMembers,
                {
                    preventBotActions: true,
                    preventOwnerActions: true
                }
            );

            if (!permissionResult.success) {
                return interaction.reply({
                    content: permissionResult.message || '❌ Vous n\'avez pas la permission d\'effectuer cette action.',
                    ephemeral: true
                });
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
                if (reportManager) {
                    await reportManager.logModerationAction({
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
                if (reportManager) {
                    await reportManager.logModerationAction({
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