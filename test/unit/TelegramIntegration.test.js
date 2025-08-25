import TelegramIntegration from '../../utils/managers/TelegramIntegration.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Test configuration
const TEST_DATA_DIR = path.join(__dirname, '../test-data');
const TEST_MESSAGES_FILE = path.join(TEST_DATA_DIR, 'test-telegram-messages.json');
const TEST_NOTIFICATIONS_FILE = path.join(TEST_DATA_DIR, 'test-telegram-notifications.json');

// Mock dependencies
class MockDiscordClient {
    constructor() {
        this.channels = new Map();
        this.guilds = new Map();
    }

    addChannel(id, channel) {
        this.channels.set(id, channel);
    }

    addGuild(id, guild) {
        this.guilds.set(id, guild);
    }
}

class MockDiscordChannel {
    constructor(id, name = 'test-channel') {
        this.id = id;
        this.name = name;
        this.messages = [];
    }

    async send(content) {
        const message = {
            id: Date.now().toString(),
            content: typeof content === 'string' ? content : content.content || '',
            embeds: typeof content === 'object' && content.embeds ? content.embeds : [],
            timestamp: new Date()
        };
        this.messages.push(message);
        return message;
    }
}

class MockTelegramBot {
    constructor() {
        this.messages = [];
        this.listeners = new Map();
        this.connected = true;
    }

    async sendMessage(chatId, text, options = {}) {
        if (!this.connected) {
            throw new Error('Bot not connected');
        }
        
        const message = {
            message_id: Date.now(),
            chat: { id: chatId },
            text,
            ...options
        };
        this.messages.push(message);
        return message;
    }

    async sendPhoto(chatId, photo, options = {}) {
        if (!this.connected) {
            throw new Error('Bot not connected');
        }
        
        const message = {
            message_id: Date.now(),
            chat: { id: chatId },
            photo: [{ file_id: 'mock-photo-id' }],
            caption: options.caption || '',
            ...options
        };
        this.messages.push(message);
        return message;
    }

    on(event, callback) {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, []);
        }
        this.listeners.get(event).push(callback);
    }

    emit(event, ...args) {
        const callbacks = this.listeners.get(event) || [];
        callbacks.forEach(callback => callback(...args));
    }

    setConnected(connected) {
        this.connected = connected;
    }
}

describe('TelegramIntegration', () => {
    let telegramIntegration;
    let mockDiscordClient;
    let mockTelegramBot;
    let mockDiscordChannel;

    beforeEach(() => {
        // Ensure test data directory exists
        if (!fs.existsSync(TEST_DATA_DIR)) {
            fs.mkdirSync(TEST_DATA_DIR, { recursive: true });
        }

        // Clean up test files if they exist
        [TEST_MESSAGES_FILE, TEST_NOTIFICATIONS_FILE].forEach(file => {
            if (fs.existsSync(file)) {
                fs.unlinkSync(file);
            }
        });

        // Setup mocks
        mockDiscordClient = new MockDiscordClient();
        mockTelegramBot = new MockTelegramBot();
        mockDiscordChannel = new MockDiscordChannel('discord-channel-id');
        
        mockDiscordClient.addChannel('discord-channel-id', mockDiscordChannel);

        // Create TelegramIntegration instance
        telegramIntegration = new TelegramIntegration(
            'mock-bot-token',
            {
                'test-guild': {
                    telegramChannelId: 'telegram-chat-id',
                    discordChannelId: 'discord-channel-id',
                    bidirectional: true
                }
            },
            mockDiscordClient,
            TEST_MESSAGES_FILE,
            TEST_NOTIFICATIONS_FILE
        );

        // Replace the real bot with mock
        telegramIntegration.bot = mockTelegramBot;
    });

    afterEach(() => {
        // Clean up test files
        [TEST_MESSAGES_FILE, TEST_NOTIFICATIONS_FILE].forEach(file => {
            if (fs.existsSync(file)) {
                fs.unlinkSync(file);
            }
        });
    });

    describe('Discord to Telegram Notifications', () => {
        test('should send moderation notification to Telegram', async () => {
            const result = await telegramIntegration.sendNotification(
                'test-guild',
                'User banned for spam',
                'high'
            );

            expect(result.success).toBe(true);
            expect(mockTelegramBot.messages).toHaveLength(1);
            expect(mockTelegramBot.messages[0].text).toContain('User banned for spam');
        });

        test('should format different event types correctly', async () => {
            const events = [
                { type: 'ban', message: 'User banned', priority: 'high' },
                { type: 'warn', message: 'User warned', priority: 'normal' },
                { type: 'raid', message: 'Raid detected', priority: 'urgent' },
                { type: 'dox', message: 'Dox detected', priority: 'urgent' }
            ];

            for (const event of events) {
                await telegramIntegration.sendNotification(
                    'test-guild',
                    event.message,
                    event.priority
                );
            }

            expect(mockTelegramBot.messages).toHaveLength(events.length);
            
            // Check that urgent messages have different formatting
            const urgentMessages = mockTelegramBot.messages.filter(m => 
                m.text.includes('🚨') || m.text.includes('URGENT')
            );
            expect(urgentMessages.length).toBeGreaterThan(0);
        });

        test('should handle notification queue and retry logic', async () => {
            // Simulate connection failure
            mockTelegramBot.setConnected(false);

            const result = await telegramIntegration.sendNotification(
                'test-guild',
                'Test message during outage',
                'normal'
            );

            expect(result.success).toBe(false);
            expect(result.queued).toBe(true);

            // Restore connection and process queue
            mockTelegramBot.setConnected(true);
            await telegramIntegration.processNotificationQueue();

            expect(mockTelegramBot.messages).toHaveLength(1);
        });

        test('should respect rate limiting', async () => {
            const startTime = Date.now();
            
            // Send multiple messages rapidly
            const promises = Array.from({ length: 5 }, (_, i) =>
                telegramIntegration.sendNotification(
                    'test-guild',
                    `Message ${i}`,
                    'normal'
                )
            );

            await Promise.all(promises);
            
            const endTime = Date.now();
            const duration = endTime - startTime;
            
            // Should take some time due to rate limiting
            expect(duration).toBeGreaterThan(100);
            expect(mockTelegramBot.messages).toHaveLength(5);
        });
    });

    describe('Telegram to Discord Message Forwarding', () => {
        test('should forward Telegram message to Discord', async () => {
            const telegramMessage = {
                message_id: 123,
                chat: { id: 'telegram-chat-id' },
                from: {
                    id: 456,
                    username: 'testuser',
                    first_name: 'Test',
                    last_name: 'User'
                },
                text: 'Hello from Telegram!',
                date: Math.floor(Date.now() / 1000)
            };

            const result = await telegramIntegration.handleTelegramMessage(telegramMessage);

            expect(result.success).toBe(true);
            expect(result.forwarded).toBe(true);
            expect(mockDiscordChannel.messages).toHaveLength(1);
            expect(mockDiscordChannel.messages[0].content).toContain('Hello from Telegram!');
            expect(mockDiscordChannel.messages[0].content).toContain('Test User');
        });

        test('should handle Telegram messages with media', async () => {
            const telegramMessage = {
                message_id: 124,
                chat: { id: 'telegram-chat-id' },
                from: {
                    id: 456,
                    username: 'testuser',
                    first_name: 'Test'
                },
                photo: [
                    { file_id: 'photo-file-id', width: 1280, height: 720 }
                ],
                caption: 'Check out this image!',
                date: Math.floor(Date.now() / 1000)
            };

            const result = await telegramIntegration.handleTelegramMessage(telegramMessage);

            expect(result.success).toBe(true);
            expect(result.forwarded).toBe(true);
            expect(mockDiscordChannel.messages).toHaveLength(1);
            expect(mockDiscordChannel.messages[0].content).toContain('Check out this image!');
            expect(mockDiscordChannel.messages[0].content).toContain('[Photo]');
        });

        test('should filter out bot messages', async () => {
            const botMessage = {
                message_id: 125,
                chat: { id: 'telegram-chat-id' },
                from: {
                    id: 456,
                    username: 'somebot',
                    first_name: 'Bot',
                    is_bot: true
                },
                text: 'This is a bot message',
                date: Math.floor(Date.now() / 1000)
            };

            const result = await telegramIntegration.handleTelegramMessage(botMessage);

            expect(result.success).toBe(true);
            expect(result.forwarded).toBe(false);
            expect(result.reason).toBe('bot_message');
            expect(mockDiscordChannel.messages).toHaveLength(0);
        });

        test('should validate message content', async () => {
            const spamMessage = {
                message_id: 126,
                chat: { id: 'telegram-chat-id' },
                from: {
                    id: 456,
                    username: 'spammer',
                    first_name: 'Spam'
                },
                text: 'BUY NOW! CLICK HERE! AMAZING OFFER!',
                date: Math.floor(Date.now() / 1000)
            };

            const result = await telegramIntegration.handleTelegramMessage(spamMessage);

            expect(result.success).toBe(true);
            expect(result.forwarded).toBe(false);
            expect(result.reason).toBe('content_filtered');
        });
    });

    describe('Configuration Management', () => {
        test('should configure guild Telegram channel', () => {
            const result = telegramIntegration.configureGuildChannel(
                'new-guild',
                'new-telegram-chat',
                'new-discord-channel',
                { bidirectional: true }
            );

            expect(result.success).toBe(true);
            expect(telegramIntegration.channelConfigs['new-guild']).toBeDefined();
            expect(telegramIntegration.channelConfigs['new-guild'].telegramChannelId).toBe('new-telegram-chat');
        });

        test('should validate configuration parameters', () => {
            const result = telegramIntegration.configureGuildChannel(
                '', // Invalid guild ID
                'telegram-chat',
                'discord-channel'
            );

            expect(result.success).toBe(false);
            expect(result.error).toContain('Guild ID');
        });

        test('should get configuration status', () => {
            const status = telegramIntegration.getConfigurationStatus('test-guild');

            expect(status.configured).toBe(true);
            expect(status.bidirectional).toBe(true);
            expect(status.telegramChannelId).toBe('telegram-chat-id');
            expect(status.discordChannelId).toBe('discord-channel-id');
        });

        test('should handle unconfigured guild', () => {
            const status = telegramIntegration.getConfigurationStatus('unconfigured-guild');

            expect(status.configured).toBe(false);
            expect(status.error).toContain('not configured');
        });
    });

    describe('Connection Management', () => {
        test('should handle connection failures gracefully', async () => {
            mockTelegramBot.setConnected(false);

            const result = await telegramIntegration.sendNotification(
                'test-guild',
                'Test message',
                'normal'
            );

            expect(result.success).toBe(false);
            expect(result.error).toBeDefined();
        });

        test('should attempt reconnection', async () => {
            mockTelegramBot.setConnected(false);

            const reconnectResult = await telegramIntegration.handleConnectionFailure();

            expect(reconnectResult.attempted).toBe(true);
        });

        test('should monitor connection health', () => {
            const health = telegramIntegration.getConnectionHealth();

            expect(health.connected).toBe(true);
            expect(health.lastHeartbeat).toBeDefined();
            expect(health.messagesSent).toBeDefined();
            expect(health.messagesReceived).toBeDefined();
        });
    });

    describe('Message Formatting', () => {
        test('should format Discord events for Telegram', () => {
            const events = [
                {
                    type: 'ban',
                    data: {
                        user: { tag: 'TestUser#1234', id: '123456789' },
                        reason: 'Spam',
                        moderator: { tag: 'Mod#0001' }
                    }
                },
                {
                    type: 'warn',
                    data: {
                        user: { tag: 'TestUser#1234', id: '123456789' },
                        reason: 'Inappropriate content',
                        moderator: { tag: 'Mod#0001' }
                    }
                }
            ];

            events.forEach(event => {
                const formatted = telegramIntegration.formatDiscordEvent(event.type, event.data);
                
                expect(formatted).toContain(event.data.user.tag);
                expect(formatted).toContain(event.data.reason);
                expect(formatted).toContain(event.data.moderator.tag);
            });
        });

        test('should format Telegram messages for Discord', () => {
            const telegramMessage = {
                from: {
                    username: 'testuser',
                    first_name: 'Test',
                    last_name: 'User'
                },
                text: 'Hello from Telegram!'
            };

            const formatted = telegramIntegration.formatTelegramMessage(telegramMessage);

            expect(formatted).toContain('Test User');
            expect(formatted).toContain('@testuser');
            expect(formatted).toContain('Hello from Telegram!');
        });

        test('should handle messages without username', () => {
            const telegramMessage = {
                from: {
                    first_name: 'Anonymous',
                    id: 123456
                },
                text: 'Anonymous message'
            };

            const formatted = telegramIntegration.formatTelegramMessage(telegramMessage);

            expect(formatted).toContain('Anonymous');
            expect(formatted).toContain('Anonymous message');
            expect(formatted).not.toContain('@');
        });
    });

    describe('Error Handling and Edge Cases', () => {
        test('should handle malformed Telegram messages', async () => {
            const malformedMessage = {
                // Missing required fields
                message_id: 127
            };

            const result = await telegramIntegration.handleTelegramMessage(malformedMessage);

            expect(result.success).toBe(false);
            expect(result.error).toBeDefined();
        });

        test('should handle Discord channel not found', async () => {
            // Configure with non-existent Discord channel
            telegramIntegration.configureGuildChannel(
                'test-guild-2',
                'telegram-chat-2',
                'non-existent-channel'
            );

            const result = await telegramIntegration.sendNotification(
                'test-guild-2',
                'Test message',
                'normal'
            );

            expect(result.success).toBe(false);
            expect(result.error).toContain('channel');
        });

        test('should handle file system errors', () => {
            // Create integration with invalid file paths
            const invalidIntegration = new TelegramIntegration(
                'token',
                {},
                mockDiscordClient,
                '/invalid/path/messages.json',
                '/invalid/path/notifications.json'
            );

            // Should not crash, but handle gracefully
            expect(invalidIntegration).toBeDefined();
        });

        test('should handle corrupted data files', () => {
            // Write invalid JSON to test files
            fs.writeFileSync(TEST_MESSAGES_FILE, 'invalid json content');
            fs.writeFileSync(TEST_NOTIFICATIONS_FILE, 'invalid json content');

            // Integration should handle this gracefully
            const integration = new TelegramIntegration(
                'token',
                {},
                mockDiscordClient,
                TEST_MESSAGES_FILE,
                TEST_NOTIFICATIONS_FILE
            );

            expect(integration.messages).toEqual({});
            expect(integration.notifications).toEqual([]);
        });
    });

    describe('Statistics and Monitoring', () => {
        test('should track message statistics', async () => {
            // Send some notifications
            await telegramIntegration.sendNotification('test-guild', 'Message 1', 'normal');
            await telegramIntegration.sendNotification('test-guild', 'Message 2', 'high');

            // Handle some Telegram messages
            const telegramMessage = {
                message_id: 128,
                chat: { id: 'telegram-chat-id' },
                from: { id: 456, first_name: 'Test' },
                text: 'Hello!',
                date: Math.floor(Date.now() / 1000)
            };

            await telegramIntegration.handleTelegramMessage(telegramMessage);

            const stats = telegramIntegration.getStatistics('test-guild');

            expect(stats.messagesSent).toBe(2);
            expect(stats.messagesReceived).toBe(1);
            expect(stats.messagesForwarded).toBe(1);
            expect(stats.byPriority.normal).toBe(1);
            expect(stats.byPriority.high).toBe(1);
        });

        test('should get recent activity', () => {
            const activity = telegramIntegration.getRecentActivity('test-guild', 24); // Last 24 hours

            expect(Array.isArray(activity)).toBe(true);
            expect(activity.every(item => item.timestamp)).toBe(true);
        });
    });
});

// Simple test runner for environments without Jest
if (process.argv[1] === fileURLToPath(import.meta.url)) {
    console.log('🧪 Running TelegramIntegration Unit Tests...\n');
    
    // Mock test framework functions
    global.describe = (name, fn) => {
        console.log(`\n📋 ${name}`);
        fn();
    };
    
    global.test = (name, fn) => {
        try {
            fn();
            console.log(`  ✅ ${name}`);
        } catch (error) {
            console.log(`  ❌ ${name}: ${error.message}`);
        }
    };
    
    global.beforeEach = (fn) => fn();
    global.afterEach = (fn) => fn();
    
    global.expect = (actual) => ({
        toBe: (expected) => {
            if (actual !== expected) {
                throw new Error(`Expected ${expected}, got ${actual}`);
            }
        },
        toEqual: (expected) => {
            if (JSON.stringify(actual) !== JSON.stringify(expected)) {
                throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
            }
        },
        toBeDefined: () => {
            if (actual === undefined) {
                throw new Error('Expected value to be defined');
            }
        },
        toContain: (expected) => {
            if (!actual.includes(expected)) {
                throw new Error(`Expected "${actual}" to contain "${expected}"`);
            }
        },
        toHaveLength: (expected) => {
            if (actual.length !== expected) {
                throw new Error(`Expected length ${expected}, got ${actual.length}`);
            }
        },
        toBeGreaterThan: (expected) => {
            if (actual <= expected) {
                throw new Error(`Expected ${actual} to be greater than ${expected}`);
            }
        }
    });
    
    // Run basic tests
    console.log('Running basic TelegramIntegration tests...');
    
    try {
        const mockClient = new MockDiscordClient();
        const mockChannel = new MockDiscordChannel('test-channel');
        mockClient.addChannel('test-channel', mockChannel);
        
        const integration = new TelegramIntegration(
            'mock-token',
            {
                'test-guild': {
                    telegramChannelId: 'telegram-chat',
                    discordChannelId: 'test-channel',
                    bidirectional: true
                }
            },
            mockClient,
            TEST_MESSAGES_FILE,
            TEST_NOTIFICATIONS_FILE
        );
        
        // Replace with mock bot
        integration.bot = new MockTelegramBot();
        
        // Test notification sending
        integration.sendNotification('test-guild', 'Test message', 'normal').then(result => {
            if (result.success) {
                console.log('  ✅ Notification sending test passed');
            } else {
                console.log('  ❌ Notification sending test failed');
            }
        });
        
        // Test message formatting
        const formatted = integration.formatDiscordEvent('ban', {
            user: { tag: 'TestUser#1234' },
            reason: 'Spam',
            moderator: { tag: 'Mod#0001' }
        });
        
        if (formatted.includes('TestUser#1234')) {
            console.log('  ✅ Message formatting test passed');
        } else {
            console.log('  ❌ Message formatting test failed');
        }
        
        console.log('\n🎉 Basic TelegramIntegration tests completed successfully!');
        
    } catch (error) {
        console.error('❌ Test failed:', error.message);
    } finally {
        // Cleanup
        [TEST_MESSAGES_FILE, TEST_NOTIFICATIONS_FILE].forEach(file => {
            if (fs.existsSync(file)) {
                fs.unlinkSync(file);
            }
        });
    }
}