import { SlashCommandBuilder, PermissionsBitField } from 'discord.js';

export default {
    data: new SlashCommandBuilder()
        .setName('blocked-words')
        .setDescription('Gérer la liste des mots bloqués du serveur')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageGuild)
        .addSubcommand(sub =>
            sub.setName('add')
                .setDescription('Ajouter un mot à la liste des mots bloqués')
                .addStringOption(option =>
                    option.setName('word')
                        .setDescription('Le mot à bloquer')
                        .setRequired(true))
        )
        .addSubcommand(sub =>
            sub.setName('remove')
                .setDescription('Retirer un mot de la liste des mots bloqués')
                .addStringOption(option =>
                    option.setName('word')
                        .setDescription('Le mot à retirer')
                        .setRequired(true))
        )
        .addSubcommand(sub =>
            sub.setName('list')
                .setDescription('Afficher la liste des mots bloqués')
        ),

    async execute(interaction, adminManager, warnManager, guildConfig, sharedConfig, backupToGitHub, reportManager, banlistManager, blockedWordsManager) {
        if (!interaction.memberPermissions?.has(PermissionsBitField.Flags.ManageGuild) && !interaction.member?.permissions?.has(PermissionsBitField.Flags.ManageGuild)) {
            return interaction.reply({
                content: '❌ Vous devez avoir la permission de gérer le serveur pour utiliser cette commande.',
                ephemeral: true
            });
        }

        const subcommand = interaction.options.getSubcommand();
        const guildId = interaction.guildId;

        if (subcommand === 'add') {
            const word = interaction.options.getString('word');
            if (blockedWordsManager.addBlockedWord(guildId, word)) {
                return interaction.reply({ 
                    content: `✅ Le mot "${word}" a été ajouté à la liste des mots bloqués.`,
                    ephemeral: true
                });
            } else {
                return interaction.reply({ 
                    content: `ℹ️ Le mot "${word}" est déjà dans la liste des mots bloqués.`,
                    ephemeral: true
                });
            }
        }

        if (subcommand === 'remove') {
            const word = interaction.options.getString('word');
            if (blockedWordsManager.removeBlockedWord(guildId, word)) {
                return interaction.reply({
                    content: `✅ Le mot "${word}" a été retiré de la liste des mots bloqués.`, 
                    ephemeral: true
                });
            } else {
                return interaction.reply({
                    content: `ℹ️ Le mot "${word}" n'est pas dans la liste des mots bloqués.`, 
                    ephemeral: true
                });
            }
        }

        if (subcommand === 'list') {
            const blockedWords = blockedWordsManager.getBlockedWords(guildId);
            if (blockedWords.length === 0) {
                return interaction.reply({ 
                    content: 'ℹ️ Il n\'y a aucun mot bloqué sur ce serveur.',
                    ephemeral: true
                });
            }

            return interaction.reply({ 
                content: `**Liste des mots bloqués:**\n\n${blockedWords.join('\n')}\n`,
                ephemeral: true
            });
        }
    }
};
