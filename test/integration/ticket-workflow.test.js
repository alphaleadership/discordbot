import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DMTicketManager } from '../../utils/DMTicketManager.js';
import { GuildConfig } from '../../utils/GuildConfig.js';
import fs from 'fs';
import path from 'path';

describe('Ticket System Integration Tests', () => {
    let dmTicketManager;
    let mockClient;
    let mockGuildConfig;
    let testDataPath;

    beforeEach(async () => {
        // Create test data directory
        testDataPath = path.join(process.cwd(), 'test/test-data/integration-tickets.json');
        
        // Mock Discord client
        const { MockClient, MockGuild, MockUser, MockTextChannel } = await import('../mocks/discord.js');
        mockClient = new MockClient();
        
        // Create mock support guild and channels
        const supportGuild = new MockGuild(mockClient, {
            id: '123456789012345678',
            name: 'Support Server'
        });
        
        const supportChannel = new MockTextChannel(supportGuild, {
            id: '987654321098765432',
            name: 'ticket-12345'
        });
        
        mockClient.guilds.cache.set(supportGuild.id, supportGuild);
        supportGuild.channels.cache.set(supportChannel.id, supportChannel);
        
        // Mock guild config
        mockGuildConfig = new GuildConfig();
        
        // Initialize DMTicketManager with test file path
        dmTicketManager = new DMTicketManager(mockClient, mockGuildConfig);
        dmTicketManager.filePath = testDataPath;
        dmTicketManager.supportServerId = supportGuild.id;
        dmTicketManager.tickets = { tickets: {}, userTickets: {}, config: {} };
        dmTicketManager.saveTickets();
    });

    afterEach(() => {
        // Clean up test files
        if (fs.existsSync(testDataPath)) {
            fs.unlinkSync(testDataPath);
        }
        vi.clearAllMocks();
    });

    describe('End-to-End Ticket Creation and Resolution', () => {
        it('should complete full ticket lifecycle from creation to resolution', async () => {
            const { MockUser, MockMessage } = await import('../mocks/discord.js');
            
            // Create mock user
            const testUser = new MockUser({
                id: '111222333444555666',
                username: 'testuser',
                discriminator: '0001'
            });
            
            // Mock user DM channel
            const dmChannel = {
                id: '777888999000111222',
                type: 1, // DM channel
                send: vi.fn().mockResolvedValue({
                    id: 'msg123',
                    content: 'Mock message'
                })
            };
            
            testUser.createDM = vi.fn().mockResolvedValue(dmChannel);
            
            // Step 1: User initiates ticket creation
            const initialMessage = new MockMessage({
                content: 'I need help with my account',
                author: testUser,
                channel: dmChannel
            });
            
            // Start interactive questionnaire
            await dmTicketManager.handleDMMessage(initialMessage);
            
            // Verify questionnaire started
            expect(dmTicketManager.activeQuestions.has(testUser.id)).toBe(true);
            expect(dmChannel.send).toHaveBeenCalledWith(
                expect.stringContaining('What type of issue are you experiencing?')
            );
            
            // Step 2: User responds to category question
            const categoryResponse = new MockMessage({
                content: '2', // Moderation Issue
                author: testUser,
                channel: dmChannel
            });
            
            await dmTicketManager.handleDMMessage(categoryResponse);
            
            // Verify next question asked
            expect(dmChannel.send).toHaveBeenCalledWith(
                expect.stringContaining('How urgent is this issue?')
            );
            
            // Step 3: User responds to priority question
            const priorityResponse = new MockMessage({
                content: '3', // High priority
                author: testUser,
                channel: dmChannel
            });
            
            await dmTicketManager.handleDMMessage(priorityResponse);
            
            // Step 4: User provides detailed description
            const descriptionResponse = new MockMessage({
                content: 'I was unfairly banned from the server and need help appealing',
                author: testUser,
                channel: dmChannel
            });
            
            await dmTicketManager.handleDMMessage(descriptionResponse);
            
            // Step 5: User provides server context
            const serverResponse = new MockMessage({
                content: 'Gaming Community Server',
                author: testUser,
                channel: dmChannel
            });
            
            await dmTicketManager.handleDMMessage(serverResponse);
            
            // Step 6: User describes previous attempts
            const attemptsResponse = new MockMessage({
                content: 'I tried contacting moderators but got no response',
                author: testUser,
                channel: dmChannel
            });
            
            await dmTicketManager.handleDMMessage(attemptsResponse);
            
            // Verify ticket was created
            const tickets = dmTicketManager.getActiveTickets(testUser.id);
            expect(tickets).toHaveLength(1);
            
            const ticket = tickets[0];
            expect(ticket.userId).toBe(testUser.id);
            expect(ticket.status).toBe('open');
            expect(ticket.category).toBe('Moderation Issue');
            expect(ticket.priority).toBe('High - Needs attention within a few hours');
            expect(ticket.description).toBe('I was unfairly banned from the server and need help appealing');
            
            // Step 7: Moderator responds to ticket
            const moderatorUser = new MockUser({
                id: '999888777666555444',
                username: 'moderator',
                discriminator: '0001'
            });
            
            const moderatorResponse = 'Hello! I can help you with your ban appeal. Let me review your case.';
            await dmTicketManager.relayMessageToUser(ticket.id, moderatorResponse, moderatorUser);
            
            // Verify message was relayed to user
            expect(dmChannel.send).toHaveBeenCalledWith(
                expect.stringContaining(moderatorResponse)
            );
            
            // Step 8: Close ticket
            const closeReason = 'Ban appeal approved and user unbanned';
            await dmTicketManager.closeTicket(ticket.id, closeReason, moderatorUser);
            
            // Verify ticket was closed
            const closedTicket = dmTicketManager.tickets.tickets[ticket.id];
            expect(closedTicket.status).toBe('closed');
            expect(closedTicket.closeReason).toBe(closeReason);
            expect(closedTicket.closedBy).toBe(moderatorUser.id);
            expect(closedTicket.closedAt).toBeDefined();
            
            // Verify user was notified of closure
            expect(dmChannel.send).toHaveBeenCalledWith(
                expect.stringContaining('Your ticket has been closed')
            );
        });

        it('should handle multiple concurrent tickets from different users', async () => {
            const { MockUser, MockMessage } = await import('../mocks/discord.js');
            
            // Create multiple test users
            const users = [];
            const dmChannels = [];
            
            for (let i = 0; i < 3; i++) {
                const user = new MockUser({
                    id: `user${i}${Date.now()}`,
                    username: `testuser${i}`,
                    discriminator: '000' + (i + 1)
                });
                
                const dmChannel = {
                    id: `dm${i}${Date.now()}`,
                    type: 1,
                    send: vi.fn().mockResolvedValue({ id: `msg${i}`, content: 'Mock' })
                };
                
                user.createDM = vi.fn().mockResolvedValue(dmChannel);
                users.push(user);
                dmChannels.push(dmChannel);
            }
            
            // Start tickets for all users simultaneously
            const ticketPromises = users.map(async (user, index) => {
                const message = new MockMessage({
                    content: `Help request ${index}`,
                    author: user,
                    channel: dmChannels[index]
                });
                
                return dmTicketManager.handleDMMessage(message);
            });
            
            await Promise.all(ticketPromises);
            
            // Verify all questionnaires started
            users.forEach(user => {
                expect(dmTicketManager.activeQuestions.has(user.id)).toBe(true);
            });
            
            // Complete questionnaires for all users
            for (let i = 0; i < users.length; i++) {
                const user = users[i];
                const dmChannel = dmChannels[i];
                
                // Answer all questions
                const responses = ['1', '2', `Description ${i}`, `Server ${i}`, `Attempts ${i}`];
                
                for (const response of responses) {
                    const message = new MockMessage({
                        content: response,
                        author: user,
                        channel: dmChannel
                    });
                    
                    await dmTicketManager.handleDMMessage(message);
                }
            }
            
            // Verify all tickets were created
            users.forEach(user => {
                const tickets = dmTicketManager.getActiveTickets(user.id);
                expect(tickets).toHaveLength(1);
                expect(tickets[0].status).toBe('open');
            });
            
            // Verify ticket isolation - each user has their own ticket
            const allTickets = Object.values(dmTicketManager.tickets.tickets);
            expect(allTickets).toHaveLength(3);
            
            const userIds = allTickets.map(ticket => ticket.userId);
            expect(new Set(userIds).size).toBe(3); // All unique user IDs
        });

        it('should handle ticket creation when support server is unavailable', async () => {
            const { MockUser, MockMessage } = await import('../mocks/discord.js');
            
            // Set invalid support server ID
            dmTicketManager.supportServerId = 'invalid_server_id';
            
            const testUser = new MockUser({
                id: '111222333444555666',
                username: 'testuser',
                discriminator: '0001'
            });
            
            const dmChannel = {
                id: '777888999000111222',
                type: 1,
                send: vi.fn().mockResolvedValue({ id: 'msg123', content: 'Mock' })
            };
            
            testUser.createDM = vi.fn().mockResolvedValue(dmChannel);
            
            const message = new MockMessage({
                content: 'I need help',
                author: testUser,
                channel: dmChannel
            });
            
            // Should handle gracefully when support server unavailable
            await dmTicketManager.handleDMMessage(message);
            
            // Should still start questionnaire
            expect(dmTicketManager.activeQuestions.has(testUser.id)).toBe(true);
            
            // Should notify user about potential delays
            expect(dmChannel.send).toHaveBeenCalledWith(
                expect.stringContaining('What type of issue are you experiencing?')
            );
        });
    });

    describe('Message Relay System', () => {
        it('should relay messages bidirectionally between DM and support channel', async () => {
            const { MockUser, MockMessage, MockChannel } = await import('../mocks/discord.js');
            
            // Create test ticket
            const testUser = new MockUser({
                id: '111222333444555666',
                username: 'testuser',
                discriminator: '0001'
            });
            
            const supportChannel = new MockTextChannel(supportGuild, {
                id: '987654321098765432',
                name: 'ticket-12345'
            });
            
            supportChannel.send = vi.fn().mockResolvedValue({ id: 'support_msg', content: 'Mock' });
            
            const dmChannel = {
                id: '777888999000111222',
                type: 1,
                send: vi.fn().mockResolvedValue({ id: 'dm_msg', content: 'Mock' })
            };
            
            testUser.createDM = vi.fn().mockResolvedValue(dmChannel);
            
            // Create ticket manually
            const ticketId = await dmTicketManager.createTicket(testUser, 'Test issue');
            dmTicketManager.tickets.tickets[ticketId].supportChannelId = supportChannel.id;
            dmTicketManager.saveTickets();
            
            // Test user message relay to support
            const userMessage = 'I have additional information about my issue';
            await dmTicketManager.relayMessageToSupport(ticketId, userMessage, testUser);
            
            expect(supportChannel.send).toHaveBeenCalledWith(
                expect.stringContaining(userMessage)
            );
            
            // Test moderator message relay to user
            const moderatorUser = new MockUser({
                id: '999888777666555444',
                username: 'moderator',
                discriminator: '0001'
            });
            
            const moderatorMessage = 'Thank you for the additional information';
            await dmTicketManager.relayMessageToUser(ticketId, moderatorMessage, moderatorUser);
            
            expect(dmChannel.send).toHaveBeenCalledWith(
                expect.stringContaining(moderatorMessage)
            );
        });
    });
});