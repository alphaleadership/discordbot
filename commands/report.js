import { SlashCommandBuilder } from 'discord.js';

export default {
    data: new SlashCommandBuilder()
        .setName('report')
        .setDescription('Signaler un utilisateur')
        .addUserOption(option =>
            option.setName('utilisateur')
                .setDescription('L\'utilisateur à signaler')
                .setRequired(true)
        )
        .addStringOption(option =>
            option.setName('raison')
                .setDescription('La raison du signalement')
                .setRequired(true)
        )
        .addStringOption(option =>
            option.setName('preuve')
                .setDescription('Une preuve du comportement (lien, etc.)')
                .setRequired(false)
        ),
    async execute(interaction, adminManager, warnManager, guildConfig, sharedConfig, backupToGitHub, reportManager) {
        const targetUser = interaction.options.getUser('utilisateur');
        const reason = interaction.options.getString('raison');
        const proof = interaction.options.getString('preuve') || 'Aucune preuve fournie';

        if (targetUser.id === interaction.user.id) {
            return interaction.reply({
                content: '❌ Vous ne pouvez pas vous signaler vous-même.',
                ephemeral: true
            });
        }

        if (targetUser.bot) {
            return interaction.reply({
                content: '❌ Vous ne pouvez pas signaler un bot.',
                ephemeral: true
            });
        }

        const result = await reportManager.report(
            interaction.client,
            interaction.user.id,
            targetUser.id,
            reason,
            proof
        );

        await interaction.reply({
            content: result.success ? `✅ Votre signalement pour ${targetUser.tag} a bien été pris en compte.` : `❌ ${result.message}`,
            ephemeral: true
        });
    },
};