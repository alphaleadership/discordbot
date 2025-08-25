import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import ModerationLogger from '../../utils/ModerationLogger.js';

// Mock fs module
vi.mock('fs');

describe('ModerationLogger', () => {
    let moderationLogger;
    let mockReportManager;

    beforeEach(() => {
        // Reset all mocks
        vi.clearAllMocks();
        
        // Mock fs methods
        fs.existsSync = vi.fn();
        fs.mkdirSync = vi.fn();
        fs.writeFileSync = vi.fn();
        fs.readFileSync = vi.fn();
        fs.readdirSync = vi.fn();
        fs.statSync = vi.fn();
        fs.renameSync = vi.fn();
        fs.unlinkSync = vi.fn();

        // Mock report manager
        mockReportManager = {
            sendSystemAlert: vi.fn()
        };

        moderationLogger = new ModerationLogger(mockReportManager);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('Constructor and Initialization', () => {
        it('should initialize log directories', () => {
            expect(fs.mkdirSync).toHaveBeenCalledWith('logs/moderation', { recursive: true });
            expect(fs.mkdirSync).toHaveBeenCalledWith('logs/moderation/actions', { recursive: true });
            expect(fs.mkdirSync).toHaveBeenCalledWith('logs/moderation/watchlist', { recursive: true });
            expect(fs.mkdirSync).toHaveBeenCalledWith('logs/moderation/errors', { recursive: true });
            expect(fs.mkdirSync).toHaveBeenCalledWith('logs/moderation/audit', { recursive: true });
            expect(fs.mkdirSync).toHaveBeenCalledWith('logs/moderation/archived', { recursive: true });
        });

        it('should set default configuration values', () => {
            expect(moderationLogger.logDirectory).toBe('logs/moderation');
            expect(moderationLogger.maxLogFileSize).toBe(10 * 1024 * 1024);
            expect(moderationLogger.maxLogFiles).toBe(10);
        });
    });

    describe('logModerationAction', () => {
        it('should log a successful moderation action', async () => {
            const actionData = {
                type: 'ban',
                moderatorId: '123456789',
                moderatorTag: 'Moderator#1234',
                targetId: '987654321',
                targetTag: 'BadUser#5678',
                guildId: '111222333',
                guildName: 'Test Guild',
                reason: 'Spam',
                success: true,
                channelId: '444555666',
                details: { deleteMessageDays: 7 }
            };

            // Mock file operations
            fs.existsSync.mockReturnValue(false);
            fs.readFileSync.mockReturnValue('[]');

            const actionId = await moderationLogger.logModerationAction(actionData);

            expect(actionId).toBeDefined();
            expect(fs.writeFileSync).toHaveBeenCalled();
            
            // Check that the log entry was written with correct structure
            const writeCall = fs.writeFileSync.mock.calls.find(call => 
                call[0].includes('actions') && call[0].endsWith('.json')
            );
            expect(writeCall).toBeDefined();
            
            const logData = JSON.parse(writeCall[1]);
            expect(logData).toHaveLength(1);
            expect(logData[0]).toMatchObject({
                type: 'ban',
                moderator: { id: '123456789', tag: 'Moderator#1234' },
                target: { id: '987654321', tag: 'BadUser#5678' },
                guild: { id: '111222333', name: 'Test Guild' },
                reason: 'Spam',
                success: true,
                logType: 'moderation_action'
            });
        });

        it('should log a failed moderation action', async () => {
            const actionData = {
                type: 'kick',
                moderatorId: '123456789',
                moderatorTag: 'Moderator#1234',
                targetId: '987654321',
                targetTag: 'BadUser#5678',
                guildId: '111222333',
                guildName: 'Test Guild',
                reason: 'Inappropriate behavior',
                success: false,
                channelId: '444555666'
            };

            fs.existsSync.mockReturnValue(false);

            const actionId = await moderationLogger.logModerationAction(actionData);

            expect(actionId).toBeDefined();
            expect(fs.writeFileSync).toHaveBeenCalled();
        });

        it('should handle file write errors gracefully', async () => {
            const actionData = {
                type: 'ban',
                moderatorId: '123456789',
                moderatorTag: 'Moderator#1234',
                targetId: '987654321',
                targetTag: 'BadUser#5678',
                guildId: '111222333',
                guildName: 'Test Guild',
                reason: 'Spam',
                success: true,
                channelId: '444555666'
            };

            fs.existsSync.mockReturnValue(false);
            fs.writeFileSync.mockImplementation(() => {
                throw new Error('Write failed');
            });

            // Should not throw, but handle error gracefully
            const actionId = await moderationLogger.logModerationAction(actionData);
            expect(actionId).toBeUndefined();
        });
    });

    describe('logWatchlistOperation', () => {
        it('should log watchlist add operation', async () => {
            const watchlistData = {
                operation: 'add',
                moderatorId: '123456789',
                moderatorTag: 'Moderator#1234',
                targetId: '987654321',
                targetTag: 'SuspiciousUser#5678',
                guildId: '111222333',
                guildName: 'Test Guild',
                isGlobal: false,
                data: { reason: 'Suspicious activity', watchLevel: 'alert' },
                success: true
            };

            fs.existsSync.mockReturnValue(false);

            const operationId = await moderationLogger.logWatchlistOperation(watchlistData);

            expect(operationId).toBeDefined();
            expect(fs.writeFileSync).toHaveBeenCalled();
            
            const writeCall = fs.writeFileSync.mock.calls.find(call => 
                call[0].includes('watchlist') && call[0].endsWith('.json')
            );
            expect(writeCall).toBeDefined();
            
            const logData = JSON.parse(writeCall[1]);
            expect(logData[0]).toMatchObject({
                operation: 'add',
                moderator: { id: '123456789', tag: 'Moderator#1234' },
                target: { id: '987654321', tag: 'SuspiciousUser#5678' },
                isGlobal: false,
                success: true,
                logType: 'watchlist_operation'
            });
        });

        it('should log global watchlist operation', async () => {
            const watchlistData = {
                operation: 'add',
                moderatorId: '123456789',
                moderatorTag: 'Admin#1234',
                targetId: '987654321',
                targetTag: 'GlobalThreat#5678',
                guildId: '111222333',
                guildName: 'Test Guild',
                isGlobal: true,
                data: { reason: 'Global threat', watchLevel: 'action' },
                success: true
            };

            fs.existsSync.mockReturnValue(false);

            const operationId = await moderationLogger.logWatchlistOperation(watchlistData);

            expect(operationId).toBeDefined();
            
            const writeCall = fs.writeFileSync.mock.calls.find(call => 
                call[0].includes('watchlist') && call[0].endsWith('.json')
            );
            const logData = JSON.parse(writeCall[1]);
            expect(logData[0].isGlobal).toBe(true);
        });
    });

    describe('logError', () => {
        it('should log error with context', async () => {
            const error = new Error('Test error');
            error.code = 50013;
            error.stack = 'Error stack trace';
            
            const context = { userId: '123456789', action: 'ban' };

            fs.existsSync.mockReturnValue(false);

            const errorId = await moderationLogger.logError('permission_validator', error, context);

            expect(errorId).toBeDefined();
            expect(fs.writeFileSync).toHaveBeenCalled();
            
            const writeCall = fs.writeFileSync.mock.calls.find(call => 
                call[0].includes('errors') && call[0].endsWith('.json')
            );
            expect(writeCall).toBeDefined();
            
            const logData = JSON.parse(writeCall[1]);
            expect(logData[0]).toMatchObject({
                component: 'permission_validator',
                error: {
                    name: 'Error',
                    message: 'Test error',
                    code: 50013,
                    stack: 'Error stack trace'
                },
                context,
                logType: 'error'
            });
        });

        it('should identify critical errors', async () => {
            const criticalError = new Error('Critical permission error');
            criticalError.code = 50013;

            fs.existsSync.mockReturnValue(false);

            await moderationLogger.logError('watchlist_manager', criticalError);

            // Should attempt to report critical error
            expect(fs.writeFileSync).toHaveBeenCalled();
        });
    });

    describe('logPermissionDenial', () => {
        it('should log permission denial', async () => {
            const denialData = {
                action: 'ban',
                userId: '123456789',
                userTag: 'User#1234',
                targetId: '987654321',
                targetTag: 'Target#5678',
                guildId: '111222333',
                guildName: 'Test Guild',
                reason: 'Insufficient permissions',
                requiredPermission: 'BAN_MEMBERS',
                userPermissions: ['SEND_MESSAGES']
            };

            fs.existsSync.mockReturnValue(false);

            const denialId = await moderationLogger.logPermissionDenial(denialData);

            expect(denialId).toBeDefined();
            expect(fs.writeFileSync).toHaveBeenCalled();
            
            const writeCall = fs.writeFileSync.mock.calls.find(call => 
                call[0].includes('audit') && call[0].endsWith('.json')
            );
            expect(writeCall).toBeDefined();
            
            const logData = JSON.parse(writeCall[1]);
            expect(logData[0]).toMatchObject({
                attemptedAction: 'ban',
                user: { id: '123456789', tag: 'User#1234' },
                reason: 'Insufficient permissions',
                requiredPermission: 'BAN_MEMBERS',
                logType: 'permission_denial'
            });
        });
    });

    describe('File Operations', () => {
        it('should rotate log file when size limit exceeded', async () => {
            const filepath = 'logs/moderation/actions/actions_2024-01-01.json';
            
            fs.existsSync.mockReturnValue(true);
            fs.statSync.mockReturnValue({ size: 15 * 1024 * 1024 }); // 15MB > 10MB limit
            fs.readdirSync.mockReturnValue(['actions_2024-01-01_1234567890.json']);

            await moderationLogger.rotateLogFile(filepath, 'actions');

            expect(fs.renameSync).toHaveBeenCalled();
        });

        it('should handle corrupted log files', async () => {
            const actionData = {
                type: 'ban',
                moderatorId: '123456789',
                moderatorTag: 'Moderator#1234',
                targetId: '987654321',
                targetTag: 'BadUser#5678',
                guildId: '111222333',
                guildName: 'Test Guild',
                reason: 'Spam',
                success: true,
                channelId: '444555666'
            };

            fs.existsSync.mockReturnValue(true);
            fs.readFileSync.mockReturnValue('invalid json');

            await moderationLogger.logModerationAction(actionData);

            // Should rename corrupted file and create new one
            expect(fs.renameSync).toHaveBeenCalled();
            expect(fs.writeFileSync).toHaveBeenCalled();
        });
    });

    describe('Statistics and Search', () => {
        it('should generate moderation statistics', async () => {
            const mockLogEntries = [
                {
                    timestamp: new Date().toISOString(),
                    type: 'ban',
                    success: true,
                    moderator: { tag: 'Mod1#1234' },
                    guild: { id: '111222333' }
                },
                {
                    timestamp: new Date().toISOString(),
                    type: 'kick',
                    success: false,
                    moderator: { tag: 'Mod2#5678' },
                    guild: { id: '111222333' }
                }
            ];

            fs.readdirSync.mockReturnValue(['actions_2024-01-01.json']);
            fs.readFileSync.mockReturnValue(JSON.stringify(mockLogEntries));
            fs.existsSync.mockReturnValue(true);

            const stats = await moderationLogger.getModerationStats('111222333');

            expect(stats).toBeDefined();
            expect(stats.totalActions).toBe(2);
            expect(stats.successfulActions).toBe(1);
            expect(stats.failedActions).toBe(1);
            expect(stats.actionsByType.ban).toBe(1);
            expect(stats.actionsByType.kick).toBe(1);
        });

        it('should search logs with criteria', async () => {
            const mockLogEntries = [
                {
                    timestamp: new Date().toISOString(),
                    type: 'ban',
                    moderator: { id: '123456789' },
                    target: { id: '987654321' },
                    guild: { id: '111222333' }
                }
            ];

            fs.readdirSync.mockReturnValue(['actions_2024-01-01.json']);
            fs.readFileSync.mockReturnValue(JSON.stringify(mockLogEntries));
            fs.existsSync.mockReturnValue(true);

            const results = await moderationLogger.searchLogs({
                moderatorId: '123456789',
                actionType: 'ban'
            });

            expect(results).toHaveLength(1);
            expect(results[0].type).toBe('ban');
            expect(results[0].moderator.id).toBe('123456789');
        });
    });

    describe('Export and Cleanup', () => {
        it('should export logs to JSON format', async () => {
            const mockLogEntries = [
                {
                    timestamp: new Date().toISOString(),
                    type: 'ban',
                    moderator: { id: '123456789' }
                }
            ];

            fs.readdirSync.mockReturnValue(['actions_2024-01-01.json']);
            fs.readFileSync.mockReturnValue(JSON.stringify(mockLogEntries));
            fs.existsSync.mockReturnValue(true);

            const success = await moderationLogger.exportLogs({
                category: 'actions',
                format: 'json',
                outputPath: '/tmp/export.json'
            });

            expect(success).toBe(true);
            expect(fs.writeFileSync).toHaveBeenCalledWith(
                '/tmp/export.json',
                expect.stringContaining('"type":"ban"'),
                'utf8'
            );
        });

        it('should export logs to CSV format', async () => {
            const mockLogEntries = [
                {
                    timestamp: '2024-01-01T00:00:00.000Z',
                    id: 'test123',
                    type: 'ban',
                    moderator: { id: '123456789', tag: 'Mod#1234' },
                    target: { id: '987654321', tag: 'User#5678' },
                    guild: { id: '111222333', name: 'Test Guild' },
                    reason: 'Spam',
                    success: true,
                    logType: 'moderation_action'
                }
            ];

            fs.readdirSync.mockReturnValue(['actions_2024-01-01.json']);
            fs.readFileSync.mockReturnValue(JSON.stringify(mockLogEntries));
            fs.existsSync.mockReturnValue(true);

            const success = await moderationLogger.exportLogs({
                category: 'actions',
                format: 'csv',
                outputPath: '/tmp/export.csv'
            });

            expect(success).toBe(true);
            expect(fs.writeFileSync).toHaveBeenCalledWith(
                '/tmp/export.csv',
                expect.stringContaining('timestamp,id,type'),
                'utf8'
            );
        });

        it('should clean up old log files', async () => {
            const oldDate = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000); // 100 days ago
            
            fs.existsSync.mockReturnValue(true);
            fs.readdirSync.mockReturnValue(['old_log.json', 'recent_log.json']);
            fs.statSync
                .mockReturnValueOnce({ mtime: oldDate, size: 1024 }) // old file
                .mockReturnValueOnce({ mtime: new Date(), size: 2048 }); // recent file

            const stats = await moderationLogger.cleanupOldLogs(90);

            expect(stats.filesDeleted).toBe(4); // 1 old file × 4 categories
            expect(fs.unlinkSync).toHaveBeenCalled();
        });
    });

    describe('System Health', () => {
        it('should assess system health as healthy', async () => {
            const mockActionEntries = [
                { timestamp: new Date().toISOString(), success: true },
                { timestamp: new Date().toISOString(), success: true }
            ];
            const mockErrorEntries = [];

            fs.readdirSync.mockReturnValue(['actions_2024-01-01.json', 'errors_2024-01-01.json']);
            fs.readFileSync
                .mockReturnValueOnce(JSON.stringify(mockActionEntries))
                .mockReturnValueOnce(JSON.stringify(mockErrorEntries));
            fs.existsSync.mockReturnValue(true);

            const health = await moderationLogger.getSystemHealth();

            expect(health.status).toBe('healthy');
            expect(health.metrics.totalActions).toBe(2);
            expect(health.metrics.totalErrors).toBe(0);
            expect(health.metrics.successRate).toBe('100.00');
        });

        it('should assess system health as critical', async () => {
            const mockActionEntries = [
                { timestamp: new Date().toISOString(), success: false },
                { timestamp: new Date().toISOString(), success: false }
            ];
            const mockErrorEntries = Array(10).fill({
                timestamp: new Date().toISOString(),
                error: { code: 50013, message: 'watchlist_manager error' }
            });

            fs.readdirSync.mockReturnValue(['actions_2024-01-01.json', 'errors_2024-01-01.json']);
            fs.readFileSync
                .mockReturnValueOnce(JSON.stringify(mockActionEntries))
                .mockReturnValueOnce(JSON.stringify(mockErrorEntries));
            fs.existsSync.mockReturnValue(true);

            const health = await moderationLogger.getSystemHealth();

            expect(health.status).toBe('critical');
            expect(health.metrics.failedActions).toBe(2);
            expect(health.metrics.criticalErrors).toBe(10);
        });
    });

    describe('Utility Methods', () => {
        it('should generate unique action IDs', () => {
            const id1 = moderationLogger.generateActionId();
            const id2 = moderationLogger.generateActionId();

            expect(id1).toBeDefined();
            expect(id2).toBeDefined();
            expect(id1).not.toBe(id2);
            expect(id1).toMatch(/^\d+_[a-z0-9]+$/);
        });

        it('should identify actions that should be reported', () => {
            expect(moderationLogger.shouldReportAction({ type: 'ban', success: true })).toBe(true);
            expect(moderationLogger.shouldReportAction({ type: 'kick', success: false })).toBe(true);
            expect(moderationLogger.shouldReportAction({ type: 'kick', success: true })).toBe(false);
        });

        it('should identify critical errors', () => {
            expect(moderationLogger.isCriticalError({ code: 50013 })).toBe(true);
            expect(moderationLogger.isCriticalError({ message: 'watchlist_manager failed' })).toBe(true);
            expect(moderationLogger.isCriticalError({ code: 10001 })).toBe(false);
        });

        it('should convert logs to CSV format', () => {
            const entries = [
                {
                    timestamp: '2024-01-01T00:00:00.000Z',
                    id: 'test123',
                    type: 'ban',
                    moderator: { id: '123', tag: 'Mod#1234' },
                    target: { id: '456', tag: 'User#5678' },
                    guild: { id: '789', name: 'Test Guild' },
                    reason: 'Test reason',
                    success: true,
                    logType: 'moderation_action'
                }
            ];

            const csv = moderationLogger.convertToCSV(entries);

            expect(csv).toContain('timestamp,id,type');
            expect(csv).toContain('2024-01-01T00:00:00.000Z,test123,ban');
            expect(csv).toContain('"Test reason"');
        });
    });
});