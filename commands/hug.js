import { SlashCommandBuilder } from 'discord.js';

export default {
    data: new SlashCommandBuilder()
        .setName('hug')
        .setDescription('Fait un gros câlin à quelqu\'un')
        .addUserOption(option =>
            option.setName('utilisateur')
                .setDescription('La personne à qui tu veux faire un câlin')
                .setRequired(true)),
    async execute(interaction, adminManager, warnManager, guildConfig, sharedConfig, backupToGitHub, reportManager, banlistManager, blockedWordsManager, watchlistManager, telegramIntegration, funCommandsManager) {
        try {
            if (!funCommandsManager) {
                return interaction.reply({ content: 'Le gestionnaire de commandes amusantes n\'est pas disponible.', ephemeral: true });
            }
            const response = await funCommandsManager.executeHug(interaction, warnManager);
            await interaction.reply(response);
        } catch (error) {
            console.error('Error executing hug command:', error);
            await interaction.reply({ content: 'Une erreur est survenue lors de l\'exécution de la commande.', ephemeral: true });
        }
    },
};
