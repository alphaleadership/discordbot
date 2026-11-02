import { SlashCommandBuilder, PermissionsBitField } from 'discord.js';

export default {
    data: new SlashCommandBuilder()
        .setName('char-limit')
        .setDescription('Gérer la limite de caractères pour la détection de spam')
        .addSubcommand(sub =>
            sub.setName('get')
                .setDescription('Afficher la limite de caractères actuelle pour la détection de spam')
        )
        .addSubcommand(sub =>
            sub.setName('set')
                .setDescription('Définir la limite de caractères pour la détection de spam')
                .addIntegerOption(option =>
                    option.setName('limit')
                        .setDescription('La nouvelle limite de caractères (nombre entier)')
                        .setRequired(true))
        ),

    async execute(interaction, adminManager, warnManager, guildConfig) {
        if (!interaction.memberPermissions?.has(PermissionsBitField.Flags.ManageGuild) && !interaction.member?.permissions?.has(PermissionsBitField.Flags.ManageGuild)) {
            return interaction.reply({
                content: '❌ Vous devez avoir la permission de gérer le serveur pour utiliser cette commande.',
                ephemeral: true
            });
        }

        const subcommand = interaction.options.getSubcommand();
        const guildId = interaction.guildId;

        if (subcommand === 'get') {
            const limit = guildConfig.getCharLimit(guildId);
            return interaction.reply({
                content: `ℹ️ La limite de caractères actuelle pour la détection de spam est de ${limit}.`,
                ephemeral: true
            });
        }

        if (subcommand === 'set') {
            const limit = interaction.options.getInteger('limit');
            if (limit < 1) {
                return interaction.reply({
                    content: '❌ La limite de caractères doit être un nombre positif.',
                    ephemeral: true
                });
            }

            guildConfig.setCharLimit(guildId, limit);
            return interaction.reply({
                content: `✅ La limite de caractères pour la détection de spam a été définie à ${limit}.`,
                ephemeral: true
            });
        }
    }
};
