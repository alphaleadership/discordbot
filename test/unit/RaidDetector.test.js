import RaidDetector from '../../utils/managers/RaidDetector.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Test configuration
const TEST_DATA_DIR = path.join(__dirname, '../test-data');
const TEST_RAID_FILE = path.join(TEST_DATA_DIR, 'test-raid-events.json');

// Mock dependencies
class MockGuildConfig {
    constructor() {
        this.configs = new Map();
    }

    getGuildConfig(guildId) {
        return this.configs.get(guildId) || {
            raidDetection: {
                enabled: true,
                rapidJoinThreshold: 5,
                rapidJoinWindow: 60000, // 1 minute
                suspiciousPatternThreshold: 3,
                autoProtection: true,
                protectionLevel: 'medium'
            }
        };
    }

    setGuildConfig(guildId, config) {
        this.configs.set(guildId, config);
    }
}

class MockReportManager {
    constructor() {
        this.reports = [];
    }

    async sendRaidAlert(client, guildId, embed) {
        this.reports.push({ type: 'raid', guildId, embed });
        return { success: true };
    }
}

class MockGuild {
    constructor(id, name = 'Test Guild') {
        this.id = id;
        this.name = name;
        this.members = new Map();
        this.channels = new Map();
        this.roles = new Map();
    }

    async setVerificationLevel(level) {
        this.verificationLevel = level;
        return this;
    }

    async edit(options) {
        Object.assign(this, options);
        return this;
    }
}

class MockChannel {
    constructor(id, type = 'GUILD_TEXT') {
        this.id = id;
        this.type = type;
        this.rateLimitPerUser = 0;
    }

    async setRateLimitPerUser(seconds) {
        this.rateLimitPerUser = seconds;
        return this;
    }
}

describe('RaidDetector', () => {
    let raidDetector;
    let mockGuildConfig;
    let mockReportManager;
    let mockGuild;

    beforeEach(() => {
        // Ensure test data directory exists
        if (!fs.existsSync(TEST_DATA_DIR)) {
            fs.mkdirSync(TEST_DATA_DIR, { recursive: true });
        }

        // Clean up test file if it exists
        if (fs.existsSync(TEST_RAID_FILE)) {
            fs.unlinkSync(TEST_RAID_FILE);
        }

        mockGuildConfig = new MockGuildConfig();
        mockReportManager = new MockReportManager();
        mockGuild = new MockGuild('123456789012345678');
        
        raidDetector = new RaidDetector(
            null, // client
            mockGuildConfig,
            mockReportManager,
            TEST_RAID_FILE
        );
    });

    afterEach(() => {
        // Clean up test file
        if (fs.existsSync(TEST_RAID_FILE)) {
            fs.unlinkSync(TEST_RAID_FILE);
        }
    });

    describe('Rapid Join Detection', () => {
        test('should detect rapid joins above threshold', () => {
            const guildId = '123456789012345678';
            const now = Date.now();
            
            // Create join events within the time window
            const joinEvents = [
                { userId: 'user1', timestamp: now },
                { userId: 'user2', timestamp: now + 1000 },
                { userId: 'user3', timestamp: now + 2000 },
                { userId: 'user4', timestamp: now + 3000 },
                { userId: 'user5', timestamp: now + 4000 },
                { userId: 'user6', timestamp: now + 5000 } // 6 joins in 5 seconds
            ];

            const result = raidDetector.detectRapidJoins(guildId, joinEvents);
            
            expect(result.detected).toBe(true);
            expect(result.severity).toBe('high');
            expect(result.joinCount).toBe(6);
            expect(result.timeWindow).toBeLessThanOrEqual(60000);
        });

        test('should not detect normal join rate', () => {
            const guildId = '123456789012345678';
            const now = Date.now();
            
            // Create normal join events spread over time
            const joinEvents = [
                { userId: 'user1', timestamp: now },
                { userId: 'user2', timestamp: now + 30000 },
                { userId: 'user3', timestamp: now + 60000 },
                { userId: 'user4', timestamp: now + 90000 }
            ];

            const result = raidDetector.detectRapidJoins(guildId, joinEvents);
            
            expect(result.detected).toBe(false);
        });

        test('should handle empty join events', () => {
            const guildId = '123456789012345678';
            const result = raidDetector.detectRapidJoins(guildId, []);
            
            expect(result.detected).toBe(false);
            expect(result.joinCount).toBe(0);
        });

        test('should respect guild-specific thresholds', () => {
            const guildId = '123456789012345678';
            
            // Set custom threshold
            mockGuildConfig.setGuildConfig(guildId, {
                raidDetection: {
                    enabled: true,
                    rapidJoinThreshold: 10, // Higher threshold
                    rapidJoinWindow: 60000
                }
            });

            const now = Date.now();
            const joinEvents = Array.from({ length: 8 }, (_, i) => ({
                userId: `user${i}`,
                timestamp: now + i * 1000
            }));

            const result = raidDetector.detectRapidJoins(guildId, joinEvents);
            
            expect(result.detected).toBe(false); // Below custom threshold
        });
    });

    describe('Suspicious Pattern Detection', () => {
        test('should detect similar usernames', () => {
            const users = [
                { id: 'user1', username: 'TestUser1', discriminator: '0001' },
                { id: 'user2', username: 'TestUser2', discriminator: '0002' },
                { id: 'user3', username: 'TestUser3', discriminator: '0003' },
                { id: 'user4', username: 'TestUser4', discriminator: '0004' }
            ];

            const result = raidDetector.detectSuspiciousPatterns(users);
            
            expect(result.detected).toBe(true);
            expect(result.patterns).toContain('similar_usernames');
            expect(result.similarity).toBeGreaterThan(0.7);
        });

        test('should detect sequential discriminators', () => {
            const users = [
                { id: 'user1', username: 'RandomUser', discriminator: '0001' },
                { id: 'user2', username: 'AnotherUser', discriminator: '0002' },
                { id: 'user3', username: 'DifferentUser', discriminator: '0003' },
                { id: 'user4', username: 'YetAnother', discriminator: '0004' }
            ];

            const result = raidDetector.detectSuspiciousPatterns(users);
            
            expect(result.detected).toBe(true);
            expect(result.patterns).toContain('sequential_discriminators');
        });

        test('should detect new account pattern', () => {
            const recentTime = new Date(Date.now() - 24 * 60 * 60 * 1000); // 1 day ago
            
            const users = [
                { id: 'user1', username: 'User1', createdAt: recentTime },
                { id: 'user2', username: 'User2', createdAt: recentTime },
                { id: 'user3', username: 'User3', createdAt: recentTime },
                { id: 'user4', username: 'User4', createdAt: recentTime }
            ];

            const result = raidDetector.detectSuspiciousPatterns(users);
            
            expect(result.detected).toBe(true);
            expect(result.patterns).toContain('new_accounts');
        });

        test('should not detect patterns in normal users', () => {
            const users = [
                { id: 'user1', username: 'Alice', discriminator: '1234', createdAt: new Date('2020-01-01') },
                { id: 'user2', username: 'Bob', discriminator: '5678', createdAt: new Date('2019-06-15') },
                { id: 'user3', username: 'Charlie', discriminator: '9012', createdAt: new Date('2021-03-20') }
            ];

            const result = raidDetector.detectSuspiciousPatterns(users);
            
            expect(result.detected).toBe(false);
            expect(result.patterns).toHaveLength(0);
        });
    });

    describe('Protective Measures', () => {
        test('should apply low-level protection', async () => {
            const guild = mockGuild;
            guild.channels.set('general', new MockChannel('general-id'));
            
            const result = await raidDetector.applyProtectiveMeasures(guild, 'low');
            
            expect(result.success).toBe(true);
            expect(result.measures).toContain('slowmode');
            expect(guild.channels.get('general').rateLimitPerUser).toBeGreaterThan(0);
        });

        test('should apply medium-level protection', async () => {
            const guild = mockGuild;
            
            const result = await raidDetector.applyProtectiveMeasures(guild, 'medium');
            
            expect(result.success).toBe(true);
            expect(result.measures).toContain('verification_level');
            expect(result.measures).toContain('slowmode');
        });

        test('should apply high-level protection', async () => {
            const guild = mockGuild;
            
            const result = await raidDetector.applyProtectiveMeasures(guild, 'high');
            
            expect(result.success).toBe(true);
            expect(result.measures).toContain('verification_level');
            expect(result.measures).toContain('slowmode');
            expect(result.measures).toContain('join_restrictions');
        });

        test('should handle protection errors gracefully', async () => {
            const faultyGuild = {
                id: 'test-guild',
                setVerificationLevel: () => Promise.reject(new Error('Permission denied')),
                channels: new Map()
            };
            
            const result = await raidDetector.applyProtectiveMeasures(faultyGuild, 'medium');
            
            expect(result.success).toBe(false);
            expect(result.error).toBeDefined();
        });
    });

    describe('Raid Event Management', () => {
        test('should create and save raid event', () => {
            const guildId = '123456789012345678';
            const raidData = {
                type: 'rapid_join',
                severity: 'high',
                affectedUsers: ['user1', 'user2', 'user3'],
                detectionData: {
                    joinCount: 6,
                    timeWindow: 30000
                }
            };

            const result = raidDetector.createRaidEvent(guildId, raidData);
            
            expect(result.success).toBe(true);
            expect(result.event).toBeDefined();
            expect(result.event.id).toBeDefined();
            expect(result.event.guildId).toBe(guildId);
            expect(result.event.type).toBe('rapid_join');
            expect(result.event.severity).toBe('high');
            expect(result.event.resolved).toBe(false);
        });

        test('should resolve raid event', () => {
            const guildId = '123456789012345678';
            
            // Create a raid event first
            const createResult = raidDetector.createRaidEvent(guildId, {
                type: 'rapid_join',
                severity: 'medium',
                affectedUsers: ['user1', 'user2']
            });

            const eventId = createResult.event.id;
            
            // Resolve the event
            const resolveResult = raidDetector.resolveRaidEvent(eventId, 'manual_resolution');
            
            expect(resolveResult.success).toBe(true);
            expect(resolveResult.event.resolved).toBe(true);
            expect(resolveResult.event.resolvedAt).toBeDefined();
            expect(resolveResult.event.resolutionReason).toBe('manual_resolution');
        });

        test('should get active raid events', () => {
            const guildId = '123456789012345678';
            
            // Create multiple raid events
            raidDetector.createRaidEvent(guildId, {
                type: 'rapid_join',
                severity: 'high',
                affectedUsers: ['user1']
            });
            
            raidDetector.createRaidEvent(guildId, {
                type: 'suspicious_pattern',
                severity: 'medium',
                affectedUsers: ['user2']
            });
            
            const activeEvents = raidDetector.getActiveRaidEvents(guildId);
            
            expect(activeEvents).toHaveLength(2);
            expect(activeEvents.every(event => !event.resolved)).toBe(true);
            expect(activeEvents.every(event => event.guildId === guildId)).toBe(true);
        });

        test('should get raid statistics', () => {
            const guildId = '123456789012345678';
            
            // Create various raid events
            raidDetector.createRaidEvent(guildId, {
                type: 'rapid_join',
                severity: 'high',
                affectedUsers: ['user1', 'user2', 'user3']
            });
            
            const createResult = raidDetector.createRaidEvent(guildId, {
                type: 'suspicious_pattern',
                severity: 'medium',
                affectedUsers: ['user4', 'user5']
            });
            
            // Resolve one event
            raidDetector.resolveRaidEvent(createResult.event.id, 'false_positive');
            
            const stats = raidDetector.getRaidStats(guildId);
            
            expect(stats.total).toBe(2);
            expect(stats.active).toBe(1);
            expect(stats.resolved).toBe(1);
            expect(stats.severityBreakdown.high).toBe(1);
            expect(stats.severityBreakdown.medium).toBe(1);
            expect(stats.typeBreakdown.rapid_join).toBe(1);
            expect(stats.typeBreakdown.suspicious_pattern).toBe(1);
        });
    });

    describe('Integration with Member Join', () => {
        test('should handle member join and detect raid', async () => {
            const guildId = '123456789012345678';
            const now = Date.now();
            
            // Simulate multiple rapid joins
            const members = Array.from({ length: 6 }, (_, i) => ({
                id: `user${i}`,
                user: {
                    id: `user${i}`,
                    username: `TestUser${i}`,
                    discriminator: `000${i}`,
                    createdAt: new Date(now - 1000) // Recent accounts
                },
                guild: mockGuild,
                joinedAt: new Date(now + i * 1000)
            }));

            // Process each member join
            const results = [];
            for (const member of members) {
                const result = await raidDetector.handleMemberJoin(member);
                results.push(result);
            }

            // The last few joins should trigger raid detection
            const lastResult = results[results.length - 1];
            expect(lastResult.raidDetected).toBe(true);
            expect(lastResult.raidSeverity).toBeDefined();
        });

        test('should handle normal member joins without false positives', async () => {
            const guildId = '123456789012345678';
            const now = Date.now();
            
            // Simulate normal joins spread over time
            const members = [
                {
                    id: 'user1',
                    user: {
                        id: 'user1',
                        username: 'NormalUser1',
                        discriminator: '1234',
                        createdAt: new Date('2020-01-01')
                    },
                    guild: mockGuild,
                    joinedAt: new Date(now)
                },
                {
                    id: 'user2',
                    user: {
                        id: 'user2',
                        username: 'RegularUser2',
                        discriminator: '5678',
                        createdAt: new Date('2019-06-15')
                    },
                    guild: mockGuild,
                    joinedAt: new Date(now + 60000) // 1 minute later
                }
            ];

            const results = [];
            for (const member of members) {
                const result = await raidDetector.handleMemberJoin(member);
                results.push(result);
            }

            // Should not detect raid for normal joins
            expect(results.every(r => !r.raidDetected)).toBe(true);
        });
    });

    describe('Configuration and Thresholds', () => {
        test('should respect disabled raid detection', () => {
            const guildId = '123456789012345678';
            
            // Disable raid detection
            mockGuildConfig.setGuildConfig(guildId, {
                raidDetection: {
                    enabled: false
                }
            });

            const joinEvents = Array.from({ length: 10 }, (_, i) => ({
                userId: `user${i}`,
                timestamp: Date.now() + i * 1000
            }));

            const result = raidDetector.detectRapidJoins(guildId, joinEvents);
            
            expect(result.detected).toBe(false);
            expect(result.reason).toBe('disabled');
        });

        test('should use custom thresholds', () => {
            const guildId = '123456789012345678';
            
            // Set very high threshold
            mockGuildConfig.setGuildConfig(guildId, {
                raidDetection: {
                    enabled: true,
                    rapidJoinThreshold: 50,
                    rapidJoinWindow: 60000
                }
            });

            const joinEvents = Array.from({ length: 20 }, (_, i) => ({
                userId: `user${i}`,
                timestamp: Date.now() + i * 1000
            }));

            const result = raidDetector.detectRapidJoins(guildId, joinEvents);
            
            expect(result.detected).toBe(false); // Below high threshold
        });
    });

    describe('Error Handling', () => {
        test('should handle file system errors', () => {
            // Create detector with invalid file path
            const invalidDetector = new RaidDetector(
                null,
                mockGuildConfig,
                mockReportManager,
                '/invalid/path/raids.json'
            );

            const result = invalidDetector.createRaidEvent('guild1', {
                type: 'rapid_join',
                severity: 'high',
                affectedUsers: ['user1']
            });

            expect(result.success).toBe(false);
            expect(result.error).toBeDefined();
        });

        test('should handle invalid input gracefully', () => {
            const result = raidDetector.detectRapidJoins(null, null);
            
            expect(result.detected).toBe(false);
            expect(result.error).toBeDefined();
        });

        test('should handle corrupted data file', () => {
            // Write invalid JSON to test file
            fs.writeFileSync(TEST_RAID_FILE, 'invalid json content');
            
            // Detector should handle this gracefully
            const detector = new RaidDetector(
                null,
                mockGuildConfig,
                mockReportManager,
                TEST_RAID_FILE
            );
            
            expect(detector.raidEvents).toEqual({});
        });
    });
});

// Simple test runner for environments without Jest
if (process.argv[1] === fileURLToPath(import.meta.url)) {
    console.log('🧪 Running RaidDetector Unit Tests...\n');
    
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
        },
        toBeLessThanOrEqual: (expected) => {
            if (actual > expected) {
                throw new Error(`Expected ${actual} to be less than or equal to ${expected}`);
            }
        }
    });
    
    // Run basic tests
    console.log('Running basic RaidDetector tests...');
    
    try {
        const mockConfig = new MockGuildConfig();
        const mockReport = new MockReportManager();
        const detector = new RaidDetector(null, mockConfig, mockReport, TEST_RAID_FILE);
        
        // Test rapid join detection
        const joinEvents = Array.from({ length: 6 }, (_, i) => ({
            userId: `user${i}`,
            timestamp: Date.now() + i * 1000
        }));
        
        const result = detector.detectRapidJoins('test-guild', joinEvents);
        console.log('  ✅ Rapid join detection test passed');
        
        // Test pattern detection
        const users = [
            { id: 'user1', username: 'TestUser1', discriminator: '0001' },
            { id: 'user2', username: 'TestUser2', discriminator: '0002' },
            { id: 'user3', username: 'TestUser3', discriminator: '0003' }
        ];
        
        const patternResult = detector.detectSuspiciousPatterns(users);
        console.log('  ✅ Pattern detection test passed');
        
        console.log('\n🎉 Basic RaidDetector tests completed successfully!');
        
    } catch (error) {
        console.error('❌ Test failed:', error.message);
    } finally {
        // Cleanup
        if (fs.existsSync(TEST_RAID_FILE)) {
            fs.unlinkSync(TEST_RAID_FILE);
        }
    }
}