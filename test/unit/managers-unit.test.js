import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Import managers
import { WatchlistManager } from '../../utils/WatchlistManager.js';
import DoxDetector from '../../utils/managers/DoxDetector.js';
import FunCommandsManager from '../../utils/managers/FunCommandsManager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

    addWarn(userId, reason, moderatorId) {
        const warning = {
            id: Date.now().toString(),
            userId,
            reason,
            moderatorId,
            timestamp: new Date().toISOString()
        };
        this.warnings.push(warning);
        return { success: true, warning, count: this.getWarnCount(userId) };
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
            cooldownMs: 5000,
            enabledCommands: ['joke', '8ball', 'meme', 'trivia'],
            contentFilter: true,
            leaderboardEnabled: true,
            maxUsagePerHour: 10,
            disabledChannels: []
        };
    }

    setConfig(key, config) {
        this.configs.set(key, config);
    }
}

describe('Manager Unit Tests', () => {
    let mockReportManager;
    let mockWarnManager;
    let mockGuildConfig;

    beforeEach(() => {
        mockReportManager = new MockReportManager();
        mockWarnManager = new MockWarnManager();
        mockGuildConfig = new MockGuildConfig();
    });

    describe('WatchlistManager Core Logic', () => {
        test('should validate entry data correctly', () => {
            // Create a temporary file for testing
            const tempFile = path.join(process.cwd(), 'test-temp-watchlist.json');
            const watchlistManager = new WatchlistManager(tempFile, mockReportManager);

            // Test validation logic directly
            const validData = {
                userId: 'user123',
                reason: 'Test reason',
                addedBy: 'mod456',
                guildId: 'guild789',
                watchLevel: 'alert'
            };

            const validation = watchlistManager.validateEntryData(validData);
            expect(validation.isValid).toBe(true);
            expect(validation.errors).toHaveLength(0);

            // Test invalid data
            const invalidData = {
                userId: '',
                reason: '',
                addedBy: '',
                guildId: '',
                watchLevel: 'invalid'
            };

            const invalidValidation = watchlistManager.validateEntryData(invalidData);
            expect(invalidValidation.isValid).toBe(false);
            expect(invalidValidation.errors.length).toBeGreaterThan(0);

            // Cleanup
            if (fs.existsSync(tempFile)) {
                fs.unlinkSync(tempFile);
            }
        });

        test('should generate correct watchlist keys', () => {
            const tempFile = path.join(process.cwd(), 'test-temp-watchlist2.json');
            const watchlistManager = new WatchlistManager(tempFile, mockReportManager);

            // Mock some watchlist data
            watchlistManager.watchlist = {
                'guild123_user456': {
                    userId: 'user456',
                    guildId: 'guild123',
                    active: true
                }
            };

            const key = watchlistManager.getWatchlistKey('user456', 'guild123');
            expect(key).toBe('guild123_user456');

            const nonExistentKey = watchlistManager.getWatchlistKey('user999', 'guild123');
            expect(nonExistentKey).toBeNull();

            // Cleanup
            if (fs.existsSync(tempFile)) {
                fs.unlinkSync(tempFile);
            }
        });

        test('should calculate statistics correctly', () => {
            const tempFile = path.join(process.cwd(), 'test-temp-watchlist3.json');
            const watchlistManager = new WatchlistManager(tempFile, mockReportManager);

            // Mock watchlist data
            watchlistManager.watchlist = {
                'guild123_user1': {
                    userId: 'user1',
                    guildId: 'guild123',
                    watchLevel: 'observe',
                    active: true,
                    incidents: [{ id: '1' }, { id: '2' }],
                    notes: [{ id: '1' }]
                },
                'guild123_user2': {
                    userId: 'user2',
                    guildId: 'guild123',
                    watchLevel: 'alert',
                    active: true,
                    incidents: [{ id: '3' }],
                    notes: []
                },
                'guild123_user3': {
                    userId: 'user3',
                    guildId: 'guild123',
                    watchLevel: 'action',
                    active: false,
                    incidents: [],
                    notes: []
                }
            };

            const stats = watchlistManager.getStats('guild123');
            
            expect(stats.total).toBe(3);
            expect(stats.active).toBe(2);
            expect(stats.inactive).toBe(1);
            expect(stats.watchLevels.observe).toBe(1);
            expect(stats.watchLevels.alert).toBe(1);
            expect(stats.watchLevels.action).toBe(0); // Inactive user not counted
            expect(stats.totalIncidents).toBe(3);
            expect(stats.totalNotes).toBe(1);

            // Cleanup
            if (fs.existsSync(tempFile)) {
                fs.unlinkSync(tempFile);
            }
        });
    });

    describe('DoxDetector Pattern Recognition', () => {
        let doxDetector;

        beforeEach(() => {
            doxDetector = new DoxDetector(mockWarnManager, mockReportManager);
        });

        test('should detect phone number patterns', () => {
            const testCases = [
                { text: 'Call me at 555-123-4567', shouldDetect: true },
                { text: 'Phone: (555) 123-4567', shouldDetect: true },
                { text: '+1 555 123 4567', shouldDetect: true },
                { text: 'Random numbers 12345', shouldDetect: false },
                { text: 'Version 1.2.3.4', shouldDetect: false }
            ];

            testCases.forEach(testCase => {
                const result = doxDetector.detectPersonalInfo(testCase.text, 'guild123');
                const phoneDetected = result.detections.some(d => d.type === 'phone');
                expect(phoneDetected).toBe(testCase.shouldDetect);
            });
        });

        test('should detect email patterns', () => {
            const testCases = [
                { text: 'Email me at john@example.com', shouldDetect: true },
                { text: 'Contact: user+tag@domain.co.uk', shouldDetect: true },
                { text: 'Not an email @domain', shouldDetect: false },
                { text: 'user@ incomplete', shouldDetect: false }
            ];

            testCases.forEach(testCase => {
                const result = doxDetector.detectPersonalInfo(testCase.text, 'guild123');
                const emailDetected = result.detections.some(d => d.type === 'email');
                expect(emailDetected).toBe(testCase.shouldDetected);
            });
        });

        test('should detect SSN patterns', () => {
            const testCases = [
                { text: 'SSN: 123-45-6789', shouldDetect: true },
                { text: 'Social: 987654321', shouldDetect: true },
                { text: 'Phone: 123-456-7890', shouldDetect: false }, // Too many digits for SSN
                { text: 'Random: 12-34-5678', shouldDetect: false } // Wrong format
            ];

            testCases.forEach(testCase => {
                const result = doxDetector.detectPersonalInfo(testCase.text, 'guild123');
                const ssnDetected = result.detections.some(d => d.type === 'ssn');
                expect(ssnDetected).toBe(testCase.shouldDetect);
            });
        });

        test('should calculate risk levels appropriately', () => {
            const testCases = [
                { text: 'Email: test@example.com', expectedRisk: 'low' },
                { text: 'Phone: 555-123-4567 Email: test@example.com', expectedRisk: 'medium' },
                { text: 'SSN: 123-45-6789', expectedRisk: 'high' },
                { text: 'SSN: 123-45-6789 CC: 4532 1234 5678 9012', expectedRisk: 'critical' },
                { text: 'Just normal text', expectedRisk: 'none' }
            ];

            testCases.forEach(testCase => {
                const result = doxDetector.detectPersonalInfo(testCase.text, 'guild123');
                expect(result.riskLevel).toBe(testCase.expectedRisk);
            });
        });

        test('should censor matches correctly', () => {
            const testCases = [
                { match: '555-123-4567', type: 'phone', shouldContainAsterisks: true },
                { match: 'john@example.com', type: 'email', shouldContainAsterisks: true },
                { match: '123-45-6789', type: 'ssn', expected: '***-**-****' },
                { match: '4532 1234 5678 9012', type: 'creditCard', shouldContainAsterisks: true }
            ];

            testCases.forEach(testCase => {
                const censored = doxDetector.censorMatch(testCase.match, testCase.type);
                
                if (testCase.expected) {
                    expect(censored).toBe(testCase.expected);
                } else if (testCase.shouldContainAsterisks) {
                    expect(censored).toContain('*');
                    expect(censored).not.toBe(testCase.match);
                }
            });
        });
    });

    describe('FunCommandsManager Logic', () => {
        let funCommandsManager;

        beforeEach(() => {
            funCommandsManager = new FunCommandsManager(mockGuildConfig);
        });

        test('should manage cooldowns correctly', () => {
            const userId = 'user123';
            const guildId = 'guild456';
            const commandName = 'joke';

            // Initial state - no cooldown
            const initialCheck = funCommandsManager.checkCooldown(userId, guildId, commandName);
            expect(initialCheck.onCooldown).toBe(false);
            expect(initialCheck.remainingTime).toBe(0);

            // Set cooldown
            funCommandsManager.setCooldown(userId, guildId, commandName);

            // Should now be on cooldown
            const afterCooldownCheck = funCommandsManager.checkCooldown(userId, guildId, commandName);
            expect(afterCooldownCheck.onCooldown).toBe(true);
            expect(afterCooldownCheck.remainingTime).toBeGreaterThan(0);
        });

        test('should check command enablement correctly', () => {
            const guildId = 'guild123';
            const channelId = 'channel456';

            // Default state - commands enabled
            expect(funCommandsManager.areFunCommandsEnabled(guildId, channelId)).toBe(true);
            expect(funCommandsManager.isCommandEnabled(guildId, 'joke')).toBe(true);

            // Test with disabled config
            mockGuildConfig.setConfig(`fun_${guildId}`, {
                enabled: false,
                enabledCommands: []
            });

            expect(funCommandsManager.areFunCommandsEnabled(guildId, channelId)).toBe(false);

            // Test with specific command disabled
            mockGuildConfig.setConfig(`fun_${guildId}`, {
                enabled: true,
                enabledCommands: ['8ball', 'meme'] // joke not included
            });

            expect(funCommandsManager.isCommandEnabled(guildId, 'joke')).toBe(false);
            expect(funCommandsManager.isCommandEnabled(guildId, '8ball')).toBe(true);
        });

        test('should filter content appropriately', () => {
            const guildId = 'guild123';
            
            // Test clean content
            const cleanContent = 'This is a clean joke';
            const filtered1 = funCommandsManager.filterContent(cleanContent, guildId);
            expect(filtered1).toBe(cleanContent);

            // Test content with filtered words
            const dirtyContent = 'This contains spam content';
            const filtered2 = funCommandsManager.filterContent(dirtyContent, guildId);
            expect(filtered2).toContain('*');
            expect(filtered2).not.toBe(dirtyContent);
        });

        test('should track user statistics', () => {
            const userId = 'user123';
            const guildId = 'guild456';
            
            // Initially no stats
            const initialStats = funCommandsManager.getUserStats(userId, guildId);
            expect(initialStats).toBeNull();

            // Record some usage
            funCommandsManager.setCooldown(userId, guildId, 'joke');
            funCommandsManager.setCooldown(userId, guildId, '8ball');

            const stats = funCommandsManager.getUserStats(userId, guildId);
            expect(stats).toBeDefined();
            expect(stats.totalUsage).toBe(2);
            expect(stats.commands.joke.count).toBe(1);
            expect(stats.commands['8ball'].count).toBe(1);
        });

        test('should handle abuse detection', () => {
            const userId = 'user123';
            const guildId = 'guild456';

            // Simulate excessive usage
            for (let i = 0; i < 25; i++) {
                funCommandsManager.setCooldown(userId, guildId, 'joke');
            }

            const abuseCheck = funCommandsManager.checkForAbuse(userId, guildId);
            expect(abuseCheck.hasAbuse).toBe(false); // Should be false for reasonable usage
            expect(Array.isArray(abuseCheck.reasons)).toBe(true);
        });

        test('should manage trivia scores', () => {
            const userId = 'user123';
            const guildId = 'guild456';
            const gameType = 'trivia';

            // Update score
            funCommandsManager.updateScore(userId, guildId, gameType, 10);
            funCommandsManager.updateScore(userId, guildId, gameType, 0); // Wrong answer
            funCommandsManager.updateScore(userId, guildId, gameType, 15);

            const gameStats = funCommandsManager.getUserGameStats(userId, guildId, gameType);
            expect(gameStats).toBeDefined();
            expect(gameStats.totalPoints).toBe(25);
            expect(gameStats.gamesPlayed).toBe(3);
            expect(gameStats.correctAnswers).toBe(2);
        });

        test('should get top players correctly', () => {
            const guildId = 'guild456';
            const gameType = 'trivia';

            // Add scores for multiple users
            funCommandsManager.updateScore('user1', guildId, gameType, 100);
            funCommandsManager.updateScore('user2', guildId, gameType, 50);
            funCommandsManager.updateScore('user3', guildId, gameType, 75);

            const topPlayers = funCommandsManager.getTopPlayersByGame(guildId, gameType, 10);
            
            expect(topPlayers).toHaveLength(3);
            expect(topPlayers[0].scores[gameType].totalPoints).toBe(100); // Highest score first
            expect(topPlayers[1].scores[gameType].totalPoints).toBe(75);
            expect(topPlayers[2].scores[gameType].totalPoints).toBe(50);
        });
    });

    describe('DoxDetector Advanced Features', () => {
        let doxDetector;

        beforeEach(() => {
            doxDetector = new DoxDetector(mockWarnManager, mockReportManager);
        });

        test('should handle exception system', () => {
            const guildId = 'guild123';
            
            // Add exception
            const exception = doxDetector.addException(
                guildId,
                'email',
                'support@company.com',
                'exact',
                'Company support email',
                'mod123'
            );

            expect(exception.id).toBeDefined();
            expect(exception.type).toBe('exact');
            expect(exception.value).toBe('support@company.com');

            // Test that exception prevents detection
            const result = doxDetector.detectPersonalInfo('Contact support@company.com', guildId);
            const emailDetected = result.detections.some(d => d.type === 'email');
            expect(emailDetected).toBe(false);

            // Test that other emails are still detected
            const result2 = doxDetector.detectPersonalInfo('My email is personal@gmail.com', guildId);
            const emailDetected2 = result2.detections.some(d => d.type === 'email');
            expect(emailDetected2).toBe(true);
        });

        test('should handle pattern-based exceptions', () => {
            const guildId = 'guild123';
            
            // Add pattern exception
            doxDetector.addException(
                guildId,
                'email',
                '@company.com',
                'pattern',
                'All company emails',
                'mod123'
            );

            // Test that pattern exception works
            const result = doxDetector.detectPersonalInfo('Contact sales@company.com or support@company.com', guildId);
            const emailDetected = result.detections.some(d => d.type === 'email');
            expect(emailDetected).toBe(false);
        });

        test('should remove exceptions correctly', () => {
            const guildId = 'guild123';
            
            // Add exception
            const exception = doxDetector.addException(guildId, 'email', 'test@example.com', 'exact');
            
            // Remove exception
            const removed = doxDetector.removeException(guildId, 'email', exception.id);
            expect(removed).toBe(true);

            // Test that detection now works
            const result = doxDetector.detectPersonalInfo('Contact test@example.com', guildId);
            const emailDetected = result.detections.some(d => d.type === 'email');
            expect(emailDetected).toBe(true);
        });

        test('should log detections properly', () => {
            const detectionData = {
                userId: 'user123',
                guildId: 'guild456',
                messageId: 'msg789',
                content: 'Phone: 555-123-4567',
                detectionType: ['phone'],
                riskLevel: 'low'
            };

            const detection = doxDetector.logDetection(detectionData);
            
            expect(detection.id).toBeDefined();
            expect(detection.timestamp).toBeDefined();
            expect(detection.userId).toBe('user123');
            expect(detection.riskLevel).toBe('low');
        });

        test('should get user detection history', () => {
            const userId = 'user123';
            const guildId = 'guild456';

            // Log some detections
            doxDetector.logDetection({
                userId,
                guildId,
                messageId: 'msg1',
                detectionType: ['phone'],
                riskLevel: 'low'
            });

            doxDetector.logDetection({
                userId,
                guildId,
                messageId: 'msg2',
                detectionType: ['email'],
                riskLevel: 'low'
            });

            const userDetections = doxDetector.getUserDetections(userId, guildId);
            expect(userDetections).toHaveLength(2);
            expect(userDetections.every(d => d.userId === userId)).toBe(true);
        });

        test('should get recent detections', () => {
            const guildId = 'guild456';

            // Log a recent detection
            doxDetector.logDetection({
                userId: 'user123',
                guildId,
                messageId: 'msg1',
                detectionType: ['phone'],
                riskLevel: 'low'
            });

            const recentDetections = doxDetector.getRecentDetections(24, guildId);
            expect(recentDetections).toHaveLength(1);
            expect(recentDetections[0].guildId).toBe(guildId);
        });
    });

    describe('Error Handling and Edge Cases', () => {
        test('should handle invalid inputs gracefully', () => {
            const doxDetector = new DoxDetector(mockWarnManager, mockReportManager);

            // Test with null/undefined inputs
            const result1 = doxDetector.detectPersonalInfo(null, 'guild123');
            expect(result1.detections).toEqual([]);
            expect(result1.riskLevel).toBe('none');

            const result2 = doxDetector.detectPersonalInfo('', 'guild123');
            expect(result2.detections).toEqual([]);
            expect(result2.riskLevel).toBe('none');

            const result3 = doxDetector.detectPersonalInfo('valid text', null);
            expect(result3.detections).toEqual([]);
        });

        test('should handle manager initialization with invalid paths', () => {
            // Test WatchlistManager with invalid path
            const invalidWatchlist = new WatchlistManager('/invalid/path/watchlist.json');
            expect(invalidWatchlist.watchlist).toEqual({});

            // Test DoxDetector with invalid path
            const invalidDoxDetector = new DoxDetector(mockWarnManager, mockReportManager, '/invalid/path/dox.json');
            expect(invalidDoxDetector.detections).toEqual([]);
        });

        test('should handle corrupted data gracefully', () => {
            // Create a temporary file with invalid JSON
            const tempFile = path.join(process.cwd(), 'test-corrupted.json');
            fs.writeFileSync(tempFile, 'invalid json content');

            try {
                const watchlistManager = new WatchlistManager(tempFile);
                expect(watchlistManager.watchlist).toEqual({});
            } finally {
                if (fs.existsSync(tempFile)) {
                    fs.unlinkSync(tempFile);
                }
            }
        });
    });

    describe('Manager Integration', () => {
        test('should work together for comprehensive moderation', () => {
            const doxDetector = new DoxDetector(mockWarnManager, mockReportManager);
            
            // Simulate a user posting personal info
            const userId = 'user123';
            const guildId = 'guild456';
            
            // Detect personal info
            const detection = doxDetector.detectPersonalInfo('My phone is 555-123-4567', guildId);
            expect(detection.detected).toBe(true);
            expect(detection.riskLevel).toBe('low');

            // Log the detection
            const loggedDetection = doxDetector.logDetection({
                userId,
                guildId,
                messageId: 'msg123',
                content: 'My phone is 555-123-4567',
                detectionType: detection.detections.map(d => d.type),
                riskLevel: detection.riskLevel
            });

            expect(loggedDetection.id).toBeDefined();

            // Check user history
            const userHistory = doxDetector.getUserDetections(userId, guildId);
            expect(userHistory).toHaveLength(1);
        });

        test('should handle multiple detection types in single message', () => {
            const doxDetector = new DoxDetector(mockWarnManager, mockReportManager);
            
            const complexMessage = 'Call me at 555-123-4567 or email john@example.com, my address is 123 Main St';
            const result = doxDetector.detectPersonalInfo(complexMessage, 'guild123');
            
            expect(result.detected).toBe(true);
            expect(result.detections.length).toBeGreaterThan(1);
            expect(result.riskLevel).toBe('medium'); // Multiple detections increase risk
            
            const detectionTypes = result.detections.map(d => d.type);
            expect(detectionTypes).toContain('phone');
            expect(detectionTypes).toContain('email');
            expect(detectionTypes).toContain('address');
        });
    });
});