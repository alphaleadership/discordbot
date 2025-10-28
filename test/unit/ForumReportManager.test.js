import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ForumReportManager } from '../../utils/ForumReportManager.js';
import fs from 'fs';
import path from 'path';

// Mock Discord.js
const mockClient = {
    user: { id: 'bot123', displayAvatarURL: () => 'bot-avatar.png' },
    guilds: {
        cache: new Map()
    },
    users: {
        fetch: vi.fn()
    }
};

const mockGuildConfig = {
    get: vi.fn(),
    set: vi.fn()
};

// Mock guild and channel objects
const createMockGuild = (id, name) => ({
    id,
    name,
    channels: {
        cache: new Map()
    },
    members: {
        cache: new Map([
            ['bot123', {
                permissionsIn: () => ({
                    has: () => true
                })
            }]
        ])
    }
});

const createMockForumChannel = (id) => ({
    id,
    type: 15, // GuildForum
    threads: {
        create: vi.fn(),
        cache: new Map()
    }
});

const createMockThread = (id) => ({
    id,
    messages: {
        fetch: vi.fn()
    }
});

describe('ForumReportManager - Status Management and Cross-referencing', () => {
    let manager;
    let testDataPath;

    beforeEach(() => {
        // Create temporary test data directory
        testDataPath = path.join(process.cwd(), 'test/test-data/forum_reports_test.json');
        
        // Mock the file path
        vi.spyOn(path, 'join').mockImplementation((...args) => {
            if (args.includes('data/forum_reports.json')) {
                return testDataPath;
            }
            return path.join(...args);
        });

        // Ensure test directory exists
        const testDir = path.dirname(testDataPath);
        if (!fs.existsSync(testDir)) {
            fs.mkdirSync(testDir, { recursive: true });
        }

        // Clean up any existing test file
        if (fs.existsSync(testDataPath)) {
            fs.unlinkSync(testDataPath);
        }

        manager = new ForumReportManager(mockClient, mockGuildConfig);
        
        // Setup mock guild and forum
        const mockGuild = createMockGuild('support123', 'Support Server');
        const mockForum = createMockForumChannel('forum456');
        mockGuild.channels.cache.set('forum456', mockForum);
        mockClient.guilds.cache.set('support123', mockGuild);
        
        // Configure the manager
        manager.supportGuildId = 'support123';
        manager.reportsForumId = 'forum456';
        manager.reports.config = {
            supportGuildId: 'support123',
            reportsForumId: 'forum456'
        };
    });

    afterEach(() => {
        // Clean up test file
        if (fs.existsSync(testDataPath)) {
            fs.unlinkSync(testDataPath);
        }
        vi.restoreAllMocks();
    });

    describe('Report Status Management', () => {
        it('should update report status successfully', async () => {
            // Create a test report
            const reportId = 'test_report_1';
            manager.reports.reports[reportId] = {
                id: reportId,
                forumPostId: 'thread123',
                status: 'open',
                reportedUser: 'user123',
                reportedBy: 'reporter456',
                category: 'spam',
                createdAt: new Date().toISOString()
            };

            // Mock forum thread and message
            const mockThread = createMockThread('thread123');
            const mockMessage = {
                embeds: [{
                    data: {
                        fields: [
                            { name: 'Status', value: '🔍 Open' },
                            { name: 'Category', value: '🚫 Spam' }
                        ]
                    }
                }],
                edit: vi.fn()
            };
            
            // Mock the messages collection with first() method
            const mockMessages = new Map([['msg1', mockMessage]]);
            mockMessages.first = () => mockMessage;
            mockThread.messages.fetch.mockResolvedValue(mockMessages);
            
            const mockForum = mockClient.guilds.cache.get('support123').channels.cache.get('forum456');
            mockForum.threads.cache.set('thread123', mockThread);

            const result = await manager.updateReportStatus(reportId, 'investigating', 'mod789', 'Looking into this issue');

            expect(result.success).toBe(true);
            expect(result.message).toBe('Report status updated to investigating');
            
            const updatedReport = manager.reports.reports[reportId];
            expect(updatedReport.status).toBe('investigating');
            expect(updatedReport.lastUpdatedBy).toBe('mod789');
            expect(updatedReport.statusHistory).toHaveLength(1);
            expect(updatedReport.statusHistory[0].status).toBe('investigating');
            expect(updatedReport.statusHistory[0].previousStatus).toBe('open');
            expect(updatedReport.statusHistory[0].notes).toBe('Looking into this issue');
        });

        it('should track resolution details when status changes to resolved', async () => {
            const reportId = 'test_report_2';
            manager.reports.reports[reportId] = {
                id: reportId,
                forumPostId: 'thread124',
                status: 'investigating',
                reportedUser: 'user123',
                reportedBy: 'reporter456',
                category: 'harassment',
                createdAt: new Date().toISOString()
            };

            const result = await manager.updateReportStatus(reportId, 'resolved', 'mod789');

            expect(result.success).toBe(true);
            
            const updatedReport = manager.reports.reports[reportId];
            expect(updatedReport.status).toBe('resolved');
            expect(updatedReport.resolvedBy).toBe('mod789');
            expect(updatedReport.resolvedAt).toBeDefined();
        });

        it('should clear resolution details when reopening a resolved report', async () => {
            const reportId = 'test_report_3';
            manager.reports.reports[reportId] = {
                id: reportId,
                forumPostId: 'thread125',
                status: 'resolved',
                resolvedBy: 'mod456',
                resolvedAt: new Date().toISOString(),
                reportedUser: 'user123',
                reportedBy: 'reporter456',
                category: 'spam',
                createdAt: new Date().toISOString()
            };

            const result = await manager.updateReportStatus(reportId, 'investigating', 'mod789');

            expect(result.success).toBe(true);
            
            const updatedReport = manager.reports.reports[reportId];
            expect(updatedReport.status).toBe('investigating');
            expect(updatedReport.resolvedBy).toBeNull();
            expect(updatedReport.resolvedAt).toBeNull();
        });

        it('should reject invalid status values', async () => {
            const reportId = 'test_report_4';
            manager.reports.reports[reportId] = {
                id: reportId,
                status: 'open',
                reportedUser: 'user123',
                reportedBy: 'reporter456',
                category: 'spam',
                createdAt: new Date().toISOString()
            };

            const result = await manager.updateReportStatus(reportId, 'invalid_status', 'mod789');

            expect(result.success).toBe(false);
            expect(result.message).toBe('Invalid status. Must be: open, investigating, or resolved');
        });

        it('should handle non-existent report IDs', async () => {
            const result = await manager.updateReportStatus('nonexistent', 'resolved', 'mod789');

            expect(result.success).toBe(false);
            expect(result.message).toBe('Report not found');
        });
    });

    describe('Report Cross-referencing and Linking', () => {
        beforeEach(() => {
            // Create test reports
            manager.reports.reports = {
                'report_1': {
                    id: 'report_1',
                    forumPostId: 'thread1',
                    reportedUser: 'user123',
                    reportedBy: 'reporter1',
                    category: 'spam',
                    status: 'open',
                    createdAt: new Date().toISOString(),
                    linkedReports: []
                },
                'report_2': {
                    id: 'report_2',
                    forumPostId: 'thread2',
                    reportedUser: 'user123',
                    reportedBy: 'reporter2',
                    category: 'spam',
                    status: 'open',
                    createdAt: new Date().toISOString(),
                    linkedReports: []
                },
                'report_3': {
                    id: 'report_3',
                    forumPostId: 'thread3',
                    reportedUser: 'user456',
                    reportedBy: 'reporter1',
                    category: 'harassment',
                    status: 'investigating',
                    createdAt: new Date().toISOString(),
                    linkedReports: []
                }
            };
        });

        it('should link multiple reports together', async () => {
            const reportIds = ['report_1', 'report_2'];
            const result = await manager.linkRelatedReports(reportIds, 'mod789', 'Same user, similar behavior');

            expect(result.success).toBe(true);
            expect(result.message).toBe('Successfully linked 2 reports together');

            // Check bidirectional linking
            const report1 = manager.reports.reports['report_1'];
            const report2 = manager.reports.reports['report_2'];

            expect(report1.linkedReports).toContain('report_2');
            expect(report2.linkedReports).toContain('report_1');
            
            expect(report1.linkHistory).toHaveLength(1);
            expect(report1.linkHistory[0].reason).toBe('Same user, similar behavior');
            expect(report1.linkHistory[0].linkedBy).toBe('mod789');
        });

        it('should link multiple reports (more than 2)', async () => {
            const reportIds = ['report_1', 'report_2', 'report_3'];
            const result = await manager.linkRelatedReports(reportIds, 'mod789');

            expect(result.success).toBe(true);
            expect(result.message).toBe('Successfully linked 3 reports together');

            // Each report should link to the other two
            const report1 = manager.reports.reports['report_1'];
            const report2 = manager.reports.reports['report_2'];
            const report3 = manager.reports.reports['report_3'];

            expect(report1.linkedReports).toEqual(expect.arrayContaining(['report_2', 'report_3']));
            expect(report2.linkedReports).toEqual(expect.arrayContaining(['report_1', 'report_3']));
            expect(report3.linkedReports).toEqual(expect.arrayContaining(['report_1', 'report_2']));
        });

        it('should prevent duplicate links', async () => {
            // First linking
            await manager.linkRelatedReports(['report_1', 'report_2'], 'mod789');
            
            // Second linking attempt
            const result = await manager.linkRelatedReports(['report_1', 'report_2'], 'mod456');

            expect(result.success).toBe(true);
            
            // Should not create duplicate links
            const report1 = manager.reports.reports['report_1'];
            const linkCount = report1.linkedReports.filter(id => id === 'report_2').length;
            expect(linkCount).toBe(1);
        });

        it('should reject linking with insufficient report IDs', async () => {
            const result = await manager.linkRelatedReports(['report_1'], 'mod789');

            expect(result.success).toBe(false);
            expect(result.message).toBe('At least 2 report IDs are required to create a link');
        });

        it('should reject linking with non-existent report IDs', async () => {
            const result = await manager.linkRelatedReports(['report_1', 'nonexistent'], 'mod789');

            expect(result.success).toBe(false);
            expect(result.message).toBe('Report nonexistent not found');
        });

        it('should unlink reports successfully', async () => {
            // First link the reports
            await manager.linkRelatedReports(['report_1', 'report_2'], 'mod789');
            
            // Then unlink them
            const result = await manager.unlinkReports(['report_1', 'report_2'], 'mod456', 'False positive');

            expect(result.success).toBe(true);
            expect(result.message).toBe('Successfully unlinked 2 reports');

            const report1 = manager.reports.reports['report_1'];
            const report2 = manager.reports.reports['report_2'];

            expect(report1.linkedReports).not.toContain('report_2');
            expect(report2.linkedReports).not.toContain('report_1');
            
            // Check unlink history
            expect(report1.linkHistory).toHaveLength(2); // Link + unlink
            const unlinkEntry = report1.linkHistory.find(entry => entry.action === 'unlink');
            expect(unlinkEntry).toBeDefined();
            expect(unlinkEntry.reason).toBe('False positive');
        });
    });

    describe('Report Archival', () => {
        it('should archive resolved reports successfully', async () => {
            const reportId = 'test_archive_1';
            manager.reports.reports[reportId] = {
                id: reportId,
                forumPostId: 'thread_archive',
                status: 'resolved',
                resolvedBy: 'mod123',
                resolvedAt: new Date().toISOString(),
                reportedUser: 'user123',
                reportedBy: 'reporter456',
                category: 'spam',
                createdAt: new Date().toISOString()
            };

            const result = await manager.archiveReport(reportId, 'mod789');

            expect(result.success).toBe(true);
            expect(result.message).toBe('Report archived successfully');

            const archivedReport = manager.reports.reports[reportId];
            expect(archivedReport.archived).toBe(true);
            expect(archivedReport.archivedBy).toBe('mod789');
            expect(archivedReport.archivedAt).toBeDefined();
        });

        it('should reject archiving non-resolved reports', async () => {
            const reportId = 'test_archive_2';
            manager.reports.reports[reportId] = {
                id: reportId,
                status: 'investigating',
                reportedUser: 'user123',
                reportedBy: 'reporter456',
                category: 'spam',
                createdAt: new Date().toISOString()
            };

            const result = await manager.archiveReport(reportId, 'mod789');

            expect(result.success).toBe(false);
            expect(result.message).toBe('Only resolved reports can be archived');
        });
    });

    describe('Report Relationship Analysis', () => {
        beforeEach(() => {
            const now = new Date();
            const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
            const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);

            manager.reports.reports = {
                'target_report': {
                    id: 'target_report',
                    reportedUser: 'user123',
                    reportedBy: 'reporter1',
                    category: 'spam',
                    reason: 'User is sending spam messages repeatedly',
                    sourceGuild: 'guild123',
                    createdAt: now.toISOString()
                },
                'same_user_report': {
                    id: 'same_user_report',
                    reportedUser: 'user123',
                    reportedBy: 'reporter2',
                    category: 'harassment',
                    reason: 'User is harassing other members',
                    sourceGuild: 'guild456',
                    createdAt: oneHourAgo.toISOString()
                },
                'same_category_report': {
                    id: 'same_category_report',
                    reportedUser: 'user456',
                    reportedBy: 'reporter1',
                    category: 'spam',
                    reason: 'Posting spam links in chat',
                    sourceGuild: 'guild123',
                    createdAt: oneHourAgo.toISOString()
                },
                'similar_keywords_report': {
                    id: 'similar_keywords_report',
                    reportedUser: 'user789',
                    reportedBy: 'reporter3',
                    category: 'other',
                    reason: 'Sending spam messages and flooding chat',
                    sourceGuild: 'guild789',
                    createdAt: oneDayAgo.toISOString()
                },
                'unrelated_report': {
                    id: 'unrelated_report',
                    reportedUser: 'user999',
                    reportedBy: 'reporter4',
                    category: 'dox',
                    reason: 'Sharing personal information',
                    sourceGuild: 'guild999',
                    createdAt: oneDayAgo.toISOString()
                }
            };
        });

        it('should find potentially related reports', () => {
            const relatedReports = manager.findPotentiallyRelatedReports('target_report');

            expect(relatedReports).toHaveLength(3);
            
            // Should be sorted by relation score (highest first)
            expect(relatedReports[0].relationScore).toBeGreaterThan(0);
            expect(relatedReports[0].relationScore).toBeGreaterThanOrEqual(relatedReports[1].relationScore);
            
            // Find the same user report which should have high score
            const sameUserReport = relatedReports.find(r => r.report.id === 'same_user_report');
            expect(sameUserReport).toBeDefined();
            expect(sameUserReport.reasons).toContain('Same reported user');
        });

        it('should return empty array for non-existent report', () => {
            const relatedReports = manager.findPotentiallyRelatedReports('nonexistent');
            expect(relatedReports).toEqual([]);
        });

        it('should identify keyword similarities', () => {
            const relatedReports = manager.findPotentiallyRelatedReports('target_report');
            
            const keywordMatch = relatedReports.find(r => 
                r.reasons.some(reason => reason.includes('Similar keywords'))
            );
            expect(keywordMatch).toBeDefined();
        });
    });

    describe('Detailed Report Information', () => {
        beforeEach(() => {
            manager.reports.reports = {
                'main_report': {
                    id: 'main_report',
                    reportedUser: 'user123',
                    reportedBy: 'reporter1',
                    category: 'spam',
                    status: 'investigating',
                    linkedReports: ['linked_report_1', 'linked_report_2'],
                    createdAt: new Date().toISOString()
                },
                'linked_report_1': {
                    id: 'linked_report_1',
                    reportedUser: 'user123',
                    reportedBy: 'reporter2',
                    category: 'spam',
                    status: 'resolved',
                    sourceGuild: 'guild456',
                    createdAt: new Date().toISOString()
                },
                'linked_report_2': {
                    id: 'linked_report_2',
                    reportedUser: 'user456',
                    reportedBy: 'reporter1',
                    category: 'harassment',
                    status: 'open',
                    sourceGuild: 'guild789',
                    createdAt: new Date().toISOString()
                }
            };
        });

        it('should return detailed report with linked reports data', () => {
            const detailedReport = manager.getDetailedReport('main_report');

            expect(detailedReport).toBeDefined();
            expect(detailedReport.id).toBe('main_report');
            expect(detailedReport.linkedReportsData).toHaveLength(2);
            
            const linkedData = detailedReport.linkedReportsData;
            expect(linkedData[0].id).toBe('linked_report_1');
            expect(linkedData[0].status).toBe('resolved');
            expect(linkedData[1].id).toBe('linked_report_2');
            expect(linkedData[1].category).toBe('harassment');
        });

        it('should handle reports with no linked reports', () => {
            manager.reports.reports['standalone_report'] = {
                id: 'standalone_report',
                reportedUser: 'user999',
                category: 'other',
                status: 'open'
            };

            const detailedReport = manager.getDetailedReport('standalone_report');

            expect(detailedReport).toBeDefined();
            expect(detailedReport.linkedReportsData).toEqual([]);
        });

        it('should return null for non-existent report', () => {
            const detailedReport = manager.getDetailedReport('nonexistent');
            expect(detailedReport).toBeNull();
        });
    });

    describe('Data Persistence', () => {
        it('should save and load report data correctly', () => {
            const testReport = {
                id: 'persistence_test',
                status: 'investigating',
                linkedReports: ['other_report'],
                statusHistory: [
                    {
                        status: 'investigating',
                        previousStatus: 'open',
                        changedBy: 'mod123',
                        changedAt: new Date().toISOString()
                    }
                ]
            };

            manager.reports.reports['persistence_test'] = testReport;
            manager.saveReports();

            // Create new manager instance to test loading
            const newManager = new ForumReportManager(mockClient, mockGuildConfig);
            const loadedReport = newManager.reports.reports['persistence_test'];

            expect(loadedReport).toBeDefined();
            expect(loadedReport.status).toBe('investigating');
            expect(loadedReport.linkedReports).toEqual(['other_report']);
            expect(loadedReport.statusHistory).toHaveLength(1);
        });
    });
});