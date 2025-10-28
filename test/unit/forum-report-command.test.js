import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { execute } from '../../commands/forum-report.js';

describe('Forum Report Command', () => {
    let mockInteraction;
    let mockAdminManager;
    let mockPermissionValidator;
    let mockWatchlistManager;
    let mockReportManager;
    let mockForumReportManager;

    beforeEach(() => {
        // Mock interaction
        mockInteraction = {
            options: {
                getSubcommand: vi.fn(),
                getUser: vi.fn(),
                getString: vi.fn()
            },
            user: {
                id: 'user123',
                username: 'testuser'
            },
            member: {
                id: 'user123',
                permissions: {
                    has: vi.fn().mockReturnValue(true)
                }
            },
            guildId: 'guild123',
            channelId: 'channel123',
            reply: vi.fn().mockResolvedValue({}),
            editReply: vi.fn().mockResolvedValue({})
        };

        // Mock managers
        mockAdminManager = {
            isAdmin: vi.fn().mockReturnValue(false)
        };

        mockPermissionValidator = {
            validateModerationPermission: vi.fn().mockReturnValue(true),
            validateAdminPermission: vi.fn().mockReturnValue(true)
        };

        mockWatchlistManager = {};

        mockReportManager = {
            report: vi.fn().mockResolvedValue({ success: true })
        };

        mockForumReportManager = {
            createForumReport: vi.fn().mockResolvedValue({
                success: true,
                reportId: '000001',
                forumPostId: 'thread123',
                message: 'Report created successfully'
            }),
            updateReportStatus: vi.fn().mockResolvedValue({
                success: true,
                message: 'Status updated successfully'
            }),
            addReportNote: vi.fn().mockResolvedValue({
                success: true,
                message: 'Note added successfully'
            }),
            resolveReport: vi.fn().mockResolvedValue({
                success: true,
                message: 'Report resolved successfully'
            }),
            linkRelatedReports: vi.fn().mockResolvedValue({
                success: true,
                message: 'Reports linked successfully'
            }),
            getReportsByUser: vi.fn().mockResolvedValue([]),
            getReportsByCategory: vi.fn().mockResolvedValue([]),
            getReportsByStatus: vi.fn().mockResolvedValue([]),
            getReportsByGuild: vi.fn().mockResolvedValue([]),
            getStatistics: vi.fn().mockReturnValue({
                total: 10,
                byStatus: { open: 3, investigating: 2, resolved: 5 },
                byCategory: { spam: 4, harassment: 3, other: 3 },
                byPriority: { Critical: 1, High: 2, Medium: 4, Low: 3 },
                averageResolutionTime: 24
            }),
            configureSupportServer: vi.fn().mockResolvedValue({
                success: true,
                message: 'Support server configured successfully'
            }),
            getStatusEmoji: vi.fn().mockReturnValue('🟡'),
            categories: {
                spam: { emoji: '🚫', name: 'Spam' },
                harassment: { emoji: '⚠️', name: 'Harassment' }
            }
        };
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    describe('Create Report Subcommand', () => {
        beforeEach(() => {
            mockInteraction.options.getSubcommand.mockReturnValue('create');
        });

        it('should create a report successfully', async () => {
            const mockReportedUser = {
                id: 'reported123',
                username: 'reporteduser',
                tag: 'reporteduser#1234',
                bot: false
            };

            mockInteraction.options.getUser.mockReturnValue(mockReportedUser);
            mockInteraction.options.getString.mockImplementation((option) => {
                switch (option) {
                    case 'category': return 'spam';
                    case 'reason': return 'User is posting spam messages repeatedly';
                    case 'evidence': return 'Screenshots attached';
                    case 'message-id': return 'msg123';
                    default: return null;
                }
            });

            await execute(mockInteraction, mockAdminManager, mockPermissionValidator, 
                         mockWatchlistManager, mockReportManager, mockForumReportManager);

            expect(mockForumReportManager.createForumReport).toHaveBeenCalledWith(
                expect.objectContaining({
                    reportedUserId: 'reported123',
                    reportedUsername: 'reporteduser',
                    reporterUserId: 'user123',
                    reporterUsername: 'testuser',
                    category: 'spam',
                    reason: 'User is posting spam messages repeatedly',
                    evidence: 'Screenshots attached',
                    messageId: 'msg123',
                    channelId: 'channel123'
                }),
                'guild123'
            );

            expect(mockInteraction.reply).toHaveBeenCalledWith(
                expect.objectContaining({
                    embeds: expect.arrayContaining([
                        expect.objectContaining({
                            data: expect.objectContaining({
                                title: '✅ Rapport créé avec succès'
                            })
                        })
                    ]),
                    ephemeral: true
                })
            );
        });

        it('should reject self-reporting', async () => {
            const mockReportedUser = {
                id: 'user123', // Same as interaction.user.id
                username: 'testuser',
                bot: false
            };

            mockInteraction.options.getUser.mockReturnValue(mockReportedUser);
            mockInteraction.options.getString.mockImplementation((option) => {
                switch (option) {
                    case 'category': return 'spam';
                    case 'reason': return 'Test reason';
                    default: return null;
                }
            });

            await execute(mockInteraction, mockAdminManager, mockPermissionValidator, 
                         mockWatchlistManager, mockReportManager, mockForumReportManager);

            expect(mockInteraction.reply).toHaveBeenCalledWith({
                content: '❌ Vous ne pouvez pas vous signaler vous-même.',
                ephemeral: true
            });

            expect(mockForumReportManager.createForumReport).not.toHaveBeenCalled();
        });

        it('should reject reporting bots', async () => {
            const mockReportedUser = {
                id: 'bot123',
                username: 'testbot',
                bot: true
            };

            mockInteraction.options.getUser.mockReturnValue(mockReportedUser);
            mockInteraction.options.getString.mockImplementation((option) => {
                switch (option) {
                    case 'category': return 'spam';
                    case 'reason': return 'Test reason';
                    default: return null;
                }
            });

            await execute(mockInteraction, mockAdminManager, mockPermissionValidator, 
                         mockWatchlistManager, mockReportManager, mockForumReportManager);

            expect(mockInteraction.reply).toHaveBeenCalledWith({
                content: '❌ Vous ne pouvez pas signaler un bot.',
                ephemeral: true
            });

            expect(mockForumReportManager.createForumReport).not.toHaveBeenCalled();
        });

        it('should reject short reasons', async () => {
            const mockReportedUser = {
                id: 'reported123',
                username: 'reporteduser',
                bot: false
            };

            mockInteraction.options.getUser.mockReturnValue(mockReportedUser);
            mockInteraction.options.getString.mockImplementation((option) => {
                switch (option) {
                    case 'category': return 'spam';
                    case 'reason': return 'short'; // Less than 10 characters
                    default: return null;
                }
            });

            await execute(mockInteraction, mockAdminManager, mockPermissionValidator, 
                         mockWatchlistManager, mockReportManager, mockForumReportManager);

            expect(mockInteraction.reply).toHaveBeenCalledWith({
                content: '❌ La raison doit contenir au moins 10 caractères.',
                ephemeral: true
            });

            expect(mockForumReportManager.createForumReport).not.toHaveBeenCalled();
        });

        it('should handle forum report creation failure', async () => {
            const mockReportedUser = {
                id: 'reported123',
                username: 'reporteduser',
                bot: false
            };

            mockInteraction.options.getUser.mockReturnValue(mockReportedUser);
            mockInteraction.options.getString.mockImplementation((option) => {
                switch (option) {
                    case 'category': return 'spam';
                    case 'reason': return 'Valid reason for reporting';
                    default: return null;
                }
            });

            mockForumReportManager.createForumReport.mockResolvedValue({
                success: false,
                message: 'Forum channel not configured'
            });

            await execute(mockInteraction, mockAdminManager, mockPermissionValidator, 
                         mockWatchlistManager, mockReportManager, mockForumReportManager);

            expect(mockInteraction.reply).toHaveBeenCalledWith({
                content: '❌ Forum channel not configured',
                ephemeral: true
            });
        });
    });

    describe('Status Update Subcommand', () => {
        beforeEach(() => {
            mockInteraction.options.getSubcommand.mockReturnValue('status');
            mockInteraction.options.getString.mockImplementation((option) => {
                switch (option) {
                    case 'report-id': return '000001';
                    case 'status': return 'investigating';
                    default: return null;
                }
            });
        });

        it('should update report status successfully', async () => {
            await execute(mockInteraction, mockAdminManager, mockPermissionValidator, 
                         mockWatchlistManager, mockReportManager, mockForumReportManager);

            expect(mockForumReportManager.updateReportStatus).toHaveBeenCalledWith(
                '000001', 'investigating', 'user123'
            );

            expect(mockInteraction.reply).toHaveBeenCalledWith({
                content: '✅ Status updated successfully',
                ephemeral: true
            });
        });

        it('should reject non-moderators', async () => {
            mockPermissionValidator.validateModerationPermission.mockReturnValue(false);

            await execute(mockInteraction, mockAdminManager, mockPermissionValidator, 
                         mockWatchlistManager, mockReportManager, mockForumReportManager);

            expect(mockInteraction.reply).toHaveBeenCalledWith({
                content: '❌ Vous n\'avez pas les permissions nécessaires pour cette action.',
                ephemeral: true
            });

            expect(mockForumReportManager.updateReportStatus).not.toHaveBeenCalled();
        });
    });

    describe('Add Note Subcommand', () => {
        beforeEach(() => {
            mockInteraction.options.getSubcommand.mockReturnValue('note');
            mockInteraction.options.getString.mockImplementation((option) => {
                switch (option) {
                    case 'report-id': return '000001';
                    case 'note': return 'Additional investigation notes';
                    default: return null;
                }
            });
        });

        it('should add note successfully', async () => {
            await execute(mockInteraction, mockAdminManager, mockPermissionValidator, 
                         mockWatchlistManager, mockReportManager, mockForumReportManager);

            expect(mockForumReportManager.addReportNote).toHaveBeenCalledWith(
                '000001', 'Additional investigation notes', 'user123'
            );

            expect(mockInteraction.reply).toHaveBeenCalledWith({
                content: '✅ Note added successfully',
                ephemeral: true
            });
        });
    });

    describe('Resolve Report Subcommand', () => {
        beforeEach(() => {
            mockInteraction.options.getSubcommand.mockReturnValue('resolve');
            mockInteraction.options.getString.mockImplementation((option) => {
                switch (option) {
                    case 'report-id': return '000001';
                    case 'resolution': return 'User has been warned and content removed';
                    default: return null;
                }
            });
        });

        it('should resolve report successfully', async () => {
            await execute(mockInteraction, mockAdminManager, mockPermissionValidator, 
                         mockWatchlistManager, mockReportManager, mockForumReportManager);

            expect(mockForumReportManager.resolveReport).toHaveBeenCalledWith(
                '000001', 'User has been warned and content removed', 'user123'
            );

            expect(mockInteraction.reply).toHaveBeenCalledWith({
                content: '✅ Report resolved successfully',
                ephemeral: true
            });
        });
    });

    describe('Link Reports Subcommand', () => {
        beforeEach(() => {
            mockInteraction.options.getSubcommand.mockReturnValue('link');
            mockInteraction.options.getString.mockReturnValue('000001, 000002, 000003');
        });

        it('should link reports successfully', async () => {
            await execute(mockInteraction, mockAdminManager, mockPermissionValidator, 
                         mockWatchlistManager, mockReportManager, mockForumReportManager);

            expect(mockForumReportManager.linkRelatedReports).toHaveBeenCalledWith(
                ['000001', '000002', '000003']
            );

            expect(mockInteraction.reply).toHaveBeenCalledWith({
                content: '✅ Reports linked successfully',
                ephemeral: true
            });
        });
    });

    describe('Search Reports Subcommand', () => {
        beforeEach(() => {
            mockInteraction.options.getSubcommand.mockReturnValue('search');
        });

        it('should search reports by user', async () => {
            mockInteraction.options.getString.mockImplementation((option) => {
                switch (option) {
                    case 'type': return 'user';
                    case 'value': return 'user123';
                    default: return null;
                }
            });

            const mockReports = [
                { id: '000001', category: 'spam', reportedUser: 'user123', status: 'open' },
                { id: '000002', category: 'harassment', reportedUser: 'user123', status: 'resolved' }
            ];

            mockForumReportManager.getReportsByUser.mockResolvedValue(mockReports);

            await execute(mockInteraction, mockAdminManager, mockPermissionValidator, 
                         mockWatchlistManager, mockReportManager, mockForumReportManager);

            expect(mockForumReportManager.getReportsByUser).toHaveBeenCalledWith('user123');

            expect(mockInteraction.reply).toHaveBeenCalledWith(
                expect.objectContaining({
                    embeds: expect.arrayContaining([
                        expect.objectContaining({
                            data: expect.objectContaining({
                                title: '🔍 Reports for User ID: user123',
                                description: 'Found 2 report(s)'
                            })
                        })
                    ]),
                    ephemeral: true
                })
            );
        });

        it('should search reports by category', async () => {
            mockInteraction.options.getString.mockImplementation((option) => {
                switch (option) {
                    case 'type': return 'category';
                    case 'value': return 'spam';
                    default: return null;
                }
            });

            await execute(mockInteraction, mockAdminManager, mockPermissionValidator, 
                         mockWatchlistManager, mockReportManager, mockForumReportManager);

            expect(mockForumReportManager.getReportsByCategory).toHaveBeenCalledWith('spam');
        });
    });

    describe('Statistics Subcommand', () => {
        beforeEach(() => {
            mockInteraction.options.getSubcommand.mockReturnValue('stats');
        });

        it('should display statistics successfully', async () => {
            await execute(mockInteraction, mockAdminManager, mockPermissionValidator, 
                         mockWatchlistManager, mockReportManager, mockForumReportManager);

            expect(mockForumReportManager.getStatistics).toHaveBeenCalled();

            expect(mockInteraction.reply).toHaveBeenCalledWith(
                expect.objectContaining({
                    embeds: expect.arrayContaining([
                        expect.objectContaining({
                            data: expect.objectContaining({
                                title: '📊 Report Statistics'
                            })
                        })
                    ]),
                    ephemeral: true
                })
            );
        });
    });

    describe('Configure Subcommand', () => {
        beforeEach(() => {
            mockInteraction.options.getSubcommand.mockReturnValue('configure');
            mockInteraction.options.getString.mockImplementation((option) => {
                switch (option) {
                    case 'support-guild-id': return 'support123';
                    case 'forum-channel-id': return 'forum456';
                    default: return null;
                }
            });
        });

        it('should configure support server successfully', async () => {
            await execute(mockInteraction, mockAdminManager, mockPermissionValidator, 
                         mockWatchlistManager, mockReportManager, mockForumReportManager);

            expect(mockForumReportManager.configureSupportServer).toHaveBeenCalledWith(
                'support123', 'forum456'
            );

            expect(mockInteraction.reply).toHaveBeenCalledWith({
                content: '✅ Support server configured successfully',
                ephemeral: true
            });
        });

        it('should reject non-administrators', async () => {
            mockPermissionValidator.validateAdminPermission.mockReturnValue(false);

            await execute(mockInteraction, mockAdminManager, mockPermissionValidator, 
                         mockWatchlistManager, mockReportManager, mockForumReportManager);

            expect(mockInteraction.reply).toHaveBeenCalledWith({
                content: '❌ Vous devez être administrateur pour configurer le système.',
                ephemeral: true
            });

            expect(mockForumReportManager.configureSupportServer).not.toHaveBeenCalled();
        });
    });

    describe('Error Handling', () => {
        it('should handle unknown subcommands', async () => {
            mockInteraction.options.getSubcommand.mockReturnValue('unknown');

            await execute(mockInteraction, mockAdminManager, mockPermissionValidator, 
                         mockWatchlistManager, mockReportManager, mockForumReportManager);

            expect(mockInteraction.reply).toHaveBeenCalledWith({
                content: '❌ Sous-commande non reconnue.',
                ephemeral: true
            });
        });

        it('should handle unexpected errors', async () => {
            mockInteraction.options.getSubcommand.mockImplementation(() => {
                throw new Error('Unexpected error');
            });

            await execute(mockInteraction, mockAdminManager, mockPermissionValidator, 
                         mockWatchlistManager, mockReportManager, mockForumReportManager);

            expect(mockInteraction.reply).toHaveBeenCalledWith({
                content: '❌ Une erreur inattendue est survenue lors de l\'exécution de la commande.',
                ephemeral: true
            });
        });
    });
});