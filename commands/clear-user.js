import { SlashCommandBuilder, EmbedBuilder, PermissionsBitField } from 'discord.js';

export default {
    data: new SlashCommandBuilder()
        .setName('clear-user')
        .setDescription('Supprimer tous les messages récents d\'un utilisateur spécifique dans un canal')
        .addUserOption(option =>
            option.setName('utilisateur')
                .setDescription('L\'utilisateur dont il faut supprimer les messages')
                .setRequired(true)
        )
        .addIntegerOption(option =>
            option.setName('limite')
                .setDescription('Nombre de messages de l\'historique à analyser (max: 100, défaut: 100)')
                .setMinValue(1)
                .setMaxValue(100)
                .setRequired(false)
        )
        .addChannelOption(option =>
            option.setName('canal')
                .setDescription('Le canal où supprimer les messages (défaut: canal actuel)')
                .setRequired(false)
        ),
    async execute(interaction, adminManager, warnManager, guildConfig, sharedConfig, backupToGitHub, reportManager, banlistManager, blockedWordsManager, watchlistManager, telegramIntegration, funCommandsManager, raidDetector, doxDetector, enhancedReloadSystem, permissionValidator) {
        try {
            const targetUser = interaction.options.getUser('utilisateur');
            const limit = interaction.options.getInteger('limite') || 100;
            const targetChannel = interaction.options.getChannel('canal') || interaction.channel;

            // Valider les permissions du modérateur
            const permissionResult = permissionValidator.validateMessageManagementPermission(
                interaction.member
            );

            if (!permissionResult.success) {
                if (reportManager && reportManager.moderationLogger) {
                    await reportManager.moderationLogger.logPermissionDenial({
                        action: 'clear-user',
                        userId: interaction.user.id,
                        userTag: interaction.user.tag,
                        targetId: targetUser.id,
                        targetTag: targetUser.tag,
                        guildId: interaction.guild.id,
                        guildName: interaction.guild.name,
                        reason: permissionResult.message,
                        requiredPermission: 'MANAGE_MESSAGES',
                        userPermissions: interaction.member.permissions.toArray()
                    });
                }
                
                return interaction.reply({
                    content: permissionResult.message,
                    ephemeral: true
                });
            }

            // Vérifier si le canal cible est textuel
            if (!targetChannel.isTextBased()) {
                return interaction.reply({
                    content: '❌ Vous ne pouvez supprimer des messages que dans des canaux textuels.',
                    ephemeral: true
                });
            }

            // Vérifier les permissions du bot dans le canal cible
            const botPermissions = targetChannel.permissionsFor(interaction.guild.members.me);
            if (!botPermissions.has(PermissionsBitField.Flags.ManageMessages)) {
                return interaction.reply({
                    content: `❌ Je n'ai pas la permission de gérer les messages dans ${targetChannel}.`,
                    ephemeral: true
                });
            }

            // Différer la réponse car l'opération peut prendre du temps
            await interaction.deferReply({ ephemeral: true });

            try {
                // Récupérer les messages de l'historique
                const messages = await targetChannel.messages.fetch({ limit: limit });
                
                // Filtrer les messages écrits par l'utilisateur cible de moins de 14 jours
                const twoWeeksAgo = Date.now() - (14 * 24 * 60 * 60 * 1000);
                const userMessages = messages.filter(msg => 
                    msg.author.id === targetUser.id && 
                    msg.createdTimestamp > twoWeeksAgo
                );

                if (userMessages.size === 0) {
                    return interaction.editReply({
                        content: `❌ Aucun message récent (de moins de 14 jours) de **${targetUser.tag}** n'a été trouvé dans ce canal.`
                    });
                }

                let deletedCount = 0;
                if (userMessages.size === 1) {
                    await userMessages.first().delete();
                    deletedCount = 1;
                } else {
                    const deleted = await targetChannel.bulkDelete(userMessages, true);
                    deletedCount = deleted.size;
                }

                // Embed de succès
                const successEmbed = new EmbedBuilder()
                    .setColor('#00FF00')
                    .setTitle('🧹 Messages d\'un utilisateur supprimés')
                    .addFields(
                        { name: 'Utilisateur', value: `${targetUser.tag} (${targetUser.id})` },
                        { name: 'Canal', value: targetChannel.toString() },
                        { name: 'Messages supprimés', value: `${deletedCount}` },
                        { name: 'Modérateur', value: interaction.user.tag },
                        { name: 'Date', value: new Date().toLocaleString('fr-FR') }
                    );

                await interaction.editReply({ embeds: [successEmbed] });

                // Envoyer la confirmation dans le salon si ce n'est pas le salon de l'interaction
                if (targetChannel.id !== interaction.channel.id) {
                    const channelEmbed = new EmbedBuilder()
                        .setColor('#00FF00')
                        .setTitle('🧹 Nettoyage de messages')
                        .setDescription(`${deletedCount} message(s) de ${targetUser} supprimé(s) par ${interaction.user}`)
                        .setTimestamp();

                    await targetChannel.send({ embeds: [channelEmbed] });
                }

                // Log l'action
                if (reportManager && reportManager.moderationLogger) {
                    await reportManager.moderationLogger.logModerationAction({
                        type: 'clear-user',
                        moderatorId: interaction.user.id,
                        moderatorTag: interaction.user.tag,
                        targetId: targetUser.id,
                        targetTag: targetUser.tag,
                        guildId: interaction.guild.id,
                        guildName: interaction.guild.name,
                        reason: `Suppression de ${deletedCount} messages de ${targetUser.tag} dans ${targetChannel.name}`,
                        success: true,
                        channelId: interaction.channel.id,
                        details: {
                            targetChannelId: targetChannel.id,
                            targetChannelName: targetChannel.name,
                            deletedCount: deletedCount,
                            analyzedLimit: limit
                        }
                    });
                }

                console.log(`[CLEAR-USER] ${deletedCount} messages de ${targetUser.tag} supprimés par ${interaction.user.tag} dans ${targetChannel.name}`);

            } catch (error) {
                console.error('Erreur lors de la suppression des messages de l\'utilisateur:', error);
                
                if (reportManager && reportManager.moderationLogger) {
                    await reportManager.moderationLogger.logModerationAction({
                        type: 'clear-user',
                        moderatorId: interaction.user.id,
                        moderatorTag: interaction.user.tag,
                        targetId: targetUser.id,
                        targetTag: targetUser.tag,
                        guildId: interaction.guild.id,
                        guildName: interaction.guild.name,
                        reason: `Échec de la suppression des messages de ${targetUser.tag}`,
                        success: false,
                        channelId: interaction.channel.id,
                        details: {
                            errorCode: error.code,
                            errorMessage: error.message
                        }
                    });
                }

                return interaction.editReply({
                    content: '❌ Une erreur est survenue lors de la suppression des messages (vérifiez mes permissions ou si les messages ont moins de 14 jours).'
                });
            }

        } catch (error) {
            console.error('Erreur inattendue dans clear-user:', error);
            const errorMessage = '❌ Une erreur inattendue est survenue.';
            if (interaction.deferred) {
                await interaction.editReply({ content: errorMessage });
            } else {
                await interaction.reply({ content: errorMessage, ephemeral: true });
            }
        }
    }
};
