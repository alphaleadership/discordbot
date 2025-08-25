
import { SlashCommandBuilder, PermissionsBitField } from 'discord.js';

export default {
    data: new SlashCommandBuilder()
        .setName('set-char-limit')
        .setDescription('Définir la limite de caractères pour la détection de spam')
        .addIntegerOption(option =>
            option.setName('limit')
                .setDescription('La nouvelle limite de caractères (nombre entier)')
                .setRequired(true)
        ),
    async execute(interaction, adminManager, warnManager, guildConfig, sharedConfig, backupToGitHub, reportManager, banlistManager, blockedWordsManager, commandHandler) {
        if (!interaction.memberPermissions?.has(PermissionsBitField.Flags.ManageGuild)) {
            return interaction.reply({
                content: '❌ Vous devez avoir la permission de gérer le serveur pour utiliser cette commande.',
                ephemeral: true
            });
        }

        const limit = interaction.options.getInteger('limit');
        const guildId = interaction.guildId;

        if (limit < 1) {
            return interaction.reply({
                content: '❌ La limite de caractères doit être un nombre positif.',
                ephemeral: true
            });
        }

        guildConfig.setCharLimit(guildId, limit);

        await interaction.reply({
            content: `✅ La limite de caractères pour la détection de spam a été définie à ${limit}.`,
            ephemeral: true
        });
    },
};
