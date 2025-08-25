import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import unbanCommand from '../../commands/unban.js';

describe('Unban Command', () => {
    let mockInteraction;
    let mockAdminManager;
    let mockPermissionValidator;
    let mockGuild;
    let mockBannedUser;
    let mockUser;
    let mockClient;

    beforeEach(() => {
        // Mock banned user
        mockBannedUser = {
            user: {
                id: '123456789012345678',
                tag: 'BannedUser#1234'
            },
            reason: 'Original ban reason'
        };

        // Mock user for DM
        mockUser = {
            id: '123456789012345678',
            tag: 'BannedUser#1234',
            send: vi.fn().mockResolvedValue(true)
        };

        // Mock client
        mockClient = {
            users: {
                fetch: vi.fn().mockResolvedValue(mockUser)
            }
        };

        // Mock guild
        mockGuild = {
            name: 'Test Guild',
            bans: {
                fetch: vi.fn().mockResolvedValue(new Map([
                    ['123456789012345678', mockBannedUser]
                ]))
            },
            members: {
                unban: vi.fn().mockResolvedValue(true)
            }
        };

        // Mock interaction
        mockInteraction = {
            options: {
                getString: vi.fn((key) => {
                    if (key === 'utilisateur-id') return '123456789012345678';
                    if (key === 'raison') return 'Test unban reason';
                    return null;
                })
            },
            guild: mockGuild,
            client: mockClient,
            member: {
                id: 'moderator123',
                permissions: { has: vi.fn().mockReturnValue(true) }
            },
            user: {
                id: 'moderator123',
                tag: 'Moderator#5678'
            },
            reply: vi.fn().mockResolvedValue(true),
            followUp: vi.fn().mockResolvedValue(true),
            replied: false,
            deferred: false
        };

        // Mock AdminManager
        mockAdminManager = {
            isAdmin: vi.fn().mockReturnValue(false)
        };

        // Mock PermissionValidator
        mockPermissionValidator = {
            validateBanPermission: vi.fn().mockReturnValue({
                success: true,
                reason: 'permission_granted'
            })
        };
    });

    describe('Command Structure', () => {
        it('should have correct command data', () => {
            expect(unbanCommand.data).toBeInstanceOf(SlashCommandBuilder);
            expect(unbanCommand.data.name).toBe('unban');
            expect(unbanCommand.data.description).toBe('Débannir un utilisateur du serveur');
        });

        it('should have execute function', () => {
            expect(typeof unbanCommand.execute).toBe('function');
        });
    });

    describe('Input Validation', () => {
        it('should validate Discord ID format', async () => {
            mockInteraction.options.getString.mockImplementation((key) => {
                if (key === 'utilisateur-id') return 'invalid-id';
                if (key === 'raison') return 'Test reason';
                return null;
            });

            await unbanCommand.execute(mockInteraction, mockAdminManager, mockPermissionValidator);

            expect(mockInteraction.reply).toHaveBeenCalledWith({
                content: '❌ Format d\'ID utilisateur invalide. Les IDs Discord contiennent 17-19 chiffres.',
                ephemeral: true
            });
        });

        it('should accept valid Discord ID formats', async () => {
            // Test 17-digit ID
            mockInteraction.options.getString.mockImplementation((key) => {
                if (key === 'utilisateur-id') return '12345678901234567';
                if (key === 'raison') return 'Test reason';
                return null;
            });

            mockGuild.bans.fetch.mockResolvedValue(new Map([
                ['12345678901234567', mockBannedUser]
            ]));

            await unbanCommand.execute(mockInteraction, mockAdminManager, mockPermissionValidator);

            expect(mockGuild.members.unban).toHaveBeenCalled();
        });
    });

    describe('Permission Validation', () => {
        it('should validate ban permissions before unbanning', async () => {
            await unbanCommand.execute(mockInteraction, mockAdminManager, mockPermissionValidator);

            expect(mockPermissionValidator.validateBanPermission).toHaveBeenCalledWith(
                mockInteraction.member,
                { id: '123456789012345678' }
            );
        });

        it('should deny unban when permission validation fails', async () => {
            mockPermissionValidator.validateBanPermission.mockReturnValue({
                success: false,
                message: '❌ Permission denied'
            });

            await unbanCommand.execute(mockInteraction, mockAdminManager, mockPermissionValidator);

            expect(mockInteraction.reply).toHaveBeenCalledWith({
                content: '❌ Permission denied',
                ephemeral: true
            });
            expect(mockGuild.members.unban).not.toHaveBeenCalled();
        });
    });

    describe('Ban Status Checking', () => {
        it('should check if user is actually banned', async () => {
            await unbanCommand.execute(mockInteraction, mockAdminManager, mockPermissionValidator);

            expect(mockGuild.bans.fetch).toHaveBeenCalled();
        });

        it('should handle user not banned', async () => {
            mockGuild.bans.fetch.mockResolvedValue(new Map()); // Empty map = no bans

            await unbanCommand.execute(mockInteraction, mockAdminManager, mockPermissionValidator);

            expect(mockInteraction.reply).toHaveBeenCalledWith({
                content: '❌ Cet utilisateur n\'est pas banni sur ce serveur.',
                ephemeral: true
            });
            expect(mockGuild.members.unban).not.toHaveBeenCalled();
        });

        it('should handle error fetching bans', async () => {
            mockGuild.bans.fetch.mockRejectedValue(new Error('Fetch error'));

            await unbanCommand.execute(mockInteraction, mockAdminManager, mockPermissionValidator);

            expect(mockInteraction.reply).toHaveBeenCalledWith({
                content: '❌ Impossible de vérifier les bannissements du serveur.',
                ephemeral: true
            });
        });
    });

    describe('Unban Execution', () => {
        it('should successfully unban user with reason', async () => {
            await unbanCommand.execute(mockInteraction, mockAdminManager, mockPermissionValidator);

            expect(mockGuild.members.unban).toHaveBeenCalledWith(
                '123456789012345678',
                'Test unban reason'
            );
            expect(mockInteraction.reply).toHaveBeenCalledWith({
                embeds: expect.arrayContaining([
                    expect.objectContaining({
                        data: expect.objectContaining({
                            title: '✅ Débannissement réussi'
                        })
                    })
                ])
            });
        });

        it('should use default reason when none provided', async () => {
            mockInteraction.options.getString.mockImplementation((key) => {
                if (key === 'utilisateur-id') return '123456789012345678';
                if (key === 'raison') return null;
                return null;
            });

            await unbanCommand.execute(mockInteraction, mockAdminManager, mockPermissionValidator);

            expect(mockGuild.members.unban).toHaveBeenCalledWith(
                '123456789012345678',
                'Aucune raison spécifiée'
            );
        });

        it('should display user tag when available', async () => {
            await unbanCommand.execute(mockInteraction, mockAdminManager, mockPermissionValidator);

            expect(mockInteraction.reply).toHaveBeenCalledWith({
                embeds: expect.arrayContaining([
                    expect.objectContaining({
                        data: expect.objectContaining({
                            fields: expect.arrayContaining([
                                expect.objectContaining({
                                    name: 'Utilisateur',
                                    value: 'BannedUser#1234 (123456789012345678)'
                                })
                            ])
                        })
                    })
                ])
            });
        });

        it('should display ID only when user tag not available', async () => {
            mockBannedUser.user = null;
            mockGuild.bans.fetch.mockResolvedValue(new Map([
                ['123456789012345678', mockBannedUser]
            ]));

            await unbanCommand.execute(mockInteraction, mockAdminManager, mockPermissionValidator);

            expect(mockInteraction.reply).toHaveBeenCalledWith({
                embeds: expect.arrayContaining([
                    expect.objectContaining({
                        data: expect.objectContaining({
                            fields: expect.arrayContaining([
                                expect.objectContaining({
                                    name: 'Utilisateur',
                                    value: 'ID: 123456789012345678'
                                })
                            ])
                        })
                    })
                ])
            });
        });

        it('should send DM to unbanned user', async () => {
            await unbanCommand.execute(mockInteraction, mockAdminManager, mockPermissionValidator);

            expect(mockClient.users.fetch).toHaveBeenCalledWith('123456789012345678');
            expect(mockUser.send).toHaveBeenCalledWith({
                embeds: expect.arrayContaining([
                    expect.objectContaining({
                        data: expect.objectContaining({
                            title: '✅ Débannissement'
                        })
                    })
                ])
            });
            expect(mockInteraction.followUp).toHaveBeenCalledWith({
                content: '📨 Un message privé a été envoyé à l\'utilisateur pour l\'informer du débannissement.',
                ephemeral: true
            });
        });

        it('should handle DM send failure gracefully', async () => {
            mockUser.send.mockRejectedValue(new Error('Cannot send DM'));

            const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

            await unbanCommand.execute(mockInteraction, mockAdminManager, mockPermissionValidator);

            expect(consoleSpy).toHaveBeenCalledWith(
                expect.stringContaining('Impossible d\'envoyer un MP')
            );
            expect(mockInteraction.followUp).not.toHaveBeenCalledWith({
                content: '📨 Un message privé a été envoyé à l\'utilisateur pour l\'informer du débannissement.',
                ephemeral: true
            });

            consoleSpy.mockRestore();
        });

        it('should handle user fetch failure for DM', async () => {
            mockClient.users.fetch.mockRejectedValue(new Error('User not found'));

            const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

            await unbanCommand.execute(mockInteraction, mockAdminManager, mockPermissionValidator);

            expect(consoleSpy).toHaveBeenCalledWith(
                expect.stringContaining('Impossible d\'envoyer un MP')
            );

            consoleSpy.mockRestore();
        });
    });

    describe('Error Handling', () => {
        it('should handle Discord API permission error (50013)', async () => {
            const error = new Error('Missing Permissions');
            error.code = 50013;
            mockGuild.members.unban.mockRejectedValue(error);

            await unbanCommand.execute(mockInteraction, mockAdminManager, mockPermissionValidator);

            expect(mockInteraction.reply).toHaveBeenCalledWith({
                content: '❌ Je n\'ai pas les permissions nécessaires pour débannir cet utilisateur.',
                ephemeral: true
            });
        });

        it('should handle user not found error (10007)', async () => {
            const error = new Error('Unknown User');
            error.code = 10007;
            mockGuild.members.unban.mockRejectedValue(error);

            await unbanCommand.execute(mockInteraction, mockAdminManager, mockPermissionValidator);

            expect(mockInteraction.reply).toHaveBeenCalledWith({
                content: '❌ Utilisateur non trouvé ou non banni.',
                ephemeral: true
            });
        });

        it('should handle missing access error (50001)', async () => {
            const error = new Error('Missing Access');
            error.code = 50001;
            mockGuild.members.unban.mockRejectedValue(error);

            await unbanCommand.execute(mockInteraction, mockAdminManager, mockPermissionValidator);

            expect(mockInteraction.reply).toHaveBeenCalledWith({
                content: '❌ Accès manquant pour effectuer cette action.',
                ephemeral: true
            });
        });

        it('should handle generic unban error', async () => {
            mockGuild.members.unban.mockRejectedValue(new Error('Generic error'));

            await unbanCommand.execute(mockInteraction, mockAdminManager, mockPermissionValidator);

            expect(mockInteraction.reply).toHaveBeenCalledWith({
                content: '❌ Une erreur est survenue lors du débannissement.',
                ephemeral: true
            });
        });

        it('should handle unexpected errors', async () => {
            mockPermissionValidator.validateBanPermission.mockImplementation(() => {
                throw new Error('Unexpected error');
            });

            await unbanCommand.execute(mockInteraction, mockAdminManager, mockPermissionValidator);

            expect(mockInteraction.reply).toHaveBeenCalledWith({
                content: '❌ Une erreur inattendue est survenue lors de l\'exécution de la commande.',
                ephemeral: true
            });
        });

        it('should handle errors when interaction already replied', async () => {
            mockInteraction.replied = true;
            mockPermissionValidator.validateBanPermission.mockImplementation(() => {
                throw new Error('Unexpected error');
            });

            await unbanCommand.execute(mockInteraction, mockAdminManager, mockPermissionValidator);

            expect(mockInteraction.followUp).toHaveBeenCalledWith({
                content: '❌ Une erreur inattendue est survenue lors de l\'exécution de la commande.',
                ephemeral: true
            });
        });
    });

    describe('Logging', () => {
        it('should log successful unban action', async () => {
            const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

            await unbanCommand.execute(mockInteraction, mockAdminManager, mockPermissionValidator);

            expect(consoleSpy).toHaveBeenCalledWith(
                expect.stringContaining('[UNBAN]')
            );
            expect(consoleSpy).toHaveBeenCalledWith(
                expect.stringContaining('BannedUser#1234')
            );
            expect(consoleSpy).toHaveBeenCalledWith(
                expect.stringContaining('Moderator#5678')
            );

            consoleSpy.mockRestore();
        });
    });
});