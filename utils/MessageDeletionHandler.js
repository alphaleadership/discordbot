import { Events } from 'discord.js';

/**
 * MessageDeletionHandler - Handles message deletion events and logging
 */
export class MessageDeletionHandler {
    constructor(client, messageLogger) {
        this.client = client;
        this.messageLogger = messageLogger;
        this.setupEventListeners();
    }

    /**
     * Setup event listeners for message deletion events
     */
    setupEventListeners() {
        // Single message deletion
        this.client.on(Events.MessageDelete, async (message) => {
            await this.handleMessageDelete(message);
        });

        // Bulk message deletion
        this.client.on(Events.MessageBulkDelete, async (messages, channel) => {
            await this.handleMessageBulkDelete(messages, channel);
        });

        console.log('MessageDeletionHandler: Event listeners configured');
    }

    /**
     * Handle single message deletion
     * @param {import('discord.js').Message} message - Deleted message
     */
    async handleMessageDelete(message) {
        try {
            // Skip if message is from a bot or not in a guild
            if (message.author?.bot || !message.guild) {
                return;
            }

            // Log the deletion
            await this.messageLogger.logMessageDeletion(message, this.client);

            // Additional analysis for suspicious patterns
            await this.analyzeMessageDeletion(message);

        } catch (error) {
            console.error('Error handling message deletion:', error);
        }
    }

    /**
     * Handle bulk message deletion
     * @param {import('discord.js').Collection} messages - Collection of deleted messages
     * @param {import('discord.js').Channel} channel - Channel where messages were deleted
     */
    async handleMessageBulkDelete(messages, channel) {
        try {
            // Skip if not in a guild
            if (!channel.guild) {
                return;
            }

            // Log the bulk deletion
            await this.messageLogger.logBulkMessageDeletion(messages, channel, this.client);

            // Additional analysis for bulk deletions
            await this.analyzeBulkDeletion(messages, channel);

        } catch (error) {
            console.error('Error handling bulk message deletion:', error);
        }
    }

    /**
     * Analyze message deletion for suspicious patterns
     * @param {import('discord.js').Message} message - Deleted message
     */
    async analyzeMessageDeletion(message) {
        try {
            const guildId = message.guild.id;
            const channelId = message.channel.id;
            const userId = message.author.id;

            // Get recent deletions for pattern analysis
            const recentDeletions = await this.messageLogger.getRecentDeletions(guildId, channelId, 10);
            
            // Check for rapid deletion patterns
            const userDeletions = recentDeletions.filter(d => d.author?.id === userId);
            
            if (userDeletions.length >= 3) {
                // User has had 3+ messages deleted in 10 minutes - potential spam cleanup
                await this.messageLogger.logSystemEvent({
                    type: 'rapid_user_deletions',
                    description: `Multiple messages from user ${userId} deleted rapidly`,
                    guildId: guildId,
                    channelId: channelId,
                    userId: userId,
                    deletionCount: userDeletions.length,
                    reportToChannel: false // Don't spam the report channel
                }, this.client);
            }

            // Check for content-based patterns
            if (message.content) {
                const suspiciousPatterns = [
                    /discord\.gg\/[a-zA-Z0-9]+/gi, // Discord invite links
                    /https?:\/\/[^\s]+/gi, // URLs
                    /@everyone|@here/gi, // Mass mentions
                    /(.)\1{10,}/gi // Repeated characters (spam)
                ];

                const matchedPatterns = suspiciousPatterns.filter(pattern => pattern.test(message.content));
                
                if (matchedPatterns.length > 0) {
                    await this.messageLogger.logSystemEvent({
                        type: 'suspicious_content_deletion',
                        description: 'Message with suspicious content was deleted',
                        guildId: guildId,
                        channelId: channelId,
                        userId: userId,
                        patterns: matchedPatterns.length,
                        reportToChannel: false
                    }, this.client);
                }
            }

        } catch (error) {
            console.error('Error analyzing message deletion:', error);
        }
    }

    /**
     * Analyze bulk deletion for administrative actions
     * @param {import('discord.js').Collection} messages - Deleted messages
     * @param {import('discord.js').Channel} channel - Channel where deletion occurred
     */
    async analyzeBulkDeletion(messages, channel) {
        try {
            const guildId = channel.guild.id;
            const messageCount = messages.size;

            // Analyze the deleted messages
            const analysis = {
                totalMessages: messageCount,
                uniqueUsers: new Set(messages.map(m => m.author?.id)).size,
                timeSpan: this.calculateTimeSpan(messages),
                contentTypes: this.analyzeContentTypes(messages),
                suspiciousContent: this.analyzeSuspiciousContent(messages)
            };

            // Log detailed analysis
            await this.messageLogger.logSystemEvent({
                type: 'bulk_deletion_analysis',
                description: `Bulk deletion analysis for ${messageCount} messages`,
                guildId: guildId,
                channelId: channel.id,
                analysis: analysis,
                reportToChannel: messageCount >= 50 // Report large bulk deletions
            }, this.client);

            // Check if this might be a raid cleanup
            if (analysis.uniqueUsers <= 3 && messageCount >= 20) {
                await this.messageLogger.logSystemEvent({
                    type: 'potential_raid_cleanup',
                    description: 'Bulk deletion suggests potential raid cleanup',
                    guildId: guildId,
                    channelId: channel.id,
                    evidence: {
                        messageCount: messageCount,
                        uniqueUsers: analysis.uniqueUsers,
                        timeSpan: analysis.timeSpan
                    },
                    reportToChannel: true
                }, this.client);
            }

        } catch (error) {
            console.error('Error analyzing bulk deletion:', error);
        }
    }

    /**
     * Calculate time span of messages
     * @param {import('discord.js').Collection} messages - Messages collection
     * @returns {number} Time span in minutes
     */
    calculateTimeSpan(messages) {
        if (messages.size === 0) return 0;

        const timestamps = messages.map(m => m.createdTimestamp).sort((a, b) => a - b);
        const oldest = timestamps[0];
        const newest = timestamps[timestamps.length - 1];
        
        return Math.round((newest - oldest) / (1000 * 60)); // Minutes
    }

    /**
     * Analyze content types in deleted messages
     * @param {import('discord.js').Collection} messages - Messages collection
     * @returns {Object} Content type analysis
     */
    analyzeContentTypes(messages) {
        const analysis = {
            withAttachments: 0,
            withEmbeds: 0,
            withMentions: 0,
            withLinks: 0,
            emptyContent: 0
        };

        messages.forEach(message => {
            if (message.attachments?.size > 0) analysis.withAttachments++;
            if (message.embeds?.length > 0) analysis.withEmbeds++;
            if (message.mentions?.users?.size > 0 || message.mentions?.roles?.size > 0) analysis.withMentions++;
            if (message.content && /https?:\/\/[^\s]+/gi.test(message.content)) analysis.withLinks++;
            if (!message.content || message.content.trim() === '') analysis.emptyContent++;
        });

        return analysis;
    }

    /**
     * Analyze suspicious content in deleted messages
     * @param {import('discord.js').Collection} messages - Messages collection
     * @returns {Object} Suspicious content analysis
     */
    analyzeSuspiciousContent(messages) {
        const analysis = {
            inviteLinks: 0,
            massiveMentions: 0,
            repeatedContent: 0,
            suspiciousUrls: 0
        };

        const contentMap = new Map();

        messages.forEach(message => {
            if (!message.content) return;

            // Count repeated content
            const content = message.content.toLowerCase().trim();
            if (content.length > 10) { // Only count substantial content
                contentMap.set(content, (contentMap.get(content) || 0) + 1);
            }

            // Check for invite links
            if (/discord\.gg\/[a-zA-Z0-9]+/gi.test(message.content)) {
                analysis.inviteLinks++;
            }

            // Check for massive mentions
            if (message.content.includes('@everyone') || message.content.includes('@here')) {
                analysis.massiveMentions++;
            }

            // Check for suspicious URLs (basic check)
            const urlMatches = message.content.match(/https?:\/\/[^\s]+/gi);
            if (urlMatches && urlMatches.length > 2) {
                analysis.suspiciousUrls++;
            }
        });

        // Count repeated content
        analysis.repeatedContent = Array.from(contentMap.values()).filter(count => count > 1).length;

        return analysis;
    }

    /**
     * Get deletion statistics for monitoring
     * @param {string} guildId - Guild ID
     * @returns {Object} Current deletion statistics
     */
    async getDeletionMonitoringStats(guildId) {
        try {
            const stats = this.messageLogger.getDeletionStats(guildId, 1); // Last 24 hours
            
            return {
                last24Hours: {
                    totalDeletions: stats.totalDeletions || 0,
                    bulkDeletions: stats.bulkDeletions || 0,
                    topChannels: Object.entries(stats.deletionsByChannel || {})
                        .sort(([,a], [,b]) => b - a)
                        .slice(0, 3),
                    topUsers: Object.entries(stats.deletionsByUser || {})
                        .sort(([,a], [,b]) => b - a)
                        .slice(0, 3)
                },
                alerts: {
                    highDeletionRate: (stats.totalDeletions || 0) > 100,
                    multipleBulkDeletions: (stats.bulkDeletions || 0) > 3,
                    suspiciousPatterns: false // Would be determined by more complex analysis
                }
            };
        } catch (error) {
            console.error('Error getting deletion monitoring stats:', error);
            return null;
        }
    }

    /**
     * Generate deletion report for administrators
     * @param {string} guildId - Guild ID
     * @param {number} days - Days to analyze
     * @returns {Object} Detailed deletion report
     */
    async generateDeletionReport(guildId, days = 7) {
        try {
            const stats = this.messageLogger.getDeletionStats(guildId, days);
            const enhancedStats = this.messageLogger.getEnhancedLogStats();
            
            return {
                period: `${days} days`,
                summary: {
                    totalDeletions: stats.totalDeletions || 0,
                    bulkDeletions: stats.bulkDeletions || 0,
                    averagePerDay: Math.round((stats.totalDeletions || 0) / days),
                    peakDay: this.findPeakDay(stats.deletionsByDay || {})
                },
                breakdown: {
                    byChannel: stats.deletionsByChannel || {},
                    byUser: stats.deletionsByUser || {},
                    byDay: stats.deletionsByDay || {}
                },
                trends: {
                    increasing: this.analyzeTrend(stats.deletionsByDay || {}),
                    concerningChannels: this.identifyConcerningChannels(stats.deletionsByChannel || {}),
                    concerningUsers: this.identifyConcerningUsers(stats.deletionsByUser || {})
                },
                recommendations: this.generateRecommendations(stats)
            };
        } catch (error) {
            console.error('Error generating deletion report:', error);
            return null;
        }
    }

    /**
     * Helper methods for report generation
     */
    findPeakDay(deletionsByDay) {
        if (Object.keys(deletionsByDay).length === 0) return null;
        
        return Object.entries(deletionsByDay)
            .reduce((peak, [day, count]) => count > peak.count ? { day, count } : peak, { day: null, count: 0 });
    }

    analyzeTrend(deletionsByDay) {
        const days = Object.keys(deletionsByDay).sort();
        if (days.length < 3) return 'insufficient_data';
        
        const recent = days.slice(-3).reduce((sum, day) => sum + deletionsByDay[day], 0);
        const previous = days.slice(-6, -3).reduce((sum, day) => sum + deletionsByDay[day], 0);
        
        if (recent > previous * 1.5) return 'increasing';
        if (recent < previous * 0.5) return 'decreasing';
        return 'stable';
    }

    identifyConcerningChannels(deletionsByChannel) {
        return Object.entries(deletionsByChannel)
            .filter(([, count]) => count > 50) // More than 50 deletions
            .sort(([,a], [,b]) => b - a)
            .slice(0, 5);
    }

    identifyConcerningUsers(deletionsByUser) {
        return Object.entries(deletionsByUser)
            .filter(([, count]) => count > 20) // More than 20 deleted messages
            .sort(([,a], [,b]) => b - a)
            .slice(0, 5);
    }

    generateRecommendations(stats) {
        const recommendations = [];
        
        if ((stats.totalDeletions || 0) > 500) {
            recommendations.push('Consider reviewing moderation policies - high deletion rate detected');
        }
        
        if ((stats.bulkDeletions || 0) > 10) {
            recommendations.push('Multiple bulk deletions detected - review for potential raids or spam');
        }
        
        const topChannel = Object.entries(stats.deletionsByChannel || {})
            .sort(([,a], [,b]) => b - a)[0];
        
        if (topChannel && topChannel[1] > 100) {
            recommendations.push(`Channel <#${topChannel[0]}> has unusually high deletion rate - investigate`);
        }
        
        return recommendations;
    }
}