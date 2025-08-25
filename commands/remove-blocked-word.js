import { SlashCommandBuilder, PermissionsBitField } from 'discord.js';

export default {
    data: new SlashCommandBuilder()
        .setName('remove-blocked-word')
        .setDescription('Retirer un mot de la liste des mots bloqués')
        .addStringOption(option =>
            option.setName('word')
                .setDescription('Le mot à retirer')
                .setRequired(true)
        ),
    async execute(interaction, adminManager, warnManager, guildConfig, sharedConfig, backupToGitHub, reportManager, banlistManager, blockedWordsManager) {
        if (!interaction.memberPermissions?.has(PermissionsBitField.Flags.ManageGuild)) {
            return interaction.reply({
                content: '❌ Vous devez avoir la permission de gérer le serveur pour utiliser cette commande.',
                ephemeral: true
            });
        }

        const word = interaction.options.getString('word');
        const guildId = interaction.guildId;

        if (blockedWordsManager.removeBlockedWord(guildId, word)) {
            await interaction.reply({
                content: `✅ Le mot "${word}" a été retiré de la liste des mots bloqués.`, 
                ephemeral: true
            });
        } else {
            await interaction.reply({
                content: `ℹ️ Le mot "${word}" n\'est pas dans la liste des mots bloqués.`, 
                ephemeral: true
            });
        }
    },
};
