import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import { DMTicketManager } from '../../utils/DMTicketManager.js';

// Mock Discord.js
const mockClient = {
    user: { id: 'bot-id' },
    guilds: {
        cache: new Map()
    },
    channels: {
        cache: new Map()
    },
    users: {
        cache: new Map()
    }
};

const mockGuildConfig = {
    get: vi.fn(),
    set: vi.fn()
};

describe('DMTicketManager - State Management and History Tracking', () => {
    let ticketManager;
    let testDataPath;

    beforeEach(() => {
        // Create temporary test data directory
        testDataPath = path.join(process.cwd(), 'test', 'test-data', 'tickets-test.json');
        
        // Ensure test directory exists
        const testDir = path.dirname(testDataPath);
        if (!fs.existsSync(testDir)) {
            fs.mkdirSync(testDir, { recursive: true });
        }

        // Clean up any existing test file
        if (fs.existsSync(testDataPath)) {
            fs.unlinkSync(testDataPath);
        }

        ticketManager = new DMTicketManager(mockClient, mockGuildConfig);
        ticketManager.filePath = testDataPath;
        ticketManager.tickets = ticketManager.getDefaultTicketData();
        ticketManager.setSupportServer('support-guild-id');
    });

    afterEach(() => {
        // Clean up test file
        if (fs.existsSync(testDataPath)) {
            fs.unlinkSync(testDataPath);
        }
    });

    describe('Ticket Status Management', () => {
        it('should update ticket status with history tracking', async () => {
            // Create a test ticket
            const ticketData = {
                id: 'ticket-000001',
                userId: 'user-123',
                username: 'testuser',
                status: 'open',
                createdAt: new Date().toISOString(),
                responses: {
                    category: { key: '1', label: 'Technical Issue' },
                    priority: { key: '2', label: 'Medium' }
                }
            };

            ticketManager.tickets.tickets['ticket-000001'] = ticketData;

            const mockModerator = {
                id: 'mod-123',
                username: 'moderator',
                tag: 'moderator#1234'
            };

            // Update status to escalated
            const result = await ticketManager.updateTicketStatus(
                'ticket-000001', 
                'escalated', 
                mockModerator, 
                'Issue requires senior support'
            );

            expect(result.success).toBe(true);
            expect(result.oldStatus).toBe('open');
            expect(result.newStatus).toBe('escalated');

            const updatedTicket = ticketManager.tickets.tickets['ticket-000001'];
            expect(updatedTicket.status).toBe('escalated');
            expect(updatedTicket.escalatedAt).toBeDefined();
            expect(updatedTicket.escalatedBy).toBe('mod-123');
            expect(updatedTicket.statusHistory).toHaveLength(2);
            
            const latestStatus = updatedTicket.statusHistory[1];
            expect(latestStatus.status).toBe('escalated');
            expect(latestStatus.moderator.id).toBe('mod-123');
            expect(latestStatus.reason).toBe('Issue requires senior support');
        });

        it('should handle status change to closed', async () => {
            const ticketData = {
                id: 'ticket-000002',
                userId: 'user-456',
                status: 'open',
                createdAt: new Date().toISOString()
            };

            ticketManager.tickets.tickets['ticket-000002'] = ticketData;

            const mockModerator = {
                id: 'mod-456',
                username: 'moderator2',
                tag: 'moderator2#5678'
            };

            const result = await ticketManager.updateTicketStatus(
                'ticket-000002',
                'closed',
                mockModerator,
                'Issue resolved'
            );

            expect(result.success).toBe(true);
            
            const closedTicket = ticketManager.tickets.tickets['ticket-000002'];
            expect(closedTicket.status).toBe('closed');
            expect(closedTicket.closedAt).toBeDefined();
            expect(closedTicket.closedBy).toBe('mod-456');
            expect(closedTicket.closeReason).toBe('Issue resolved');
        });

        it('should handle status change to reopened', async () => {
            const ticketData = {
                id: 'ticket-000003',
                userId: 'user-789',
                status: 'closed',
                createdAt: new Date().toISOString(),
                closedAt: new Date().toISOString(),
                closedBy: 'mod-123',
                closeReason: 'Initial resolution'
            };

            ticketManager.tickets.tickets['ticket-000003'] = ticketData;

            const result = await ticketManager.updateTicketStatus(
                'ticket-000003',
                'reopened',
                null,
                'User reported issue persists'
            );

            expect(result.success).toBe(true);
            
            const reopenedTicket = ticketManager.tickets.tickets['ticket-000003'];
            expect(reopenedTicket.status).toBe('reopened');
            expect(reopenedTicket.closedAt).toBeNull();
            expect(reopenedTicket.closedBy).toBeNull();
            expect(reopenedTicket.closeReason).toBeNull();
        });

        it('should throw error for non-existent ticket', async () => {
            await expect(
                ticketManager.updateTicketStatus('non-existent', 'closed')
            ).rejects.toThrow('Ticket non-existent not found');
        });
    });

    describe('Ticket History and Search', () => {
        beforeEach(() => {
            // Create test tickets with different properties
            const testTickets = {
                'ticket-000001': {
                    id: 'ticket-000001',
                    userId: 'user-123',
                    status: 'open',
                    createdAt: '2024-01-01T10:00:00.000Z',
                    responses: {
                        category: { key: '1', label: 'Technical Issue' },
                        priority: { key: '3', label: 'High' }
                    },
                    sourceGuild: 'guild-1'
                },
                'ticket-000002': {
                    id: 'ticket-000002',
                    userId: 'user-123',
                    status: 'closed',
                    createdAt: '2024-01-02T10:00:00.000Z',
                    closedAt: '2024-01-02T15:00:00.000Z',
                    responses: {
                        category: { key: '2', label: 'Moderation Issue' },
                        priority: { key: '1', label: 'Low' }
                    },
                    sourceGuild: 'guild-2'
                },
                'ticket-000003': {
                    id: 'ticket-000003',
                    userId: 'user-456',
                    status: 'escalated',
                    createdAt: '2024-01-03T10:00:00.000Z',
                    responses: {
                        category: { key: '1', label: 'Technical Issue' },
                        priority: { key: '4', label: 'Urgent' }
                    },
                    sourceGuild: 'guild-1'
                }
            };

            ticketManager.tickets.tickets = testTickets;
            ticketManager.tickets.userTickets = {
                'user-123': ['ticket-000001', 'ticket-000002'],
                'user-456': ['ticket-000003']
            };
        });

        it('should get ticket history with filtering options', () => {
            const allHistory = ticketManager.getTicketHistory('user-123');
            expect(allHistory).toHaveLength(2);
            expect(allHistory[0].id).toBe('ticket-000002'); // Newest first

            const openOnly = ticketManager.getTicketHistory('user-123', { status: 'open' });
            expect(openOnly).toHaveLength(1);
            expect(openOnly[0].id).toBe('ticket-000001');

            const techIssues = ticketManager.getTicketHistory('user-123', { category: '1' });
            expect(techIssues).toHaveLength(1);
            expect(techIssues[0].id).toBe('ticket-000001');
        });

        it('should search tickets with multiple criteria', () => {
            const searchResult = ticketManager.searchTickets({
                category: '1', // Technical Issue
                status: 'open'
            });

            expect(searchResult.success).toBe(true);
            expect(searchResult.results).toHaveLength(1);
            expect(searchResult.results[0].id).toBe('ticket-000001');

            const urgentTickets = ticketManager.searchTickets({
                priority: '4' // Urgent
            });

            expect(urgentTickets.success).toBe(true);
            expect(urgentTickets.results).toHaveLength(1);
            expect(urgentTickets.results[0].id).toBe('ticket-000003');
        });

        it('should search tickets by text content', () => {
            const searchResult = ticketManager.searchTickets({
                searchText: 'moderation'
            });

            expect(searchResult.success).toBe(true);
            expect(searchResult.results).toHaveLength(1);
            expect(searchResult.results[0].id).toBe('ticket-000002');
        });

        it('should search tickets by date range', () => {
            const searchResult = ticketManager.searchTickets({
                dateFrom: '2024-01-02T00:00:00.000Z',
                dateTo: '2024-01-03T23:59:59.999Z'
            });

            expect(searchResult.success).toBe(true);
            expect(searchResult.results).toHaveLength(2);
            expect(searchResult.results.map(t => t.id)).toContain('ticket-000002');
            expect(searchResult.results.map(t => t.id)).toContain('ticket-000003');
        });

        it('should search tickets by source guild', () => {
            const searchResult = ticketManager.searchTickets({
                sourceGuild: 'guild-1'
            });

            expect(searchResult.success).toBe(true);
            expect(searchResult.results).toHaveLength(2);
            expect(searchResult.results.map(t => t.id)).toContain('ticket-000001');
            expect(searchResult.results.map(t => t.id)).toContain('ticket-000003');
        });

        it('should apply pagination to search results', () => {
            const searchResult = ticketManager.searchTickets({
                limit: 2,
                offset: 0
            });

            expect(searchResult.success).toBe(true);
            expect(searchResult.results).toHaveLength(2);

            const nextPage = ticketManager.searchTickets({
                limit: 2,
                offset: 2
            });

            expect(nextPage.success).toBe(true);
            expect(nextPage.results).toHaveLength(1);
        });
    });

    describe('Ticket Statistics', () => {
        beforeEach(() => {
            // Create test tickets with statistics
            const testTickets = {
                'ticket-000001': {
                    id: 'ticket-000001',
                    userId: 'user-123',
                    status: 'closed',
                    createdAt: '2024-01-01T10:00:00.000Z',
                    closedAt: '2024-01-01T15:00:00.000Z',
                    messageCount: 5,
                    responses: {
                        category: { key: '1', label: 'Technical Issue' },
                        priority: { key: '2', label: 'Medium' }
                    },
                    sourceGuild: 'guild-1',
                    statistics: {
                        duration: 300, // 5 hours in minutes
                        responseTime: 30 // 30 minutes average
                    }
                },
                'ticket-000002': {
                    id: 'ticket-000002',
                    userId: 'user-456',
                    status: 'open',
                    createdAt: '2024-01-02T10:00:00.000Z',
                    messageCount: 3,
                    responses: {
                        category: { key: '2', label: 'Moderation Issue' },
                        priority: { key: '3', label: 'High' }
                    },
                    sourceGuild: 'guild-2',
                    statistics: {
                        duration: 120, // 2 hours in minutes
                        responseTime: 15 // 15 minutes average
                    }
                }
            };

            ticketManager.tickets.tickets = testTickets;
        });

        it('should generate comprehensive ticket statistics', () => {
            const stats = ticketManager.getTicketStatistics();

            expect(stats.success).toBe(true);
            expect(stats.statistics.total).toBe(2);
            expect(stats.statistics.byStatus.closed).toBe(1);
            expect(stats.statistics.byStatus.open).toBe(1);
            expect(stats.statistics.byCategory['Technical Issue']).toBe(1);
            expect(stats.statistics.byCategory['Moderation Issue']).toBe(1);
            expect(stats.statistics.byPriority['Medium']).toBe(1);
            expect(stats.statistics.byPriority['High']).toBe(1);
            expect(stats.statistics.bySourceGuild['guild-1']).toBe(1);
            expect(stats.statistics.bySourceGuild['guild-2']).toBe(1);
            expect(stats.statistics.totalMessages).toBe(8);
            expect(stats.statistics.averageResponseTime).toBe(23); // (30 + 15) / 2 rounded
            expect(stats.statistics.averageDuration).toBe(210); // (300 + 120) / 2
        });

        it('should filter statistics by date range', () => {
            const stats = ticketManager.getTicketStatistics({
                dateFrom: '2024-01-02T00:00:00.000Z'
            });

            expect(stats.success).toBe(true);
            expect(stats.statistics.total).toBe(1);
            expect(stats.statistics.byStatus.open).toBe(1);
            expect(stats.statistics.byCategory['Moderation Issue']).toBe(1);
        });
    });

    describe('Ticket Archival with Conversation Logging', () => {
        it('should calculate ticket duration correctly', () => {
            const ticket = {
                createdAt: '2024-01-01T10:00:00.000Z',
                closedAt: '2024-01-01T15:30:00.000Z'
            };

            const duration = ticketManager.calculateTicketDuration(ticket);
            expect(duration).toBe(330); // 5.5 hours = 330 minutes
        });

        it('should calculate duration for open tickets', () => {
            const ticket = {
                createdAt: new Date(Date.now() - 60 * 60 * 1000).toISOString() // 1 hour ago
            };

            const duration = ticketManager.calculateTicketDuration(ticket);
            expect(duration).toBeGreaterThan(55); // Should be around 60 minutes
            expect(duration).toBeLessThan(65);
        });

        it('should archive ticket with enhanced data', async () => {
            const ticketData = {
                id: 'ticket-000001',
                userId: 'user-123',
                status: 'closed',
                createdAt: '2024-01-01T10:00:00.000Z',
                closedAt: '2024-01-01T15:00:00.000Z',
                messageCount: 5,
                responses: {
                    category: { key: '1', label: 'Technical Issue' },
                    description: 'Test issue description'
                }
            };

            ticketManager.tickets.tickets['ticket-000001'] = ticketData;

            // Mock conversation log retrieval
            vi.spyOn(ticketManager, 'getTicketConversationLog').mockResolvedValue([
                {
                    id: 'msg-1',
                    author: { id: 'user-123', username: 'testuser', isBot: false },
                    content: 'I need help with this issue',
                    timestamp: '2024-01-01T10:05:00.000Z'
                },
                {
                    id: 'msg-2',
                    author: { id: 'mod-123', username: 'moderator', isBot: false },
                    content: 'I can help you with that',
                    timestamp: '2024-01-01T10:35:00.000Z'
                }
            ]);

            const archiveResult = await ticketManager.archiveTicket('ticket-000001');

            expect(archiveResult.archived).toBe(true);
            expect(archiveResult.archivedAt).toBeDefined();
            expect(archiveResult.conversationLog).toHaveLength(2);
            expect(archiveResult.questionnaire).toEqual(ticketData.responses);
            expect(archiveResult.statistics.totalMessages).toBe(5);
            expect(archiveResult.statistics.duration).toBe(300); // 5 hours

            // Check that ticket is in archive
            expect(ticketManager.tickets._archive['ticket-000001']).toBeDefined();
            expect(ticketManager.tickets.tickets['ticket-000001'].archived).toBe(true);
        });
    });

    describe('Data Retention and Cleanup', () => {
        beforeEach(() => {
            const now = new Date();
            const oldDate = new Date(now.getTime() - 100 * 24 * 60 * 60 * 1000); // 100 days ago
            const veryOldDate = new Date(now.getTime() - 400 * 24 * 60 * 60 * 1000); // 400 days ago

            // Create test tickets with different ages
            ticketManager.tickets.tickets = {
                'recent-ticket': {
                    id: 'recent-ticket',
                    status: 'closed',
                    closedAt: new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000).toISOString(), // 10 days ago
                    userId: 'user-1'
                },
                'old-ticket': {
                    id: 'old-ticket',
                    status: 'closed',
                    closedAt: oldDate.toISOString(),
                    userId: 'user-1'
                }
            };

            ticketManager.tickets._archive = {
                'very-old-ticket': {
                    id: 'very-old-ticket',
                    status: 'closed',
                    archivedAt: veryOldDate.toISOString(),
                    userId: 'user-1'
                }
            };

            ticketManager.tickets.userTickets = {
                'user-1': ['recent-ticket', 'old-ticket', 'very-old-ticket']
            };

            ticketManager.tickets._failedMessages = [
                {
                    ticketId: 'test-ticket',
                    timestamp: new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000).toISOString() // 10 days ago
                }
            ];
        });

        it('should perform data retention cleanup', async () => {
            // Mock archiveTicket method
            vi.spyOn(ticketManager, 'archiveTicket').mockResolvedValue({});

            const result = await ticketManager.performDataRetention({
                archiveAfterDays: 30,
                deleteAfterDays: 365,
                cleanupFailedMessages: true
            });

            expect(result.success).toBe(true);
            expect(result.stats.archivedTickets).toBe(1); // old-ticket should be archived
            expect(result.stats.deletedTickets).toBe(1); // very-old-ticket should be deleted
            expect(result.stats.cleanedFailedMessages).toBe(1); // old failed message cleaned
        });

        it('should limit tickets per user', async () => {
            // Create many tickets for one user
            const manyTickets = {};
            const userTickets = [];
            
            for (let i = 1; i <= 150; i++) {
                const ticketId = `ticket-${i.toString().padStart(3, '0')}`;
                manyTickets[ticketId] = {
                    id: ticketId,
                    userId: 'prolific-user',
                    createdAt: new Date(Date.now() - i * 24 * 60 * 60 * 1000).toISOString(),
                    status: 'closed'
                };
                userTickets.push(ticketId);
            }

            ticketManager.tickets.tickets = manyTickets;
            ticketManager.tickets.userTickets = { 'prolific-user': userTickets };

            const result = await ticketManager.performDataRetention({
                maxTicketsPerUser: 100
            });

            expect(result.success).toBe(true);
            expect(result.stats.deletedTickets).toBe(51); // Should remove 50 oldest tickets + 1 failed message cleanup
            expect(ticketManager.tickets.userTickets['prolific-user']).toHaveLength(100);
        });
    });

    describe('Data Export and Import', () => {
        beforeEach(() => {
            ticketManager.tickets.tickets = {
                'ticket-001': {
                    id: 'ticket-001',
                    userId: 'user-123',
                    username: 'testuser',
                    status: 'closed',
                    createdAt: '2024-01-01T10:00:00.000Z',
                    responses: {
                        description: 'Sensitive information here'
                    }
                }
            };

            ticketManager.tickets._archive = {
                'archived-001': {
                    id: 'archived-001',
                    userId: 'user-456',
                    status: 'closed',
                    archivedAt: '2024-01-01T15:00:00.000Z'
                }
            };

            ticketManager.tickets.userTickets = {
                'user-123': ['ticket-001'],
                'user-456': ['archived-001']
            };
        });

        it('should export ticket data', () => {
            const result = ticketManager.exportTicketData({
                includeArchived: true,
                includeUserMappings: true
            });

            expect(result.success).toBe(true);
            expect(result.data.metadata).toBeDefined();
            expect(result.data.tickets['ticket-001']).toBeDefined();
            expect(result.data.archive['archived-001']).toBeDefined();
            expect(result.data.userTickets['user-123']).toContain('ticket-001');
        });

        it('should export anonymized data', () => {
            const result = ticketManager.exportTicketData({
                anonymize: true,
                includeArchived: true
            });

            expect(result.success).toBe(true);
            expect(result.data.tickets['ticket-001'].userId).toBe('anonymized');
            expect(result.data.tickets['ticket-001'].username).toBe('anonymized');
            expect(result.data.tickets['ticket-001'].responses.description).toBe('[REDACTED]');
            expect(Object.keys(result.data.userTickets)).toHaveLength(0);
        });

        it('should export data with date filtering', () => {
            const result = ticketManager.exportTicketData({
                dateFrom: '2024-01-01T00:00:00.000Z',
                dateTo: '2024-01-01T12:00:00.000Z'
            });

            expect(result.success).toBe(true);
            expect(result.data.tickets['ticket-001']).toBeDefined();
        });

        it('should import ticket data', () => {
            const importData = {
                tickets: {
                    'imported-001': {
                        id: 'imported-001',
                        userId: 'imported-user',
                        status: 'open',
                        createdAt: '2024-02-01T10:00:00.000Z'
                    }
                },
                archive: {
                    'imported-archived-001': {
                        id: 'imported-archived-001',
                        userId: 'imported-user',
                        status: 'closed',
                        archivedAt: '2024-02-01T15:00:00.000Z'
                    }
                }
            };

            const result = ticketManager.importTicketData(importData, {
                createBackup: false
            });

            expect(result.success).toBe(true);
            expect(result.stats.importedTickets).toBe(1);
            expect(result.stats.importedArchived).toBe(1);
            expect(ticketManager.tickets.tickets['imported-001']).toBeDefined();
            expect(ticketManager.tickets._archive['imported-archived-001']).toBeDefined();
            expect(ticketManager.tickets.userTickets['imported-user']).toContain('imported-001');
        });

        it('should skip duplicates during import', () => {
            const importData = {
                tickets: {
                    'ticket-001': { // Duplicate
                        id: 'ticket-001',
                        userId: 'different-user',
                        status: 'open'
                    },
                    'new-ticket': {
                        id: 'new-ticket',
                        userId: 'new-user',
                        status: 'open'
                    }
                }
            };

            const result = ticketManager.importTicketData(importData, {
                skipDuplicates: true,
                createBackup: false
            });

            expect(result.success).toBe(true);
            expect(result.stats.importedTickets).toBe(1);
            expect(result.stats.skippedDuplicates).toBe(1);
            expect(ticketManager.tickets.tickets['ticket-001'].userId).toBe('user-123'); // Original preserved
            expect(ticketManager.tickets.tickets['new-ticket']).toBeDefined();
        });
    });
});