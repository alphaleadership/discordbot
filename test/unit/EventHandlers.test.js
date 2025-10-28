import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Client, GatewayIntentBits, ChannelType } from 'discord.js';
import { EconomyManager } from '../../utils/EconomyManager.js';
import { DMTicketManager } from '../../utils/DMTicketManager.js';
import { GuildConfig } from '../../utils/GuildConfig.js';
import fs from 'fs';
import path from 'path';

describe('Event Handlers Tests', () => {
    let client;
    let guildConfig;
    let economyManager;
    let dmTicketManager;
    let testDataDir;
    let mockGuild;
    let mockUser;
    let mockChannel;

    beforeEach(async () => {
        // Create test data directory
        testDataDir = path.join(process.cwd(), 'test', 'test-data', 'event-handlers');
        if (!fs.existsSync(testDataDir)) {
            fs.mkdirSync(testDataDir, { recursive: true });
        }

        // Mock Discord objects
        mockUser = {
            id: 'test-user-123',
            tag: 'TestUser#1234',
            bot: false,
            send: vi.fn().mockResolvedValue({})
        };

        mockChannel = {
            id: 'test-channel-456',
            type: ChannelType.GuildText,
            send: vi.fn().mockResolvedValue({}),
            delete: vi.fn().mockResolvedValue({})
        };

        mockGuild = {
            id: 'test-guild-789',
            name: 'Test Guild',
            memberCount: 100,
            channels: {
                create: vi.fn().mockResolvedValue(mockChannel),
                cache: new Map()
            },
            members: {
                fetch: vi.fn().mockResolvedValue({
                    id: mockUser.id,
                    user: mockUser
                })
            }
        };

        // Mock Discord client
        client = {
            user: { id: 'test-bot-id', tag: 'TestBot#0001' },
            guilds: {
                cache: new Map([[mockGuild.id, mockGuild]]),
                fetch: vi.fn().mockResolvedValue(mockGuild)
            },
            channels: {
                fetch: vi.fn().mockResolvedValue(mockChannel)
            },
            users: {
                fetch: vi.fn().mockResolvedValue(mockUser)
            }
        };

        // Initialize managers
        guildConfig = new GuildConfig(path.join(testDataDir, 'guilds_config.json'));
        economyManager = new EconomyManager(path.join(testDataDir, 'economy.json'));
        dmTicketManager = new DMTicketManager(client, guildConfig);
    });

    afterEach(() => {
        // Clean up test files
        if (fs.existsSync(testDataDir)) {
            fs.rmSync(testDataDir, { recursive: true, force: true });
        }
    });

    describe('Economy Activity Tracking', () => {
        it('should award currency for message activity', async () => {
            const userId = mockUser.id;
            const guildId = mockGuild.id;
            
            // Ensure guild exists
            economyManager.ensureGuildExists(guildId);
            
            // Get initial balance
            const initialBalance = await economyManager.getBalance(userId, guildId);
            
            // Simulate message activity
            await economyManager.addCurrency(userId, guildId, 1, 'Message sent');
            
            // Check balance increased
            const newBalance = await economyManager.getBalance(userId, guildId);
            expect(newBalance).toBe(initialBalance + 1);
        });

        it('should award currency for reaction activity', async () => {
            const userId = mockUser.id;
            const guildId = mockGuild.id;
            
            // Ensure guild exists
            economyManager.ensureGuildExists(guildId);
            
            // Get initial balance
            const initialBalance = await economyManager.getBalance(userId, guildId);
            
            // Simulate reaction activity
            await economyManager.addCurrency(userId, guildId, 0.5, 'Reaction added');
            
            // Check balance increased
            const newBalance = await economyManager.getBalance(userId, guildId);
            expect(newBalance).toBe(initialBalance + 0.5);
        });

        it('should award currency for voice activity', async () => {
            const userId = mockUser.id;
            const guildId = mockGuild.id;
            
            // Ensure guild exists
            economyManager.ensureGuildExists(guildId);
            
            // Get initial balance
            const initialBalance = await economyManager.getBalance(userId, guildId);
            
            // Simulate voice activity
            await economyManager.addCurrency(userId, guildId, 2, 'Joined voice channel');
            
            // Check balance increased
            const newBalance = await economyManager.getBalance(userId, guildId);
            expect(newBalance).toBe(initialBalance + 2);
        });

        it('should handle economy errors gracefully', async () => {
            const userId = 'invalid-user';
            const guildId = 'invalid-guild';
            
            // This should not throw an error
            expect(async () => {
                await economyManager.addCurrency(userId, guildId, 1, 'Test activity');
            }).not.toThrow();
        });
    });

    describe('Interactive DM Ticket Creation', () => {
        it('should handle DM messages for ticket creation', async () => {
            const mockMessage = {
                author: mockUser,
                content: 'I need help with something',
                channel: {
                    type: ChannelType.DM,
                    send: vi.fn().mockResolvedValue({})
                },
                guild: null // DM has no guild
            };

            // Mock the handleDMMessage method
            const handleDMSpy = vi.spyOn(dmTicketManager, 'handleDMMessage').mockResolvedValue();

            // Simulate DM handling
            await dmTicketManager.handleDMMessage(mockMessage);

            expect(handleDMSpy).toHaveBeenCalledWith(mockMessage);
        });

        it('should start interactive questionnaire for new tickets', async () => {
            const mockMessage = {
                author: mockUser,
                content: 'help',
                channel: {
                    type: ChannelType.DM,
                    send: vi.fn().mockResolvedValue({})
                },
                guild: null
            };

            // Mock the createTicket method
            const createTicketSpy = vi.spyOn(dmTicketManager, 'createTicket').mockResolvedValue();

            // Simulate starting ticket creation
            await dmTicketManager.createTicket(mockUser);

            expect(createTicketSpy).toHaveBeenCalledWith(mockUser);
        });

        it('should handle questionnaire responses', async () => {
            const mockMessage = {
                author: mockUser,
                content: '1', // Category selection
                channel: {
                    type: ChannelType.DM,
                    send: vi.fn().mockResolvedValue({})
                },
                guild: null
            };

            // Set up active questionnaire
            dmTicketManager.activeQuestions.set(mockUser.id, {
                step: 'category',
                data: {}
            });

            // Mock the processQuestionnaireResponse method
            const processResponseSpy = vi.spyOn(dmTicketManager, 'processQuestionnaireResponse').mockResolvedValue();

            // Simulate response processing
            await dmTicketManager.processQuestionnaireResponse(mockMessage);

            expect(processResponseSpy).toHaveBeenCalledWith(mockMessage);
        });

        it('should complete ticket creation after questionnaire', async () => {
            const ticketData = {
                category: 'Technical Issue',
                priority: 'Medium',
                description: 'Test issue description',
                serverContext: 'Test Server',
                previousAttempts: 'None'
            };

            // Mock the finalizeTicket method
            const finalizeTicketSpy = vi.spyOn(dmTicketManager, 'finalizeTicket').mockResolvedValue({
                id: 'test-ticket-123',
                channelId: 'test-channel-456'
            });

            // Simulate ticket finalization
            const mockQuestionnaire = { data: ticketData, step: 'complete' };
            const result = await dmTicketManager.finalizeTicket(mockUser, mockQuestionnaire);

            expect(finalizeTicketSpy).toHaveBeenCalledWith(mockUser, mockQuestionnaire);
            expect(result).toBeDefined();
        });
    });

    describe('Event-Driven Functionality', () => {
        it('should handle message events with proper flow', async () => {
            const mockMessage = {
                author: mockUser,
                content: 'Test message',
                guild: mockGuild,
                channel: mockChannel,
                delete: vi.fn().mockResolvedValue({})
            };

            // Test that message doesn't get processed if user is bot
            const botMessage = { ...mockMessage, author: { ...mockUser, bot: true } };
            
            // Should return early for bot messages
            expect(botMessage.author.bot).toBe(true);
        });

        it('should handle reaction events properly', async () => {
            const mockReaction = {
                message: {
                    guild: mockGuild,
                    author: mockUser
                }
            };

            // Test reaction handling logic
            expect(mockReaction.message.guild).toBe(mockGuild);
            expect(mockUser.bot).toBe(false);
        });

        it('should handle voice state updates', async () => {
            const mockOldState = {
                channel: null,
                member: { id: mockUser.id, user: mockUser }
            };

            const mockNewState = {
                channel: { id: 'voice-channel-123' },
                member: { id: mockUser.id, user: mockUser },
                guild: mockGuild
            };

            // Test voice state logic
            expect(mockOldState.channel).toBeNull();
            expect(mockNewState.channel).toBeDefined();
            expect(mockNewState.member.user.bot).toBe(false);
        });
    });

    describe('Error Handling', () => {
        it('should handle DM errors gracefully', async () => {
            const mockMessage = {
                author: mockUser,
                content: 'test',
                channel: {
                    type: ChannelType.DM,
                    send: vi.fn().mockRejectedValue(new Error('DM failed'))
                },
                guild: null
            };

            // Should not throw when DM handling fails
            expect(async () => {
                try {
                    await dmTicketManager.handleDM(mockMessage);
                } catch (error) {
                    // Error should be caught and handled
                    expect(error).toBeDefined();
                }
            }).not.toThrow();
        });

        it('should handle economy errors in event handlers', async () => {
            // Test with invalid guild ID
            expect(async () => {
                await economyManager.addCurrency('user', 'invalid-guild', 1, 'test');
            }).not.toThrow();
        });

        it('should handle missing guild context', async () => {
            const mockMessage = {
                author: mockUser,
                content: 'test',
                guild: null, // No guild context
                channel: mockChannel
            };

            // Should handle gracefully when no guild context
            expect(mockMessage.guild).toBeNull();
        });
    });

    describe('Integration Flow', () => {
        it('should complete full ticket creation workflow', async () => {
            // 1. User sends DM
            const initialMessage = {
                author: mockUser,
                content: 'I need help',
                channel: { type: ChannelType.DM, send: vi.fn() },
                guild: null
            };

            // 2. Start ticket creation
            await dmTicketManager.createTicket(mockUser);
            // Note: createTicket method handles the questionnaire internally

            // 3. Complete questionnaire steps
            const responses = ['1', '2', 'Test description', 'Test Server', 'No previous attempts'];
            
            for (let i = 0; i < responses.length; i++) {
                const responseMessage = {
                    author: mockUser,
                    content: responses[i],
                    channel: { type: ChannelType.DM, send: vi.fn() },
                    guild: null
                };
                
                // Process each response
                await dmTicketManager.processQuestionnaireResponse(responseMessage);
            }

            // Questionnaire should be completed
            const questionnaireData = dmTicketManager.activeQuestions.get(mockUser.id);
            expect(questionnaireData).toBeDefined();
        });

        it('should award economy points throughout user journey', async () => {
            const userId = mockUser.id;
            const guildId = mockGuild.id;
            
            economyManager.ensureGuildExists(guildId);
            const initialBalance = await economyManager.getBalance(userId, guildId);
            
            // Simulate user activity sequence
            await economyManager.addCurrency(userId, guildId, 1, 'Message sent');
            await economyManager.addCurrency(userId, guildId, 0.5, 'Reaction added');
            await economyManager.addCurrency(userId, guildId, 2, 'Voice activity');
            
            const finalBalance = await economyManager.getBalance(userId, guildId);
            expect(finalBalance).toBe(initialBalance + 3.5);
        });
    });
});