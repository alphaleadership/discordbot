import { EmbedBuilder, ChannelType, PermissionsBitField } from 'discord.js';
import fs from 'fs';
import path from 'path';

/**
 * ForumReportManager - Enhanced reporting system using Discord forums
 * Manages reports across multiple servers using a centralized support server with forum channels
 */
export class ForumReportManager {
    constructor(client, guildConfig, reportManager = null) {
        this.client = client;
        this.guildConfig = guildConfig;
        this.reportManager = reportManager; // Fallback to existing report system
        this.filePath = path.join(process.cwd(), 'data/forum_reports.json');
        this.reports = this.loadReports();
        this.supportGuildId = this.reports.config?.supportGuildId || null;
        this.reportsForumId = this.reports.config?.reportsForumId || null;
        
        // Report categories with their corresponding forum tags
        this.categories = {
            spam: {
                name: 'Spam',
                color: '#FF6B6B',
                emoji: '🚫',
                description: 'Spam messages or unwanted content'
            },
            harassment: {
                name: 'Harassment',
                color: '#FF4757',
                emoji: '⚠️',
                description: 'Harassment, bullying, or toxic behavior'
            },
            inappropriate: {
                name: 'Inappropriate Content',
                color: '#FF3838',
                emoji: '🔞',
                description: 'NSFW or inappropriate content'
            },
            dox: {
                name: 'Personal Information',
                color: '#FF1744',
                emoji: '🆔',
                description: 'Sharing personal information (doxxing)'
            },
            raid: {
                name: 'Raid/Attack',
                color: '#D32F2F',
                emoji: '🛡️',
                description: 'Server raids or coordinated attacks'
            },
            other: {
                name: 'Other',
                color: '#757575',
                emoji: '❓',
                description: 'Other violations or concerns'
            }
        };
        
        this.ensureFileExists();
    }

    /**
     * Ensures the reports file exists
     */
    ensureFileExists() {
        try {
            const dir = path.dirname(this.filePath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            
            if (!fs.existsSync(this.filePath)) {
                const defaultData = {
                    reports: {},
                    config: {
                        supportGuildId: null,
                        reportsForumId: null,
                        lastReportId: 0
                    },
                    metadata: {
                        version: '1.0',
                        created: new Date().toISOString(),
                        lastModified: new Date().toISOString()
                    }
                };
                fs.writeFileSync(this.filePath, JSON.stringify(defaultData, null, 2));
            }
        } catch (error) {
            console.error('Error ensuring forum reports file exists:', error);
        }
    }

    /**
     * Loads reports from file
     * @returns {Object} Reports data
     */
    loadReports() {
        try {
            if (fs.existsSync(this.filePath)) {
                const data = fs.readFileSync(this.filePath, 'utf-8');
                return JSON.parse(data);
            }
        } catch (error) {
            console.error('Error loading forum reports:', error);
        }
        
        return {
            reports: {},
            config: {
                supportGuildId: "1412117754919780544",
                reportsForumId: "1254376882888114176",
                lastReportId: 0
            },
            metadata: {
                version: '1.0',
                created: new Date().toISOString(),
                lastModified: new Date().toISOString()
            }
        };
    }

    /**
     * Saves reports to file
     */
    saveReports() {
        try {
            this.reports.metadata.lastModified = new Date().toISOString();
            fs.writeFileSync(this.filePath, JSON.stringify(this.reports, null, 2));
        } catch (error) {
            console.error('Error saving forum reports:', error);
        }
    }

    /**
     * Configures the support server and forum channel
     * @param {string} supportGuildId - Support server ID
     * @param {string} reportsForumId - Reports forum channel ID
     * @returns {Promise<{success: boolean, message: string}>}
     */
    async configureSupportServer(supportGuildId, reportsForumId) {
        try {
            // Validation explicite des paramètres
            if (!supportGuildId) {
                return {
                    success: false,
                    message: 'L\'ID du serveur de support est requis et ne peut pas être vide'
                };
            }

            if (!reportsForumId) {
                return {
                    success: false,
                    message: 'L\'ID du salon forum est requis et ne peut pas être vide. Vous devez spécifier un salon forum spécifique.'
                };
            }

            const supportGuild = this.client.guilds.cache.get(supportGuildId);
            if (!supportGuild) {
                return {
                    success: false,
                    message: `Serveur de support introuvable (ID: ${supportGuildId}). Vérifiez que le bot est présent dans ce serveur et que l'ID est correct.`
                };
            }

            const forumChannel = supportGuild.channels.cache.get(reportsForumId);
            if (!forumChannel) {
                return {
                    success: false,
                    message: `Salon forum introuvable (ID: ${reportsForumId}) dans le serveur "${supportGuild.name}". Vérifiez que le salon existe et que le bot y a accès.`
                };
            }

            if (forumChannel.type !== ChannelType.GuildForum) {
                return {
                    success: false,
                    message: `Le salon "${forumChannel.name}" n'est pas un salon forum. Vous devez spécifier un salon de type Forum pour que les rapports puissent être créés sous forme de posts.`
                };
            }

            // Vérification des permissions du bot dans le salon forum
            const botMember = supportGuild.members.cache.get(this.client.user.id);
            if (botMember) {
                const permissions = botMember.permissionsIn(forumChannel);
                const requiredPerms = ['ViewChannel', 'SendMessages', 'CreatePublicThreads', 'ManageThreads'];
                const missingPerms = requiredPerms.filter(perm => !permissions.has(perm));
                
                if (missingPerms.length > 0) {
                    return {
                        success: false,
                        message: `Le bot manque des permissions dans le salon forum "${forumChannel.name}": ${missingPerms.join(', ')}. Ces permissions sont nécessaires pour créer et gérer les rapports.`
                    };
                }
            }

            this.supportGuildId = supportGuildId;
            this.reportsForumId = reportsForumId;
            this.reports.config.supportGuildId = supportGuildId;
            this.reports.config.reportsForumId = reportsForumId;
            this.saveReports();

            return {
                success: true,
                message: `Configuration réussie ! Serveur: "${supportGuild.name}" - Salon forum: "${forumChannel.name}". Tous les rapports seront maintenant créés dans ce salon forum spécifique.`
            };
        } catch (error) {
            console.error('Error configuring support server:', error);
            return {
                success: false,
                message: `Erreur lors de la configuration: ${error.message}. Vérifiez que le salon forum spécifié est valide et accessible.`
            };
        }
    }

    /**
     * Creates a forum report with enhanced features
     * @param {Object} reportData - Report information
     * @param {string} sourceGuildId - Source guild ID
     * @returns {Promise<{success: boolean, reportId: string, forumPostId: string, message: string}>}
     */
    async createForumReport(reportData, sourceGuildId) {
        try {
            const reportId = this.generateReportId();
            const category = this.categories[reportData.category] || this.categories.other;
            
            // Create report entry
            const report = {
                id: reportId,
                reportedUser: reportData.reportedUserId,
                reportedUsername: reportData.reportedUsername,
                reportedBy: reportData.reporterUserId,
                reporterUsername: reportData.reporterUsername,
                category: reportData.category,
                reason: reportData.reason,
                evidence: reportData.evidence,
                messageId: reportData.messageId,
                channelId: reportData.channelId,
                sourceGuild: sourceGuildId,
                timestamp: reportData.timestamp || new Date().toISOString(),
                status: 'open',
                priority: this.calculatePriority(reportData.category),
                assignedModerator: null,
                notes: [],
                linkedReports: [],
                forumPostId: null,
                resolvedAt: null,
                resolvedBy: null,
                resolution: null
            };

            // Create forum post if support server is configured
            let forumPostId = null;
            if (this.supportGuildId && this.reportsForumId) {
                const forumResult = await this.createForumPost(report, category);
                if (forumResult.success) {
                    forumPostId = forumResult.threadId;
                    report.forumPostId = forumPostId;
                }
            }

            // Save report
            this.reports.reports[reportId] = report;
            this.saveReports();

            // Fallback to regular report system if forum creation failed
            if (!forumPostId && this.reportManager) {
                await this.reportManager.report(
                    this.client,
                    reportData.reporterUserId,
                    reportData.reportedUserId,
                    reportData.reason,
                    reportData.evidence
                );
            }

            return {
                success: true,
                reportId: reportId,
                forumPostId: forumPostId,
                message: 'Report created successfully'
            };
        } catch (error) {
            console.error('Error creating forum report:', error);
            return {
                success: false,
                reportId: null,
                forumPostId: null,
                message: 'Error creating report'
            };
        }
    }

    /**
     * Creates a forum post for the report
     * @param {Object} report - Report data
     * @param {Object} category - Report category
     * @returns {Promise<{success: boolean, threadId: string}>}
     */
    async createForumPost(report, category) {
        try {
            const supportGuild = this.client.guilds.cache.get(this.supportGuildId);
            if (!supportGuild) {
                return { success: false, threadId: null };
            }

            const forumChannel = supportGuild.channels.cache.get(this.reportsForumId);
            if (!forumChannel) {
                return { success: false, threadId: null };
            }

            const sourceGuild = this.client.guilds.cache.get(report.sourceGuild);
            const sourceGuildName = sourceGuild ? sourceGuild.name : `Unknown Guild (${report.sourceGuild})`;

            const embed = new EmbedBuilder()
                .setColor(category.color)
                .setTitle(`${category.emoji} Report: ${category.name}`)
                .setDescription(`**Reason:** ${report.reason}`)
                .addFields(
                    { name: 'Reported User', value: `${report.reportedUsername} (${report.reportedUser})`, inline: true },
                    { name: 'Reported By', value: `${report.reporterUsername} (${report.reportedBy})`, inline: true },
                    { name: 'Source Server', value: sourceGuildName, inline: true },
                    { name: 'Category', value: category.description, inline: true },
                    { name: 'Priority', value: report.priority, inline: true },
                    { name: 'Status', value: '🟡 Open', inline: true }
                )
                .setTimestamp(new Date(report.timestamp))
                .setFooter({ text: `Report ID: ${report.id}` });

            if (report.evidence && report.evidence !== 'No evidence provided') {
                embed.addFields({ name: 'Evidence', value: report.evidence });
            }

            if (report.messageId && report.channelId) {
                const messageLink = `https://discord.com/channels/${report.sourceGuild}/${report.channelId}/${report.messageId}`;
                embed.addFields({ name: 'Message Link', value: `[Jump to Message](${messageLink})` });
            }

            const threadName = `${category.name.toLowerCase()}-${report.reportedUsername}-${report.id}`;
            
            const thread = await forumChannel.threads.create({
                name: threadName,
                message: {
                    embeds: [embed]
                }
            });

            return {
                success: true,
                threadId: thread.id
            };
        } catch (error) {
            console.error('Error creating forum post:', error);
            return { success: false, threadId: null };
        }
    }

    /**
     * Updates report status
     * @param {string} reportId - Report ID
     * @param {string} status - New status (open, investigating, resolved, closed)
     * @param {string} moderatorId - Moderator ID
     * @returns {Promise<{success: boolean, message: string}>}
     */
    async updateReportStatus(reportId, status, moderatorId) {
        try {
            const report = this.reports.reports[reportId];
            if (!report) {
                return { success: false, message: 'Report not found' };
            }

            const oldStatus = report.status;
            report.status = status;
            report.assignedModerator = moderatorId;

            if (status === 'resolved' || status === 'closed') {
                report.resolvedAt = new Date().toISOString();
                report.resolvedBy = moderatorId;
            }

            this.saveReports();

            // Update forum post if exists
            if (report.forumPostId) {
                await this.updateForumPost(report);
            }

            return {
                success: true,
                message: `Report status updated from ${oldStatus} to ${status}`
            };
        } catch (error) {
            console.error('Error updating report status:', error);
            return { success: false, message: 'Error updating report status' };
        }
    }

    /**
     * Adds a note to a report
     * @param {string} reportId - Report ID
     * @param {string} note - Note content
     * @param {string} moderatorId - Moderator ID
     * @returns {Promise<{success: boolean, message: string}>}
     */
    async addReportNote(reportId, note, moderatorId) {
        try {
            const report = this.reports.reports[reportId];
            if (!report) {
                return { success: false, message: 'Report not found' };
            }

            const noteEntry = {
                id: Date.now().toString(),
                content: note,
                author: moderatorId,
                timestamp: new Date().toISOString()
            };

            report.notes.push(noteEntry);
            this.saveReports();

            // Add note to forum post if exists
            if (report.forumPostId) {
                await this.addNoteToForumPost(report, noteEntry);
            }

            return {
                success: true,
                message: 'Note added successfully'
            };
        } catch (error) {
            console.error('Error adding report note:', error);
            return { success: false, message: 'Error adding note' };
        }
    }

    /**
     * Resolves a report
     * @param {string} reportId - Report ID
     * @param {string} resolution - Resolution description
     * @param {string} moderatorId - Moderator ID
     * @returns {Promise<{success: boolean, message: string}>}
     */
    async resolveReport(reportId, resolution, moderatorId) {
        try {
            const report = this.reports.reports[reportId];
            if (!report) {
                return { success: false, message: 'Report not found' };
            }

            report.status = 'resolved';
            report.resolution = resolution;
            report.resolvedAt = new Date().toISOString();
            report.resolvedBy = moderatorId;

            this.saveReports();

            // Update forum post
            if (report.forumPostId) {
                await this.updateForumPost(report);
                await this.addResolutionToForumPost(report);
            }

            return {
                success: true,
                message: 'Report resolved successfully'
            };
        } catch (error) {
            console.error('Error resolving report:', error);
            return { success: false, message: 'Error resolving report' };
        }
    }

    /**
     * Links related reports
     * @param {string[]} reportIds - Array of report IDs to link
     * @returns {Promise<{success: boolean, message: string}>}
     */
    async linkRelatedReports(reportIds) {
        try {
            const validReports = reportIds.filter(id => this.reports.reports[id]);
            
            if (validReports.length < 2) {
                return { success: false, message: 'Need at least 2 valid reports to link' };
            }

            // Link all reports to each other
            for (const reportId of validReports) {
                const report = this.reports.reports[reportId];
                const otherReports = validReports.filter(id => id !== reportId);
                
                // Add unique links
                for (const otherId of otherReports) {
                    if (!report.linkedReports.includes(otherId)) {
                        report.linkedReports.push(otherId);
                    }
                }
            }

            this.saveReports();

            // Update forum posts
            for (const reportId of validReports) {
                const report = this.reports.reports[reportId];
                if (report.forumPostId) {
                    await this.updateForumPost(report);
                }
            }

            return {
                success: true,
                message: `Successfully linked ${validReports.length} reports`
            };
        } catch (error) {
            console.error('Error linking reports:', error);
            return { success: false, message: 'Error linking reports' };
        }
    }

    /**
     * Updates forum post with current report data
     * @param {Object} report - Report data
     */
    async updateForumPost(report) {
        try {
            const supportGuild = this.client.guilds.cache.get(this.supportGuildId);
            if (!supportGuild) return;

            const forumChannel = supportGuild.channels.cache.get(this.reportsForumId);
            if (!forumChannel) return;

            const thread = forumChannel.threads.cache.get(report.forumPostId);
            if (!thread) return;

            const category = this.categories[report.category] || this.categories.other;
            const statusEmoji = this.getStatusEmoji(report.status);
            const sourceGuild = this.client.guilds.cache.get(report.sourceGuild);
            const sourceGuildName = sourceGuild ? sourceGuild.name : `Unknown Guild (${report.sourceGuild})`;

            const embed = new EmbedBuilder()
                .setColor(category.color)
                .setTitle(`${category.emoji} Report: ${category.name}`)
                .setDescription(`**Reason:** ${report.reason}`)
                .addFields(
                    { name: 'Reported User', value: `${report.reportedUsername} (${report.reportedUser})`, inline: true },
                    { name: 'Reported By', value: `${report.reporterUsername} (${report.reportedBy})`, inline: true },
                    { name: 'Source Server', value: sourceGuildName, inline: true },
                    { name: 'Category', value: category.description, inline: true },
                    { name: 'Priority', value: report.priority, inline: true },
                    { name: 'Status', value: `${statusEmoji} ${report.status.charAt(0).toUpperCase() + report.status.slice(1)}`, inline: true }
                )
                .setTimestamp(new Date(report.timestamp))
                .setFooter({ text: `Report ID: ${report.id}` });

            if (report.assignedModerator) {
                embed.addFields({ name: 'Assigned Moderator', value: `<@${report.assignedModerator}>`, inline: true });
            }

            if (report.linkedReports.length > 0) {
                const linkedList = report.linkedReports.map(id => `#${id}`).join(', ');
                embed.addFields({ name: 'Linked Reports', value: linkedList });
            }

            if (report.evidence && report.evidence !== 'No evidence provided') {
                embed.addFields({ name: 'Evidence', value: report.evidence });
            }

            if (report.messageId && report.channelId) {
                const messageLink = `https://discord.com/channels/${report.sourceGuild}/${report.channelId}/${report.messageId}`;
                embed.addFields({ name: 'Message Link', value: `[Jump to Message](${messageLink})` });
            }

            const messages = await thread.messages.fetch({ limit: 1 });
            const firstMessage = messages.first();
            if (firstMessage) {
                await firstMessage.edit({ embeds: [embed] });
            }
        } catch (error) {
            console.error('Error updating forum post:', error);
        }
    }

    /**
     * Adds a note to the forum post
     * @param {Object} report - Report data
     * @param {Object} noteEntry - Note entry
     */
    async addNoteToForumPost(report, noteEntry) {
        try {
            const supportGuild = this.client.guilds.cache.get(this.supportGuildId);
            if (!supportGuild) return;

            const forumChannel = supportGuild.channels.cache.get(this.reportsForumId);
            if (!forumChannel) return;

            const thread = forumChannel.threads.cache.get(report.forumPostId);
            if (!thread) return;

            const moderator = await this.client.users.fetch(noteEntry.author).catch(() => null);
            const moderatorName = moderator ? moderator.username : 'Unknown Moderator';

            const embed = new EmbedBuilder()
                .setColor('#FFA500')
                .setTitle('📝 Moderator Note')
                .setDescription(noteEntry.content)
                .setAuthor({ name: moderatorName, iconURL: moderator?.displayAvatarURL() })
                .setTimestamp(new Date(noteEntry.timestamp))
                .setFooter({ text: `Note ID: ${noteEntry.id}` });

            await thread.send({ embeds: [embed] });
        } catch (error) {
            console.error('Error adding note to forum post:', error);
        }
    }

    /**
     * Adds resolution to forum post
     * @param {Object} report - Report data
     */
    async addResolutionToForumPost(report) {
        try {
            const supportGuild = this.client.guilds.cache.get(this.supportGuildId);
            if (!supportGuild) return;

            const forumChannel = supportGuild.channels.cache.get(this.reportsForumId);
            if (!forumChannel) return;

            const thread = forumChannel.threads.cache.get(report.forumPostId);
            if (!thread) return;

            const moderator = await this.client.users.fetch(report.resolvedBy).catch(() => null);
            const moderatorName = moderator ? moderator.username : 'Unknown Moderator';

            const embed = new EmbedBuilder()
                .setColor('#00FF00')
                .setTitle('✅ Report Resolved')
                .setDescription(report.resolution)
                .setAuthor({ name: moderatorName, iconURL: moderator?.displayAvatarURL() })
                .setTimestamp(new Date(report.resolvedAt))
                .setFooter({ text: 'Report closed' });

            await thread.send({ embeds: [embed] });
            
            // Archive the thread
            await thread.setArchived(true);
        } catch (error) {
            console.error('Error adding resolution to forum post:', error);
        }
    }

    /**
     * Gets reports by various filters
     */
    async getReportsByUser(userId) {
        return Object.values(this.reports.reports).filter(report => report.reportedUser === userId);
    }

    async getReportsByCategory(category) {
        return Object.values(this.reports.reports).filter(report => report.category === category);
    }

    async getReportsByStatus(status) {
        return Object.values(this.reports.reports).filter(report => report.status === status);
    }

    async getReportsByGuild(guildId) {
        return Object.values(this.reports.reports).filter(report => report.sourceGuild === guildId);
    }

    /**
     * Helper methods
     */
    generateReportId() {
        this.reports.config.lastReportId++;
        this.saveReports();
        return this.reports.config.lastReportId.toString().padStart(6, '0');
    }

    calculatePriority(category) {
        const priorities = {
            dox: 'Critical',
            raid: 'High',
            harassment: 'High',
            inappropriate: 'Medium',
            spam: 'Low',
            other: 'Low'
        };
        return priorities[category] || 'Low';
    }

    getStatusEmoji(status) {
        const emojis = {
            open: '🟡',
            investigating: '🔵',
            resolved: '🟢',
            closed: '⚫'
        };
        return emojis[status] || '❓';
    }

    /**
     * Gets report statistics
     * @returns {Object} Statistics object
     */
    getStatistics() {
        const reports = Object.values(this.reports.reports);
        const stats = {
            total: reports.length,
            byStatus: {},
            byCategory: {},
            byPriority: {},
            averageResolutionTime: 0
        };

        // Count by status
        for (const status of ['open', 'investigating', 'resolved', 'closed']) {
            stats.byStatus[status] = reports.filter(r => r.status === status).length;
        }

        // Count by category
        for (const category of Object.keys(this.categories)) {
            stats.byCategory[category] = reports.filter(r => r.category === category).length;
        }

        // Count by priority
        for (const priority of ['Critical', 'High', 'Medium', 'Low']) {
            stats.byPriority[priority] = reports.filter(r => r.priority === priority).length;
        }

        // Calculate average resolution time
        const resolvedReports = reports.filter(r => r.resolvedAt);
        if (resolvedReports.length > 0) {
            const totalTime = resolvedReports.reduce((sum, report) => {
                const created = new Date(report.timestamp);
                const resolved = new Date(report.resolvedAt);
                return sum + (resolved - created);
            }, 0);
            stats.averageResolutionTime = Math.round(totalTime / resolvedReports.length / (1000 * 60 * 60)); // Hours
        }

        return stats;
    }

    /**
     * Reloads the manager
     */
    reload() {
        this.reports = this.loadReports();
        this.supportGuildId = this.reports.config?.supportGuildId || null;
        this.reportsForumId = this.reports.config?.reportsForumId || null;
        console.log('ForumReportManager rechargé.');
    }
}