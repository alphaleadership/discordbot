import { SlashCommandBuilder } from 'discord.js';

export default {
    data: new SlashCommandBuilder()
        .setName('add-to-banlist')
        .setDescription('Ajouter un utilisateur à la banlist')
        .addUserOption(option =>
            option.setName('utilisateur')
                .setDescription('L\'utilisateur à ajouter à la banlist')
                .setRequired(true)
        )
        .addStringOption(option =>
            option.setName('raison')
                .setDescription('La raison de l\'ajout à la banlist')
                .setRequired(true)
        ),
    async execute(interaction, adminManager, warnManager, guildConfig, sharedConfig, backupToGitHub, reportManager, banlistManager) {
        const isAdmin = adminManager.isAdmin(interaction.user.id);
        if (!isAdmin) {
            return interaction.reply({
                content: '❌ Seuls les administrateurs peuvent utiliser cette commande.',
                ephemeral: true
            });
        }

        const targetUser = interaction.options.getUser('utilisateur');
        const reason = interaction.options.getString('raison');

        const result = await banlistManager.addToBanlist(
            targetUser.id,
            reason,
            interaction.user.id
        );

        await interaction.reply({
            content: result.success ? `✅ ${targetUser.tag} a été ajouté à la banlist.` : `❌ ${result.message}`,
            ephemeral: true
        });
    },
};