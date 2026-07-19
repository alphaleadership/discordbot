import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CommandHandler } from '../../utils/CommandHandler.js';
import { Collection } from 'discord.js';

describe('CommandHandler', () => {
    let commandHandler;
    let mockClient;
    let mockManagers;

    beforeEach(() => {
        // Mock Discord client
        mockClient = {
            commands: new Collection(),
            application: {
                commands: {
                    set: vi.fn().mockResolvedValue(true),
                    fetch: vi.fn().mockResolvedValue(new Collection())
                }
            }
        };

        // Mock managers
        mockManagers = {
            adminManager: { reload: vi.fn() },
            warnManager: { reload: vi.fn() },
            guildConfig: { reload: vi.fn() },
            sharedConfig: {},
            backupToGitHub: {},
            reportManager: {
                reload: vi.fn(),
                moderationLogger: {
                    logError: vi.fn()
                }
            },
            banlistManager: { reload: vi.fn() },
            blockedWordsManager: { reload: vi.fn() },
            watchlistManager: { reload: vi.fn() },
            telegramIntegration: {},
            funCommandsManager: { reload: vi.fn() },
            raidDetector: { reload: vi.fn() },
            doxDetector: { reload: vi.fn() },
            enhancedReloadSystem: { reload: vi.fn() },
            permissionValidator: {}
        };

        commandHandler = new CommandHandler(
            mockClient,
            mockManagers.adminManager,
            mockManagers.warnManager,
            mockManagers.guildConfig,
            mockManagers.sharedConfig,
            mockManagers.backupToGitHub,
            mockManagers.reportManager,
            mockManagers.banlistManager,
            mockManagers.blockedWordsManager,
            mockManagers.watchlistManager,
            mockManagers.telegramIntegration,
            mockManagers.funCommandsManager,
            mockManagers.raidDetector,
            mockManagers.doxDetector,
            mockManagers.enhancedReloadSystem,
            mockManagers.permissionValidator
        );
    });

    describe('Command Type Detection', () => {
        it('should correctly identify moderation commands', () => {
            expect(commandHandler.isModerationCommand('ban')).toBe(true);
            expect(commandHandler.isModerationCommand('kick')).toBe(true);
            expect(commandHandler.isModerationCommand('timeout')).toBe(true);
            expect(commandHandler.isModerationCommand('clear')).toBe(true);
            expect(commandHandler.isModerationCommand('unban')).toBe(true);
            expect(commandHandler.isModerationCommand('warn')).toBe(true);
            expect(commandHandler.isModerationCommand('clearwarns')).toBe(true);

            expect(commandHandler.isModerationCommand('ping')).toBe(false);
            expect(commandHandler.isModerationCommand('watchlist-add')).toBe(false);
        });

        it('should correctly identify watchlist commands', () => {
            expect(commandHandler.isWatchlistCommand('watchlist-add')).toBe(true);
            expect(commandHandler.isWatchlistCommand('watchlist-remove')).toBe(true);
            expect(commandHandler.isWatchlistCommand('watchlist-list')).toBe(true);
            expect(commandHandler.isWatchlistCommand('watchlist-info')).toBe(true);
            expect(commandHandler.isWatchlistCommand('watchlist-note')).toBe(true);
            expect(commandHandler.isWatchlistCommand('global-watchlist-add')).toBe(true);
            expect(commandHandler.isWatchlistCommand('global-watchlist-remove')).toBe(true);
            expect(commandHandler.isWatchlistCommand('global-watchlist-list')).toBe(true);

            expect(commandHandler.isWatchlistCommand('ban')).toBe(false);
            expect(commandHandler.isWatchlistCommand('ping')).toBe(false);
        });
    });

    describe('Command Statistics', () => {
        beforeEach(() => {
            // Add mock commands to test statistics
            const mockCommands = [
                { name: 'ban' },
                { name: 'kick' },
                { name: 'watchlist-add' },
                { name: 'watchlist-list' },
                { name: 'ping' },
                { name: 'joke' }
            ];

            mockCommands.forEach(cmd => {
                mockClient.commands.set(cmd.name, { data: cmd });
            });
        });

        it('should calculate command statistics correctly', () => {
            const stats = commandHandler.getCommandStats();

            expect(stats.total).toBe(6);
            expect(stats.moderation).toBe(2);
            expect(stats.watchlist).toBe(2);
            expect(stats.other).toBe(2);
            expect(stats.moderationCommands).toContain('ban');
            expect(stats.moderationCommands).toContain('kick');
            expect(stats.watchlistCommands).toContain('watchlist-add');
            expect(stats.watchlistCommands).toContain('watchlist-list');
        });
    });

    describe('Command Validation', () => {
        it('should validate required commands correctly', () => {
            // Add some required commands
            const requiredCommands = ['ban', 'kick', 'watchlist-add', 'watchlist-list'];
            requiredCommands.forEach(cmd => {
                mockClient.commands.set(cmd, { data: { name: cmd } });
            });

            const validation = commandHandler.validateRequiredCommands();

            expect(validation.success).toBe(false); // Not all required commands are present
            expect(validation.loadedCommands).toBe(4);
            expect(validation.missingCommands.length).toBeGreaterThan(0);
        });

        it('should pass validation when all required commands are present', () => {
            // Add all required commands
            const allRequired = [
                'ban', 'kick', 'timeout', 'clear', 'unban', // moderation
                'watchlist-add', 'watchlist-remove', 'watchlist-list', 'watchlist-info', 'watchlist-note', // watchlist
                'global-watchlist-add', 'global-watchlist-remove', 'global-watchlist-list', 'global-watchlist-info' // global watchlist
            ];

            allRequired.forEach(cmd => {
                mockClient.commands.set(cmd, { data: { name: cmd } });
            });

            const validation = commandHandler.validateRequiredCommands();

            expect(validation.success).toBe(true);
            expect(validation.missingCommands).toHaveLength(0);
        });
    });

    describe('Command Registration', () => {
        it('should register commands successfully', async () => {
            // Add some commands
            mockClient.commands.set('ban', {
                data: {
                    name: 'ban',
                    toJSON: () => ({ name: 'ban', description: 'Ban a user' })
                }
            });

            const result = await commandHandler.registerCommands();

            expect(result.success).toBe(true);
            expect(result.registered).toBe(1);
            expect(mockClient.application.commands.set).toHaveBeenCalledWith([
                { name: 'ban', description: 'Ban a user' }
            ]);
        });

        it('should handle registration errors gracefully', async () => {
            mockClient.application.commands.set.mockRejectedValue(new Error('Registration failed'));

            const result = await commandHandler.registerCommands();

            expect(result.success).toBe(false);
            expect(result.error).toBe('Registration failed');
        });
    });

    describe('Command Execution', () => {
        let mockInteraction;

        beforeEach(() => {
            mockInteraction = {
                isCommand: () => true,
                commandName: 'ban',
                user: { id: '123', tag: 'TestUser#1234' },
                guild: { id: '456', name: 'Test Guild' },
                replied: false,
                deferred: false,
                reply: vi.fn(),
                followUp: vi.fn()
            };
        });

        it('should execute commands with proper manager injection', async () => {
            const mockExecute = vi.fn();
            mockClient.commands.set('ban', { execute: mockExecute });

            await commandHandler.handleCommand(mockInteraction);

            expect(mockExecute).toHaveBeenCalledWith(
                mockInteraction,
                mockManagers.adminManager,
                mockManagers.warnManager,
                mockManagers.guildConfig,
                mockManagers.sharedConfig,
                mockManagers.backupToGitHub,
                mockManagers.reportManager,
                mockManagers.banlistManager,
                mockManagers.blockedWordsManager,
                mockManagers.watchlistManager,
                mockManagers.telegramIntegration,
                mockManagers.funCommandsManager,
                mockManagers.raidDetector,
                mockManagers.doxDetector,
                mockManagers.enhancedReloadSystem,
                mockManagers.permissionValidator,
                undefined,
                undefined,
                undefined,
                undefined
            );
        });

        it('should handle missing commands gracefully', async () => {
            mockInteraction.commandName = 'nonexistent';

            await commandHandler.handleCommand(mockInteraction);

            expect(mockManagers.reportManager.moderationLogger.logError).toHaveBeenCalledWith(
                'command-not-found',
                expect.any(Error),
                expect.objectContaining({
                    commandName: 'nonexistent'
                })
            );
        });

        it('should validate required managers for moderation commands', async () => {
            commandHandler.permissionValidator = null; // Remove required manager
            const mockExecute = vi.fn();
            mockClient.commands.set('ban', { execute: mockExecute });

            await commandHandler.handleCommand(mockInteraction);

            expect(mockInteraction.reply).toHaveBeenCalledWith({
                content: '❌ Système de validation des permissions indisponible. Contactez un administrateur.',
                ephemeral: true
            });
        });

        it('should validate required managers for watchlist commands', async () => {
            mockInteraction.commandName = 'watchlist-add';
            commandHandler.watchlistManager = null; // Remove required manager
            const mockExecute = vi.fn();
            mockClient.commands.set('watchlist-add', { execute: mockExecute });

            await commandHandler.handleCommand(mockInteraction);

            expect(mockInteraction.reply).toHaveBeenCalledWith({
                content: '❌ Système de surveillance indisponible. Contactez un administrateur.',
                ephemeral: true
            });
        });
    });
});