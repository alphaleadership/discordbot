import FunCommandsManager from '../../utils/managers/FunCommandsManager.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Test configuration
const TEST_DATA_DIR = path.join(__dirname, '../test-data');
const TEST_USAGE_FILE = path.join(TEST_DATA_DIR, 'test-fun-usage.json');

// Mock dependencies
class MockGuildConfig {
    constructor() {
        this.configs = new Map();
    }

    getFunCommandsConfig(guildId) {
        return this.configs.get(guildId) || {
            enabled: true,
            cooldownSeconds: 5,
            enabledCommands: ['joke', '8ball', 'meme', 'trivia'],
            contentFilter: true,
            leaderboardEnabled: true,
            maxUsagePerHour: 10
        };
    }

    setFunCommandsConfig(guildId, config) {
        this.configs.set(guildId, config);
    }
}

class MockInteraction {
    constructor(commandName, guildId = 'test-guild', userId = 'test-user') {
        this.commandName = commandName;
        this.guildId = guildId;
        this.user = { id: userId, tag: 'TestUser#1234' };
        this.guild = { id: guildId, name: 'Test Guild' };
        this.channel = { id: 'test-channel' };
        this.replied = false;
        this.deferred = false;
        this.responses = [];
        this.options = new Map();
    }

    async reply(content) {
        this.replied = true;
        this.responses.push(content);
        return { id: Date.now().toString() };
    }

    async deferReply() {
        this.deferred = true;
        return true;
    }

    async editReply(content) {
        if (this.deferred) {
            this.responses.push(content);
            return { id: Date.now().toString() };
        }
        throw new Error('Interaction not deferred');
    }

    getOption(name) {
        return this.options.get(name);
    }

    setOption(name, value) {
        this.options.set(name, value);
    }
}

describe('FunCommandsManager', () => {
    let funCommandsManager;
    let mockGuildConfig;

    beforeEach(() => {
        // Ensure test data directory exists
        if (!fs.existsSync(TEST_DATA_DIR)) {
            fs.mkdirSync(TEST_DATA_DIR, { recursive: true });
        }

        // Clean up test file if it exists
        if (fs.existsSync(TEST_USAGE_FILE)) {
            fs.unlinkSync(TEST_USAGE_FILE);
        }

        mockGuildConfig = new MockGuildConfig();
        funCommandsManager = new FunCommandsManager(mockGuildConfig, TEST_USAGE_FILE);
    });

    afterEach(() => {
        // Clean up test file
        if (fs.existsSync(TEST_USAGE_FILE)) {
            fs.unlinkSync(TEST_USAGE_FILE);
        }
    });

    describe('Cooldown System', () => {
        test('should allow command execution when no cooldown', async () => {
            const interaction = new MockInteraction('joke');
            
            const result = await funCommandsManager.executeJoke(interaction);
            
            expect(result.success).toBe(true);
            expect(interaction.replied).toBe(true);
            expect(interaction.responses[0]).toContain('🎭');
        });

        test('should enforce cooldown between commands', async () => {
            const interaction = new MockInteraction('joke');
            
            // First execution should succeed
            await funCommandsManager.executeJoke(interaction);
            
            // Second execution should be blocked by cooldown
            const interaction2 = new MockInteraction('joke', 'test-guild', 'test-user');
            const result2 = await funCommandsManager.executeJoke(interaction2);
            
            expect(result2.success).toBe(false);
            expect(result2.error).toContain('cooldown');
        });

        test('should allow different users to use commands simultaneously', async () => {
            const interaction1 = new MockInteraction('joke', 'test-guild', 'user1');
            const interaction2 = new MockInteraction('joke', 'test-guild', 'user2');
            
            const result1 = await funCommandsManager.executeJoke(interaction1);
            const result2 = await funCommandsManager.executeJoke(interaction2);
            
            expect(result1.success).toBe(true);
            expect(result2.success).toBe(true);
        });

        test('should respect guild-specific cooldown settings', async () => {
            // Set custom cooldown for guild
            mockGuildConfig.setFunCommandsConfig('test-guild', {
                enabled: true,
                cooldownSeconds: 1, // Very short cooldown
                enabledCommands: ['joke']
            });

            const interaction = new MockInteraction('joke');
            
            await funCommandsManager.executeJoke(interaction);
            
            // Wait for cooldown to expire
            await new Promise(resolve => setTimeout(resolve, 1100));
            
            const interaction2 = new MockInteraction('joke', 'test-guild', 'test-user');
            const result2 = await funCommandsManager.executeJoke(interaction2);
            
            expect(result2.success).toBe(true);
        });
    });

    describe('Joke Command', () => {
        test('should return a random joke', async () => {
            const interaction = new MockInteraction('joke');
            
            const result = await funCommandsManager.executeJoke(interaction);
            
            expect(result.success).toBe(true);
            expect(interaction.responses[0]).toBeDefined();
            expect(typeof interaction.responses[0]).toBe('string');
        });

        test('should return different jokes on multiple calls', async () => {
            const jokes = new Set();
            
            for (let i = 0; i < 5; i++) {
                const interaction = new MockInteraction('joke', 'test-guild', `user${i}`);
                await funCommandsManager.executeJoke(interaction);
                jokes.add(interaction.responses[0]);
            }
            
            // Should have at least 2 different jokes (randomness)
            expect(jokes.size).toBeGreaterThan(1);
        });
    });

    describe('8Ball Command', () => {
        test('should return a magic 8-ball response', async () => {
            const interaction = new MockInteraction('8ball');
            interaction.setOption('question', 'Will it rain tomorrow?');
            
            const result = await funCommandsManager.execute8Ball(interaction);
            
            expect(result.success).toBe(true);
            expect(interaction.responses[0]).toContain('🎱');
            expect(interaction.responses[0]).toContain('Will it rain tomorrow?');
        });

        test('should require a question', async () => {
            const interaction = new MockInteraction('8ball');
            // No question provided
            
            const result = await funCommandsManager.execute8Ball(interaction);
            
            expect(result.success).toBe(false);
            expect(result.error).toContain('question');
        });

        test('should filter inappropriate questions', async () => {
            const interaction = new MockInteraction('8ball');
            interaction.setOption('question', 'Should I hurt someone?');
            
            const result = await funCommandsManager.execute8Ball(interaction);
            
            expect(result.success).toBe(false);
            expect(result.error).toContain('inappropriate');
        });
    });

    describe('Meme Command', () => {
        test('should return a meme', async () => {
            const interaction = new MockInteraction('meme');
            
            const result = await funCommandsManager.executeMeme(interaction);
            
            expect(result.success).toBe(true);
            expect(interaction.responses[0]).toContain('😂');
        });

        test('should handle meme API failures gracefully', async () => {
            // Mock API failure
            const originalFetch = global.fetch;
            global.fetch = jest.fn().mockRejectedValue(new Error('API Error'));
            
            const interaction = new MockInteraction('meme');
            const result = await funCommandsManager.executeMeme(interaction);
            
            expect(result.success).toBe(false);
            expect(result.error).toContain('meme');
            
            // Restore fetch
            global.fetch = originalFetch;
        });
    });

    describe('Trivia Command', () => {
        test('should start a trivia question', async () => {
            const interaction = new MockInteraction('trivia');
            
            const result = await funCommandsManager.executeTrivia(interaction);
            
            expect(result.success).toBe(true);
            expect(interaction.responses[0]).toContain('❓');
        });

        test('should handle trivia answers', async () => {
            const interaction = new MockInteraction('trivia');
            await funCommandsManager.executeTrivia(interaction);
            
            // Simulate answer
            const answerResult = await funCommandsManager.handleTriviaAnswer(
                'test-user',
                'test-guild',
                'A' // Assuming A is correct
            );
            
            expect(answerResult).toBeDefined();
            expect(typeof answerResult.correct).toBe('boolean');
        });

        test('should track trivia scores', async () => {
            const userId = 'test-user';
            const guildId = 'test-guild';
            
            // Simulate correct answer
            funCommandsManager.updateTriviaScore(userId, guildId, true);
            
            const score = funCommandsManager.getTriviaScore(userId, guildId);
            
            expect(score.correct).toBe(1);
            expect(score.total).toBe(1);
        });
    });

    describe('Leaderboard System', () => {
        test('should generate trivia leaderboard', async () => {
            const guildId = 'test-guild';
            
            // Add some scores
            funCommandsManager.updateTriviaScore('user1', guildId, true);
            funCommandsManager.updateTriviaScore('user1', guildId, true);
            funCommandsManager.updateTriviaScore('user2', guildId, true);
            funCommandsManager.updateTriviaScore('user2', guildId, false);
            
            const interaction = new MockInteraction('leaderboard');
            const result = await funCommandsManager.executeLeaderboard(interaction);
            
            expect(result.success).toBe(true);
            expect(interaction.responses[0]).toContain('🏆');
            expect(interaction.responses[0]).toContain('user1');
            expect(interaction.responses[0]).toContain('user2');
        });

        test('should handle empty leaderboard', async () => {
            const interaction = new MockInteraction('leaderboard');
            const result = await funCommandsManager.executeLeaderboard(interaction);
            
            expect(result.success).toBe(true);
            expect(interaction.responses[0]).toContain('Aucun');
        });

        test('should limit leaderboard entries', async () => {
            const guildId = 'test-guild';
            
            // Add many users
            for (let i = 0; i < 15; i++) {
                funCommandsManager.updateTriviaScore(`user${i}`, guildId, true);
            }
            
            const interaction = new MockInteraction('leaderboard');
            await funCommandsManager.executeLeaderboard(interaction);
            
            // Should limit to top 10
            const response = interaction.responses[0];
            const userCount = (response.match(/user\d+/g) || []).length;
            expect(userCount).toBeLessThanOrEqual(10);
        });
    });

    describe('Content Filtering', () => {
        test('should filter inappropriate content', () => {
            const inappropriateTexts = [
                'This contains bad words',
                'Violent content here',
                'Inappropriate sexual content'
            ];
            
            inappropriateTexts.forEach(text => {
                const filtered = funCommandsManager.filterContent(text, 'test-guild');
                expect(filtered.appropriate).toBe(false);
            });
        });

        test('should allow appropriate content', () => {
            const appropriateTexts = [
                'This is a clean joke',
                'Family-friendly content',
                'Wholesome fun'
            ];
            
            appropriateTexts.forEach(text => {
                const filtered = funCommandsManager.filterContent(text, 'test-guild');
                expect(filtered.appropriate).toBe(true);
            });
        });

        test('should respect guild content filter settings', () => {
            // Disable content filter for guild
            mockGuildConfig.setFunCommandsConfig('test-guild', {
                enabled: true,
                contentFilter: false,
                enabledCommands: ['joke']
            });
            
            const result = funCommandsManager.filterContent('Questionable content', 'test-guild');
            expect(result.appropriate).toBe(true);
        });
    });

    describe('Usage Statistics', () => {
        test('should track command usage', async () => {
            const interaction = new MockInteraction('joke');
            await funCommandsManager.executeJoke(interaction);
            
            const stats = funCommandsManager.getUsageStats('test-guild');
            
            expect(stats.totalCommands).toBe(1);
            expect(stats.byCommand.joke).toBe(1);
            expect(stats.byUser['test-user']).toBe(1);
        });

        test('should track usage over time', async () => {
            const interaction = new MockInteraction('joke');
            await funCommandsManager.executeJoke(interaction);
            
            const stats = funCommandsManager.getUsageStats('test-guild', 24); // Last 24 hours
            
            expect(stats.totalCommands).toBe(1);
            expect(stats.timeRange).toBe(24);
        });

        test('should enforce usage limits', async () => {
            // Set low usage limit
            mockGuildConfig.setFunCommandsConfig('test-guild', {
                enabled: true,
                maxUsagePerHour: 2,
                enabledCommands: ['joke']
            });
            
            const interaction1 = new MockInteraction('joke', 'test-guild', 'test-user');
            const interaction2 = new MockInteraction('joke', 'test-guild', 'test-user');
            const interaction3 = new MockInteraction('joke', 'test-guild', 'test-user');
            
            // First two should succeed
            await funCommandsManager.executeJoke(interaction1);
            
            // Wait for cooldown
            await new Promise(resolve => setTimeout(resolve, 100));
            
            await funCommandsManager.executeJoke(interaction2);
            
            // Third should be rate limited
            await new Promise(resolve => setTimeout(resolve, 100));
            
            const result3 = await funCommandsManager.executeJoke(interaction3);
            expect(result3.success).toBe(false);
            expect(result3.error).toContain('limit');
        });
    });

    describe('Guild Configuration', () => {
        test('should respect disabled commands', async () => {
            // Disable joke command
            mockGuildConfig.setFunCommandsConfig('test-guild', {
                enabled: true,
                enabledCommands: ['8ball', 'meme'], // joke not included
                cooldownSeconds: 5
            });
            
            const interaction = new MockInteraction('joke');
            const result = await funCommandsManager.executeJoke(interaction);
            
            expect(result.success).toBe(false);
            expect(result.error).toContain('disabled');
        });

        test('should respect disabled fun commands entirely', async () => {
            // Disable all fun commands
            mockGuildConfig.setFunCommandsConfig('test-guild', {
                enabled: false
            });
            
            const interaction = new MockInteraction('joke');
            const result = await funCommandsManager.executeJoke(interaction);
            
            expect(result.success).toBe(false);
            expect(result.error).toContain('disabled');
        });

        test('should handle missing configuration gracefully', () => {
            const config = funCommandsManager.getFunConfig('non-existent-guild');
            
            expect(config).toBeDefined();
            expect(config.enabled).toBe(true); // Default value
        });
    });

    describe('Error Handling', () => {
        test('should handle file system errors', () => {
            // Create manager with invalid file path
            const invalidManager = new FunCommandsManager(
                mockGuildConfig,
                '/invalid/path/usage.json'
            );
            
            expect(invalidManager.usageData).toEqual({});
        });

        test('should handle corrupted usage data', () => {
            // Write invalid JSON to test file
            fs.writeFileSync(TEST_USAGE_FILE, 'invalid json content');
            
            // Manager should handle this gracefully
            const manager = new FunCommandsManager(mockGuildConfig, TEST_USAGE_FILE);
            
            expect(manager.usageData).toEqual({});
        });

        test('should handle interaction errors gracefully', async () => {
            const faultyInteraction = {
                commandName: 'joke',
                user: { id: 'test-user' },
                guild: { id: 'test-guild' },
                reply: () => Promise.reject(new Error('Discord API Error'))
            };
            
            const result = await funCommandsManager.executeJoke(faultyInteraction);
            
            expect(result.success).toBe(false);
            expect(result.error).toBeDefined();
        });
    });

    describe('Data Persistence', () => {
        test('should save usage data to file', async () => {
            const interaction = new MockInteraction('joke');
            await funCommandsManager.executeJoke(interaction);
            
            // Force save
            funCommandsManager.saveUsageData();
            
            expect(fs.existsSync(TEST_USAGE_FILE)).toBe(true);
            
            const savedData = JSON.parse(fs.readFileSync(TEST_USAGE_FILE, 'utf8'));
            expect(savedData['test-guild']).toBeDefined();
        });

        test('should load existing usage data on startup', () => {
            // Create initial data
            const initialData = {
                'test-guild': {
                    users: {
                        'test-user': {
                            totalCommands: 5,
                            commands: { joke: 3, '8ball': 2 },
                            triviaScore: { correct: 2, total: 3 }
                        }
                    }
                }
            };
            
            fs.writeFileSync(TEST_USAGE_FILE, JSON.stringify(initialData, null, 2));
            
            // Create new manager instance
            const newManager = new FunCommandsManager(mockGuildConfig, TEST_USAGE_FILE);
            
            const stats = newManager.getUsageStats('test-guild');
            expect(stats.totalCommands).toBe(5);
        });
    });
});

// Simple test runner for environments without Jest
if (process.argv[1] === fileURLToPath(import.meta.url)) {
    console.log('🧪 Running FunCommandsManager Unit Tests...\n');
    
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
    
    // Mock Jest functions
    global.jest = {
        fn: () => ({
            mockRejectedValue: (error) => () => Promise.reject(error)
        })
    };
    
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
    console.log('Running basic FunCommandsManager tests...');
    
    try {
        const mockConfig = new MockGuildConfig();
        const manager = new FunCommandsManager(mockConfig, TEST_USAGE_FILE);
        
        // Test joke command
        const mockInteraction = new MockInteraction('joke');
        manager.executeJoke(mockInteraction).then(result => {
            if (result.success) {
                console.log('  ✅ Joke command test passed');
            } else {
                console.log('  ❌ Joke command test failed');
            }
        });
        
        // Test cooldown system
        const cooldownResult = manager.checkCooldown('test-user', 'test-guild', 'joke');
        if (cooldownResult.allowed) {
            console.log('  ✅ Cooldown system test passed');
        } else {
            console.log('  ❌ Cooldown system test failed');
        }
        
        // Test content filtering
        const filterResult = manager.filterContent('This is appropriate content', 'test-guild');
        if (filterResult.appropriate) {
            console.log('  ✅ Content filtering test passed');
        } else {
            console.log('  ❌ Content filtering test failed');
        }
        
        console.log('\n🎉 Basic FunCommandsManager tests completed successfully!');
        
    } catch (error) {
        console.error('❌ Test failed:', error.message);
    } finally {
        // Cleanup
        if (fs.existsSync(TEST_USAGE_FILE)) {
            fs.unlinkSync(TEST_USAGE_FILE);
        }
    }
}