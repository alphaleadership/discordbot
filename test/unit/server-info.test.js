import { describe, test, expect, vi } from 'vitest';

// Mock Discord.js properly
vi.mock('discord.js', () => {
    const mockBuilder = {
        setName: vi.fn().mockReturnThis(),
        setDescription: vi.fn().mockReturnThis(),
        addStringOption: vi.fn().mockReturnThis(),
        setRequired: vi.fn().mockReturnThis()
    };

    return {
        SlashCommandBuilder: vi.fn(() => mockBuilder),
        EmbedBuilder: vi.fn(() => ({
            setColor: vi.fn().mockReturnThis(),
            setTitle: vi.fn().mockReturnThis(),
            setDescription: vi.fn().mockReturnThis(),
            setThumbnail: vi.fn().mockReturnThis(),
            addFields: vi.fn().mockReturnThis(),
            setFooter: vi.fn().mockReturnThis(),
            setTimestamp: vi.fn().mockReturnThis(),
            setImage: vi.fn().mockReturnThis(),
            data: {}
        })),
        ChannelType: {
            GuildText: 0,
            GuildVoice: 2,
            GuildCategory: 4
        }
    };
});

describe('Server Info Command', () => {
    test('should be importable and have correct structure', async () => {
        const serverInfoCommand = await import('../../commands/server-info.js');

        expect(serverInfoCommand.default).toBeDefined();
        expect(serverInfoCommand.default.data).toBeDefined();
        expect(serverInfoCommand.default.execute).toBeDefined();
        expect(typeof serverInfoCommand.default.execute).toBe('function');
    });

    test('should execute and return server info', async () => {
        const serverInfoCommand = await import('../../commands/server-info.js');

        const mockGuild = {
            id: 'test-guild-123',
            name: 'Test Guild',
            ownerId: 'owner-id-123',
            memberCount: 150,
            createdTimestamp: Date.now(),
            roles: {
                cache: { size: 5 }
            },
            channels: {
                fetch: vi.fn().mockResolvedValue({
                    filter: () => ({ size: 2 }),
                    size: 6
                })
            },
            iconURL: vi.fn().mockReturnValue('http://icon.url'),
            bannerURL: vi.fn().mockReturnValue('http://banner.url'),
            description: 'Test description',
            members: {
                fetch: vi.fn().mockResolvedValue({
                    id: 'owner-id-123',
                    user: { tag: 'OwnerTag#1234', id: 'owner-id-123' }
                })
            }
        };

        const mockInteraction = {
            guild: mockGuild,
            user: {
                tag: 'UserTag#5678',
                displayAvatarURL: vi.fn().mockReturnValue('http://avatar.url')
            },
            options: {
                getString: vi.fn().mockReturnValue(null)
            },
            reply: vi.fn().mockResolvedValue(true)
        };

        const mockGuildConfig = {
            config: {
                'test-guild-123': {
                    logChannelId: 'log-channel-id',
                    announcementChannelId: 'ann-channel-id',
                    antiInvite: { enabled: true },
                    charLimit: 2000,
                    raidDetection: { enabled: true },
                    doxDetection: { enabled: false },
                    watchlist: { enabled: true },
                    funCommands: { enabled: true },
                    honeypot: { enabled: true, channelId: 'honeypot-channel-id' },
                    telegram: { bridgeEnabled: true, notificationsEnabled: false }
                }
            }
        };

        await serverInfoCommand.default.execute(
            mockInteraction,
            {}, // adminManager
            {}, // warnManager
            mockGuildConfig
        );

        expect(mockInteraction.reply).toHaveBeenCalled();
    });
});
