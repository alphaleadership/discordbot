import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CommandHandler } from '../../utils/CommandHandler.js';
import { Collection } from 'discord.js';

describe('Watchlist Command Registration', () => {
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
                    logError: vi.fn(),
                    logWatchlistOperation: vi.fn(),
                    logPermissionDenial: vi.fn()
                }
            },
            banlistManager: { reload: vi.fn() },
            blockedWordsManager: { reload: vi.fn() },
            watchlistManager: { 
                reload: vi.fn(),
                addToWatchlist: vi.fn(),
                removeFromWatchlist: vi.fn(),
                getWatchlistEntry: vi.fn(),
                getGuildWatchlist: vi.fn(),
                addNote: vi.fn(),
                addToGlobalWatchlist: vi.fn(),
                removeFromGlobalWatchlist: vi.fn(),
                getGlobalWatchlist: vi.fn(),
                getGlobalWatchlistEntry: vi.fn()
            },
            telegramIntegration: {},
            funCommandsManager: { reload: vi.fn() },
            raidDetector: { reload: vi.fn() },
            doxDetector: { reload: vi.fn() },
            enhancedReloadSystem: { reload: vi.fn() },
            permissionValidator: {
                validateWatchlistPermission: vi.fn(),
                validateGlobalWatchlistPermission: vi.fn()
            }
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

    describe('Watchlist Command Detection', () => {
        it('should correctly identify all local watchlist commands', () => {
            const localWatchlistCommands = [
                'watchlist-add',
                'watchlist-remove', 
                'watchlist-list',
                'watchlist-info',
                'watchlist-note',
                'watchlist-status'
            ];

            localWatchlistCommands.forEach(cmd => {
                expect(commandHandler.isWatchlistCommand(cmd)).toBe(true);
            });
        });

        it('should correctly identify all global watchlist commands', () => {
            const globalWatchlistCommands = [
                'global-watchlist-add',
                'global-watchlist-remove',
                'global-watchlist-list',
                'global-watchlist-info'
            ];

            globalWatchlistCommands.forEach(cmd => {
                expect(commandHandler.isWatchlistCommand(cmd)).toBe(true);
            });
        });

        it('should not identify non-watchlist commands as watchlist commands', () => {
            const nonWatchlistCommands = [
                'ban', 'kick', 'timeout', 'clear', 'unban',
                'ping', 'joke', 'meme', 'trivia'
            ];

            nonWatchlistCommands.forEach(cmd => {
                expect(commandHandler.isWatchlistCommand(cmd)).toBe(false);
            });
        });
    });

    describe('Watchlist Command Validation', () => {
        beforeEach(() => {
            // Add all required watchlist commands
            const watchlistCommands = [
                'watchlist-add', 'watchlist-remove', 'watchlist-list', 
                'watchlist-info', 'watchlist-note',
                'global-watchlist-add', 'global-watchlist-remove', 
                'global-watchlist-list', 'global-watchlist-info'
            ];
            
            watchlistCommands.forEach(cmd => {
                mockClient.commands.set(cmd, { 
                    data: { 
                        name: cmd,
                        toJSON: () => ({ name: cmd, description: `${cmd} command` })
                    }
                });
            });
        });

        it('should validate that all required watchlist commands are present', () => {
            const validation = commandHandler.validateRequiredCommands();
            
            // Should still fail because moderation commands are missing
            expect(validation.success).toBe(false);
            
            // But watchlist commands should not be in missing lists
            expect(validation.missingWatchlist).toHaveLength(0);
            expect(validation.missingGlobalWatchlist).toHaveLength(0);
        });

        it('should detect missing watchlist commands', () => {
            // Remove some watchlist commands
            mockClient.commands.delete('watchlist-add');
            mockClient.commands.delete('global-watchlist-list');

            const validation = commandHandler.validateRequiredCommands();
            
            expect(validation.missingWatchlist).toContain('watchlist-add');
            expect(validation.missingGlobalWatchlist).toContain('global-watchlist-list');
        });
    });

    describe('Watchlist Command Execution', () => {
        let mockInteraction;

        beforeEach(() => {
            mockInteraction = {
                isCommand: () => true,
                commandName: 'watchlist-add',
                user: { id: '123', tag: 'TestUser#1234' },
                guild: { id: '456', name: 'Test Guild' },
                member: { permissions: { toArray: () => ['MANAGE_MESSAGES'] } },
                options: {
                    getUser: vi.fn().mockReturnValue({ id: '789', tag: 'Target#5678' }),
                    getString: vi.fn().mockReturnValue('Test reason')
                },
                replied: false,
                deferred: false,
                reply: vi.fn(),
                followUp: vi.fn()
            };

            // Setup permission validation mock
            mockManagers.permissionValidator.validateWatchlistPermission.mockReturnValue({
                success: true
            });

            // Setup watchlist manager mock
            mockManagers.watchlistManager.addToWatchlist.mockResolvedValue({
                success: true
            });
        });

        it('should execute watchlist commands with proper manager injection', async () => {
            const mockExecute = vi.fn();
            mockClient.commands.set('watchlist-add', { execute: mockExecute });

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
                mockManagers.permissionValidator
            );
        });

        it('should validate WatchlistManager is available for watchlist commands', async () => {
            commandHandler.watchlistManager = null; // Remove required manager
            const mockExecute = vi.fn();
            mockClient.commands.set('watchlist-add', { execute: mockExecute });

            await commandHandler.handleCommand(mockInteraction);

            expect(mockInteraction.reply).toHaveBeenCalledWith({
                content: '❌ Système de surveillance indisponible. Contactez un administrateur.',
                ephemeral: true
            });
        });

        it('should handle global watchlist commands', async () => {
            mockInteraction.commandName = 'global-watchlist-add';
            
            const mockExecute = vi.fn();
            mockClient.commands.set('global-watchlist-add', { execute: mockExecute });

            await commandHandler.handleCommand(mockInteraction);

            expect(mockExecute).toHaveBeenCalled();
        });

        it('should log watchlist command execution', async () => {
            const mockExecute = vi.fn();
            mockClient.commands.set('watchlist-add', { execute: mockExecute });

            // Capture console.log calls
            const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

            await commandHandler.handleCommand(mockInteraction);

            expect(consoleSpy).toHaveBeenCalledWith(
                expect.stringContaining('[INFO] Exécution de la commande watchlist-add par TestUser#1234 (123) sur Test Guild')
            );

            consoleSpy.mockRestore();
        });
    });

    describe('Command Statistics for Watchlist', () => {
        beforeEach(() => {
            // Add a mix of commands
            const commands = [
                { name: 'ban', type: 'moderation' },
                { name: 'kick', type: 'moderation' },
                { name: 'watchlist-add', type: 'watchlist' },
                { name: 'watchlist-list', type: 'watchlist' },
                { name: 'global-watchlist-add', type: 'watchlist' },
                { name: 'ping', type: 'other' },
                { name: 'joke', type: 'other' }
            ];

            commands.forEach(cmd => {
                mockClient.commands.set(cmd.name, { data: cmd });
            });
        });

        it('should correctly count watchlist commands in statistics', () => {
            const stats = commandHandler.getCommandStats();
            
            expect(stats.total).toBe(7);
            expect(stats.moderation).toBe(2);
            expect(stats.watchlist).toBe(3);
            expect(stats.other).toBe(2);
            
            expect(stats.watchlistCommands).toContain('watchlist-add');
            expect(stats.watchlistCommands).toContain('watchlist-list');
            expect(stats.watchlistCommands).toContain('global-watchlist-add');
        });
    });

    describe('Command Registration with Watchlist Commands', () => {
        it('should register watchlist commands successfully', async () => {
            // Add watchlist commands
            const watchlistCommands = [
                'watchlist-add', 'watchlist-remove', 'watchlist-list',
                'global-watchlist-add', 'global-watchlist-list'
            ];
            
            watchlistCommands.forEach(cmd => {
                mockClient.commands.set(cmd, { 
                    data: { 
                        name: cmd,
                        toJSON: () => ({ name: cmd, description: `${cmd} command` })
                    }
                });
            });

            const result = await commandHandler.registerCommands();
            
            expect(result.success).toBe(true);
            expect(result.registered).toBe(5);
            
            // Verify the commands were passed to Discord API
            const registeredCommands = mockClient.application.commands.set.mock.calls[0][0];
            const commandNames = registeredCommands.map(cmd => cmd.name);
            
            watchlistCommands.forEach(cmd => {
                expect(commandNames).toContain(cmd);
            });
        });

        it('should show watchlist command statistics during registration', async () => {
            // Add watchlist commands
            mockClient.commands.set('watchlist-add', { 
                data: { 
                    name: 'watchlist-add',
                    toJSON: () => ({ name: 'watchlist-add', description: 'Add to watchlist' })
                }
            });
            mockClient.commands.set('global-watchlist-list', { 
                data: { 
                    name: 'global-watchlist-list',
                    toJSON: () => ({ name: 'global-watchlist-list', description: 'List global watchlist' })
                }
            });

            // Capture console.log calls
            const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

            await commandHandler.registerCommands();

            expect(consoleSpy).toHaveBeenCalledWith(
                expect.stringContaining('Surveillance: 2 (watchlist-add, global-watchlist-list)')
            );

            consoleSpy.mockRestore();
        });
    });
});