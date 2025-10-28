import { WatchlistManager } from '../../utils/WatchlistManager.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { vi, describe, test, expect, beforeEach, afterEach } from 'vitest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Test configuration
const TEST_DATA_DIR = path.join(__dirname, '../test-data');
const TEST_WATCHLIST_FILE = 'test/test-data/enhanced-test-watchlist.json';
const TEST_BACKUP_FILE = 'test/test-data/enhanced-test-watchlist.json.backup';
const TEST_LOCK_FILE = 'test/test-data/enhanced-test-watchlist.json.lock';

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

describe('Enhanced WatchlistManager Tests', () => {
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

    describe('Enhanced CRUD Operations', () => {
        test('should handle all CRUD operations with proper error scenarios', async () => {
            const userId = '123456789012345678';
            const guildId = '111222333444555666';
            const moderatorId = '987654321098765432';
            
            // Test CREATE with validation
            const createResult = await watchlistManager.addToWatchlist(
                userId,
                'Test user for enhanced testing',
                moderatorId,
                guildId,
                {
                    username: 'TestUser',
                    discriminator: '1234',
                    watchLevel: 'alert'
                }
            );

            expect(createResult.success).toBe(true);
            expect(createResult.entry).toBeDefined();
            expect(createResult.entry.userId).toBe(userId);
            expect(createResult.entry.watchLevel).toBe('alert');

            // Test READ operations
            const entry = watchlistManager.getWatchlistEntry(userId, guildId);
            expect(entry).toBeDefined();
            expect(entry.userId).toBe(userId);
            expect(entry.reason).toBe('Test user for enhanced testing');

            // Test isOnWatchlist returns boolean, not null
            const isOnWatchlist = watchlistManager.isOnWatchlist(userId, guildId);
            expect(typeof isOnWatchlist).toBe('boolean');
            expect(isOnWatchlist).toBe(true);

            // Test UPDATE operations (adding notes and incidents)
            const noteResult = await watchlistManager.addNote(
                userId,
                guildId,
                'User posted suspicious content',
                moderatorId
            );
            expect(noteResult.success).toBe(true);
            expect(noteResult.note.note).toBe('User posted suspicious content');

            const incidentResult = await watchlistManager.addIncident(
                userId,
                guildId,
                {
                    type: 'message',
                    description: 'Posted spam in general channel',
                    channelId: '555666777888999000',
                    messageId: '999888777666555444'
                }
            );
            expect(incidentResult.success).toBe(true);
            expect(incidentResult.incident.type).toBe('message');

            // Test DELETE operation
            const removeResult = await watchlistManager.removeFromWatchlist(userId, guildId);
            expect(removeResult.success).toBe(true);

            // Verify user is no longer active but entry still exists (soft delete)
            const isStillActive = watchlistManager.isOnWatchlist(userId, guildId);
            expect(isStillActive).toBe(false);
        });

        test('should validate input data comprehensively', async () => {
            // Test empty/invalid userId
            let result = await watchlistManager.addToWatchlist('', 'reason', 'mod', 'guild');
            expect(result.success).toBe(false);
            expect(result.error).toContain('userId');

            // Test invalid userId format
            result = await watchlistManager.addToWatchlist('invalid', 'reason', 'mod', 'guild');
            expect(result.success).toBe(false);
            expect(result.error).toContain('userId');

            // Test empty reason
            result = await watchlistManager.addToWatchlist('123456789012345678', '', 'mod', 'guild');
            expect(result.success).toBe(false);
            expect(result.error).toContain('reason');

            // Test reason too long
            const longReason = 'a'.repeat(501);
            result = await watchlistManager.addToWatchlist('123456789012345678', longReason, 'mod', 'guild');
            expect(result.success).toBe(false);
            expect(result.error).toContain('too long');

            // Test invalid watch level
            result = await watchlistManager.addToWatchlist(
                '123456789012345678', 
                'reason', 
                'mod', 
                'guild',
                { watchLevel: 'invalid' }
            );
            expect(result.success).toBe(false);
            expect(result.error).toContain('watchLevel');
        });

        test('should handle concurrent operations safely', async () => {
            const promises = [];
            const userIds = ['user1', 'user2', 'user3', 'user4', 'user5'];
            
            // Create multiple concurrent add operations
            for (const userId of userIds) {
                promises.push(
                    watchlistManager.addToWatchlist(userId, `reason for ${userId}`, 'mod1', 'guild1')
                );
            }

            const results = await Promise.all(promises);
            
            // All operations should succeed
            results.forEach((result, index) => {
                expect(result.success).toBe(true);
                expect(result.entry.userId).toBe(userIds[index]);
            });

            // Verify all users are in watchlist
            const guildWatchlist = watchlistManager.getGuildWatchlist('guild1');
            expect(guildWatchlist).toHaveLength(5);
        });
    });

    describe('Enhanced File Operations and Error Recovery', () => {
        test('should handle file system errors gracefully', async () => {
            // Test with completely invalid path that should fail
            const invalidManager = new WatchlistManager('/root/invalid/path/watchlist.json');
            
            // Wait for initialization
            await new Promise(resolve => setTimeout(resolve, 200));
            
            const result = await invalidManager.addToWatchlist('user1', 'reason', 'mod1', 'guild1');
            
            // Should handle error gracefully and return error result
            expect(result.success).toBe(false);
            expect(result.error).toBeDefined();
        });

        test('should recover from corrupted JSON data', async () => {
            // Write corrupted JSON to test file
            fs.writeFileSync(TEST_WATCHLIST_FILE, '{"invalid": json content}');
            
            const manager = new WatchlistManager(TEST_WATCHLIST_FILE);
            await new Promise(resolve => setTimeout(resolve, 200));
            
            // Should recover and use default structure
            expect(manager.watchlist._metadata).toBeDefined();
            expect(manager.watchlist._settings).toBeDefined();
            
            // Should be able to add users after recovery
            const result = await manager.addToWatchlist('user1', 'test', 'mod1', 'guild1');
            expect(result.success).toBe(true);
        });

        test('should handle backup and recovery operations', async () => {
            // Create valid backup data
            const backupData = {
                _metadata: { 
                    version: '2.0', 
                    created: new Date().toISOString(),
                    lastModified: new Date().toISOString()
                },
                _settings: {},
                'guild1_user1': {
                    userId: 'user1',
                    guildId: 'guild1',
                    reason: 'backup test user',
                    addedBy: 'mod1',
                    addedAt: new Date().toISOString(),
                    active: true,
                    notes: [],
                    incidents: [],
                    watchLevel: 'alert'
                }
            };
            
            // Write backup file
            fs.writeFileSync(TEST_BACKUP_FILE, JSON.stringify(backupData, null, 2));
            
            // Corrupt main file
            fs.writeFileSync(TEST_WATCHLIST_FILE, 'completely corrupted data');
            
            const manager = new WatchlistManager(TEST_WATCHLIST_FILE);
            await new Promise(resolve => setTimeout(resolve, 300));
            
            // Should recover from backup
            const isOnWatchlist = manager.isOnWatchlist('user1', 'guild1');
            expect(isOnWatchlist).toBe(true);
            
            const entry = manager.getWatchlistEntry('user1', 'guild1');
            expect(entry).toBeDefined();
            expect(entry.reason).toBe('backup test user');
        });

        test('should handle file locking with timeout', async () => {
            // Create a lock file
            fs.writeFileSync(TEST_LOCK_FILE, '12345');
            
            const manager = new WatchlistManager(TEST_WATCHLIST_FILE);
            
            // Should handle lock gracefully with timeout
            const startTime = Date.now();
            
            // This should timeout and remove stale lock
            await manager.saveWatchlistWithRetry();
            
            const endTime = Date.now();
            
            // Should have taken some time but not the full 10 seconds
            expect(endTime - startTime).toBeGreaterThan(50);
            expect(endTime - startTime).toBeLessThan(5000);
            
            // Lock file should be removed
            expect(fs.existsSync(TEST_LOCK_FILE)).toBe(false);
        }, 15000);

        test('should retry failed operations with exponential backoff', async () => {
            const manager = new WatchlistManager(TEST_WATCHLIST_FILE);
            
            // Mock fs.promises.writeFile to fail first few times
            const originalWriteFile = fs.promises.writeFile;
            let attempts = 0;
            
            fs.promises.writeFile = vi.fn().mockImplementation((...args) => {
                attempts++;
                if (attempts < 3) {
                    throw new Error('Mock file system error');
                }
                return originalWriteFile(...args);
            });
            
            const result = await manager.saveWatchlistWithRetry();
            expect(result).toBe(true);
            expect(attempts).toBe(3);
            
            // Restore original function
            fs.promises.writeFile = originalWriteFile;
        });
    });

    describe('Enhanced Data Validation and Integrity', () => {
        test('should validate entry data with comprehensive checks', () => {
            const testCases = [
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
                    data: { userId: '123456789012345678', reason: 'ab', addedBy: 'mod', guildId: 'guild' },
                    shouldPass: false,
                    description: 'reason too short'
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
                        reason: 'Valid test reason', 
                        addedBy: '987654321098765432', 
                        guildId: '111222333444555666',
                        watchLevel: 'alert'
                    },
                    shouldPass: true,
                    description: 'valid entry'
                }
            ];

            testCases.forEach(({ data, shouldPass, description }) => {
                const result = watchlistManager.validateEntryData(data);
                if (shouldPass) {
                    expect(result.isValid).toBe(true);
                } else {
                    expect(result.isValid).toBe(false);
                }
            });
        });

        test('should fix corrupted data automatically', () => {
            const corruptedData = {
                // Missing metadata
                'guild1_user1': {
                    userId: 'user1',
                    guildId: 'guild1',
                    reason: 'test',
                    addedBy: 'mod1'
                    // Missing notes, incidents, active, addedAt fields
                },
                'invalid_entry': {
                    userId: null,
                    reason: ''
                }
            };

            const fixed = watchlistManager.fixWatchlistData(corruptedData);
            
            // Should add missing metadata and settings
            expect(fixed._metadata).toBeDefined();
            expect(fixed._settings).toBeDefined();
            
            // Should fix valid entry
            expect(fixed['guild1_user1'].notes).toEqual([]);
            expect(fixed['guild1_user1'].incidents).toEqual([]);
            expect(fixed['guild1_user1'].active).toBe(true);
            expect(fixed['guild1_user1'].addedAt).toBeDefined();
            
            // Should remove invalid entry
            expect(fixed.invalid_entry).toBeUndefined();
        });

        test('should validate complete watchlist data structure', () => {
            const testData = {
                _metadata: { version: '2.0', created: new Date().toISOString() },
                _settings: {},
                'guild1_user1': {
                    userId: 'user1',
                    guildId: 'guild1',
                    reason: 'test user',
                    addedBy: 'mod1',
                    addedAt: new Date().toISOString(),
                    active: true,
                    notes: [],
                    incidents: [],
                    watchLevel: 'alert'
                },
                'invalid_entry': {
                    userId: null,
                    reason: ''
                }
            };

            const result = watchlistManager.validateWatchlistData(testData);
            expect(result.isValid).toBe(false);
            expect(result.errors.some(error => error.includes('Invalid entry: invalid_entry'))).toBe(true);
        });
    });

    describe('Enhanced Notification System and Event Handling', () => {
        beforeEach(async () => {
            // Add test users with different watch levels
            await watchlistManager.addToWatchlist('observe_user', 'test observe', 'mod', 'guild1', { watchLevel: 'observe' });
            await watchlistManager.addToWatchlist('alert_user', 'test alert', 'mod', 'guild1', { watchLevel: 'alert' });
            await watchlistManager.addToWatchlist('action_user', 'test action', 'mod', 'guild1', { watchLevel: 'action' });
        });

        test('should handle user join events with proper notifications', async () => {
            const mockMember = {
                id: 'alert_user',
                user: {
                    username: 'AlertUser',
                    discriminator: '1234',
                    tag: 'AlertUser#1234',
                    displayAvatarURL: () => 'https://example.com/avatar.png',
                    createdAt: new Date()
                },
                guild: {
                    id: 'guild1',
                    name: 'Test Guild'
                },
                client: {}
            };

            const result = await watchlistManager.handleUserJoin(mockMember);
            
            expect(result.success).toBe(true);
            expect(result.watched).toBe(true);
            expect(result.watchLevel).toBe('alert');
            expect(result.incident).toBeDefined();
            
            // Should have sent notification for alert level
            expect(mockReportManager.alertsSent).toHaveLength(1);
        });

        test('should handle message events with watch level logic', async () => {
            const createMockMessage = (userId) => ({
                author: {
                    id: userId,
                    tag: 'TestUser#1234',
                    bot: false,
                    displayAvatarURL: () => 'https://example.com/avatar.png'
                },
                guild: { id: 'guild1' },
                channel: { id: 'channel1', name: 'general' },
                content: 'Test message content',
                id: 'message1',
                url: 'https://discord.com/channels/guild1/channel1/message1',
                client: {}
            });

            mockReportManager.reset();

            // Test observe level (should not notify but should log)
            const observeResult = await watchlistManager.handleUserMessage(createMockMessage('observe_user'));
            expect(observeResult.success).toBe(true);
            expect(observeResult.watched).toBe(true);
            expect(observeResult.watchLevel).toBe('observe');
            expect(mockReportManager.alertsSent).toHaveLength(0);

            // Test alert level (should notify)
            const alertResult = await watchlistManager.handleUserMessage(createMockMessage('alert_user'));
            expect(alertResult.success).toBe(true);
            expect(alertResult.watched).toBe(true);
            expect(alertResult.watchLevel).toBe('alert');
            expect(mockReportManager.alertsSent).toHaveLength(1);

            // Test action level (should notify)
            const actionResult = await watchlistManager.handleUserMessage(createMockMessage('action_user'));
            expect(actionResult.success).toBe(true);
            expect(actionResult.watched).toBe(true);
            expect(actionResult.watchLevel).toBe('action');
            expect(mockReportManager.alertsSent).toHaveLength(2);
        });

        test('should respect notification rate limits', async () => {
            const mockMember = {
                id: 'alert_user',
                user: {
                    username: 'AlertUser',
                    discriminator: '1234',
                    tag: 'AlertUser#1234',
                    displayAvatarURL: () => 'https://example.com/avatar.png',
                    createdAt: new Date()
                },
                guild: {
                    id: 'guild1',
                    name: 'Test Guild'
                },
                client: {}
            };

            mockReportManager.reset();

            // First notification should go through
            const result1 = await watchlistManager.handleUserJoin(mockMember);
            expect(result1.success).toBe(true);
            expect(mockReportManager.alertsSent).toHaveLength(1);

            // Immediate second notification should be rate limited
            const result2 = await watchlistManager.handleUserJoin(mockMember);
            expect(result2.success).toBe(true);
            // Should still be 1 due to rate limiting
            expect(mockReportManager.alertsSent).toHaveLength(1);
        });

        test('should handle notification failures gracefully', async () => {
            mockReportManager.shouldFail = true;

            const mockMember = {
                id: 'alert_user',
                user: {
                    username: 'AlertUser',
                    discriminator: '1234',
                    tag: 'AlertUser#1234',
                    displayAvatarURL: () => 'https://example.com/avatar.png',
                    createdAt: new Date()
                },
                guild: {
                    id: 'guild1',
                    name: 'Test Guild'
                },
                client: {}
            };

            const result = await watchlistManager.handleUserJoin(mockMember);
            
            // Should still succeed even if notification fails
            expect(result.success).toBe(true);
            expect(result.incident).toBeDefined();
        });

        test('should ignore bot messages', async () => {
            const botMessage = {
                author: {
                    id: 'alert_user',
                    bot: true,
                    tag: 'BotUser#1234'
                },
                guild: { id: 'guild1' }
            };

            const result = await watchlistManager.handleUserMessage(botMessage);
            
            expect(result.success).toBe(true);
            expect(result.watched).toBe(false);
            expect(mockReportManager.alertsSent).toHaveLength(0);
        });
    });

    describe('Enhanced Global Watchlist Operations', () => {
        test('should handle global watchlist operations correctly', async () => {
            // Add user to global watchlist
            const addResult = await watchlistManager.addToGlobalWatchlist(
                'global_user',
                'Global threat detected',
                'admin1',
                { watchLevel: 'action' }
            );

            expect(addResult.success).toBe(true);
            expect(addResult.entry.guildId).toBe('GLOBAL');
            expect(addResult.entry.watchLevel).toBe('action');

            // Check global status
            const isGlobal = watchlistManager.isOnGlobalWatchlist('global_user');
            expect(isGlobal).toBe(true);

            // Get global entry
            const globalEntry = watchlistManager.getGlobalWatchlistEntry('global_user');
            expect(globalEntry).toBeDefined();
            expect(globalEntry.reason).toBe('Global threat detected');

            // Remove from global watchlist
            const removeResult = await watchlistManager.removeFromGlobalWatchlist('global_user');
            expect(removeResult.success).toBe(true);

            // Should no longer be on global watchlist
            const isStillGlobal = watchlistManager.isOnGlobalWatchlist('global_user');
            expect(isStillGlobal).toBe(false);
        });

        test('should handle global watchlist in user join events', async () => {
            // Add user to global watchlist
            await watchlistManager.addToGlobalWatchlist('global_user', 'Global threat', 'admin1', { watchLevel: 'action' });

            const mockMember = {
                id: 'global_user',
                user: {
                    username: 'GlobalUser',
                    discriminator: '5678',
                    tag: 'GlobalUser#5678',
                    displayAvatarURL: () => 'https://example.com/avatar.png',
                    createdAt: new Date()
                },
                guild: {
                    id: 'any_guild',
                    name: 'Any Guild'
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

    describe('Performance and Memory Management', () => {
        test('should handle large datasets efficiently', async () => {
            const startTime = Date.now();
            const promises = [];
            
            // Add 100 users concurrently
            for (let i = 0; i < 100; i++) {
                promises.push(
                    watchlistManager.addToWatchlist(
                        `user${i}`,
                        `Test user ${i}`,
                        'mod1',
                        `guild${i % 10}`,
                        { watchLevel: i % 3 === 0 ? 'observe' : i % 3 === 1 ? 'alert' : 'action' }
                    )
                );
            }

            const results = await Promise.all(promises);
            const endTime = Date.now();

            // All operations should succeed
            results.forEach(result => {
                expect(result.success).toBe(true);
            });

            // Should complete in reasonable time (less than 5 seconds)
            expect(endTime - startTime).toBeLessThan(5000);

            // Test retrieval performance
            const retrievalStart = Date.now();
            const guildWatchlist = watchlistManager.getGuildWatchlist('guild1');
            const retrievalEnd = Date.now();

            expect(guildWatchlist.length).toBeGreaterThan(0);
            expect(retrievalEnd - retrievalStart).toBeLessThan(100); // Should be very fast
        });

        test('should clean up resources properly', async () => {
            // Create multiple managers to test resource cleanup
            const managers = [];
            
            for (let i = 0; i < 10; i++) {
                const manager = new WatchlistManager(`test/test-data/manager${i}.json`);
                managers.push(manager);
                
                // Add some data to each
                await manager.addToWatchlist(`user${i}`, `reason${i}`, 'mod', `guild${i}`, { watchLevel: 'observe' });
            }

            // All managers should work independently
            for (let i = 0; i < 10; i++) {
                const isOnWatchlist = managers[i].isOnWatchlist(`user${i}`, `guild${i}`);
                expect(isOnWatchlist).toBe(true);
            }

            // Clean up test files
            for (let i = 0; i < 10; i++) {
                const filePath = `test/test-data/manager${i}.json`;
                if (fs.existsSync(filePath)) {
                    fs.unlinkSync(filePath);
                }
            }
        });
    });

    describe('Advanced Error Scenarios', () => {
        test('should handle partial data corruption gracefully', async () => {
            // Create partially corrupted data
            const partiallyCorrupted = {
                _metadata: { version: '2.0' },
                _settings: {},
                'guild1_user1': {
                    userId: 'user1',
                    guildId: 'guild1',
                    reason: 'valid user',
                    addedBy: 'mod1',
                    addedAt: new Date().toISOString(),
                    active: true,
                    notes: [],
                    incidents: []
                },
                'corrupted_entry': 'this is not an object',
                'another_bad_entry': {
                    userId: null,
                    // missing required fields
                }
            };

            fs.writeFileSync(TEST_WATCHLIST_FILE, JSON.stringify(partiallyCorrupted, null, 2));

            const manager = new WatchlistManager(TEST_WATCHLIST_FILE);
            await new Promise(resolve => setTimeout(resolve, 200));

            // Should recover valid entries and discard corrupted ones
            expect(manager.isOnWatchlist('user1', 'guild1')).toBe(true);
            
            // Should be able to add new entries after recovery
            const result = await manager.addToWatchlist('user2', 'new user', 'mod1', 'guild1');
            expect(result.success).toBe(true);
        });

        test('should handle disk space and permission errors', async () => {
            const manager = new WatchlistManager(TEST_WATCHLIST_FILE);
            
            // Mock fs operations to simulate disk space error
            const originalWriteFile = fs.promises.writeFile;
            fs.promises.writeFile = vi.fn().mockRejectedValue(new Error('ENOSPC: no space left on device'));
            
            const result = await manager.saveWatchlistWithRetry();
            expect(result).toBe(false);
            
            // Restore original function
            fs.promises.writeFile = originalWriteFile;
        });

        test('should handle network-related errors in notifications', async () => {
            await watchlistManager.addToWatchlist('test_user', 'test', 'mod', 'guild1', { watchLevel: 'alert' });
            
            // Make ReportManager fail with network error
            mockReportManager.shouldFail = true;
            
            const mockMember = {
                id: 'test_user',
                user: {
                    username: 'TestUser',
                    discriminator: '1234',
                    tag: 'TestUser#1234',
                    displayAvatarURL: () => 'https://example.com/avatar.png',
                    createdAt: new Date()
                },
                guild: {
                    id: 'guild1',
                    name: 'Test Guild'
                },
                client: {}
            };

            const result = await watchlistManager.handleUserJoin(mockMember);
            
            // Should handle notification failure gracefully
            expect(result.success).toBe(true);
            expect(result.incident).toBeDefined();
        });
    });
});