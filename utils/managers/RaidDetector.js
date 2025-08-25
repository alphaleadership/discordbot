import { EmbedBuilder } from 'discord.js';

/**
 * RaidDetector - System for detecting and responding to server raids
 * Implements rapid join detection and coordinated behavior pattern analysis
 */
export class RaidDetector {
    constructor(client, enhancedGuildConfig, reportManager) {
        this.client = client;
        this.guildConfig = enhancedGuildConfig;
        this.reportManager = reportManager;
        
        // Track join events per guild
        this.joinTracker = new Map(); // guildId -> { joins: [], lastCleanup: timestamp }
        
        // Track active raids per guild
        this.activeRaids = new Map(); // guildId -> { raidId, startTime, severity, measures }
        
        // Cleanup interval for old join data
        this.cleanupInterval = setInterval(() => {
            this.cleanupOldJoinData();
        }, 30000); // Clean every 30 seconds
    }

    /**
     * Detect rapid joins based on configurable thresholds
     * @param {string} guildId - Guild ID
     * @param {Object} member - Discord member object
     * @returns {Object} Detection result with raid info
     */
    detectRapidJoins(guildId, member) {
        const config = this.guildConfig.getRaidDetectionConfig(guildId);
        
        if (!config.enabled) {
            return { isRaid: false };
        }

        // Initialize tracking for this guild if needed
        if (!this.joinTracker.has(guildId)) {
            this.joinTracker.set(guildId, { joins: [], lastCleanup: Date.now() });
        }

        const tracker = this.joinTracker.get(guildId);
        const now = Date.now();
        
        // Add current join
        tracker.joins.push({
            userId: member.id,
            username: member.user.username,
            discriminator: member.user.discriminator,
            accountCreated: member.user.createdAt,
            joinTime: now,
            avatar: member.user.displayAvatarURL()
        });

        // Filter joins within the time window
        const timeWindow = config.timeWindowMs || 60000; // Default 1 minute
        const recentJoins = tracker.joins.filter(join => 
            now - join.joinTime <= timeWindow
        );

        // Update tracker with filtered joins
        tracker.joins = recentJoins;
        tracker.lastCleanup = now;

        // Check if threshold is exceeded
        const threshold = config.rapidJoinThreshold || 5;
        if (recentJoins.length >= threshold) {
            // Analyze join patterns for additional suspicious behavior
            const suspiciousPatterns = this.detectSuspiciousPatterns(recentJoins);
            
            const raidInfo = {
                isRaid: true,
                type: 'rapid_join',
                severity: this.calculateRaidSeverity(recentJoins.length, threshold, suspiciousPatterns),
                affectedUsers: recentJoins.map(join => join.userId),
                joinCount: recentJoins.length,
                timeWindow: timeWindow,
                patterns: suspiciousPatterns,
                timestamp: now
            };

            return raidInfo;
        }

        return { isRaid: false };
    }

    /**
     * Detect suspicious patterns in user behavior
     * @param {Array} users - Array of user join data
     * @returns {Object} Detected patterns
     */
    detectSuspiciousPatterns(users) {
        const patterns = {
            similarNames: false,
            newAccounts: false,
            noAvatars: false,
            coordinatedTiming: false,
            suspiciousScore: 0
        };

        if (users.length < 2) return patterns;

        // Check for similar usernames
        const usernames = users.map(u => u.username.toLowerCase());
        const uniqueNames = new Set(usernames);
        if (uniqueNames.size < usernames.length * 0.7) { // Less than 70% unique names
            patterns.similarNames = true;
            patterns.suspiciousScore += 2;
        }

        // Check for new accounts (created within last 7 days)
        const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
        const newAccounts = users.filter(u => u.accountCreated.getTime() > sevenDaysAgo);
        if (newAccounts.length > users.length * 0.6) { // More than 60% new accounts
            patterns.newAccounts = true;
            patterns.suspiciousScore += 3;
        }

        // Check for default avatars
        const defaultAvatars = users.filter(u => 
            u.avatar.includes('embed/avatars/') || !u.avatar.includes('cdn.discordapp.com')
        );
        if (defaultAvatars.length > users.length * 0.7) { // More than 70% default avatars
            patterns.noAvatars = true;
            patterns.suspiciousScore += 1;
        }

        // Check for coordinated timing (joins within very short intervals)
        const joinTimes = users.map(u => u.joinTime).sort();
        let rapidSequence = 0;
        for (let i = 1; i < joinTimes.length; i++) {
            if (joinTimes[i] - joinTimes[i-1] < 2000) { // Within 2 seconds
                rapidSequence++;
            }
        }
        if (rapidSequence > users.length * 0.5) { // More than 50% rapid sequence
            patterns.coordinatedTiming = true;
            patterns.suspiciousScore += 2;
        }

        return patterns;
    }

    /**
     * Calculate raid severity based on various factors
     * @param {number} joinCount - Number of joins detected
     * @param {number} threshold - Configured threshold
     * @param {Object} patterns - Detected suspicious patterns
     * @returns {string} Severity level
     */
    calculateRaidSeverity(joinCount, threshold, patterns) {
        let severityScore = 0;

        // Base score from join count
        const ratio = joinCount / threshold;
        if (ratio >= 3) severityScore += 4;
        else if (ratio >= 2) severityScore += 3;
        else if (ratio >= 1.5) severityScore += 2;
        else severityScore += 1;

        // Add pattern-based score
        severityScore += patterns.suspiciousScore;

        // Determine severity level
        if (severityScore >= 8) return 'critical';
        if (severityScore >= 6) return 'high';
        if (severityScore >= 4) return 'medium';
        return 'low';
    }

    /**
     * Check if a guild has whitelisted events that might cause legitimate mass joins
     * @param {string} guildId - Guild ID
     * @param {number} timestamp - Current timestamp
     * @returns {boolean} Whether current time matches a whitelisted event
     */
    isWhitelistedEvent(guildId, timestamp) {
        const config = this.guildConfig.getRaidDetectionConfig(guildId);
        const whitelistedEvents = config.whitelistedEvents || [];
        
        // Check if current time falls within any whitelisted event window
        return whitelistedEvents.some(event => {
            const eventStart = new Date(event.startTime).getTime();
            const eventEnd = new Date(event.endTime).getTime();
            return timestamp >= eventStart && timestamp <= eventEnd;
        });
    }

    /**
     * Clean up old join data to prevent memory leaks
     */
    cleanupOldJoinData() {
        const now = Date.now();
        const maxAge = 5 * 60 * 1000; // Keep data for 5 minutes max

        for (const [guildId, tracker] of this.joinTracker.entries()) {
            tracker.joins = tracker.joins.filter(join => 
                now - join.joinTime <= maxAge
            );
            
            // Remove empty trackers
            if (tracker.joins.length === 0) {
                this.joinTracker.delete(guildId);
            }
        }
    }

    /**
     * Get current join statistics for a guild
     * @param {string} guildId - Guild ID
     * @returns {Object} Join statistics
     */
    getJoinStats(guildId) {
        const tracker = this.joinTracker.get(guildId);
        if (!tracker) {
            return { recentJoins: 0, joins: [] };
        }

        const config = this.guildConfig.getRaidDetectionConfig(guildId);
        const timeWindow = config.timeWindowMs || 60000;
        const now = Date.now();
        
        const recentJoins = tracker.joins.filter(join => 
            now - join.joinTime <= timeWindow
        );

        return {
            recentJoins: recentJoins.length,
            joins: recentJoins,
            threshold: config.rapidJoinThreshold || 5,
            timeWindow: timeWindow
        };
    }

    /**
     * Check if a guild currently has an active raid
     * @param {string} guildId - Guild ID
     * @returns {Object|null} Active raid info or null
     */
    getActiveRaid(guildId) {
        return this.activeRaids.get(guildId) || null;
    }

    /**
     * Mark a raid as resolved
     * @param {string} guildId - Guild ID
     * @param {string} resolvedBy - ID of user who resolved the raid
     * @returns {boolean} Whether raid was successfully resolved
     */
    resolveRaid(guildId, resolvedBy) {
        const activeRaid = this.activeRaids.get(guildId);
        if (!activeRaid) {
            return false;
        }

        activeRaid.resolved = true;
        activeRaid.resolvedBy = resolvedBy;
        activeRaid.resolvedAt = Date.now();

        // Remove from active raids
        this.activeRaids.delete(guildId);

        return true;
    }

    /**
     * Apply automatic protective measures based on raid severity
     * @param {Object} guild - Discord guild object
     * @param {string} severity - Raid severity level
     * @param {Object} raidInfo - Raid detection information
     * @returns {Promise<Object>} Applied measures result
     */
    async applyProtectiveMeasures(guild, severity, raidInfo) {
        const config = this.guildConfig.getRaidDetectionConfig(guild.id);
        const measures = {
            applied: [],
            failed: [],
            raidId: `raid_${guild.id}_${Date.now()}`
        };

        try {
            // Store active raid info
            this.activeRaids.set(guild.id, {
                raidId: measures.raidId,
                startTime: raidInfo.timestamp,
                severity: severity,
                measures: measures,
                resolved: false
            });

            // Apply slow mode based on severity and configuration
            if (config.autoSlowMode) {
                const slowModeResult = await this.applySlowMode(guild, severity);
                if (slowModeResult.success) {
                    measures.applied.push(slowModeResult);
                } else {
                    measures.failed.push(slowModeResult);
                }
            }

            // Apply join restrictions based on severity
            if (config.autoJoinRestrictions) {
                const joinRestrictionsResult = await this.applyJoinRestrictions(guild, severity);
                if (joinRestrictionsResult.success) {
                    measures.applied.push(joinRestrictionsResult);
                } else {
                    measures.failed.push(joinRestrictionsResult);
                }
            }

            // Apply role restrictions for new members
            const roleRestrictionsResult = await this.applyRoleRestrictions(guild, severity);
            if (roleRestrictionsResult.success) {
                measures.applied.push(roleRestrictionsResult);
            } else {
                measures.failed.push(roleRestrictionsResult);
            }

            // Apply additional measures based on protection level
            const protectionLevel = config.protectionLevel || 'medium';
            const additionalMeasures = await this.applyProtectionLevelMeasures(guild, severity, protectionLevel);
            measures.applied.push(...additionalMeasures.applied);
            measures.failed.push(...additionalMeasures.failed);

        } catch (error) {
            console.error(`Error applying protective measures for guild ${guild.id}:`, error);
            measures.failed.push({
                measure: 'system_error',
                error: error.message,
                success: false
            });
        }

        return measures;
    }

    /**
     * Apply slow mode to channels based on raid severity
     * @param {Object} guild - Discord guild object
     * @param {string} severity - Raid severity level
     * @returns {Promise<Object>} Slow mode application result
     */
    async applySlowMode(guild, severity) {
        const slowModeSettings = {
            low: 5,      // 5 seconds
            medium: 15,  // 15 seconds
            high: 30,    // 30 seconds
            critical: 60 // 60 seconds
        };

        const slowModeDelay = slowModeSettings[severity] || 15;
        const appliedChannels = [];
        const failedChannels = [];

        try {
            // Apply to text channels (excluding announcement channels)
            const textChannels = guild.channels.cache.filter(channel => 
                channel.type === 0 && // Text channel
                !channel.name.includes('announcement') &&
                !channel.name.includes('rules') &&
                channel.permissionsFor(guild.members.me).has('ManageChannels')
            );

            for (const [channelId, channel] of textChannels) {
                try {
                    await channel.setRateLimitPerUser(slowModeDelay, 
                        `Automatic raid protection - ${severity} severity raid detected`
                    );
                    appliedChannels.push({
                        channelId: channelId,
                        channelName: channel.name,
                        slowModeDelay: slowModeDelay
                    });
                } catch (error) {
                    failedChannels.push({
                        channelId: channelId,
                        channelName: channel.name,
                        error: error.message
                    });
                }
            }

            return {
                measure: 'slow_mode',
                success: appliedChannels.length > 0,
                appliedChannels: appliedChannels,
                failedChannels: failedChannels,
                slowModeDelay: slowModeDelay
            };

        } catch (error) {
            return {
                measure: 'slow_mode',
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Apply temporary join restrictions based on raid severity
     * @param {Object} guild - Discord guild object
     * @param {string} severity - Raid severity level
     * @returns {Promise<Object>} Join restrictions result
     */
    async applyJoinRestrictions(guild, severity) {
        const verificationLevels = {
            low: 1,      // Low - verified email
            medium: 2,   // Medium - registered for 5+ minutes
            high: 3,     // High - member for 10+ minutes
            critical: 4  // Highest - verified phone
        };

        const targetLevel = verificationLevels[severity] || 2;

        try {
            // Only increase verification level, never decrease
            if (guild.verificationLevel < targetLevel) {
                await guild.setVerificationLevel(targetLevel, 
                    `Automatic raid protection - ${severity} severity raid detected`
                );

                return {
                    measure: 'join_restrictions',
                    success: true,
                    previousLevel: guild.verificationLevel,
                    newLevel: targetLevel,
                    severity: severity
                };
            } else {
                return {
                    measure: 'join_restrictions',
                    success: true,
                    message: 'Verification level already sufficient',
                    currentLevel: guild.verificationLevel,
                    targetLevel: targetLevel
                };
            }

        } catch (error) {
            return {
                measure: 'join_restrictions',
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Apply role restrictions for new members during raids
     * @param {Object} guild - Discord guild object
     * @param {string} severity - Raid severity level
     * @returns {Promise<Object>} Role restrictions result
     */
    async applyRoleRestrictions(guild, severity) {
        try {
            // Find or create a "Raid Quarantine" role
            let quarantineRole = guild.roles.cache.find(role => 
                role.name === 'Raid Quarantine' || role.name === 'New Member Restriction'
            );

            if (!quarantineRole) {
                // Create quarantine role with minimal permissions
                quarantineRole = await guild.roles.create({
                    name: 'Raid Quarantine',
                    color: '#ff9900',
                    permissions: ['ViewChannel', 'ReadMessageHistory'],
                    reason: 'Automatic raid protection - quarantine role for new members'
                });
            }

            // Apply role to recent joiners (those who joined in the last 5 minutes)
            const fiveMinutesAgo = Date.now() - (5 * 60 * 1000);
            const recentMembers = guild.members.cache.filter(member => 
                member.joinedTimestamp > fiveMinutesAgo &&
                !member.user.bot &&
                !member.roles.cache.has(quarantineRole.id)
            );

            const appliedMembers = [];
            const failedMembers = [];

            for (const [memberId, member] of recentMembers) {
                try {
                    await member.roles.add(quarantineRole, 
                        `Automatic raid protection - ${severity} severity raid detected`
                    );
                    appliedMembers.push({
                        userId: memberId,
                        username: member.user.username
                    });
                } catch (error) {
                    failedMembers.push({
                        userId: memberId,
                        username: member.user.username,
                        error: error.message
                    });
                }
            }

            return {
                measure: 'role_restrictions',
                success: true,
                quarantineRoleId: quarantineRole.id,
                appliedMembers: appliedMembers,
                failedMembers: failedMembers,
                totalAffected: appliedMembers.length
            };

        } catch (error) {
            return {
                measure: 'role_restrictions',
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Apply additional measures based on protection level configuration
     * @param {Object} guild - Discord guild object
     * @param {string} severity - Raid severity level
     * @param {string} protectionLevel - Configured protection level
     * @returns {Promise<Object>} Additional measures result
     */
    async applyProtectionLevelMeasures(guild, severity, protectionLevel) {
        const measures = { applied: [], failed: [] };

        try {
            // High protection level measures
            if (protectionLevel === 'high' || protectionLevel === 'maximum') {
                // Temporarily disable invites for critical/high severity raids
                if (severity === 'critical' || severity === 'high') {
                    try {
                        const invites = await guild.invites.fetch();
                        const deletedInvites = [];
                        
                        for (const [code, invite] of invites) {
                            if (!invite.permanent) { // Only delete temporary invites
                                await invite.delete('Automatic raid protection - temporary invite suspension');
                                deletedInvites.push(code);
                            }
                        }

                        measures.applied.push({
                            measure: 'invite_suspension',
                            success: true,
                            deletedInvites: deletedInvites.length,
                            inviteCodes: deletedInvites
                        });
                    } catch (error) {
                        measures.failed.push({
                            measure: 'invite_suspension',
                            success: false,
                            error: error.message
                        });
                    }
                }

                // Lock down voice channels for critical raids
                if (severity === 'critical') {
                    try {
                        const voiceChannels = guild.channels.cache.filter(channel => 
                            channel.type === 2 && // Voice channel
                            channel.permissionsFor(guild.members.me).has('ManageChannels')
                        );

                        const lockedChannels = [];
                        for (const [channelId, channel] of voiceChannels) {
                            try {
                                await channel.permissionOverwrites.create(guild.roles.everyone, {
                                    Connect: false,
                                    Speak: false
                                }, {
                                    reason: 'Automatic raid protection - voice channel lockdown'
                                });
                                lockedChannels.push({
                                    channelId: channelId,
                                    channelName: channel.name
                                });
                            } catch (channelError) {
                                // Continue with other channels if one fails
                            }
                        }

                        measures.applied.push({
                            measure: 'voice_lockdown',
                            success: true,
                            lockedChannels: lockedChannels
                        });
                    } catch (error) {
                        measures.failed.push({
                            measure: 'voice_lockdown',
                            success: false,
                            error: error.message
                        });
                    }
                }
            }

            // Maximum protection level measures
            if (protectionLevel === 'maximum' && severity === 'critical') {
                // Temporarily restrict message sending for @everyone in critical situations
                try {
                    const textChannels = guild.channels.cache.filter(channel => 
                        channel.type === 0 && // Text channel
                        channel.permissionsFor(guild.members.me).has('ManageChannels')
                    );

                    const restrictedChannels = [];
                    for (const [channelId, channel] of textChannels) {
                        try {
                            await channel.permissionOverwrites.create(guild.roles.everyone, {
                                SendMessages: false
                            }, {
                                reason: 'Automatic raid protection - emergency message restriction'
                            });
                            restrictedChannels.push({
                                channelId: channelId,
                                channelName: channel.name
                            });
                        } catch (channelError) {
                            // Continue with other channels if one fails
                        }
                    }

                    measures.applied.push({
                        measure: 'emergency_message_restriction',
                        success: true,
                        restrictedChannels: restrictedChannels
                    });
                } catch (error) {
                    measures.failed.push({
                        measure: 'emergency_message_restriction',
                        success: false,
                        error: error.message
                    });
                }
            }

        } catch (error) {
            measures.failed.push({
                measure: 'protection_level_measures',
                success: false,
                error: error.message
            });
        }

        return measures;
    }

    /**
     * Remove protective measures when raid is resolved
     * @param {string} guildId - Guild ID
     * @param {Object} measures - Previously applied measures
     * @returns {Promise<Object>} Cleanup result
     */
    async removeProtectiveMeasures(guildId, measures) {
        const guild = this.client.guilds.cache.get(guildId);
        if (!guild) {
            return { success: false, error: 'Guild not found' };
        }

        const cleanup = { removed: [], failed: [] };

        try {
            // Remove slow mode
            const slowModeMeasure = measures.applied.find(m => m.measure === 'slow_mode');
            if (slowModeMeasure && slowModeMeasure.appliedChannels) {
                for (const channelInfo of slowModeMeasure.appliedChannels) {
                    try {
                        const channel = guild.channels.cache.get(channelInfo.channelId);
                        if (channel) {
                            await channel.setRateLimitPerUser(0, 'Raid resolved - removing protective measures');
                            cleanup.removed.push(`Slow mode removed from ${channelInfo.channelName}`);
                        }
                    } catch (error) {
                        cleanup.failed.push(`Failed to remove slow mode from ${channelInfo.channelName}: ${error.message}`);
                    }
                }
            }

            // Remove role restrictions (quarantine roles)
            const roleRestrictionMeasure = measures.applied.find(m => m.measure === 'role_restrictions');
            if (roleRestrictionMeasure && roleRestrictionMeasure.appliedMembers) {
                const quarantineRole = guild.roles.cache.get(roleRestrictionMeasure.quarantineRoleId);
                if (quarantineRole) {
                    for (const memberInfo of roleRestrictionMeasure.appliedMembers) {
                        try {
                            const member = guild.members.cache.get(memberInfo.userId);
                            if (member) {
                                await member.roles.remove(quarantineRole, 'Raid resolved - removing quarantine');
                                cleanup.removed.push(`Quarantine removed from ${memberInfo.username}`);
                            }
                        } catch (error) {
                            cleanup.failed.push(`Failed to remove quarantine from ${memberInfo.username}: ${error.message}`);
                        }
                    }
                }
            }

            // Note: Verification level and other permanent changes are typically left in place
            // as they represent a security improvement that should be manually reviewed

        } catch (error) {
            cleanup.failed.push(`General cleanup error: ${error.message}`);
        }

        return {
            success: cleanup.removed.length > 0 || cleanup.failed.length === 0,
            removed: cleanup.removed,
            failed: cleanup.failed
        };
    }

    /**
     * Send raid alert notification through ReportManager
     * @param {string} guildId - Guild ID
     * @param {Object} raidInfo - Raid detection information
     * @param {Object} measures - Applied protective measures
     * @returns {Promise<Object>} Notification result
     */
    async notifyRaidDetected(guildId, raidInfo, measures) {
        try {
            const guild = this.client.guilds.cache.get(guildId);
            if (!guild) {
                return { success: false, error: 'Guild not found' };
            }

            // Create detailed raid alert embed
            const embed = new EmbedBuilder()
                .setColor(this.getSeverityColor(raidInfo.severity))
                .setTitle('🚨 RAID DETECTED')
                .setDescription(`A ${raidInfo.severity.toUpperCase()} severity raid has been detected and protective measures have been applied.`)
                .addFields(
                    { name: '📊 Detection Details', value: this.formatRaidDetails(raidInfo), inline: false },
                    { name: '🛡️ Protective Measures', value: this.formatAppliedMeasures(measures), inline: false },
                    { name: '👥 Affected Users', value: this.formatAffectedUsers(raidInfo.affectedUsers), inline: false }
                )
                .setTimestamp()
                .setFooter({ 
                    text: `Raid ID: ${measures.raidId} | Guild: ${guild.name}`,
                    iconURL: guild.iconURL() || this.client.user.displayAvatarURL()
                });

            // Add suspicious patterns if detected
            if (raidInfo.patterns && raidInfo.patterns.suspiciousScore > 0) {
                embed.addFields({
                    name: '🔍 Suspicious Patterns',
                    value: this.formatSuspiciousPatterns(raidInfo.patterns),
                    inline: false
                });
            }

            // Send alert through ReportManager
            const alertResult = await this.reportManager.sendSystemAlert(
                this.client,
                '🚨 RAID DETECTED',
                `${raidInfo.severity.toUpperCase()} severity raid detected in ${guild.name}`,
                embed.data.fields,
                this.getSeverityColor(raidInfo.severity)
            );

            return alertResult;

        } catch (error) {
            console.error('Error sending raid notification:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Send raid resolution notification
     * @param {string} guildId - Guild ID
     * @param {string} raidId - Raid ID
     * @param {string} resolvedBy - User ID who resolved the raid
     * @param {Object} cleanupResult - Cleanup operation result
     * @returns {Promise<Object>} Notification result
     */
    async notifyRaidResolved(guildId, raidId, resolvedBy, cleanupResult) {
        try {
            const guild = this.client.guilds.cache.get(guildId);
            const resolver = await this.client.users.fetch(resolvedBy).catch(() => null);

            const embed = new EmbedBuilder()
                .setColor('#00ff00')
                .setTitle('✅ RAID RESOLVED')
                .setDescription('The raid has been manually resolved and protective measures are being removed.')
                .addFields(
                    { name: '🆔 Raid ID', value: raidId, inline: true },
                    { name: '👤 Resolved By', value: resolver ? `${resolver.tag} (${resolvedBy})` : `ID: ${resolvedBy}`, inline: true },
                    { name: '🧹 Cleanup Status', value: this.formatCleanupResult(cleanupResult), inline: false }
                )
                .setTimestamp()
                .setFooter({ 
                    text: `Guild: ${guild ? guild.name : guildId}`,
                    iconURL: guild ? guild.iconURL() : null
                });

            const alertResult = await this.reportManager.sendSystemAlert(
                this.client,
                '✅ RAID RESOLVED',
                `Raid ${raidId} has been resolved`,
                embed.data.fields,
                0x00ff00
            );

            return alertResult;

        } catch (error) {
            console.error('Error sending raid resolution notification:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Log raid event with detailed information
     * @param {string} guildId - Guild ID
     * @param {Object} raidInfo - Raid information
     * @param {Object} measures - Applied measures
     * @returns {Promise<void>}
     */
    async logRaidEvent(guildId, raidInfo, measures) {
        try {
            // Create raid log entry
            const raidLog = {
                raidId: measures.raidId,
                guildId: guildId,
                timestamp: raidInfo.timestamp,
                type: raidInfo.type,
                severity: raidInfo.severity,
                joinCount: raidInfo.joinCount,
                timeWindow: raidInfo.timeWindow,
                affectedUsers: raidInfo.affectedUsers,
                suspiciousPatterns: raidInfo.patterns,
                appliedMeasures: measures.applied,
                failedMeasures: measures.failed,
                resolved: false
            };

            // Save to raid events file
            await this.saveRaidLog(raidLog);

            console.log(`Raid event logged: ${measures.raidId} in guild ${guildId}`);

        } catch (error) {
            console.error('Error logging raid event:', error);
        }
    }

    /**
     * Save raid log to file
     * @param {Object} raidLog - Raid log entry
     * @returns {Promise<void>}
     */
    async saveRaidLog(raidLog) {
        const fs = await import('fs');
        const path = await import('path');
        
        const logFilePath = path.join(process.cwd(), 'data', 'raid_events.json');
        
        try {
            // Ensure data directory exists
            const dataDir = path.dirname(logFilePath);
            if (!fs.existsSync(dataDir)) {
                fs.mkdirSync(dataDir, { recursive: true });
            }

            // Load existing logs
            let raidLogs = [];
            if (fs.existsSync(logFilePath)) {
                const data = fs.readFileSync(logFilePath, 'utf8');
                raidLogs = JSON.parse(data);
            }

            // Add new log entry
            raidLogs.push(raidLog);

            // Keep only last 1000 entries to prevent file from growing too large
            if (raidLogs.length > 1000) {
                raidLogs = raidLogs.slice(-1000);
            }

            // Save updated logs
            fs.writeFileSync(logFilePath, JSON.stringify(raidLogs, null, 2), 'utf8');

        } catch (error) {
            console.error('Error saving raid log:', error);
        }
    }

    /**
     * Handle manual raid override (false positive)
     * @param {string} guildId - Guild ID
     * @param {string} raidId - Raid ID to override
     * @param {string} overrideBy - User ID who initiated override
     * @param {string} reason - Reason for override
     * @returns {Promise<Object>} Override result
     */
    async handleRaidOverride(guildId, raidId, overrideBy, reason) {
        try {
            const activeRaid = this.activeRaids.get(guildId);
            
            if (!activeRaid || activeRaid.raidId !== raidId) {
                return { 
                    success: false, 
                    error: 'No active raid found with the specified ID' 
                };
            }

            // Remove protective measures
            const cleanupResult = await this.removeProtectiveMeasures(guildId, activeRaid.measures);

            // Mark raid as false positive
            activeRaid.resolved = true;
            activeRaid.falsePositive = true;
            activeRaid.overrideBy = overrideBy;
            activeRaid.overrideReason = reason;
            activeRaid.overrideAt = Date.now();

            // Remove from active raids
            this.activeRaids.delete(guildId);

            // Send override notification
            const guild = this.client.guilds.cache.get(guildId);
            const overrideUser = await this.client.users.fetch(overrideBy).catch(() => null);

            const embed = new EmbedBuilder()
                .setColor('#ffaa00')
                .setTitle('⚠️ RAID OVERRIDE')
                .setDescription('A raid detection has been marked as a false positive and protective measures have been removed.')
                .addFields(
                    { name: '🆔 Raid ID', value: raidId, inline: true },
                    { name: '👤 Override By', value: overrideUser ? `${overrideUser.tag} (${overrideBy})` : `ID: ${overrideBy}`, inline: true },
                    { name: '📝 Reason', value: reason || 'No reason provided', inline: false },
                    { name: '🧹 Cleanup Status', value: this.formatCleanupResult(cleanupResult), inline: false }
                )
                .setTimestamp()
                .setFooter({ 
                    text: `Guild: ${guild ? guild.name : guildId}`,
                    iconURL: guild ? guild.iconURL() : null
                });

            await this.reportManager.sendSystemAlert(
                this.client,
                '⚠️ RAID OVERRIDE',
                `Raid ${raidId} marked as false positive`,
                embed.data.fields,
                0xffaa00
            );

            return {
                success: true,
                message: 'Raid override completed successfully',
                cleanupResult: cleanupResult
            };

        } catch (error) {
            console.error('Error handling raid override:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Get color code based on raid severity
     * @param {string} severity - Raid severity level
     * @returns {number} Color code
     */
    getSeverityColor(severity) {
        const colors = {
            low: 0xffff00,      // Yellow
            medium: 0xff9900,   // Orange
            high: 0xff3300,     // Red
            critical: 0x990000  // Dark Red
        };
        return colors[severity] || 0xff9900;
    }

    /**
     * Format raid details for embed
     * @param {Object} raidInfo - Raid information
     * @returns {string} Formatted raid details
     */
    formatRaidDetails(raidInfo) {
        return [
            `**Type:** ${raidInfo.type.replace('_', ' ').toUpperCase()}`,
            `**Severity:** ${raidInfo.severity.toUpperCase()}`,
            `**Join Count:** ${raidInfo.joinCount} users`,
            `**Time Window:** ${Math.round(raidInfo.timeWindow / 1000)} seconds`,
            `**Detection Time:** <t:${Math.floor(raidInfo.timestamp / 1000)}:F>`
        ].join('\n');
    }

    /**
     * Format applied measures for embed
     * @param {Object} measures - Applied measures
     * @returns {string} Formatted measures
     */
    formatAppliedMeasures(measures) {
        if (measures.applied.length === 0) {
            return 'No measures could be applied';
        }

        return measures.applied.map(measure => {
            switch (measure.measure) {
                case 'slow_mode':
                    return `✅ Slow mode applied (${measure.slowModeDelay}s) to ${measure.appliedChannels.length} channels`;
                case 'join_restrictions':
                    return `✅ Verification level set to ${measure.newLevel}`;
                case 'role_restrictions':
                    return `✅ Quarantine role applied to ${measure.totalAffected} members`;
                case 'invite_suspension':
                    return `✅ ${measure.deletedInvites} temporary invites suspended`;
                case 'voice_lockdown':
                    return `✅ ${measure.lockedChannels.length} voice channels locked`;
                case 'emergency_message_restriction':
                    return `✅ Emergency message restrictions applied to ${measure.restrictedChannels.length} channels`;
                default:
                    return `✅ ${measure.measure.replace('_', ' ')} applied`;
            }
        }).join('\n');
    }

    /**
     * Format affected users for embed
     * @param {Array} affectedUsers - Array of user IDs
     * @returns {string} Formatted user list
     */
    formatAffectedUsers(affectedUsers) {
        if (affectedUsers.length <= 10) {
            return affectedUsers.map(userId => `<@${userId}>`).join(', ');
        } else {
            const shown = affectedUsers.slice(0, 8);
            const remaining = affectedUsers.length - 8;
            return shown.map(userId => `<@${userId}>`).join(', ') + ` and ${remaining} more...`;
        }
    }

    /**
     * Format suspicious patterns for embed
     * @param {Object} patterns - Detected patterns
     * @returns {string} Formatted patterns
     */
    formatSuspiciousPatterns(patterns) {
        const detectedPatterns = [];
        
        if (patterns.similarNames) detectedPatterns.push('🔸 Similar usernames detected');
        if (patterns.newAccounts) detectedPatterns.push('🔸 High percentage of new accounts');
        if (patterns.noAvatars) detectedPatterns.push('🔸 Many default avatars');
        if (patterns.coordinatedTiming) detectedPatterns.push('🔸 Coordinated join timing');
        
        detectedPatterns.push(`**Suspicion Score:** ${patterns.suspiciousScore}/10`);
        
        return detectedPatterns.join('\n');
    }

    /**
     * Format cleanup result for embed
     * @param {Object} cleanupResult - Cleanup operation result
     * @returns {string} Formatted cleanup status
     */
    formatCleanupResult(cleanupResult) {
        if (!cleanupResult) {
            return 'No cleanup performed';
        }

        const status = [];
        if (cleanupResult.removed.length > 0) {
            status.push(`✅ **Removed:** ${cleanupResult.removed.length} measures`);
        }
        if (cleanupResult.failed.length > 0) {
            status.push(`❌ **Failed:** ${cleanupResult.failed.length} measures`);
        }
        
        return status.join('\n') || 'No cleanup actions needed';
    }

    /**
     * Cleanup resources when shutting down
     */
    destroy() {
        if (this.cleanupInterval) {
            clearInterval(this.cleanupInterval);
        }
        this.joinTracker.clear();
        this.activeRaids.clear();
    }
}