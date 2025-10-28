/**
 * Example: Integration of Message Deletion Tracking System
 * 
 * This example shows how to integrate the message deletion tracking system
 * into your Discord bot for comprehensive message management and monitoring.
 */

import { Client, GatewayIntentBits, Events } from 'discord.js';
import MessageLogger from '../utils/MessageLogger.js';
import { MessageDeletionHandler } from '../utils/MessageDeletionHandler.js';
import { ReportManager } from '../utils/ReportManager.js';

// Create Discord client with necessary intents
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers
    ]
});

// Initialize managers
const reportManager = new ReportManager();
const messageLogger = new MessageLogger(reportManager);
const deletionHandler = new MessageDeletionHandler(client, messageLogger);

// Bot ready event
client.once(Events.ClientReady, () => {
    console.log(`✅ Bot logged in as ${client.user.tag}`);
    console.log('📝 Message deletion tracking system initialized');
    
    // Optional: Set up periodic reporting
    setupPeriodicReporting();
});

// Message create event (for logging messages)
client.on(Events.MessageCreate, async (message) => {
    // Log all messages for deletion tracking
    await messageLogger.saveMessage(message);
});

// The deletion events are automatically handled by MessageDeletionHandler
// No additional setup needed for Events.MessageDelete and Events.MessageBulkDelete

/**
 * Setup periodic reporting for administrators
 */
function setupPeriodicReporting() {
    // Daily deletion summary (runs at midnight)
    const dailyReport = setInterval(async () => {
        const now = new Date();
        if (now.getHours() === 0 && now.getMinutes() === 0) {
            await generateDailyDeletionReports();
        }
    }, 60000); // Check every minute

    // Weekly comprehensive report (runs on Sundays)
    const weeklyReport = setInterval(async () => {
        const now = new Date();
        if (now.getDay() === 0 && now.getHours() === 9 && now.getMinutes() === 0) {
            await generateWeeklyDeletionReports();
        }
    }, 60000); // Check every minute

    console.log('📊 Periodic reporting scheduled');
}

/**
 * Generate daily deletion reports for all guilds
 */
async function generateDailyDeletionReports() {
    console.log('📊 Generating daily deletion reports...');
    
    for (const [guildId, guild] of client.guilds.cache) {
        try {
            const stats = await deletionHandler.getDeletionMonitoringStats(guildId);
            
            if (stats && (stats.alerts.highDeletionRate || stats.alerts.multipleBulkDeletions)) {
                // Send alert to administrators
                await reportManager.sendSystemAlert(
                    client,
                    '📊 Daily Deletion Alert',
                    `High deletion activity detected in ${guild.name}`,
                    [
                        { name: 'Total Deletions (24h)', value: stats.last24Hours.totalDeletions.toString(), inline: true },
                        { name: 'Bulk Deletions (24h)', value: stats.last24Hours.bulkDeletions.toString(), inline: true },
                        { name: 'Status', value: stats.alerts.highDeletionRate ? '⚠️ High Rate' : '✅ Normal', inline: true }
                    ],
                    stats.alerts.highDeletionRate ? 0xff9900 : 0x00ff00
                );
            }
        } catch (error) {
            console.error(`Error generating daily report for guild ${guildId}:`, error);
        }
    }
}

/**
 * Generate weekly comprehensive deletion reports
 */
async function generateWeeklyDeletionReports() {
    console.log('📊 Generating weekly deletion reports...');
    
    for (const [guildId, guild] of client.guilds.cache) {
        try {
            const report = await deletionHandler.generateDeletionReport(guildId, 7);
            
            if (report && report.summary.totalDeletions > 0) {
                const embed = {
                    color: 0x3498db,
                    title: '📊 Weekly Deletion Report',
                    description: `Comprehensive deletion analysis for ${guild.name}`,
                    fields: [
                        {
                            name: '📈 Summary',
                            value: [
                                `Total Deletions: ${report.summary.totalDeletions}`,
                                `Bulk Deletions: ${report.summary.bulkDeletions}`,
                                `Average/Day: ${report.summary.averagePerDay}`,
                                `Peak Day: ${report.summary.peakDay?.day || 'N/A'} (${report.summary.peakDay?.count || 0})`
                            ].join('\n'),
                            inline: false
                        },
                        {
                            name: '📊 Trends',
                            value: [
                                `Trend: ${report.trends.increasing}`,
                                `Concerning Channels: ${report.trends.concerningChannels.length}`,
                                `Concerning Users: ${report.trends.concerningUsers.length}`
                            ].join('\n'),
                            inline: true
                        }
                    ],
                    timestamp: new Date().toISOString(),
                    footer: { text: `Period: ${report.period}` }
                };

                if (report.recommendations.length > 0) {
                    embed.fields.push({
                        name: '💡 Recommendations',
                        value: report.recommendations.slice(0, 3).join('\n'),
                        inline: false
                    });
                }

                // Send to report channel
                await reportManager.sendSystemAlert(
                    client,
                    embed.title,
                    embed.description,
                    embed.fields,
                    embed.color
                );
            }
        } catch (error) {
            console.error(`Error generating weekly report for guild ${guildId}:`, error);
        }
    }
}

/**
 * Example: Manual deletion analysis command handler
 */
async function handleDeletionAnalysisCommand(interaction) {
    const guildId = interaction.guildId;
    const days = interaction.options.getInteger('days') || 7;
    
    try {
        const report = await deletionHandler.generateDeletionReport(guildId, days);
        
        if (!report) {
            return await interaction.reply({
                content: '❌ Unable to generate deletion report.',
                ephemeral: true
            });
        }

        const embed = {
            color: 0x9b59b6,
            title: '🔍 Deletion Analysis Report',
            description: `Analysis for the last ${days} days`,
            fields: [
                {
                    name: '📊 Overview',
                    value: [
                        `Total Deletions: **${report.summary.totalDeletions}**`,
                        `Bulk Deletions: **${report.summary.bulkDeletions}**`,
                        `Daily Average: **${report.summary.averagePerDay}**`
                    ].join('\n'),
                    inline: true
                },
                {
                    name: '📈 Trend Analysis',
                    value: [
                        `Trend: **${report.trends.increasing}**`,
                        `Peak Day: **${report.summary.peakDay?.day || 'None'}**`,
                        `Peak Count: **${report.summary.peakDay?.count || 0}**`
                    ].join('\n'),
                    inline: true
                }
            ],
            timestamp: new Date().toISOString()
        };

        // Add top channels if any
        if (Object.keys(report.breakdown.byChannel).length > 0) {
            const topChannels = Object.entries(report.breakdown.byChannel)
                .sort(([,a], [,b]) => b - a)
                .slice(0, 5)
                .map(([channelId, count]) => `<#${channelId}>: ${count}`)
                .join('\n');
            
            embed.fields.push({
                name: '📍 Top Channels',
                value: topChannels,
                inline: false
            });
        }

        // Add recommendations if any
        if (report.recommendations.length > 0) {
            embed.fields.push({
                name: '💡 Recommendations',
                value: report.recommendations.slice(0, 3).join('\n'),
                inline: false
            });
        }

        await interaction.reply({ embeds: [embed], ephemeral: true });
    } catch (error) {
        console.error('Error in deletion analysis command:', error);
        await interaction.reply({
            content: '❌ Error generating deletion analysis.',
            ephemeral: true
        });
    }
}

/**
 * Example: Real-time deletion monitoring
 */
function setupRealTimeMonitoring() {
    // Monitor for suspicious deletion patterns every 5 minutes
    setInterval(async () => {
        for (const [guildId, guild] of client.guilds.cache) {
            try {
                const stats = await deletionHandler.getDeletionMonitoringStats(guildId);
                
                if (stats?.alerts.highDeletionRate) {
                    console.log(`⚠️ High deletion rate detected in ${guild.name}: ${stats.last24Hours.totalDeletions} deletions in 24h`);
                    
                    // Could trigger additional monitoring or alerts here
                }
                
                if (stats?.alerts.multipleBulkDeletions) {
                    console.log(`⚠️ Multiple bulk deletions detected in ${guild.name}: ${stats.last24Hours.bulkDeletions} events in 24h`);
                }
            } catch (error) {
                console.error(`Error monitoring guild ${guildId}:`, error);
            }
        }
    }, 5 * 60 * 1000); // Every 5 minutes
}

/**
 * Example: Cleanup old deletion logs
 */
function setupLogCleanup() {
    // Clean up old logs weekly (keep 30 days)
    setInterval(() => {
        try {
            const deletedCount = messageLogger.cleanOldLogs(30);
            console.log(`🧹 Cleaned up ${deletedCount} old log files`);
        } catch (error) {
            console.error('Error cleaning up logs:', error);
        }
    }, 7 * 24 * 60 * 60 * 1000); // Weekly
}

// Initialize monitoring and cleanup
client.once(Events.ClientReady, () => {
    setupRealTimeMonitoring();
    setupLogCleanup();
});

// Export for use in main bot file
export {
    messageLogger,
    deletionHandler,
    handleDeletionAnalysisCommand,
    generateDailyDeletionReports,
    generateWeeklyDeletionReports
};

// Example usage in main bot file:
/*
import { messageLogger, deletionHandler } from './examples/message-deletion-integration.js';

// The system will automatically:
// 1. Log all messages for deletion tracking
// 2. Detect and log message deletions (single and bulk)
// 3. Analyze deletion patterns for suspicious activity
// 4. Generate periodic reports for administrators
// 5. Send alerts for high deletion rates or bulk deletions
// 6. Provide detailed statistics and analysis tools

// Use the /message-deletions command to view deletion statistics
// Use the deletion analysis tools for investigating incidents
// Monitor the report channel for automated alerts
*/