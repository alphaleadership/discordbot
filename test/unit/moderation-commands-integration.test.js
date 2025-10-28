import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';

// Import all moderation commands
import ban from '../../commands/ban.js';
import kick from '../../commands/kick.js';
import clear from '../../commands/clear.js';
import timeout from '../../commands/timeout.js';
import unban from '../../commands/unban.js';

// Import watchlist commands
import watchlistAdd from '../../commands/watchlist-add.js';
import watchlistRemove from '../../commands/watchlist-remove.js';
import watchlistList from '../../commands/watchlist-list.js';
import watchlistInfo from '../../commands/watchlist-info.js';
import watchlistNote from '../../commands/watchlist-note.js';

// Import utilities
import { WatchlistManager } from '../../utils/WatchlistManager.js';
import AdminManager from '../../utils/AdminManager.js';
import ModerationLogger from '../../utils/ModerationLogger.js';

// Test configuration
const TEST_DATA_DIR = path.join(process.cwd(), 'test', 'test-data');
const TEST_WATCHLIST_FILE = 'test/test-data/integration-watchlist.json';
const TEST_ADMINS_FILE = 'test/test-data/integration-admins.json';

// Mock Discord.js structures
class MockUser {
    constructor(id, username = 'TestUser', discriminator = '1234') {
        this.id = id;
        this.username = username;
        this.discriminator = discriminator;
        this.tag = `${username}#${discriminator}`;
        this.bot = false;
        this.displayAvatarURL = () => 'https://example.com/avatar.png';
        this.createdAt = new Date();
    }
}

class MockMember {
    constructor(user, guild, roles = []) {
        this.id = user.id;
        this.user = user;
        this.guild = guild;
        this.roles = {
            cache: new Map(roles.map(role => [role.id, role])),
            highest: roles.length > 0 ? roles[roles.length - 1] : { position: 0 }
        };
        this.permissions = {
            has: vi.fn().mockReturnValue(true) // Default to having permissions
        };
        this.kick = vi.fn().mockResolvedValue();
        this.ban = vi.fn().mockResolvedValue();
        this.timeout = vi.fn().mockResolvedValue();
    }
}

class MockRole {
    constructor(id, name, position = 1) {
        this.id = id;
        this.name = name;
        this.position = position;
    }
}

class MockGuild {
    constructor(id, name = 'Test Guild') {
        this.id = id;
        this.name = name;
        this.members = {
            fetch: vi.fn(),
            ban: vi.fn().mockResolvedValue(),
            unban: vi.fn().mockResolvedValue()
        };
        this.bans = {
            fetch: vi.fn().mockResolvedValue(new Map())
        };
    }
}

class MockChannel {
    constructor(id, name = 'general', type = 0) {
        this.id = id;
        this.name = name;
        this.type = type;
        this.messages = {
            fetch: vi.fn().mockResolvedValue(new Map()),
            bulkDelete: vi.fn().mockResolvedValue(new Map())
        };
        this.send = vi.fn().mockResolvedValue({ id: 'message123' });
    }
}

class MockInteraction {
    constructor(user, guild, channel, commandName, options = {}) {
        this.user = user;
        this.guild = guild;
        this.channel = channel;
        this.commandName = commandName;
        this.options = {
            get: (name) => options[name] || null,
            getString: (name) => options[name] || null,
            getUser: (name) => options[name] || null,
            getMember: (name) => options[name] || null,
            getInteger: (name) => options[name] || null,
            getChannel: (name) => options[name] || null
        };
        this.member = new MockMember(user, guild);
        this.replied = false;
        this.deferred = false;
        
        this.reply = vi.fn().mockImplementation(async (response) => {
            this.replied = true;
            return { id: 'reply123' };
        });
        
        this.followUp = vi.fn().mockResolvedValue({ id: 'followup123' });
        this.deferReply = vi.fn().mockImplementation(async () => {
            this.deferred = true;
        });
        
        this.editReply = vi.fn().mockResolvedValue({ id: 'edit123' });
    }
}

// Mock ReportManager
class MockReportManager {
    constructor() {
        this.reports = [];
    }
    
    async sendWatchlistAlert(client, guildId, embed) {
        this.reports.push({ type: 'watchlist', guildId, embed });
        return { success: true };
    }
    
    reset() {
        this.reports = [];
    }
}

describe('Moderation Commands Integration Tests', () => {
    let watchlistManager;
    let adminManager;
    let moderationLogger;
    let mockReportManager;
    let mockGuild;
    let mockChannel;
    let moderatorUser;
    let targetUser;
    let adminUser;

    beforeEach(async () => {
        // Ensure test data directory exists
        if (!fs.existsSync(TEST_DATA_DIR)) {
            fs.mkdirSync(TEST_DATA_DIR, { recursive: true });
        }

        // Clean up test files
        [TEST_WATCHLIST_FILE, TEST_ADMINS_FILE].forEach(file => {
            if (fs.existsSync(file)) {
                fs.unlinkSync(file);
            }
        });

        // Initialize managers
        mockReportManager = new MockReportManager();
        watchlistManager = new WatchlistManager(TEST_WATCHLIST_FILE, mockReportManager);
        adminManager = new AdminManager(TEST_ADMINS_FILE);
        moderationLogger = new ModerationLogger();

        // Wait for initialization
        await new Promise(resolve => setTimeout(resolve, 100));

        // Create mock Discord objects
        mockGuild = new MockGuild('123456789012345678', 'Test Guild');
        mockChannel = new MockChannel('987654321098765432', 'general');
        
        moderatorUser = new MockUser('111222333444555666', 'Moderator', '0001');
        targetUser = new MockUser('777888999000111222', 'Target', '0002');
        adminUser = new MockUser('333444555666777888', 'Admin', '0003');

        // Set up admin
        await adminManager.addAdmin(adminUser.id);

        // Clear all mocks
        vi.clearAllMocks();
    });

    afterEach(() => {
        // Clean up test files
        [TEST_WATCHLIST_FILE, TEST_ADMINS_FILE].forEach(file => {
            if (fs.existsSync(file)) {
                fs.unlinkSync(file);
            }
        });
        
        mockReportManager.reset();
        vi.clearAllMocks();
    });

    describe('Permission Validation Integration', () => {
        test('should enforce permission hierarchy across all commands', async () => {
            // Create users with different permission levels
            const lowRoleMember = new MockMember(
                new MockUser('low123', 'LowRole'),
                mockGuild,
                [new MockRole('role1', 'Member', 1)]
            );
            
            const highRoleMember = new MockMember(
                new MockUser('high123', 'HighRole'),
                mockGuild,
                [new MockRole('role2', 'Admin', 10)]
            );

            // Low role member should not be able to moderate high role member
            lowRoleMember.permissions.has.mockReturnValue(true); // Has permission
            
            const kickInteraction = new MockInteraction(
                lowRoleMember.user,
                mockGuild,
                mockChannel,
                'kick',
                { user: highRoleMember.user, reason: 'test' }
            );
            kickInteraction.member = lowRoleMember;

            await kick.execute(kickInteraction, adminManager, watchlistManager, moderationLogger);

            expect(kickInteraction.reply).toHaveBeenCalledWith(
                expect.objectContaining({
                    content: expect.stringContaining('higher role'),
                    ephemeral: true
                })
            );
        });

        test('should allow bot admins to bypass Discord permissions', async () => {
            // Admin user should be able to moderate anyone
            const adminMember = new MockMember(adminUser, mockGuild);
            const targetMember = new MockMember(targetUser, mockGuild);
            
            // Mock guild member fetch
            mockGuild.members.fetch.mockResolvedValue(targetMember);
            
            adminMember.permissions.has.mockReturnValue(false); // No Discord permissions
            
            const banInteraction = new MockInteraction(
                adminUser,
                mockGuild,
                mockChannel,
                'ban',
                { user: targetUser, reason: 'Admin override test' }
            );
            banInteraction.member = adminMember;

            await ban.execute(banInteraction, adminManager, watchlistManager, moderationLogger);

            expect(mockGuild.members.ban).toHaveBeenCalledWith(
                targetUser.id,
                expect.objectContaining({
                    reason: expect.stringContaining('Admin override test')
                })
            );
        });

        test('should prevent self-moderation', async () => {
            const selfModerationInteraction = new MockInteraction(
                moderatorUser,
                mockGuild,
                mockChannel,
                'timeout',
                { user: moderatorUser, duration: '10m', reason: 'self test' }
            );

            await timeout.execute(selfModerationInteraction, adminManager, watchlistManager, moderationLogger);

            expect(selfModerationInteraction.reply).toHaveBeenCalledWith(
                expect.objectContaining({
                    content: expect.stringContaining('yourself'),
                    ephemeral: true
                })
            );
        });
    });

    describe('Watchlist Integration with Moderation', () => {
        test('should automatically add banned users to watchlist', async () => {
            const moderatorMember = new MockMember(moderatorUser, mockGuild);
            const targetMember = new MockMember(targetUser, mockGuild);
            
            mockGuild.members.fetch.mockResolvedValue(targetMember);
            
            const banInteraction = new MockInteraction(
                moderatorUser,
                mockGuild,
                mockChannel,
                'ban',
                { user: targetUser, reason: 'Serious violation' }
            );
            banInteraction.member = moderatorMember;

            await ban.execute(banInteraction, adminManager, watchlistManager, moderationLogger);

            // Check if user was added to watchlist
            const watchlistEntry = watchlistManager.getWatchlistEntry(targetUser.id, mockGuild.id);
            expect(watchlistEntry).toBeDefined();
            expect(watchlistEntry.reason).toContain('Banned');
        });

        test('should integrate watchlist commands with moderation workflow', async () => {
            const moderatorMember = new MockMember(moderatorUser, mockGuild);
            
            // Add user to watchlist first
            const addInteraction = new MockInteraction(
                moderatorUser,
                mockGuild,
                mockChannel,
                'watchlist-add',
                { 
                    user: targetUser, 
                    reason: 'Suspicious behavior',
                    level: 'alert'
                }
            );
            addInteraction.member = moderatorMember;

            await watchlistAdd.execute(addInteraction, adminManager, watchlistManager, moderationLogger);

            expect(addInteraction.reply).toHaveBeenCalledWith(
                expect.objectContaining({
                    content: expect.stringContaining('added to watchlist')
                })
            );

            // Add a note
            const noteInteraction = new MockInteraction(
                moderatorUser,
                mockGuild,
                mockChannel,
                'watchlist-note',
                { 
                    user: targetUser, 
                    note: 'Posted spam in #general'
                }
            );
            noteInteraction.member = moderatorMember;

            await watchlistNote.execute(noteInteraction, adminManager, watchlistManager, moderationLogger);

            // Check watchlist info
            const infoInteraction = new MockInteraction(
                moderatorUser,
                mockGuild,
                mockChannel,
                'watchlist-info',
                { user: targetUser }
            );
            infoInteraction.member = moderatorMember;

            await watchlistInfo.execute(infoInteraction, adminManager, watchlistManager, moderationLogger);

            expect(infoInteraction.reply).toHaveBeenCalledWith(
                expect.objectContaining({
                    embeds: expect.arrayContaining([
                        expect.objectContaining({
                            fields: expect.arrayContaining([
                                expect.objectContaining({
                                    name: expect.stringContaining('Notes')
                                })
                            ])
                        })
                    ])
                })
            );
        });
    });

    describe('Error Handling and Edge Cases', () => {
        test('should handle Discord API errors gracefully', async () => {
            const moderatorMember = new MockMember(moderatorUser, mockGuild);
            
            // Mock API error
            mockGuild.members.ban.mockRejectedValue(new Error('Missing Permissions'));
            
            const banInteraction = new MockInteraction(
                moderatorUser,
                mockGuild,
                mockChannel,
                'ban',
                { user: targetUser, reason: 'API error test' }
            );
            banInteraction.member = moderatorMember;

            await ban.execute(banInteraction, adminManager, watchlistManager, moderationLogger);

            expect(banInteraction.reply).toHaveBeenCalledWith(
                expect.objectContaining({
                    content: expect.stringContaining('error'),
                    ephemeral: true
                })
            );
        });

        test('should handle invalid user IDs', async () => {
            const moderatorMember = new MockMember(moderatorUser, mockGuild);
            
            mockGuild.members.fetch.mockRejectedValue(new Error('Unknown User'));
            
            const kickInteraction = new MockInteraction(
                moderatorUser,
                mockGuild,
                mockChannel,
                'kick',
                { user: { id: 'invalid123' }, reason: 'Invalid user test' }
            );
            kickInteraction.member = moderatorMember;

            await kick.execute(kickInteraction, adminManager, watchlistManager, moderationLogger);

            expect(kickInteraction.reply).toHaveBeenCalledWith(
                expect.objectContaining({
                    content: expect.stringContaining('not found'),
                    ephemeral: true
                })
            );
        });

        test('should handle concurrent moderation actions', async () => {
            const moderatorMember = new MockMember(moderatorUser, mockGuild);
            const targetMember = new MockMember(targetUser, mockGuild);
            
            mockGuild.members.fetch.mockResolvedValue(targetMember);
            
            // Create multiple concurrent interactions
            const interactions = [
                new MockInteraction(moderatorUser, mockGuild, mockChannel, 'kick', 
                    { user: targetUser, reason: 'Concurrent test 1' }),
                new MockInteraction(moderatorUser, mockGuild, mockChannel, 'timeout', 
                    { user: targetUser, duration: '5m', reason: 'Concurrent test 2' }),
                new MockInteraction(moderatorUser, mockGuild, mockChannel, 'watchlist-add', 
                    { user: targetUser, reason: 'Concurrent test 3', level: 'observe' })
            ];
            
            interactions.forEach(interaction => {
                interaction.member = moderatorMember;
            });

            // Execute all concurrently
            const results = await Promise.allSettled([
                kick.execute(interactions[0], adminManager, watchlistManager, moderationLogger),
                timeout.execute(interactions[1], adminManager, watchlistManager, moderationLogger),
                watchlistAdd.execute(interactions[2], adminManager, watchlistManager, moderationLogger)
            ]);

            // All should complete without throwing
            results.forEach(result => {
                expect(result.status).toBe('fulfilled');
            });
        });
    });

    describe('Logging Integration', () => {
        test('should log all moderation actions consistently', async () => {
            const moderatorMember = new MockMember(moderatorUser, mockGuild);
            const targetMember = new MockMember(targetUser, mockGuild);
            
            mockGuild.members.fetch.mockResolvedValue(targetMember);
            
            // Mock the logging methods
            const logSpy = vi.spyOn(moderationLogger, 'logAction').mockResolvedValue();
            
            const banInteraction = new MockInteraction(
                moderatorUser,
                mockGuild,
                mockChannel,
                'ban',
                { user: targetUser, reason: 'Logging test' }
            );
            banInteraction.member = moderatorMember;

            await ban.execute(banInteraction, adminManager, watchlistManager, moderationLogger);

            expect(logSpy).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: 'ban',
                    moderatorId: moderatorUser.id,
                    targetId: targetUser.id,
                    guildId: mockGuild.id,
                    reason: 'Logging test'
                })
            );
        });

        test('should log watchlist operations', async () => {
            const moderatorMember = new MockMember(moderatorUser, mockGuild);
            
            const logSpy = vi.spyOn(moderationLogger, 'logAction').mockResolvedValue();
            
            const addInteraction = new MockInteraction(
                moderatorUser,
                mockGuild,
                mockChannel,
                'watchlist-add',
                { 
                    user: targetUser, 
                    reason: 'Watchlist logging test',
                    level: 'alert'
                }
            );
            addInteraction.member = moderatorMember;

            await watchlistAdd.execute(addInteraction, adminManager, watchlistManager, moderationLogger);

            expect(logSpy).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: 'watchlist_add',
                    moderatorId: moderatorUser.id,
                    targetId: targetUser.id,
                    guildId: mockGuild.id
                })
            );
        });
    });

    describe('Bulk Operations', () => {
        test('should handle bulk message deletion efficiently', async () => {
            const moderatorMember = new MockMember(moderatorUser, mockGuild);
            
            // Mock messages for bulk delete
            const mockMessages = new Map();
            for (let i = 0; i < 50; i++) {
                mockMessages.set(`msg${i}`, {
                    id: `msg${i}`,
                    createdTimestamp: Date.now() - (i * 1000)
                });
            }
            
            mockChannel.messages.fetch.mockResolvedValue(mockMessages);
            mockChannel.messages.bulkDelete.mockResolvedValue(mockMessages);
            
            const clearInteraction = new MockInteraction(
                moderatorUser,
                mockGuild,
                mockChannel,
                'clear',
                { count: 50 }
            );
            clearInteraction.member = moderatorMember;

            const startTime = Date.now();
            await clear.execute(clearInteraction, adminManager, watchlistManager, moderationLogger);
            const endTime = Date.now();

            expect(endTime - startTime).toBeLessThan(5000); // Should complete in under 5 seconds
            expect(mockChannel.messages.bulkDelete).toHaveBeenCalled();
        });
    });

    describe('Cross-Command Integration', () => {
        test('should maintain data consistency across multiple command executions', async () => {
            const moderatorMember = new MockMember(moderatorUser, mockGuild);
            const targetMember = new MockMember(targetUser, mockGuild);
            
            mockGuild.members.fetch.mockResolvedValue(targetMember);
            
            // 1. Add to watchlist
            const addInteraction = new MockInteraction(
                moderatorUser, mockGuild, mockChannel, 'watchlist-add',
                { user: targetUser, reason: 'Initial surveillance', level: 'alert' }
            );
            addInteraction.member = moderatorMember;
            
            await watchlistAdd.execute(addInteraction, adminManager, watchlistManager, moderationLogger);
            
            // 2. Add note
            const noteInteraction = new MockInteraction(
                moderatorUser, mockGuild, mockChannel, 'watchlist-note',
                { user: targetUser, note: 'Suspicious activity detected' }
            );
            noteInteraction.member = moderatorMember;
            
            await watchlistNote.execute(noteInteraction, adminManager, watchlistManager, moderationLogger);
            
            // 3. Timeout user
            const timeoutInteraction = new MockInteraction(
                moderatorUser, mockGuild, mockChannel, 'timeout',
                { user: targetUser, duration: '1h', reason: 'Escalation from watchlist' }
            );
            timeoutInteraction.member = moderatorMember;
            
            await timeout.execute(timeoutInteraction, adminManager, watchlistManager, moderationLogger);
            
            // 4. Check watchlist info
            const infoInteraction = new MockInteraction(
                moderatorUser, mockGuild, mockChannel, 'watchlist-info',
                { user: targetUser }
            );
            infoInteraction.member = moderatorMember;
            
            await watchlistInfo.execute(infoInteraction, adminManager, watchlistManager, moderationLogger);
            
            // Verify data consistency
            const entry = watchlistManager.getWatchlistEntry(targetUser.id, mockGuild.id);
            expect(entry).toBeDefined();
            expect(entry.notes).toHaveLength(1);
            expect(entry.incidents).toHaveLength(1); // Timeout should create incident
            expect(entry.notes[0].note).toBe('Suspicious activity detected');
        });
    });
});