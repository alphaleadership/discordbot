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

// Import global watchlist commands
import globalWatchlistAdd from '../../commands/global-watchlist-add.js';
import globalWatchlistRemove from '../../commands/global-watchlist-remove.js';
import globalWatchlistList from '../../commands/global-watchlist-list.js';

// Import utilities
import { WatchlistManager } from '../../utils/WatchlistManager.js';
import AdminManager from '../../utils/AdminManager.js';
import ModerationLogger from '../../utils/ModerationLogger.js';

// Test configuration
const TEST_DATA_DIR = path.join(process.cwd(), 'test', 'test-data');
const TEST_WATCHLIST_FILE = 'test/test-data/enhanced-integration-watchlist.json';
const TEST_ADMINS_FILE = 'test/test-data/enhanced-integration-admins.json';

// Enhanced Mock Classes
class MockUser {
    constructor(id, username = 'TestUser', discriminator = '1234', bot = false) {
        this.id = id;
        this.username = username;
        this.discriminator = discriminator;
        this.tag = `${username}#${discriminator}`;
        this.bot = bot;
        this.displayAvatarURL = () => 'https://example.com/avatar.png';
        this.createdAt = new Date();
        this.send = vi.fn().mockResolvedValue({ id: 'dm123' });
    }
}

class MockRole {
    constructor(id, name, position = 1, permissions = []) {
        this.id = id;
        this.name = name;
        this.position = position;
        this.permissions = {
            has: vi.fn().mockImplementation(perm => permissions.includes(perm))
        };
    }
}

class MockMember {
    constructor(user, guild, roles = [], permissions = []) {
        this.id = user.id;
        this.user = user;
        this.guild = guild;
        this.roles = {
            cache: new Map(roles.map(role => [role.id, role])),
            highest: roles.length > 0 ? roles.reduce((highest, role) => 
                role.position > highest.position ? role : highest
            ) : { position: 0 }
        };
        this.permissions = {
            has: vi.fn().mockImplementation(perm => permissions.includes(perm))
        };
        this.kick = vi.fn().mockResolvedValue();
        this.ban = vi.fn().mockResolvedValue();
        this.timeout = vi.fn().mockResolvedValue();
        this.moderatable = true;
        this.bannable = true;
        this.kickable = true;
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
            fetch: vi.fn().mockResolvedValue(new Map()),
            remove: vi.fn().mockResolvedValue()
        };
        this.channels = {
            cache: new Map()
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
        this.permissionsFor = vi.fn().mockReturnValue({
            has: vi.fn().mockReturnValue(true)
        });
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
            getChannel: (name) => options[name] || null,
            getBoolean: (name) => options[name] || false
        };
        this.member = null; // Will be set by test
        this.replied = false;
        this.deferred = false;
        this.createdTimestamp = Date.now();
        
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

// Enhanced Mock ReportManager
class MockReportManager {
    constructor() {
        this.reports = [];
        this.shouldFail = false;
        this.failureType = 'generic';
    }
    
    async sendWatchlistAlert(client, guildId, embed) {
        if (this.shouldFail) {
            if (this.failureType === 'network') {
                throw new Error('Network timeout');
            } else if (this.failureType === 'permission') {
                throw new Error('Missing permissions');
            } else {
                throw new Error('Generic failure');
            }
        }
        
        this.reports.push({ 
            type: 'watchlist', 
            guildId, 
            embed, 
            timestamp: Date.now() 
        });
        return { success: true };
    }
    
    reset() {
        this.reports = [];
        this.shouldFail = false;
        this.failureType = 'generic';
    }
}

describe('Enhanced Moderation Commands Integration Tests', () => {
    let watchlistManager;
    let adminManager;
    let moderationLogger;
    let mockReportManager;
    let mockGuild;
    let mockChannel;
    let moderatorUser;
    let targetUser;
    let adminUser;
    let botUser;

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
        botUser = new MockUser('999888777666555444', 'TestBot', '0000', true);

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

    describe('End-to-End Moderation Workflows', () => {
        test('should execute complete surveillance to moderation workflow', async () => {
            // Create members with proper roles and permissions
            const moderatorRole = new MockRole('mod_role', 'Moderator', 5, ['KICK_MEMBERS', 'BAN_MEMBERS', 'MODERATE_MEMBERS']);
            const memberRole = new MockRole('member_role', 'Member', 1, []);
            
            const moderatorMember = new MockMember(
                moderatorUser, 
                mockGuild, 
                [moderatorRole], 
                ['KICK_MEMBERS', 'BAN_MEMBERS', 'MODERATE_MEMBERS']
            );
            
            const targetMember = new MockMember(targetUser, mockGuild, [memberRole], []);
            
            mockGuild.members.fetch.mockResolvedValue(targetMember);

            // Step 1: Add user to watchlist
            const addInteraction = new MockInteraction(
                moderatorUser, mockGuild, mockChannel, 'watchlist-add',
                { 
                    user: targetUser, 
                    reason: 'Suspicious behavior detected',
                    level: 'alert'
                }
            );
            addInteraction.member = moderatorMember;

            await watchlistAdd.execute(addInteraction, adminManager, watchlistManager, moderationLogger);

            expect(addInteraction.reply).toHaveBeenCalledWith(
                expect.objectContaining({
                    content: expect.stringContaining('ajouté à la liste de surveillance')
                })
            );

            // Verify user is on watchlist
            const isOnWatchlist = watchlistManager.isOnWatchlist(targetUser.id, mockGuild.id);
            expect(isOnWatchlist).toBe(true);

            // Step 2: Add note about suspicious activity
            const noteInteraction = new MockInteraction(
                moderatorUser, mockGuild, mockChannel, 'watchlist-note',
                { 
                    user: targetUser, 
                    note: 'Posted spam links in multiple channels'
                }
            );
            noteInteraction.member = moderatorMember;

            await watchlistNote.execute(noteInteraction, adminManager, watchlistManager, moderationLogger);

            expect(noteInteraction.reply).toHaveBeenCalledWith(
                expect.objectContaining({
                    content: expect.stringContaining('Note ajoutée')
                })
            );

            // Step 3: Escalate to timeout
            const timeoutInteraction = new MockInteraction(
                moderatorUser, mockGuild, mockChannel, 'timeout',
                { 
                    user: targetUser, 
                    duration: '1h',
                    reason: 'Escalation from watchlist - continued spam'
                }
            );
            timeoutInteraction.member = moderatorMember;

            await timeout.execute(timeoutInteraction, adminManager, watchlistManager, moderationLogger);

            expect(targetMember.timeout).toHaveBeenCalled();

            // Step 4: Further escalate to ban
            const banInteraction = new MockInteraction(
                moderatorUser, mockGuild, mockChannel, 'ban',
                { 
                    user: targetUser, 
                    reason: 'Continued violations after timeout',
                    delete_days: 1
                }
            );
            banInteraction.member = moderatorMember;

            await ban.execute(banInteraction, adminManager, watchlistManager, moderationLogger);

            expect(mockGuild.members.ban).toHaveBeenCalledWith(
                targetUser.id,
                expect.objectContaining({
                    reason: expect.stringContaining('Continued violations after timeout')
                })
            );

            // Step 5: Verify watchlist entry has complete history
            const infoInteraction = new MockInteraction(
                moderatorUser, mockGuild, mockChannel, 'watchlist-info',
                { user: targetUser }
            );
            infoInteraction.member = moderatorMember;

            await watchlistInfo.execute(infoInteraction, adminManager, watchlistManager, moderationLogger);

            const watchlistEntry = watchlistManager.getWatchlistEntry(targetUser.id, mockGuild.id);
            expect(watchlistEntry).toBeDefined();
            expect(watchlistEntry.notes).toHaveLength(1);
            expect(watchlistEntry.incidents.length).toBeGreaterThan(0);
        });

        test('should handle global watchlist escalation workflow', async () => {
            // Create admin member
            const adminRole = new MockRole('admin_role', 'Admin', 10, ['ADMINISTRATOR']);
            const adminMember = new MockMember(adminUser, mockGuild, [adminRole], ['ADMINISTRATOR']);
            
            // Step 1: Add to global watchlist (admin only)
            const globalAddInteraction = new MockInteraction(
                adminUser, mockGuild, mockChannel, 'global-watchlist-add',
                { 
                    user: targetUser, 
                    reason: 'Cross-server harassment detected'
                }
            );
            globalAddInteraction.member = adminMember;

            await globalWatchlistAdd.execute(globalAddInteraction, adminManager, watchlistManager, moderationLogger);

            expect(globalAddInteraction.reply).toHaveBeenCalledWith(
                expect.objectContaining({
                    content: expect.stringContaining('ajouté à la liste de surveillance globale')
                })
            );

            // Verify user is on global watchlist
            const isOnGlobalWatchlist = watchlistManager.isOnGlobalWatchlist(targetUser.id);
            expect(isOnGlobalWatchlist).toBe(true);

            // Step 2: Simulate user joining another guild (should trigger notification)
            const anotherGuild = new MockGuild('999888777666555444', 'Another Guild');
            const joinMember = new MockMember(targetUser, anotherGuild);

            const joinResult = await watchlistManager.handleUserJoin(joinMember);
            
            expect(joinResult.success).toBe(true);
            expect(joinResult.watched).toBe(true);
            expect(joinResult.isGlobal).toBe(true);

            // Step 3: List global watchlist
            const globalListInteraction = new MockInteraction(
                adminUser, mockGuild, mockChannel, 'global-watchlist-list'
            );
            globalListInteraction.member = adminMember;

            await globalWatchlistList.execute(globalListInteraction, adminManager, watchlistManager, moderationLogger);

            expect(globalListInteraction.reply).toHaveBeenCalledWith(
                expect.objectContaining({
                    embeds: expect.arrayContaining([
                        expect.objectContaining({
                            title: expect.stringContaining('Liste de surveillance globale')
                        })
                    ])
                })
            );
        });
    });

    describe('Permission Validation with Various User Roles', () => {
        test('should enforce strict role hierarchy', async () => {
            // Create role hierarchy: Owner > Admin > Moderator > Member
            const ownerRole = new MockRole('owner', 'Owner', 100, ['ADMINISTRATOR']);
            const adminRole = new MockRole('admin', 'Admin', 50, ['BAN_MEMBERS', 'KICK_MEMBERS']);
            const moderatorRole = new MockRole('mod', 'Moderator', 25, ['KICK_MEMBERS']);
            const memberRole = new MockRole('member', 'Member', 1, []);

            const ownerMember = new MockMember(
                new MockUser('owner123', 'Owner'),
                mockGuild, [ownerRole], ['ADMINISTRATOR']
            );
            
            const adminMember = new MockMember(
                new MockUser('admin123', 'Admin'),
                mockGuild, [adminRole], ['BAN_MEMBERS', 'KICK_MEMBERS']
            );
            
            const moderatorMember = new MockMember(
                new MockUser('mod123', 'Moderator'),
                mockGuild, [moderatorRole], ['KICK_MEMBERS']
            );

            // Test 1: Moderator cannot ban admin (higher role)
            const banInteraction = new MockInteraction(
                moderatorMember.user, mockGuild, mockChannel, 'ban',
                { user: adminMember.user, reason: 'Test hierarchy' }
            );
            banInteraction.member = moderatorMember;

            await ban.execute(banInteraction, adminManager, watchlistManager, moderationLogger);

            expect(banInteraction.reply).toHaveBeenCalledWith(
                expect.objectContaining({
                    content: expect.stringContaining('rôle plus élevé'),
                    ephemeral: true
                })
            );

            // Test 2: Admin can kick moderator (lower role)
            mockGuild.members.fetch.mockResolvedValue(moderatorMember);
            
            const kickInteraction = new MockInteraction(
                adminMember.user, mockGuild, mockChannel, 'kick',
                { user: moderatorMember.user, reason: 'Valid hierarchy action' }
            );
            kickInteraction.member = adminMember;

            await kick.execute(kickInteraction, adminManager, watchlistManager, moderationLogger);

            expect(moderatorMember.kick).toHaveBeenCalledWith('Valid hierarchy action');

            // Test 3: Owner can moderate anyone
            const ownerBanInteraction = new MockInteraction(
                ownerMember.user, mockGuild, mockChannel, 'ban',
                { user: adminMember.user, reason: 'Owner override' }
            );
            ownerBanInteraction.member = ownerMember;

            await ban.execute(ownerBanInteraction, adminManager, watchlistManager, moderationLogger);

            expect(mockGuild.members.ban).toHaveBeenCalled();
        });

        test('should handle bot admin override correctly', async () => {
            // Create member with no Discord permissions
            const noPerm = new MockRole('noperm', 'No Permissions', 1, []);
            const noPermMember = new MockMember(adminUser, mockGuild, [noPerm], []);
            
            // Create high-role target
            const highRole = new MockRole('high', 'High Role', 50, ['ADMINISTRATOR']);
            const highRoleMember = new MockMember(targetUser, mockGuild, [highRole], ['ADMINISTRATOR']);
            
            mockGuild.members.fetch.mockResolvedValue(highRoleMember);

            // Bot admin should be able to moderate despite no Discord permissions
            const banInteraction = new MockInteraction(
                adminUser, mockGuild, mockChannel, 'ban',
                { user: targetUser, reason: 'Bot admin override test' }
            );
            banInteraction.member = noPermMember;

            await ban.execute(banInteraction, adminManager, watchlistManager, moderationLogger);

            expect(mockGuild.members.ban).toHaveBeenCalledWith(
                targetUser.id,
                expect.objectContaining({
                    reason: expect.stringContaining('Bot admin override test')
                })
            );
        });

        test('should prevent self-moderation across all commands', async () => {
            const moderatorRole = new MockRole('mod', 'Moderator', 5, ['KICK_MEMBERS', 'BAN_MEMBERS']);
            const moderatorMember = new MockMember(moderatorUser, mockGuild, [moderatorRole], ['KICK_MEMBERS', 'BAN_MEMBERS']);

            // Test self-kick
            const kickSelfInteraction = new MockInteraction(
                moderatorUser, mockGuild, mockChannel, 'kick',
                { user: moderatorUser, reason: 'Self kick test' }
            );
            kickSelfInteraction.member = moderatorMember;

            await kick.execute(kickSelfInteraction, adminManager, watchlistManager, moderationLogger);

            expect(kickSelfInteraction.reply).toHaveBeenCalledWith(
                expect.objectContaining({
                    content: expect.stringContaining('vous-même'),
                    ephemeral: true
                })
            );

            // Test self-ban
            const banSelfInteraction = new MockInteraction(
                moderatorUser, mockGuild, mockChannel, 'ban',
                { user: moderatorUser, reason: 'Self ban test' }
            );
            banSelfInteraction.member = moderatorMember;

            await ban.execute(banSelfInteraction, adminManager, watchlistManager, moderationLogger);

            expect(banSelfInteraction.reply).toHaveBeenCalledWith(
                expect.objectContaining({
                    content: expect.stringContaining('vous-même'),
                    ephemeral: true
                })
            );

            // Test self-timeout
            const timeoutSelfInteraction = new MockInteraction(
                moderatorUser, mockGuild, mockChannel, 'timeout',
                { user: moderatorUser, duration: '10m', reason: 'Self timeout test' }
            );
            timeoutSelfInteraction.member = moderatorMember;

            await timeout.execute(timeoutSelfInteraction, adminManager, watchlistManager, moderationLogger);

            expect(timeoutSelfInteraction.reply).toHaveBeenCalledWith(
                expect.objectContaining({
                    content: expect.stringContaining('vous-même'),
                    ephemeral: true
                })
            );
        });
    });

    describe('Error Handling and Edge Cases', () => {
        test('should handle Discord API rate limits gracefully', async () => {
            const moderatorRole = new MockRole('mod', 'Moderator', 5, ['MANAGE_MESSAGES']);
            const moderatorMember = new MockMember(moderatorUser, mockGuild, [moderatorRole], ['MANAGE_MESSAGES']);

            // Mock rate limit error
            const rateLimitError = new Error('Rate limited');
            rateLimitError.code = 429;
            rateLimitError.retry_after = 1000;
            
            mockChannel.messages.bulkDelete.mockRejectedValue(rateLimitError);

            const clearInteraction = new MockInteraction(
                moderatorUser, mockGuild, mockChannel, 'clear',
                { count: 10 }
            );
            clearInteraction.member = moderatorMember;

            await clear.execute(clearInteraction, adminManager, watchlistManager, moderationLogger);

            expect(clearInteraction.reply).toHaveBeenCalledWith(
                expect.objectContaining({
                    content: expect.stringContaining('limite de taux'),
                    ephemeral: true
                })
            );
        });

        test('should handle network timeouts during operations', async () => {
            const moderatorRole = new MockRole('mod', 'Moderator', 5, ['BAN_MEMBERS']);
            const moderatorMember = new MockMember(moderatorUser, mockGuild, [moderatorRole], ['BAN_MEMBERS']);
            const targetMember = new MockMember(targetUser, mockGuild);

            // Mock network timeout
            const timeoutError = new Error('Network timeout');
            timeoutError.code = 'ETIMEDOUT';
            
            mockGuild.members.ban.mockRejectedValue(timeoutError);
            mockGuild.members.fetch.mockResolvedValue(targetMember);

            const banInteraction = new MockInteraction(
                moderatorUser, mockGuild, mockChannel, 'ban',
                { user: targetUser, reason: 'Network timeout test' }
            );
            banInteraction.member = moderatorMember;

            await ban.execute(banInteraction, adminManager, watchlistManager, moderationLogger);

            expect(banInteraction.reply).toHaveBeenCalledWith(
                expect.objectContaining({
                    content: expect.stringContaining('erreur'),
                    ephemeral: true
                })
            );
        });

        test('should handle malformed user data', async () => {
            const moderatorRole = new MockRole('mod', 'Moderator', 5, ['KICK_MEMBERS']);
            const moderatorMember = new MockMember(moderatorUser, mockGuild, [moderatorRole], ['KICK_MEMBERS']);

            // Mock malformed user (missing required properties)
            const malformedUser = { id: null, tag: undefined };

            const kickInteraction = new MockInteraction(
                moderatorUser, mockGuild, mockChannel, 'kick',
                { user: malformedUser, reason: 'Malformed user test' }
            );
            kickInteraction.member = moderatorMember;

            await kick.execute(kickInteraction, adminManager, watchlistManager, moderationLogger);

            expect(kickInteraction.reply).toHaveBeenCalledWith(
                expect.objectContaining({
                    content: expect.stringContaining('Utilisateur invalide'),
                    ephemeral: true
                })
            );
        });

        test('should handle concurrent command executions safely', async () => {
            const moderatorRole = new MockRole('mod', 'Moderator', 5, ['KICK_MEMBERS', 'BAN_MEMBERS', 'MODERATE_MEMBERS']);
            const moderatorMember = new MockMember(moderatorUser, mockGuild, [moderatorRole], ['KICK_MEMBERS', 'BAN_MEMBERS', 'MODERATE_MEMBERS']);
            const targetMember = new MockMember(targetUser, mockGuild);

            mockGuild.members.fetch.mockResolvedValue(targetMember);

            // Create multiple concurrent interactions on same user
            const interactions = [
                new MockInteraction(moderatorUser, mockGuild, mockChannel, 'watchlist-add', 
                    { user: targetUser, reason: 'Concurrent test 1', level: 'observe' }),
                new MockInteraction(moderatorUser, mockGuild, mockChannel, 'watchlist-note', 
                    { user: targetUser, note: 'Concurrent note' }),
                new MockInteraction(moderatorUser, mockGuild, mockChannel, 'timeout', 
                    { user: targetUser, duration: '5m', reason: 'Concurrent timeout' })
            ];

            interactions.forEach(interaction => {
                interaction.member = moderatorMember;
            });

            // Execute all concurrently
            const results = await Promise.allSettled([
                watchlistAdd.execute(interactions[0], adminManager, watchlistManager, moderationLogger),
                watchlistNote.execute(interactions[1], adminManager, watchlistManager, moderationLogger),
                timeout.execute(interactions[2], adminManager, watchlistManager, moderationLogger)
            ]);

            // All should complete without throwing
            results.forEach(result => {
                expect(result.status).toBe('fulfilled');
            });

            // Data should be consistent
            const entry = watchlistManager.getWatchlistEntry(targetUser.id, mockGuild.id);
            expect(entry).toBeDefined();
        });
    });

    describe('Integration with Discord API and Bot Systems', () => {
        test('should properly integrate with Discord permission system', async () => {
            // Test with real Discord.js permission flags
            const PERMISSIONS = {
                KICK_MEMBERS: 'KICK_MEMBERS',
                BAN_MEMBERS: 'BAN_MEMBERS',
                MANAGE_MESSAGES: 'MANAGE_MESSAGES',
                MODERATE_MEMBERS: 'MODERATE_MEMBERS'
            };

            const moderatorRole = new MockRole('mod', 'Moderator', 5, [
                PERMISSIONS.KICK_MEMBERS,
                PERMISSIONS.MANAGE_MESSAGES
            ]);
            
            const moderatorMember = new MockMember(
                moderatorUser, 
                mockGuild, 
                [moderatorRole], 
                [PERMISSIONS.KICK_MEMBERS, PERMISSIONS.MANAGE_MESSAGES]
            );

            // Should succeed with KICK_MEMBERS permission
            const kickInteraction = new MockInteraction(
                moderatorUser, mockGuild, mockChannel, 'kick',
                { user: targetUser, reason: 'Permission test' }
            );
            kickInteraction.member = moderatorMember;

            const targetMember = new MockMember(targetUser, mockGuild);
            mockGuild.members.fetch.mockResolvedValue(targetMember);

            await kick.execute(kickInteraction, adminManager, watchlistManager, moderationLogger);

            expect(targetMember.kick).toHaveBeenCalled();

            // Should fail without BAN_MEMBERS permission
            const banInteraction = new MockInteraction(
                moderatorUser, mockGuild, mockChannel, 'ban',
                { user: targetUser, reason: 'Permission test' }
            );
            banInteraction.member = moderatorMember;

            await ban.execute(banInteraction, adminManager, watchlistManager, moderationLogger);

            expect(banInteraction.reply).toHaveBeenCalledWith(
                expect.objectContaining({
                    content: expect.stringContaining('permissions'),
                    ephemeral: true
                })
            );
        });

        test('should handle bot permission edge cases', async () => {
            const moderatorRole = new MockRole('mod', 'Moderator', 5, ['BAN_MEMBERS']);
            const moderatorMember = new MockMember(moderatorUser, mockGuild, [moderatorRole], ['BAN_MEMBERS']);

            // Test bot trying to moderate bot owner/admin
            const botOwnerRole = new MockRole('owner', 'Bot Owner', 100, ['ADMINISTRATOR']);
            const botOwnerMember = new MockMember(
                new MockUser('botowner123', 'BotOwner'),
                mockGuild, [botOwnerRole], ['ADMINISTRATOR']
            );

            mockGuild.members.fetch.mockResolvedValue(botOwnerMember);

            const banInteraction = new MockInteraction(
                moderatorUser, mockGuild, mockChannel, 'ban',
                { user: botOwnerMember.user, reason: 'Bot owner test' }
            );
            banInteraction.member = moderatorMember;

            await ban.execute(banInteraction, adminManager, watchlistManager, moderationLogger);

            expect(banInteraction.reply).toHaveBeenCalledWith(
                expect.objectContaining({
                    content: expect.stringContaining('rôle plus élevé'),
                    ephemeral: true
                })
            );
        });

        test('should integrate properly with guild settings and configurations', async () => {
            // Test with different guild configurations
            const restrictedGuild = new MockGuild('restricted123', 'Restricted Guild');
            const openGuild = new MockGuild('open123', 'Open Guild');

            const moderatorRole = new MockRole('mod', 'Moderator', 5, ['MANAGE_MESSAGES']);
            const moderatorMember = new MockMember(moderatorUser, restrictedGuild, [moderatorRole], ['MANAGE_MESSAGES']);

            // Test clear command with different channel permissions
            const restrictedChannel = new MockChannel('restricted456', 'restricted');
            restrictedChannel.permissionsFor.mockReturnValue({
                has: vi.fn().mockReturnValue(false) // No permissions
            });

            const clearInteraction = new MockInteraction(
                moderatorUser, restrictedGuild, restrictedChannel, 'clear',
                { count: 10 }
            );
            clearInteraction.member = moderatorMember;

            await clear.execute(clearInteraction, adminManager, watchlistManager, moderationLogger);

            // Should handle lack of channel permissions gracefully
            expect(clearInteraction.reply).toHaveBeenCalledWith(
                expect.objectContaining({
                    content: expect.stringContaining('permissions'),
                    ephemeral: true
                })
            );
        });
    });

    describe('Comprehensive Logging and Audit Trail', () => {
        test('should log all moderation actions with complete metadata', async () => {
            const moderatorRole = new MockRole('mod', 'Moderator', 5, ['BAN_MEMBERS']);
            const moderatorMember = new MockMember(moderatorUser, mockGuild, [moderatorRole], ['BAN_MEMBERS']);
            const targetMember = new MockMember(targetUser, mockGuild);

            mockGuild.members.fetch.mockResolvedValue(targetMember);

            // Mock the logging method
            const logSpy = vi.spyOn(moderationLogger, 'logAction').mockResolvedValue();

            const banInteraction = new MockInteraction(
                moderatorUser, mockGuild, mockChannel, 'ban',
                { user: targetUser, reason: 'Comprehensive logging test', delete_days: 3 }
            );
            banInteraction.member = moderatorMember;

            await ban.execute(banInteraction, adminManager, watchlistManager, moderationLogger);

            expect(logSpy).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: 'ban',
                    moderatorId: moderatorUser.id,
                    moderatorTag: moderatorUser.tag,
                    targetId: targetUser.id,
                    targetTag: targetUser.tag,
                    guildId: mockGuild.id,
                    guildName: mockGuild.name,
                    channelId: mockChannel.id,
                    reason: 'Comprehensive logging test',
                    timestamp: expect.any(Number),
                    success: true,
                    metadata: expect.objectContaining({
                        deleteMessageDays: 3
                    })
                })
            );
        });

        test('should log failed operations with error details', async () => {
            const moderatorRole = new MockRole('mod', 'Moderator', 5, ['KICK_MEMBERS']);
            const moderatorMember = new MockMember(moderatorUser, mockGuild, [moderatorRole], ['KICK_MEMBERS']);

            // Mock fetch failure
            const fetchError = new Error('User not found');
            fetchError.code = 10007;
            mockGuild.members.fetch.mockRejectedValue(fetchError);

            const logSpy = vi.spyOn(moderationLogger, 'logAction').mockResolvedValue();

            const kickInteraction = new MockInteraction(
                moderatorUser, mockGuild, mockChannel, 'kick',
                { user: targetUser, reason: 'Error logging test' }
            );
            kickInteraction.member = moderatorMember;

            await kick.execute(kickInteraction, adminManager, watchlistManager, moderationLogger);

            expect(logSpy).toHaveBeenCalledWith(
                expect.objectContaining({
                    type: 'kick',
                    success: false,
                    error: expect.objectContaining({
                        message: 'User not found',
                        code: 10007
                    })
                })
            );
        });

        test('should maintain audit trail across related operations', async () => {
            const moderatorRole = new MockRole('mod', 'Moderator', 5, ['KICK_MEMBERS', 'BAN_MEMBERS']);
            const moderatorMember = new MockMember(moderatorUser, mockGuild, [moderatorRole], ['KICK_MEMBERS', 'BAN_MEMBERS']);
            const targetMember = new MockMember(targetUser, mockGuild);

            mockGuild.members.fetch.mockResolvedValue(targetMember);

            const logSpy = vi.spyOn(moderationLogger, 'logAction').mockResolvedValue();

            // Sequence of related actions
            const actions = [
                { command: watchlistAdd, type: 'watchlist-add', options: { user: targetUser, reason: 'Initial surveillance', level: 'alert' }},
                { command: watchlistNote, type: 'watchlist-note', options: { user: targetUser, note: 'Escalating behavior' }},
                { command: kick, type: 'kick', options: { user: targetUser, reason: 'First warning' }},
                { command: ban, type: 'ban', options: { user: targetUser, reason: 'Continued violations' }}
            ];

            for (const action of actions) {
                const interaction = new MockInteraction(
                    moderatorUser, mockGuild, mockChannel, action.type, action.options
                );
                interaction.member = moderatorMember;

                await action.command.execute(interaction, adminManager, watchlistManager, moderationLogger);
            }

            // Should have logged all actions
            expect(logSpy).toHaveBeenCalledTimes(4);

            // Each log should reference the same target user
            const logCalls = logSpy.mock.calls;
            logCalls.forEach(call => {
                expect(call[0].targetId).toBe(targetUser.id);
                expect(call[0].guildId).toBe(mockGuild.id);
                expect(call[0].moderatorId).toBe(moderatorUser.id);
            });
        });
    });

    describe('Performance and Scalability', () => {
        test('should handle bulk operations efficiently', async () => {
            const moderatorRole = new MockRole('mod', 'Moderator', 5, ['MANAGE_MESSAGES']);
            const moderatorMember = new MockMember(moderatorUser, mockGuild, [moderatorRole], ['MANAGE_MESSAGES']);

            // Mock large number of messages
            const mockMessages = new Map();
            for (let i = 0; i < 100; i++) {
                mockMessages.set(`msg${i}`, {
                    id: `msg${i}`,
                    createdTimestamp: Date.now() - (i * 1000),
                    author: { id: `user${i}` }
                });
            }

            mockChannel.messages.fetch.mockResolvedValue(mockMessages);
            mockChannel.messages.bulkDelete.mockResolvedValue(mockMessages);

            const clearInteraction = new MockInteraction(
                moderatorUser, mockGuild, mockChannel, 'clear',
                { count: 100 }
            );
            clearInteraction.member = moderatorMember;

            const startTime = Date.now();
            await clear.execute(clearInteraction, adminManager, watchlistManager, moderationLogger);
            const endTime = Date.now();

            // Should complete efficiently
            expect(endTime - startTime).toBeLessThan(3000);
            expect(mockChannel.messages.bulkDelete).toHaveBeenCalled();
        });

        test('should handle high-frequency command execution', async () => {
            const moderatorRole = new MockRole('mod', 'Moderator', 5, ['KICK_MEMBERS']);
            const moderatorMember = new MockMember(moderatorUser, mockGuild, [moderatorRole], ['KICK_MEMBERS']);

            // Create multiple users for rapid-fire operations
            const users = Array.from({ length: 20 }, (_, i) => 
                new MockUser(`rapid${i}`, `RapidUser${i}`)
            );

            const members = users.map(user => new MockMember(user, mockGuild));
            
            // Mock fetch to return appropriate member
            mockGuild.members.fetch.mockImplementation(userId => {
                const member = members.find(m => m.id === userId);
                return Promise.resolve(member);
            });

            const startTime = Date.now();

            // Execute rapid-fire kick commands
            const promises = users.map(user => {
                const interaction = new MockInteraction(
                    moderatorUser, mockGuild, mockChannel, 'kick',
                    { user, reason: `Rapid kick ${user.id}` }
                );
                interaction.member = moderatorMember;
                
                return kick.execute(interaction, adminManager, watchlistManager, moderationLogger);
            });

            await Promise.all(promises);
            const endTime = Date.now();

            // Should handle all operations efficiently
            expect(endTime - startTime).toBeLessThan(5000);
            
            // All kicks should have been executed
            members.forEach(member => {
                expect(member.kick).toHaveBeenCalled();
            });
        });
    });
});