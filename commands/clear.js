import { SlashCommandBuilder, EmbedBuilder, PermissionsBitField } from 'discord.js';

export default {
    data: new SlashCommandBuilder()
        .setName('clear')
        .setDescription('Supprimer des messages en masse')
        .addIntegerOption(option =>
            option.setName('nombre')
                .setDescription('Nombre de messages à supprimer (1-100)')
                .setMinValue(1)
                .setMaxValue(100)
                .setRequired(true)
        )
        .addChannelOption(option =>
            option.setName('canal')
                .setDescription('Canal où supprimer les messages (par défaut: canal actuel)')
                .setRequired(false)
        )
        .addBooleanOption(option =>
            option.setName('confirmation')
                .setDescription('Confirmer la suppression de plus de 50 messages')
                .setRequired(false)
        ),
    async execute(interaction, adminManager, warnManager, guildConfig, sharedConfig, backupToGitHub, reportManager, banlistManager, blockedWordsManager, watchlistManager, telegramIntegration, funCommandsManager, raidDetector, doxDetector, enhancedReloadSystem, permissionValidator) {
        try {
            const count = interaction.options.getInteger('nombre');
            const targetChannel = interaction.options.getChannel('canal') || interaction.channel;
            const confirmation = interaction.options.getBoolean('confirmation') || false;
            
            // Validate message count
            const countResult = permissionValidator.validateMessageCount(count);
            if (!countResult.success) {
                return interaction.reply({
                    content: countResult.message,
                    ephemeral: true
                });
            }

            // Validate permissions
            const permissionResult = permissionValidator.validateMessageManagementPermission(
                interaction.member
            );

            if (!permissionResult.success) {
                return interaction.reply({
                    content: permissionResult.message,
                    ephemeral: true
                });
            }

            // Check if target channel is a text channel
            if (!targetChannel.isTextBased()) {
                return interaction.reply({
                    content: '❌ Vous ne pouvez supprimer des messages que dans des canaux textuels.',
                    ephemeral: true
                });
            }

            // Check bot permissions in target channel
            const botPermissions = targetChannel.permissionsFor(interaction.guild.members.me);
            if (!botPermissions.has(PermissionsBitField.Flags.ManageMessages)) {
                return interaction.reply({
                    content: `❌ Je n'ai pas la permission de gérer les messages dans ${targetChannel}.`,
                    ephemeral: true
                });
            }

            // Require confirmation for large deletions
            if (count > 50 && !confirmation) {
                return interaction.reply({
                    content: `⚠️ Vous tentez de supprimer ${count} messages. Veuillez utiliser le paramètre \`confirmation: True\` pour confirmer cette action.`,
                    ephemeral: true
                });
            }

            // Defer reply for potentially long operation
            await interaction.deferReply({ ephemeral: true });

            try {
                // Fetch messages to delete
                const messages = await targetChannel.messages.fetch({ limit: count });
                
                if (messages.size === 0) {
                    return interaction.editReply({
                        content: '❌ Aucun message trouvé à supprimer.'
                    });
                }

                // Filter messages older than 14 days (Discord limitation)
                const twoWeeksAgo = Date.now() - (14 * 24 * 60 * 60 * 1000);
                const deletableMessages = messages.filter(msg => msg.createdTimestamp > twoWeeksAgo);
                const oldMessages = messages.size - deletableMessages.size;

                if (deletableMessages.size === 0) {
                    return interaction.editReply({
                        content: '❌ Tous les messages trouvés sont trop anciens (plus de 14 jours) pour être supprimés en masse.'
                    });
                }

                // Perform bulk delete
                let deletedCount = 0;
                if (deletableMessages.size === 1) {
                    // Single message deletion
                    await deletableMessages.first().delete();
                    deletedCount = 1;
                } else {
                    // Bulk delete
                    const deleted = await targetChannel.bulkDelete(deletableMessages, true);
                    deletedCount = deleted.size;
                }

                // Create success embed
                const successEmbed = new EmbedBuilder()
                    .setColor('#00FF00')
                    .setTitle('🧹 Messages supprimés')
                    .addFields(
                        { name: 'Canal', value: targetChannel.toString() },
                        { name: 'Messages supprimés', value: `${deletedCount}` },
                        { name: 'Modérateur', value: interaction.user.tag },
                        { name: 'Date', value: new Date().toLocaleString('fr-FR') }
                    );

                if (oldMessages > 0) {
                    successEmbed.addFields({
                        name: 'Messages ignorés',
                        value: `${oldMessages} message(s) trop ancien(s) (plus de 14 jours)`
                    });
                }

                await interaction.editReply({ embeds: [successEmbed] });

                // Send confirmation in the target channel if different from interaction channel
                if (targetChannel.id !== interaction.channel.id) {
                    const channelEmbed = new EmbedBuilder()
                        .setColor('#00FF00')
                        .setTitle('🧹 Messages supprimés')
                        .setDescription(`${deletedCount} message(s) supprimé(s) par ${interaction.user}`)
                        .setTimestamp();

                    await targetChannel.send({ embeds: [channelEmbed] });
                }

                // Log the action with ModerationLogger
                if (reportManager) {
                    await reportManager.logModerationAction({
                        type: 'clear',
                        moderatorId: interaction.user.id,
                        moderatorTag: interaction.user.tag,
                        targetId: null, // No specific target user for clear
                        targetTag: null,
                        guildId: interaction.guild.id,
                        guildName: interaction.guild.name,
                        reason: `Cleared ${deletedCount} messages in ${targetChannel.name}`,
                        success: true,
                        channelId: interaction.channel.id,
                        details: {
                            targetChannelId: targetChannel.id,
                            targetChannelName: targetChannel.name,
                            requestedCount: count,
                            deletedCount: deletedCount,
                            oldMessagesIgnored: oldMessages,
                            confirmation: confirmation
                        }
                    });
                }
                
                // Legacy console logging
                console.log(`[CLEAR] ${deletedCount} messages supprimés dans ${targetChannel.name} (${targetChannel.id}) par ${interaction.user.tag} (${interaction.user.id})`);

            } catch (error) {
                console.error('Erreur lors de la suppression des messages:', error);
                
                // Log failed action with ModerationLogger
                if (reportManager) {
                    await reportManager.logModerationAction({
                        type: 'clear',
                        moderatorId: interaction.user.id,
                        moderatorTag: interaction.user.tag,
                        targetId: null,
                        targetTag: null,
                        guildId: interaction.guild.id,
                        guildName: interaction.guild.name,
                        reason: `Failed to clear ${count} messages in ${targetChannel.name}`,
                        success: false,
                        channelId: interaction.channel.id,
                        details: {
                            targetChannelId: targetChannel.id,
                            targetChannelName: targetChannel.name,
                            requestedCount: count,
                            errorCode: error.code,
                            errorMessage: error.message
                        }
                    });
                }
                
                let errorMessage = '❌ Une erreur est survenue lors de la suppression des messages.';
                
                if (error.code === 50013) {
                    errorMessage = '❌ Je n\'ai pas les permissions nécessaires pour supprimer ces messages.';
                } else if (error.code === 50001) {
                    errorMessage = '❌ Accès manquant pour effectuer cette action.';
                } else if (error.code === 50034) {
                    errorMessage = '❌ Vous ne pouvez supprimer que les messages de moins de 14 jours en masse.';
                } else if (error.code === 10008) {
                    errorMessage = '❌ Message non trouvé (peut-être déjà supprimé).';
                }

                return interaction.editReply({
                    content: errorMessage
                });
            }

        } catch (error) {
            console.error('Erreur dans la commande clear:', error);
            
            const errorMessage = '❌ Une erreur inattendue est survenue lors de l\'exécution de la commande.';
            
            if (interaction.deferred) {
                await interaction.editReply({
                    content: errorMessage
                });
            } else if (interaction.replied) {
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