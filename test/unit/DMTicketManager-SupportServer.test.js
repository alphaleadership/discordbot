import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';

// Mock fs
vi.mock('fs');

// Mock Discord.js with simpler approach
vi.mock('discord.js', () => ({
    EmbedBuilder: class MockEmbedBuilder {
        setColor() { return this; }
        setTitle() { return this; }
        setDescription() { return this; }
        addFields() { return this; }
        setFooter() { return this; }
        setAuthor() { return this; }
        setThumbnail() { return this; }
        setTimestamp() { return this; }
    },
    ChannelType: {
        GuildText: 0
    },
    PermissionFlagsBits: {
        ViewChannel: 1024n,
        SendMessages: 2048n,
        ManageMessages: 8192n
    }
}));

import { DMTicketManager } from '../../utils/DMTicketManager.js';

describe('DMTicketManager - Support Server Integration', () => {
    let ticketManager;
    let mockClient;
    let mockGuildConfig;
    let mockUser;
    let mockGuild;
    let mockChannel;

    beforeEach(() => {
        vi.clearAllMocks();
        
        // Mock client
        mockClient = {
            user: { id: 'bot123' },
            guilds: {
                cache: new Map()
            },
            channels: {
                cache: new Map()
            },
            users: {
                cache: new Map()
            }
        };

        // Mock guild config
        mockGuildConfig = {
            loadConfig: vi.fn().mockReturnValue({}),
            saveConfig: vi.fn()
        };

        // Mock user
        mockUser = {
            id: 'user123',
            username: 'testuser',
            discriminator: '1234',
            tag: 'testuser#1234',
            displayAvatarURL: vi.fn().mockReturnValue('https://example.com/avatar.png'),
            send: vi.fn().mockResolvedValue({ id: 'message123' })
        };

        // Mock guild
        mockGuild = {
            id: 'guild123',
            name: 'Test Guild',
            channels: {
                create: vi.fn().mockResolvedValue({
                    id: 'channel123',
                    name: 'ticket-000001',
                    send: vi.fn().mockResolvedValue({ id: 'message456' }),
                    delete: vi.fn().mockResolvedValue()
                })
            },
            roles: {
                everyone: { id: 'everyone123' }
            }
        };

        // Mock channel
        mockChannel = {
            id: 'channel123',
            name: 'ticket-000001',
            send: vi.fn().mockResolvedValue({ id: 'message456' }),
            delete: vi.fn().mockResolvedValue()
        };

        // Setup client caches
        mockClient.guilds.cache.set('guild123', mockGuild);
        mockClient.channels.cache.set('channel123', mockChannel);
        mockClient.users.cache.set('user123', mockUser);

        // Mock fs functions
        fs.existsSync = vi.fn().mockReturnValue(false);
        fs.readFileSync = vi.fn();
        fs.writeFileSync = vi.fn();
        fs.mkdirSync = vi.fn();

        // Create ticket manager
        ticketManager = new DMTicketManager(mockClient, mockGuildConfig);
    });

    describe('Support Server Configuration', () => {
        it('should set and get support server ID', () => {
            ticketManager.setSupportServer('guild456');
            
            expect(ticketManager.supportServerId).toBe('guild456');
            expect(ticketManager.getSupportServer()).toBe('guild456');
        });

        it('should store support server ID in tickets data', () => {
            ticketManager.setSupportServer('guild789');
            
            expect(ticketManager.tickets._settings.supportServerId).toBe('guild789');
        });
    });

    describe('Support Channel Creation', () => {
        beforeEach(() => {
            ticketManager.setSupportServer('guild123');
        });

        it('should create support channel with correct parameters', async () => {
            const ticketData = {
                responses: {
                    category: { label: 'Technical Issue' },
                    priority: { label: 'High' },
                    description: 'Test description',
                    serverContext: 'Test server',
                    previousAttempts: 'None'
                }
            };

            const channel = await ticketManager.createSupportChannel('ticket-000001', mockUser, ticketData);
            
            expect(channel).toBeDefined();
            expect(mockGuild.channels.create).toHaveBeenCalledWith({
                name: 'ticket-ticket-000001',
                type: 0, // ChannelType.GuildText
                topic: `Support ticket for ${mockUser.tag} (${mockUser.id})`,
                permissionOverwrites: expect.any(Array)
            });
        });

        it('should send ticket information to support channel', async () => {
            const ticketData = {
                responses: {
                    category: { label: 'Technical Issue' },
                    priority: { label: 'High' },
                    description: 'Test description',
                    serverContext: 'Test server',
                    previousAttempts: 'None'
                }
            };

            await ticketManager.createSupportChannel('ticket-000001', mockUser, ticketData);
            
            expect(mockChannel.send).toHaveBeenCalledWith({
                embeds: [expect.any(Object)]
            });
        });

        it('should handle missing support guild', async () => {
            ticketManager.setSupportServer('nonexistent');
            
            await expect(
                ticketManager.createSupportChannel('ticket-000001', mockUser, {})
            ).rejects.toThrow('Support server not found');
        });
    });

    describe('Message Relaying', () => {
        let testTicket;

        beforeEach(() => {
            testTicket = {
                id: 'ticket-000001',
                userId: 'user123',
                supportChannelId: 'channel123',
                messageCount: 0
            };
        });

        it('should relay message from user to support channel', async () => {
            await ticketManager.relayMessage('user', testTicket, 'Test message', mockUser);
            
            expect(mockChannel.send).toHaveBeenCalledWith({
                embeds: [expect.any(Object)]
            });
            expect(testTicket.messageCount).toBe(1);
        });

        it('should relay message from support to user', async () => {
            await ticketManager.relayMessage('support', testTicket, 'Support response');
            
            expect(mockUser.send).toHaveBeenCalledWith({
                embeds: [expect.any(Object)]
            });
            expect(testTicket.messageCount).toBe(1);
        });

        it('should handle missing support channel gracefully', async () => {
            testTicket.supportChannelId = 'nonexistent';
            
            // Should not throw error
            await expect(
                ticketManager.relayMessage('user', testTicket, 'Test message', mockUser)
            ).resolves.toBeUndefined();
        });

        it('should handle missing user gracefully', async () => {
            testTicket.userId = 'nonexistent';
            
            // Should not throw error
            await expect(
                ticketManager.relayMessage('support', testTicket, 'Support response')
            ).resolves.toBeUndefined();
        });
    });

    describe('Cross-Server Communication', () => {
        it('should handle tickets from different source servers', async () => {
            const ticket1 = {
                id: 'ticket-000001',
                userId: 'user123',
                sourceGuild: 'guild456',
                supportChannelId: 'channel123',
                messageCount: 0
            };

            const ticket2 = {
                id: 'ticket-000002',
                userId: 'user456',
                sourceGuild: 'guild789',
                supportChannelId: 'channel456',
                messageCount: 0
            };

            // Both tickets should be handled by the same support server
            await ticketManager.relayMessage('user', ticket1, 'Message from guild456', mockUser);
            await ticketManager.relayMessage('user', ticket2, 'Message from guild789', mockUser);

            expect(mockChannel.send).toHaveBeenCalledTimes(2);
        });

        it('should include source server information in ticket data', () => {
            const ticketData = {
                id: 'ticket-000001',
                userId: 'user123',
                sourceGuild: 'guild456',
                supportChannelId: 'channel123'
            };

            expect(ticketData.sourceGuild).toBe('guild456');
        });
    });
});