import { EmbedBuilder } from 'discord.js';

/**
 * Unified Error Reporter - Centralizes all error reporting and logging
 * Routes critical errors through ReportManager to the report channel
 */
export class UnifiedErrorReporter {
    constructor(reportManager, messageLogger) {
        this.reportManager = reportManager;
        this.messageLogger = messageLogger;
        this.errorCounts = new Map(); // Track error frequency
        this.lastErrorTime = new Map(); // Track last occurrence of each error type
    }

    /**
     * Report an error with automatic severity assessment and routing
     * @param {Error} error - The error object
     * @param {string} component - Component where error occurred
     * @param {Object} context - Additional context information
     * @param {import('discord.js').Client} client - Discord client for reporting
     */
    async reportError(error, component, context = {}, client = null) {
        try {
            const errorKey = `${component}:${error.message}`;
            const now = Date.now();
            
            // Track error frequency
            const count = (this.errorCounts.get(errorKey) || 0) + 1;
            this.errorCounts.set(errorKey, count);
            this.lastErrorTime.set(errorKey, now);

            // Determine severity based on error type and frequency
            const severity = this.assessErrorSeverity(error, component, count);

            const errorEvent = {
                id: `error_${now}_${Math.random().toString(36).substr(2, 9)}`,
                component,
                level: severity,
                message: error.message,
                stackTrace: error.stack,
                context,
                count,
                timestamp: new Date().toISOString()
            };

            // Log to file system
            if (this.messageLogger) {
                await this.messageLogger.logSystemError(errorEvent, client);
            }

            // Route critical and high-frequency errors to report channel
            if (severity === 'critical' || count >= 5) {
                await this.sendErrorAlert(errorEvent, client);
            }

            console.error(`[${severity.toUpperCase()}] ${component}: ${error.message}`);
            if (severity === 'critical') {
                console.error(error.stack);
            }

        } catch (reportingError) {
            // Fallback logging if error reporting itself fails
            console.error('Failed to report error:', reportingError);
            console.error('Original error:', error);
        }
    }

    /**
     * Assess error severity based on various factors
     * @param {Error} error - The error object
     * @param {string} component - Component where error occurred
     * @param {number} count - Number of times this error has occurred
     * @returns {string} Severity level
     */
    assessErrorSeverity(error, component, count) {
        // Critical errors that require immediate attention
        const criticalPatterns = [
            /database/i,
            /connection/i,
            /authentication/i,
            /permission/i,
            /discord.*api/i,
            /telegram.*api/i,
            /file.*system/i
        ];

        // High severity errors
        const highPatterns = [
            /raid.*detection/i,
            /dox.*detection/i,
            /watchlist/i,
            /command.*handler/i,
            /interaction/i
        ];

        const errorMessage = error.message.toLowerCase();
        const componentLower = component.toLowerCase();

        // Check for critical patterns
        if (criticalPatterns.some(pattern => 
            pattern.test(errorMessage) || pattern.test(componentLower)
        )) {
            return 'critical';
        }

        // Check for high severity patterns
        if (highPatterns.some(pattern => 
            pattern.test(errorMessage) || pattern.test(componentLower)
        )) {
            return 'high';
        }

        // High frequency errors become critical
        if (count >= 10) {
            return 'critical';
        }

        // Medium frequency errors become high
        if (count >= 5) {
            return 'high';
        }

        // Default to medium severity
        return 'medium';
    }

    /**
     * Send error alert to report channel
     * @param {Object} errorEvent - Error event data
     * @param {import('discord.js').Client} client - Discord client
     */
    async sendErrorAlert(errorEvent, client) {
        if (!this.reportManager || !client) return;

        const color = this.getSeverityColor(errorEvent.level);
        const title = `${this.getSeverityEmoji(errorEvent.level)} Erreur ${errorEvent.level.charAt(0).toUpperCase() + errorEvent.level.slice(1)}`;

        const fields = [
            { name: 'Composant', value: errorEvent.component, inline: true },
            { name: 'Niveau', value: errorEvent.level, inline: true },
            { name: 'Occurrences', value: errorEvent.count.toString(), inline: true },
            { name: 'Message', value: errorEvent.message.substring(0, 1000), inline: false }
        ];

        // Add context if available
        if (errorEvent.context && Object.keys(errorEvent.context).length > 0) {
            const contextStr = Object.entries(errorEvent.context)
                .map(([key, value]) => `${key}: ${value}`)
                .join('\n')
                .substring(0, 1000);
            fields.push({ name: 'Contexte', value: contextStr, inline: false });
        }

        // Add stack trace for critical errors
        if (errorEvent.level === 'critical' && errorEvent.stackTrace) {
            fields.push({ 
                name: 'Stack Trace', 
                value: '```\n' + errorEvent.stackTrace.substring(0, 500) + '\n```', 
                inline: false 
            });
        }

        await this.reportManager.sendSystemAlert(
            client,
            title,
            `Une erreur ${errorEvent.level} s'est produite dans le composant ${errorEvent.component}.`,
            fields,
            color
        );
    }

    /**
     * Get color for severity level
     * @param {string} severity - Severity level
     * @returns {number} Color code
     */
    getSeverityColor(severity) {
        const colors = {
            critical: 0xff0000,
            high: 0xff6600,
            medium: 0xffaa00,
            low: 0x00ff00
        };
        return colors[severity] || colors.medium;
    }

    /**
     * Get emoji for severity level
     * @param {string} severity - Severity level
     * @returns {string} Emoji
     */
    getSeverityEmoji(severity) {
        const emojis = {
            critical: '🚨',
            high: '⚠️',
            medium: '⚡',
            low: 'ℹ️'
        };
        return emojis[severity] || emojis.medium;
    }

    /**
     * Report system health status
     * @param {Object} healthData - System health information
     * @param {import('discord.js').Client} client - Discord client
     */
    async reportSystemHealth(healthData, client) {
        if (!this.messageLogger) return;

        const systemEvent = {
            type: 'health_check',
            title: '📊 Rapport de Santé du Système',
            description: 'Rapport périodique de l\'état du système.',
            fields: [
                { name: 'Uptime', value: healthData.uptime || 'N/A', inline: true },
                { name: 'Mémoire utilisée', value: healthData.memoryUsage || 'N/A', inline: true },
                { name: 'Serveurs connectés', value: healthData.guildCount?.toString() || 'N/A', inline: true },
                { name: 'Erreurs récentes', value: this.getRecentErrorCount().toString(), inline: true },
                { name: 'Dernière sauvegarde', value: healthData.lastBackup || 'N/A', inline: true }
            ],
            color: 0x00ff00,
            reportToChannel: true
        };

        await this.messageLogger.logSystemEvent(systemEvent, client);
    }

    /**
     * Get count of recent errors (last hour)
     * @returns {number} Recent error count
     */
    getRecentErrorCount() {
        const oneHourAgo = Date.now() - (60 * 60 * 1000);
        let count = 0;

        for (const [errorKey, lastTime] of this.lastErrorTime.entries()) {
            if (lastTime > oneHourAgo) {
                count += this.errorCounts.get(errorKey) || 0;
            }
        }

        return count;
    }

    /**
     * Clean old error tracking data
     */
    cleanOldErrorData() {
        const oneDayAgo = Date.now() - (24 * 60 * 60 * 1000);
        
        for (const [errorKey, lastTime] of this.lastErrorTime.entries()) {
            if (lastTime < oneDayAgo) {
                this.lastErrorTime.delete(errorKey);
                this.errorCounts.delete(errorKey);
            }
        }
    }

    /**
     * Get error statistics
     * @returns {Object} Error statistics
     */
    getErrorStats() {
        return {
            totalUniqueErrors: this.errorCounts.size,
            totalErrorCount: Array.from(this.errorCounts.values()).reduce((sum, count) => sum + count, 0),
            recentErrors: this.getRecentErrorCount(),
            topErrors: Array.from(this.errorCounts.entries())
                .sort(([,a], [,b]) => b - a)
                .slice(0, 5)
                .map(([error, count]) => ({ error, count }))
        };
    }
}

export default UnifiedErrorReporter;