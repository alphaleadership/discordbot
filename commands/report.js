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
    async execute(interaction, adminManager, warnManager, guildConfig, sharedConfig, backupToGitHub, reportManager, banlistManager, blockedWordsManager, watchlistManager, telegramIntegration, funCommandsManager, raidDetector, doxDetector, enhancedReloadSystem, permissionValidator, economyManager, forumReportManager, autoConfigManager) {
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

        let result;
        
        // Try to use forum report system first, fallback to regular report system
        if (forumReportManager && forumReportManager.supportGuildId && forumReportManager.reportsForumId) {
            try {
                // Create forum report with enhanced data
                const reportData = {
                    reportedUser: targetUser.id,
                    reportedBy: interaction.user.id,
                    reason: reason,
                    proof: proof,
                    category: 'general', // Default category, could be enhanced with options
                    sourceGuild: interaction.guild.id,
                    timestamp: new Date().toISOString()
                };
                
                result = await forumReportManager.createForumReport(reportData, interaction.guild);
                
                if (result.success) {
                    await interaction.reply({
                        content: `✅ Votre signalement pour ${targetUser.tag} a été créé dans le système de forum (ID: ${result.reportId}).`,
                        ephemeral: true
                    });
                    return;
                }
            } catch (error) {
                console.error('Error creating forum report, falling back to regular report:', error);
            }
        }
        
        // Fallback to regular report system
        result = await reportManager.report(
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