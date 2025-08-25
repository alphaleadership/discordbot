import { describe, it, expect, beforeEach, vi } from 'vitest';
import { SlashCommandBuilder, EmbedBuilder, PermissionsBitField } from 'discord.js';
import clearCommand from '../../commands/clear.js';

describe('Clear Command', () => {
    let mockInteraction;
    let mockAdminManager;
    let mockPermissionValidator;
    let mockChannel;
    let mockGuild;
    let mockMessages;
    let mockBotMember;

    beforeEach(() => {
        // Mock messages
        const mockMessage1 = {
            id: 'msg1',
            createdTimestamp: Date.now() - 1000000, // Recent message
            delete: vi.fn().mockResolvedValue(true)
        };
        
        const mockMessage2 = {
            id: 'msg2',
            createdTimestamp: Date.now() - 2000000, // Recent message
            delete: vi.fn().mockResolvedValue(true)
        };

        mockMessages = new Map([
            ['msg1', mockMessage1],
            ['msg2', mockMessage2]
        ]);
        mockMessages.first = vi.fn().mockReturnValue(mockMessage1);
        mockMessages.filter = vi.fn().mockReturnValue(mockMessages);

        // Mock bot member
        mockBotMember = {
            id: 'bot123'
        };

        // Mock channel
        mockChannel = {
            id: 'channel123',
            name: 'test-channel',
            toString: vi.fn().mockReturnValue('#test-channel'),
            isTextBased: vi.fn().mockReturnValue(true),
            permissionsFor: vi.fn().mockReturnValue({
                has: vi.fn().mockReturnValue(true)
            }),
            messages: {
                fetch: vi.fn().mockResolvedValue(mockMessages)
            },
            bulkDelete: vi.fn().mockResolvedValue(mockMessages),
            send: vi.fn().mockResolvedValue(true)
        };

        // Mock guild
        mockGuild = {
            members: {
                me: mockBotMember
            }
        };

        // Mock interaction
        mockInteraction = {
            options: {
                getInteger: vi.fn().mockReturnValue(10),
                getChannel: vi.fn().mockReturnValue(null),
                getBoolean: vi.fn().mockReturnValue(false)
            },
            channel: mockChannel,
            guild: mockGuild,
            member: {
                id: 'moderator123',
                permissions: { has: vi.fn().mockReturnValue(true) }
            },
            user: {
                id: 'moderator123',
                tag: 'Moderator#5678',
                toString: vi.fn().mockReturnValue('<@moderator123>')
            },
            reply: vi.fn().mockResolvedValue(true),
            deferReply: vi.fn().mockResolvedValue(true),
            editReply: vi.fn().mockResolvedValue(true),
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
            validateMessageCount: vi.fn().mockReturnValue({
                success: true,
                count: 10
            }),
            validateMessageManagementPermission: vi.fn().mockReturnValue({
                success: true,
                reason: 'permission_granted'
            })
        };
    });

    describe('Command Structure', () => {
        it('should have correct command data', () => {
            expect(clearCommand.data).toBeInstanceOf(SlashCommandBuilder);
            expect(clearCommand.data.name).toBe('clear');
            expect(clearCommand.data.description).toBe('Supprimer des messages en masse');
        });

        it('should have execute function', () => {
            expect(typeof clearCommand.execute).toBe('function');
        });
    });

    describe('Input Validation', () => {
        it('should validate message count', async () => {
            await clearCommand.execute(mockInteraction, mockAdminManager, mockPermissionValidator);

            expect(mockPermissionValidator.validateMessageCount).toHaveBeenCalledWith(10);
        });

        it('should handle invalid message count', async () => {
            mockPermissionValidator.validateMessageCount.mockReturnValue({
                success: false,
                message: '❌ Nombre invalide'
            });

            await clearCommand.execute(mockInteraction, mockAdminManager, mockPermissionValidator);

            expect(mockInteraction.reply).toHaveBeenCalledWith({
                content: '❌ Nombre invalide',
                ephemeral: true
            });
        });
    });

    describe('Permission Validation', () => {
        it('should validate message management permissions', async () => {
            await clearCommand.execute(mockInteraction, mockAdminManager, mockPermissionValidator);

            expect(mockPermissionValidator.validateMessageManagementPermission).toHaveBeenCalledWith(
                mockInteraction.member
            );
        });

        it('should deny clear when permission validation fails', async () => {
            mockPermissionValidator.validateMessageManagementPermission.mockReturnValue({
                success: false,
                message: '❌ Permission denied'
            });

            await clearCommand.execute(mockInteraction, mockAdminManager, mockPermissionValidator);

            expect(mockInteraction.reply).toHaveBeenCalledWith({
                content: '❌ Permission denied',
                ephemeral: true
            });
        });
    });

    describe('Channel Validation', () => {
        it('should use current channel when no channel specified', async () => {
            await clearCommand.execute(mockInteraction, mockAdminManager, mockPermissionValidator);

            expect(mockChannel.messages.fetch).toHaveBeenCalledWith({ limit: 10 });
        });

        it('should use specified channel when provided', async () => {
            const targetChannel = { ...mockChannel, id: 'target456', name: 'target-channel' };
            mockInteraction.options.getChannel.mockReturnValue(targetChannel);

            await clearCommand.execute(mockInteraction, mockAdminManager, mockPermissionValidator);

            expect(targetChannel.messages.fetch).toHaveBeenCalledWith({ limit: 10 });
        });

        it('should reject non-text channels', async () => {
            mockChannel.isTextBased.mockReturnValue(false);

            await clearCommand.execute(mockInteraction, mockAdminManager, mockPermissionValidator);

            expect(mockInteraction.reply).toHaveBeenCalledWith({
                content: '❌ Vous ne pouvez supprimer des messages que dans des canaux textuels.',
                ephemeral: true
            });
        });

        it('should check bot permissions in target channel', async () => {
            mockChannel.permissionsFor.mockReturnValue({
                has: vi.fn().mockReturnValue(false)
            });

            await clearCommand.execute(mockInteraction, mockAdminManager, mockPermissionValidator);

            expect(mockInteraction.reply).toHaveBeenCalledWith({
                content: `❌ Je n'ai pas la permission de gérer les messages dans ${mockChannel}.`,
                ephemeral: true
            });
        });
    });

    describe('Confirmation System', () => {
        it('should require confirmation for more than 50 messages', async () => {
            mockInteraction.options.getInteger.mockReturnValue(75);
            mockInteraction.options.getBoolean.mockReturnValue(false);

            await clearCommand.execute(mockInteraction, mockAdminManager, mockPermissionValidator);

            expect(mockInteraction.reply).toHaveBeenCalledWith({
                content: expect.stringContaining('confirmation: True'),
                ephemeral: true
            });
        });

        it('should proceed with confirmation for large deletions', async () => {
            mockInteraction.options.getInteger.mockReturnValue(75);
            mockInteraction.options.getBoolean.mockReturnValue(true);
            mockPermissionValidator.validateMessageCount.mockReturnValue({
                success: true,
                count: 75
            });

            await clearCommand.execute(mockInteraction, mockAdminManager, mockPermissionValidator);

            expect(mockInteraction.deferReply).toHaveBeenCalled();
        });

        it('should not require confirmation for 50 or fewer messages', async () => {
            mockInteraction.options.getInteger.mockReturnValue(50);

            await clearCommand.execute(mockInteraction, mockAdminManager, mockPermissionValidator);

            expect(mockInteraction.deferReply).toHaveBeenCalled();
        });
    });

    describe('Message Deletion', () => {
        it('should successfully delete messages', async () => {
            await clearCommand.execute(mockInteraction, mockAdminManager, mockPermissionValidator);

            expect(mockInteraction.deferReply).toHaveBeenCalledWith({ ephemeral: true });
            expect(mockChannel.messages.fetch).toHaveBeenCalledWith({ limit: 10 });
            expect(mockChannel.bulkDelete).toHaveBeenCalledWith(mockMessages, true);
            expect(mockInteraction.editReply).toHaveBeenCalledWith({
                embeds: expect.arrayContaining([
                    expect.objectContaining({
                        data: expect.objectContaining({
                            title: '🧹 Messages supprimés'
                        })
                    })
                ])
            });
        });

        it('should handle single message deletion', async () => {
            const singleMessage = new Map([['msg1', mockMessages.get('msg1')]]);
            singleMessage.first = vi.fn().mockReturnValue(mockMessages.get('msg1'));
            singleMessage.filter = vi.fn().mockReturnValue(singleMessage);
            mockChannel.messages.fetch.mockResolvedValue(singleMessage);

            await clearCommand.execute(mockInteraction, mockAdminManager, mockPermissionValidator);

            expect(singleMessage.first().delete).toHaveBeenCalled();
            expect(mockChannel.bulkDelete).not.toHaveBeenCalled();
        });

        it('should handle no messages found', async () => {
            const emptyMessages = new Map();
            mockChannel.messages.fetch.mockResolvedValue(emptyMessages);

            await clearCommand.execute(mockInteraction, mockAdminManager, mockPermissionValidator);

            expect(mockInteraction.editReply).toHaveBeenCalledWith({
                content: '❌ Aucun message trouvé à supprimer.'
            });
        });

        it('should filter out messages older than 14 days', async () => {
            const twoWeeksAgo = Date.now() - (14 * 24 * 60 * 60 * 1000);
            const oldMessage = {
                id: 'old1',
                createdTimestamp: twoWeeksAgo - 1000000 // Older than 14 days
            };
            
            const mixedMessages = new Map([
                ['msg1', mockMessages.get('msg1')],
                ['old1', oldMessage]
            ]);
            mixedMessages.filter = vi.fn().mockImplementation((filterFn) => {
                const filtered = new Map();
                for (const [id, msg] of mixedMessages) {
                    if (filterFn(msg)) {
                        filtered.set(id, msg);
                    }
                }
                filtered.first = vi.fn().mockReturnValue(filtered.values().next().value);
                return filtered;
            });

            mockChannel.messages.fetch.mockResolvedValue(mixedMessages);

            await clearCommand.execute(mockInteraction, mockAdminManager, mockPermissionValidator);

            expect(mockInteraction.editReply).toHaveBeenCalledWith({
                embeds: expect.arrayContaining([
                    expect.objectContaining({
                        data: expect.objectContaining({
                            fields: expect.arrayContaining([
                                expect.objectContaining({
                                    name: 'Messages ignorés',
                                    value: expect.stringContaining('trop ancien(s)')
                                })
                            ])
                        })
                    })
                ])
            });
        });

        it('should handle all messages being too old', async () => {
            const twoWeeksAgo = Date.now() - (14 * 24 * 60 * 60 * 1000);
            const oldMessages = new Map([
                ['old1', { id: 'old1', createdTimestamp: twoWeeksAgo - 1000000 }],
                ['old2', { id: 'old2', createdTimestamp: twoWeeksAgo - 2000000 }]
            ]);
            oldMessages.filter = vi.fn().mockReturnValue(new Map()); // All filtered out

            mockChannel.messages.fetch.mockResolvedValue(oldMessages);

            await clearCommand.execute(mockInteraction, mockAdminManager, mockPermissionValidator);

            expect(mockInteraction.editReply).toHaveBeenCalledWith({
                content: '❌ Tous les messages trouvés sont trop anciens (plus de 14 jours) pour être supprimés en masse.'
            });
        });

        it('should send confirmation in different channel', async () => {
            const targetChannel = { 
                ...mockChannel, 
                id: 'target456',
                name: 'target-channel'
            };
            mockInteraction.options.getChannel.mockReturnValue(targetChannel);

            await clearCommand.execute(mockInteraction, mockAdminManager, mockPermissionValidator);

            expect(targetChannel.send).toHaveBeenCalledWith({
                embeds: expect.arrayContaining([
                    expect.objectContaining({
                        data: expect.objectContaining({
                            title: '🧹 Messages supprimés'
                        })
                    })
                ])
            });
        });

        it('should not send confirmation in same channel', async () => {
            await clearCommand.execute(mockInteraction, mockAdminManager, mockPermissionValidator);

            expect(mockChannel.send).not.toHaveBeenCalled();
        });
    });

    describe('Error Handling', () => {
        it('should handle Discord API permission error (50013)', async () => {
            const error = new Error('Missing Permissions');
            error.code = 50013;
            mockChannel.bulkDelete.mockRejectedValue(error);

            await clearCommand.execute(mockInteraction, mockAdminManager, mockPermissionValidator);

            expect(mockInteraction.editReply).toHaveBeenCalledWith({
                content: '❌ Je n\'ai pas les permissions nécessaires pour supprimer ces messages.'
            });
        });

        it('should handle missing access error (50001)', async () => {
            const error = new Error('Missing Access');
            error.code = 50001;
            mockChannel.bulkDelete.mockRejectedValue(error);

            await clearCommand.execute(mockInteraction, mockAdminManager, mockPermissionValidator);

            expect(mockInteraction.editReply).toHaveBeenCalledWith({
                content: '❌ Accès manquant pour effectuer cette action.'
            });
        });

        it('should handle bulk delete age limit error (50034)', async () => {
            const error = new Error('Messages too old');
            error.code = 50034;
            mockChannel.bulkDelete.mockRejectedValue(error);

            await clearCommand.execute(mockInteraction, mockAdminManager, mockPermissionValidator);

            expect(mockInteraction.editReply).toHaveBeenCalledWith({
                content: '❌ Vous ne pouvez supprimer que les messages de moins de 14 jours en masse.'
            });
        });

        it('should handle message not found error (10008)', async () => {
            const error = new Error('Unknown Message');
            error.code = 10008;
            mockChannel.bulkDelete.mockRejectedValue(error);

            await clearCommand.execute(mockInteraction, mockAdminManager, mockPermissionValidator);

            expect(mockInteraction.editReply).toHaveBeenCalledWith({
                content: '❌ Message non trouvé (peut-être déjà supprimé).'
            });
        });

        it('should handle generic deletion error', async () => {
            mockChannel.bulkDelete.mockRejectedValue(new Error('Generic error'));

            await clearCommand.execute(mockInteraction, mockAdminManager, mockPermissionValidator);

            expect(mockInteraction.editReply).toHaveBeenCalledWith({
                content: '❌ Une erreur est survenue lors de la suppression des messages.'
            });
        });

        it('should handle unexpected errors', async () => {
            mockPermissionValidator.validateMessageCount.mockImplementation(() => {
                throw new Error('Unexpected error');
            });

            await clearCommand.execute(mockInteraction, mockAdminManager, mockPermissionValidator);

            expect(mockInteraction.reply).toHaveBeenCalledWith({
                content: '❌ Une erreur inattendue est survenue lors de l\'exécution de la commande.',
                ephemeral: true
            });
        });

        it('should handle errors when interaction deferred', async () => {
            mockInteraction.deferred = true;
            mockPermissionValidator.validateMessageCount.mockImplementation(() => {
                throw new Error('Unexpected error');
            });

            await clearCommand.execute(mockInteraction, mockAdminManager, mockPermissionValidator);

            expect(mockInteraction.editReply).toHaveBeenCalledWith({
                content: '❌ Une erreur inattendue est survenue lors de l\'exécution de la commande.'
            });
        });

        it('should handle errors when interaction already replied', async () => {
            mockInteraction.replied = true;
            mockPermissionValidator.validateMessageCount.mockImplementation(() => {
                throw new Error('Unexpected error');
            });

            await clearCommand.execute(mockInteraction, mockAdminManager, mockPermissionValidator);

            expect(mockInteraction.followUp).toHaveBeenCalledWith({
                content: '❌ Une erreur inattendue est survenue lors de l\'exécution de la commande.',
                ephemeral: true
            });
        });
    });

    describe('Logging', () => {
        it('should log successful clear action', async () => {
            const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

            await clearCommand.execute(mockInteraction, mockAdminManager, mockPermissionValidator);

            expect(consoleSpy).toHaveBeenCalledWith(
                expect.stringContaining('[CLEAR]')
            );
            expect(consoleSpy).toHaveBeenCalledWith(
                expect.stringContaining('test-channel')
            );
            expect(consoleSpy).toHaveBeenCalledWith(
                expect.stringContaining('Moderator#5678')
            );

            consoleSpy.mockRestore();
        });
    });
});