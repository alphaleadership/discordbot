import { describe, it, expect, beforeEach, vi } from 'vitest';
import ModerationLogger from '../../utils/ModerationLogger.js';

describe('Moderation Logging Integration - Core Functionality', () => {
    let moderationLogger;

    beforeEach(() => {
        vi.clearAllMocks();
        moderationLogger = new ModerationLogger();
        
        // Mock file system operations to prevent actual file writes during tests
        vi.spyOn(moderationLogger, 'writeToLogFile').mockResolvedValue();
        vi.spyOn(moderationLogger, 'writeToAuditTrail').mockResolvedValue();
    });

    describe('ModerationLogger Core Methods', () => {
        it('should log moderation actions with all required fields', async () => {
            const actionData = {
                type: 'ban',
                moderatorId: '123456789',
                moderatorTag: 'TestUser#1234',
                targetId: '111222333',
                targetTag: 'TargetUser#5678',
                guildId: '987654321',
                guildName: 'Test Guild',
                reason: 'Test reason',
                success: true,
                channelId: '555666777',
                details: {
                    deleteMessageDays: 7,
                    dmSent: true
                }
            };

            const actionId = await moderationLogger.logModerationAction(actionData);

            expect(actionId).toBeDefined();
            expect(typeof actionId).toBe('string');
            expect(moderationLogger.writeToLogFile).toHaveBeenCalledWith('actions', expect.objectContaining({
                type: 'ban',
                moderator: expect.objectContaining({
                    id: '123456789',
                    tag: 'TestUser#1234'
                }),
                target: expect.objectContaining({
                    id: '111222333',
                    tag: 'TargetUser#5678'
                }),
                guild: expect.objectContaining({
                    id: '987654321',
                    name: 'Test Guild'
                }),
                reason: 'Test reason',
                success: true,
                details: expect.objectContaining({
                    deleteMessageDays: 7,
                    dmSent: true
                }),
                logType: 'moderation_action'
            }));
        });

        it('should log watchlist operations with all required fields', async () => {
            const watchlistData = {
                operation: 'add',
                moderatorId: '123456789',
                moderatorTag: 'TestUser#1234',
                targetId: '111222333',
                targetTag: 'TargetUser#5678',
                guildId: '987654321',
                guildName: 'Test Guild',
                isGlobal: false,
                success: true,
                data: {
                    reason: 'Test surveillance reason',
                    watchLevel: 'alert'
                }
            };

            const operationId = await moderationLogger.logWatchlistOperation(watchlistData);

            expect(operationId).toBeDefined();
            expect(typeof operationId).toBe('string');
            expect(moderationLogger.writeToLogFile).toHaveBeenCalledWith('watchlist', expect.objectContaining({
                operation: 'add',
                moderator: expect.objectContaining({
                    id: '123456789',
                    tag: 'TestUser#1234'
                }),
                target: expect.objectContaining({
                    id: '111222333',
                    tag: 'TargetUser#5678'
                }),
                guild: expect.objectContaining({
                    id: '987654321',
                    name: 'Test Guild'
                }),
                isGlobal: false,
                success: true,
                data: expect.objectContaining({
                    reason: 'Test surveillance reason',
                    watchLevel: 'alert'
                }),
                logType: 'watchlist_operation'
            }));
        });

        it('should log permission denials with all required fields', async () => {
            const denialData = {
                action: 'ban',
                userId: '123456789',
                userTag: 'TestUser#1234',
                targetId: '111222333',
                targetTag: 'TargetUser#5678',
                guildId: '987654321',
                guildName: 'Test Guild',
                reason: 'Insufficient permissions',
                requiredPermission: 'BAN_MEMBERS',
                userPermissions: ['KICK_MEMBERS', 'MANAGE_MESSAGES']
            };

            const denialId = await moderationLogger.logPermissionDenial(denialData);

            expect(denialId).toBeDefined();
            expect(typeof denialId).toBe('string');
            expect(moderationLogger.writeToAuditTrail).toHaveBeenCalledWith(expect.objectContaining({
                attemptedAction: 'ban',
                user: expect.objectContaining({
                    id: '123456789',
                    tag: 'TestUser#1234'
                }),
                target: expect.objectContaining({
                    id: '111222333',
                    tag: 'TargetUser#5678'
                }),
                guild: expect.objectContaining({
                    id: '987654321',
                    name: 'Test Guild'
                }),
                reason: 'Insufficient permissions',
                requiredPermission: 'BAN_MEMBERS',
                userPermissions: ['KICK_MEMBERS', 'MANAGE_MESSAGES'],
                logType: 'permission_denial'
            }));
        });

        it('should log errors with context information', async () => {
            const error = new Error('Test error message');
            error.code = 50013;
            const context = {
                moderatorId: '123456789',
                moderatorTag: 'TestUser#1234',
                guildId: '987654321',
                guildName: 'Test Guild'
            };

            const errorId = await moderationLogger.logError('test-component', error, context);

            expect(errorId).toBeDefined();
            expect(typeof errorId).toBe('string');
            expect(moderationLogger.writeToLogFile).toHaveBeenCalledWith('errors', expect.objectContaining({
                component: 'test-component',
                error: expect.objectContaining({
                    name: 'Error',
                    message: 'Test error message',
                    code: 50013
                }),
                context: context,
                logType: 'error'
            }));
        });
    });

    describe('Logging Interface Consistency', () => {
        it('should generate unique action IDs', async () => {
            const actionData = {
                type: 'kick',
                moderatorId: '123456789',
                moderatorTag: 'TestUser#1234',
                targetId: '111222333',
                targetTag: 'TargetUser#5678',
                guildId: '987654321',
                guildName: 'Test Guild',
                reason: 'Test reason',
                success: true,
                channelId: '555666777',
                details: {}
            };

            const id1 = await moderationLogger.logModerationAction(actionData);
            const id2 = await moderationLogger.logModerationAction(actionData);

            expect(id1).not.toBe(id2);
            expect(id1).toMatch(/^\d+_[a-z0-9]+$/);
            expect(id2).toMatch(/^\d+_[a-z0-9]+$/);
        });

        it('should handle failed operations correctly', async () => {
            const actionData = {
                type: 'ban',
                moderatorId: '123456789',
                moderatorTag: 'TestUser#1234',
                targetId: '111222333',
                targetTag: 'TargetUser#5678',
                guildId: '987654321',
                guildName: 'Test Guild',
                reason: 'Test reason',
                success: false,
                channelId: '555666777',
                details: {
                    errorCode: 50013,
                    errorMessage: 'Missing Permissions'
                }
            };

            const actionId = await moderationLogger.logModerationAction(actionData);

            expect(actionId).toBeDefined();
            expect(moderationLogger.writeToLogFile).toHaveBeenCalledWith('actions', expect.objectContaining({
                success: false,
                details: expect.objectContaining({
                    errorCode: 50013,
                    errorMessage: 'Missing Permissions'
                })
            }));
        });

        it('should handle global watchlist operations', async () => {
            const watchlistData = {
                operation: 'add',
                moderatorId: '123456789',
                moderatorTag: 'TestUser#1234',
                targetId: '111222333',
                targetTag: 'TargetUser#5678',
                guildId: '987654321',
                guildName: 'Test Guild',
                isGlobal: true,
                success: true,
                data: {
                    reason: 'Global surveillance',
                    watchLevel: 'action'
                }
            };

            const operationId = await moderationLogger.logWatchlistOperation(watchlistData);

            expect(operationId).toBeDefined();
            expect(moderationLogger.writeToLogFile).toHaveBeenCalledWith('watchlist', expect.objectContaining({
                isGlobal: true,
                data: expect.objectContaining({
                    reason: 'Global surveillance',
                    watchLevel: 'action'
                })
            }));
        });
    });

    describe('Audit Trail Requirements', () => {
        it('should create audit trail entries for all moderation actions', async () => {
            const actionData = {
                type: 'timeout',
                moderatorId: '123456789',
                moderatorTag: 'TestUser#1234',
                targetId: '111222333',
                targetTag: 'TargetUser#5678',
                guildId: '987654321',
                guildName: 'Test Guild',
                reason: 'Spam',
                success: true,
                channelId: '555666777',
                details: {
                    duration: '1h',
                    durationMs: 3600000
                }
            };

            await moderationLogger.logModerationAction(actionData);

            // Verify audit trail is created
            expect(moderationLogger.writeToAuditTrail).toHaveBeenCalledWith(expect.objectContaining({
                type: 'timeout',
                moderator: expect.objectContaining({
                    id: '123456789',
                    tag: 'TestUser#1234'
                }),
                target: expect.objectContaining({
                    id: '111222333',
                    tag: 'TargetUser#5678'
                }),
                success: true,
                logType: 'moderation_action'
            }));
        });

        it('should include all required audit information', async () => {
            const actionData = {
                type: 'clear',
                moderatorId: '123456789',
                moderatorTag: 'TestUser#1234',
                targetId: null,
                targetTag: null,
                guildId: '987654321',
                guildName: 'Test Guild',
                reason: 'Cleared 50 messages',
                success: true,
                channelId: '555666777',
                details: {
                    targetChannelId: '888999000',
                    targetChannelName: 'general',
                    deletedCount: 50
                }
            };

            await moderationLogger.logModerationAction(actionData);

            // Verify all required audit fields are present
            const auditCall = moderationLogger.writeToAuditTrail.mock.calls[0][0];
            expect(auditCall).toHaveProperty('id');
            expect(auditCall).toHaveProperty('timestamp');
            expect(auditCall).toHaveProperty('type', 'clear');
            expect(auditCall).toHaveProperty('moderator');
            expect(auditCall).toHaveProperty('guild');
            expect(auditCall).toHaveProperty('reason', 'Cleared 50 messages');
            expect(auditCall).toHaveProperty('success', true);
            expect(auditCall).toHaveProperty('details');
            expect(auditCall).toHaveProperty('logType', 'moderation_action');
        });
    });
});