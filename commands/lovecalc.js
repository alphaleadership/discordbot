import { SlashCommandBuilder } from 'discord.js';

export default {
    data: new SlashCommandBuilder()
        .setName('lovecalc')
        .setDescription('Calcule le pourcentage d\'amour entre deux personnes')
        .addUserOption(option =>
            option.setName('personne1')
                .setDescription('La première personne')
                .setRequired(true))
        .addUserOption(option =>
            option.setName('personne2')
                .setDescription('La deuxième personne (toi par défaut)')
                .setRequired(false)),
    async execute(interaction, adminManager, warnManager, guildConfig, sharedConfig, backupToGitHub, reportManager, banlistManager, blockedWordsManager, watchlistManager, telegramIntegration, funCommandsManager) {
        try {
            if (!funCommandsManager) {
                return interaction.reply({ content: 'Le gestionnaire de commandes amusantes n\'est pas disponible.', ephemeral: true });
            }
            const response = await funCommandsManager.executeLovecalc(interaction, warnManager);
            await interaction.reply(response);
        } catch (error) {
            console.error('Error executing lovecalc command:', error);
            await interaction.reply({ content: 'Une erreur est survenue lors de l\'exécution de la commande.', ephemeral: true });
        }
    },
};
