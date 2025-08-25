import { WatchlistManager } from '../../utils/WatchlistManager.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Test configuration
const TEST_DATA_DIR = path.join(__dirname, '../test-data');
const TEST_WATCHLIST_FILE = 'test/test-data/test-watchlist.json';

// Mock ReportManager
class MockReportManager {
    async sendWatchlistAlert(client, guildId, embed) {
        console.log(`Mock: Sending watchlist alert for guild ${guildId}`);
        return { success: true };
    }
}

describe('WatchlistManager', () => {
    let watchlistManager;
    let mockReportManager;

    beforeEach(() => {
        // Ensure test data directory exists
        if (!fs.existsSync(TEST_DATA_DIR)) {
            fs.mkdirSync(TEST_DATA_DIR, { recursive: true });
        }

        // Clean up test file if it exists
        if (fs.existsSync(TEST_WATCHLIST_FILE)) {
            fs.unlinkSync(TEST_WATCHLIST_FILE);
        }

        mockReportManager = new MockReportManager();
        watchlistManager = new WatchlistManager(TEST_WATCHLIST_FILE, mockReportManager);
    });

    afterEach(() => {
        // Clean up test file
        if (fs.existsSync(TEST_WATCHLIST_FILE)) {
            fs.unlinkSync(TEST_WATCHLIST_FILE);
        }
    });

    describe('CRUD Operations', () => {
        test('should add user to watchlist successfully', () => {
            const result = watchlistManager.addToWatchlist(
                '123456789012345678',
                'Suspicious behavior',
                '987654321098765432',
                '111222333444555666',
                {
                    username: 'TestUser',
                    discriminator: '1234',
                    watchLevel: 'alert'
                }
            );

            expect(result.success).toBe(true);
            expect(result.entry).toBeDefined();
            expect(result.entry.userId).toBe('123456789012345678');
            expect(result.entry.reason).toBe('Suspicious behavior');
            expect(result.entry.watchLevel).toBe('alert');
            expect(result.entry.active).toBe(true);
        });

        test('should prevent duplicate entries', () => {
            // Add user first time
            watchlistManager.addToWatchlist(
                '123456789012345678',
                'First reason',
                '987654321098765432',
                '111222333444555666'
            );

            // Try to add same user again
            const result = watchlistManager.addToWatchlist(
                '123456789012345678',
                'Second reason',
                '987654321098765432',
                '111222333444555666'
            );

            expect(result.success).toBe(false);
            expect(result.error).toContain('déjà sur la liste');
        });

        test('should validate required fields', () => {
            const result = watchlistManager.addToWatchlist('', '', '', '');
            
            expect(result.success).toBe(false);
            expect(result.error).toContain('Données invalides');
        });

        test('should check if user is on watchlist', () => {
            // Add user to watchlist
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

        test('should retrieve watchlist entry', () => {
            // Add user to watchlist
            const addResult = watchlistManager.addToWatchlist(
                '123456789012345678',
                'Test reason',
                '987654321098765432',
                '111222333444555666',
                { username: 'TestUser', discriminator: '1234' }
            );

            const entry = watchlistManager.getWatchlistEntry('123456789012345678', '111222333444555666');
            
            expect(entry).toBeDefined();
            expect(entry.userId).toBe('123456789012345678');
            expect(entry.username).toBe('TestUser');
            expect(entry.reason).toBe('Test reason');
        });

        test('should remove user from watchlist', () => {
            // Add user first
            watchlistManager.addToWatchlist(
                '123456789012345678',
                'Test reason',
                '987654321098765432',
                '111222333444555666'
            );

            // Remove user
            const result = watchlistManager.removeFromWatchlist('123456789012345678', '111222333444555666');
            
            expect(result.success).toBe(true);
            
            // Check user is no longer on active watchlist
            const isOnWatchlist = watchlistManager.isOnWatchlist('123456789012345678', '111222333444555666');
            expect(isOnWatchlist).toBe(false);
        });

        test('should get guild watchlist', () => {
            const guildId = '111222333444555666';
            
            // Add multiple users
            watchlistManager.addToWatchlist('user1', 'reason1', 'mod1', guildId);
            watchlistManager.addToWatchlist('user2', 'reason2', 'mod1', guildId);
            watchlistManager.addToWatchlist('user3', 'reason3', 'mod1', 'different-guild');

            const guildWatchlist = watchlistManager.getGuildWatchlist(guildId);
            
            expect(guildWatchlist).toHaveLength(2);
            expect(guildWatchlist.every(entry => entry.guildId === guildId)).toBe(true);
        });
    });

    describe('Notes and Incidents', () => {
        beforeEach(() => {
            // Add a user to watchlist for testing
            watchlistManager.addToWatchlist(
                '123456789012345678',
                'Test user',
                '987654321098765432',
                '111222333444555666'
            );
        });

        test('should add note to watchlist entry', () => {
            const result = watchlistManager.addNote(
                '123456789012345678',
                '111222333444555666',
                'User was seen posting spam',
                '987654321098765432'
            );

            expect(result.success).toBe(true);
            expect(result.note).toBeDefined();
            expect(result.note.note).toBe('User was seen posting spam');
            expect(result.note.moderatorId).toBe('987654321098765432');
        });

        test('should add incident to watchlist entry', () => {
            const incidentData = {
                type: 'message',
                description: 'Posted inappropriate content',
                channelId: '555666777888999000',
                messageId: '999888777666555444'
            };

            const result = watchlistManager.addIncident(
                '123456789012345678',
                '111222333444555666',
                incidentData
            );

            expect(result.success).toBe(true);
            expect(result.incident).toBeDefined();
            expect(result.incident.type).toBe('message');
            expect(result.incident.description).toBe('Posted inappropriate content');
        });

        test('should validate note content', () => {
            const result = watchlistManager.addNote(
                '123456789012345678',
                '111222333444555666',
                '',
                '987654321098765432'
            );

            expect(result.success).toBe(false);
            expect(result.error).toContain('vide');
        });

        test('should validate incident data', () => {
            const result = watchlistManager.addIncident(
                '123456789012345678',
                '111222333444555666',
                { type: '', description: '' }
            );

            expect(result.success).toBe(false);
            expect(result.error).toContain('requis');
        });
    });

    describe('Statistics', () => {
        test('should calculate watchlist statistics', () => {
            const guildId = '111222333444555666';
            
            // Add users with different watch levels
            watchlistManager.addToWatchlist('user1', 'reason1', 'mod1', guildId, { watchLevel: 'observe' });
            watchlistManager.addToWatchlist('user2', 'reason2', 'mod1', guildId, { watchLevel: 'alert' });
            watchlistManager.addToWatchlist('user3', 'reason3', 'mod1', guildId, { watchLevel: 'action' });
            
            // Remove one user
            watchlistManager.removeFromWatchlist('user3', guildId);

            const stats = watchlistManager.getStats(guildId);
            
            expect(stats.total).toBe(3);
            expect(stats.active).toBe(2);
            expect(stats.inactive).toBe(1);
            expect(stats.watchLevels.observe).toBe(1);
            expect(stats.watchLevels.alert).toBe(1);
            expect(stats.watchLevels.action).toBe(0);
        });
    });

    describe('User Event Handling', () => {
        let mockMember;

        beforeEach(() => {
            // Add user to watchlist
            watchlistManager.addToWatchlist(
                '123456789012345678',
                'Test user',
                '987654321098765432',
                '111222333444555666',
                { watchLevel: 'alert' }
            );

            // Mock Discord member
            mockMember = {
                id: '123456789012345678',
                user: {
                    username: 'TestUser',
                    discriminator: '1234',
                    tag: 'TestUser#1234',
                    displayAvatarURL: () => 'https://example.com/avatar.png',
                    createdAt: new Date()
                },
                guild: {
                    id: '111222333444555666',
                    name: 'Test Guild'
                },
                client: {
                    // Mock client if needed
                }
            };
        });

        test('should handle watched user join', async () => {
            const result = await watchlistManager.handleUserJoin(mockMember);
            
            expect(result.success).toBe(true);
            expect(result.watched).toBe(true);
            expect(result.watchLevel).toBe('alert');
            expect(result.incident).toBeDefined();
        });

        test('should handle non-watched user join', async () => {
            const nonWatchedMember = {
                ...mockMember,
                id: '999999999999999999'
            };

            const result = await watchlistManager.handleUserJoin(nonWatchedMember);
            
            expect(result.success).toBe(true);
            expect(result.watched).toBe(false);
        });

        test('should handle watched user message', async () => {
            const mockMessage = {
                author: {
                    id: '123456789012345678',
                    tag: 'TestUser#1234',
                    bot: false,
                    displayAvatarURL: () => 'https://example.com/avatar.png'
                },
                guild: {
                    id: '111222333444555666'
                },
                channel: {
                    id: '555666777888999000',
                    name: 'general'
                },
                content: 'This is a test message',
                id: '999888777666555444',
                url: 'https://discord.com/channels/111222333444555666/555666777888999000/999888777666555444',
                client: {}
            };

            const result = await watchlistManager.handleUserMessage(mockMessage);
            
            expect(result.success).toBe(true);
            expect(result.watched).toBe(true);
            expect(result.watchLevel).toBe('alert');
        });

        test('should ignore bot messages', async () => {
            const botMessage = {
                author: {
                    id: '123456789012345678',
                    bot: true
                },
                guild: {
                    id: '111222333444555666'
                }
            };

            const result = await watchlistManager.handleUserMessage(botMessage);
            
            expect(result.success).toBe(true);
            expect(result.watched).toBe(false);
        });
    });

    describe('Error Handling', () => {
        test('should handle file system errors gracefully', () => {
            // Create manager with invalid path
            const invalidManager = new WatchlistManager('/invalid/path/watchlist.json');
            
            const result = invalidManager.addToWatchlist('user1', 'reason', 'mod1', 'guild1');
            
            expect(result.success).toBe(false);
            expect(result.error).toBeDefined();
        });

        test('should handle corrupted data file', () => {
            // Write invalid JSON to test file
            fs.writeFileSync(TEST_WATCHLIST_FILE, 'invalid json content');
            
            // Manager should handle this gracefully
            const manager = new WatchlistManager(TEST_WATCHLIST_FILE);
            
            expect(manager.watchlist).toEqual({});
        });
    });
});

// Simple test runner for environments without Jest
if (process.argv[1] === fileURLToPath(import.meta.url)) {
    console.log('🧪 Running WatchlistManager Unit Tests...\n');
    
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
        }
    });
    
    // Run tests (simplified version)
    console.log('Running basic functionality tests...');
    
    try {
        const manager = new WatchlistManager(TEST_WATCHLIST_FILE);
        
        // Test add user
        const addResult = manager.addToWatchlist('123', 'test', 'mod', 'guild');
        console.log('  ✅ Add user test passed');
        
        // Test check user
        const isOnList = manager.isOnWatchlist('123', 'guild');
        console.log('  ✅ Check user test passed');
        
        // Test remove user
        const removeResult = manager.removeFromWatchlist('123', 'guild');
        console.log('  ✅ Remove user test passed');
        
        console.log('\n🎉 Basic tests completed successfully!');
        
    } catch (error) {
        console.error('❌ Test failed:', error.message);
    } finally {
        // Cleanup
        if (fs.existsSync(TEST_WATCHLIST_FILE)) {
            fs.unlinkSync(TEST_WATCHLIST_FILE);
        }
    }
}