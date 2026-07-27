import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CustomsManager } from '../utils/managers/CustomsManager.js';
import { EmbedBuilder } from 'discord.js';

describe('CustomsManager', () => {
    let mockClient;
    let mockGuildConfig;
    let mockReportManager;
    let mockMember;
    let mockPartnerGuild;
    let mockPartnerMember;
    let mockTargetGuild;
    let customsManager;

    beforeEach(() => {
        vi.clearAllMocks();

        // Setup mock warning manager
        const mockWarnManager = {
            getWarns: vi.fn().mockReturnValue([])
        };

        // Setup mock partner member
        mockPartnerMember = {
            id: '123456',
            joinedTimestamp: Date.now() - (5 * 24 * 60 * 60 * 1000), // 5 days ago
            roles: {
                cache: {
                    has: vi.fn().mockReturnValue(true)
                }
            }
        };

        // Setup mock partner guild
        mockPartnerGuild = {
            id: 'partner-guild-123',
            name: 'Partner Server',
            members: {
                fetch: vi.fn().mockResolvedValue(mockPartnerMember)
            }
        };

        // Setup mock client
        mockClient = {
            guilds: {
                cache: {
                    get: vi.fn().mockReturnValue(mockPartnerGuild),
                    find: vi.fn().mockImplementation((fn) => {
                        const guildsList = [mockPartnerGuild];
                        if (mockTargetGuild) guildsList.push(mockTargetGuild);
                        return guildsList.find(fn);
                    })
                }
            },
            warnManager: mockWarnManager
        };

        // Setup mock guild config
        mockGuildConfig = {
            getCustomsConfig: vi.fn().mockReturnValue({
                enabled: true,
                partnerGuildId: 'partner-guild-123',
                requiredRoleId: 'role-vip-123',
                minAccountAgeDays: 2,
                minGuildJoinDays: 3,
                maxWarnings: 3,
                actionOnFail: 'quarantine',
                quarantineRoleId: 'quarantine-role-456',
                logChannelId: 'log-channel-789',
                bypassRoles: []
            }),
            getQuarantineSettings: vi.fn().mockReturnValue(null),
            updateCustomsConfig: vi.fn(),
            loadConfig: vi.fn().mockReturnValue({})
        };

        // Setup mock report manager
        mockReportManager = {};

        // Setup mock member to verify
        const logChannelSendMock = vi.fn().mockResolvedValue({});
        mockMember = {
            id: '123456',
            user: {
                id: '123456',
                tag: 'testuser#1234',
                createdTimestamp: Date.now() - (10 * 24 * 60 * 60 * 1000) // 10 days ago
            },
            guild: {
                id: 'target-guild-789',
                name: 'Main Server',
                roles: {
                    cache: {
                        find: vi.fn().mockReturnValue({ id: 'quarantine-role-456' })
                    }
                },
                channels: {
                    cache: {
                        get: vi.fn().mockReturnValue({
                            send: logChannelSendMock
                        })
                    }
                }
            },
            roles: {
                cache: {
                    some: vi.fn().mockReturnValue(false)
                },
                add: vi.fn().mockResolvedValue({})
            },
            kick: vi.fn().mockResolvedValue({}),
            ban: vi.fn().mockResolvedValue({}),
            send: vi.fn().mockResolvedValue({})
        };

        customsManager = new CustomsManager(mockClient, mockGuildConfig, mockReportManager);
    });

    it('should allow user if all conditions are met', async () => {
        const result = await customsManager.verifyMemberJoin(mockMember);
        
        expect(result.success).toBe(true);
        expect(mockMember.roles.add).not.toHaveBeenCalled();
        expect(mockMember.kick).not.toHaveBeenCalled();
    });

    it('should skip check if customs system is disabled', async () => {
        mockGuildConfig.getCustomsConfig.mockReturnValue({ enabled: false });
        
        const result = await customsManager.verifyMemberJoin(mockMember);
        
        expect(result.skipped).toBe(true);
    });

    it('should quarantine user if not present on partner guild', async () => {
        mockPartnerGuild.members.fetch.mockRejectedValue(new Error('Member not found'));

        const result = await customsManager.verifyMemberJoin(mockMember);
        
        expect(result.success).toBe(false);
        expect(result.actionTaken).toBe('Mis en quarantaine');
        expect(mockMember.roles.add).toHaveBeenCalledWith('quarantine-role-456', expect.any(String));
    });

    it('should kick user if required role is missing and action is kick', async () => {
        mockGuildConfig.getCustomsConfig.mockReturnValue({
            enabled: true,
            partnerGuildId: 'partner-guild-123',
            requiredRoleId: 'role-vip-123',
            actionOnFail: 'kick'
        });
        mockPartnerMember.roles.cache.has.mockReturnValue(false);

        const result = await customsManager.verifyMemberJoin(mockMember);
        
        expect(result.success).toBe(false);
        expect(result.actionTaken).toBe('Expulsé');
        expect(mockMember.kick).toHaveBeenCalled();
    });

    it('should ban user if warnings exceed limit and action is ban', async () => {
        mockGuildConfig.getCustomsConfig.mockReturnValue({
            enabled: true,
            partnerGuildId: 'partner-guild-123',
            maxWarnings: 2,
            actionOnFail: 'ban'
        });
        mockClient.warnManager.getWarns.mockReturnValue([{}, {}, {}]); // 3 warnings (max 2)

        const result = await customsManager.verifyMemberJoin(mockMember);
        
        expect(result.success).toBe(false);
        expect(result.actionTaken).toBe('Banni');
        expect(mockMember.ban).toHaveBeenCalled();
    });

    describe('verifyMemberPassport', () => {
        beforeEach(() => {
            mockTargetGuild = {
                id: 'target-guild-789',
                name: 'Destination Server',
                rulesChannel: {
                    createInvite: vi.fn().mockResolvedValue({ url: 'https://discord.gg/test-rules-invite' })
                },
                members: {
                    me: {}
                },
                channels: {
                    cache: {
                        find: vi.fn(),
                        get: vi.fn().mockReturnValue({
                            send: vi.fn().mockResolvedValue({})
                        })
                    }
                },
                client: mockClient
            };
            mockPartnerGuild.members.cache = {
                has: vi.fn().mockReturnValue(true)
            };
            mockClient.guilds.cache.get.mockImplementation((id) => {
                if (id === 'partner-guild-123') return mockPartnerGuild;
                if (id === 'target-guild-789') return mockTargetGuild;
                return null;
            });
        });

        it('should return invite link if passport requirements are met', async () => {
            const mockUser = {
                id: '123456',
                tag: 'passportuser#1234',
                createdTimestamp: Date.now() - (15 * 24 * 60 * 60 * 1000)
            };

            const result = await customsManager.verifyMemberPassport('target-guild-789', mockUser);
            
            expect(result.success).toBe(true);
            expect(result.inviteUrl).toBe('https://discord.gg/test-rules-invite');
            expect(mockTargetGuild.rulesChannel.createInvite).toHaveBeenCalledWith({
                maxAge: 3600,
                maxUses: 1,
                unique: true,
                reason: expect.any(String)
            });
        });

        it('should fail if required role is missing on partner server', async () => {
            const mockUser = {
                id: '123456',
                tag: 'passportuser#1234',
                createdTimestamp: Date.now() - (15 * 24 * 60 * 60 * 1000)
            };
            mockPartnerMember.roles.cache.has.mockReturnValue(false);

            const result = await customsManager.verifyMemberPassport('target-guild-789', mockUser);
            
            expect(result.success).toBe(false);
            expect(result.reason).toContain('rôle requis');
        });
    });
});
