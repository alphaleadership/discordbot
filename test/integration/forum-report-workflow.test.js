import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ForumReportManager } from '../../utils/ForumReportManager.js';
import { GuildConfig } from '../../utils/GuildConfig.js';
import fs from 'fs';
import path from 'path';

describe('Forum Report System Integration Tests', () => {
    let forumReportManager;
    let mockClient;
    let mockGuildConfig;
    let testDataPath;
    let supportGuild;
    let sourceGuild;
    let reportsForumChannel;

    beforeEach(async () => {
        // Create test data directory
        testDataPath = path.join(process.cwd(), 'test/test-data/integration-forum-reports.json');
        
        // Mock Discord client and guilds
        const { MockClient, MockGuild, MockUser, MockForumChannel } = await import('../mocks/discord.js');
        mockClient = new MockClient();
        
        // Create support server with forum channel
        supportGuild = new MockGuild(mockClient, {
            id: '123456789012345678',
            name: 'Support Server'
        });
        
        // Create source guild (where reports originate)
        sourceGuild = new MockGuild(mockClient, {
            id: '987654321098765432',
            name: 'Gaming Community'
        });
        
        // Create forum channel for reports
        reportsForumChannel = new MockForumChannel(supportGuild, {
            id: '111222333444555666',
            name: 'reports-forum'
        });
        
        mockClient.guilds.cache.set(supportGuild.id, supportGuild);
        mockClient.guilds.cache.set(sourceGuild.id, sourceGuild);
        supportGuild.channels.cache.set(reportsForumChannel.id, reportsForumChannel);
        
        // Mock guild config
        mockGuildConfig = new GuildConfig();
        
        // Initialize ForumReportManager
        forumReportManager = new ForumReportManager(mockClient, mockGuildConfig);
        forumReportManager.filePath = testDataPath;
        forumReportManager.supportGuildId = supportGuild.id;
        forumReportManager.reportsForumId = reportsForumChannel.id;
        forumReportManager.reports = {
            reports: {},
            config: {
                supportGuildId: supportGuild.id,
                reportsForumId: reportsForumChannel.id
            }
        };
        forumReportManager.saveReports();
    });

    afterEach(() => {
        // Clean up test files
        if (fs.existsSync(testDataPath)) {
            fs.unlinkSync(testDataPath);
        }
        vi.clearAllMocks();
    });

    describe('End-to-End Report Creation and Management', () => {
        it('should complete full report lifecycle from creation to resolution', async () => {
            const { MockUser, MockMessage } = await import('../mocks/discord.js');
            
            // Create test users
            const reportedUser = new MockUser({
                id: '111111111111111111',
                username: 'baduser',
                discriminator: '0001'
            });
            
            const reporterUser = new MockUser({
                id: '222222222222222222',
                username: 'reporter',
                discriminator: '0002'
            });
            
            const moderatorUser = new MockUser({
                id: '333333333333333333',
                username: 'moderator',
                discriminator: '0003'
            });
            
            // Step 1: Create initial report
            const reportData = {
                reportedUserId: reportedUser.id,
                reportedUsername: reportedUser.username,
                reporterUserId: reporterUser.id,
                reporterUsername: reporterUser.username,
                reason: 'Spam and harassment in general chat',
                category: 'harassment',
                evidence: 'User posted multiple offensive messages',
                messageId: '999888777666555444',
                channelId: '555444333222111000',
                timestamp: new Date().toISOString()
            };
            
            const reportResult = await forumReportManager.createForumReport(reportData, sourceGuild.id);
            
            expect(reportResult.success).toBe(true);
            expect(reportResult.reportId).toBeDefined();
            expect(reportResult.forumPostId).toBeDefined();
            
            // Verify forum thread was created
            expect(reportsForumChannel.createThread).toHaveBeenCalledWith(
                expect.objectContaining({
                    name: expect.stringContaining('harassment'),
                    message: expect.objectContaining({
                        embeds: expect.arrayContaining([
                            expect.objectContaining({
                                title: expect.stringContaining('Report')
                            })
                        ])
                    })
                })
            );
            
            // Step 2: Verify report was stored correctly
            const storedReport = forumReportManager.reports.reports[reportResult.reportId];
            expect(storedReport).toBeDefined();
            expect(storedReport.reportedUser).toBe(reportedUser.id);
            expect(storedReport.reportedBy).toBe(reporterUser.id);
            expect(storedReport.category).toBe('harassment');
            expect(storedReport.status).toBe('open');
            expect(storedReport.sourceGuild).toBe(sourceGuild.id);
            
            // Step 3: Moderator updates report status
            const updateResult = await forumReportManager.updateReportStatus(
                reportResult.reportId,
                'investigating',
                moderatorUser.id
            );
            
            expect(updateResult.success).toBe(true);
            
            // Verify status was updated
            const updatedReport = forumReportManager.reports.reports[reportResult.reportId];
            expect(updatedReport.status).toBe('investigating');
            expect(updatedReport.assignedModerator).toBe(moderatorUser.id);
            
            // Step 4: Add notes to the report
            const noteResult = await forumReportManager.addReportNote(
                reportResult.reportId,
                'Reviewed evidence, taking action against user',
                moderatorUser.id
            );
            
            expect(noteResult.success).toBe(true);
            expect(updatedReport.notes).toBeDefined();
            expect(updatedReport.notes.length).toBeGreaterThan(0);
            
            // Step 5: Resolve the report
            const resolveResult = await forumReportManager.resolveReport(
                reportResult.reportId,
                'User has been warned and messages deleted',
                moderatorUser.id
            );
            
            expect(resolveResult.success).toBe(true);
            
            // Verify report was resolved
            const resolvedReport = forumReportManager.reports.reports[reportResult.reportId];
            expect(resolvedReport.status).toBe('resolved');
            expect(resolvedReport.resolvedBy).toBe(moderatorUser.id);
            expect(resolvedReport.resolvedAt).toBeDefined();
            expect(resolvedReport.resolution).toBe('User has been warned and messages deleted');
        });

        it('should handle multiple reports about the same user and link them', async () => {
            const { MockUser } = await import('../mocks/discord.js');
            
            const reportedUser = new MockUser({
                id: '111111111111111111',
                username: 'problematicuser',
                discriminator: '0001'
            });
            
            const reporters = [
                new MockUser({ id: '222222222222222222', username: 'reporter1', discriminator: '0001' }),
                new MockUser({ id: '333333333333333333', username: 'reporter2', discriminator: '0002' }),
                new MockUser({ id: '444444444444444444', username: 'reporter3', discriminator: '0003' })
            ];
            
            // Create multiple reports about the same user
            const reportPromises = reporters.map(async (reporter, index) => {
                const reportData = {
                    reportedUserId: reportedUser.id,
                    reportedUsername: reportedUser.username,
                    reporterUserId: reporter.id,
                    reporterUsername: reporter.username,
                    reason: `Incident ${index + 1}: Various rule violations`,
                    category: index === 0 ? 'spam' : index === 1 ? 'harassment' : 'inappropriate',
                    evidence: `Evidence for incident ${index + 1}`,
                    messageId: `msg_${index}_${Date.now()}`,
                    channelId: '555444333222111000',
                    timestamp: new Date().toISOString()
                };
                
                return forumReportManager.createForumReport(reportData, sourceGuild.id);
            });
            
            const reportResults = await Promise.all(reportPromises);
            
            // Verify all reports were created
            reportResults.forEach(result => {
                expect(result.success).toBe(true);
                expect(result.reportId).toBeDefined();
            });
            
            // Step 2: Link related reports
            const reportIds = reportResults.map(result => result.reportId);
            const linkResult = await forumReportManager.linkRelatedReports(reportIds);
            
            expect(linkResult.success).toBe(true);
            
            // Verify reports are linked
            reportIds.forEach(reportId => {
                const report = forumReportManager.reports.reports[reportId];
                expect(report.linkedReports).toBeDefined();
                expect(report.linkedReports.length).toBe(reportIds.length - 1); // All others except itself
                
                // Verify cross-references
                report.linkedReports.forEach(linkedId => {
                    expect(reportIds).toContain(linkedId);
                    expect(linkedId).not.toBe(reportId);
                });
            });
            
            // Step 3: Verify forum posts reference each other
            const firstReport = forumReportManager.reports.reports[reportIds[0]];
            expect(firstReport.linkedReports).toContain(reportIds[1]);
            expect(firstReport.linkedReports).toContain(reportIds[2]);
        });

        it('should handle reports from multiple source guilds', async () => {
            const { MockUser, MockGuild } = await import('../mocks/discord.js');
            
            // Create additional source guilds
            const sourceGuilds = [
                sourceGuild,
                new MockGuild(mockClient, { id: '111111111111111111', name: 'Gaming Guild 1' }),
                new MockGuild(mockClient, { id: '222222222222222222', name: 'Gaming Guild 2' }),
                new MockGuild(mockClient, { id: '333333333333333333', name: 'Gaming Guild 3' })
            ];
            
            sourceGuilds.slice(1).forEach(guild => {
                mockClient.guilds.cache.set(guild.id, guild);
            });
            
            const reportedUser = new MockUser({
                id: '999999999999999999',
                username: 'crossguildspammer',
                discriminator: '0001'
            });
            
            const reporter = new MockUser({
                id: '888888888888888888',
                username: 'vigilantuser',
                discriminator: '0001'
            });
            
            // Create reports from different guilds
            const reportPromises = sourceGuilds.map(async (guild, index) => {
                const reportData = {
                    reportedUserId: reportedUser.id,
                    reportedUsername: reportedUser.username,
                    reporterUserId: reporter.id,
                    reporterUsername: reporter.username,
                    reason: `Cross-guild spam in ${guild.name}`,
                    category: 'spam',
                    evidence: `Spam messages detected in ${guild.name}`,
                    messageId: `msg_${guild.id}_${Date.now()}`,
                    channelId: `channel_${guild.id}`,
                    timestamp: new Date().toISOString()
                };
                
                return forumReportManager.createForumReport(reportData, guild.id);
            });
            
            const reportResults = await Promise.all(reportPromises);
            
            // Verify all reports were created with correct source guild information
            reportResults.forEach((result, index) => {
                expect(result.success).toBe(true);
                
                const report = forumReportManager.reports.reports[result.reportId];
                expect(report.sourceGuild).toBe(sourceGuilds[index].id);
                expect(report.reportedUser).toBe(reportedUser.id);
            });
            
            // Verify reports can be filtered by source guild
            const guild1Reports = Object.values(forumReportManager.reports.reports)
                .filter(report => report.sourceGuild === sourceGuilds[1].id);
            
            expect(guild1Reports).toHaveLength(1);
            expect(guild1Reports[0].sourceGuild).toBe(sourceGuilds[1].id);
        });
    });

    describe('Forum Management and Organization', () => {
        it('should properly categorize and tag reports in forum', async () => {
            const { MockUser } = await import('../mocks/discord.js');
            
            const testCases = [
                { category: 'spam', expectedTag: 'Spam', expectedColor: '#FF6B6B' },
                { category: 'harassment', expectedTag: 'Harassment', expectedColor: '#FF4757' },
                { category: 'inappropriate', expectedTag: 'Inappropriate Content', expectedColor: '#FF3838' },
                { category: 'dox', expectedTag: 'Personal Information', expectedColor: '#FF1744' }
            ];
            
            const reportedUser = new MockUser({
                id: '111111111111111111',
                username: 'testuser',
                discriminator: '0001'
            });
            
            const reporter = new MockUser({
                id: '222222222222222222',
                username: 'reporter',
                discriminator: '0001'
            });
            
            for (const testCase of testCases) {
                const reportData = {
                    reportedUserId: reportedUser.id,
                    reportedUsername: reportedUser.username,
                    reporterUserId: reporter.id,
                    reporterUsername: reporter.username,
                    reason: `Test ${testCase.category} report`,
                    category: testCase.category,
                    evidence: `Evidence for ${testCase.category}`,
                    messageId: `msg_${testCase.category}_${Date.now()}`,
                    channelId: '555444333222111000',
                    timestamp: new Date().toISOString()
                };
                
                const result = await forumReportManager.createForumReport(reportData, sourceGuild.id);
                expect(result.success).toBe(true);
                
                // Verify categorization was applied
                const report = forumReportManager.reports.reports[result.reportId];
                expect(report.category).toBe(testCase.category);
                
                // Verify forum thread creation included proper categorization
                expect(reportsForumChannel.createThread).toHaveBeenCalledWith(
                    expect.objectContaining({
                        name: expect.stringContaining(testCase.expectedTag.toLowerCase())
                    })
                );
            }
        });

        it('should handle forum unavailability gracefully', async () => {
            const { MockUser } = await import('../mocks/discord.js');
            
            // Simulate forum channel being unavailable
            forumReportManager.reportsForumId = 'invalid_channel_id';
            
            const reportedUser = new MockUser({
                id: '111111111111111111',
                username: 'testuser',
                discriminator: '0001'
            });
            
            const reporter = new MockUser({
                id: '222222222222222222',
                username: 'reporter',
                discriminator: '0001'
            });
            
            const reportData = {
                reportedUserId: reportedUser.id,
                reportedUsername: reportedUser.username,
                reporterUserId: reporter.id,
                reporterUsername: reporter.username,
                reason: 'Test report with unavailable forum',
                category: 'spam',
                evidence: 'Test evidence',
                messageId: 'msg_test',
                channelId: '555444333222111000',
                timestamp: new Date().toISOString()
            };
            
            const result = await forumReportManager.createForumReport(reportData, sourceGuild.id);
            
            // Should still create report data even if forum posting fails
            expect(result.reportId).toBeDefined();
            
            const report = forumReportManager.reports.reports[result.reportId];
            expect(report).toBeDefined();
            expect(report.status).toBe('open');
            expect(report.forumPostId).toBeNull(); // No forum post created
        });
    });

    describe('Report Search and Filtering', () => {
        it('should support comprehensive report search and filtering', async () => {
            const { MockUser } = await import('../mocks/discord.js');
            
            // Create diverse set of reports for testing
            const testReports = [
                {
                    reportedUser: '111111111111111111',
                    reporter: '222222222222222222',
                    category: 'spam',
                    status: 'open',
                    sourceGuild: sourceGuild.id
                },
                {
                    reportedUser: '333333333333333333',
                    reporter: '222222222222222222',
                    category: 'harassment',
                    status: 'investigating',
                    sourceGuild: sourceGuild.id
                },
                {
                    reportedUser: '111111111111111111', // Same user as first report
                    reporter: '444444444444444444',
                    category: 'inappropriate',
                    status: 'resolved',
                    sourceGuild: '999999999999999999' // Different guild
                }
            ];
            
            const reportIds = [];
            
            for (const testReport of testReports) {
                const reportData = {
                    reportedUserId: testReport.reportedUser,
                    reportedUsername: 'testuser',
                    reporterUserId: testReport.reporter,
                    reporterUsername: 'reporter',
                    reason: `Test ${testReport.category} report`,
                    category: testReport.category,
                    evidence: 'Test evidence',
                    messageId: `msg_${Date.now()}`,
                    channelId: '555444333222111000',
                    timestamp: new Date().toISOString()
                };
                
                const result = await forumReportManager.createForumReport(reportData, testReport.sourceGuild);
                reportIds.push(result.reportId);
                
                // Update status if needed
                if (testReport.status !== 'open') {
                    await forumReportManager.updateReportStatus(result.reportId, testReport.status, '999999999999999999');
                }
            }
            
            // Test filtering by reported user
            const userReports = await forumReportManager.getReportsByUser('111111111111111111');
            expect(userReports).toHaveLength(2); // Two reports for this user
            
            // Test filtering by category
            const spamReports = await forumReportManager.getReportsByCategory('spam');
            expect(spamReports).toHaveLength(1);
            expect(spamReports[0].category).toBe('spam');
            
            // Test filtering by status
            const openReports = await forumReportManager.getReportsByStatus('open');
            expect(openReports.length).toBeGreaterThanOrEqual(1);
            
            // Test filtering by source guild
            const guildReports = await forumReportManager.getReportsByGuild(sourceGuild.id);
            expect(guildReports).toHaveLength(2); // Two reports from this guild
        });
    });
});