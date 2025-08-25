import { SlashCommandBuilder } from 'discord.js';

export default {
    data: new SlashCommandBuilder()
        .setName('joke')
        .setDescription('Raconte une blague amusante'),
    async execute(interaction, adminManager, warnManager, guildConfig, sharedConfig, backupToGitHub, reportManager, banlistManager, blockedWordsManager, watchlistManager, telegramIntegration, funCommandsManager) {
        try {
            if (!funCommandsManager) {
                await interaction.reply({ 
                    content: 'Le gestionnaire de commandes amusantes n\'est pas disponible.', 
                    ephemeral: true 
                });
                return;
            }

            const response = await funCommandsManager.executeJoke(interaction, warnManager);
            await interaction.reply(response);
        } catch (error) {
            console.error('Error executing joke command:', error);
            await interaction.reply({ 
                content: 'Une erreur est survenue lors de l\'exécution de la commande.', 
                ephemeral: true 
            });
        }
    },
};