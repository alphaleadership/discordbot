import { SlashCommandBuilder } from 'discord.js';

export default {
    data: new SlashCommandBuilder()
        .setName('8ball')
        .setDescription('Pose une question à la boule magique')
        .addStringOption(option =>
            option.setName('question')
                .setDescription('La question que tu veux poser')
                .setRequired(true)),
    async execute(interaction, adminManager, warnManager, guildConfig, sharedConfig, backupToGitHub, reportManager, banlistManager, blockedWordsManager, watchlistManager, telegramIntegration, funCommandsManager) {
        try {
            if (!funCommandsManager) {
                await interaction.reply({ 
                    content: 'Le gestionnaire de commandes amusantes n\'est pas disponible.', 
                    ephemeral: true 
                });
                return;
            }

            const response = await funCommandsManager.execute8Ball(interaction, warnManager);
            await interaction.reply(response);
        } catch (error) {
            console.error('Error executing 8ball command:', error);
            await interaction.reply({ 
                content: 'Une erreur est survenue lors de l\'exécution de la commande.', 
                ephemeral: true 
            });
        }
    },
};