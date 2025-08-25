import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Import the actual managers
import { WatchlistManager } from '../../utils/WatchlistManager.js';
import FunCommandsManager from '../../utils/managers/FunCommandsManager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Test configuration
const TEST_DATA_DIR = path.join(__dirname, '../test-data');
const TEST_WATCHLIST_FILE = path.join(TEST_DATA_DIR, 'test-watchlist.json');
const TEST_FUN_USAGE_FILE = path.join(TEST_DATA_DIR, 'test-fun-usage.json');

// Mock dependencies
class MockReportManager {
    async sendWatchlistAlert(client, guildId, embed) {
        return { success: true };
    }
}

class MockGuildConfig {
    getFunCommandsConfig(guildId) {
        return {
            enabled: true,
            cooldownSeconds: 5,
            enabledCommands: ['joke', '8ball', 'meme', 'trivia'],
            contentFilter: true,
            leaderboardEnabled: true,
            maxUsagePerHour: 10
        };
    }
}

describe('Basic Manager Tests', () => {
    beforeEach(() => {
        // Ensure test data directory exists
        if (!fs.existsSync(TEST_DATA_DIR)) {
            fs.mkdirSync(TEST_DATA_DIR, { recursive: true });
        }

        // Clean up test files
        [TEST_WATCHLIST_FILE, TEST_FUN_USAGE_FILE].forEach(file => {
            if (fs.existsSync(file)) {
                fs.unlinkSync(file);
            }
        });
    });

    afterEach(() => {
        // Clean up test files
        [TEST_WATCHLIST_FILE, TEST_FUN_USAGE_FILE].forEach(file => {
            if (fs.existsSync(file)) {
                fs.unlinkSync(file);
            }
        });
    });

    describe('WatchlistManager Basic Tests', () => {
        test('should create WatchlistManager instance', () => {
            const mockReportManager = new MockReportManager();
            const watchlistManager = new WatchlistManager(TEST_WATCHLIST_FILE, mockReportManager);
            
            expect(watchlistManager).toBeDefined();
            expect(watchlistManager.watchlist).toBeDefined();
        });

        test('should add user to watchlist', () => {
            const mockReportManager = new MockReportManager();
            const watchlistManager = new WatchlistManager(TEST_WATCHLIST_FILE, mockReportManager);
            
            const result = watchlistManager.addToWatchlist(
                '123456789012345678',
                'Test reason',
                '987654321098765432',
                '111222333444555666'
            );
            
            expect(result.success).toBe(true);
            expect(result.entry).toBeDefined();
            expect(result.entry.userId).toBe('123456789012345678');
        });

        test('should check if user is on watchlist', () => {
            const mockReportManager = new MockReportManager();
            const watchlistManager = new WatchlistManager(TEST_WATCHLIST_FILE, mockReportManager);
            
            // Add user first
            watchlistManager.addToWatchlist(
                '123456789012345678',
                'Test reason',
                '987654321098765432',
                '111222333444555666'
            );
            
            const isOnWatchlist = watchlistManager.isOnWatchlist('123456789012345678', '111222333444555666');
            expect(isOnWatchlist).toBe(true);
            
            const isNotOnWatchlist = watchlistManager.isOnWatchlist('999999999999999999', '111222333444555666');
            expect(isNotOnWatchlist).toBe(false);
        });

        test('should prevent duplicate entries', () => {
            const mockReportManager = new MockReportManager();
            const watchlistManager = new WatchlistManager(TEST_WATCHLIST_FILE, mockReportManager);
            
            // Add user first time
            const result1 = watchlistManager.addToWatchlist(
                '123456789012345678',
                'First reason',
                '987654321098765432',
                '111222333444555666'
            );
            expect(result1.success).toBe(true);
            
            // Try to add same user again
            const result2 = watchlistManager.addToWatchlist(
                '123456789012345678',
                'Second reason',
                '987654321098765432',
                '111222333444555666'
            );
            expect(result2.success).toBe(false);
            expect(result2.error).toContain('déjà');
        });

        test('should validate required fields', () => {
            const mockReportManager = new MockReportManager();
            const watchlistManager = new WatchlistManager(TEST_WATCHLIST_FILE, mockReportManager);
            
            const result = watchlistManager.addToWatchlist('', '', '', '');
            expect(result.success).toBe(false);
            expect(result.error).toContain('invalides');
        });
    });

    describe('FunCommandsManager Basic Tests', () => {
        test('should create FunCommandsManager instance', () => {
            const mockGuildConfig = new MockGuildConfig();
            const funManager = new FunCommandsManager(mockGuildConfig, TEST_FUN_USAGE_FILE);
            
            expect(funManager).toBeDefined();
            expect(funManager.usageData).toBeDefined();
        });

        test('should have joke content', () => {
            const mockGuildConfig = new MockGuildConfig();
            const funManager = new FunCommandsManager(mockGuildConfig, TEST_FUN_USAGE_FILE);
            
            expect(funManager.jokes).toBeDefined();
            expect(Array.isArray(funManager.jokes)).toBe(true);
            expect(funManager.jokes.length).toBeGreaterThan(0);
        });

        test('should have 8ball responses', () => {
            const mockGuildConfig = new MockGuildConfig();
            const funManager = new FunCommandsManager(mockGuildConfig, TEST_FUN_USAGE_FILE);
            
            expect(funManager.eightBallResponses).toBeDefined();
            expect(Array.isArray(funManager.eightBallResponses)).toBe(true);
            expect(funManager.eightBallResponses.length).toBeGreaterThan(0);
        });

        test('should check cooldown functionality', () => {
            const mockGuildConfig = new MockGuildConfig();
            const funManager = new FunCommandsManager(mockGuildConfig, TEST_FUN_USAGE_FILE);
            
            const userId = 'test-user';
            const guildId = 'test-guild';
            const commandName = 'joke';
            
            // First check should allow command
            const result1 = funManager.checkCooldown(userId, guildId, commandName);
            expect(result1.allowed).toBe(true);
            
            // Set cooldown
            funManager.setCooldown(userId, guildId, commandName);
            
            // Second check should block command
            const result2 = funManager.checkCooldown(userId, guildId, commandName);
            expect(result2.allowed).toBe(false);
        });

        test('should load and save usage data', () => {
            const mockGuildConfig = new MockGuildConfig();
            const funManager = new FunCommandsManager(mockGuildConfig, TEST_FUN_USAGE_FILE);
            
            // Add some usage data
            funManager.recordUsage('test-user', 'test-guild', 'joke');
            
            // Save data
            funManager.saveUsageData();
            
            // Check file exists
            expect(fs.existsSync(TEST_FUN_USAGE_FILE)).toBe(true);
            
            // Create new instance and check data is loaded
            const funManager2 = new FunCommandsManager(mockGuildConfig, TEST_FUN_USAGE_FILE);
            expect(funManager2.usageData['test-guild']).toBeDefined();
        });
    });

    describe('Error Handling Tests', () => {
        test('WatchlistManager should handle invalid file paths gracefully', () => {
            const mockReportManager = new MockReportManager();
            const watchlistManager = new WatchlistManager('/invalid/path/watchlist.json', mockReportManager);
            
            // Should not crash and should have empty watchlist
            expect(watchlistManager.watchlist).toEqual({});
        });

        test('FunCommandsManager should handle invalid file paths gracefully', () => {
            const mockGuildConfig = new MockGuildConfig();
            const funManager = new FunCommandsManager(mockGuildConfig, '/invalid/path/usage.json');
            
            // Should not crash and should have empty usage data
            expect(funManager.usageData).toEqual({});
        });

        test('WatchlistManager should handle corrupted data files', () => {
            // Write invalid JSON to test file
            fs.writeFileSync(TEST_WATCHLIST_FILE, 'invalid json content');
            
            const mockReportManager = new MockReportManager();
            const watchlistManager = new WatchlistManager(TEST_WATCHLIST_FILE, mockReportManager);
            
            // Should handle gracefully and have empty watchlist
            expect(watchlistManager.watchlist).toEqual({});
        });

        test('FunCommandsManager should handle corrupted data files', () => {
            // Write invalid JSON to test file
            fs.writeFileSync(TEST_FUN_USAGE_FILE, 'invalid json content');
            
            const mockGuildConfig = new MockGuildConfig();
            const funManager = new FunCommandsManager(mockGuildConfig, TEST_FUN_USAGE_FILE);
            
            // Should handle gracefully and have empty usage data
            expect(funManager.usageData).toEqual({});
        });
    });

    describe('Integration Tests', () => {
        test('should handle multiple operations on WatchlistManager', () => {
            const mockReportManager = new MockReportManager();
            const watchlistManager = new WatchlistManager(TEST_WATCHLIST_FILE, mockReportManager);
            
            // Add multiple users
            const result1 = watchlistManager.addToWatchlist('user1', 'reason1', 'mod1', 'guild1');
            const result2 = watchlistManager.addToWatchlist('user2', 'reason2', 'mod1', 'guild1');
            const result3 = watchlistManager.addToWatchlist('user3', 'reason3', 'mod1', 'guild2');
            
            expect(result1.success).toBe(true);
            expect(result2.success).toBe(true);
            expect(result3.success).toBe(true);
            
            // Check users are on watchlist
            expect(watchlistManager.isOnWatchlist('user1', 'guild1')).toBe(true);
            expect(watchlistManager.isOnWatchlist('user2', 'guild1')).toBe(true);
            expect(watchlistManager.isOnWatchlist('user3', 'guild2')).toBe(true);
            
            // Check cross-guild isolation
            expect(watchlistManager.isOnWatchlist('user1', 'guild2')).toBe(false);
            expect(watchlistManager.isOnWatchlist('user3', 'guild1')).toBe(false);
        });

        test('should handle multiple operations on FunCommandsManager', () => {
            const mockGuildConfig = new MockGuildConfig();
            const funManager = new FunCommandsManager(mockGuildConfig, TEST_FUN_USAGE_FILE);
            
            // Record multiple usages
            funManager.recordUsage('user1', 'guild1', 'joke');
            funManager.recordUsage('user1', 'guild1', '8ball');
            funManager.recordUsage('user2', 'guild1', 'joke');
            funManager.recordUsage('user1', 'guild2', 'meme');
            
            // Check usage data structure
            expect(funManager.usageData['guild1']).toBeDefined();
            expect(funManager.usageData['guild2']).toBeDefined();
            expect(funManager.usageData['guild1']['user1']).toBeDefined();
            expect(funManager.usageData['guild1']['user2']).toBeDefined();
        });
    });
});