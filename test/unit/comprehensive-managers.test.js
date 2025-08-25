import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Import managers
import { WatchlistManager } from '../../utils/WatchlistManager.js';
import { RaidDetector } from '../../utils/managers/RaidDetector.js';
import DoxDetector from '../../utils/managers/DoxDetector.js';
import FunCommandsManager from '../../utils/managers/FunCommandsManager.js';
import { TelegramIntegration } from '../../utils/TelegramIntegration.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Test configuration
const TEST_DATA_DIR = path.join(__dirname, '../test-data');

// Mock dependencies
class MockReportManager {
    constructor() {
        this.reports = [];
    }

    async sendWatchlistAlert(client, guildId, embed) {
        this.reports.push({ type: 'watchlist', guildId, embed });
        return { success: true };
    }

    async sendRaidAlert(client, guildId, embed) {
        this.reports.push({ type: 'raid', guildId, embed });
        return { success: true };
    }

    async sendDoxAlert(client, guildId, embed) {
        this.reports.push({ type: 'dox', guildId, embed });
        return { success: true };
    }
}

class MockWarnManager {
    constructor() {
        this.warnings = [];
    }

    async addWarning(userId, guildId, reason, moderatorId) {
        const warning = {
            id: Date.now().toString(),
            userId,
            guildId,
            reason,
            moderatorId,
            timestamp: new Date().toISOString()
        };
        this.warnings.push(warning);
        return { success: true, warning };
    }

    getWarnings(userId, guildId) {
        return this.warnings.filter(w => w.userId === userId && w.guildId === guildId);
    }

    getWarnCount(userId) {
        return this.warnings.filter(w => w.userId === userId).length;
    }
}

class MockGuildConfig {
    constructor() {
        this.configs = new Map();
    }

    getRaidDetectionConfig(guildId) {
        return this.configs.get(`raid_${guildId}`) || {
            enabled: true,
            rapidJoinThreshold: 5,
            rapidJoinWindow: 60000,
            suspiciousPatternThreshold: 3,
            autoProtection: true,
            protectionLevel: 'medium'
        };
    }

    getFunCommandsConfig(guildId) {
        return this.configs.get(`fun_${guildId}`) || {
            enabled: true,
            cooldownSeconds: 5,
            enabledCommands: ['joke', '8ball', 'meme', 'trivia'],
            contentFilter: true,
            leaderboardEnabled: true,
            maxUsagePerHour: 10
        };
    }

    setConfig(key, config) {
        this.configs.set(key, config);
    }
}

class MockDiscordClient {
    constructor() {
        this.channels = new Map();
        this.guilds = new Map();
    }
}

// Setup test data directory
function ensureTestDataDir() {
    if (!fs.existsSync(TEST_DATA_DIR)) {
        fs.mkdirSync(TEST_DATA_DIR, { recursive: true });
    }
}

// Cleanup test files
function cleanupTestFiles(patterns) {
    patterns.forEach(pattern => {
        const files = fs.readdirSync(TEST_DATA_DIR).filter(file => file.includes(pattern));
        files.forEach(file => {
            const filePath = path.join(TEST_DATA_DIR, file);
            if (fs.existsSync(filePath)) {
                fs.unlinkSync(filePath);
            }
        });
    });
}

describe('Comprehensive Manager Tests', () => {
    let mockReportManager;
    let mockWarnManager;
    let mockGuildConfig;
    let mockDiscordClient;

    beforeEach(() => {
        ensureTestDataDir();
        mockReportManager = new MockReportManager();
        mockWarnManager = new MockWarnManager();
        mockGuildConfig = new MockGuildConfig();
        mockDiscordClient = new MockDiscordClient();
    });

    afterEach(() => {
        cleanupTestFiles(['test-watchlist', 'test-raid', 'test-dox', 'test-fun', 'test-telegram']);
    });

    describe('WatchlistManager', () => {
        let watchlistManager;
        const testWatchlistFile = path.join(TEST_DATA_DIR, 'test-watchlist.json');

        beforeEach(() => {
            watchlistManager = new WatchlistManager(testWatchlistFile, mockReportManager);
        });

        afterEach(() => {
            if (fs.existsSync(testWatchlistFile)) {
                fs.unlinkSync(testWatchlistFile);
            }
        });

        test('should add user to watchlist successfully', () => {
            const result = watchlistManager.addToWatchlist(
                'user123',
                'Suspicious behavior',
                'mod456',
                'guild789',
                { watchLevel: 'alert', username: 'TestUser', discriminator: '1234' }
            );

            expect(result.success).toBe(true);
            expect(result.entry).toBeDefined();
            expect(result.entry.userId).toBe('user123');
            expect(result.entry.reason).toBe('Suspicious behavior');
            expect(result.entry.watchLevel).toBe('alert');
        });

        test('should prevent duplicate entries', () => {
            // Add user first time
            watchlistManager.addToWatchlist('user123', 'First reason', 'mod456', 'guild789');

            // Try to add same user again
            const result = watchlistManager.addToWatchlist('user123', 'Second reason', 'mod456', 'guild789');

            expect(result.success).toBe(false);
            expect(result.error).toContain('déjà sur la liste');
        });

        test('should check if user is on watchlist', () => {
            // Add user to watchlist
            watchlistManager.addToWatchlist('user123', 'Test reason', 'mod456', 'guild789');

            const isOnWatchlist = watchlistManager.isOnWatchlist('user123', 'guild789');
            expect(isOnWatchlist).toBe(true);

            const isNotOnWatchlist = watchlistManager.isOnWatchlist('user999', 'guild789');
            expect(isNotOnWatchlist).toBe(false);
        });

        test('should remove user from watchlist', () => {
            // Add user first
            watchlistManager.addToWatchlist('user123', 'Test reason', 'mod456', 'guild789');

            // Remove user
            const result = watchlistManager.removeFromWatchlist('user123', 'guild789');
            
            expect(result.success).toBe(true);
            
            // Check user is no longer on active watchlist
            const isOnWatchlist = watchlistManager.isOnWatchlist('user123', 'guild789');
            expect(isOnWatchlist).toBe(false);
        });

        test('should add notes to watchlist entries', () => {
            // Add user first
            watchlistManager.addToWatchlist('user123', 'Test reason', 'mod456', 'guild789');

            // Add note
            const result = watchlistManager.addNote('user123', 'guild789', 'User was seen posting spam', 'mod456');

            expect(result.success).toBe(true);
            expect(result.note).toBeDefined();
            expect(result.note.note).toBe('User was seen posting spam');
        });

        test('should add incidents to watchlist entries', () => {
            // Add user first
            watchlistManager.addToWatchlist('user123', 'Test reason', 'mod456', 'guild789');

            // Add incident
            const result = watchlistManager.addIncident('user123', 'guild789', {
                type: 'message',
                description: 'Posted inappropriate content',
                channelId: 'channel123',
                messageId: 'message456'
            });

            expect(result.success).toBe(true);
            expect(result.incident).toBeDefined();
            expect(result.incident.type).toBe('message');
        });

        test('should calculate statistics', () => {
            const guildId = 'guild789';
            
            // Add users with different watch levels
            watchlistManager.addToWatchlist('user1', 'reason1', 'mod1', guildId, { watchLevel: 'observe' });
            watchlistManager.addToWatchlist('user2', 'reason2', 'mod1', guildId, { watchLevel: 'alert' });
            watchlistManager.addToWatchlist('user3', 'reason3', 'mod1', guildId, { watchLevel: 'action' });

            const stats = watchlistManager.getStats(guildId);
            
            expect(stats.total).toBe(3);
            expect(stats.active).toBe(3);
            expect(stats.watchLevels.observe).toBe(1);
            expect(stats.watchLevels.alert).toBe(1);
            expect(stats.watchLevels.action).toBe(1);
        });
    });

    describe('RaidDetector', () => {
        let raidDetector;
        const testRaidFile = path.join(TEST_DATA_DIR, 'test-raid-events.json');

        beforeEach(() => {
            raidDetector = new RaidDetector(mockDiscordClient, mockGuildConfig, mockReportManager);
        });

        test('should detect rapid joins above threshold', () => {
            const guildId = 'guild123';
            const now = Date.now();
            
            // Create join events within the time window
            const joinEvents = Array.from({ length: 6 }, (_, i) => ({
                userId: `user${i}`,
                timestamp: now + i * 1000,
                username: `TestUser${i}`,
                discriminator: `000${i}`,
                accountCreated: new Date(now - 1000),
                avatar: 'default-avatar-url'
            }));

            const result = raidDetector.detectRapidJoins(guildId, joinEvents);
            
            expect(result.detected).toBe(true);
            expect(result.severity).toBeDefined();
            expect(result.joinCount).toBe(6);
        });

        test('should not detect normal join rate', () => {
            const guildId = 'guild123';
            const now = Date.now();
            
            // Create normal join events spread over time
            const joinEvents = Array.from({ length: 3 }, (_, i) => ({
                userId: `user${i}`,
                timestamp: now + i * 30000, // 30 seconds apart
                username: `User${i}`,
                discriminator: `123${i}`,
                accountCreated: new Date('2020-01-01'),
                avatar: 'normal-avatar-url'
            }));

            const result = raidDetector.detectRapidJoins(guildId, joinEvents);
            
            expect(result.detected).toBe(false);
        });

        test('should detect suspicious patterns', () => {
            const users = [
                { id: 'user1', username: 'TestUser1', discriminator: '0001', createdAt: new Date() },
                { id: 'user2', username: 'TestUser2', discriminator: '0002', createdAt: new Date() },
                { id: 'user3', username: 'TestUser3', discriminator: '0003', createdAt: new Date() },
                { id: 'user4', username: 'TestUser4', discriminator: '0004', createdAt: new Date() }
            ];

            const result = raidDetector.detectSuspiciousPatterns(users);
            
            expect(result.detected).toBe(true);
            expect(result.patterns).toContain('similar_usernames');
        });
    });

    describe('DoxDetector', () => {
        let doxDetector;
        const testDoxFile = path.join(TEST_DATA_DIR, 'test-dox-detections.json');

        beforeEach(() => {
            doxDetector = new DoxDetector(mockWarnManager, mockReportManager, testDoxFile);
        });

        afterEach(() => {
            if (fs.existsSync(testDoxFile)) {
                fs.unlinkSync(testDoxFile);
            }
        });

        test('should detect phone numbers', () => {
            const result = doxDetector.detectPersonalInfo('Call me at 555-123-4567', 'guild123');
            
            expect(result.detected).toBe(true);
            expect(result.detections.some(d => d.type === 'phone')).toBe(true);
            expect(result.riskLevel).toBe('low');
        });

        test('should detect email addresses', () => {
            const result = doxDetector.detectPersonalInfo('Contact me at john@example.com', 'guild123');
            
            expect(result.detected).toBe(true);
            expect(result.detections.some(d => d.type === 'email')).toBe(true);
        });

        test('should detect SSN patterns', () => {
            const result = doxDetector.detectPersonalInfo('My SSN is 123-45-6789', 'guild123');
            
            expect(result.detected).toBe(true);
            expect(result.detections.some(d => d.type === 'ssn')).toBe(true);
            expect(result.riskLevel).toBe('high');
        });

        test('should calculate risk levels correctly', () => {
            const lowRisk = doxDetector.detectPersonalInfo('Email: test@example.com', 'guild123');
            expect(lowRisk.riskLevel).toBe('low');

            const highRisk = doxDetector.detectPersonalInfo('SSN: 123-45-6789, Phone: 555-123-4567', 'guild123');
            expect(highRisk.riskLevel).toBe('high');

            const criticalRisk = doxDetector.detectPersonalInfo('SSN: 123-45-6789, CC: 4532 1234 5678 9012', 'guild123');
            expect(criticalRisk.riskLevel).toBe('critical');
        });

        test('should censor detected information', () => {
            const result = doxDetector.detectPersonalInfo('Call 555-123-4567', 'guild123');
            
            expect(result.detections[0].censored).toContain('*');
            expect(result.detections[0].censored).not.toBe('555-123-4567');
        });
    });

    describe('FunCommandsManager', () => {
        let funCommandsManager;
        const testUsageFile = path.join(TEST_DATA_DIR, 'test-fun-usage.json');

        beforeEach(() => {
            funCommandsManager = new FunCommandsManager(mockGuildConfig, testUsageFile);
        });

        afterEach(() => {
            if (fs.existsSync(testUsageFile)) {
                fs.unlinkSync(testUsageFile);
            }
        });

        test('should check cooldown functionality', () => {
            const userId = 'user123';
            const guildId = 'guild456';
            const commandName = 'joke';

            // First check should allow command
            const result1 = funCommandsManager.checkCooldown(userId, guildId, commandName);
            expect(result1.onCooldown).toBe(false);

            // Set cooldown
            funCommandsManager.setCooldown(userId, guildId, commandName);

            // Second check should show cooldown
            const result2 = funCommandsManager.checkCooldown(userId, guildId, commandName);
            expect(result2.onCooldown).toBe(true);
            expect(result2.remainingTime).toBeGreaterThan(0);
        });

        test('should track usage statistics', () => {
            const userId = 'user123';
            const guildId = 'guild456';
            
            // Record some usage
            funCommandsManager.setCooldown(userId, guildId, 'joke');
            funCommandsManager.setCooldown(userId, guildId, '8ball');

            const stats = funCommandsManager.getUserStats(userId, guildId);
            
            expect(stats).toBeDefined();
            expect(stats.totalUsage).toBe(2);
            expect(stats.commands.joke.count).toBe(1);
            expect(stats.commands['8ball'].count).toBe(1);
        });

        test('should filter content appropriately', () => {
            const guildId = 'guild123';
            
            const appropriateContent = 'This is a clean joke';
            const filtered1 = funCommandsManager.filterContent(appropriateContent, guildId);
            expect(filtered1).toBe(appropriateContent);

            const inappropriateContent = 'This contains spam content';
            const filtered2 = funCommandsManager.filterContent(inappropriateContent, guildId);
            expect(filtered2).toContain('*');
        });

        test('should respect command enablement settings', () => {
            const guildId = 'guild123';
            const channelId = 'channel456';

            // Test default enabled state
            expect(funCommandsManager.areFunCommandsEnabled(guildId, channelId)).toBe(true);
            expect(funCommandsManager.isCommandEnabled(guildId, 'joke')).toBe(true);

            // Test with disabled config
            mockGuildConfig.setConfig(`fun_${guildId}`, {
                enabled: false,
                enabledCommands: []
            });

            expect(funCommandsManager.areFunCommandsEnabled(guildId, channelId)).toBe(false);
        });
    });

    describe('TelegramIntegration', () => {
        let telegramIntegration;
        const testMessagesFile = path.join(TEST_DATA_DIR, 'test-telegram-messages.json');
        const testNotificationsFile = path.join(TEST_DATA_DIR, 'test-telegram-notifications.json');

        beforeEach(() => {
            // Mock bot token for testing
            telegramIntegration = new TelegramIntegration('mock-token', mockDiscordClient);
            
            // Override file paths for testing
            telegramIntegration.configPath = path.join(TEST_DATA_DIR, 'test-telegram-config.json');
            telegramIntegration.messagesPath = testMessagesFile;
        });

        afterEach(() => {
            // Clean up test files
            [testMessagesFile, testNotificationsFile, telegramIntegration.configPath].forEach(file => {
                if (fs.existsSync(file)) {
                    fs.unlinkSync(file);
                }
            });
        });

        test('should configure guild channel', () => {
            const result = telegramIntegration.configureGuildChannel(
                'guild123',
                'telegram-channel-id',
                'discord-channel-id'
            );

            expect(result).toBe(true);

            const config = telegramIntegration.loadConfig();
            expect(config.guilds['guild123']).toBeDefined();
            expect(config.guilds['guild123'].telegramChannelId).toBe('telegram-channel-id');
            expect(config.guilds['guild123'].discordChannelId).toBe('discord-channel-id');
        });

        test('should format Discord events for Telegram', () => {
            const eventData = {
                action: 'ban',
                user: 'TestUser#1234',
                moderator: 'Mod#0001',
                reason: 'Spam',
                guild: 'Test Guild'
            };

            const formatted = telegramIntegration.formatDiscordEvent('moderation', eventData, 'high');
            
            expect(formatted).toContain('TestUser#1234');
            expect(formatted).toContain('ban');
            expect(formatted).toContain('Spam');
            expect(formatted).toContain('⚠️'); // High priority emoji
        });

        test('should handle configuration loading and saving', () => {
            // Test initial empty config
            const initialConfig = telegramIntegration.loadConfig();
            expect(initialConfig.guilds).toBeDefined();

            // Configure a guild
            telegramIntegration.configureGuildChannel('guild123', 'telegram-123');

            // Load config again and verify persistence
            const loadedConfig = telegramIntegration.loadConfig();
            expect(loadedConfig.guilds['guild123']).toBeDefined();
            expect(loadedConfig.guilds['guild123'].telegramChannelId).toBe('telegram-123');
        });

        test('should validate message content for forwarding', () => {
            const validMessage = {
                message_id: 123,
                from: { id: 456, first_name: 'Test', is_bot: false },
                text: 'Hello from Telegram!',
                date: Math.floor(Date.now() / 1000)
            };

            const botMessage = {
                message_id: 124,
                from: { id: 789, first_name: 'Bot', is_bot: true },
                text: 'Bot message',
                date: Math.floor(Date.now() / 1000)
            };

            const guildConfig = { bridgeEnabled: true };

            expect(telegramIntegration.shouldForwardMessage(validMessage, guildConfig)).toBe(true);
            expect(telegramIntegration.shouldForwardMessage(botMessage, guildConfig)).toBe(false);
        });
    });

    describe('Integration Tests', () => {
        test('should handle cross-manager interactions', async () => {
            // Setup managers
            const watchlistFile = path.join(TEST_DATA_DIR, 'integration-watchlist.json');
            const watchlistManager = new WatchlistManager(watchlistFile, mockReportManager);
            const doxDetector = new DoxDetector(mockWarnManager, mockReportManager);

            try {
                // Add user to watchlist
                const addResult = watchlistManager.addToWatchlist(
                    'user123',
                    'Suspicious behavior',
                    'mod456',
                    'guild789'
                );
                expect(addResult.success).toBe(true);

                // Simulate dox detection for watched user
                const doxResult = doxDetector.detectPersonalInfo('My phone is 555-123-4567', 'guild789');
                expect(doxResult.detected).toBe(true);

                // Verify both managers can work together
                const isWatched = watchlistManager.isOnWatchlist('user123', 'guild789');
                expect(isWatched).toBe(true);

                // Add incident based on dox detection
                const incidentResult = watchlistManager.addIncident('user123', 'guild789', {
                    type: 'dox_detection',
                    description: 'Personal information detected in message',
                    riskLevel: doxResult.riskLevel
                });
                expect(incidentResult.success).toBe(true);

            } finally {
                // Cleanup
                if (fs.existsSync(watchlistFile)) {
                    fs.unlinkSync(watchlistFile);
                }
            }
        });

        test('should handle error scenarios gracefully', () => {
            // Test with invalid file paths
            const invalidWatchlist = new WatchlistManager('/invalid/path/watchlist.json');
            const result = invalidWatchlist.addToWatchlist('user1', 'reason', 'mod1', 'guild1');
            
            expect(result.success).toBe(false);
            expect(result.error).toBeDefined();
        });

        test('should maintain data consistency across operations', () => {
            const watchlistFile = path.join(TEST_DATA_DIR, 'consistency-watchlist.json');
            const watchlistManager = new WatchlistManager(watchlistFile, mockReportManager);

            try {
                // Perform multiple operations
                watchlistManager.addToWatchlist('user1', 'reason1', 'mod1', 'guild1');
                watchlistManager.addToWatchlist('user2', 'reason2', 'mod1', 'guild1');
                watchlistManager.addToWatchlist('user3', 'reason3', 'mod1', 'guild2');

                // Verify data consistency
                const guild1List = watchlistManager.getGuildWatchlist('guild1');
                const guild2List = watchlistManager.getGuildWatchlist('guild2');

                expect(guild1List).toHaveLength(2);
                expect(guild2List).toHaveLength(1);

                // Test statistics consistency
                const stats = watchlistManager.getStats();
                expect(stats.total).toBe(3);
                expect(stats.active).toBe(3);

            } finally {
                // Cleanup
                if (fs.existsSync(watchlistFile)) {
                    fs.unlinkSync(watchlistFile);
                }
            }
        });
    });
});