import { SlashCommandBuilder } from 'discord.js';

export default {
    data: new SlashCommandBuilder()
        .setName('roll')
        .setDescription('Lance un dé à 6 faces'),
    async execute(interaction, adminManager, warnManager, guildConfig, sharedConfig, backupToGitHub, reportManager, banlistManager, blockedWordsManager, watchlistManager, telegramIntegration, funCommandsManager) {
        try {
            if (!funCommandsManager) {
                return interaction.reply({ content: 'Le gestionnaire de commandes amusantes n\'est pas disponible.', ephemeral: true });
            }
            const response = await funCommandsManager.executeRoll(interaction, warnManager);
            await interaction.reply(response);
        } catch (error) {
            console.error('Error executing roll command:', error);
            await interaction.reply({ content: 'Une erreur est survenue lors de l\'exécution de la commande.', ephemeral: true });
        }
    },
};
