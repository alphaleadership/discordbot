import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ChannelType } from 'discord.js';
import setupReportsForumCommand from '../../commands/setup-reports-forum.js';

describe('Setup Reports Forum Command - Validation Tests', () => {
    let mockInteraction;
    let mockAdminManager;
    let mockForumReportManager;
    let mockClient;
    let mockGuild;
    let mockForumChannel;
    let mockBotMember;

    beforeEach(() => {
        // Mock bot member with permissions
        mockBotMember = {
            permissionsIn: vi.fn().mockReturnValue({
                has: vi.fn().mockReturnValue(true)
            })
        };

        // Mock forum channel
        mockForumChannel = {
            id: 'forum-channel-123',
            name: 'rapports-forum',
            type: ChannelType.GuildForum,
            guild: {
                id: 'support-server-123',
                name: 'Support Server'
            }
        };

        // Mock guild
        mockGuild = {
            id: 'support-server-123',
            name: 'Support Server',
            channels: {
                cache: new Map([
                    ['forum-channel-123', mockForumChannel]
                ])
            },
            members: {
                cache: new Map([
                    ['bot-user-id', mockBotMember]
                ])
            }
        };

        // Mock client
        mockClient = {
            user: { id: 'bot-user-id' },
            guilds: {
                cache: new Map([
                    ['support-server-123', mockGuild]
                ])
            }
        };

        // Mock interaction
        mockInteraction = {
            user: { id: 'admin-user-123' },
            client: mockClient,
            options: {
                getString: vi.fn().mockImplementation((option) => {
                    if (option === 'support-server-id') return 'support-server-123';
                    return null;
                }),
                getChannel: vi.fn().mockReturnValue(mockForumChannel)
            },
            deferReply: vi.fn().mockResolvedValue(),
            editReply: vi.fn().mockResolvedValue(),
            followUp: vi.fn().mockResolvedValue(),
            reply: vi.fn().mockResolvedValue(),
            deferred: true
        };

        // Mock admin manager
        mockAdminManager = {
            isAdmin: vi.fn().mockReturnValue(true)
        };

        // Mock forum report manager
        mockForumReportManager = {
            setupReportsForum: vi.fn().mockResolvedValue({
                success: true,
                message: 'Configuration réussie'
            }),
            getConfig: vi.fn().mockReturnValue({
                categories: {
                    spam: { emoji: '🚫', name: 'Spam', description: 'Messages indésirables' },
                    harassment: { emoji: '⚠️', name: 'Harcèlement', description: 'Comportement toxique' }
                }
            })
        };
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    describe('Forum Channel Validation', () => {
        it('should require forum channel to be specified', async () => {
            mockInteraction.options.getChannel.mockReturnValue(null);

            await setupReportsForumCommand.execute(
                mockInteraction,
                mockAdminManager,
                null, null, null, null, null, null, null, null, null, null, null, null, null, null, null,
                mockForumReportManager
            );

            expect(mockInteraction.editReply).toHaveBeenCalledWith({
                content: expect.stringContaining('Vous devez obligatoirement spécifier un salon forum')
            });
        });

        it('should validate that channel is actually a forum channel', async () => {
            const textChannel = {
                ...mockForumChannel,
                type: ChannelType.GuildText
            };
            mockInteraction.options.getChannel.mockReturnValue(textChannel);

            await setupReportsForumCommand.execute(
                mockInteraction,
                mockAdminManager,
                null, null, null, null, null, null, null, null, null, null, null, null, null, null, null,
                mockForumReportManager
            );

            expect(mockInteraction.editReply).toHaveBeenCalledWith({
                content: expect.stringContaining('Le salon spécifié doit être un salon forum')
            });
        });

        it('should validate that forum channel is in the support server', async () => {
            const wrongServerChannel = {
                ...mockForumChannel,
                guild: {
                    id: 'different-server-456',
                    name: 'Different Server'
                }
            };
            mockInteraction.options.getChannel.mockReturnValue(wrongServerChannel);

            await setupReportsForumCommand.execute(
                mockInteraction,
                mockAdminManager,
                null, null, null, null, null, null, null, null, null, null, null, null, null, null, null,
                mockForumReportManager
            );

            expect(mockInteraction.editReply).toHaveBeenCalledWith({
                content: expect.stringContaining('Le salon forum doit être dans le serveur de support spécifié')
            });
        });

        it('should validate bot permissions in forum channel', async () => {
            mockBotMember.permissionsIn.mockReturnValue({
                has: vi.fn().mockReturnValue(false) // Missing permissions
            });

            await setupReportsForumCommand.execute(
                mockInteraction,
                mockAdminManager,
                null, null, null, null, null, null, null, null, null, null, null, null, null, null, null,
                mockForumReportManager
            );

            expect(mockInteraction.editReply).toHaveBeenCalledWith({
                content: expect.stringContaining('Le bot manque des permissions requises dans le salon forum')
            });
        });

        it('should validate that support server exists', async () => {
            mockClient.guilds.cache.clear(); // Remove the guild

            await setupReportsForumCommand.execute(
                mockInteraction,
                mockAdminManager,
                null, null, null, null, null, null, null, null, null, null, null, null, null, null, null,
                mockForumReportManager
            );

            expect(mockInteraction.editReply).toHaveBeenCalledWith({
                content: expect.stringContaining('Le serveur de support spécifié est introuvable')
            });
        });

        it('should validate that bot is member of support server', async () => {
            mockGuild.members.cache.clear(); // Remove bot member

            await setupReportsForumCommand.execute(
                mockInteraction,
                mockAdminManager,
                null, null, null, null, null, null, null, null, null, null, null, null, null, null, null,
                mockForumReportManager
            );

            expect(mockInteraction.editReply).toHaveBeenCalledWith({
                content: expect.stringContaining('Le bot n\'est pas membre du serveur de support spécifié')
            });
        });
    });

    describe('Successful Configuration', () => {
        it('should successfully configure forum when all validations pass', async () => {
            await setupReportsForumCommand.execute(
                mockInteraction,
                mockAdminManager,
                null, null, null, null, null, null, null, null, null, null, null, null, null, null, null,
                mockForumReportManager
            );

            expect(mockForumReportManager.setupReportsForum).toHaveBeenCalledWith(
                'support-server-123',
                'forum-channel-123'
            );

            expect(mockInteraction.editReply).toHaveBeenCalledWith({
                embeds: expect.arrayContaining([
                    expect.objectContaining({
                        data: expect.objectContaining({
                            title: expect.stringContaining('Configuration du Forum de Rapports Réussie')
                        })
                    })
                ])
            });
        });

        it('should show detailed success information', async () => {
            await setupReportsForumCommand.execute(
                mockInteraction,
                mockAdminManager,
                null, null, null, null, null, null, null, null, null, null, null, null, null, null, null,
                mockForumReportManager
            );

            const embedCall = mockInteraction.editReply.mock.calls[0][0];
            const embed = embedCall.embeds[0];
            
            expect(embed.data.description).toContain('Tous les rapports seront maintenant postés dans le salon forum spécifié');
            expect(embed.data.fields).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({
                        name: expect.stringContaining('Salon Forum Spécifié')
                    }),
                    expect.objectContaining({
                        name: expect.stringContaining('Important')
                    })
                ])
            );
        });
    });

    describe('Error Handling', () => {
        it('should handle ForumReportManager setup failure', async () => {
            mockForumReportManager.setupReportsForum.mockResolvedValue({
                success: false,
                message: 'Configuration failed for some reason'
            });

            await setupReportsForumCommand.execute(
                mockInteraction,
                mockAdminManager,
                null, null, null, null, null, null, null, null, null, null, null, null, null, null, null,
                mockForumReportManager
            );

            expect(mockInteraction.editReply).toHaveBeenCalledWith({
                content: expect.stringContaining('Erreur lors de la configuration du salon forum spécifié')
            });
        });

        it('should handle missing ForumReportManager', async () => {
            await setupReportsForumCommand.execute(
                mockInteraction,
                mockAdminManager,
                null, null, null, null, null, null, null, null, null, null, null, null, null, null, null,
                null // No ForumReportManager
            );

            expect(mockInteraction.editReply).toHaveBeenCalledWith({
                content: expect.stringContaining('Le système de rapports par forum n\'est pas disponible')
            });
        });

        it('should handle non-admin users', async () => {
            mockAdminManager.isAdmin.mockReturnValue(false);

            await setupReportsForumCommand.execute(
                mockInteraction,
                mockAdminManager,
                null, null, null, null, null, null, null, null, null, null, null, null, null, null, null,
                mockForumReportManager
            );

            expect(mockInteraction.editReply).toHaveBeenCalledWith({
                content: expect.stringContaining('Vous devez être administrateur')
            });
        });

        it('should handle unexpected errors gracefully', async () => {
            mockForumReportManager.setupReportsForum.mockRejectedValue(new Error('Unexpected error'));

            await setupReportsForumCommand.execute(
                mockInteraction,
                mockAdminManager,
                null, null, null, null, null, null, null, null, null, null, null, null, null, null, null,
                mockForumReportManager
            );

            expect(mockInteraction.editReply).toHaveBeenCalledWith({
                content: expect.stringContaining('Une erreur est survenue lors de la configuration du salon forum')
            });
        });
    });

    describe('User Experience', () => {
        it('should defer reply and show loading message', async () => {
            await setupReportsForumCommand.execute(
                mockInteraction,
                mockAdminManager,
                null, null, null, null, null, null, null, null, null, null, null, null, null, null, null,
                mockForumReportManager
            );

            expect(mockInteraction.deferReply).toHaveBeenCalledWith({ ephemeral: true });
        });

        it('should provide clear error messages with specific details', async () => {
            const textChannel = {
                ...mockForumChannel,
                type: ChannelType.GuildText
            };
            mockInteraction.options.getChannel.mockReturnValue(textChannel);

            await setupReportsForumCommand.execute(
                mockInteraction,
                mockAdminManager,
                null, null, null, null, null, null, null, null, null, null, null, null, null, null, null,
                mockForumReportManager
            );

            const errorMessage = mockInteraction.editReply.mock.calls[0][0].content;
            expect(errorMessage).toContain('salon forum');
            expect(errorMessage).toContain('type');
            expect(errorMessage).toContain('Créez un salon forum');
        });
    });
});