
import { SlashCommandBuilder, PermissionsBitField } from 'discord.js';

export default {
    data: new SlashCommandBuilder()
        .setName('get-char-limit')
        .setDescription('Afficher la limite de caractères actuelle pour la détection de spam'),
    async execute(interaction, adminManager, warnManager, guildConfig, sharedConfig, backupToGitHub, reportManager, banlistManager, blockedWordsManager, commandHandler) {
        if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
            return interaction.reply({
                content: '❌ Vous devez avoir la permission de gérer le serveur pour utiliser cette commande.',
                ephemeral: true
            });
        }

        const guildId = interaction.guildId;
        const limit = guildConfig.getCharLimit(guildId);

        await interaction.reply({
            content: `ℹ️ La limite de caractères actuelle pour la détection de spam est de ${limit}.`,
            ephemeral: true
        });
    },
};
