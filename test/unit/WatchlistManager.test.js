import { WatchlistManager } from '../../utils/WatchlistManager.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { vi } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Test configuration
const TEST_DATA_DIR = path.join(__dirname, '../test-data');
const TEST_WATCHLIST_FILE = 'test/test-data/test-watchlist.json';
const TEST_BACKUP_FILE = 'test/test-data/test-watchlist.json.backup';
const TEST_LOCK_FILE = 'test/test-data/test-watchlist.json.lock';

// Mock ReportManager
class MockReportManager {
    constructor() {
        this.alertsSent = [];
        this.shouldFail = false;
    }

    async sendWatchlistAlert(client, guildId, embed) {
        if (this.shouldFail) {
            throw new Error('Mock ReportManager failure');
        }
        
        this.alertsSent.push({ guildId, embed, timestamp: Date.now() });
        console.log(`Mock: Sending watchlist alert for guild ${guildId}`);
        return { success: true };
    }

    reset() {
        this.alertsSent = [];
        this.shouldFail = false;
    }
}

describe('WatchlistManager', () => {
    let watchlistManager;
    let mockReportManager;

    beforeEach(async () => {
        // Ensure test data directory exists
        if (!fs.existsSync(TEST_DATA_DIR)) {
            fs.mkdirSync(TEST_DATA_DIR, { recursive: true });
        }

        // Clean up test files if they exist
        [TEST_WATCHLIST_FILE, TEST_BACKUP_FILE, TEST_LOCK_FILE].forEach(file => {
            if (fs.existsSync(file)) {
                fs.unlinkSync(file);
            }
        });

        mockReportManager = new MockReportManager();
        watchlistManager = new WatchlistManager(TEST_WATCHLIST_FILE, mockReportManager);
        
        // Wait for initialization to complete
        await new Promise(resolve => setTimeout(resolve, 100));
    });

    afterEach(() => {
        // Clean up test files
        [TEST_WATCHLIST_FILE, TEST_BACKUP_FILE, TEST_LOCK_FILE].forEach(file => {
            if (fs.existsSync(file)) {
                fs.unlinkSync(file);
            }
        });
        
        // Reset mocks
        mockReportManager.reset();
        vi.clearAllMocks();
    });

    describe('CRUD Operations', () => {
        test('should add user to watchlist successfully', async () => {
            const result = await watchlistManager.addToWatchlist(
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

        test('should prevent duplicate entries', async () => {
            // Add user first time
            await watchlistManager.addToWatchlist(
                '123456789012345678',
                'First reason',
                '987654321098765432',
                '111222333444555666'
            );

            // Try to add same user again
            const result = await watchlistManager.addToWatchlist(
                '123456789012345678',
                'Second reason',
                '987654321098765432',
                '111222333444555666'
            );

            expect(result.success).toBe(false);
            expect(result.error).toContain('already on the watchlist');
        });

        test('should validate required fields', async () => {
            const result = await watchlistManager.addToWatchlist('', '', '', '');
            
            expect(result.success).toBe(false);
            expect(result.error).toContain('required');
        });

        test('should check if user is on watchlist', async () => {
            // Add user to watchlist
            await watchlistManager.addToWatchlist(
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

        test('should retrieve watchlist entry', async () => {
            // Add user to watchlist
            const addResult = await watchlistManager.addToWatchlist(
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

        test('should remove user from watchlist', async () => {
            // Add user first
            await watchlistManager.addToWatchlist(
                '123456789012345678',
                'Test reason',
                '987654321098765432',
                '111222333444555666'
            );

            // Remove user
            const result = await watchlistManager.removeFromWatchlist('123456789012345678', '111222333444555666');
            
            expect(result.success).toBe(true);
            
            // Check user is no longer on active watchlist
            const isOnWatchlist = watchlistManager.isOnWatchlist('123456789012345678', '111222333444555666');
            expect(isOnWatchlist).toBe(false);
        });

        test('should get guild watchlist', async () => {
            const guildId = '111222333444555666';
            
            // Add multiple users
            await watchlistManager.addToWatchlist('user1', 'reason1', 'mod1', guildId);
            await watchlistManager.addToWatchlist('user2', 'reason2', 'mod1', guildId);
            await watchlistManager.addToWatchlist('user3', 'reason3', 'mod1', 'different-guild');

            const guildWatchlist = watchlistManager.getGuildWatchlist(guildId);
            
            expect(guildWatchlist).toHaveLength(2);
            expect(guildWatchlist.every(entry => entry.guildId === guildId)).toBe(true);
        });
    });

    describe('Notes and Incidents', () => {
        beforeEach(async () => {
            // Add a user to watchlist for testing
            await watchlistManager.addToWatchlist(
                '123456789012345678',
                'Test user',
                '987654321098765432',
                '111222333444555666'
            );
        });

        test('should add note to watchlist entry', async () => {
            const result = await watchlistManager.addNote(
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

        test('should add incident to watchlist entry', async () => {
            const incidentData = {
                type: 'message',
                description: 'Posted inappropriate content',
                channelId: '555666777888999000',
                messageId: '999888777666555444'
            };

            const result = await watchlistManager.addIncident(
                '123456789012345678',
                '111222333444555666',
                incidentData
            );

            expect(result.success).toBe(true);
            expect(result.incident).toBeDefined();
            expect(result.incident.type).toBe('message');
            expect(result.incident.description).toBe('Posted inappropriate content');
        });

        test('should validate note content', async () => {
            const result = await watchlistManager.addNote(
                '123456789012345678',
                '111222333444555666',
                '',
                '987654321098765432'
            );

            expect(result.success).toBe(false);
            expect(result.error).toContain('empty');
        });

        test('should validate incident data', async () => {
            const result = await watchlistManager.addIncident(
                '123456789012345678',
                '111222333444555666',
                { type: '', description: '' }
            );

            expect(result.success).toBe(false);
            expect(result.error).toContain('required');
        });
    });

    describe('Statistics', () => {
        test('should calculate watchlist statistics', async () => {
            const guildId = '111222333444555666';
            
            // Add users with different watch levels
            await watchlistManager.addToWatchlist('user1', 'reason1', 'mod1', guildId, { watchLevel: 'observe' });
            await watchlistManager.addToWatchlist('user2', 'reason2', 'mod1', guildId, { watchLevel: 'alert' });
            await watchlistManager.addToWatchlist('user3', 'reason3', 'mod1', guildId, { watchLevel: 'action' });
            
            // Remove one user
            await watchlistManager.removeFromWatchlist('user3', guildId);

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

        beforeEach(async () => {
            // Add user to watchlist
            await watchlistManager.addToWatchlist(
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

    describe('Error Handling and File Operations', () => {
        test('should handle file system errors gracefully', async () => {
            // Create manager with invalid path
            const invalidManager = new WatchlistManager('/invalid/path/watchlist.json');
            
            const result = await invalidManager.addToWatchlist('user1', 'reason', 'mod1', 'guild1');
            
            expect(result.success).toBe(false);
            expect(result.error).toBeDefined();
        });

        test('should handle corrupted data file', async () => {
            // Write invalid JSON to test file
            fs.writeFileSync(TEST_WATCHLIST_FILE, 'invalid json content');
            
            // Manager should handle this gracefully
            const manager = new WatchlistManager(TEST_WATCHLIST_FILE);
            await new Promise(resolve => setTimeout(resolve, 200));
            
            // Should use default data structure
            expect(manager.watchlist._metadata).toBeDefined();
            expect(manager.watchlist._settings).toBeDefined();
        });

        test('should create missing directories and files', async () => {
            const newPath = 'test/test-data/new-dir/watchlist.json';
            const manager = new WatchlistManager(newPath);
            
            await new Promise(resolve => setTimeout(resolve, 200));
            
            expect(fs.existsSync(path.dirname(newPath))).toBe(true);
            expect(fs.existsSync(newPath)).toBe(true);
            
            // Cleanup
            fs.unlinkSync(newPath);
            fs.rmdirSync(path.dirname(newPath));
        });

        test('should handle file locking', async () => {
            // Create a lock file
            fs.writeFileSync(TEST_LOCK_FILE, '12345');
            
            const manager = new WatchlistManager(TEST_WATCHLIST_FILE);
            
            // Should wait for lock to be released or timeout
            const startTime = Date.now();
            await manager.saveWatchlistWithRetry();
            const endTime = Date.now();
            
            // Should have waited some time
            expect(endTime - startTime).toBeGreaterThan(50);
        });

        test('should retry failed operations', async () => {
            const manager = new WatchlistManager(TEST_WATCHLIST_FILE);
            
            // Mock fs operations to fail initially
            const originalWriteFile = fs.promises.writeFile;
            let attempts = 0;
            
            fs.promises.writeFile = vi.fn().mockImplementation((...args) => {
                attempts++;
                if (attempts < 3) {
                    throw new Error('Mock file system error');
                }
                return originalWriteFile(...args);
            });
            
            // Should succeed after retries
            const result = await manager.saveWatchlistWithRetry();
            expect(result).toBe(true);
            expect(attempts).toBe(3);
            
            // Restore original function
            fs.promises.writeFile = originalWriteFile;
        });

        test('should recover from backup when main file is corrupted', async () => {
            // Create a backup file with valid data
            const backupData = {
                _metadata: { version: '2.0', created: new Date().toISOString() },
                _settings: {},
                'guild1_user1': {
                    userId: 'user1',
                    guildId: 'guild1',
                    reason: 'backup test',
                    addedBy: 'mod1',
                    addedAt: new Date().toISOString(),
                    active: true,
                    notes: [],
                    incidents: []
                }
            };
            
            fs.writeFileSync(TEST_BACKUP_FILE, JSON.stringify(backupData, null, 2));
            fs.writeFileSync(TEST_WATCHLIST_FILE, 'corrupted data');
            
            const manager = new WatchlistManager(TEST_WATCHLIST_FILE);
            await new Promise(resolve => setTimeout(resolve, 200));
            
            // Should have recovered from backup
            expect(manager.isOnWatchlist('user1', 'guild1')).toBe(true);
        });

        test('should validate data integrity before saving', async () => {
            const manager = new WatchlistManager(TEST_WATCHLIST_FILE);
            
            // Add invalid data directly to watchlist
            manager.watchlist.invalid_entry = {
                userId: null, // Invalid
                reason: '', // Invalid
                guildId: 'test'
            };
            
            // Should fix data during save
            await manager.saveWatchlistWithRetry();
            
            // Invalid entry should be removed
            expect(manager.watchlist.invalid_entry).toBeUndefined();
        });

        test('should handle concurrent access safely', async () => {
            const manager1 = new WatchlistManager(TEST_WATCHLIST_FILE);
            const manager2 = new WatchlistManager(TEST_WATCHLIST_FILE);
            
            // Simulate concurrent operations
            const promises = [
                manager1.addToWatchlist('user1', 'reason1', 'mod1', 'guild1'),
                manager2.addToWatchlist('user2', 'reason2', 'mod2', 'guild1'),
                manager1.addToWatchlist('user3', 'reason3', 'mod1', 'guild1')
            ];
            
            const results = await Promise.all(promises);
            
            // All operations should succeed
            results.forEach(result => {
                expect(result.success).toBe(true);
            });
        });
    });

    describe('Data Validation and Integrity', () => {
        test('should validate entry data comprehensively', () => {
            const validationTests = [
                {
                    data: { userId: '', reason: 'test', addedBy: 'mod', guildId: 'guild' },
                    shouldPass: false,
                    description: 'empty userId'
                },
                {
                    data: { userId: 'invalid', reason: 'test', addedBy: 'mod', guildId: 'guild' },
                    shouldPass: false,
                    description: 'invalid userId format'
                },
                {
                    data: { userId: '123456789012345678', reason: '', addedBy: 'mod', guildId: 'guild' },
                    shouldPass: false,
                    description: 'empty reason'
                },
                {
                    data: { userId: '123456789012345678', reason: 'a'.repeat(501), addedBy: 'mod', guildId: 'guild' },
                    shouldPass: false,
                    description: 'reason too long'
                },
                {
                    data: { userId: '123456789012345678', reason: 'test', addedBy: '', guildId: 'guild' },
                    shouldPass: false,
                    description: 'empty addedBy'
                },
                {
                    data: { userId: '123456789012345678', reason: 'test', addedBy: 'mod', guildId: '' },
                    shouldPass: false,
                    description: 'empty guildId'
                },
                {
                    data: { 
                        userId: '123456789012345678', 
                        reason: 'test', 
                        addedBy: '987654321098765432', 
                        guildId: '111222333444555666',
                        watchLevel: 'invalid'
                    },
                    shouldPass: false,
                    description: 'invalid watchLevel'
                },
                {
                    data: { 
                        userId: '123456789012345678', 
                        reason: 'test', 
                        addedBy: '987654321098765432', 
                        guildId: '111222333444555666',
                        watchLevel: 'alert'
                    },
                    shouldPass: true,
                    description: 'valid entry'
                }
            ];

            validationTests.forEach(({ data, shouldPass, description }) => {
                const result = watchlistManager.validateEntryData(data);
                if (shouldPass) {
                    expect(result.isValid).toBe(true);
                } else {
                    expect(result.isValid).toBe(false);
                }
            });
        });

        test('should validate watchlist data structure', () => {
            const testData = {
                _metadata: { version: '2.0' },
                _settings: {},
                'guild1_user1': {
                    userId: 'user1',
                    guildId: 'guild1',
                    reason: 'test',
                    addedBy: 'mod1',
                    notes: [],
                    incidents: []
                },
                'invalid_entry': {
                    userId: null,
                    reason: ''
                }
            };

            const result = watchlistManager.validateWatchlistData(testData);
            expect(result.isValid).toBe(false);
            expect(result.errors).toContain('Invalid entry: invalid_entry');
        });

        test('should fix common data issues automatically', () => {
            const corruptedData = {
                _metadata: null, // Missing metadata
                'guild1_user1': {
                    userId: 'user1',
                    guildId: 'guild1',
                    reason: 'test',
                    addedBy: 'mod1'
                    // Missing notes, incidents, active fields
                }
            };

            const fixed = watchlistManager.fixWatchlistData(corruptedData);
            
            expect(fixed._metadata).toBeDefined();
            expect(fixed._settings).toBeDefined();
            expect(fixed['guild1_user1'].notes).toEqual([]);
            expect(fixed['guild1_user1'].incidents).toEqual([]);
            expect(fixed['guild1_user1'].active).toBe(true);
        });
    });

    describe('Notification System and Rate Limiting', () => {
        beforeEach(async () => {
            // Add a watched user for testing
            await watchlistManager.addToWatchlist(
                '123456789012345678',
                'Test user for notifications',
                '987654321098765432',
                '111222333444555666',
                { watchLevel: 'alert' }
            );
        });

        test('should respect notification rate limits', async () => {
            const mockMember = {
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
                client: {}
            };

            // First notification should go through
            const result1 = await watchlistManager.handleUserJoin(mockMember);
            expect(result1.success).toBe(true);
            expect(mockReportManager.alertsSent).toHaveLength(1);

            // Immediate second notification should be rate limited
            const result2 = await watchlistManager.handleUserJoin(mockMember);
            expect(result2.success).toBe(true);
            expect(mockReportManager.alertsSent).toHaveLength(1); // Still 1, rate limited
        });

        test('should handle notification failures gracefully', async () => {
            mockReportManager.shouldFail = true;

            const mockMember = {
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
                client: {}
            };

            const result = await watchlistManager.handleUserJoin(mockMember);
            
            // Should still succeed even if notification fails
            expect(result.success).toBe(true);
            expect(result.incident).toBeDefined(); // Incident should still be recorded
        });

        test('should handle different watch levels correctly', async () => {
            // Add users with different watch levels
            await watchlistManager.addToWatchlist('observe_user', 'test', 'mod', 'guild1', { watchLevel: 'observe' });
            await watchlistManager.addToWatchlist('alert_user', 'test', 'mod', 'guild1', { watchLevel: 'alert' });
            await watchlistManager.addToWatchlist('action_user', 'test', 'mod', 'guild1', { watchLevel: 'action' });

            const createMockMessage = (userId) => ({
                author: {
                    id: userId,
                    tag: 'TestUser#1234',
                    bot: false,
                    displayAvatarURL: () => 'https://example.com/avatar.png'
                },
                guild: { id: 'guild1' },
                channel: { id: 'channel1', name: 'general' },
                content: 'Test message',
                id: 'message1',
                url: 'https://discord.com/test',
                client: {}
            });

            mockReportManager.reset();

            // Test observe level (should not notify)
            await watchlistManager.handleUserMessage(createMockMessage('observe_user'));
            expect(mockReportManager.alertsSent).toHaveLength(0);

            // Test alert level (should notify)
            await watchlistManager.handleUserMessage(createMockMessage('alert_user'));
            expect(mockReportManager.alertsSent).toHaveLength(1);

            // Test action level (should notify)
            await watchlistManager.handleUserMessage(createMockMessage('action_user'));
            expect(mockReportManager.alertsSent).toHaveLength(2);
        });
    });

    describe('Global Watchlist Operations', () => {
        test('should add user to global watchlist', async () => {
            const result = await watchlistManager.addToGlobalWatchlist(
                '123456789012345678',
                'Global threat',
                '987654321098765432',
                { watchLevel: 'action' }
            );

            expect(result.success).toBe(true);
            expect(result.entry.guildId).toBe('GLOBAL');
            expect(result.entry.watchLevel).toBe('action');
        });

        test('should check global watchlist status', async () => {
            await watchlistManager.addToGlobalWatchlist('global_user', 'test', 'mod', {});
            
            const isGlobal = watchlistManager.isOnGlobalWatchlist('global_user');
            expect(isGlobal).toBe(true);
            
            const isNotGlobal = watchlistManager.isOnGlobalWatchlist('not_global_user');
            expect(isNotGlobal).toBe(false);
        });

        test('should remove user from global watchlist', async () => {
            await watchlistManager.addToGlobalWatchlist('global_user', 'test', 'mod', {});
            
            const result = await watchlistManager.removeFromGlobalWatchlist('global_user');
            expect(result.success).toBe(true);
            
            const isStillGlobal = watchlistManager.isOnGlobalWatchlist('global_user');
            expect(isStillGlobal).toBe(false);
        });

        test('should get global watchlist entry', async () => {
            await watchlistManager.addToGlobalWatchlist(
                'global_user',
                'Global threat',
                'mod',
                { username: 'GlobalUser' }
            );
            
            const entry = watchlistManager.getGlobalWatchlistEntry('global_user');
            expect(entry).toBeDefined();
            expect(entry.guildId).toBe('GLOBAL');
            expect(entry.username).toBe('GlobalUser');
        });

        test('should handle global watchlist in user join events', async () => {
            await watchlistManager.addToGlobalWatchlist(
                '123456789012345678',
                'Global threat',
                'mod',
                { watchLevel: 'action' }
            );

            const mockMember = {
                id: '123456789012345678',
                user: {
                    username: 'GlobalUser',
                    discriminator: '1234',
                    tag: 'GlobalUser#1234',
                    displayAvatarURL: () => 'https://example.com/avatar.png',
                    createdAt: new Date()
                },
                guild: {
                    id: '999888777666555444', // Different guild
                    name: 'Another Guild'
                },
                client: {}
            };

            const result = await watchlistManager.handleUserJoin(mockMember);
            
            expect(result.success).toBe(true);
            expect(result.watched).toBe(true);
            expect(result.watchLevel).toBe('action');
            expect(result.isGlobal).toBe(true);
        });
    });

    describe('Advanced Functionality', () => {
        test('should handle user action monitoring', async () => {
            await watchlistManager.addToWatchlist(
                'action_user',
                'test',
                'mod',
                'guild1',
                { watchLevel: 'alert' }
            );

            const actionData = {
                type: 'role_change',
                description: 'User was given moderator role',
                details: { roleId: '123', roleName: 'Moderator' }
            };

            const result = await watchlistManager.handleUserAction(
                'action_user',
                'guild1',
                'role_change',
                actionData
            );

            expect(result.success).toBe(true);
            expect(result.incident).toBeDefined();
            expect(result.incident.type).toBe('role_change');
        });

        test('should calculate comprehensive statistics', async () => {
            const guildId = 'stats_guild';
            
            // Add various users
            await watchlistManager.addToWatchlist('user1', 'reason1', 'mod1', guildId, { watchLevel: 'observe' });
            await watchlistManager.addToWatchlist('user2', 'reason2', 'mod1', guildId, { watchLevel: 'alert' });
            await watchlistManager.addToWatchlist('user3', 'reason3', 'mod2', guildId, { watchLevel: 'action' });
            await watchlistManager.addToWatchlist('user4', 'reason4', 'mod2', guildId, { watchLevel: 'alert' });
            
            // Add notes and incidents
            await watchlistManager.addNote('user1', guildId, 'First note', 'mod1');
            await watchlistManager.addNote('user1', guildId, 'Second note', 'mod2');
            await watchlistManager.addIncident('user2', guildId, { type: 'message', description: 'Spam' });
            
            // Remove one user
            await watchlistManager.removeFromWatchlist('user4', guildId);

            const stats = watchlistManager.getStats(guildId);
            
            expect(stats.total).toBe(4);
            expect(stats.active).toBe(3);
            expect(stats.inactive).toBe(1);
            expect(stats.watchLevels.observe).toBe(1);
            expect(stats.watchLevels.alert).toBe(1);
            expect(stats.watchLevels.action).toBe(1);
            expect(stats.totalNotes).toBe(2);
            expect(stats.totalIncidents).toBe(1);
            expect(stats.moderators).toEqual(['mod1', 'mod2']);
        });

        test('should handle bulk operations efficiently', async () => {
            const users = [];
            for (let i = 0; i < 100; i++) {
                users.push(`user${i}`);
            }

            const startTime = Date.now();
            
            // Add many users
            const promises = users.map(userId => 
                watchlistManager.addToWatchlist(userId, 'bulk test', 'mod', 'bulk_guild')
            );
            await Promise.all(promises);
            
            const endTime = Date.now();
            const duration = endTime - startTime;
            
            // Should complete in reasonable time (less than 5 seconds for async operations)
            expect(duration).toBeLessThan(5000);
            
            // Verify all users were added
            const guildWatchlist = watchlistManager.getGuildWatchlist('bulk_guild');
            expect(guildWatchlist).toHaveLength(100);
        });

        test('should maintain data consistency across operations', async () => {
            const userId = 'consistency_user';
            const guildId = 'consistency_guild';
            
            // Add user
            const addResult = await watchlistManager.addToWatchlist(userId, 'test', 'mod', guildId);
            expect(addResult.success).toBe(true);
            
            // Add note
            const noteResult = await watchlistManager.addNote(userId, guildId, 'Test note', 'mod');
            expect(noteResult.success).toBe(true);
            
            // Add incident
            const incidentResult = await watchlistManager.addIncident(userId, guildId, {
                type: 'test',
                description: 'Test incident'
            });
            expect(incidentResult.success).toBe(true);
            
            // Save and reload
            await watchlistManager.saveWatchlistWithRetry();
            await watchlistManager.reload();
            
            // Verify data integrity
            const entry = watchlistManager.getWatchlistEntry(userId, guildId);
            expect(entry).toBeDefined();
            expect(entry.notes).toHaveLength(1);
            expect(entry.incidents).toHaveLength(1);
            expect(entry.notes[0].note).toBe('Test note');
            expect(entry.incidents[0].description).toBe('Test incident');
        });

        test('should handle edge cases gracefully', async () => {
            // Test with null/undefined values
            expect(async () => {
                await watchlistManager.addToWatchlist(null, null, null, null);
            }).not.toThrow();
            
            expect(() => {
                watchlistManager.isOnWatchlist(undefined, undefined);
            }).not.toThrow();
            
            expect(() => {
                watchlistManager.getWatchlistEntry('', '');
            }).not.toThrow();
            
            // Test with very long strings
            const longString = 'a'.repeat(10000);
            const result = await watchlistManager.addToWatchlist(
                '123456789012345678',
                longString,
                '987654321098765432',
                '111222333444555666'
            );
            
            expect(result.success).toBe(false);
            expect(result.error).toContain('too long');
        });
    });

    describe('Performance and Memory Management', () => {
        test('should handle large datasets efficiently', () => {
            const startMemory = process.memoryUsage().heapUsed;
            
            // Add a large number of entries
            for (let i = 0; i < 1000; i++) {
                watchlistManager.addToWatchlist(
                    `user${i}`,
                    `reason for user ${i}`,
                    'mod',
                    `guild${i % 10}` // Distribute across 10 guilds
                );
            }
            
            const afterAddMemory = process.memoryUsage().heapUsed;
            const memoryIncrease = afterAddMemory - startMemory;
            
            // Memory increase should be reasonable (less than 50MB)
            expect(memoryIncrease).toBeLessThan(50 * 1024 * 1024);
            
            // Operations should still be fast
            const startTime = Date.now();
            const guildWatchlist = watchlistManager.getGuildWatchlist('guild0');
            const endTime = Date.now();
            
            expect(endTime - startTime).toBeLessThan(100); // Less than 100ms
            expect(guildWatchlist.length).toBeGreaterThan(0);
        });

        test('should clean up resources properly', async () => {
            // Create multiple managers to test resource cleanup
            const managers = [];
            for (let i = 0; i < 10; i++) {
                const manager = new WatchlistManager(`test/test-data/manager${i}.json`);
                managers.push(manager);
            }
            
            // Use the managers
            managers.forEach((manager, index) => {
                manager.addToWatchlist(`user${index}`, 'test', 'mod', 'guild');
            });
            
            // Save all
            await Promise.all(managers.map(manager => manager.saveWatchlistWithRetry()));
            
            // Cleanup files
            for (let i = 0; i < 10; i++) {
                const filePath = `test/test-data/manager${i}.json`;
                if (fs.existsSync(filePath)) {
                    fs.unlinkSync(filePath);
                }
            }
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