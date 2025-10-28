import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ChannelType } from 'discord.js';
import setupReportsForumCommand from '../../commands/setup-reports-forum.js';
import autoConfigCommand from '../../commands/auto-config.js';

describe('Report and Configuration Commands', () => {
    let mockInteraction;
    let mockAdminManager;
    let mockForumReportManager;
    let mockAutoConfigManager;
    let mockClient;
    let mockGuild;
    let mockSupportGuild;
    let mockForumChannel;
    let mockMember;

    beforeEach(() => {
        // Mock member with permissions
        mockMember = {
            permissions: {
                has: vi.fn().mockReturnValue(true)
            },
            permissionsIn: vi.fn().mockReturnValue({
                has: vi.fn().mockReturnValue(true)
            })
        };

        // Mock forum channel
        mockForumChannel = {
            id: 'forum-channel-123',
            name: 'reports-forum',
            type: ChannelType.GuildForum,
            guild: {
                id: 'support-server-123'
            }
        };

        // Mock support guild
        mockSupportGuild = {
            id: 'support-server-123',
            name: 'Support Server',
            memberCount: 150,
            ownerId: 'owner-123',
            members: {
                cache: {
                    get: vi.fn().mockReturnValue(mockMember)
                }
            },
            channels: {
                cache: {
                    get: vi.fn().mockReturnValue(mockForumChannel),
                    find: vi.fn().mockReturnValue(null)
                }
            },
            roles: {
                cache: {
                    find: vi.fn().mockReturnValue(null),
                    some: vi.fn().mockReturnValue(false)
                },
                everyone: { id: 'everyone-role' }
            },
            systemChannel: null
        };

        // Mock current guild
        mockGuild = {
            id: 'current-guild-123',
            name: 'Test Guild',
            memberCount: 150,
            ownerId: 'owner-123',
            members: {
                cache: {
                    get: vi.fn().mockReturnValue(mockMember)
                }
            },
            channels: {
                cache: {
                    find: vi.fn().mockReturnValue({
                        name: 'general',
                        isTextBased: () => true,
                        permissionsFor: () => ({ has: () => true }),
                        send: vi.fn().mockResolvedValue({ id: 'message-123' })
                    }),
                    some: vi.fn().mockReturnValue(false)
                },
                create: vi.fn().mockResolvedValue({
                    id: 'new-channel-123',
                    name: 'test-channel',
                    permissionOverwrites: {
                        create: vi.fn().mockResolvedValue()
                    }
                })
            },
            roles: {
                cache: {
                    find: vi.fn().mockReturnValue(null),
                    some: vi.fn().mockReturnValue(false)
                },
                everyone: { id: 'everyone-role' },
                create: vi.fn().mockResolvedValue({
                    id: 'new-role-123',
                    name: 'test-role'
                })
            },
            systemChannel: null
        };

        mockClient = {
            user: { 
                id: 'bot-123',
                displayAvatarURL: vi.fn().mockReturnValue('https://example.com/avatar.png')
            },
            guilds: {
                cache: {
                    get: vi.fn((id) => {
                        if (id === 'support-server-123') return mockSupportGuild;
                        if (id === 'current-guild-123') return mockGuild;
                        return null;
                    })
                }
            }
        };

        mockInteraction = {
            user: { id: 'user-123', tag: 'TestUser#1234' },
            client: mockClient,
            guild: mockGuild,
            channel: { name: 'test-channel' },
            options: {
                getString: vi.fn(),
                getChannel: vi.fn(),
                getSubcommand: vi.fn()
            },
            reply: vi.fn().mockResolvedValue(),
            deferReply: vi.fn().mockResolvedValue(),
            editReply: vi.fn().mockResolvedValue()
        };

        mockAdminManager = {
            isAdmin: vi.fn().mockReturnValue(true)
        };

        mockForumReportManager = {
            setupReportsForum: vi.fn().mockResolvedValue({
                success: true,
                message: 'Forum configured successfully'
            }),
            getConfig: vi.fn().mockReturnValue({
                supportGuildId: 'support-server-123',
                reportsForumId: 'forum-channel-123',
                categories: {
                    spam: { emoji: '🚫', name: 'Spam', description: 'Spam messages' },
                    harassment: { emoji: '⚠️', name: 'Harassment', description: 'Harassment or bullying' },
                    other: { emoji: '❓', name: 'Other', description: 'Other violations' }
                }
            })
        };

        mockAutoConfigManager = {
            detectServerSize: vi.fn().mockReturnValue('medium'),
            previewConfiguration: vi.fn().mockResolvedValue({
                success: true,
                template: {
                    name: 'medium',
                    description: 'Medium server template for 100-1000 members',
                    maxMembers: 1000
                },
                preview: {
                    channelsToCreate: ['moderation-log', 'reports'],
                    rolesToCreate: ['Moderator'],
                    configChanges: ['antiInvite', 'raidDetection'],
                    conflicts: {
                        existingChannels: [],
                        existingRoles: []
                    }
                },
                validation: {
                    isValid: true,
                    warnings: [],
                    recommendations: []
                }
            }),
            configureNewGuild: vi.fn().mockResolvedValue({
                success: true,
                templateUsed: 'medium',
                channels: { created: [{ id: 'ch1', name: 'moderation-log' }], errors: [] },
                roles: { created: [{ id: 'role1', name: 'Moderator' }], errors: [] },
                configApplied: true
            }),
            validateSetupPermissions: vi.fn().mockReturnValue({
                valid: true,
                missing: []
            }),
            generateWelcomeMessage: vi.fn().mockReturnValue({
                embeds: [{ title: 'Welcome!' }],
                content: 'Server configured!'
            }),
            sendWelcomeMessage: vi.fn().mockResolvedValue({ id: 'message-123' })
        };
    });

    describe('setup-reports-forum command', () => {
        beforeEach(() => {
            mockInteraction.options.getString.mockReturnValue('support-server-123');
            mockInteraction.options.getChannel.mockReturnValue(mockForumChannel);
        });

        it('should configure reports forum successfully for admin', async () => {
            await setupReportsForumCommand.execute(
                mockInteraction,
                mockAdminManager,
                null, null, null, null, null, null, null, null, null, null, null, null, null, null,
                null, null, mockForumReportManager
            );

            expect(mockForumReportManager.setupReportsForum).toHaveBeenCalledWith(
                'support-server-123',
                'forum-channel-123'
            );
            expect(mockForumReportManager.setupReportsForum).toHaveBeenCalledWith(
                'support-server-123',
                'forum-channel-123'
            );
            expect(mockInteraction.reply).toHaveBeenCalled();
        });

        it('should reject non-admin users', async () => {
            mockAdminManager.isAdmin.mockReturnValue(false);

            await setupReportsForumCommand.execute(
                mockInteraction,
                mockAdminManager,
                null, null, null, null, null, null, null, null, null, null, null, null, null, null,
                null, null, mockForumReportManager
            );

            expect(mockInteraction.reply).toHaveBeenCalledWith({
                content: '❌ Vous devez être administrateur pour utiliser cette commande.',
                ephemeral: true
            });
        });

        it('should handle missing ForumReportManager', async () => {
            await setupReportsForumCommand.execute(
                mockInteraction,
                mockAdminManager,
                null, null, null, null, null, null, null, null, null, null, null, null, null, null,
                null, null, null // No ForumReportManager
            );

            expect(mockInteraction.reply).toHaveBeenCalledWith({
                content: '❌ Le système de rapports par forum n\'est pas disponible.',
                ephemeral: true
            });
        });

        it('should handle invalid support server', async () => {
            mockInteraction.options.getString.mockReturnValue('invalid-server');
            mockClient.guilds.cache.get.mockReturnValue(null);

            await setupReportsForumCommand.execute(
                mockInteraction,
                mockAdminManager,
                null, null, null, null, null, null, null, null, null, null, null, null, null, null,
                null, null, mockForumReportManager
            );

            expect(mockInteraction.reply).toHaveBeenCalledWith({
                content: '❌ Le serveur de support spécifié est introuvable ou le bot n\'y a pas accès.',
                ephemeral: true
            });
        });

        it('should handle forum channel not in support server', async () => {
            mockForumChannel.guild.id = 'different-server';

            await setupReportsForumCommand.execute(
                mockInteraction,
                mockAdminManager,
                null, null, null, null, null, null, null, null, null, null, null, null, null, null,
                null, null, mockForumReportManager
            );

            expect(mockInteraction.reply).toHaveBeenCalledWith({
                content: '❌ Le canal forum doit être dans le serveur de support spécifié.',
                ephemeral: true
            });
        });

        it('should handle non-forum channel type', async () => {
            mockForumChannel.type = ChannelType.GuildText;

            await setupReportsForumCommand.execute(
                mockInteraction,
                mockAdminManager,
                null, null, null, null, null, null, null, null, null, null, null, null, null, null,
                null, null, mockForumReportManager
            );

            expect(mockInteraction.reply).toHaveBeenCalledWith({
                content: '❌ Le canal spécifié doit être un canal forum.',
                ephemeral: true
            });
        });

        it('should handle missing bot permissions', async () => {
            mockMember.permissionsIn.mockReturnValue({
                has: vi.fn().mockReturnValue(false)
            });

            await setupReportsForumCommand.execute(
                mockInteraction,
                mockAdminManager,
                null, null, null, null, null, null, null, null, null, null, null, null, null, null,
                null, null, mockForumReportManager
            );

            expect(mockInteraction.reply).toHaveBeenCalledWith({
                content: expect.stringContaining('❌ Le bot manque des permissions requises'),
                ephemeral: true
            });
        });

        it('should handle setup failure', async () => {
            mockForumReportManager.setupReportsForum.mockResolvedValue({
                success: false,
                message: 'Configuration failed'
            });

            await setupReportsForumCommand.execute(
                mockInteraction,
                mockAdminManager,
                null, null, null, null, null, null, null, null, null, null, null, null, null, null,
                null, null, mockForumReportManager
            );

            expect(mockInteraction.reply).toHaveBeenCalledWith({
                content: '❌ Erreur lors de la configuration: Configuration failed',
                ephemeral: true
            });
        });
    });

    describe('auto-config command', () => {
        describe('preview subcommand', () => {
            beforeEach(() => {
                mockInteraction.options.getSubcommand.mockReturnValue('preview');
                mockInteraction.options.getString.mockReturnValue('medium');
            });

            it('should show configuration preview for admin', async () => {
                await autoConfigCommand.execute(
                    mockInteraction,
                    mockAdminManager,
                    null, null, null, null, null, null, null, null, null, null, null, null, null, null,
                    null, null, null, mockAutoConfigManager
                );

                expect(mockAutoConfigManager.previewConfiguration).toHaveBeenCalledWith(
                    mockGuild,
                    'medium'
                );
                expect(mockAutoConfigManager.previewConfiguration).toHaveBeenCalledWith(
                    mockGuild,
                    'medium'
                );
                expect(mockInteraction.reply).toHaveBeenCalled();
            });

            it('should handle preview failure', async () => {
                mockAutoConfigManager.previewConfiguration.mockResolvedValue({
                    success: false,
                    error: 'Template not found'
                });

                await autoConfigCommand.execute(
                    mockInteraction,
                    mockAdminManager,
                    null, null, null, null, null, null, null, null, null, null, null, null, null, null,
                    null, null, null, mockAutoConfigManager
                );

                expect(mockInteraction.reply).toHaveBeenCalledWith({
                    content: '❌ Erreur lors de la prévisualisation: Template not found',
                    ephemeral: true
                });
            });

            it('should show conflicts in preview', async () => {
                mockAutoConfigManager.previewConfiguration.mockResolvedValue({
                    success: true,
                    template: { name: 'medium', description: 'Test template', maxMembers: 1000 },
                    preview: {
                        channelsToCreate: ['moderation-log'],
                        rolesToCreate: ['Moderator'],
                        configChanges: ['antiInvite'],
                        conflicts: {
                            existingChannels: ['general'],
                            existingRoles: ['Admin']
                        }
                    },
                    validation: {
                        isValid: false,
                        warnings: ['Some warnings'],
                        recommendations: ['Some recommendations']
                    }
                });

                await autoConfigCommand.execute(
                    mockInteraction,
                    mockAdminManager,
                    null, null, null, null, null, null, null, null, null, null, null, null, null, null,
                    null, null, null, mockAutoConfigManager
                );

                expect(mockInteraction.reply).toHaveBeenCalled();
            });
        });

        describe('apply subcommand', () => {
            beforeEach(() => {
                mockInteraction.options.getSubcommand.mockReturnValue('apply');
                mockInteraction.options.getString.mockReturnValue('medium');
            });

            it('should apply configuration successfully for admin', async () => {
                await autoConfigCommand.execute(
                    mockInteraction,
                    mockAdminManager,
                    null, null, null, null, null, null, null, null, null, null, null, null, null, null,
                    null, null, null, mockAutoConfigManager
                );

                expect(mockInteraction.deferReply).toHaveBeenCalled();
                expect(mockAutoConfigManager.configureNewGuild).toHaveBeenCalledWith(
                    mockGuild,
                    'medium'
                );
                expect(mockAutoConfigManager.generateWelcomeMessage).toHaveBeenCalled();
                expect(mockInteraction.editReply).toHaveBeenCalled();
            });

            it('should handle configuration failure', async () => {
                mockAutoConfigManager.configureNewGuild.mockResolvedValue({
                    success: false,
                    error: 'Permission denied',
                    issues: ['Missing permissions']
                });

                await autoConfigCommand.execute(
                    mockInteraction,
                    mockAdminManager,
                    null, null, null, null, null, null, null, null, null, null, null, null, null, null,
                    null, null, null, mockAutoConfigManager
                );

                expect(mockInteraction.editReply).toHaveBeenCalledWith({
                    content: expect.stringContaining('❌ Erreur lors de la configuration: Permission denied')
                });
            });

            it('should send welcome message to general channel if different from interaction', async () => {
                mockInteraction.channel.name = 'admin-commands';

                await autoConfigCommand.execute(
                    mockInteraction,
                    mockAdminManager,
                    null, null, null, null, null, null, null, null, null, null, null, null, null, null,
                    null, null, null, mockAutoConfigManager
                );

                expect(mockAutoConfigManager.sendWelcomeMessage).toHaveBeenCalledWith(
                    mockGuild,
                    expect.any(Object)
                );
            });
        });

        describe('validate subcommand', () => {
            beforeEach(() => {
                mockInteraction.options.getSubcommand.mockReturnValue('validate');
            });

            it('should show validation success for admin', async () => {
                await autoConfigCommand.execute(
                    mockInteraction,
                    mockAdminManager,
                    null, null, null, null, null, null, null, null, null, null, null, null, null, null,
                    null, null, null, mockAutoConfigManager
                );

                expect(mockAutoConfigManager.validateSetupPermissions).toHaveBeenCalledWith(mockGuild);
                expect(mockAutoConfigManager.validateSetupPermissions).toHaveBeenCalledWith(mockGuild);
                expect(mockInteraction.reply).toHaveBeenCalled();
            });

            it('should show validation failure with missing permissions', async () => {
                mockAutoConfigManager.validateSetupPermissions.mockReturnValue({
                    valid: false,
                    missing: ['Manage Channels', 'Manage Roles']
                });

                await autoConfigCommand.execute(
                    mockInteraction,
                    mockAdminManager,
                    null, null, null, null, null, null, null, null, null, null, null, null, null, null,
                    null, null, null, mockAutoConfigManager
                );

                expect(mockAutoConfigManager.validateSetupPermissions).toHaveBeenCalledWith(mockGuild);
                expect(mockInteraction.reply).toHaveBeenCalled();
            });
        });

        it('should reject non-admin users', async () => {
            mockAdminManager.isAdmin.mockReturnValue(false);
            mockInteraction.options.getSubcommand.mockReturnValue('preview');

            await autoConfigCommand.execute(
                mockInteraction,
                mockAdminManager,
                null, null, null, null, null, null, null, null, null, null, null, null, null, null,
                null, null, null, mockAutoConfigManager
            );

            expect(mockInteraction.reply).toHaveBeenCalledWith({
                content: '❌ Vous devez être administrateur pour utiliser cette commande.',
                ephemeral: true
            });
        });

        it('should handle missing AutoConfigManager', async () => {
            mockInteraction.options.getSubcommand.mockReturnValue('preview');

            await autoConfigCommand.execute(
                mockInteraction,
                mockAdminManager,
                null, null, null, null, null, null, null, null, null, null, null, null, null, null,
                null, null, null, null // No AutoConfigManager
            );

            expect(mockInteraction.reply).toHaveBeenCalledWith({
                content: '❌ Le système de configuration automatique n\'est pas disponible.',
                ephemeral: true
            });
        });

        it('should handle errors gracefully', async () => {
            mockInteraction.options.getSubcommand.mockReturnValue('preview');
            mockAutoConfigManager.previewConfiguration.mockRejectedValue(new Error('Test error'));

            await autoConfigCommand.execute(
                mockInteraction,
                mockAdminManager,
                null, null, null, null, null, null, null, null, null, null, null, null, null, null,
                null, null, null, mockAutoConfigManager
            );

            expect(mockInteraction.reply).toHaveBeenCalledWith({
                content: '❌ Une erreur est survenue lors de la configuration automatique.',
                ephemeral: true
            });
        });
    });
});