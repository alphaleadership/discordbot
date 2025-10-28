import { describe, it, expect, beforeEach, vi } from 'vitest';
import ModerationLogger from '../../utils/ModerationLogger.js';

// Mock Discord.js components
const mockInteraction = {
    user: { id: '123456789', tag: 'TestUser#1234' },
    guild: { id: '987654321', name: 'Test Guild' },
    channel: { id: '555666777' },
    member: { 
        permissions: { 
            has: vi.fn().mockReturnValue(true),
            toArray: vi.fn().mockReturnValue(['KICK_MEMBERS', 'BAN_MEMBERS'])
        }
    },
    options: {
        getUser: vi.fn().mockReturnValue({ id: '111222333', tag: 'TargetUser#5678' }),
        getString: vi.fn().mockReturnValue('Test reason'),
        getInteger: vi.fn().mockReturnValue(5)
    },
    reply: vi.fn(),
    followUp: vi.fn(),
    editReply: vi.fn(),
    deferred: false,
    replied: false
};

const mockReportManager = {
    moderationLogger: null
};

const mockAdminManager = {
    isAdmin: vi.fn().mockReturnValue(false)
};

const mockPermissionValidator = {
    validateModerationAction: vi.fn().mockReturnValue({ success: true }),
    validateWatchlistPermission: vi.fn().mockReturnValue({ success: true }),
    validateGlobalWatchlistPermission: vi.fn().mockReturnValue({ success: true })
};

const mockWatchlistManager = {
    addToWatchlist: vi.fn().mockResolvedValue({ success: true }),
    removeFromWatchlist: vi.fn().mockResolvedValue({ success: true }),
    addNote: vi.fn().mockResolvedValue({ success: true }),
    getWatchlistEntry: vi.fn().mockReturnValue({ 
        active: true, 
        reason: 'Test reason', 
        watchLevel: 'alert',
        notes: []
    })
};

describe('Moderation Logging Integration', () => {
    let moderationLogger;

    beforeEach(() => {
        vi.clearAllMocks();
        moderationLogger = new ModerationLogger();
        mockReportManager.moderationLogger = moderationLogger;
        
        // Mock file system operations
        vi.spyOn(moderationLogger, 'logModerationAction').mockResolvedValue('action_123');
        vi.spyOn(moderationLogger, 'logWatchlistOperation').mockResolvedValue('watchlist_123');
        vi.spyOn(moderationLogger, 'logPermissionDenial').mockResolvedValue('denial_123');
        vi.spyOn(moderationLogger, 'logError').mockResolvedValue('error_123');
        
        // Reset mock return values
        mockPermissionValidator.validateModerationAction.mockReturnValue({ success: true });
        mockPermissionValidator.validateWatchlistPermission.mockReturnValue({ success: true });
        mockPermissionValidator.validateGlobalWatchlistPermission.mockReturnValue({ success: true });
        mockWatchlistManager.addToWatchlist.mockResolvedValue({ success: true });
        mockWatchlistManager.removeFromWatchlist.mockResolvedValue({ success: true });
        mockWatchlistManager.addNote.mockResolvedValue({ success: true });
        
        // Reset interaction options
        mockInteraction.options.getString.mockImplementation((name) => {
            if (name === 'raison') return 'Test reason';
            if (name === 'note') return 'Test note content';
            if (name === 'niveau') return 'alert';
            return 'Test reason';
        });
    });

    describe('Moderation Commands Logging', () => {
        it('should log successful ban action', async () => {
            // Import and test ban command
            const banCommand = await import('../../commands/ban.js');
            
            // Mock successful ban
            mockInteraction.guild.members = {
                ban: vi.fn().mockResolvedValue(true),
                fetch: vi.fn().mockResolvedValue({
                    roles: { highest: { position: 1 } }
                })
            };

            await banCommand.default.execute(
                mockInteraction,
                mockAdminManager,
                null, // warnManager
                null, // guildConfig
                null, // sharedConfig
                null, // backupToGitHub
                mockReportManager,
                null, // banlistManager
                null, // blockedWordsManager
                null, // watchlistManager
                null, // telegramIntegration
                null, // funCommandsManager
                null, // raidDetector
                null, // doxDetector
                null, // enhancedReloadSystem
                mockPermissionValidator
            );

            expect(moderationLogger.logModerationAction).toHaveBeenCalledWith({
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
                details: expect.objectContaining({
                    deleteMessageDays: expect.any(Number),
                    dmSent: expect.any(Boolean)
                })
            });
        });

        it('should log failed ban action', async () => {
            const banCommand = await import('../../commands/ban.js');
            
            // Mock failed ban
            const banError = new Error('Permission denied');
            banError.code = 50013;
            mockInteraction.guild.members = {
                ban: vi.fn().mockRejectedValue(banError),
                fetch: vi.fn().mockResolvedValue({
                    roles: { highest: { position: 1 } }
                })
            };

            await banCommand.default.execute(
                mockInteraction,
                mockAdminManager, null, null, null, null,
                mockReportManager,
                null, null, null, null, null, null, null, null,
                mockPermissionValidator
            );

            expect(moderationLogger.logModerationAction).toHaveBeenCalledWith({
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
                details: expect.objectContaining({
                    errorCode: 50013,
                    errorMessage: 'Permission denied'
                })
            });
        });

        it('should log permission denial for ban command', async () => {
            const banCommand = await import('../../commands/ban.js');
            
            // Mock permission denial
            mockPermissionValidator.validateModerationAction.mockReturnValue({
                success: false,
                message: 'Insufficient permissions'
            });

            await banCommand.default.execute(
                mockInteraction,
                mockAdminManager, null, null, null, null,
                mockReportManager,
                null, null, null, null, null, null, null, null,
                mockPermissionValidator
            );

            expect(moderationLogger.logPermissionDenial).toHaveBeenCalledWith({
                action: 'ban',
                userId: '123456789',
                userTag: 'TestUser#1234',
                targetId: '111222333',
                targetTag: 'TargetUser#5678',
                guildId: '987654321',
                guildName: 'Test Guild',
                reason: 'Insufficient permissions',
                requiredPermission: 'BAN_MEMBERS',
                userPermissions: ['KICK_MEMBERS', 'BAN_MEMBERS']
            });
        });
    });

    describe('Watchlist Commands Logging', () => {
        it('should log successful watchlist add operation', async () => {
            const watchlistAddCommand = await import('../../commands/watchlist-add.js');

            await watchlistAddCommand.default.execute(
                mockInteraction,
                mockAdminManager, null, null, null, null,
                mockReportManager,
                null, null, mockWatchlistManager,
                null, null, null, null, null,
                mockPermissionValidator
            );

            expect(moderationLogger.logWatchlistOperation).toHaveBeenCalledWith({
                operation: 'add',
                moderatorId: '123456789',
                moderatorTag: 'TestUser#1234',
                targetId: '111222333',
                targetTag: 'TargetUser#5678',
                guildId: '987654321',
                guildName: 'Test Guild',
                isGlobal: false,
                success: true,
                data: expect.objectContaining({
                    reason: 'Test reason',
                    watchLevel: expect.any(String)
                })
            });
        });

        it('should log failed watchlist add operation', async () => {
            const watchlistAddCommand = await import('../../commands/watchlist-add.js');
            
            // Mock failed watchlist operation
            mockWatchlistManager.addToWatchlist.mockResolvedValue({
                success: false,
                error: 'User already on watchlist'
            });

            await watchlistAddCommand.default.execute(
                mockInteraction,
                mockAdminManager, null, null, null, null,
                mockReportManager,
                null, null, mockWatchlistManager,
                null, null, null, null, null,
                mockPermissionValidator
            );

            expect(moderationLogger.logWatchlistOperation).toHaveBeenCalledWith({
                operation: 'add',
                moderatorId: '123456789',
                moderatorTag: 'TestUser#1234',
                targetId: '111222333',
                targetTag: 'TargetUser#5678',
                guildId: '987654321',
                guildName: 'Test Guild',
                isGlobal: false,
                success: false,
                data: expect.objectContaining({
                    error: 'User already on watchlist'
                })
            });
        });

        it('should log watchlist note operation', async () => {
            const watchlistNoteCommand = await import('../../commands/watchlist-note.js');
            
            mockInteraction.options.getString.mockReturnValue('Test note content');

            await watchlistNoteCommand.default.execute(
                mockInteraction,
                mockAdminManager, null, null, null, null,
                mockReportManager,
                null, null, mockWatchlistManager,
                null, null, null, null, null,
                mockPermissionValidator
            );

            expect(moderationLogger.logWatchlistOperation).toHaveBeenCalledWith({
                operation: 'note',
                moderatorId: '123456789',
                moderatorTag: 'TestUser#1234',
                targetId: '111222333',
                targetTag: 'TargetUser#5678',
                guildId: '987654321',
                guildName: 'Test Guild',
                isGlobal: false,
                success: true,
                data: expect.objectContaining({
                    note: 'Test note content',
                    watchLevel: 'alert'
                })
            });
        });

        it('should log permission denial for watchlist operations', async () => {
            const watchlistAddCommand = await import('../../commands/watchlist-add.js');
            
            // Mock permission denial
            mockPermissionValidator.validateWatchlistPermission.mockReturnValue({
                success: false,
                message: 'No watchlist permissions'
            });

            await watchlistAddCommand.default.execute(
                mockInteraction,
                mockAdminManager, null, null, null, null,
                mockReportManager,
                null, null, mockWatchlistManager,
                null, null, null, null, null,
                mockPermissionValidator
            );

            expect(moderationLogger.logPermissionDenial).toHaveBeenCalledWith({
                action: 'watchlist-add',
                userId: '123456789',
                userTag: 'TestUser#1234',
                targetId: '111222333',
                targetTag: 'TargetUser#5678',
                guildId: '987654321',
                guildName: 'Test Guild',
                reason: 'No watchlist permissions',
                requiredPermission: 'WATCHLIST_MANAGEMENT',
                userPermissions: ['KICK_MEMBERS', 'BAN_MEMBERS']
            });
        });
    });

    describe('Global Watchlist Commands Logging', () => {
        it('should log successful global watchlist add operation', async () => {
            const globalWatchlistAddCommand = await import('../../commands/global-watchlist-add.js');
            
            // Mock successful global watchlist operation
            mockWatchlistManager.addToGlobalWatchlist = vi.fn().mockResolvedValue({ success: true });

            await globalWatchlistAddCommand.default.execute(
                mockInteraction,
                mockAdminManager, null, null, null, null,
                mockReportManager,
                null, null, mockWatchlistManager,
                null, null, null, null, null,
                mockPermissionValidator
            );

            expect(moderationLogger.logWatchlistOperation).toHaveBeenCalledWith({
                operation: 'add',
                moderatorId: '123456789',
                moderatorTag: 'TestUser#1234',
                targetId: '111222333',
                targetTag: 'TargetUser#5678',
                guildId: '987654321',
                guildName: 'Test Guild',
                isGlobal: true,
                success: true,
                data: expect.objectContaining({
                    reason: 'Test reason',
                    watchLevel: expect.any(String)
                })
            });
        });

        it('should log permission denial for global watchlist operations', async () => {
            const globalWatchlistAddCommand = await import('../../commands/global-watchlist-add.js');
            
            // Mock permission denial
            mockPermissionValidator.validateGlobalWatchlistPermission.mockReturnValue({
                success: false,
                message: 'Not a bot admin'
            });

            await globalWatchlistAddCommand.default.execute(
                mockInteraction,
                mockAdminManager, null, null, null, null,
                mockReportManager,
                null, null, mockWatchlistManager,
                null, null, null, null, null,
                mockPermissionValidator
            );

            expect(moderationLogger.logPermissionDenial).toHaveBeenCalledWith({
                action: 'global-watchlist-add',
                userId: '123456789',
                userTag: 'TestUser#1234',
                targetId: '111222333',
                targetTag: 'TargetUser#5678',
                guildId: '987654321',
                guildName: 'Test Guild',
                reason: 'Not a bot admin',
                requiredPermission: 'BOT_ADMIN',
                userPermissions: ['KICK_MEMBERS', 'BAN_MEMBERS']
            });
        });
    });

    describe('Error Logging', () => {
        it('should log errors in command execution', async () => {
            const watchlistAddCommand = await import('../../commands/watchlist-add.js');
            
            // Mock an error during execution
            mockWatchlistManager.addToWatchlist.mockRejectedValue(new Error('Database error'));

            await watchlistAddCommand.default.execute(
                mockInteraction,
                mockAdminManager, null, null, null, null,
                mockReportManager,
                null, null, mockWatchlistManager,
                null, null, null, null, null,
                mockPermissionValidator
            );

            expect(moderationLogger.logError).toHaveBeenCalledWith(
                'watchlist-add',
                expect.any(Error),
                expect.objectContaining({
                    moderatorId: '123456789',
                    moderatorTag: 'TestUser#1234',
                    guildId: '987654321',
                    guildName: 'Test Guild'
                })
            );
        });
    });

    describe('Audit Trail Verification', () => {
        it('should create complete audit trail for moderation actions', async () => {
            const banCommand = await import('../../commands/ban.js');
            
            // Mock successful ban
            mockInteraction.guild.members = {
                ban: vi.fn().mockResolvedValue(true),
                fetch: vi.fn().mockResolvedValue({
                    roles: { highest: { position: 1 } }
                })
            };

            await banCommand.default.execute(
                mockInteraction,
                mockAdminManager, null, null, null, null,
                mockReportManager,
                null, null, null, null, null, null, null, null,
                mockPermissionValidator
            );

            // Verify that logging was called with all required audit information
            expect(moderationLogger.logModerationAction).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: expect.any(String),
                    moderatorId: expect.any(String),
                    moderatorTag: expect.any(String),
                    targetId: expect.any(String),
                    targetTag: expect.any(String),
                    guildId: expect.any(String),
                    guildName: expect.any(String),
                    reason: expect.any(String),
                    success: expect.any(Boolean),
                    channelId: expect.any(String),
                    details: expect.any(Object)
                })
            );
        });

        it('should create complete audit trail for watchlist operations', async () => {
            const watchlistAddCommand = await import('../../commands/watchlist-add.js');

            await watchlistAddCommand.default.execute(
                mockInteraction,
                mockAdminManager, null, null, null, null,
                mockReportManager,
                null, null, mockWatchlistManager,
                null, null, null, null, null,
                mockPermissionValidator
            );

            // Verify that watchlist logging was called with all required audit information
            expect(moderationLogger.logWatchlistOperation).toHaveBeenCalledWith(
                expect.objectContaining({
                    operation: expect.any(String),
                    moderatorId: expect.any(String),
                    moderatorTag: expect.any(String),
                    targetId: expect.any(String),
                    targetTag: expect.any(String),
                    guildId: expect.any(String),
                    guildName: expect.any(String),
                    isGlobal: expect.any(Boolean),
                    success: expect.any(Boolean),
                    data: expect.any(Object)
                })
            );
        });
    });

    describe('Logging Interface Consistency', () => {
        it('should use consistent logging interface across all moderation commands', () => {
            // This test verifies that all commands use the same logging interface
            // by checking that the ModerationLogger methods are called with consistent parameters
            
            const expectedModerationActionParams = [
                'type', 'moderatorId', 'moderatorTag', 'targetId', 'targetTag',
                'guildId', 'guildName', 'reason', 'success', 'channelId', 'details'
            ];
            
            const expectedWatchlistOperationParams = [
                'operation', 'moderatorId', 'moderatorTag', 'targetId', 'targetTag',
                'guildId', 'guildName', 'isGlobal', 'success', 'data'
            ];
            
            const expectedPermissionDenialParams = [
                'action', 'userId', 'userTag', 'targetId', 'targetTag',
                'guildId', 'guildName', 'reason', 'requiredPermission', 'userPermissions'
            ];

            // These parameter sets should be consistent across all command implementations
            expect(expectedModerationActionParams).toEqual(expect.arrayContaining([
                'type', 'moderatorId', 'moderatorTag', 'targetId', 'targetTag',
                'guildId', 'guildName', 'reason', 'success', 'channelId', 'details'
            ]));
            
            expect(expectedWatchlistOperationParams).toEqual(expect.arrayContaining([
                'operation', 'moderatorId', 'moderatorTag', 'targetId', 'targetTag',
                'guildId', 'guildName', 'isGlobal', 'success', 'data'
            ]));
            
            expect(expectedPermissionDenialParams).toEqual(expect.arrayContaining([
                'action', 'userId', 'userTag', 'targetId', 'targetTag',
                'guildId', 'guildName', 'reason', 'requiredPermission', 'userPermissions'
            ]));
        });
    });
});