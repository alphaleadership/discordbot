import { describe, it, expect, beforeEach, vi } from 'vitest';
import globalWatchlistAddCommand from '../../commands/global-watchlist-add.js';
import globalWatchlistRemoveCommand from '../../commands/global-watchlist-remove.js';
import globalWatchlistListCommand from '../../commands/global-watchlist-list.js';
import globalWatchlistInfoCommand from '../../commands/global-watchlist-info.js';

describe('Global Watchlist Commands', () => {
    let mockInteraction;
    let mockAdminManager;
    let mockWatchlistManager;
    let mockUser;
    let mockMember;
    let mockGuild;

    beforeEach(() => {
        // Mock user
        mockUser = {
            id: '123456789012345678',
            username: 'testuser',
            discriminator: '1234',
            tag: 'testuser#1234',
            bot: false,
            displayAvatarURL: vi.fn(() => 'https://example.com/avatar.png')
        };

        // Mock member (moderator)
        mockMember = {
            id: '987654321098765432',
            user: {
                id: '987654321098765432',
                username: 'moderator',
                tag: 'moderator#5678'
            },
            permissions: {
                has: vi.fn(() => true)
            },
            roles: {
                highest: { position: 10 }
            }
        };

        // Mock guild
        mockGuild = {
            id: '111222333444555666',
            name: 'Test Guild',
            ownerId: '999888777666555444'
        };

        // Mock interaction
        mockInteraction = {
            options: {
                getUser: vi.fn(),
                getString: vi.fn(),
                getInteger: vi.fn()
            },
            member: mockMember,
            user: mockMember.user,
            guild: mockGuild,
            reply: vi.fn(),
            followUp: vi.fn(),
            replied: false,
            deferred: false
        };

        // Mock AdminManager
        mockAdminManager = {
            isAdmin: vi.fn(() => true) // Default to admin for global commands
        };

        // Mock WatchlistManager
        mockWatchlistManager = {
            addToGlobalWatchlist: vi.fn(),
            removeFromGlobalWatchlist: vi.fn(),
            getGlobalWatchlistEntry: vi.fn(),
            getGlobalWatchlist: vi.fn(),
            isOnGlobalWatchlist: vi.fn(),
            watchlist: {} // Add watchlist property for global-watchlist-info command
        };
    });

    describe('global-watchlist-add command', () => {
        it('should successfully add user to global watchlist with valid parameters', async () => {
            // Setup
            mockInteraction.options.getUser.mockReturnValue(mockUser);
            mockInteraction.options.getString.mockImplementation((name) => {
                if (name === 'raison') return 'Global surveillance reason';
                if (name === 'niveau') return 'alert';
                return null;
            });

            // Ensure target user is not an admin
            mockAdminManager.isAdmin.mockImplementation((userId) => {
                if (userId === mockMember.user.id) return true; // Moderator is admin
                if (userId === mockUser.id) return false; // Target user is not admin
                return false;
            });

            mockWatchlistManager.addToGlobalWatchlist.mockReturnValue({
                success: true,
                entry: {
                    userId: mockUser.id,
                    reason: 'Global surveillance reason',
                    watchLevel: 'alert',
                    addedBy: mockMember.user.id,
                    addedAt: new Date().toISOString(),
                    guildId: 'GLOBAL'
                }
            });

            // Execute
            await globalWatchlistAddCommand.execute(
                mockInteraction,
                mockAdminManager,
                null, null, null, null, null, null, null, null,
                mockWatchlistManager
            );

            // Verify
            expect(mockAdminManager.isAdmin).toHaveBeenCalledWith(mockMember.user.id);
            expect(mockWatchlistManager.addToGlobalWatchlist).toHaveBeenCalledWith(
                mockUser.id,
                'Global surveillance reason',
                mockMember.user.id,
                {
                    watchLevel: 'alert',
                    username: mockUser.username,
                    discriminator: mockUser.discriminator
                }
            );
            expect(mockInteraction.reply).toHaveBeenCalledWith({
                content: expect.stringContaining('✅'),
                ephemeral: false
            });
        });

        it('should reject if user is not a bot admin', async () => {
            // Setup
            mockAdminManager.isAdmin.mockReturnValue(false);

            // Execute
            await globalWatchlistAddCommand.execute(
                mockInteraction,
                mockAdminManager,
                null, null, null, null, null, null, null, null,
                mockWatchlistManager
            );

            // Verify
            expect(mockInteraction.reply).toHaveBeenCalledWith({
                content: '❌ Seuls les administrateurs du bot peuvent utiliser la liste de surveillance globale.',
                ephemeral: true
            });
            expect(mockWatchlistManager.addToGlobalWatchlist).not.toHaveBeenCalled();
        });

        it('should reject if trying to add a bot admin', async () => {
            // Setup
            mockInteraction.options.getUser.mockReturnValue(mockUser);
            mockInteraction.options.getString.mockImplementation((name) => {
                if (name === 'raison') return 'Test reason';
                if (name === 'niveau') return 'alert';
                return null;
            });

            // Mock the target user as a bot admin
            mockAdminManager.isAdmin.mockImplementation((userId) => {
                if (userId === mockMember.user.id) return true; // Moderator is admin
                if (userId === mockUser.id) return true; // Target user is also admin
                return false;
            });

            // Execute
            await globalWatchlistAddCommand.execute(
                mockInteraction,
                mockAdminManager,
                null, null, null, null, null, null, null, null,
                mockWatchlistManager
            );

            // Verify
            expect(mockInteraction.reply).toHaveBeenCalledWith({
                content: '❌ Vous ne pouvez pas ajouter un administrateur du bot à la liste de surveillance globale.',
                ephemeral: true
            });
            expect(mockWatchlistManager.addToGlobalWatchlist).not.toHaveBeenCalled();
        });

        it('should reject if trying to add self', async () => {
            // Setup
            const selfUser = { ...mockUser, id: mockMember.user.id };
            mockInteraction.options.getUser.mockReturnValue(selfUser);
            mockInteraction.options.getString.mockImplementation((name) => {
                if (name === 'raison') return 'Test reason';
                if (name === 'niveau') return 'alert';
                return null;
            });

            // Mock that the self user is also an admin (which is why it gets caught by admin check first)
            mockAdminManager.isAdmin.mockImplementation((userId) => {
                return userId === mockMember.user.id; // Both moderator and target are the same admin
            });

            // Execute
            await globalWatchlistAddCommand.execute(
                mockInteraction,
                mockAdminManager,
                null, null, null, null, null, null, null, null,
                mockWatchlistManager
            );

            // Verify - should be caught by admin check since self is admin
            expect(mockInteraction.reply).toHaveBeenCalledWith({
                content: '❌ Vous ne pouvez pas ajouter un administrateur du bot à la liste de surveillance globale.',
                ephemeral: true
            });
            expect(mockWatchlistManager.addToGlobalWatchlist).not.toHaveBeenCalled();
        });

        it('should reject if trying to add a bot', async () => {
            // Setup
            const botUser = { ...mockUser, bot: true };
            mockInteraction.options.getUser.mockReturnValue(botUser);
            mockInteraction.options.getString.mockImplementation((name) => {
                if (name === 'raison') return 'Test reason';
                if (name === 'niveau') return 'alert';
                return null;
            });

            // Make sure the bot user is not an admin (so it doesn't get caught by admin check first)
            mockAdminManager.isAdmin.mockImplementation((userId) => {
                if (userId === mockMember.user.id) return true; // Moderator is admin
                if (userId === botUser.id) return false; // Bot is not admin
                return false;
            });

            // Execute
            await globalWatchlistAddCommand.execute(
                mockInteraction,
                mockAdminManager,
                null, null, null, null, null, null, null, null,
                mockWatchlistManager
            );

            // Verify
            expect(mockInteraction.reply).toHaveBeenCalledWith({
                content: '❌ Vous ne pouvez pas ajouter un bot à la liste de surveillance globale.',
                ephemeral: true
            });
            expect(mockWatchlistManager.addToGlobalWatchlist).not.toHaveBeenCalled();
        });

        it('should use default watch level if not specified', async () => {
            // Setup
            mockInteraction.options.getUser.mockReturnValue(mockUser);
            mockInteraction.options.getString.mockImplementation((name) => {
                if (name === 'raison') return 'Test reason';
                if (name === 'niveau') return null; // No level specified
                return null;
            });

            // Ensure target user is not an admin
            mockAdminManager.isAdmin.mockImplementation((userId) => {
                if (userId === mockMember.user.id) return true; // Moderator is admin
                if (userId === mockUser.id) return false; // Target user is not admin
                return false;
            });

            mockWatchlistManager.addToGlobalWatchlist.mockReturnValue({
                success: true,
                entry: { userId: mockUser.id }
            });

            // Execute
            await globalWatchlistAddCommand.execute(
                mockInteraction,
                mockAdminManager,
                null, null, null, null, null, null, null, null,
                mockWatchlistManager
            );

            // Verify - should use 'alert' as default
            expect(mockWatchlistManager.addToGlobalWatchlist).toHaveBeenCalledWith(
                mockUser.id,
                'Test reason',
                mockMember.user.id,
                {
                    watchLevel: 'alert',
                    username: mockUser.username,
                    discriminator: mockUser.discriminator
                }
            );
        });

        it('should handle watchlist manager errors', async () => {
            // Setup
            mockInteraction.options.getUser.mockReturnValue(mockUser);
            mockInteraction.options.getString.mockImplementation((name) => {
                if (name === 'raison') return 'Test reason';
                if (name === 'niveau') return 'alert';
                return null;
            });

            // Ensure target user is not an admin
            mockAdminManager.isAdmin.mockImplementation((userId) => {
                if (userId === mockMember.user.id) return true; // Moderator is admin
                if (userId === mockUser.id) return false; // Target user is not admin
                return false;
            });

            mockWatchlistManager.addToGlobalWatchlist.mockReturnValue({
                success: false,
                error: 'User is already on global watchlist'
            });

            // Execute
            await globalWatchlistAddCommand.execute(
                mockInteraction,
                mockAdminManager,
                null, null, null, null, null, null, null, null,
                mockWatchlistManager
            );

            // Verify
            expect(mockInteraction.reply).toHaveBeenCalledWith({
                content: '❌ User is already on global watchlist',
                ephemeral: true
            });
        });

        it('should handle unexpected errors', async () => {
            // Setup
            mockInteraction.options.getUser.mockReturnValue(mockUser);
            mockInteraction.options.getString.mockImplementation((name) => {
                if (name === 'raison') return 'Test reason';
                if (name === 'niveau') return 'alert';
                return null;
            });

            // Ensure target user is not an admin
            mockAdminManager.isAdmin.mockImplementation((userId) => {
                if (userId === mockMember.user.id) return true; // Moderator is admin
                if (userId === mockUser.id) return false; // Target user is not admin
                return false;
            });

            mockWatchlistManager.addToGlobalWatchlist.mockImplementation(() => {
                throw new Error('Database error');
            });

            // Execute
            await globalWatchlistAddCommand.execute(
                mockInteraction,
                mockAdminManager,
                null, null, null, null, null, null, null, null,
                mockWatchlistManager
            );

            // Verify
            expect(mockInteraction.reply).toHaveBeenCalledWith({
                content: '❌ Une erreur est survenue lors de l\'ajout à la liste de surveillance globale.',
                ephemeral: true
            });
        });
    });

    describe('global-watchlist-remove command', () => {
        it('should successfully remove user from global watchlist', async () => {
            // Setup
            mockInteraction.options.getUser.mockReturnValue(mockUser);
            mockWatchlistManager.isOnGlobalWatchlist.mockReturnValue(true);
            mockWatchlistManager.removeFromGlobalWatchlist.mockReturnValue({
                success: true,
                message: 'User removed from global watchlist'
            });

            // Execute
            await globalWatchlistRemoveCommand.execute(
                mockInteraction,
                mockAdminManager,
                null, null, null, null, null, null, null, null,
                mockWatchlistManager
            );

            // Verify
            expect(mockAdminManager.isAdmin).toHaveBeenCalledWith(mockMember.user.id);
            expect(mockWatchlistManager.isOnGlobalWatchlist).toHaveBeenCalledWith(mockUser.id);
            expect(mockWatchlistManager.removeFromGlobalWatchlist).toHaveBeenCalledWith(mockUser.id);
            expect(mockInteraction.reply).toHaveBeenCalledWith({
                content: expect.stringContaining('✅'),
                ephemeral: false
            });
        });

        it('should reject if user is not a bot admin', async () => {
            // Setup
            mockAdminManager.isAdmin.mockReturnValue(false);

            // Execute
            await globalWatchlistRemoveCommand.execute(
                mockInteraction,
                mockAdminManager,
                null, null, null, null, null, null, null, null,
                mockWatchlistManager
            );

            // Verify
            expect(mockInteraction.reply).toHaveBeenCalledWith({
                content: '❌ Seuls les administrateurs du bot peuvent utiliser la liste de surveillance globale.',
                ephemeral: true
            });
            expect(mockWatchlistManager.removeFromGlobalWatchlist).not.toHaveBeenCalled();
        });

        it('should handle user not on global watchlist', async () => {
            // Setup
            mockInteraction.options.getUser.mockReturnValue(mockUser);
            mockWatchlistManager.isOnGlobalWatchlist.mockReturnValue(false);

            // Execute
            await globalWatchlistRemoveCommand.execute(
                mockInteraction,
                mockAdminManager,
                null, null, null, null, null, null, null, null,
                mockWatchlistManager
            );

            // Verify
            expect(mockInteraction.reply).toHaveBeenCalledWith({
                content: `❌ ${mockUser} n'est pas dans la liste de surveillance globale.`,
                ephemeral: true
            });
            expect(mockWatchlistManager.removeFromGlobalWatchlist).not.toHaveBeenCalled();
        });

        it('should handle watchlist manager errors', async () => {
            // Setup
            mockInteraction.options.getUser.mockReturnValue(mockUser);
            mockWatchlistManager.isOnGlobalWatchlist.mockReturnValue(true);
            mockWatchlistManager.removeFromGlobalWatchlist.mockReturnValue({
                success: false,
                error: 'Database error'
            });

            // Execute
            await globalWatchlistRemoveCommand.execute(
                mockInteraction,
                mockAdminManager,
                null, null, null, null, null, null, null, null,
                mockWatchlistManager
            );

            // Verify
            expect(mockInteraction.reply).toHaveBeenCalledWith({
                content: '❌ Database error',
                ephemeral: true
            });
        });

        it('should handle unexpected errors', async () => {
            // Setup
            mockInteraction.options.getUser.mockReturnValue(mockUser);
            mockWatchlistManager.isOnGlobalWatchlist.mockRejectedValue(new Error('Connection error'));

            // Execute
            await globalWatchlistRemoveCommand.execute(
                mockInteraction,
                mockAdminManager,
                null, null, null, null, null, null, null, null,
                mockWatchlistManager
            );

            // Verify
            expect(mockInteraction.reply).toHaveBeenCalledWith({
                content: '❌ Une erreur est survenue lors de la suppression de la liste de surveillance globale.',
                ephemeral: true
            });
        });
    });

    describe('global-watchlist-list command', () => {
        it('should display global watchlist with entries', async () => {
            // Setup
            mockInteraction.options.getInteger.mockReturnValue(1);
            
            const mockEntries = [
                {
                    userId: '123456789012345678',
                    username: 'user1',
                    discriminator: '1234',
                    reason: 'Global surveillance reason 1',
                    watchLevel: 'alert',
                    addedAt: '2024-01-01T00:00:00.000Z',
                    lastSeen: '2024-01-15T12:00:00.000Z',
                    active: true,
                    notes: [],
                    incidents: [
                        { timestamp: new Date().toISOString() }
                    ]
                },
                {
                    userId: '987654321098765432',
                    username: 'user2',
                    discriminator: '5678',
                    reason: 'Global surveillance reason 2',
                    watchLevel: 'action',
                    addedAt: '2024-01-02T00:00:00.000Z',
                    active: true,
                    notes: [],
                    incidents: []
                }
            ];

            mockWatchlistManager.getGlobalWatchlist.mockReturnValue(mockEntries);

            // Execute
            await globalWatchlistListCommand.execute(
                mockInteraction,
                mockAdminManager,
                null, null, null, null, null, null, null, null,
                mockWatchlistManager
            );

            // Verify
            expect(mockAdminManager.isAdmin).toHaveBeenCalledWith(mockMember.user.id);
            expect(mockWatchlistManager.getGlobalWatchlist).toHaveBeenCalled();
            expect(mockInteraction.reply).toHaveBeenCalledWith({
                embeds: expect.arrayContaining([
                    expect.objectContaining({
                        data: expect.objectContaining({
                            title: '🌍 Liste de Surveillance GLOBALE'
                        })
                    })
                ]),
                ephemeral: true
            });
        });

        it('should reject if user is not a bot admin', async () => {
            // Setup
            mockAdminManager.isAdmin.mockReturnValue(false);

            // Execute
            await globalWatchlistListCommand.execute(
                mockInteraction,
                mockAdminManager,
                null, null, null, null, null, null, null, null,
                mockWatchlistManager
            );

            // Verify
            expect(mockInteraction.reply).toHaveBeenCalledWith({
                content: '❌ Seuls les administrateurs du bot peuvent consulter la liste de surveillance globale.',
                ephemeral: true
            });
            expect(mockWatchlistManager.getGlobalWatchlist).not.toHaveBeenCalled();
        });

        it('should handle empty global watchlist', async () => {
            // Setup
            mockInteraction.options.getInteger.mockReturnValue(1);
            mockWatchlistManager.getGlobalWatchlist.mockReturnValue([]);

            // Execute
            await globalWatchlistListCommand.execute(
                mockInteraction,
                mockAdminManager,
                null, null, null, null, null, null, null, null,
                mockWatchlistManager
            );

            // Verify
            expect(mockInteraction.reply).toHaveBeenCalledWith({
                content: 'ℹ️ La liste de surveillance globale est vide.',
                ephemeral: true
            });
        });

        it('should handle pagination correctly', async () => {
            // Setup - Create 15 entries to test pagination
            const mockEntries = Array.from({ length: 15 }, (_, i) => ({
                userId: `12345678901234567${i}`,
                username: `user${i}`,
                discriminator: '1234',
                reason: `Reason ${i}`,
                watchLevel: 'alert',
                addedAt: '2024-01-01T00:00:00.000Z',
                active: true,
                notes: [],
                incidents: []
            }));

            mockInteraction.options.getInteger.mockReturnValue(2); // Request page 2
            mockWatchlistManager.getGlobalWatchlist.mockReturnValue(mockEntries);

            // Execute
            await globalWatchlistListCommand.execute(
                mockInteraction,
                mockAdminManager,
                null, null, null, null, null, null, null, null,
                mockWatchlistManager
            );

            // Verify
            expect(mockInteraction.reply).toHaveBeenCalledWith({
                embeds: expect.arrayContaining([
                    expect.objectContaining({
                        data: expect.objectContaining({
                            description: expect.stringContaining('Page 2/2')
                        })
                    })
                ]),
                ephemeral: true
            });
        });

        it('should handle invalid page number', async () => {
            // Setup
            const mockEntries = [
                {
                    userId: '123456789012345678',
                    username: 'user1',
                    discriminator: '1234',
                    reason: 'Test reason',
                    watchLevel: 'alert',
                    addedAt: '2024-01-01T00:00:00.000Z',
                    active: true,
                    notes: [],
                    incidents: []
                }
            ];

            mockInteraction.options.getInteger.mockReturnValue(5); // Page 5 when only 1 page exists
            mockWatchlistManager.getGlobalWatchlist.mockReturnValue(mockEntries);

            // Execute
            await globalWatchlistListCommand.execute(
                mockInteraction,
                mockAdminManager,
                null, null, null, null, null, null, null, null,
                mockWatchlistManager
            );

            // Verify
            expect(mockInteraction.reply).toHaveBeenCalledWith({
                content: '❌ Page 5 n\'existe pas. Il y a 1 page(s) au total.',
                ephemeral: true
            });
        });

        it('should handle unexpected errors', async () => {
            // Setup
            mockInteraction.options.getInteger.mockReturnValue(1);
            mockWatchlistManager.getGlobalWatchlist.mockImplementation(() => {
                throw new Error('Database connection failed');
            });

            // Execute
            await globalWatchlistListCommand.execute(
                mockInteraction,
                mockAdminManager,
                null, null, null, null, null, null, null, null,
                mockWatchlistManager
            );

            // Verify
            expect(mockInteraction.reply).toHaveBeenCalledWith({
                content: '❌ Une erreur est survenue lors de l\'affichage de la liste de surveillance globale.',
                ephemeral: true
            });
        });
    });

    describe('global-watchlist-info command', () => {
        it('should display detailed global watchlist information', async () => {
            // Setup
            mockInteraction.options.getUser.mockReturnValue(mockUser);
            
            const mockGlobalEntry = {
                userId: mockUser.id,
                username: mockUser.username,
                discriminator: mockUser.discriminator,
                reason: 'Global surveillance reason',
                watchLevel: 'alert',
                addedBy: '999888777666555444',
                addedAt: '2024-01-01T00:00:00.000Z',
                lastSeen: '2024-01-15T12:00:00.000Z',
                active: true,
                notes: [
                    {
                        id: 'note1',
                        moderatorId: '999888777666555444',
                        note: 'Global surveillance note',
                        timestamp: '2024-01-10T10:00:00.000Z'
                    }
                ],
                incidents: [
                    {
                        id: 'incident1',
                        type: 'suspicious_activity',
                        description: 'Suspicious behavior detected',
                        timestamp: '2024-01-12T14:00:00.000Z'
                    }
                ]
            };

            mockWatchlistManager.getGlobalWatchlistEntry.mockReturnValue(mockGlobalEntry);
            mockWatchlistManager.watchlist = {}; // No local watchlist entries

            // Execute
            await globalWatchlistInfoCommand.execute(
                mockInteraction,
                mockAdminManager,
                null, null, null, null, null, null, null, null,
                mockWatchlistManager
            );

            // Verify
            expect(mockAdminManager.isAdmin).toHaveBeenCalledWith(mockMember.user.id);
            expect(mockWatchlistManager.getGlobalWatchlistEntry).toHaveBeenCalledWith(mockUser.id);
            expect(mockInteraction.reply).toHaveBeenCalledWith({
                embeds: expect.arrayContaining([
                    expect.objectContaining({
                        data: expect.objectContaining({
                            title: '🌍 Détails de Surveillance GLOBALE'
                        })
                    })
                ]),
                ephemeral: true
            });
        });

        it('should reject if user is not a bot admin', async () => {
            // Setup
            mockAdminManager.isAdmin.mockReturnValue(false);

            // Execute
            await globalWatchlistInfoCommand.execute(
                mockInteraction,
                mockAdminManager,
                null, null, null, null, null, null, null, null,
                mockWatchlistManager
            );

            // Verify
            expect(mockInteraction.reply).toHaveBeenCalledWith({
                content: '❌ Seuls les administrateurs du bot peuvent consulter la liste de surveillance globale.',
                ephemeral: true
            });
            expect(mockWatchlistManager.getGlobalWatchlistEntry).not.toHaveBeenCalled();
        });

        it('should handle user not on global watchlist', async () => {
            // Setup
            mockInteraction.options.getUser.mockReturnValue(mockUser);
            mockWatchlistManager.getGlobalWatchlistEntry.mockReturnValue(null);

            // Execute
            await globalWatchlistInfoCommand.execute(
                mockInteraction,
                mockAdminManager,
                null, null, null, null, null, null, null, null,
                mockWatchlistManager
            );

            // Verify
            expect(mockInteraction.reply).toHaveBeenCalledWith({
                content: `❌ ${mockUser} n'est pas dans la liste de surveillance globale.`,
                ephemeral: true
            });
        });

        it('should display information with local watchlists', async () => {
            // Setup
            mockInteraction.options.getUser.mockReturnValue(mockUser);
            
            const mockGlobalEntry = {
                userId: mockUser.id,
                username: mockUser.username,
                discriminator: mockUser.discriminator,
                reason: 'Global surveillance reason',
                watchLevel: 'action',
                addedBy: '999888777666555444',
                addedAt: '2024-01-01T00:00:00.000Z',
                active: true,
                notes: [],
                incidents: []
            };

            // Mock local watchlist entries
            const mockLocalEntry = {
                userId: mockUser.id,
                guildId: '111222333444555666',
                watchLevel: 'observe',
                active: true
            };

            mockWatchlistManager.getGlobalWatchlistEntry.mockReturnValue(mockGlobalEntry);
            mockWatchlistManager.watchlist = {
                'local_entry_1': mockLocalEntry
            };

            // Execute
            await globalWatchlistInfoCommand.execute(
                mockInteraction,
                mockAdminManager,
                null, null, null, null, null, null, null, null,
                mockWatchlistManager
            );

            // Verify
            expect(mockInteraction.reply).toHaveBeenCalledWith({
                embeds: expect.arrayContaining([
                    expect.objectContaining({
                        data: expect.objectContaining({
                            title: '🌍 Détails de Surveillance GLOBALE'
                        })
                    })
                ]),
                ephemeral: true
            });
        });

        it('should handle unexpected errors', async () => {
            // Setup
            mockInteraction.options.getUser.mockReturnValue(mockUser);
            mockWatchlistManager.getGlobalWatchlistEntry.mockImplementation(() => {
                throw new Error('Database connection failed');
            });

            // Execute
            await globalWatchlistInfoCommand.execute(
                mockInteraction,
                mockAdminManager,
                null, null, null, null, null, null, null, null,
                mockWatchlistManager
            );

            // Verify
            expect(mockInteraction.reply).toHaveBeenCalledWith({
                content: '❌ Une erreur est survenue lors de l\'affichage des détails de surveillance globale.',
                ephemeral: true
            });
        });
    });
});