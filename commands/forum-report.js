import { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } from 'discord.js';

const data= new SlashCommandBuilder()
    .setName('forum-report')
    .setDescription('Create a report using the enhanced forum system')
    .addSubcommand(subcommand =>
        subcommand
            .setName('create')
            .setDescription('Create a new report')
            .addUserOption(option =>
                option
                    .setName('user')
                    .setDescription('User to report')
                    .setRequired(true)
            )
            .addStringOption(option =>
                option
                    .setName('category')
                    .setDescription('Report category')
                    .setRequired(true)
                    .addChoices(
                        { name: '🚫 Spam', value: 'spam' },
                        { name: '⚠️ Harassment', value: 'harassment' },
                        { name: '🔞 Inappropriate Content', value: 'inappropriate' },
                        { name: '🆔 Personal Information (Doxxing)', value: 'dox' },
                        { name: '🛡️ Raid/Attack', value: 'raid' },
                        { name: '❓ Other', value: 'other' }
                    )
            )
            .addStringOption(option =>
                option
                    .setName('reason')
                    .setDescription('Reason for the report')
                    .setRequired(true)
                    .setMaxLength(1000)
            )
            .addStringOption(option =>
                option
                    .setName('evidence')
                    .setDescription('Evidence (links, screenshots, etc.)')
                    .setRequired(false)
                    .setMaxLength(1000)
            )
            .addStringOption(option =>
                option
                    .setName('message-id')
                    .setDescription('ID of the problematic message')
                    .setRequired(false)
            )
    )
    .addSubcommand(subcommand =>
        subcommand
            .setName('status')
            .setDescription('Update report status (Moderators only)')
            .addStringOption(option =>
                option
                    .setName('report-id')
                    .setDescription('Report ID')
                    .setRequired(true)
            )
            .addStringOption(option =>
                option
                    .setName('status')
                    .setDescription('New status')
                    .setRequired(true)
                    .addChoices(
                        { name: '🟡 Open', value: 'open' },
                        { name: '🔵 Investigating', value: 'investigating' },
                        { name: '🟢 Resolved', value: 'resolved' },
                        { name: '⚫ Closed', value: 'closed' }
                    )
            )
    )
    .addSubcommand(subcommand =>
        subcommand
            .setName('note')
            .setDescription('Add a note to a report (Moderators only)')
            .addStringOption(option =>
                option
                    .setName('report-id')
                    .setDescription('Report ID')
                    .setRequired(true)
            )
            .addStringOption(option =>
                option
                    .setName('note')
                    .setDescription('Note content')
                    .setRequired(true)
                    .setMaxLength(1000)
            )
    )
    .addSubcommand(subcommand =>
        subcommand
            .setName('resolve')
            .setDescription('Resolve a report (Moderators only)')
            .addStringOption(option =>
                option
                    .setName('report-id')
                    .setDescription('Report ID')
                    .setRequired(true)
            )
            .addStringOption(option =>
                option
                    .setName('resolution')
                    .setDescription('Resolution description')
                    .setRequired(true)
                    .setMaxLength(1000)
            )
    )
    .addSubcommand(subcommand =>
        subcommand
            .setName('link')
            .setDescription('Link related reports (Moderators only)')
            .addStringOption(option =>
                option
                    .setName('report-ids')
                    .setDescription('Comma-separated report IDs to link')
                    .setRequired(true)
            )
    )
    .addSubcommand(subcommand =>
        subcommand
            .setName('search')
            .setDescription('Search reports (Moderators only)')
            .addStringOption(option =>
                option
                    .setName('type')
                    .setDescription('Search type')
                    .setRequired(true)
                    .addChoices(
                        { name: 'By User', value: 'user' },
                        { name: 'By Category', value: 'category' },
                        { name: 'By Status', value: 'status' },
                        { name: 'By Guild', value: 'guild' }
                    )
            )
            .addStringOption(option =>
                option
                    .setName('value')
                    .setDescription('Search value (user ID, category, status, or guild ID)')
                    .setRequired(true)
            )
    )
    .addSubcommand(subcommand =>
        subcommand
            .setName('stats')
            .setDescription('View report statistics (Moderators only)')
    )
    .addSubcommand(subcommand =>
        subcommand
            .setName('configure')
            .setDescription('Configure support server (Administrators only)')
            .addStringOption(option =>
                option
                    .setName('support-guild-id')
                    .setDescription('Support server ID')
                    .setRequired(true)
            )
            .addStringOption(option =>
                option
                    .setName('forum-channel-id')
                    .setDescription('Forum channel ID for reports')
                    .setRequired(true)
            )
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.SendMessages)

async function execute(interaction, adminManager, permissionValidator, watchlistManager, reportManager, forumReportManager) {
    try {
        const subcommand = interaction.options.getSubcommand();

        switch (subcommand) {
            case 'create':
                await handleCreateReport(interaction, forumReportManager);
                break;
            case 'status':
                await handleUpdateStatus(interaction, forumReportManager, permissionValidator);
                break;
            case 'note':
                await handleAddNote(interaction, forumReportManager, permissionValidator);
                break;
            case 'resolve':
                await handleResolveReport(interaction, forumReportManager, permissionValidator);
                break;
            case 'link':
                await handleLinkReports(interaction, forumReportManager, permissionValidator);
                break;
            case 'search':
                await handleSearchReports(interaction, forumReportManager, permissionValidator);
                break;
            case 'stats':
                await handleViewStats(interaction, forumReportManager, permissionValidator);
                break;
            case 'configure':
                await handleConfigure(interaction, forumReportManager, permissionValidator);
                break;
            default:
                await interaction.reply({
                    content: '❌ Sous-commande non reconnue.',
                    ephemeral: true
                });
        }
    } catch (error) {
        console.error('Error in forum-report command:', error);
        await interaction.reply({
            content: '❌ Une erreur inattendue est survenue lors de l\'exécution de la commande.',
            ephemeral: true
        });
    }
}

async function handleCreateReport(interaction, forumReportManager) {
    const reportedUser = interaction.options.getUser('user');
    const category = interaction.options.getString('category');
    const reason = interaction.options.getString('reason');
    const evidence = interaction.options.getString('evidence') || 'No evidence provided';
    const messageId = interaction.options.getString('message-id');

    // Validate inputs
    if (reportedUser.id === interaction.user.id) {
        return await interaction.reply({
            content: '❌ Vous ne pouvez pas vous signaler vous-même.',
            ephemeral: true
        });
    }

    if (reportedUser.bot) {
        return await interaction.reply({
            content: '❌ Vous ne pouvez pas signaler un bot.',
            ephemeral: true
        });
    }

    if (reason.length < 10) {
        return await interaction.reply({
            content: '❌ La raison doit contenir au moins 10 caractères.',
            ephemeral: true
        });
    }

    // Create report data
    const reportData = {
        reportedUserId: reportedUser.id,
        reportedUsername: reportedUser.username,
        reporterUserId: interaction.user.id,
        reporterUsername: interaction.user.username,
        category: category,
        reason: reason,
        evidence: evidence,
        messageId: messageId,
        channelId: interaction.channelId,
        timestamp: new Date().toISOString()
    };

    const result = await forumReportManager.createForumReport(reportData, interaction.guildId);

    if (result.success) {
        const embed = new EmbedBuilder()
            .setColor('#00FF00')
            .setTitle('✅ Rapport créé avec succès')
            .setDescription(`Votre rapport a été créé avec l'ID: **${result.reportId}**`)
            .addFields(
                { name: 'Utilisateur signalé', value: `${reportedUser.tag}`, inline: true },
                { name: 'Catégorie', value: category, inline: true },
                { name: 'Raison', value: reason }
            )
            .setTimestamp()
            .setFooter({ text: 'Les modérateurs examineront votre rapport.' });

        if (result.forumPostId) {
            embed.addFields({ name: 'Forum Post', value: `Créé dans le système de forum` });
        }

        await interaction.reply({ embeds: [embed], ephemeral: true });
    } else {
        await interaction.reply({
            content: `❌ ${result.message}`,
            ephemeral: true
        });
    }
}

async function handleUpdateStatus(interaction, forumReportManager, permissionValidator) {
    if (!permissionValidator.validateModerationPermission(interaction.member)) {
        return await interaction.reply({
            content: '❌ Vous n\'avez pas les permissions nécessaires pour cette action.',
            ephemeral: true
        });
    }

    const reportId = interaction.options.getString('report-id');
    const status = interaction.options.getString('status');

    const result = await forumReportManager.updateReportStatus(reportId, status, interaction.user.id);

    if (result.success) {
        await interaction.reply({
            content: `✅ ${result.message}`,
            ephemeral: true
        });
    } else {
        await interaction.reply({
            content: `❌ ${result.message}`,
            ephemeral: true
        });
    }
}

async function handleAddNote(interaction, forumReportManager, permissionValidator) {
    if (!permissionValidator.validateModerationPermission(interaction.member)) {
        return await interaction.reply({
            content: '❌ Vous n\'avez pas les permissions nécessaires pour cette action.',
            ephemeral: true
        });
    }

    const reportId = interaction.options.getString('report-id');
    const note = interaction.options.getString('note');

    const result = await forumReportManager.addReportNote(reportId, note, interaction.user.id);

    if (result.success) {
        await interaction.reply({
            content: `✅ ${result.message}`,
            ephemeral: true
        });
    } else {
        await interaction.reply({
            content: `❌ ${result.message}`,
            ephemeral: true
        });
    }
}

async function handleResolveReport(interaction, forumReportManager, permissionValidator) {
    if (!permissionValidator.validateModerationPermission(interaction.member)) {
        return await interaction.reply({
            content: '❌ Vous n\'avez pas les permissions nécessaires pour cette action.',
            ephemeral: true
        });
    }

    const reportId = interaction.options.getString('report-id');
    const resolution = interaction.options.getString('resolution');

    const result = await forumReportManager.resolveReport(reportId, resolution, interaction.user.id);

    if (result.success) {
        await interaction.reply({
            content: `✅ ${result.message}`,
            ephemeral: true
        });
    } else {
        await interaction.reply({
            content: `❌ ${result.message}`,
            ephemeral: true
        });
    }
}

async function handleLinkReports(interaction, forumReportManager, permissionValidator) {
    if (!permissionValidator.validateModerationPermission(interaction.member)) {
        return await interaction.reply({
            content: '❌ Vous n\'avez pas les permissions nécessaires pour cette action.',
            ephemeral: true
        });
    }

    const reportIdsString = interaction.options.getString('report-ids');
    const reportIds = reportIdsString.split(',').map(id => id.trim());

    const result = await forumReportManager.linkRelatedReports(reportIds);

    if (result.success) {
        await interaction.reply({
            content: `✅ ${result.message}`,
            ephemeral: true
        });
    } else {
        await interaction.reply({
            content: `❌ ${result.message}`,
            ephemeral: true
        });
    }
}

async function handleSearchReports(interaction, forumReportManager, permissionValidator) {
    if (!permissionValidator.validateModerationPermission(interaction.member)) {
        return await interaction.reply({
            content: '❌ Vous n\'avez pas les permissions nécessaires pour cette action.',
            ephemeral: true
        });
    }

    const searchType = interaction.options.getString('type');
    const searchValue = interaction.options.getString('value');

    let reports = [];
    let searchTitle = '';

    try {
        switch (searchType) {
            case 'user':
                reports = await forumReportManager.getReportsByUser(searchValue);
                searchTitle = `Reports for User ID: ${searchValue}`;
                break;
            case 'category':
                reports = await forumReportManager.getReportsByCategory(searchValue);
                searchTitle = `Reports in Category: ${searchValue}`;
                break;
            case 'status':
                reports = await forumReportManager.getReportsByStatus(searchValue);
                searchTitle = `Reports with Status: ${searchValue}`;
                break;
            case 'guild':
                reports = await forumReportManager.getReportsByGuild(searchValue);
                searchTitle = `Reports from Guild ID: ${searchValue}`;
                break;
        }

        const embed = new EmbedBuilder()
            .setColor('#0099FF')
            .setTitle(`🔍 ${searchTitle}`)
            .setDescription(`Found ${reports.length} report(s)`)
            .setTimestamp();

        if (reports.length > 0) {
            const reportList = reports.slice(0, 10).map(report => {
                const status = forumReportManager.getStatusEmoji(report.status);
                return `${status} **#${report.id}** - ${report.category} - <@${report.reportedUser}>`;
            }).join('\n');

            embed.addFields({ name: 'Reports', value: reportList });

            if (reports.length > 10) {
                embed.setFooter({ text: `Showing first 10 of ${reports.length} reports` });
            }
        }

        await interaction.reply({ embeds: [embed], ephemeral: true });
    } catch (error) {
        console.error('Error searching reports:', error);
        await interaction.reply({
            content: '❌ Erreur lors de la recherche des rapports.',
            ephemeral: true
        });
    }
}

async function handleViewStats(interaction, forumReportManager, permissionValidator) {
    if (!permissionValidator.validateModerationPermission(interaction.member)) {
        return await interaction.reply({
            content: '❌ Vous n\'avez pas les permissions nécessaires pour cette action.',
            ephemeral: true
        });
    }

    try {
        const stats = forumReportManager.getStatistics();

        const embed = new EmbedBuilder()
            .setColor('#9932CC')
            .setTitle('📊 Report Statistics')
            .addFields(
                { name: 'Total Reports', value: stats.total.toString(), inline: true },
                { name: 'Average Resolution Time', value: `${stats.averageResolutionTime}h`, inline: true },
                { name: '\u200B', value: '\u200B', inline: true },
                {
                    name: 'By Status',
                    value: Object.entries(stats.byStatus)
                        .map(([status, count]) => `${forumReportManager.getStatusEmoji(status)} ${status}: ${count}`)
                        .join('\n'),
                    inline: true
                },
                {
                    name: 'By Category',
                    value: Object.entries(stats.byCategory)
                        .filter(([, count]) => count > 0)
                        .map(([category, count]) => `${forumReportManager.categories[category]?.emoji || '❓'} ${category}: ${count}`)
                        .join('\n') || 'No reports',
                    inline: true
                },
                {
                    name: 'By Priority',
                    value: Object.entries(stats.byPriority)
                        .filter(([, count]) => count > 0)
                        .map(([priority, count]) => `${priority}: ${count}`)
                        .join('\n') || 'No reports',
                    inline: true
                }
            )
            .setTimestamp();

        await interaction.reply({ embeds: [embed], ephemeral: true });
    } catch (error) {
        console.error('Error getting stats:', error);
        await interaction.reply({
            content: '❌ Erreur lors de la récupération des statistiques.',
            ephemeral: true
        });
    }
}

async function handleConfigure(interaction, forumReportManager, permissionValidator) {
    if (!permissionValidator.validateAdminPermission(interaction.member)) {
        return await interaction.reply({
            content: '❌ Vous devez être administrateur pour configurer le système.',
            ephemeral: true
        });
    }

    const supportGuildId = interaction.options.getString('support-guild-id');
    const forumChannelId = interaction.options.getString('forum-channel-id');

    const result = await forumReportManager.configureSupportServer(supportGuildId, forumChannelId);

    if (result.success) {
        await interaction.reply({
            content: `✅ ${result.message}`,
            ephemeral: true
        });
    } else {
        await interaction.reply({
            content: `❌ ${result.message}`,
            ephemeral: true
        });
    }
}
export default{
    data,
    execute

}