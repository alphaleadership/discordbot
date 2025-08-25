import { SlashCommandBuilder } from 'discord.js';

export default {
    data: new SlashCommandBuilder()
        .setName('meme')
        .setDescription('Affiche un meme amusant'),
    async execute(interaction, adminManager, warnManager, guildConfig, sharedConfig, backupToGitHub, reportManager, banlistManager, blockedWordsManager, watchlistManager, telegramIntegration, funCommandsManager) {
        try {
            if (!funCommandsManager) {
                await interaction.reply({ 
                    content: 'Le gestionnaire de commandes amusantes n\'est pas disponible.', 
                    ephemeral: true 
                });
                return;
            }

            const response = await funCommandsManager.executeMeme(interaction, warnManager);
            await interaction.reply(response);
        } catch (error) {
            console.error('Error executing meme command:', error);
            await interaction.reply({ 
                content: 'Une erreur est survenue lors de l\'exécution de la commande.', 
                ephemeral: true 
            });
        }
    },
};