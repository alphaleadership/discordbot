import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import banCommand from '../../commands/ban.js';

describe('Ban Command', () => {
    let mockInteraction;
    let mockAdminManager;
    let mockPermissionValidator;
    let mockTargetUser;
    let mockTargetMember;
    let mockGuild;

    beforeEach(() => {
        // Mock target user
        mockTargetUser = {
            id: 'target123',
            tag: 'TargetUser#1234',
            send: vi.fn().mockResolvedValue(true)
        };

        // Mock target member
        mockTargetMember = {
            id: 'target123',
            user: mockTargetUser
        };

        // Mock guild
        mockGuild = {
            name: 'Test Guild',
            members: {
                fetch: vi.fn().mockResolvedValue(mockTargetMember),
                ban: vi.fn().mockResolvedValue(true)
            }
        };

        // Mock interaction
        mockInteraction = {
            options: {
                getUser: vi.fn().mockReturnValue(mockTargetUser),
                getString: vi.fn().mockReturnValue('Test reason'),
                getInteger: vi.fn().mockReturnValue(1)
            },
            guild: mockGuild,
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
            expect(banCommand.data).toBeInstanceOf(SlashCommandBuilder);
            expect(banCommand.data.name).toBe('ban');
            expect(banCommand.data.description).toBe('Bannir un utilisateur du serveur');
        });

        it('should have execute function', () => {
            expect(typeof banCommand.execute).toBe('function');
        });
    });

    describe('Permission Validation', () => {
        it('should validate permissions before banning', async () => {
            await banCommand.execute(mockInteraction, mockAdminManager, mockPermissionValidator);

            expect(mockPermissionValidator.validateBanPermission).toHaveBeenCalledWith(
                mockInteraction.member,
                mockTargetMember
            );
        });

        it('should deny ban when permission validation fails', async () => {
            mockPermissionValidator.validateBanPermission.mockReturnValue({
                success: false,
                message: '❌ Permission denied'
            });

            await banCommand.execute(mockInteraction, mockAdminManager, mockPermissionValidator);

            expect(mockInteraction.reply).toHaveBeenCalledWith({
                content: '❌ Permission denied',
                ephemeral: true
            });
            expect(mockGuild.members.ban).not.toHaveBeenCalled();
        });
    });

    describe('User Fetching', () => {
        it('should handle user not in guild (ban by ID)', async () => {
            mockGuild.members.fetch.mockRejectedValue(new Error('User not found'));

            await banCommand.execute(mockInteraction, mockAdminManager, mockPermissionValidator);

            // Should still proceed with ban by ID
            expect(mockPermissionValidator.validateBanPermission).toHaveBeenCalledWith(
                mockInteraction.member,
                mockTargetUser // User object instead of member
            );
            expect(mockGuild.members.ban).toHaveBeenCalled();
        });
    });

    describe('Ban Execution', () => {
        it('should successfully ban user with reason and message deletion', async () => {
            await banCommand.execute(mockInteraction, mockAdminManager, mockPermissionValidator);

            expect(mockGuild.members.ban).toHaveBeenCalledWith(mockTargetUser.id, {
                reason: 'Test reason',
                deleteMessageSeconds: 86400 // 1 day in seconds
            });
            expect(mockInteraction.reply).toHaveBeenCalledWith({
                embeds: expect.arrayContaining([
                    expect.objectContaining({
                        data: expect.objectContaining({
                            title: '🔨 Bannissement réussi'
                        })
                    })
                ])
            });
        });

        it('should use default reason when none provided', async () => {
            mockInteraction.options.getString.mockReturnValue(null);

            await banCommand.execute(mockInteraction, mockAdminManager, mockPermissionValidator);

            expect(mockGuild.members.ban).toHaveBeenCalledWith(mockTargetUser.id, {
                reason: 'Aucune raison spécifiée',
                deleteMessageSeconds: 86400
            });
        });

        it('should use default message deletion days when none provided', async () => {
            mockInteraction.options.getInteger.mockReturnValue(null);

            await banCommand.execute(mockInteraction, mockAdminManager, mockPermissionValidator);

            expect(mockGuild.members.ban).toHaveBeenCalledWith(mockTargetUser.id, {
                reason: 'Test reason',
                deleteMessageSeconds: 0 // 0 days
            });
        });

        it('should handle maximum message deletion days', async () => {
            mockInteraction.options.getInteger.mockReturnValue(7);

            await banCommand.execute(mockInteraction, mockAdminManager, mockPermissionValidator);

            expect(mockGuild.members.ban).toHaveBeenCalledWith(mockTargetUser.id, {
                reason: 'Test reason',
                deleteMessageSeconds: 604800 // 7 days in seconds
            });
        });

        it('should send DM to user before banning (if in guild)', async () => {
            await banCommand.execute(mockInteraction, mockAdminManager, mockPermissionValidator);

            expect(mockTargetUser.send).toHaveBeenCalledWith({
                embeds: expect.arrayContaining([
                    expect.objectContaining({
                        data: expect.objectContaining({
                            title: '🔨 Bannissement'
                        })
                    })
                ])
            });
        });

        it('should not send DM when user not in guild', async () => {
            mockGuild.members.fetch.mockRejectedValue(new Error('User not found'));

            await banCommand.execute(mockInteraction, mockAdminManager, mockPermissionValidator);

            expect(mockTargetUser.send).not.toHaveBeenCalled();
            expect(mockInteraction.reply).toHaveBeenCalledWith({
                embeds: expect.arrayContaining([
                    expect.objectContaining({
                        data: expect.objectContaining({
                            fields: expect.arrayContaining([
                                expect.objectContaining({
                                    name: 'MP envoyé',
                                    value: '❌ Non'
                                })
                            ])
                        })
                    })
                ])
            });
        });

        it('should handle DM send failure gracefully', async () => {
            mockTargetUser.send.mockRejectedValue(new Error('Cannot send DM'));

            await banCommand.execute(mockInteraction, mockAdminManager, mockPermissionValidator);

            expect(mockGuild.members.ban).toHaveBeenCalled();
            expect(mockInteraction.reply).toHaveBeenCalledWith({
                embeds: expect.arrayContaining([
                    expect.objectContaining({
                        data: expect.objectContaining({
                            fields: expect.arrayContaining([
                                expect.objectContaining({
                                    name: 'MP envoyé',
                                    value: '❌ Non'
                                })
                            ])
                        })
                    })
                ])
            });
        });
    });

    describe('Error Handling', () => {
        it('should handle Discord API permission error (50013)', async () => {
            const error = new Error('Missing Permissions');
            error.code = 50013;
            mockGuild.members.ban.mockRejectedValue(error);

            await banCommand.execute(mockInteraction, mockAdminManager, mockPermissionValidator);

            expect(mockInteraction.reply).toHaveBeenCalledWith({
                content: '❌ Je n\'ai pas les permissions nécessaires pour bannir cet utilisateur.',
                ephemeral: true
            });
        });

        it('should handle user not found error (10007)', async () => {
            const error = new Error('Unknown User');
            error.code = 10007;
            mockGuild.members.ban.mockRejectedValue(error);

            await banCommand.execute(mockInteraction, mockAdminManager, mockPermissionValidator);

            expect(mockInteraction.reply).toHaveBeenCalledWith({
                content: '❌ Utilisateur non trouvé.',
                ephemeral: true
            });
        });

        it('should handle missing access error (50001)', async () => {
            const error = new Error('Missing Access');
            error.code = 50001;
            mockGuild.members.ban.mockRejectedValue(error);

            await banCommand.execute(mockInteraction, mockAdminManager, mockPermissionValidator);

            expect(mockInteraction.reply).toHaveBeenCalledWith({
                content: '❌ Accès manquant pour effectuer cette action.',
                ephemeral: true
            });
        });

        it('should handle user already banned error (10026)', async () => {
            const error = new Error('Unknown Ban');
            error.code = 10026;
            mockGuild.members.ban.mockRejectedValue(error);

            await banCommand.execute(mockInteraction, mockAdminManager, mockPermissionValidator);

            expect(mockInteraction.reply).toHaveBeenCalledWith({
                content: '❌ Cet utilisateur est déjà banni.',
                ephemeral: true
            });
        });

        it('should handle generic ban error', async () => {
            mockGuild.members.ban.mockRejectedValue(new Error('Generic error'));

            await banCommand.execute(mockInteraction, mockAdminManager, mockPermissionValidator);

            expect(mockInteraction.reply).toHaveBeenCalledWith({
                content: '❌ Une erreur est survenue lors du bannissement.',
                ephemeral: true
            });
        });

        it('should handle unexpected errors', async () => {
            mockPermissionValidator.validateBanPermission.mockImplementation(() => {
                throw new Error('Unexpected error');
            });

            await banCommand.execute(mockInteraction, mockAdminManager, mockPermissionValidator);

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

            await banCommand.execute(mockInteraction, mockAdminManager, mockPermissionValidator);

            expect(mockInteraction.followUp).toHaveBeenCalledWith({
                content: '❌ Une erreur inattendue est survenue lors de l\'exécution de la commande.',
                ephemeral: true
            });
        });
    });

    describe('Logging', () => {
        it('should log successful ban action', async () => {
            const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

            await banCommand.execute(mockInteraction, mockAdminManager, mockPermissionValidator);

            expect(consoleSpy).toHaveBeenCalledWith(
                expect.stringContaining('[BAN]')
            );
            expect(consoleSpy).toHaveBeenCalledWith(
                expect.stringContaining('TargetUser#1234')
            );
            expect(consoleSpy).toHaveBeenCalledWith(
                expect.stringContaining('Moderator#5678')
            );
            expect(consoleSpy).toHaveBeenCalledWith(
                expect.stringContaining('Messages supprimés: 1 jour(s)')
            );

            consoleSpy.mockRestore();
        });

        it('should log when user not found in guild', async () => {
            const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
            mockGuild.members.fetch.mockRejectedValue(new Error('User not found'));

            await banCommand.execute(mockInteraction, mockAdminManager, mockPermissionValidator);

            expect(consoleSpy).toHaveBeenCalledWith(
                expect.stringContaining('non trouvé sur le serveur, bannissement par ID')
            );

            consoleSpy.mockRestore();
        });
    });
});