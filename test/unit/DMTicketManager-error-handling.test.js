import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { DMTicketManager } from '../../utils/DMTicketManager.js';
import { EmbedBuilder, ChannelType, PermissionFlagsBits } from 'discord.js';
import fs from 'fs';
import path from 'path';

// Mock Discord.js
vi.mock('discord.js', async () => {
    const actual = await vi.importActual('discord.js');
    return {
        ...actual,
        EmbedBuilder: vi.fn().mockImplementation(() => ({
            setColor: vi.fn().mockReturnThis(),
            setTitle: vi.fn().mockReturnThis(),
            setDescription: vi.fn().mockReturnThis(),
            addFields: vi.fn().mockReturnThis(),
            setFooter: vi.fn().mockReturnThis(),
            setTimestamp: vi.fn().mockReturnThis(),
            setAuthor: vi.fn().mockReturnThis(),
            setThumbnail: vi.fn().mockReturnThis()
        }))
    };
});

describe('DMTicketManager Error Handling', () => {
    let ticketManager;
    let mockClient;
    let mockGuildConfig;
    let mockUser;
    let mockGuild;
    let mockChannel;
    let testDataPath;

    beforeEach(() => {
        // Setup test data directory
        testDataPath = path.join(process.cwd(), 'test/test-data/tickets-error-test.json');
        
        // Mock user
        mockUser = {
            id: '123456789',
            tag: 'TestUser#1234',
            username: 'TestUser',
            discriminator: '1234',
            displayAvatarURL: vi.fn().mockReturnValue('https://example.com/avatar.png'),
            send: vi.fn().mockResolvedValue({ delete: vi.fn() })
        };

        // Mock channel
        mockChannel = {
            id: 'channel123',
            name: 'test-channel',
            send: vi.fn().mockResolvedValue({}),
            delete: vi.fn().mockResolvedValue({}),
            permissionOverwrites: {
                create: vi.fn().mockResolvedValue({})
            }
        };

        // Mock guild
        mockGuild = {
            id: 'guild123',
            name: 'Test Guild',
            available: true,
            channels: {
                cache: new Map(),
                create: vi.fn().mockResolvedValue(mockChannel)
            },
            members: {
                cache: new Map([
                    ['123456789', { id: '123456789' }], // User
                    ['bot123', { id: 'bot123', permissions: { has: vi.fn().mockReturnValue(true) } }] // Bot
                ])
            },
            roles: {
                everyone: { id: 'everyone123' },
                cache: {
                    find: vi.fn().mockImplementation((predicate) => {
                        const roles = [
                            { id: 'mod123', name: 'Moderator' },
                            { id: 'admin123', name: 'Admin' },
                            { id: 'support123', name: 'Support' }
                        ];
                        return roles.find(predicate);
                    }),
                    size: 10
                }
            }
        };

        // Mock client
        mockClient = {
            user: { id: 'bot123' },
            guilds: {
                cache: {
                    get: vi.fn().mockImplementation((id) => id === 'guild123' ? mockGuild : undefined),
                    has: vi.fn().mockImplementation((id) => id === 'guild123'),
                    filter: vi.fn().mockImplementation((predicate) => {
                        const guilds = [mockGuild];
                        const filtered = guilds.filter(predicate);
                        return {
                            size: filtered.length,
                            first: () => filtered[0],
                            find: (pred) => filtered.find(pred),
                            has: (id) => filtered.some(g => g.id === id)
                        };
                    })
                }
            },
            users: {
                cache: new Map([['123456789', mockUser]]),
                fetch: vi.fn().mockResolvedValue(mockUser)
            },
            channels: {
                cache: new Map([['channel123', mockChannel]])
            }
        };

        // Mock guild config
        mockGuildConfig = {
            get: vi.fn().mockReturnValue({}),
            set: vi.fn()
        };

        // Create ticket manager with test file path
        ticketManager = new DMTicketManager(mockClient, mockGuildConfig);
        ticketManager.filePath = testDataPath;
        ticketManager.setSupportServer('guild123');

        // Ensure test directory exists
        const testDir = path.dirname(testDataPath);
        if (!fs.existsSync(testDir)) {
            fs.mkdirSync(testDir, { recursive: true });
        }
    });

    afterEach(() => {
        // Clean up test files
        try {
            if (fs.existsSync(testDataPath)) {
                fs.unlinkSync(testDataPath);
            }
        } catch (error) {
            // Ignore file cleanup errors in tests
            console.warn('Could not clean up test file:', error.message);
        }
        vi.clearAllMocks();
    });

    describe('checkUserDMAvailability', () => {
        it('should return available true when DMs are open', async () => {
            mockUser.send.mockResolvedValueOnce({ delete: vi.fn() });

            const result = await ticketManager.checkUserDMAvailability(mockUser);

            expect(result.available).toBe(true);
            expect(result.reason).toBe(null);
            expect(mockUser.send).toHaveBeenCalled();
        });

        it('should return available false when DMs are disabled (code 50007)', async () => {
            const dmError = new Error('Cannot send messages to this user');
            dmError.code = 50007;
            mockUser.send.mockRejectedValueOnce(dmError);

            const result = await ticketManager.checkUserDMAvailability(mockUser);

            expect(result.available).toBe(false);
            expect(result.reason).toBe('dms_disabled');
            expect(result.error).toBe('Cannot send messages to this user');
        });

        it('should return available false when bot is blocked (code 50013)', async () => {
            const blockError = new Error('Missing Permissions');
            blockError.code = 50013;
            mockUser.send.mockRejectedValueOnce(blockError);

            const result = await ticketManager.checkUserDMAvailability(mockUser);

            expect(result.available).toBe(false);
            expect(result.reason).toBe('bot_blocked');
        });

        it('should handle unknown DM errors gracefully', async () => {
            const unknownError = new Error('Unknown error');
            mockUser.send.mockRejectedValueOnce(unknownError);

            const result = await ticketManager.checkUserDMAvailability(mockUser);

            expect(result.available).toBe(false);
            expect(result.reason).toBe('unknown');
        });
    });

    describe('handleDisabledDMs', () => {
        it('should create temporary channel when DMs are disabled', async () => {
            const result = await ticketManager.handleDisabledDMs(mockUser, 'Test message', 'dms_disabled');

            expect(result.success).toBe(true);
            expect(result.method).toBe('temp_channel');
            expect(result.tempChannel).toBe('channel123');
            expect(mockGuild.channels.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    name: 'temp-ticket-TestUser',
                    type: ChannelType.GuildText
                })
            );
        });

        it('should queue ticket when no suitable guild is found', async () => {
            // Remove bot from guild members
            mockGuild.members.cache.delete('bot123');

            const result = await ticketManager.handleDisabledDMs(mockUser, 'Test message', 'dms_disabled');

            expect(result.success).toBe(true);
            expect(result.queued).toBe(true);
            expect(ticketManager.tickets._queue).toHaveLength(1);
        });

        it('should handle channel creation failures', async () => {
            mockGuild.channels.create.mockRejectedValueOnce(new Error('Channel creation failed'));

            const result = await ticketManager.handleDisabledDMs(mockUser, 'Test message', 'dms_disabled');

            expect(result.success).toBe(true);
            expect(result.queued).toBe(true);
        });
    });

    describe('checkSupportServerAvailability', () => {
        it('should return available true when support server is properly configured', async () => {
            const result = await ticketManager.checkSupportServerAvailability();

            expect(result.available).toBe(true);
            expect(result.guild.id).toBe('guild123');
            expect(result.guild.name).toBe('Test Guild');
        });

        it('should return available false when no support server is configured', async () => {
            ticketManager.setSupportServer(null);

            const result = await ticketManager.checkSupportServerAvailability();

            expect(result.available).toBe(false);
            expect(result.reason).toBe('no_support_server_configured');
        });

        it('should return available false when support server is not found', async () => {
            ticketManager.setSupportServer('nonexistent123');

            const result = await ticketManager.checkSupportServerAvailability();

            expect(result.available).toBe(false);
            expect(result.reason).toBe('support_server_not_found');
        });

        it('should return available false when support server is unavailable', async () => {
            mockGuild.available = false;

            const result = await ticketManager.checkSupportServerAvailability();

            expect(result.available).toBe(false);
            expect(result.reason).toBe('support_server_outage');
        });

        it('should return available false when bot lacks permissions', async () => {
            const botMember = mockGuild.members.cache.get('bot123');
            botMember.permissions.has.mockReturnValue(false);

            const result = await ticketManager.checkSupportServerAvailability();

            expect(result.available).toBe(false);
            expect(result.reason).toBe('insufficient_permissions');
            expect(result.missingPermissions).toBeDefined();
        });

        it('should return available false when channel limit is reached', async () => {
            // Mock 500 channels (Discord's limit)
            for (let i = 0; i < 500; i++) {
                mockGuild.channels.cache.set(`channel${i}`, { id: `channel${i}` });
            }

            const result = await ticketManager.checkSupportServerAvailability();

            expect(result.available).toBe(false);
            expect(result.reason).toBe('channel_limit_reached');
        });
    });

    describe('queueTicketForLater', () => {
        it('should queue ticket and notify user', async () => {
            const result = await ticketManager.queueTicketForLater(mockUser, 'Test message', 'support_server_outage');

            expect(result.success).toBe(true);
            expect(result.queued).toBe(true);
            expect(ticketManager.tickets._queue).toHaveLength(1);
            expect(ticketManager.tickets._queue[0].userId).toBe('123456789');
            expect(ticketManager.tickets._queue[0].reason).toBe('support_server_outage');
            expect(mockUser.send).toHaveBeenCalled();
        });

        it('should handle notification failures gracefully', async () => {
            mockUser.send.mockRejectedValueOnce(new Error('DM failed'));

            const result = await ticketManager.queueTicketForLater(mockUser, 'Test message', 'support_server_outage');

            expect(result.success).toBe(true);
            expect(result.queued).toBe(true);
            expect(ticketManager.tickets._queue[0].notificationFailed).toBe(true);
        });

        it('should provide appropriate queue reason descriptions', () => {
            const descriptions = [
                ['no_support_server_configured', 'Support server not configured'],
                ['support_server_outage', 'Support server experiencing an outage'],
                ['insufficient_permissions', 'Permission configuration issue'],
                ['unknown_reason', 'Technical issue: unknown_reason']
            ];

            descriptions.forEach(([reason, expectedDescription]) => {
                const description = ticketManager.getQueueReasonDescription(reason);
                expect(description).toBe(expectedDescription);
            });
        });
    });

    describe('processQueuedTickets', () => {
        beforeEach(() => {
            // Add some queued tickets
            ticketManager.tickets._queue = [
                {
                    id: 'queued-1',
                    userId: '123456789',
                    initialMessage: 'Test message 1',
                    queuedAt: new Date().toISOString(),
                    retryCount: 0
                },
                {
                    id: 'queued-2',
                    userId: '987654321',
                    initialMessage: 'Test message 2',
                    queuedAt: new Date().toISOString(),
                    retryCount: 3 // Exceeded max retries
                }
            ];
        });

        it('should process queued tickets when support server becomes available', async () => {
            // Mock successful ticket creation
            vi.spyOn(ticketManager, 'createTicket').mockResolvedValueOnce({
                success: true,
                ticketId: 'ticket-000001'
            });

            const result = await ticketManager.processQueuedTickets();

            expect(result.success).toBe(true);
            expect(result.processedCount).toBe(1);
            expect(ticketManager.tickets._failedQueue).toHaveLength(1); // One moved to failed queue
        });

        it('should move failed tickets to failed queue', async () => {
            const result = await ticketManager.processQueuedTickets();

            expect(ticketManager.tickets._failedQueue).toHaveLength(1);
            expect(ticketManager.tickets._failedQueue[0].id).toBe('queued-2');
        });

        it('should not process when support server is still unavailable', async () => {
            mockGuild.available = false;

            const result = await ticketManager.processQueuedTickets();

            expect(result.success).toBe(false);
            expect(result.reason).toBe('support_server_outage');
        });
    });

    describe('sendMessageWithRetry', () => {
        it('should send message successfully on first attempt', async () => {
            const mockMessage = { id: 'message123' };
            mockUser.send.mockResolvedValueOnce(mockMessage);

            const result = await ticketManager.sendMessageWithRetry(mockUser, { content: 'Test' });

            expect(result).toBe(mockMessage);
            expect(mockUser.send).toHaveBeenCalledTimes(1);
        });

        it('should retry on retryable errors', async () => {
            const retryableError = new Error('Rate limited');
            retryableError.code = 429;
            
            mockUser.send
                .mockRejectedValueOnce(retryableError)
                .mockRejectedValueOnce(retryableError)
                .mockResolvedValueOnce({ id: 'message123' });

            const result = await ticketManager.sendMessageWithRetry(mockUser, { content: 'Test' });

            expect(result.id).toBe('message123');
            expect(mockUser.send).toHaveBeenCalledTimes(3);
        });

        it('should not retry on permanent errors', async () => {
            const permanentError = new Error('User not found');
            permanentError.code = 10013;
            
            mockUser.send.mockRejectedValueOnce(permanentError);

            await expect(ticketManager.sendMessageWithRetry(mockUser, { content: 'Test' }))
                .rejects.toThrow('User not found');
            
            expect(mockUser.send).toHaveBeenCalledTimes(1);
        });

        it('should stop retrying after max attempts', async () => {
            const retryableError = new Error('Timeout');
            retryableError.code = 504;
            
            mockUser.send.mockRejectedValue(retryableError);

            await expect(ticketManager.sendMessageWithRetry(mockUser, { content: 'Test' }))
                .rejects.toThrow('Timeout');
            
            expect(mockUser.send).toHaveBeenCalledTimes(4); // Initial + 3 retries
        });
    });

    describe('isRetryableError', () => {
        it('should identify retryable HTTP status codes', () => {
            const retryableCodes = [429, 500, 502, 503, 504];
            
            retryableCodes.forEach(code => {
                const error = new Error('Test error');
                error.code = code;
                expect(ticketManager.isRetryableError(error)).toBe(true);
            });
        });

        it('should identify non-retryable errors', () => {
            const nonRetryableCodes = [400, 401, 403, 404, 10013];
            
            nonRetryableCodes.forEach(code => {
                const error = new Error('Test error');
                error.code = code;
                expect(ticketManager.isRetryableError(error)).toBe(false);
            });
        });

        it('should identify retryable network errors by message', () => {
            const retryableMessages = [
                'network error',
                'timeout occurred',
                'connection reset',
                'socket hang up'
            ];
            
            retryableMessages.forEach(message => {
                const error = new Error(message);
                expect(ticketManager.isRetryableError(error)).toBe(true);
            });
        });
    });

    describe('recreateSupportChannel', () => {
        let mockTicket;

        beforeEach(() => {
            mockTicket = {
                id: 'ticket-000001',
                userId: '123456789',
                supportChannelId: 'old-channel-123',
                createdAt: new Date().toISOString(),
                responses: {
                    category: { label: 'Technical Issue' },
                    priority: { label: 'High' },
                    description: 'Test description'
                }
            };
        });

        it('should recreate support channel successfully', async () => {
            const result = await ticketManager.recreateSupportChannel(mockTicket, mockUser);

            expect(result).toBe(mockChannel);
            expect(mockGuild.channels.create).toHaveBeenCalledWith(
                expect.objectContaining({
                    name: 'ticket-ticket-000001-recovered',
                    topic: expect.stringContaining('RECOVERED')
                })
            );
            expect(mockChannel.send).toHaveBeenCalled();
        });

        it('should handle missing support server', async () => {
            ticketManager.setSupportServer(null);

            await expect(ticketManager.recreateSupportChannel(mockTicket, mockUser))
                .rejects.toThrow('No support server configured');
        });

        it('should handle channel creation failure', async () => {
            mockGuild.channels.create.mockRejectedValueOnce(new Error('Channel creation failed'));

            await expect(ticketManager.recreateSupportChannel(mockTicket, mockUser))
                .rejects.toThrow('Channel creation failed');
        });
    });

    describe('logTicketError', () => {
        it('should log errors with context', async () => {
            const error = new Error('Test error');
            error.code = 500;
            
            await ticketManager.logTicketError('createTicket', error, { userId: '123456789' });

            expect(ticketManager.tickets._errorLogs).toHaveLength(1);
            expect(ticketManager.tickets._errorLogs[0]).toMatchObject({
                operation: 'createTicket',
                error: {
                    message: 'Test error',
                    code: 500
                },
                context: { userId: '123456789' }
            });
        });

        it('should limit error log size to 100 entries', async () => {
            // Add 105 error logs
            for (let i = 0; i < 105; i++) {
                await ticketManager.logTicketError('test', new Error(`Error ${i}`), {});
            }

            expect(ticketManager.tickets._errorLogs).toHaveLength(100);
            expect(ticketManager.tickets._errorLogs[0].error.message).toBe('Error 5'); // First 5 should be removed
        });
    });

    describe('handleTicketCreationError', () => {
        it('should provide specific error messages for known error codes', async () => {
            const permissionError = new Error('Missing Permissions');
            permissionError.code = 50013;

            const result = await ticketManager.handleTicketCreationError(mockUser, permissionError);

            expect(result.success).toBe(false);
            expect(result.userNotified).toBe(true);
            expect(result.canRetry).toBe(false);
            expect(mockUser.send).toHaveBeenCalled();
        });

        it('should indicate retry possibility for retryable errors', async () => {
            const retryableError = new Error('Service Unavailable');
            retryableError.code = 503;

            const result = await ticketManager.handleTicketCreationError(mockUser, retryableError);

            expect(result.canRetry).toBe(true);
        });

        it('should handle notification failures', async () => {
            mockUser.send.mockRejectedValueOnce(new Error('DM failed'));

            const result = await ticketManager.handleTicketCreationError(mockUser, new Error('Test'));

            expect(result.userNotified).toBe(false);
            expect(result.notificationError).toBe('DM failed');
        });
    });

    describe('getErrorStatistics', () => {
        beforeEach(async () => {
            // Add some test data
            await ticketManager.logTicketError('createTicket', new Error('Error 1'), {});
            await ticketManager.logTicketError('relayMessage', new Error('Error 2'), {});
            
            ticketManager.tickets._queue = [
                { id: 'q1', queuedAt: new Date().toISOString() }
            ];
            
            ticketManager.tickets._failedQueue = [
                { id: 'f1', failedAt: new Date().toISOString() }
            ];
            
            ticketManager.tickets._failedMessages = [
                { id: 'm1', retryCount: 1 },
                { id: 'm2', retryCount: 5 }
            ];
        });

        it('should generate comprehensive error statistics', () => {
            const result = ticketManager.getErrorStatistics();

            expect(result.success).toBe(true);
            expect(result.statistics.errorLogs.total).toBe(2);
            expect(result.statistics.errorLogs.byOperation.createTicket).toBe(1);
            expect(result.statistics.errorLogs.byOperation.relayMessage).toBe(1);
            expect(result.statistics.queue.pending).toBe(1);
            expect(result.statistics.queue.failed).toBe(1);
            expect(result.statistics.failedMessages.total).toBe(2);
            expect(result.statistics.failedMessages.needingRetry).toBe(1);
            expect(result.statistics.systemHealth.supportServerConfigured).toBe(true);
        });

        it('should filter statistics by date range', () => {
            const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
            const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

            const result = ticketManager.getErrorStatistics({
                dateFrom: yesterday,
                dateTo: tomorrow
            });

            expect(result.success).toBe(true);
            expect(result.statistics.errorLogs.total).toBe(2);
        });
    });

    describe('formatDuration', () => {
        it('should format durations correctly', () => {
            expect(ticketManager.formatDuration(1000)).toBe('1 second');
            expect(ticketManager.formatDuration(2000)).toBe('2 seconds');
            expect(ticketManager.formatDuration(60000)).toBe('1 minute, 0 seconds');
            expect(ticketManager.formatDuration(3661000)).toBe('1 hour, 1 minute');
            expect(ticketManager.formatDuration(90061000)).toBe('1 day, 1 hour');
        });
    });

    describe('Integration Tests', () => {
        it('should handle complete error recovery workflow', async () => {
            // Simulate DMs disabled
            mockUser.send.mockRejectedValueOnce(new Error('Cannot send messages to this user'));
            
            // Create ticket should fall back to temp channel
            const result = await ticketManager.createTicket(mockUser, 'Help me');
            
            expect(result.success).toBe(true);
            expect(result.method).toBe('temp_channel');
            expect(mockGuild.channels.create).toHaveBeenCalled();
        });

        it('should handle support server outage and recovery', async () => {
            // Simulate support server outage
            mockGuild.available = false;
            
            // Ticket should be queued
            const createResult = await ticketManager.createTicket(mockUser, 'Help me');
            expect(createResult.queued).toBe(true);
            
            // Restore server availability
            mockGuild.available = true;
            vi.spyOn(ticketManager, 'createTicket').mockResolvedValueOnce({
                success: true,
                ticketId: 'ticket-000001'
            });
            
            // Process queue should succeed
            const processResult = await ticketManager.processQueuedTickets();
            expect(processResult.success).toBe(true);
            expect(processResult.processedCount).toBe(1);
        });
    });
});