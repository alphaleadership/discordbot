import { SlashCommandBuilder, EmbedBuilder, PermissionsBitField } from 'discord.js';

export default {
    data: new SlashCommandBuilder()
        .setName('timeout')
        .setDescription('Mettre un utilisateur en timeout')
        .addUserOption(option =>
            option.setName('utilisateur')
                .setDescription('L\'utilisateur à mettre en timeout')
                .setRequired(true)
        )
        .addStringOption(option =>
            option.setName('duree')
                .setDescription('Durée du timeout (ex: 30s, 5m, 2h, 1d)')
                .setRequired(true)
        )
        .addStringOption(option =>
            option.setName('raison')
                .setDescription('La raison du timeout')
                .setRequired(false)
        ),
    async execute(interaction, adminManager, permissionValidator, moderationLogger) {
        try {
            const targetUser = interaction.options.getUser('utilisateur');
            const durationStr = interaction.options.getString('duree');
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
            const permissionResult = permissionValidator.validateTimeoutPermission(
                interaction.member,
                targetMember
            );

            if (!permissionResult.success) {
                return interaction.reply({
                    content: permissionResult.message,
                    ephemeral: true
                });
            }

            // Parse and validate duration
            const durationResult = permissionValidator.parseDuration(durationStr);
            if (!durationResult.success) {
                return interaction.reply({
                    content: durationResult.message,
                    ephemeral: true
                });
            }

            const timeoutDuration = durationResult.duration;
            const timeoutUntil = new Date(Date.now() + timeoutDuration);

            // Check if user is already timed out
            if (targetMember.communicationDisabledUntil && targetMember.communicationDisabledUntil > new Date()) {
                return interaction.reply({
                    content: `❌ ${targetUser} est déjà en timeout jusqu'au ${targetMember.communicationDisabledUntil.toLocaleString('fr-FR')}.`,
                    ephemeral: true
                });
            }

            // Create timeout embed for DM
            const timeoutEmbed = new EmbedBuilder()
                .setColor('#FFA500')
                .setTitle('⏰ Timeout')
                .setDescription(`Vous avez été mis en timeout sur **${interaction.guild.name}**.`)
                .addFields(
                    { name: 'Raison', value: reason },
                    { name: 'Durée', value: durationStr },
                    { name: 'Fin du timeout', value: timeoutUntil.toLocaleString('fr-FR') },
                    { name: 'Modérateur', value: interaction.user.tag },
                    { name: 'Date', value: new Date().toLocaleString('fr-FR') }
                )
                .setFooter({ text: 'Vous ne pourrez pas envoyer de messages ou rejoindre des canaux vocaux pendant cette période.' });

            // Try to send DM before timeout
            let dmSent = false;
            try {
                await targetUser.send({ embeds: [timeoutEmbed] });
                dmSent = true;
            } catch (error) {
                console.log(`Impossible d'envoyer un MP à ${targetUser.tag} avant le timeout`);
            }

            // Execute timeout
            try {
                await targetMember.timeout(timeoutDuration, reason);
                
                // Create success embed
                const successEmbed = new EmbedBuilder()
                    .setColor('#FFA500')
                    .setTitle('⏰ Timeout appliqué')
                    .addFields(
                        { name: 'Utilisateur', value: `${targetUser.tag} (${targetUser.id})` },
                        { name: 'Raison', value: reason },
                        { name: 'Durée', value: durationStr },
                        { name: 'Fin du timeout', value: timeoutUntil.toLocaleString('fr-FR') },
                        { name: 'Modérateur', value: interaction.user.tag },
                        { name: 'MP envoyé', value: dmSent ? '✅ Oui' : '❌ Non' },
                        { name: 'Date', value: new Date().toLocaleString('fr-FR') }
                    );

                await interaction.reply({ embeds: [successEmbed] });

                // Log the action with ModerationLogger
                if (moderationLogger) {
                    await moderationLogger.logModerationAction({
                        type: 'timeout',
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
                            duration: durationStr,
                            durationMs: timeoutDuration,
                            timeoutUntil: timeoutUntil.toISOString(),
                            dmSent: dmSent
                        }
                    });
                }
                
                // Legacy console logging
                console.log(`[TIMEOUT] ${targetUser.tag} (${targetUser.id}) mis en timeout par ${interaction.user.tag} (${interaction.user.id}) - Durée: ${durationStr} - Raison: ${reason}`);

            } catch (error) {
                console.error('Erreur lors du timeout:', error);
                
                // Log failed action with ModerationLogger
                if (moderationLogger) {
                    await moderationLogger.logModerationAction({
                        type: 'timeout',
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
                            duration: durationStr,
                            errorCode: error.code,
                            errorMessage: error.message
                        }
                    });
                }
                
                let errorMessage = '❌ Une erreur est survenue lors du timeout.';
                
                if (error.code === 50013) {
                    errorMessage = '❌ Je n\'ai pas les permissions nécessaires pour mettre cet utilisateur en timeout.';
                } else if (error.code === 10007) {
                    errorMessage = '❌ Utilisateur non trouvé.';
                } else if (error.code === 50001) {
                    errorMessage = '❌ Accès manquant pour effectuer cette action.';
                } else if (error.code === 50024) {
                    errorMessage = '❌ Impossible de mettre en timeout cet utilisateur (permissions insuffisantes ou utilisateur privilégié).';
                }

                return interaction.reply({
                    content: errorMessage,
                    ephemeral: true
                });
            }

        } catch (error) {
            console.error('Erreur dans la commande timeout:', error);
            
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