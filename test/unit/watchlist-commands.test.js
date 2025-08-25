import { describe, it, expect, beforeEach, vi } from 'vitest';
import watchlistAddCommand from '../../commands/watchlist-add.js';
import watchlistRemoveCommand from '../../commands/watchlist-remove.js';
import watchlistListCommand from '../../commands/watchlist-list.js';
import watchlistInfoCommand from '../../commands/watchlist-info.js';
import watchlistNoteCommand from '../../commands/watchlist-note.js';

describe('Watchlist Commands', () => {
    let mockInteraction;
    let mockAdminManager;
    let mockPermissionValidator;
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
            displayAvatarURL: vi.fn(() => 'https://example.com/avatar.png')
        };

        // Mock member
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
            ownerId: '999888777666555444',
            members: {
                fetch: vi.fn()
            }
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
            isAdmin: vi.fn(() => false)
        };

        // Mock PermissionValidator
        mockPermissionValidator = {
            validateWatchlistPermission: vi.fn(() => ({ success: true }))
        };

        // Mock WatchlistManager
        mockWatchlistManager = {
            addToWatchlist: vi.fn(),
            removeFromWatchlist: vi.fn(),
            getWatchlistEntry: vi.fn(),
            getGuildWatchlist: vi.fn(),
            addNote: vi.fn()
        };
    });

    describe('watchlist-add command', () => {
        it('should successfully add user to watchlist with valid parameters', async () => {
            // Setup
            mockInteraction.options.getUser.mockReturnValue(mockUser);
            mockInteraction.options.getString.mockImplementation((name) => {
                if (name === 'raison') return 'Test surveillance reason';
                if (name === 'niveau') return 'alert';
                return null;
            });

            mockWatchlistManager.addToWatchlist.mockResolvedValue({
                success: true,
                entry: {
                    userId: mockUser.id,
                    reason: 'Test surveillance reason',
                    watchLevel: 'alert',
                    addedBy: mockMember.user.id,
                    addedAt: new Date().toISOString()
                }
            });

            // Execute
            await watchlistAddCommand.execute(
                mockInteraction,
                mockAdminManager,
                mockPermissionValidator,
                mockWatchlistManager
            );

            // Verify
            expect(mockPermissionValidator.validateWatchlistPermission).toHaveBeenCalledWith(mockMember);
            expect(mockWatchlistManager.addToWatchlist).toHaveBeenCalledWith(
                mockUser.id,
                'Test surveillance reason',
                mockMember.user.id,
                mockGuild.id,
                {
                    watchLevel: 'alert',
                    username: mockUser.username,
                    discriminator: mockUser.discriminator
                }
            );
            expect(mockInteraction.reply).toHaveBeenCalledWith({
                embeds: expect.arrayContaining([
                    expect.objectContaining({
                        data: expect.objectContaining({
                            title: '👁️ Utilisateur ajouté à la surveillance'
                        })
                    })
                ])
            });
        });

        it('should reject if user lacks permissions', async () => {
            // Setup
            mockPermissionValidator.validateWatchlistPermission.mockReturnValue({
                success: false,
                message: '❌ Permissions insuffisantes'
            });

            // Execute
            await watchlistAddCommand.execute(
                mockInteraction,
                mockAdminManager,
                mockPermissionValidator,
                mockWatchlistManager
            );

            // Verify
            expect(mockInteraction.reply).toHaveBeenCalledWith({
                content: '❌ Permissions insuffisantes',
                ephemeral: true
            });
            expect(mockWatchlistManager.addToWatchlist).not.toHaveBeenCalled();
        });

        it('should reject if reason is too short', async () => {
            // Setup
            mockInteraction.options.getUser.mockReturnValue(mockUser);
            mockInteraction.options.getString.mockImplementation((name) => {
                if (name === 'raison') return 'ab'; // Too short
                if (name === 'niveau') return 'observe';
                return null;
            });

            // Execute
            await watchlistAddCommand.execute(
                mockInteraction,
                mockAdminManager,
                mockPermissionValidator,
                mockWatchlistManager
            );

            // Verify
            expect(mockInteraction.reply).toHaveBeenCalledWith({
                content: '❌ La raison doit contenir au moins 3 caractères.',
                ephemeral: true
            });
            expect(mockWatchlistManager.addToWatchlist).not.toHaveBeenCalled();
        });

        it('should handle watchlist manager errors', async () => {
            // Setup
            mockInteraction.options.getUser.mockReturnValue(mockUser);
            mockInteraction.options.getString.mockImplementation((name) => {
                if (name === 'raison') return 'Valid reason';
                if (name === 'niveau') return 'observe';
                return null;
            });

            mockWatchlistManager.addToWatchlist.mockResolvedValue({
                success: false,
                error: 'User is already on the watchlist'
            });

            // Execute
            await watchlistAddCommand.execute(
                mockInteraction,
                mockAdminManager,
                mockPermissionValidator,
                mockWatchlistManager
            );

            // Verify
            expect(mockInteraction.reply).toHaveBeenCalledWith({
                content: '❌ User is already on the watchlist',
                ephemeral: true
            });
        });
    });

    describe('watchlist-remove command', () => {
        it('should successfully remove user from watchlist', async () => {
            // Setup
            mockInteraction.options.getUser.mockReturnValue(mockUser);
            
            const existingEntry = {
                userId: mockUser.id,
                reason: 'Original reason',
                watchLevel: 'alert',
                addedBy: '999888777666555444',
                addedAt: '2024-01-01T00:00:00.000Z',
                active: true,
                notes: [],
                incidents: []
            };

            mockWatchlistManager.getWatchlistEntry.mockReturnValue(existingEntry);
            mockWatchlistManager.removeFromWatchlist.mockResolvedValue({
                success: true,
                message: 'User removed from watchlist'
            });

            // Execute
            await watchlistRemoveCommand.execute(
                mockInteraction,
                mockAdminManager,
                mockPermissionValidator,
                mockWatchlistManager
            );

            // Verify
            expect(mockWatchlistManager.getWatchlistEntry).toHaveBeenCalledWith(mockUser.id, mockGuild.id);
            expect(mockWatchlistManager.removeFromWatchlist).toHaveBeenCalledWith(mockUser.id, mockGuild.id);
            expect(mockInteraction.reply).toHaveBeenCalledWith({
                embeds: expect.arrayContaining([
                    expect.objectContaining({
                        data: expect.objectContaining({
                            title: '✅ Utilisateur retiré de la surveillance'
                        })
                    })
                ])
            });
        });

        it('should handle user not on watchlist', async () => {
            // Setup
            mockInteraction.options.getUser.mockReturnValue(mockUser);
            mockWatchlistManager.getWatchlistEntry.mockReturnValue(null);

            // Execute
            await watchlistRemoveCommand.execute(
                mockInteraction,
                mockAdminManager,
                mockPermissionValidator,
                mockWatchlistManager
            );

            // Verify
            expect(mockInteraction.reply).toHaveBeenCalledWith({
                content: `❌ L'utilisateur ${mockUser.tag} n'est pas sur la liste de surveillance de ce serveur.`,
                ephemeral: true
            });
            expect(mockWatchlistManager.removeFromWatchlist).not.toHaveBeenCalled();
        });
    });

    describe('watchlist-list command', () => {
        it('should display watchlist with entries', async () => {
            // Setup
            mockInteraction.options.getInteger.mockReturnValue(1);
            
            const mockEntries = [
                {
                    userId: '123456789012345678',
                    username: 'user1',
                    discriminator: '1234',
                    reason: 'Test reason 1',
                    watchLevel: 'alert',
                    addedAt: '2024-01-01T00:00:00.000Z',
                    active: true,
                    notes: [],
                    incidents: []
                },
                {
                    userId: '987654321098765432',
                    username: 'user2',
                    discriminator: '5678',
                    reason: 'Test reason 2',
                    watchLevel: 'observe',
                    addedAt: '2024-01-02T00:00:00.000Z',
                    active: true,
                    notes: [{}],
                    incidents: []
                }
            ];

            mockWatchlistManager.getGuildWatchlist.mockReturnValue(mockEntries);

            // Execute
            await watchlistListCommand.execute(
                mockInteraction,
                mockAdminManager,
                mockPermissionValidator,
                mockWatchlistManager
            );

            // Verify
            expect(mockWatchlistManager.getGuildWatchlist).toHaveBeenCalledWith(mockGuild.id);
            expect(mockInteraction.reply).toHaveBeenCalledWith({
                embeds: expect.arrayContaining([
                    expect.objectContaining({
                        data: expect.objectContaining({
                            title: `👁️ Liste de surveillance - ${mockGuild.name}`
                        })
                    })
                ]),
                ephemeral: true
            });
        });

        it('should handle empty watchlist', async () => {
            // Setup
            mockInteraction.options.getInteger.mockReturnValue(1);
            mockWatchlistManager.getGuildWatchlist.mockReturnValue([]);

            // Execute
            await watchlistListCommand.execute(
                mockInteraction,
                mockAdminManager,
                mockPermissionValidator,
                mockWatchlistManager
            );

            // Verify
            expect(mockInteraction.reply).toHaveBeenCalledWith({
                embeds: expect.arrayContaining([
                    expect.objectContaining({
                        data: expect.objectContaining({
                            title: '👁️ Liste de surveillance - Vide'
                        })
                    })
                ]),
                ephemeral: true
            });
        });
    });

    describe('watchlist-info command', () => {
        it('should display detailed user information', async () => {
            // Setup
            mockInteraction.options.getUser.mockReturnValue(mockUser);
            
            const mockEntry = {
                userId: mockUser.id,
                username: mockUser.username,
                discriminator: mockUser.discriminator,
                reason: 'Detailed surveillance reason',
                watchLevel: 'action',
                addedBy: '999888777666555444',
                addedAt: '2024-01-01T00:00:00.000Z',
                lastSeen: '2024-01-15T12:00:00.000Z',
                active: true,
                notes: [
                    {
                        id: 'note1',
                        moderatorId: '999888777666555444',
                        note: 'First note',
                        timestamp: '2024-01-10T10:00:00.000Z'
                    }
                ],
                incidents: [
                    {
                        id: 'incident1',
                        type: 'suspicious_message',
                        description: 'Sent suspicious message',
                        timestamp: '2024-01-12T14:00:00.000Z'
                    }
                ]
            };

            mockWatchlistManager.getWatchlistEntry.mockReturnValue(mockEntry);
            mockGuild.members.fetch.mockRejectedValue(new Error('User not in guild'));

            // Execute
            await watchlistInfoCommand.execute(
                mockInteraction,
                mockAdminManager,
                mockPermissionValidator,
                mockWatchlistManager
            );

            // Verify
            expect(mockWatchlistManager.getWatchlistEntry).toHaveBeenCalledWith(mockUser.id, mockGuild.id);
            expect(mockInteraction.reply).toHaveBeenCalledWith({
                embeds: expect.arrayContaining([
                    expect.objectContaining({
                        data: expect.objectContaining({
                            title: `👁️ Informations de surveillance - ${mockUser.tag}`
                        })
                    })
                ]),
                ephemeral: true
            });
        });
    });

    describe('watchlist-note command', () => {
        it('should successfully add note to watched user', async () => {
            // Setup
            mockInteraction.options.getUser.mockReturnValue(mockUser);
            mockInteraction.options.getString.mockReturnValue('This is a test note');

            const mockEntry = {
                userId: mockUser.id,
                reason: 'Test reason',
                watchLevel: 'alert',
                active: true,
                notes: []
            };

            mockWatchlistManager.getWatchlistEntry.mockReturnValue(mockEntry);
            mockWatchlistManager.addNote.mockResolvedValue({
                success: true,
                note: {
                    id: 'note1',
                    moderatorId: mockMember.user.id,
                    note: 'This is a test note',
                    timestamp: new Date().toISOString()
                }
            });

            // Execute
            await watchlistNoteCommand.execute(
                mockInteraction,
                mockAdminManager,
                mockPermissionValidator,
                mockWatchlistManager
            );

            // Verify
            expect(mockWatchlistManager.addNote).toHaveBeenCalledWith(
                mockUser.id,
                mockGuild.id,
                'This is a test note',
                mockMember.user.id
            );
            expect(mockInteraction.reply).toHaveBeenCalledWith({
                embeds: expect.arrayContaining([
                    expect.objectContaining({
                        data: expect.objectContaining({
                            title: '📝 Note ajoutée avec succès'
                        })
                    })
                ])
            });
        });

        it('should reject if note is too short', async () => {
            // Setup
            mockInteraction.options.getUser.mockReturnValue(mockUser);
            mockInteraction.options.getString.mockReturnValue('ab'); // Too short

            // Execute
            await watchlistNoteCommand.execute(
                mockInteraction,
                mockAdminManager,
                mockPermissionValidator,
                mockWatchlistManager
            );

            // Verify
            expect(mockInteraction.reply).toHaveBeenCalledWith({
                content: '❌ La note doit contenir au moins 3 caractères.',
                ephemeral: true
            });
            expect(mockWatchlistManager.addNote).not.toHaveBeenCalled();
        });

        it('should reject if user is not on watchlist', async () => {
            // Setup
            mockInteraction.options.getUser.mockReturnValue(mockUser);
            mockInteraction.options.getString.mockReturnValue('Valid note');
            mockWatchlistManager.getWatchlistEntry.mockReturnValue(null);

            // Execute
            await watchlistNoteCommand.execute(
                mockInteraction,
                mockAdminManager,
                mockPermissionValidator,
                mockWatchlistManager
            );

            // Verify
            expect(mockInteraction.reply).toHaveBeenCalledWith({
                content: `❌ L'utilisateur ${mockUser.tag} n'est pas sur la liste de surveillance de ce serveur. Utilisez \`/watchlist-add\` pour l'ajouter d'abord.`,
                ephemeral: true
            });
            expect(mockWatchlistManager.addNote).not.toHaveBeenCalled();
        });
    });
});