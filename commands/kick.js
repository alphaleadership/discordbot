import { SlashCommandBuilder, EmbedBuilder, PermissionsBitField } from 'discord.js';

export default {
    data: new SlashCommandBuilder()
        .setName('kick')
        .setDescription('Expulser un utilisateur du serveur')
        .addUserOption(option =>
            option.setName('utilisateur')
                .setDescription('L\'utilisateur à expulser')
                .setRequired(true)
        )
        .addStringOption(option =>
            option.setName('raison')
                .setDescription('La raison de l\'expulsion')
                .setRequired(false)
        ),
    async execute(interaction, adminManager, permissionValidator, moderationLogger) {
        try {
            const targetUser = interaction.options.getUser('utilisateur');
            const reason = interaction.options.getString('raison') || 'Aucune raison spécifiée';
            
            // Get target member from guild
            let targetMember;
            try {
                targetMember = await interaction.guild.members.fetch(targetUser.id);
            } catch (error) {
                return interaction.reply({
                    content: '❌ Utilisateur non trouvé sur ce serveur.',
                    ephemeral: true
                });
            }

            // Validate permissions using PermissionValidator
            const permissionResult = permissionValidator.validateKickPermission(
                interaction.member,
                targetMember
            );

            if (!permissionResult.success) {
                return interaction.reply({
                    content: permissionResult.message,
                    ephemeral: true
                });
            }

            // Create kick embed for DM
            const kickEmbed = new EmbedBuilder()
                .setColor('#FF6B35')
                .setTitle('🦶 Expulsion')
                .setDescription(`Vous avez été expulsé de **${interaction.guild.name}**.`)
                .addFields(
                    { name: 'Raison', value: reason },
                    { name: 'Modérateur', value: interaction.user.tag },
                    { name: 'Date', value: new Date().toLocaleString('fr-FR') }
                )
                .setFooter({ text: 'Vous pouvez rejoindre le serveur avec une nouvelle invitation.' });

            // Try to send DM before kicking
            let dmSent = false;
            try {
                await targetUser.send({ embeds: [kickEmbed] });
                dmSent = true;
            } catch (error) {
                console.log(`Impossible d'envoyer un MP à ${targetUser.tag} avant l'expulsion`);
            }

            // Execute kick
            try {
                await targetMember.kick(reason);
                
                // Create success embed
                const successEmbed = new EmbedBuilder()
                    .setColor('#00FF00')
                    .setTitle('✅ Expulsion réussie')
                    .addFields(
                        { name: 'Utilisateur', value: `${targetUser.tag} (${targetUser.id})` },
                        { name: 'Raison', value: reason },
                        { name: 'Modérateur', value: interaction.user.tag },
                        { name: 'MP envoyé', value: dmSent ? '✅ Oui' : '❌ Non' },
                        { name: 'Date', value: new Date().toLocaleString('fr-FR') }
                    );

                await interaction.reply({ embeds: [successEmbed] });

                // Log the action with ModerationLogger
                if (moderationLogger) {
                    await moderationLogger.logModerationAction({
                        type: 'kick',
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
                            dmSent: dmSent
                        }
                    });
                }
                
                // Legacy console logging
                console.log(`[KICK] ${targetUser.tag} (${targetUser.id}) expulsé par ${interaction.user.tag} (${interaction.user.id}) - Raison: ${reason}`);

            } catch (error) {
                console.error('Erreur lors de l\'expulsion:', error);
                
                // Log failed action with ModerationLogger
                if (moderationLogger) {
                    await moderationLogger.logModerationAction({
                        type: 'kick',
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
                            errorCode: error.code,
                            errorMessage: error.message
                        }
                    });
                }
                
                let errorMessage = '❌ Une erreur est survenue lors de l\'expulsion.';
                
                if (error.code === 50013) {
                    errorMessage = '❌ Je n\'ai pas les permissions nécessaires pour expulser cet utilisateur.';
                } else if (error.code === 10007) {
                    errorMessage = '❌ Utilisateur non trouvé.';
                } else if (error.code === 50001) {
                    errorMessage = '❌ Accès manquant pour effectuer cette action.';
                }

                return interaction.reply({
                    content: errorMessage,
                    ephemeral: true
                });
            }

        } catch (error) {
            console.error('Erreur dans la commande kick:', error);
            
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