import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * ModerationLogger - Comprehensive logging utility for all moderation actions
 * Provides structured logging with action tracking, audit trails, and file rotation
 */
class ModerationLogger {
    constructor(reportManager = null) {
        this.reportManager = reportManager;
        this.logDirectory = 'logs/moderation';
        this.maxLogFileSize = 10 * 1024 * 1024; // 10MB
        this.maxLogFiles = 10;
        
        this.initializeLogDirectories();
    }

    /**
     * Initialize all required log directories
     */
    initializeLogDirectories() {
        const directories = [
            this.logDirectory,
            `${this.logDirectory}/actions`,
            `${this.logDirectory}/watchlist`,
            `${this.logDirectory}/errors`,
            `${this.logDirectory}/audit`,
            `${this.logDirectory}/archived`
        ];

        directories.forEach(dir => {
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
        });
    }

    /**
     * Log a moderation action with comprehensive details
     * @param {Object} actionData - Moderation action data
     * @param {string} actionData.type - Action type (kick, ban, unban, timeout, clear)
     * @param {string} actionData.moderatorId - ID of the moderator
     * @param {string} actionData.moderatorTag - Tag of the moderator
     * @param {string} actionData.targetId - ID of the target user
     * @param {string} actionData.targetTag - Tag of the target user
     * @param {string} actionData.guildId - Guild ID where action occurred
     * @param {string} actionData.guildName - Guild name
     * @param {string} actionData.reason - Reason for the action
     * @param {boolean} actionData.success - Whether the action was successful
     * @param {Object} actionData.details - Additional action-specific details
     * @param {string} actionData.channelId - Channel ID where action was initiated
     */
    async logModerationAction(actionData) {
        try {
            const timestamp = new Date().toISOString();
            const actionId = this.generateActionId();
            
            const logEntry = {
                id: actionId,
                timestamp,
                type: actionData.type,
                moderator: {
                    id: actionData.moderatorId,
                    tag: actionData.moderatorTag
                },
                target: {
                    id: actionData.targetId,
                    tag: actionData.targetTag
                },
                guild: {
                    id: actionData.guildId,
                    name: actionData.guildName
                },
                channel: {
                    id: actionData.channelId
                },
                reason: actionData.reason,
                success: actionData.success,
                details: actionData.details || {},
                logType: 'moderation_action'
            };

            // Write to daily action log file
            await this.writeToLogFile('actions', logEntry);
            
            // Write to audit trail
            await this.writeToAuditTrail(logEntry);
            
            // Console logging with structured format
            const status = actionData.success ? '✅' : '❌';
            console.log(`[MODERATION] ${status} ${actionData.type.toUpperCase()} | ${actionData.moderatorTag} → ${actionData.targetTag} | Guild: ${actionData.guildName} | Reason: ${actionData.reason}`);
            
            // Report critical actions to system if configured
            if (this.shouldReportAction(actionData)) {
                await this.reportCriticalAction(logEntry);
            }
            
            return actionId;
        } catch (error) {
            console.error('Error logging moderation action:', error);
            await this.logError('moderation_action_logging', error, actionData);
        }
    }

    /**
     * Log watchlist operations (add, remove, note, incident)
     * @param {Object} watchlistData - Watchlist operation data
     */
    async logWatchlistOperation(watchlistData) {
        try {
            const timestamp = new Date().toISOString();
            const operationId = this.generateActionId();
            
            const logEntry = {
                id: operationId,
                timestamp,
                operation: watchlistData.operation, // add, remove, note, incident
                moderator: {
                    id: watchlistData.moderatorId,
                    tag: watchlistData.moderatorTag
                },
                target: {
                    id: watchlistData.targetId,
                    tag: watchlistData.targetTag
                },
                guild: {
                    id: watchlistData.guildId,
                    name: watchlistData.guildName
                },
                isGlobal: watchlistData.isGlobal || false,
                data: watchlistData.data || {},
                success: watchlistData.success,
                logType: 'watchlist_operation'
            };

            // Write to watchlist log file
            await this.writeToLogFile('watchlist', logEntry);
            
            // Console logging
            const status = watchlistData.success ? '✅' : '❌';
            const scope = watchlistData.isGlobal ? 'GLOBAL' : 'LOCAL';
            console.log(`[WATCHLIST] ${status} ${watchlistData.operation.toUpperCase()} (${scope}) | ${watchlistData.moderatorTag} → ${watchlistData.targetTag} | Guild: ${watchlistData.guildName}`);
            
            return operationId;
        } catch (error) {
            console.error('Error logging watchlist operation:', error);
            await this.logError('watchlist_operation_logging', error, watchlistData);
        }
    }

    /**
     * Log errors with context and stack traces
     * @param {string} component - Component where error occurred
     * @param {Error} error - Error object
     * @param {Object} context - Additional context data
     */
    async logError(component, error, context = {}) {
        try {
            const timestamp = new Date().toISOString();
            const errorId = this.generateActionId();
            
            const logEntry = {
                id: errorId,
                timestamp,
                component,
                error: {
                    name: error.name,
                    message: error.message,
                    stack: error.stack,
                    code: error.code
                },
                context,
                logType: 'error'
            };

            // Write to error log file
            await this.writeToLogFile('errors', logEntry);
            
            // Console logging
            console.error(`[ERROR] ${component} | ${error.message}`);
            
            // Report critical errors
            if (this.isCriticalError(error)) {
                await this.reportCriticalError(logEntry);
            }
            
            return errorId;
        } catch (logError) {
            console.error('Critical error in error logging system:', logError);
        }
    }

    /**
     * Log permission denials for security audit
     * @param {Object} denialData - Permission denial data
     */
    async logPermissionDenial(denialData) {
        try {
            const timestamp = new Date().toISOString();
            const denialId = this.generateActionId();
            
            const logEntry = {
                id: denialId,
                timestamp,
                attemptedAction: denialData.action,
                user: {
                    id: denialData.userId,
                    tag: denialData.userTag
                },
                target: denialData.targetId ? {
                    id: denialData.targetId,
                    tag: denialData.targetTag
                } : null,
                guild: {
                    id: denialData.guildId,
                    name: denialData.guildName
                },
                reason: denialData.reason,
                requiredPermission: denialData.requiredPermission,
                userPermissions: denialData.userPermissions,
                logType: 'permission_denial'
            };

            // Write to audit trail
            await this.writeToAuditTrail(logEntry);
            
            // Console logging
            console.warn(`[PERMISSION DENIED] ${denialData.action} | ${denialData.userTag} | Reason: ${denialData.reason}`);
            
            return denialId;
        } catch (error) {
            console.error('Error logging permission denial:', error);
        }
    }

    /**
     * Write log entry to appropriate log file with rotation
     * @param {string} category - Log category (actions, watchlist, errors)
     * @param {Object} logEntry - Log entry data
     */
    async writeToLogFile(category, logEntry) {
        const date = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
        const filename = `${category}_${date}.json`;
        const filepath = path.join(this.logDirectory, category, filename);
        
        try {
            // Check if file needs rotation
            if (fs.existsSync(filepath)) {
                const stats = fs.statSync(filepath);
                if (stats.size > this.maxLogFileSize) {
                    await this.rotateLogFile(filepath, category);
                }
            }
            
            // Read existing entries or initialize empty array
            let entries = [];
            if (fs.existsSync(filepath)) {
                try {
                    const content = fs.readFileSync(filepath, 'utf8');
                    entries = JSON.parse(content);
                } catch (parseError) {
                    console.error(`Error parsing log file ${filepath}:`, parseError);
                    // Backup corrupted file and start fresh
                    const backupPath = `${filepath}.corrupted.${Date.now()}`;
                    fs.renameSync(filepath, backupPath);
                    entries = [];
                }
            }
            
            // Add new entry
            entries.push(logEntry);
            
            // Write back to file
            fs.writeFileSync(filepath, JSON.stringify(entries, null, 2), 'utf8');
            
        } catch (error) {
            console.error(`Error writing to log file ${filepath}:`, error);
            throw error;
        }
    }

    /**
     * Write to audit trail for security and compliance
     * @param {Object} logEntry - Log entry data
     */
    async writeToAuditTrail(logEntry) {
        const date = new Date().toISOString().split('T')[0];
        const filename = `audit_${date}.json`;
        const filepath = path.join(this.logDirectory, 'audit', filename);
        
        try {
            let auditEntries = [];
            if (fs.existsSync(filepath)) {
                const content = fs.readFileSync(filepath, 'utf8');
                auditEntries = JSON.parse(content);
            }
            
            auditEntries.push({
                ...logEntry,
                auditTimestamp: new Date().toISOString()
            });
            
            fs.writeFileSync(filepath, JSON.stringify(auditEntries, null, 2), 'utf8');
        } catch (error) {
            console.error('Error writing to audit trail:', error);
        }
    }

    /**
     * Rotate log file when it exceeds size limit
     * @param {string} filepath - Path to log file
     * @param {string} category - Log category
     */
    async rotateLogFile(filepath, category) {
        try {
            const timestamp = Date.now();
            const filename = path.basename(filepath, '.json');
            const rotatedFilename = `${filename}_${timestamp}.json`;
            const rotatedPath = path.join(this.logDirectory, 'archived', rotatedFilename);
            
            // Move current file to archived directory
            fs.renameSync(filepath, rotatedPath);
            
            // Clean up old archived files if we exceed the limit
            await this.cleanupArchivedLogs(category);
            
            console.log(`[LOG ROTATION] Rotated log file: ${filepath} → ${rotatedPath}`);
        } catch (error) {
            console.error('Error rotating log file:', error);
        }
    }

    /**
     * Clean up old archived log files
     * @param {string} category - Log category
     */
    async cleanupArchivedLogs(category) {
        try {
            const archivedDir = path.join(this.logDirectory, 'archived');
            const files = fs.readdirSync(archivedDir)
                .filter(file => file.startsWith(category) && file.endsWith('.json'))
                .map(file => ({
                    name: file,
                    path: path.join(archivedDir, file),
                    mtime: fs.statSync(path.join(archivedDir, file)).mtime
                }))
                .sort((a, b) => b.mtime - a.mtime);
            
            // Keep only the most recent files up to maxLogFiles
            if (files.length > this.maxLogFiles) {
                const filesToDelete = files.slice(this.maxLogFiles);
                filesToDelete.forEach(file => {
                    fs.unlinkSync(file.path);
                    console.log(`[LOG CLEANUP] Deleted old log file: ${file.name}`);
                });
            }
        } catch (error) {
            console.error('Error cleaning up archived logs:', error);
        }
    }

    /**
     * Generate unique action ID
     * @returns {string} Unique action ID
     */
    generateActionId() {
        return `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Determine if action should be reported to system
     * @param {Object} actionData - Action data
     * @returns {boolean} Whether to report
     */
    shouldReportAction(actionData) {
        const criticalActions = ['ban', 'massban'];
        const failedActions = !actionData.success;
        
        return criticalActions.includes(actionData.type) || failedActions;
    }

    /**
     * Determine if error is critical
     * @param {Error} error - Error object
     * @returns {boolean} Whether error is critical
     */
    isCriticalError(error) {
        const criticalCodes = [50013, 50001, 10007]; // Permission errors, access errors, not found
        const criticalComponents = ['watchlist_manager', 'permission_validator'];
        
        return criticalCodes.includes(error.code) || 
               criticalComponents.some(comp => error.message?.toLowerCase().includes(comp));
    }

    /**
     * Report critical action to system administrators
     * @param {Object} logEntry - Log entry data
     */
    async reportCriticalAction(logEntry) {
        if (!this.reportManager) return;
        
        try {
            const embed = {
                title: '🚨 Action de Modération Critique',
                description: `Une action de modération critique a été ${logEntry.success ? 'exécutée' : 'tentée'}.`,
                fields: [
                    { name: 'Action', value: logEntry.type.toUpperCase(), inline: true },
                    { name: 'Modérateur', value: logEntry.moderator.tag, inline: true },
                    { name: 'Cible', value: logEntry.target.tag, inline: true },
                    { name: 'Serveur', value: logEntry.guild.name, inline: true },
                    { name: 'Statut', value: logEntry.success ? '✅ Réussie' : '❌ Échouée', inline: true },
                    { name: 'Raison', value: logEntry.reason, inline: false }
                ],
                color: logEntry.success ? 0xff6600 : 0xff0000,
                timestamp: logEntry.timestamp
            };
            
            // This would integrate with the existing ReportManager
            // await this.reportManager.sendSystemAlert(client, embed);
        } catch (error) {
            console.error('Error reporting critical action:', error);
        }
    }

    /**
     * Report critical error to system administrators
     * @param {Object} logEntry - Error log entry
     */
    async reportCriticalError(logEntry) {
        if (!this.reportManager) return;
        
        try {
            const embed = {
                title: '💥 Erreur Critique du Système',
                description: 'Une erreur critique s\'est produite dans le système de modération.',
                fields: [
                    { name: 'Composant', value: logEntry.component, inline: true },
                    { name: 'Type d\'erreur', value: logEntry.error.name, inline: true },
                    { name: 'Message', value: logEntry.error.message.substring(0, 1000), inline: false },
                    { name: 'Code', value: logEntry.error.code || 'N/A', inline: true }
                ],
                color: 0xff0000,
                timestamp: logEntry.timestamp
            };
            
            // This would integrate with the existing ReportManager
            // await this.reportManager.sendSystemAlert(client, embed);
        } catch (error) {
            console.error('Error reporting critical error:', error);
        }
    }

    /**
     * Get moderation statistics for a specific time period
     * @param {string} guildId - Guild ID (optional, for guild-specific stats)
     * @param {Date} startDate - Start date for statistics
     * @param {Date} endDate - End date for statistics
     * @returns {Object} Statistics object
     */
    async getModerationStats(guildId = null, startDate = null, endDate = null) {
        try {
            const stats = {
                totalActions: 0,
                successfulActions: 0,
                failedActions: 0,
                actionsByType: {},
                actionsByModerator: {},
                watchlistOperations: 0,
                permissionDenials: 0,
                errors: 0
            };

            // Default to last 30 days if no dates provided
            if (!startDate) startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
            if (!endDate) endDate = new Date();

            // Read action logs
            const actionFiles = this.getLogFilesInDateRange('actions', startDate, endDate);
            for (const file of actionFiles) {
                const entries = this.readLogFile(file);
                for (const entry of entries) {
                    if (guildId && entry.guild?.id !== guildId) continue;
                    
                    const entryDate = new Date(entry.timestamp);
                    if (entryDate >= startDate && entryDate <= endDate) {
                        stats.totalActions++;
                        if (entry.success) stats.successfulActions++;
                        else stats.failedActions++;
                        
                        stats.actionsByType[entry.type] = (stats.actionsByType[entry.type] || 0) + 1;
                        stats.actionsByModerator[entry.moderator.tag] = (stats.actionsByModerator[entry.moderator.tag] || 0) + 1;
                    }
                }
            }

            // Read watchlist logs
            const watchlistFiles = this.getLogFilesInDateRange('watchlist', startDate, endDate);
            for (const file of watchlistFiles) {
                const entries = this.readLogFile(file);
                stats.watchlistOperations += entries.filter(entry => {
                    if (guildId && entry.guild?.id !== guildId) return false;
                    const entryDate = new Date(entry.timestamp);
                    return entryDate >= startDate && entryDate <= endDate;
                }).length;
            }

            // Read error logs
            const errorFiles = this.getLogFilesInDateRange('errors', startDate, endDate);
            for (const file of errorFiles) {
                const entries = this.readLogFile(file);
                stats.errors += entries.filter(entry => {
                    const entryDate = new Date(entry.timestamp);
                    return entryDate >= startDate && entryDate <= endDate;
                }).length;
            }

            // Read audit logs for permission denials
            const auditFiles = this.getLogFilesInDateRange('audit', startDate, endDate);
            for (const file of auditFiles) {
                const entries = this.readLogFile(file);
                stats.permissionDenials += entries.filter(entry => {
                    if (entry.logType !== 'permission_denial') return false;
                    if (guildId && entry.guild?.id !== guildId) return false;
                    const entryDate = new Date(entry.timestamp);
                    return entryDate >= startDate && entryDate <= endDate;
                }).length;
            }

            return stats;
        } catch (error) {
            console.error('Error getting moderation stats:', error);
            return null;
        }
    }

    /**
     * Get log files within a date range
     * @param {string} category - Log category
     * @param {Date} startDate - Start date
     * @param {Date} endDate - End date
     * @returns {Array} Array of log file paths
     */
    getLogFilesInDateRange(category, startDate, endDate) {
        try {
            const categoryDir = path.join(this.logDirectory, category);
            if (!fs.existsSync(categoryDir)) return [];

            const files = fs.readdirSync(categoryDir)
                .filter(file => file.endsWith('.json'))
                .map(file => {
                    const match = file.match(/(\d{4}-\d{2}-\d{2})/);
                    if (match) {
                        const fileDate = new Date(match[1]);
                        if (fileDate >= startDate && fileDate <= endDate) {
                            return path.join(categoryDir, file);
                        }
                    }
                    return null;
                })
                .filter(file => file !== null);

            return files;
        } catch (error) {
            console.error('Error getting log files in date range:', error);
            return [];
        }
    }

    /**
     * Read and parse a log file
     * @param {string} filepath - Path to log file
     * @returns {Array} Array of log entries
     */
    readLogFile(filepath) {
        try {
            if (!fs.existsSync(filepath)) return [];
            const content = fs.readFileSync(filepath, 'utf8');
            return JSON.parse(content);
        } catch (error) {
            console.error(`Error reading log file ${filepath}:`, error);
            return [];
        }
    }

    /**
     * Search logs for specific criteria
     * @param {Object} searchCriteria - Search criteria
     * @param {string} searchCriteria.category - Log category to search
     * @param {string} searchCriteria.moderatorId - Moderator ID to filter by
     * @param {string} searchCriteria.targetId - Target user ID to filter by
     * @param {string} searchCriteria.guildId - Guild ID to filter by
     * @param {string} searchCriteria.actionType - Action type to filter by
     * @param {Date} searchCriteria.startDate - Start date for search
     * @param {Date} searchCriteria.endDate - End date for search
     * @param {number} searchCriteria.limit - Maximum number of results
     * @returns {Array} Array of matching log entries
     */
    async searchLogs(searchCriteria) {
        try {
            const {
                category = 'actions',
                moderatorId,
                targetId,
                guildId,
                actionType,
                startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
                endDate = new Date(),
                limit = 100
            } = searchCriteria;

            const results = [];
            const logFiles = this.getLogFilesInDateRange(category, startDate, endDate);

            for (const file of logFiles) {
                const entries = this.readLogFile(file);
                for (const entry of entries) {
                    // Apply filters
                    if (moderatorId && entry.moderator?.id !== moderatorId) continue;
                    if (targetId && entry.target?.id !== targetId) continue;
                    if (guildId && entry.guild?.id !== guildId) continue;
                    if (actionType && entry.type !== actionType) continue;

                    const entryDate = new Date(entry.timestamp);
                    if (entryDate >= startDate && entryDate <= endDate) {
                        results.push(entry);
                        if (results.length >= limit) break;
                    }
                }
                if (results.length >= limit) break;
            }

            // Sort by timestamp (newest first)
            results.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));

            return results;
        } catch (error) {
            console.error('Error searching logs:', error);
            return [];
        }
    }

    /**
     * Export logs for external analysis or backup
     * @param {Object} exportOptions - Export options
     * @param {string} exportOptions.category - Log category to export
     * @param {Date} exportOptions.startDate - Start date for export
     * @param {Date} exportOptions.endDate - End date for export
     * @param {string} exportOptions.format - Export format (json, csv)
     * @param {string} exportOptions.outputPath - Output file path
     * @returns {boolean} Success status
     */
    async exportLogs(exportOptions) {
        try {
            const {
                category = 'actions',
                startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
                endDate = new Date(),
                format = 'json',
                outputPath
            } = exportOptions;

            if (!outputPath) {
                throw new Error('Output path is required for log export');
            }

            const logFiles = this.getLogFilesInDateRange(category, startDate, endDate);
            const allEntries = [];

            for (const file of logFiles) {
                const entries = this.readLogFile(file);
                allEntries.push(...entries.filter(entry => {
                    const entryDate = new Date(entry.timestamp);
                    return entryDate >= startDate && entryDate <= endDate;
                }));
            }

            // Sort by timestamp
            allEntries.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

            if (format === 'json') {
                fs.writeFileSync(outputPath, JSON.stringify(allEntries, null, 2), 'utf8');
            } else if (format === 'csv') {
                // Convert to CSV format
                const csvContent = this.convertToCSV(allEntries);
                fs.writeFileSync(outputPath, csvContent, 'utf8');
            } else {
                throw new Error(`Unsupported export format: ${format}`);
            }

            console.log(`[LOG EXPORT] Exported ${allEntries.length} entries to ${outputPath}`);
            return true;
        } catch (error) {
            console.error('Error exporting logs:', error);
            return false;
        }
    }

    /**
     * Convert log entries to CSV format
     * @param {Array} entries - Log entries
     * @returns {string} CSV content
     */
    convertToCSV(entries) {
        if (entries.length === 0) return '';

        // Define CSV headers based on log type
        const headers = [
            'timestamp',
            'id',
            'type',
            'moderator_id',
            'moderator_tag',
            'target_id',
            'target_tag',
            'guild_id',
            'guild_name',
            'reason',
            'success',
            'log_type'
        ];

        const csvRows = [headers.join(',')];

        entries.forEach(entry => {
            const row = [
                entry.timestamp,
                entry.id,
                entry.type || entry.operation || '',
                entry.moderator?.id || '',
                entry.moderator?.tag || '',
                entry.target?.id || '',
                entry.target?.tag || '',
                entry.guild?.id || '',
                entry.guild?.name || '',
                `"${(entry.reason || '').replace(/"/g, '""')}"`, // Escape quotes
                entry.success || false,
                entry.logType || ''
            ];
            csvRows.push(row.join(','));
        });

        return csvRows.join('\n');
    }

    /**
     * Clean up old log files based on retention policy
     * @param {number} retentionDays - Number of days to retain logs
     * @returns {Object} Cleanup statistics
     */
    async cleanupOldLogs(retentionDays = 90) {
        try {
            const cutoffDate = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000);
            const categories = ['actions', 'watchlist', 'errors', 'audit'];
            const stats = {
                filesDeleted: 0,
                totalSizeFreed: 0
            };

            for (const category of categories) {
                const categoryDir = path.join(this.logDirectory, category);
                if (!fs.existsSync(categoryDir)) continue;

                const files = fs.readdirSync(categoryDir);
                for (const file of files) {
                    const filepath = path.join(categoryDir, file);
                    const fileStat = fs.statSync(filepath);
                    
                    if (fileStat.mtime < cutoffDate) {
                        stats.totalSizeFreed += fileStat.size;
                        fs.unlinkSync(filepath);
                        stats.filesDeleted++;
                        console.log(`[LOG CLEANUP] Deleted old log file: ${file}`);
                    }
                }
            }

            console.log(`[LOG CLEANUP] Cleanup complete: ${stats.filesDeleted} files deleted, ${(stats.totalSizeFreed / 1024 / 1024).toFixed(2)} MB freed`);
            return stats;
        } catch (error) {
            console.error('Error during log cleanup:', error);
            return { filesDeleted: 0, totalSizeFreed: 0 };
        }
    }

    /**
     * Get system health status based on recent logs
     * @returns {Object} Health status
     */
    async getSystemHealth() {
        try {
            const last24Hours = new Date(Date.now() - 24 * 60 * 60 * 1000);
            const now = new Date();

            const recentErrors = await this.searchLogs({
                category: 'errors',
                startDate: last24Hours,
                endDate: now,
                limit: 1000
            });

            const recentActions = await this.searchLogs({
                category: 'actions',
                startDate: last24Hours,
                endDate: now,
                limit: 1000
            });

            const criticalErrors = recentErrors.filter(error => 
                this.isCriticalError({ code: error.error?.code, message: error.error?.message })
            );

            const failedActions = recentActions.filter(action => !action.success);

            const health = {
                status: 'healthy',
                timestamp: now.toISOString(),
                metrics: {
                    totalErrors: recentErrors.length,
                    criticalErrors: criticalErrors.length,
                    totalActions: recentActions.length,
                    failedActions: failedActions.length,
                    successRate: recentActions.length > 0 ? 
                        ((recentActions.length - failedActions.length) / recentActions.length * 100).toFixed(2) : 100
                }
            };

            // Determine health status
            if (criticalErrors.length > 5 || failedActions.length > 10) {
                health.status = 'critical';
            } else if (criticalErrors.length > 2 || failedActions.length > 5) {
                health.status = 'warning';
            }

            return health;
        } catch (error) {
            console.error('Error getting system health:', error);
            return {
                status: 'error',
                timestamp: new Date().toISOString(),
                error: error.message
            };
        }
    }
}

export default ModerationLogger;