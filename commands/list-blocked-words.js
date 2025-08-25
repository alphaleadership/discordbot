
import { SlashCommandBuilder, PermissionsBitField } from 'discord.js';

export default {
    data: new SlashCommandBuilder()
        .setName('list-blocked-words')
        .setDescription('Afficher la liste des mots bloqués'),
    async execute(interaction, adminManager, warnManager, guildConfig, sharedConfig, backupToGitHub, reportManager, banlistManager, blockedWordsManager) {
        if (!interaction.member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
            return interaction.reply({
                content: '❌ Vous devez avoir la permission de gérer le serveur pour utiliser cette commande.',
                ephemeral: true
            });
        }

        const guildId = interaction.guildId;
        const blockedWords = blockedWordsManager.getBlockedWords(guildId);

        if (blockedWords.length === 0) {
            return interaction.reply({ 
                content: 'ℹ️ Il n\'y a aucun mot bloqué sur ce serveur.',
                ephemeral: true
            });
        }

        await interaction.reply({ 
            content: `**Liste des mots bloqués:**\n\
\
${blockedWords.join('\n')}\
\
`,
            ephemeral: true
        });
    },
};
