import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SlashCommandBuilder, ChannelType } from 'discord.js';
import { ForumReportManager } from '../../utils/ForumReportManager.js';
import { ReportManager } from '../../utils/ReportManager.js';
import { GuildConfig } from '../../utils/GuildConfig.js';
import reportCommand from '../../commands/report.js';
import fs from 'fs';
import path from 'path';

describe('Report System Migration Tests', () => {
    let forumReportManager;
    let reportManager;
    let guildConfig;
    let mockInteraction;
    let mockClient;
    let mockGuild;
    let mockUser;
    let mockTargetUser;
    let testDataDir;

    beforeEach(async () => {
        // Create test data directory
        testDataDir = path.join(process.cwd(), 'test', 'test-data', 'report-migration');
        if (!fs.existsSync(testDataDir)) {
            fs.mkdirSync(testDataDir, { recursive: true });
        }

        // Mock Discord objects
        mockUser = {
            id: 'reporter-123',
            tag: 'Reporter#1234',
            bot: false
        };

        mockTargetUser = {
            id: 'target-456',
            tag: 'Target#5678',
            bot: false
        };

        mockGuild = {
            id: 'test-guild-789',
            name: 'Test Guild',
            channels: {
                create: vi.fn().mockResolvedValue({
                    id: 'forum-channel-123',
                    type: ChannelType.GuildForum
                })
            }
        };

        mockClient = {
            user: { id: 'bot-id', tag: 'TestBot#0001' },
            guilds: {
                fetch: vi.fn().mockResolvedValue(mockGuild)
            },
            channels: {
                fetch: vi.fn().mockResolvedValue({
                    id: 'forum-channel-123',
                    type: ChannelType.GuildForum,
                    threads: {
                        create: vi.fn().mockResolvedValue({
                            id: 'forum-post-456',
                            send: vi.fn().mockResolvedValue({})
                        })
                    }
                })
            }
        };

        mockInteraction = {
            user: mockUser,
            guild: mockGuild,
            client: mockClient,
            options: {
                getUser: vi.fn((name) => {
                    if (name === 'utilisateur') return mockTargetUser;
                    return null;
                }),
                getString: vi.fn((name) => {
                    if (name === 'raison') return 'Test violation';
                    if (name === 'preuve') return 'Test evidence';
                    return null;
                })
            },
            reply: vi.fn().mockResolvedValue({})
        };

        // Initialize managers
        guildConfig = new GuildConfig(path.join(testDataDir, 'guilds_config.json'));
        reportManager = new ReportManager();
        forumReportManager = new ForumReportManager(mockClient, guildConfig, reportManager);
    });

    afterEach(() => {
        // Clean up test files
        if (fs.existsSync(testDataDir)) {
            fs.rmSync(testDataDir, { recursive: true, force: true });
        }
    });

    describe('Command Structure', () => {
        it('should have correct command structure', () => {
            expect(reportCommand.data).toBeInstanceOf(SlashCommandBuilder);
            expect(reportCommand.data.toJSON().name).toBe('report');
            expect(typeof reportCommand.execute).toBe('function');
        });

        it('should accept all required manager parameters', () => {
            // Test that the execute function can be called with all parameters
            expect(() => {
                reportCommand.execute(
                    mockInteraction,
                    null, // adminManager
                    null, // warnManager
                    guildConfig,
                    null, // sharedConfig
                    null, // backupToGitHub
                    reportManager,
                    null, // banlistManager
                    null, // blockedWordsManager
                    null, // watchlistManager
                    null, // telegramIntegration
                    null, // funCommandsManager
                    null, // raidDetector
                    null, // doxDetector
                    null, // enhancedReloadSystem
                    null, // permissionValidator
                    null, // economyManager
                    forumReportManager,
                    null  // autoConfigManager
                );
            }).not.toThrow();
        });
    });

    describe('Forum System Integration', () => {
        it('should use forum system when configured', async () => {
            // Configure forum system
            forumReportManager.supportGuildId = 'support-guild-123';
            forumReportManager.reportsForumId = 'forum-channel-456';

            // Mock successful forum report creation
            const createForumReportSpy = vi.spyOn(forumReportManager, 'createForumReport')
                .mockResolvedValue({
                    success: true,
                    reportId: 'forum-report-789'
                });

            await reportCommand.execute(
                mockInteraction,
                null, null, guildConfig, null, null, reportManager,
                null, null, null, null, null, null, null, null, null,
                null, forumReportManager, null
            );

            expect(createForumReportSpy).toHaveBeenCalledWith(
                expect.objectContaining({
                    reportedUser: mockTargetUser.id,
                    reportedBy: mockUser.id,
                    reason: 'Test violation',
                    proof: 'Test evidence',
                    category: 'general',
                    sourceGuild: mockGuild.id
                }),
                mockGuild
            );

            expect(mockInteraction.reply).toHaveBeenCalledWith({
                content: expect.stringContaining('✅ Votre signalement pour Target#5678 a été créé dans le système de forum'),
                ephemeral: true
            });
        });

        it('should fallback to regular system when forum not configured', async () => {
            // Don't configure forum system
            forumReportManager.supportGuildId = null;
            forumReportManager.reportsForumId = null;

            // Mock regular report system
            const reportSpy = vi.spyOn(reportManager, 'report')
                .mockResolvedValue({
                    success: true,
                    message: 'Report created successfully'
                });

            await reportCommand.execute(
                mockInteraction,
                null, null, guildConfig, null, null, reportManager,
                null, null, null, null, null, null, null, null, null,
                null, forumReportManager, null
            );

            expect(reportSpy).toHaveBeenCalledWith(
                mockClient,
                mockUser.id,
                mockTargetUser.id,
                'Test violation',
                'Test evidence'
            );

            expect(mockInteraction.reply).toHaveBeenCalledWith({
                content: '✅ Votre signalement pour Target#5678 a bien été pris en compte.',
                ephemeral: true
            });
        });

        it('should fallback to regular system when forum creation fails', async () => {
            // Configure forum system
            forumReportManager.supportGuildId = 'support-guild-123';
            forumReportManager.reportsForumId = 'forum-channel-456';

            // Mock forum report creation failure
            const createForumReportSpy = vi.spyOn(forumReportManager, 'createForumReport')
                .mockRejectedValue(new Error('Forum creation failed'));

            // Mock regular report system
            const reportSpy = vi.spyOn(reportManager, 'report')
                .mockResolvedValue({
                    success: true,
                    message: 'Report created successfully'
                });

            await reportCommand.execute(
                mockInteraction,
                null, null, guildConfig, null, null, reportManager,
                null, null, null, null, null, null, null, null, null,
                null, forumReportManager, null
            );

            expect(createForumReportSpy).toHaveBeenCalled();
            expect(reportSpy).toHaveBeenCalled();

            expect(mockInteraction.reply).toHaveBeenCalledWith({
                content: '✅ Votre signalement pour Target#5678 a bien été pris en compte.',
                ephemeral: true
            });
        });
    });

    describe('Backward Compatibility', () => {
        it('should work without forum manager', async () => {
            // Mock regular report system
            const reportSpy = vi.spyOn(reportManager, 'report')
                .mockResolvedValue({
                    success: true,
                    message: 'Report created successfully'
                });

            await reportCommand.execute(
                mockInteraction,
                null, null, guildConfig, null, null, reportManager,
                null, null, null, null, null, null, null, null, null,
                null, null, null // No forum manager
            );

            expect(reportSpy).toHaveBeenCalled();
            expect(mockInteraction.reply).toHaveBeenCalledWith({
                content: '✅ Votre signalement pour Target#5678 a bien été pris en compte.',
                ephemeral: true
            });
        });

        it('should preserve existing report data format', async () => {
            const reportSpy = vi.spyOn(reportManager, 'report')
                .mockResolvedValue({
                    success: true,
                    message: 'Report created successfully'
                });

            await reportCommand.execute(
                mockInteraction,
                null, null, guildConfig, null, null, reportManager,
                null, null, null, null, null, null, null, null, null,
                null, null, null
            );

            expect(reportSpy).toHaveBeenCalledWith(
                mockClient,
                mockUser.id,
                mockTargetUser.id,
                'Test violation',
                'Test evidence'
            );
        });
    });

    describe('Error Handling', () => {
        it('should handle self-reporting', async () => {
            mockInteraction.options.getUser = vi.fn(() => mockUser); // Same as reporter

            await reportCommand.execute(
                mockInteraction,
                null, null, guildConfig, null, null, reportManager,
                null, null, null, null, null, null, null, null, null,
                null, forumReportManager, null
            );

            expect(mockInteraction.reply).toHaveBeenCalledWith({
                content: '❌ Vous ne pouvez pas vous signaler vous-même.',
                ephemeral: true
            });
        });

        it('should handle bot reporting', async () => {
            const botUser = { ...mockTargetUser, bot: true };
            mockInteraction.options.getUser = vi.fn(() => botUser);

            await reportCommand.execute(
                mockInteraction,
                null, null, guildConfig, null, null, reportManager,
                null, null, null, null, null, null, null, null, null,
                null, forumReportManager, null
            );

            expect(mockInteraction.reply).toHaveBeenCalledWith({
                content: '❌ Vous ne pouvez pas signaler un bot.',
                ephemeral: true
            });
        });

        it('should handle report system failures', async () => {
            const reportSpy = vi.spyOn(reportManager, 'report')
                .mockResolvedValue({
                    success: false,
                    message: 'Report failed'
                });

            await reportCommand.execute(
                mockInteraction,
                null, null, guildConfig, null, null, reportManager,
                null, null, null, null, null, null, null, null, null,
                null, null, null
            );

            expect(mockInteraction.reply).toHaveBeenCalledWith({
                content: '❌ Report failed',
                ephemeral: true
            });
        });
    });

    describe('Data Migration', () => {
        it('should maintain report data consistency', async () => {
            // Test that both systems receive the same data
            forumReportManager.supportGuildId = 'support-guild-123';
            forumReportManager.reportsForumId = 'forum-channel-456';

            const createForumReportSpy = vi.spyOn(forumReportManager, 'createForumReport')
                .mockResolvedValue({
                    success: true,
                    reportId: 'forum-report-789'
                });

            await reportCommand.execute(
                mockInteraction,
                null, null, guildConfig, null, null, reportManager,
                null, null, null, null, null, null, null, null, null,
                null, forumReportManager, null
            );

            const forumCallArgs = createForumReportSpy.mock.calls[0][0];
            expect(forumCallArgs).toEqual({
                reportedUser: mockTargetUser.id,
                reportedBy: mockUser.id,
                reason: 'Test violation',
                proof: 'Test evidence',
                category: 'general',
                sourceGuild: mockGuild.id,
                timestamp: expect.any(String)
            });
        });

        it('should handle missing proof gracefully', async () => {
            mockInteraction.options.getString = vi.fn((name) => {
                if (name === 'raison') return 'Test violation';
                if (name === 'preuve') return null; // No proof provided
                return null;
            });

            const reportSpy = vi.spyOn(reportManager, 'report')
                .mockResolvedValue({
                    success: true,
                    message: 'Report created successfully'
                });

            await reportCommand.execute(
                mockInteraction,
                null, null, guildConfig, null, null, reportManager,
                null, null, null, null, null, null, null, null, null,
                null, null, null
            );

            expect(reportSpy).toHaveBeenCalledWith(
                mockClient,
                mockUser.id,
                mockTargetUser.id,
                'Test violation',
                'Aucune preuve fournie' // Default value
            );
        });
    });
});