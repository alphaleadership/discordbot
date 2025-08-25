import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import timeoutCommand from '../../commands/timeout.js';

describe('Timeout Command', () => {
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
            communicationDisabledUntil: null,
            timeout: vi.fn().mockResolvedValue(true)
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
                getString: vi.fn((key) => {
                    if (key === 'duree') return '1h';
                    if (key === 'raison') return 'Test timeout reason';
                    return null;
                })
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
            validateTimeoutPermission: vi.fn().mockReturnValue({
                success: true,
                reason: 'permission_granted'
            }),
            parseDuration: vi.fn().mockReturnValue({
                success: true,
                duration: 3600000 // 1 hour in milliseconds
            })
        };
    });

    describe('Command Structure', () => {
        it('should have correct command data', () => {
            expect(timeoutCommand.data).toBeInstanceOf(SlashCommandBuilder);
            expect(timeoutCommand.data.name).toBe('timeout');
            expect(timeoutCommand.data.description).toBe('Mettre un utilisateur en timeout');
        });

        it('should have execute function', () => {
            expect(typeof timeoutCommand.execute).toBe('function');
        });
    });

    describe('Permission Validation', () => {
        it('should validate permissions before timeout', async () => {
            await timeoutCommand.execute(mockInteraction, mockAdminManager, mockPermissionValidator);

            expect(mockPermissionValidator.validateTimeoutPermission).toHaveBeenCalledWith(
                mockInteraction.member,
                mockTargetMember
            );
        });

        it('should deny timeout when permission validation fails', async () => {
            mockPermissionValidator.validateTimeoutPermission.mockReturnValue({
                success: false,
                message: '❌ Permission denied'
            });

            await timeoutCommand.execute(mockInteraction, mockAdminManager, mockPermissionValidator);

            expect(mockInteraction.reply).toHaveBeenCalledWith({
                content: '❌ Permission denied',
                ephemeral: true
            });
            expect(mockTargetMember.timeout).not.toHaveBeenCalled();
        });
    });

    describe('User Fetching', () => {
        it('should handle user not found in guild', async () => {
            mockGuild.members.fetch.mockRejectedValue(new Error('User not found'));

            await timeoutCommand.execute(mockInteraction, mockAdminManager, mockPermissionValidator);

            expect(mockInteraction.reply).toHaveBeenCalledWith({
                content: '❌ Utilisateur non trouvé sur ce serveur.',
                ephemeral: true
            });
        });
    });

    describe('Duration Validation', () => {
        it('should parse and validate duration', async () => {
            await timeoutCommand.execute(mockInteraction, mockAdminManager, mockPermissionValidator);

            expect(mockPermissionValidator.parseDuration).toHaveBeenCalledWith('1h');
        });

        it('should handle invalid duration format', async () => {
            mockPermissionValidator.parseDuration.mockReturnValue({
                success: false,
                message: '❌ Format de durée invalide'
            });

            await timeoutCommand.execute(mockInteraction, mockAdminManager, mockPermissionValidator);

            expect(mockInteraction.reply).toHaveBeenCalledWith({
                content: '❌ Format de durée invalide',
                ephemeral: true
            });
            expect(mockTargetMember.timeout).not.toHaveBeenCalled();
        });
    });

    describe('Existing Timeout Check', () => {
        it('should check if user is already timed out', async () => {
            const futureDate = new Date(Date.now() + 3600000); // 1 hour from now
            mockTargetMember.communicationDisabledUntil = futureDate;

            await timeoutCommand.execute(mockInteraction, mockAdminManager, mockPermissionValidator);

            expect(mockInteraction.reply).toHaveBeenCalledWith({
                content: expect.stringContaining('est déjà en timeout'),
                ephemeral: true
            });
            expect(mockTargetMember.timeout).not.toHaveBeenCalled();
        });

        it('should allow timeout if previous timeout has expired', async () => {
            const pastDate = new Date(Date.now() - 3600000); // 1 hour ago
            mockTargetMember.communicationDisabledUntil = pastDate;

            await timeoutCommand.execute(mockInteraction, mockAdminManager, mockPermissionValidator);

            expect(mockTargetMember.timeout).toHaveBeenCalled();
        });

        it('should allow timeout if user has never been timed out', async () => {
            mockTargetMember.communicationDisabledUntil = null;

            await timeoutCommand.execute(mockInteraction, mockAdminManager, mockPermissionValidator);

            expect(mockTargetMember.timeout).toHaveBeenCalled();
        });
    });

    describe('Timeout Execution', () => {
        it('should successfully timeout user with reason and duration', async () => {
            await timeoutCommand.execute(mockInteraction, mockAdminManager, mockPermissionValidator);

            expect(mockTargetMember.timeout).toHaveBeenCalledWith(3600000, 'Test timeout reason');
            expect(mockInteraction.reply).toHaveBeenCalledWith({
                embeds: expect.arrayContaining([
                    expect.objectContaining({
                        data: expect.objectContaining({
                            title: '⏰ Timeout appliqué'
                        })
                    })
                ])
            });
        });

        it('should use default reason when none provided', async () => {
            mockInteraction.options.getString.mockImplementation((key) => {
                if (key === 'duree') return '1h';
                if (key === 'raison') return null;
                return null;
            });

            await timeoutCommand.execute(mockInteraction, mockAdminManager, mockPermissionValidator);

            expect(mockTargetMember.timeout).toHaveBeenCalledWith(3600000, 'Aucune raison spécifiée');
        });

        it('should send DM to user before timeout', async () => {
            await timeoutCommand.execute(mockInteraction, mockAdminManager, mockPermissionValidator);

            expect(mockTargetUser.send).toHaveBeenCalledWith({
                embeds: expect.arrayContaining([
                    expect.objectContaining({
                        data: expect.objectContaining({
                            title: '⏰ Timeout'
                        })
                    })
                ])
            });
        });

        it('should handle DM send failure gracefully', async () => {
            mockTargetUser.send.mockRejectedValue(new Error('Cannot send DM'));

            await timeoutCommand.execute(mockInteraction, mockAdminManager, mockPermissionValidator);

            expect(mockTargetMember.timeout).toHaveBeenCalled();
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

        it('should include correct timeout end time in embed', async () => {
            const startTime = Date.now();
            
            await timeoutCommand.execute(mockInteraction, mockAdminManager, mockPermissionValidator);

            const replyCall = mockInteraction.reply.mock.calls[0][0];
            const embed = replyCall.embeds[0];
            const endTimeField = embed.data.fields.find(field => field.name === 'Fin du timeout');
            
            expect(endTimeField).toBeDefined();
            expect(endTimeField.value).toMatch(/\d{2}\/\d{2}\/\d{4}/); // Date format check
        });
    });

    describe('Error Handling', () => {
        it('should handle Discord API permission error (50013)', async () => {
            const error = new Error('Missing Permissions');
            error.code = 50013;
            mockTargetMember.timeout.mockRejectedValue(error);

            await timeoutCommand.execute(mockInteraction, mockAdminManager, mockPermissionValidator);

            expect(mockInteraction.reply).toHaveBeenCalledWith({
                content: '❌ Je n\'ai pas les permissions nécessaires pour mettre cet utilisateur en timeout.',
                ephemeral: true
            });
        });

        it('should handle user not found error (10007)', async () => {
            const error = new Error('Unknown User');
            error.code = 10007;
            mockTargetMember.timeout.mockRejectedValue(error);

            await timeoutCommand.execute(mockInteraction, mockAdminManager, mockPermissionValidator);

            expect(mockInteraction.reply).toHaveBeenCalledWith({
                content: '❌ Utilisateur non trouvé.',
                ephemeral: true
            });
        });

        it('should handle missing access error (50001)', async () => {
            const error = new Error('Missing Access');
            error.code = 50001;
            mockTargetMember.timeout.mockRejectedValue(error);

            await timeoutCommand.execute(mockInteraction, mockAdminManager, mockPermissionValidator);

            expect(mockInteraction.reply).toHaveBeenCalledWith({
                content: '❌ Accès manquant pour effectuer cette action.',
                ephemeral: true
            });
        });

        it('should handle cannot timeout user error (50024)', async () => {
            const error = new Error('Cannot timeout user');
            error.code = 50024;
            mockTargetMember.timeout.mockRejectedValue(error);

            await timeoutCommand.execute(mockInteraction, mockAdminManager, mockPermissionValidator);

            expect(mockInteraction.reply).toHaveBeenCalledWith({
                content: '❌ Impossible de mettre en timeout cet utilisateur (permissions insuffisantes ou utilisateur privilégié).',
                ephemeral: true
            });
        });

        it('should handle generic timeout error', async () => {
            mockTargetMember.timeout.mockRejectedValue(new Error('Generic error'));

            await timeoutCommand.execute(mockInteraction, mockAdminManager, mockPermissionValidator);

            expect(mockInteraction.reply).toHaveBeenCalledWith({
                content: '❌ Une erreur est survenue lors du timeout.',
                ephemeral: true
            });
        });

        it('should handle unexpected errors', async () => {
            mockPermissionValidator.validateTimeoutPermission.mockImplementation(() => {
                throw new Error('Unexpected error');
            });

            await timeoutCommand.execute(mockInteraction, mockAdminManager, mockPermissionValidator);

            expect(mockInteraction.reply).toHaveBeenCalledWith({
                content: '❌ Une erreur inattendue est survenue lors de l\'exécution de la commande.',
                ephemeral: true
            });
        });

        it('should handle errors when interaction already replied', async () => {
            mockInteraction.replied = true;
            mockPermissionValidator.validateTimeoutPermission.mockImplementation(() => {
                throw new Error('Unexpected error');
            });

            await timeoutCommand.execute(mockInteraction, mockAdminManager, mockPermissionValidator);

            expect(mockInteraction.followUp).toHaveBeenCalledWith({
                content: '❌ Une erreur inattendue est survenue lors de l\'exécution de la commande.',
                ephemeral: true
            });
        });
    });

    describe('Logging', () => {
        it('should log successful timeout action', async () => {
            const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

            await timeoutCommand.execute(mockInteraction, mockAdminManager, mockPermissionValidator);

            expect(consoleSpy).toHaveBeenCalledWith(
                expect.stringContaining('[TIMEOUT]')
            );
            expect(consoleSpy).toHaveBeenCalledWith(
                expect.stringContaining('TargetUser#1234')
            );
            expect(consoleSpy).toHaveBeenCalledWith(
                expect.stringContaining('Moderator#5678')
            );
            expect(consoleSpy).toHaveBeenCalledWith(
                expect.stringContaining('Durée: 1h')
            );

            consoleSpy.mockRestore();
        });
    });

    describe('Duration Handling', () => {
        it('should handle different duration formats', async () => {
            const durations = ['30s', '5m', '2h', '1d'];
            const expectedMs = [30000, 300000, 7200000, 86400000];

            for (let i = 0; i < durations.length; i++) {
                mockInteraction.options.getString.mockImplementation((key) => {
                    if (key === 'duree') return durations[i];
                    if (key === 'raison') return 'Test reason';
                    return null;
                });

                mockPermissionValidator.parseDuration.mockReturnValue({
                    success: true,
                    duration: expectedMs[i]
                });

                await timeoutCommand.execute(mockInteraction, mockAdminManager, mockPermissionValidator);

                expect(mockTargetMember.timeout).toHaveBeenCalledWith(expectedMs[i], 'Test reason');
                
                // Reset mocks for next iteration
                mockTargetMember.timeout.mockClear();
                mockInteraction.reply.mockClear();
            }
        });
    });
});