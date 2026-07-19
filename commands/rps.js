import { SlashCommandBuilder } from 'discord.js';

export default {
    data: new SlashCommandBuilder()
        .setName('rps')
        .setDescription('Joue à Pierre-Feuille-Ciseaux avec le bot')
        .addStringOption(option =>
            option.setName('choix')
                .setDescription('Ton choix')
                .setRequired(true)
                .addChoices(
                    { name: 'Pierre', value: 'pierre' },
                    { name: 'Feuille', value: 'feuille' },
                    { name: 'Ciseaux', value: 'ciseaux' }
                )),
    async execute(interaction, adminManager, warnManager, guildConfig, sharedConfig, backupToGitHub, reportManager, banlistManager, blockedWordsManager, watchlistManager, telegramIntegration, funCommandsManager) {
        try {
            if (!funCommandsManager) {
                return interaction.reply({ content: 'Le gestionnaire de commandes amusantes n\'est pas disponible.', ephemeral: true });
            }
            const response = await funCommandsManager.executeRps(interaction, warnManager);
            await interaction.reply(response);
        } catch (error) {
            console.error('Error executing rps command:', error);
            await interaction.reply({ content: 'Une erreur est survenue lors de l\'exécution de la commande.', ephemeral: true });
        }
    },
};
