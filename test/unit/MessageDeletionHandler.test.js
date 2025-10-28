import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { MessageDeletionHandler } from '../../utils/MessageDeletionHandler.js';
import { Events } from 'discord.js';

describe('MessageDeletionHandler', () => {
    let handler;
    let mockClient;
    let mockMessageLogger;
    let mockMessage;
    let mockChannel;
    let mockGuild;

    beforeEach(async () => {
        // Mock Discord client
        mockClient = {
            on: vi.fn(),
            emit: vi.fn()
        };

        // Mock message logger
        mockMessageLogger = {
            logMessageDeletion: vi.fn().mockResolvedValue(),
            logBulkMessageDeletion: vi.fn().mockResolvedValue(),
            getRecentDeletions: vi.fn().mockResolvedValue([]),
            logSystemEvent: vi.fn().mockResolvedValue(),
            getDeletionStats: vi.fn().mockReturnValue({
                totalDeletions: 0,
                bulkDeletions: 0,
                deletionsByChannel: {},
                deletionsByUser: {},
                deletionsByDay: {}
            }),
            getEnhancedLogStats: vi.fn().mockReturnValue({
                messageDeletions: 0,
                bulkDeletions: 0
            })
        };

        // Mock Discord objects
        mockGuild = {
            id: '123456789012345678',
            name: 'Test Guild'
        };

        mockChannel = {
            id: '987654321098765432',
            name: 'test-channel',
            guild: mockGuild
        };

        mockMessage = {
            id: '111222333444555666',
            content: 'Test message content',
            author: {
                id: '777888999000111222',
                username: 'testuser',
                discriminator: '0001',
                bot: false
            },
            guild: mockGuild,
            channel: mockChannel,
            createdTimestamp: Date.now(),
            attachments: new Map(),
            embeds: [],
            mentions: {
                users: new Map(),
                roles: new Map(),
                channels: new Map()
            }
        };

        // Create handler
        handler = new MessageDeletionHandler(mockClient, mockMessageLogger);
    });

    afterEach(() => {
        vi.clearAllMocks();
    });

    describe('Event Listener Setup', () => {
        it('should setup event listeners for message deletion events', () => {
            expect(mockClient.on).toHaveBeenCalledWith(Events.MessageDelete, expect.any(Function));
            expect(mockClient.on).toHaveBeenCalledWith(Events.MessageBulkDelete, expect.any(Function));
        });
    });

    describe('Single Message Deletion Handling', () => {
        it('should handle single message deletion correctly', async () => {
            await handler.handleMessageDelete(mockMessage);

            expect(mockMessageLogger.logMessageDeletion).toHaveBeenCalledWith(mockMessage, mockClient);
        });

        it('should skip bot messages', async () => {
            const botMessage = {
                ...mockMessage,
                author: {
                    ...mockMessage.author,
                    bot: true
                }
            };

            await handler.handleMessageDelete(botMessage);

            expect(mockMessageLogger.logMessageDeletion).not.toHaveBeenCalled();
        });

        it('should skip messages not in guilds', async () => {
            const dmMessage = {
                ...mockMessage,
                guild: null
            };

            await handler.handleMessageDelete(dmMessage);

            expect(mockMessageLogger.logMessageDeletion).not.toHaveBeenCalled();
        });

        it('should analyze message deletion patterns', async () => {
            // Mock recent deletions to trigger pattern analysis
            mockMessageLogger.getRecentDeletions.mockResolvedValue([
                { author: { id: mockMessage.author.id } },
                { author: { id: mockMessage.author.id } },
                { author: { id: mockMessage.author.id } }
            ]);

            await handler.handleMessageDelete(mockMessage);

            expect(mockMessageLogger.getRecentDeletions).toHaveBeenCalledWith(
                mockGuild.id,
                mockChannel.id,
                10
            );
            expect(mockMessageLogger.logSystemEvent).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: 'rapid_user_deletions',
                    userId: mockMessage.author.id,
                    deletionCount: 3
                }),
                mockClient
            );
        });

        it('should detect suspicious content patterns', async () => {
            const suspiciousMessage = {
                ...mockMessage,
                content: 'Join my server! discord.gg/test123 @everyone'
            };

            await handler.handleMessageDelete(suspiciousMessage);

            expect(mockMessageLogger.logSystemEvent).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: 'suspicious_content_deletion',
                    patterns: expect.any(Number)
                }),
                mockClient
            );
        });
    });

    describe('Bulk Message Deletion Handling', () => {
        let mockMessages;

        beforeEach(() => {
            // Create a collection-like object for bulk messages
            const messages = [];
            for (let i = 0; i < 5; i++) {
                messages.push({
                    id: `msg_${i}`,
                    content: `Test message ${i}`,
                    author: {
                        id: `user_${i % 2}`, // Alternate between 2 users
                        username: `user${i % 2}`,
                        bot: false
                    },
                    createdTimestamp: Date.now() - (i * 60000), // 1 minute apart
                    attachments: new Map(),
                    embeds: [],
                    mentions: { users: new Map(), roles: new Map() }
                });
            }

            mockMessages = {
                size: messages.length,
                map: (fn) => messages.map(fn),
                forEach: (fn) => messages.forEach(fn),
                [Symbol.iterator]: () => messages[Symbol.iterator]()
            };
        });

        it('should handle bulk message deletion correctly', async () => {
            await handler.handleMessageBulkDelete(mockMessages, mockChannel);

            expect(mockMessageLogger.logBulkMessageDeletion).toHaveBeenCalledWith(
                mockMessages,
                mockChannel,
                mockClient
            );
        });

        it('should skip bulk deletion in non-guild channels', async () => {
            const nonGuildChannel = {
                ...mockChannel,
                guild: null
            };

            await handler.handleMessageBulkDelete(mockMessages, nonGuildChannel);

            expect(mockMessageLogger.logBulkMessageDeletion).not.toHaveBeenCalled();
        });

        it('should analyze bulk deletion patterns', async () => {
            await handler.handleMessageBulkDelete(mockMessages, mockChannel);

            expect(mockMessageLogger.logSystemEvent).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: 'bulk_deletion_analysis',
                    analysis: expect.objectContaining({
                        totalMessages: 5,
                        uniqueUsers: 2
                    })
                }),
                mockClient
            );
        });

        it('should detect potential raid cleanup', async () => {
            // Create messages from few users (potential raid)
            const raidMessages = {
                size: 25,
                map: (fn) => Array.from({ length: 25 }, (_, i) => ({
                    id: `raid_msg_${i}`,
                    content: 'SPAM MESSAGE',
                    author: { id: 'spammer1', username: 'spammer1' },
                    createdTimestamp: Date.now() - (i * 1000)
                })).map(fn),
                forEach: (fn) => Array.from({ length: 25 }, (_, i) => ({
                    id: `raid_msg_${i}`,
                    content: 'SPAM MESSAGE',
                    author: { id: 'spammer1', username: 'spammer1' },
                    createdTimestamp: Date.now() - (i * 1000)
                })).forEach(fn)
            };

            await handler.handleMessageBulkDelete(raidMessages, mockChannel);

            expect(mockMessageLogger.logSystemEvent).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: 'potential_raid_cleanup',
                    evidence: expect.objectContaining({
                        messageCount: 25,
                        uniqueUsers: 1
                    })
                }),
                mockClient
            );
        });
    });

    describe('Content Analysis', () => {
        it('should calculate time span correctly', () => {
            const messages = {
                size: 3,
                map: (fn) => [
                    { createdTimestamp: 1000000 },
                    { createdTimestamp: 1060000 }, // 1 minute later
                    { createdTimestamp: 1120000 }  // 2 minutes from first
                ].map(fn)
            };

            const timeSpan = handler.calculateTimeSpan(messages);
            expect(timeSpan).toBe(2); // 2 minutes
        });

        it('should analyze content types correctly', () => {
            const messages = {
                forEach: (fn) => [
                    { 
                        attachments: new Map([['1', {}]]), 
                        embeds: [], 
                        mentions: { users: new Map(), roles: new Map() },
                        content: 'Message with attachment'
                    },
                    { 
                        attachments: new Map(), 
                        embeds: [{}], 
                        mentions: { users: new Map(), roles: new Map() },
                        content: 'Message with embed'
                    },
                    { 
                        attachments: new Map(), 
                        embeds: [], 
                        mentions: { users: new Map([['1', {}]]), roles: new Map() },
                        content: 'Message with mention'
                    }
                ].forEach(fn)
            };

            const analysis = handler.analyzeContentTypes(messages);
            
            expect(analysis.withAttachments).toBe(1);
            expect(analysis.withEmbeds).toBe(1);
            expect(analysis.withMentions).toBe(1);
        });

        it('should analyze suspicious content correctly', () => {
            const messages = {
                forEach: (fn) => [
                    { content: 'Join discord.gg/test123' },
                    { content: 'Hello @everyone' },
                    { content: 'Spam message' },
                    { content: 'Spam message' }, // Repeated
                    { content: 'Check out https://example.com and https://test.com and https://spam.com' }
                ].forEach(fn)
            };

            const analysis = handler.analyzeSuspiciousContent(messages);
            
            expect(analysis.inviteLinks).toBe(1);
            expect(analysis.massiveMentions).toBe(1);
            expect(analysis.repeatedContent).toBe(1);
            expect(analysis.suspiciousUrls).toBe(1);
        });
    });

    describe('Monitoring and Reporting', () => {
        it('should get deletion monitoring stats', async () => {
            mockMessageLogger.getDeletionStats.mockReturnValue({
                totalDeletions: 150,
                bulkDeletions: 5,
                deletionsByChannel: { 'channel1': 100, 'channel2': 50 },
                deletionsByUser: { 'user1': 75, 'user2': 75 }
            });

            const stats = await handler.getDeletionMonitoringStats(mockGuild.id);

            expect(stats).toEqual({
                last24Hours: {
                    totalDeletions: 150,
                    bulkDeletions: 5,
                    topChannels: [['channel1', 100], ['channel2', 50]],
                    topUsers: [['user1', 75], ['user2', 75]]
                },
                alerts: {
                    highDeletionRate: true, // > 100
                    multipleBulkDeletions: true, // > 3
                    suspiciousPatterns: false
                }
            });
        });

        it('should generate comprehensive deletion report', async () => {
            mockMessageLogger.getDeletionStats.mockReturnValue({
                totalDeletions: 70,
                bulkDeletions: 2,
                deletionsByChannel: { 'channel1': 40, 'channel2': 30 },
                deletionsByUser: { 'user1': 35, 'user2': 35 },
                deletionsByDay: { '2024-01-01': 10, '2024-01-02': 20, '2024-01-03': 40 }
            });

            const report = await handler.generateDeletionReport(mockGuild.id, 7);

            expect(report).toEqual({
                period: '7 days',
                summary: {
                    totalDeletions: 70,
                    bulkDeletions: 2,
                    averagePerDay: 10,
                    peakDay: { day: '2024-01-03', count: 40 }
                },
                breakdown: {
                    byChannel: { 'channel1': 40, 'channel2': 30 },
                    byUser: { 'user1': 35, 'user2': 35 },
                    byDay: { '2024-01-01': 10, '2024-01-02': 20, '2024-01-03': 40 }
                },
                trends: {
                    increasing: 'increasing', // Recent days have more deletions
                    concerningChannels: [], // None over 50
                    concerningUsers: [] // None over 20
                },
                recommendations: expect.any(Array)
            });
        });
    });

    describe('Error Handling', () => {
        it('should handle errors in message deletion gracefully', async () => {
            mockMessageLogger.logMessageDeletion.mockRejectedValue(new Error('Test error'));
            
            // Should not throw
            await expect(handler.handleMessageDelete(mockMessage)).resolves.toBeUndefined();
        });

        it('should handle errors in bulk deletion gracefully', async () => {
            mockMessageLogger.logBulkMessageDeletion.mockRejectedValue(new Error('Test error'));
            
            // Should not throw
            await expect(handler.handleMessageBulkDelete(mockMessages, mockChannel)).resolves.toBeUndefined();
        });

        it('should handle errors in stats generation gracefully', async () => {
            mockMessageLogger.getDeletionStats.mockImplementation(() => {
                throw new Error('Stats error');
            });
            
            const stats = await handler.getDeletionMonitoringStats(mockGuild.id);
            expect(stats).toBeNull();
        });
    });
});