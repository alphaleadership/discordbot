import { SlashCommandBuilder } from 'discord.js';

export default {
    data: new SlashCommandBuilder()
        .setName('trivia')
        .setDescription('Joue à un quiz de culture générale'),
    async execute(interaction, adminManager, warnManager, guildConfig, sharedConfig, backupToGitHub, reportManager, banlistManager, blockedWordsManager, watchlistManager, telegramIntegration, funCommandsManager) {
        try {
            if (!funCommandsManager) {
                await interaction.reply({ 
                    content: 'Le gestionnaire de commandes amusantes n\'est pas disponible.', 
                    ephemeral: true 
                });
                return;
            }

            const response = await funCommandsManager.executeTrivia(interaction, warnManager);
            await interaction.reply(response);
        } catch (error) {
            console.error('Error executing trivia command:', error);
            await interaction.reply({ 
                content: 'Une erreur est survenue lors de l\'exécution de la commande.', 
                ephemeral: true 
            });
        }
    },
};