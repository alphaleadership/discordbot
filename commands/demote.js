import { SlashCommandBuilder } from 'discord.js';

export default {
    data: new SlashCommandBuilder()
        .setName('demote')
        .setDescription('Retirer les droits d\'administrateur à un utilisateur')
        .addUserOption(option =>
            option.setName('utilisateur')
                .setDescription('L\'utilisateur à rétrograder')
                .setRequired(true)
        ),
    async execute(interaction, adminManager, warnManager, guildConfig, sharedConfig, backupToGitHub, reportManager, banlistManager, blockedWordsManager, watchlistManager, telegramIntegration, funCommandsManager, raidDetector, doxDetector, enhancedReloadSystem, permissionValidator) {
        const isAdmin = adminManager.isAdmin(interaction.user.id);
        if (!isAdmin) {
            return interaction.reply({
                content: '❌ Seuls les administrateurs peuvent utiliser cette commande.',
                ephemeral: true
            });
        }

        const targetUser = interaction.options.getUser('utilisateur');
        if (!targetUser) {
            return interaction.reply({
                content: '❌ Utilisateur introuvable.',
                ephemeral: true
            });
        }

        if (targetUser.id === interaction.user.id) {
            return interaction.reply({
                content: '❌ Vous ne pouvez pas vous rétrograder vous-même.',
                ephemeral: true
            });
        }

        if (!adminManager.isAdmin(targetUser.id)) {
            return interaction.reply({
                content: `ℹ️ ${targetUser.tag} n\'est pas administrateur.`, 
                ephemeral: true
            });
        }

        adminManager.removeAdmin(targetUser.id);
        adminManager.saveToTextFile();

        await interaction.reply({
            content: `✅ ${targetUser.tag} a été rétrogradé.`, 
            ephemeral: true
        });

        try {
            await targetUser.send(`😔 Vous avez été rétrogradé du statut d\'administrateur du bot par ${interaction.user.tag}.`);
        } catch (error) {
            console.error(`Impossible d'envoyer un message à ${targetUser.tag}:`, error);
        }
    },
};