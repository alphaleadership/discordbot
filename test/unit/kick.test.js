import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import kickCommand from '../../commands/kick.js';

describe('Kick Command', () => {
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
            user: mockTargetUser,
            kick: vi.fn().mockResolvedValue(true)
        };

        // Mock guild
        mockGuild = {
            name: 'Test Guild',
            members: {
                fetch: vi.fn().mockResolvedValue(mockTargetMember)
            }
        };

        // Mock interaction
        mockInteraction = {
            options: {
                getUser: vi.fn().mockReturnValue(mockTargetUser),
                getString: vi.fn().mockReturnValue('Test reason')
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
            validateKickPermission: vi.fn().mockReturnValue({
                success: true,
                reason: 'permission_granted'
            })
        };
    });

    describe('Command Structure', () => {
        it('should have correct command data', () => {
            expect(kickCommand.data).toBeInstanceOf(SlashCommandBuilder);
            expect(kickCommand.data.name).toBe('kick');
            expect(kickCommand.data.description).toBe('Expulser un utilisateur du serveur');
        });

        it('should have execute function', () => {
            expect(typeof kickCommand.execute).toBe('function');
        });
    });

    describe('Permission Validation', () => {
        it('should validate permissions before kicking', async () => {
            await kickCommand.execute(mockInteraction, mockAdminManager, mockPermissionValidator);

            expect(mockPermissionValidator.validateKickPermission).toHaveBeenCalledWith(
                mockInteraction.member,
                mockTargetMember
            );
        });

        it('should deny kick when permission validation fails', async () => {
            mockPermissionValidator.validateKickPermission.mockReturnValue({
                success: false,
                message: '❌ Permission denied'
            });

            await kickCommand.execute(mockInteraction, mockAdminManager, mockPermissionValidator);

            expect(mockInteraction.reply).toHaveBeenCalledWith({
                content: '❌ Permission denied',
                ephemeral: true
            });
            expect(mockTargetMember.kick).not.toHaveBeenCalled();
        });
    });

    describe('User Fetching', () => {
        it('should handle user not found in guild', async () => {
            mockGuild.members.fetch.mockRejectedValue(new Error('User not found'));

            await kickCommand.execute(mockInteraction, mockAdminManager, mockPermissionValidator);

            expect(mockInteraction.reply).toHaveBeenCalledWith({
                content: '❌ Utilisateur non trouvé sur ce serveur.',
                ephemeral: true
            });
        });
    });

    describe('Kick Execution', () => {
        it('should successfully kick user with reason', async () => {
            await kickCommand.execute(mockInteraction, mockAdminManager, mockPermissionValidator);

            expect(mockTargetMember.kick).toHaveBeenCalledWith('Test reason');
            expect(mockInteraction.reply).toHaveBeenCalledWith({
                embeds: expect.arrayContaining([
                    expect.objectContaining({
                        data: expect.objectContaining({
                            title: '✅ Expulsion réussie'
                        })
                    })
                ])
            });
        });

        it('should use default reason when none provided', async () => {
            mockInteraction.options.getString.mockReturnValue(null);

            await kickCommand.execute(mockInteraction, mockAdminManager, mockPermissionValidator);

            expect(mockTargetMember.kick).toHaveBeenCalledWith('Aucune raison spécifiée');
        });

        it('should send DM to user before kicking', async () => {
            await kickCommand.execute(mockInteraction, mockAdminManager, mockPermissionValidator);

            expect(mockTargetUser.send).toHaveBeenCalledWith({
                embeds: expect.arrayContaining([
                    expect.objectContaining({
                        data: expect.objectContaining({
                            title: '🦶 Expulsion'
                        })
                    })
                ])
            });
        });

        it('should handle DM send failure gracefully', async () => {
            mockTargetUser.send.mockRejectedValue(new Error('Cannot send DM'));

            await kickCommand.execute(mockInteraction, mockAdminManager, mockPermissionValidator);

            expect(mockTargetMember.kick).toHaveBeenCalled();
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
            mockTargetMember.kick.mockRejectedValue(error);

            await kickCommand.execute(mockInteraction, mockAdminManager, mockPermissionValidator);

            expect(mockInteraction.reply).toHaveBeenCalledWith({
                content: '❌ Je n\'ai pas les permissions nécessaires pour expulser cet utilisateur.',
                ephemeral: true
            });
        });

        it('should handle user not found error (10007)', async () => {
            const error = new Error('Unknown User');
            error.code = 10007;
            mockTargetMember.kick.mockRejectedValue(error);

            await kickCommand.execute(mockInteraction, mockAdminManager, mockPermissionValidator);

            expect(mockInteraction.reply).toHaveBeenCalledWith({
                content: '❌ Utilisateur non trouvé.',
                ephemeral: true
            });
        });

        it('should handle missing access error (50001)', async () => {
            const error = new Error('Missing Access');
            error.code = 50001;
            mockTargetMember.kick.mockRejectedValue(error);

            await kickCommand.execute(mockInteraction, mockAdminManager, mockPermissionValidator);

            expect(mockInteraction.reply).toHaveBeenCalledWith({
                content: '❌ Accès manquant pour effectuer cette action.',
                ephemeral: true
            });
        });

        it('should handle generic kick error', async () => {
            mockTargetMember.kick.mockRejectedValue(new Error('Generic error'));

            await kickCommand.execute(mockInteraction, mockAdminManager, mockPermissionValidator);

            expect(mockInteraction.reply).toHaveBeenCalledWith({
                content: '❌ Une erreur est survenue lors de l\'expulsion.',
                ephemeral: true
            });
        });

        it('should handle unexpected errors', async () => {
            mockPermissionValidator.validateKickPermission.mockImplementation(() => {
                throw new Error('Unexpected error');
            });

            await kickCommand.execute(mockInteraction, mockAdminManager, mockPermissionValidator);

            expect(mockInteraction.reply).toHaveBeenCalledWith({
                content: '❌ Une erreur inattendue est survenue lors de l\'exécution de la commande.',
                ephemeral: true
            });
        });

        it('should handle errors when interaction already replied', async () => {
            mockInteraction.replied = true;
            mockPermissionValidator.validateKickPermission.mockImplementation(() => {
                throw new Error('Unexpected error');
            });

            await kickCommand.execute(mockInteraction, mockAdminManager, mockPermissionValidator);

            expect(mockInteraction.followUp).toHaveBeenCalledWith({
                content: '❌ Une erreur inattendue est survenue lors de l\'exécution de la commande.',
                ephemeral: true
            });
        });
    });

    describe('Logging', () => {
        it('should log successful kick action', async () => {
            const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

            await kickCommand.execute(mockInteraction, mockAdminManager, mockPermissionValidator);

            expect(consoleSpy).toHaveBeenCalledWith(
                expect.stringContaining('[KICK]')
            );
            expect(consoleSpy).toHaveBeenCalledWith(
                expect.stringContaining('TargetUser#1234')
            );
            expect(consoleSpy).toHaveBeenCalledWith(
                expect.stringContaining('Moderator#5678')
            );

            consoleSpy.mockRestore();
        });
    });
});