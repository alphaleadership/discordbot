import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DMTicketManager } from '../../utils/DMTicketManager.js';
import { GuildConfig } from '../../utils/GuildConfig.js';
import fs from 'fs';
import path from 'path';

describe('Ticket System Performance Tests', () => {
    let dmTicketManager;
    let mockClient;
    let mockGuildConfig;
    let testDataPath;

    beforeEach(async () => {
        testDataPath = path.join(process.cwd(), 'test/test-data/performance-tickets.json');
        
        // Mock Discord client with performance optimizations
        const { MockClient, MockGuild, MockChannel } = await import('../mocks/discord.js');
        mockClient = new MockClient();
        
        const supportGuild = new MockGuild(mockClient, {
            id: '123456789012345678',
            name: 'Support Server'
        });
        
        mockClient.guilds = new (await import('../mocks/discord.js')).MockCollection();
        mockClient.guilds.set(supportGuild.id, supportGuild);
        mockGuildConfig = new GuildConfig();
        
        dmTicketManager = new DMTicketManager(mockClient, mockGuildConfig);
        dmTicketManager.filePath = testDataPath;
        dmTicketManager.supportServerId = supportGuild.id;
        dmTicketManager.tickets = { tickets: {}, userTickets: {}, config: {} };
        dmTicketManager.saveTickets();
    });

    afterEach(() => {
        if (fs.existsSync(testDataPath)) {
            fs.unlinkSync(testDataPath);
        }
        vi.clearAllMocks();
    });

    describe('High Volume Ticket Creation', () => {
        it('should handle 500 concurrent ticket creations efficiently', async () => {
            const { MockUser } = await import('../mocks/discord.js');
            const startTime = performance.now();
            const ticketCount = 500;
            
            // Create test users
            const users = Array.from({ length: ticketCount }, (_, i) => 
                new MockUser({
                    id: `user_${i}_${Date.now()}`,
                    username: `testuser${i}`,
                    discriminator: String(i % 9999).padStart(4, '0')
                })
            );
            
            // Mock DM channels for all users
            users.forEach(user => {
                user.createDM = vi.fn().mockResolvedValue({
                    id: `dm_${user.id}`,
                    type: 1,
                    send: vi.fn().mockResolvedValue({ id: 'msg', content: 'Mock' })
                });
            });
            
            // Create tickets concurrently
            const ticketPromises = users.map(user => 
                dmTicketManager.createTicket(user, `Help request from ${user.username}`)
            );
            
            const ticketIds = await Promise.all(ticketPromises);
            
            const endTime = performance.now();
            const executionTime = endTime - startTime;
            
            // Performance benchmark: should complete within 10 seconds
            expect(executionTime).toBeLessThan(10000);
            
            // Verify all tickets were created
            expect(ticketIds).toHaveLength(ticketCount);
            ticketIds.forEach(ticketId => {
                expect(ticketId).toBeDefined();
                expect(typeof ticketId).toBe('string');
            });
            
            // Verify data integrity
            const allTickets = Object.keys(dmTicketManager.tickets.tickets);
            expect(allTickets).toHaveLength(ticketCount);
            
            console.log(`✓ Created ${ticketCount} tickets in ${executionTime.toFixed(2)}ms`);
            console.log(`✓ Average: ${(executionTime / ticketCount).toFixed(2)}ms per ticket`);
        });

        it('should maintain performance with large ticket history (10,000 tickets)', async () => {
            const { MockUser } = await import('../mocks/discord.js');
            const startTime = performance.now();
            const totalTickets = 10000;
            const batchSize = 100;
            
            // Create tickets in batches to avoid memory issues
            let createdCount = 0;
            
            for (let batch = 0; batch < totalTickets; batch += batchSize) {
                const batchPromises = [];
                
                for (let i = batch; i < Math.min(batch + batchSize, totalTickets); i++) {
                    const user = new MockUser({
                        id: `batch_user_${i}`,
                        username: `batchuser${i}`,
                        discriminator: String(i % 9999).padStart(4, '0')
                    });
                    
                    user.createDM = vi.fn().mockResolvedValue({
                        id: `dm_${user.id}`,
                        type: 1,
                        send: vi.fn().mockResolvedValue({ id: 'msg', content: 'Mock' })
                    });
                    
                    batchPromises.push(
                        dmTicketManager.createTicket(user, `Batch ticket ${i}`)
                    );
                }
                
                await Promise.all(batchPromises);
                createdCount += batchPromises.length;
                
                // Periodically close some tickets to simulate realistic usage
                if (batch % 500 === 0 && batch > 0) {
                    const ticketsToClose = Object.keys(dmTicketManager.tickets.tickets).slice(0, 50);
                    for (const ticketId of ticketsToClose) {
                        await dmTicketManager.closeTicket(ticketId, 'Batch cleanup', { id: 'moderator' });
                    }
                }
            }
            
            const setupTime = performance.now();
            
            // Test performance of operations with large dataset
            const testUser = new MockUser({
                id: 'performance_test_user',
                username: 'perfuser',
                discriminator: '0001'
            });
            
            testUser.createDM = vi.fn().mockResolvedValue({
                id: 'dm_perf_test',
                type: 1,
                send: vi.fn().mockResolvedValue({ id: 'msg', content: 'Mock' })
            });
            
            // Test ticket creation with large existing dataset
            const newTicketId = await dmTicketManager.createTicket(testUser, 'Performance test ticket');
            
            // Test ticket lookup performance
            const userTickets = dmTicketManager.getActiveTickets(testUser.id);
            
            // Test ticket history retrieval
            const ticketHistory = dmTicketManager.getTicketHistory(testUser.id);
            
            const endTime = performance.now();
            const totalTime = endTime - startTime;
            const operationTime = endTime - setupTime;
            
            // Performance benchmarks
            expect(totalTime).toBeLessThan(60000); // 60 seconds total
            expect(operationTime).toBeLessThan(1000); // 1 second for operations
            
            // Verify operations completed correctly
            expect(newTicketId).toBeDefined();
            expect(userTickets).toHaveLength(1);
            expect(Array.isArray(ticketHistory)).toBe(true);
            
            console.log(`✓ Created ${totalTickets} tickets in ${totalTime.toFixed(2)}ms`);
            console.log(`✓ Operations with large dataset: ${operationTime.toFixed(2)}ms`);
        });
    });

    describe('Message Relay Performance', () => {
        it('should handle high-frequency message relay efficiently', async () => {
            const { MockUser, MockChannel } = await import('../mocks/discord.js');
            const startTime = performance.now();
            const messageCount = 1000;
            
            // Create test ticket
            const testUser = new MockUser({
                id: 'relay_test_user',
                username: 'relayuser',
                discriminator: '0001'
            });
            
            const dmChannel = {
                id: 'dm_relay_test',
                type: 1,
                send: vi.fn().mockResolvedValue({ id: 'msg', content: 'Mock' })
            };
            
            testUser.createDM = vi.fn().mockResolvedValue(dmChannel);
            
            const ticketId = await dmTicketManager.createTicket(testUser, 'Relay performance test');
            
            // Create mock support channel
            const supportChannel = new MockChannel({
                id: 'support_relay_test',
                name: 'ticket-relay-test',
                type: 0,
                send: vi.fn().mockResolvedValue({ id: 'support_msg', content: 'Mock' })
            });
            
            dmTicketManager.tickets.tickets[ticketId].supportChannelId = supportChannel.id;
            
            // Test bidirectional message relay
            const relayPromises = [];
            
            for (let i = 0; i < messageCount / 2; i++) {
                // User to support
                relayPromises.push(
                    dmTicketManager.relayMessageToSupport(ticketId, `User message ${i}`, testUser)
                );
                
                // Support to user
                relayPromises.push(
                    dmTicketManager.relayMessageToUser(ticketId, `Support response ${i}`, { id: 'moderator' })
                );
            }
            
            await Promise.all(relayPromises);
            
            const endTime = performance.now();
            const executionTime = endTime - startTime;
            
            // Performance benchmark: should complete within 5 seconds
            expect(executionTime).toBeLessThan(5000);
            
            // Verify all messages were relayed
            expect(dmChannel.send).toHaveBeenCalledTimes(messageCount / 2);
            expect(supportChannel.send).toHaveBeenCalledTimes(messageCount / 2);
            
            console.log(`✓ Relayed ${messageCount} messages in ${executionTime.toFixed(2)}ms`);
            console.log(`✓ Average: ${(executionTime / messageCount).toFixed(2)}ms per message`);
        });

        it('should maintain performance during concurrent relay operations', async () => {
            const { MockUser, MockChannel } = await import('../mocks/discord.js');
            const startTime = performance.now();
            const ticketCount = 50;
            const messagesPerTicket = 20;
            
            // Create multiple tickets with active conversations
            const tickets = [];
            
            for (let i = 0; i < ticketCount; i++) {
                const user = new MockUser({
                    id: `concurrent_user_${i}`,
                    username: `concurrentuser${i}`,
                    discriminator: String(i).padStart(4, '0')
                });
                
                const dmChannel = {
                    id: `dm_concurrent_${i}`,
                    type: 1,
                    send: vi.fn().mockResolvedValue({ id: 'msg', content: 'Mock' })
                };
                
                user.createDM = vi.fn().mockResolvedValue(dmChannel);
                
                const ticketId = await dmTicketManager.createTicket(user, `Concurrent test ${i}`);
                
                const supportChannel = new MockChannel({
                    id: `support_concurrent_${i}`,
                    name: `ticket-concurrent-${i}`,
                    type: 0,
                    send: vi.fn().mockResolvedValue({ id: 'support_msg', content: 'Mock' })
                });
                
                dmTicketManager.tickets.tickets[ticketId].supportChannelId = supportChannel.id;
                
                tickets.push({
                    ticketId,
                    user,
                    dmChannel,
                    supportChannel
                });
            }
            
            const setupTime = performance.now();
            
            // Create concurrent message relay operations
            const relayPromises = [];
            
            for (const ticket of tickets) {
                for (let i = 0; i < messagesPerTicket; i++) {
                    // Alternate between user and support messages
                    if (i % 2 === 0) {
                        relayPromises.push(
                            dmTicketManager.relayMessageToSupport(
                                ticket.ticketId,
                                `Concurrent user message ${i}`,
                                ticket.user
                            )
                        );
                    } else {
                        relayPromises.push(
                            dmTicketManager.relayMessageToUser(
                                ticket.ticketId,
                                `Concurrent support response ${i}`,
                                { id: 'moderator' }
                            )
                        );
                    }
                }
            }
            
            await Promise.all(relayPromises);
            
            const endTime = performance.now();
            const totalTime = endTime - startTime;
            const relayTime = endTime - setupTime;
            const totalMessages = ticketCount * messagesPerTicket;
            
            // Performance benchmarks
            expect(relayTime).toBeLessThan(10000); // 10 seconds for relay operations
            
            // Verify all messages were processed
            tickets.forEach(ticket => {
                const userMessages = Math.ceil(messagesPerTicket / 2);
                const supportMessages = Math.floor(messagesPerTicket / 2);
                
                expect(ticket.supportChannel.send).toHaveBeenCalledTimes(userMessages);
                expect(ticket.dmChannel.send).toHaveBeenCalledTimes(supportMessages);
            });
            
            console.log(`✓ ${ticketCount} concurrent tickets with ${totalMessages} messages`);
            console.log(`✓ Relay operations completed in ${relayTime.toFixed(2)}ms`);
        });
    });

    describe('File I/O and Data Persistence Performance', () => {
        it('should handle frequent ticket updates efficiently', async () => {
            const { MockUser } = await import('../mocks/discord.js');
            const startTime = performance.now();
            const updateCount = 1000;
            
            // Create base tickets
            const baseTicketCount = 100;
            const tickets = [];
            
            for (let i = 0; i < baseTicketCount; i++) {
                const user = new MockUser({
                    id: `update_user_${i}`,
                    username: `updateuser${i}`,
                    discriminator: String(i).padStart(4, '0')
                });
                
                user.createDM = vi.fn().mockResolvedValue({
                    id: `dm_update_${i}`,
                    type: 1,
                    send: vi.fn().mockResolvedValue({ id: 'msg', content: 'Mock' })
                });
                
                const ticketId = await dmTicketManager.createTicket(user, `Update test ${i}`);
                tickets.push(ticketId);
            }
            
            const setupTime = performance.now();
            
            // Perform frequent updates
            const updatePromises = [];
            
            for (let i = 0; i < updateCount; i++) {
                const ticketId = tickets[i % tickets.length];
                
                // Alternate between different types of updates
                if (i % 3 === 0) {
                    // Add message to ticket
                    updatePromises.push(
                        dmTicketManager.addMessageToTicket(ticketId, {
                            content: `Update message ${i}`,
                            author: { id: 'user' },
                            timestamp: new Date().toISOString()
                        })
                    );
                } else if (i % 3 === 1) {
                    // Update ticket status
                    updatePromises.push(
                        dmTicketManager.updateTicketStatus(ticketId, 'investigating')
                    );
                } else {
                    // Add note to ticket
                    updatePromises.push(
                        dmTicketManager.addTicketNote(ticketId, `Note ${i}`, { id: 'moderator' })
                    );
                }
            }
            
            await Promise.all(updatePromises);
            
            const endTime = performance.now();
            const totalTime = endTime - startTime;
            const updateTime = endTime - setupTime;
            
            // Performance benchmarks
            expect(updateTime).toBeLessThan(15000); // 15 seconds for updates
            
            // Verify file integrity
            const fileStats = fs.statSync(testDataPath);
            expect(fileStats.size).toBeGreaterThan(0);
            
            // Verify data can be loaded correctly
            const loadedData = JSON.parse(fs.readFileSync(testDataPath, 'utf-8'));
            expect(Object.keys(loadedData.tickets)).toHaveLength(baseTicketCount);
            
            console.log(`✓ ${updateCount} ticket updates in ${updateTime.toFixed(2)}ms`);
            console.log(`✓ Average: ${(updateTime / updateCount).toFixed(2)}ms per update`);
        });
    });

    describe('Memory Management', () => {
        it('should maintain reasonable memory usage with large ticket volumes', async () => {
            const { MockUser } = await import('../mocks/discord.js');
            const initialMemory = process.memoryUsage();
            
            // Create large number of tickets with conversation history
            const ticketCount = 1000;
            const messagesPerTicket = 50;
            
            for (let i = 0; i < ticketCount; i++) {
                const user = new MockUser({
                    id: `memory_user_${i}`,
                    username: `memoryuser${i}`,
                    discriminator: String(i).padStart(4, '0')
                });
                
                user.createDM = vi.fn().mockResolvedValue({
                    id: `dm_memory_${i}`,
                    type: 1,
                    send: vi.fn().mockResolvedValue({ id: 'msg', content: 'Mock' })
                });
                
                const ticketId = await dmTicketManager.createTicket(user, `Memory test ${i}`);
                
                // Add conversation history
                for (let j = 0; j < messagesPerTicket; j++) {
                    await dmTicketManager.addMessageToTicket(ticketId, {
                        content: `Message ${j} in ticket ${i}`,
                        author: { id: j % 2 === 0 ? user.id : 'moderator' },
                        timestamp: new Date().toISOString()
                    });
                }
                
                // Close some tickets to simulate realistic usage
                if (i % 10 === 0 && i > 0) {
                    await dmTicketManager.closeTicket(ticketId, 'Memory test cleanup', { id: 'moderator' });
                }
            }
            
            // Force garbage collection if available
            if (global.gc) {
                global.gc();
            }
            
            const finalMemory = process.memoryUsage();
            const memoryIncrease = finalMemory.heapUsed - initialMemory.heapUsed;
            
            // Memory increase should be reasonable (less than 100MB for 1000 tickets)
            expect(memoryIncrease).toBeLessThan(100 * 1024 * 1024);
            
            console.log(`✓ Memory increase: ${(memoryIncrease / 1024 / 1024).toFixed(2)}MB for ${ticketCount} tickets`);
        });
    });
});