
import { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';

export default {
    data: new SlashCommandBuilder()
        .setName('promote')
        .setDescription('Donner les droits d\'administrateur à un utilisateur')
        .addUserOption(option =>
            option.setName('utilisateur')
                .setDescription('L\'utilisateur à promouvoir')
                .setRequired(true)
        ),
    async execute(interaction, adminManager) {
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
                content: '❌ Vous ne pouvez pas vous promouvoir vous-même.',
                ephemeral: true
            });
        }

        if (adminManager.isAdmin(targetUser.id)) {
            const row = new ActionRowBuilder()
                .addComponents(
                    new ButtonBuilder()
                        .setCustomId(`revoke_admin_${targetUser.id}`)
                        .setLabel('Oui, révoquer')
                        .setStyle(ButtonStyle.Danger),
                    new ButtonBuilder()
                        .setCustomId('cancel_revoke')
                        .setLabel('Non, annuler')
                        .setStyle(ButtonStyle.Secondary)
                );

            return interaction.reply({
                content: `ℹ️ ${targetUser.tag} est déjà administrateur. Souhaitez-vous révoquer ses droits ?`,
                components: [row],
                ephemeral: true
            });
        }

        adminManager.addAdmin(targetUser.id);
        adminManager.saveToTextFile();

        await interaction.reply({
            content: `✅ ${targetUser.tag} a été promu au rang d'administrateur.`,
            ephemeral: true
        });

        try {
            await targetUser.send(`🎉 Félicitations ! Vous avez été promu administrateur du bot par ${interaction.user.tag}.`);
        } catch (error) {
            console.error(`Impossible d'envoyer un message à ${targetUser.tag}:`, error);
        }
    },
};
