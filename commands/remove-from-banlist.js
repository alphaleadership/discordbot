import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';

export default {
    data: new SlashCommandBuilder()
        .setName('remove-from-banlist')
        .setDescription('Retirer un utilisateur de la banlist')
        .addStringOption(option =>
            option.setName('utilisateur-id')
                .setDescription('L\'ID de l\'utilisateur à retirer de la banlist')
                .setRequired(true)
        )
        .addStringOption(option =>
            option.setName('raison')
                .setDescription('La raison du retrait')
                .setRequired(false)
        ),
    async execute(interaction, adminManager, warnManager, guildConfig, sharedConfig, backupToGitHub, reportManager, banlistManager, blockedWordsManager, watchlistManager, telegramIntegration, funCommandsManager, raidDetector, doxDetector, enhancedReloadSystem, permissionValidator) {
        try {
            const isBotAdmin = adminManager.isAdmin(interaction.user.id);
            const isAgent = adminManager.isAgent(interaction.user.id);

            if (!isAgent) {
                return interaction.reply({
                    content: '❌ Vous n\'avez pas les permissions nécessaires pour utiliser cette commande.',
                    ephemeral: true
                });
            }

            const userId = interaction.options.getString('utilisateur-id');
            const reason = interaction.options.getString('raison') || 'Retrait manuel';

            // Valider le format de l'ID Discord (17-19 chiffres)
            if (!/^\d{17,19}$/.test(userId)) {
                return interaction.reply({
                    content: '❌ Format d\'ID utilisateur invalide. Les IDs Discord contiennent 17 à 19 chiffres.',
                    ephemeral: true
                });
            }

            // Récupérer le tag utilisateur pour l'affichage si possible
            const fetchedUser = await interaction.client.users.fetch(userId).catch(() => null);
            const userTag = fetchedUser ? fetchedUser.tag : `Inconnu (${userId})`;

            if (isBotAdmin) {
                // L'administrateur peut retirer directement
                const result = await banlistManager.removeFromBanlist(userId);

                if (result.success) {
                    // Log l'action de modération
                    if (reportManager && reportManager.moderationLogger) {
                        await reportManager.moderationLogger.logModerationAction({
                            type: 'remove-from-banlist',
                            moderatorId: interaction.user.id,
                            moderatorTag: interaction.user.tag,
                            targetId: userId,
                            targetTag: userTag,
                            guildId: interaction.guild.id,
                            guildName: interaction.guild.name,
                            reason: reason,
                            success: true,
                            channelId: interaction.channel.id
                        });
                    }

                    // Afficher un embed de succès
                    const successEmbed = new EmbedBuilder()
                        .setColor('#00FF00')
                        .setTitle('✅ Retrait de la banlist réussi')
                        .addFields(
                            { name: 'Utilisateur', value: `${userTag} (${userId})` },
                            { name: 'Modérateur', value: interaction.user.tag },
                            { name: 'Raison', value: reason },
                            { name: 'Date', value: new Date().toLocaleString('fr-FR') }
                        );

                    return interaction.reply({ embeds: [successEmbed] });
                } else {
                    return interaction.reply({
                        content: `❌ ${result.message}`,
                        ephemeral: true
                    });
                }
            } else {
                // C'est un agent, on crée une demande en attente
                const pendingResult = await banlistManager.addPendingRequest({
                    type: 'remove',
                    userId: userId,
                    username: userTag,
                    reason: reason,
                    moderatorId: interaction.user.id,
                    moderatorTag: interaction.user.tag,
                    guildId: interaction.guild.id,
                    guildName: interaction.guild.name
                });

                if (!pendingResult.success) {
                    return interaction.reply({
                        content: `❌ Erreur lors de la création de la demande: ${pendingResult.error}`,
                        ephemeral: true
                    });
                }

                return interaction.reply({
                    content: `⏳ Votre demande de retrait de la banlist pour **${userTag}** a été soumise à la validation d'un administrateur (ID: ${pendingResult.request.id}).`,
                    ephemeral: true
                });
            }

        } catch (error) {
            console.error('Erreur dans la commande remove-from-banlist:', error);
            
            const errorMessage = '❌ Une erreur inattendue est survenue lors du retrait de la banlist.';
            
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
