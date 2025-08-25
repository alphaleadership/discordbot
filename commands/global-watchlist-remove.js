import { SlashCommandBuilder, PermissionsBitField } from 'discord.js';

export default {
    data: new SlashCommandBuilder()
        .setName('global-watchlist-remove')
        .setDescription('Retirer un utilisateur de la liste de surveillance globale')
        .addUserOption(option =>
            option.setName('utilisateur')
                .setDescription('L\'utilisateur à retirer de la liste de surveillance globale')
                .setRequired(true)
        ),
    async execute(interaction, adminManager, warnManager, guildConfig, sharedConfig, backupToGitHub, reportManager, banlistManager, blockedWordsManager, watchlistManager, telegramIntegration, funCommandsManager, raidDetector, doxDetector, enhancedReloadSystem, permissionValidator) {
        const permissionResult = permissionValidator.validateGlobalWatchlistPermission(interaction.member);
        if (!permissionResult.success) {
            return interaction.reply({
                content: permissionResult.message,
                ephemeral: true
            });
        }

        const user = interaction.options.getUser('utilisateur');

        try {
            // Check if user is on global watchlist first
            const isOnGlobalWatchlist = watchlistManager.isOnGlobalWatchlist(user.id);

            if (!isOnGlobalWatchlist) {
                return interaction.reply({
                    content: `❌ ${user} n'est pas dans la liste de surveillance globale.`,
                    ephemeral: true
                });
            }

            const result = await watchlistManager.removeFromGlobalWatchlist(user.id);

            if (result.success) {
                await interaction.reply({
                    content: `✅ ${user} a été retiré de la liste de surveillance **GLOBALE**.\n` +
                        `🌍 Cet utilisateur ne sera plus surveillé automatiquement sur les serveurs.`,
                    ephemeral: false
                });
            } else {
                await interaction.reply({
                    content: `❌ ${result.error}`,
                    ephemeral: true
                });
            }
        } catch (error) {
            console.error('Erreur lors de la suppression de la watchlist globale:', error);
            await interaction.reply({
                content: '❌ Une erreur est survenue lors de la suppression de la liste de surveillance globale.',
                ephemeral: true
            });
        }
    },
};