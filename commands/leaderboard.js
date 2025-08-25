import { SlashCommandBuilder } from 'discord.js';

export default {
    data: new SlashCommandBuilder()
        .setName('leaderboard')
        .setDescription('Affiche le classement des joueurs')
        .addStringOption(option =>
            option.setName('game')
                .setDescription('Le jeu pour lequel afficher le classement')
                .setRequired(false)
                .addChoices(
                    { name: 'Trivia', value: 'trivia' },
                    { name: 'Tous les jeux', value: 'all' }
                )),
    async execute(interaction, adminManager, warnManager, guildConfig, sharedConfig, backupToGitHub, reportManager, banlistManager, blockedWordsManager, watchlistManager, telegramIntegration, funCommandsManager) {
        try {
            if (!funCommandsManager) {
                await interaction.reply({ 
                    content: 'Le gestionnaire de commandes amusantes n\'est pas disponible.', 
                    ephemeral: true 
                });
                return;
            }

            const response = await funCommandsManager.executeLeaderboard(interaction);
            await interaction.reply(response);
        } catch (error) {
            console.error('Error executing leaderboard command:', error);
            await interaction.reply({ 
                content: 'Une erreur est survenue lors de l\'exécution de la commande.', 
                ephemeral: true 
            });
        }
    },
};