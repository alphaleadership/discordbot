import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';

// Mock Discord.js before importing DMTicketManager
vi.mock('discord.js', async () => {
    class MockEmbedBuilder {
        setColor() { return this; }
        setTitle() { return this; }
        setDescription() { return this; }
        addFields() { return this; }
        setFooter() { return this; }
        setAuthor() { return this; }
        setThumbnail() { return this; }
        setTimestamp() { return this; }
    }
    
    return {
        EmbedBuilder: MockEmbedBuilder,
        ChannelType: {
            GuildText: 0
        },
        PermissionFlagsBits: {
            ViewChannel: 1024n,
            SendMessages: 2048n,
            ManageMessages: 8192n,
            ManageChannels: 16n,
            EmbedLinks: 16384n,
            AttachFiles: 32768n
        }
    };
});

// Mock fs
vi.mock('fs');

import { DMTicketManager } from '../../utils/DMTicketManager.js';

describe('DMTicketManager - Interactive Questionnaire System', () => {
    let ticketManager;
    let mockClient;
    let mockGuildConfig;
    let mockUser;
    let mockGuild;
    let mockChannel;
    let testDataPath;

    beforeEach(() => {
        // Reset all mocks
        vi.clearAllMocks();
        
        // Setup test data path
        testDataPath = path.join(process.cwd(), 'data/test-tickets.json');
        
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
        
        // Add filter method to guilds cache
        mockClient.guilds.cache.filter = vi.fn().mockReturnValue(new Map());

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

        // Mock guild with bot member
        const mockBotMember = {
            permissions: {
                has: vi.fn().mockReturnValue(true)
            }
        };

        mockGuild = {
            id: 'guild123',
            name: 'Test Guild',
            members: {
                cache: new Map([['bot123', mockBotMember]])
            },
            channels: {
                create: vi.fn().mockResolvedValue({
                    id: 'channel123',
                    name: 'ticket-000001',
                    send: vi.fn().mockResolvedValue({ id: 'message456' }),
                    delete: vi.fn().mockResolvedValue(),
                    permissionOverwrites: {
                        create: vi.fn().mockResolvedValue()
                    }
                })
            },
            roles: {
                everyone: { id: 'everyone123' },
                cache: new Map()
            }
        };
        
        // Add find method to roles cache
        mockGuild.roles.cache.find = vi.fn().mockReturnValue(null);

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

        // Create ticket manager with test path
        ticketManager = new DMTicketManager(mockClient, mockGuildConfig);
        ticketManager.filePath = testDataPath;
        ticketManager.setSupportServer('guild123');
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('Question Flow Configuration', () => {
        it('should have complete question flow structure', () => {
            expect(ticketManager.questionFlow).toHaveProperty('category');
            expect(ticketManager.questionFlow).toHaveProperty('priority');
            expect(ticketManager.questionFlow).toHaveProperty('description');
            expect(ticketManager.questionFlow).toHaveProperty('serverContext');
            expect(ticketManager.questionFlow).toHaveProperty('previousAttempts');
        });

        it('should have correct category options', () => {
            const categoryOptions = ticketManager.questionFlow.category.options;
            expect(categoryOptions).toEqual({
                "1": "Technical Issue",
                "2": "Moderation Issue", 
                "3": "General Support",
                "4": "Report User/Content"
            });
        });

        it('should have correct priority options with descriptions', () => {
            const priorityOptions = ticketManager.questionFlow.priority.options;
            expect(priorityOptions).toEqual({
                "1": "Low - Can wait a few days",
                "2": "Medium - Should be addressed within 24 hours",
                "3": "High - Needs attention within a few hours", 
                "4": "Urgent - Immediate attention required"
            });
        });

        it('should have appropriate question text for each step', () => {
            expect(ticketManager.questionFlow.category.question).toContain('type of issue');
            expect(ticketManager.questionFlow.priority.question).toContain('urgent');
            expect(ticketManager.questionFlow.description.question).toContain('detailed description');
            expect(ticketManager.questionFlow.serverContext.question).toContain('server');
            expect(ticketManager.questionFlow.previousAttempts.question).toContain('tried to resolve');
        });
    });

    describe('Interactive Question Flow', () => {
        beforeEach(() => {
            const questionnaire = {
                userId: mockUser.id,
                ticketId: null,
                currentStep: 'category',
                responses: {},
                startedAt: new Date().toISOString()
            };
            ticketManager.activeQuestions.set(mockUser.id, questionnaire);
        });

        it('should ask category question with options', async () => {
            await ticketManager.askQuestion(mockUser, 'category');
            
            expect(mockUser.send).toHaveBeenCalledWith({
                embeds: [expect.any(Object)]
            });
            
            // Verify the embed was created with proper structure
            const embedCall = mockUser.send.mock.calls[0][0];
            expect(embedCall).toHaveProperty('embeds');
        });

        it('should ask priority question with urgency descriptions', async () => {
            await ticketManager.askQuestion(mockUser, 'priority');
            
            expect(mockUser.send).toHaveBeenCalledWith({
                embeds: [expect.any(Object)]
            });
        });

        it('should ask description question without options', async () => {
            await ticketManager.askQuestion(mockUser, 'description');
            
            expect(mockUser.send).toHaveBeenCalledWith({
                embeds: [expect.any(Object)]
            });
        });

        it('should ask server context question', async () => {
            await ticketManager.askQuestion(mockUser, 'serverContext');
            
            expect(mockUser.send).toHaveBeenCalledWith({
                embeds: [expect.any(Object)]
            });
        });

        it('should ask previous attempts question', async () => {
            await ticketManager.askQuestion(mockUser, 'previousAttempts');
            
            expect(mockUser.send).toHaveBeenCalledWith({
                embeds: [expect.any(Object)]
            });
        });

        it('should display correct step numbers', () => {
            expect(ticketManager.getStepNumber('category')).toBe(1);
            expect(ticketManager.getStepNumber('priority')).toBe(2);
            expect(ticketManager.getStepNumber('description')).toBe(3);
            expect(ticketManager.getStepNumber('serverContext')).toBe(4);
            expect(ticketManager.getStepNumber('previousAttempts')).toBe(5);
        });
    });

    describe('Response Validation - Category Selection', () => {
        it('should validate correct category responses', () => {
            const questionConfig = ticketManager.questionFlow.category;
            
            const validResponses = ['1', '2', '3', '4'];
            validResponses.forEach(response => {
                const result = ticketManager.validateResponse('category', response, questionConfig);
                expect(result.isValid).toBe(true);
                expect(result.value).toHaveProperty('key', response);
                expect(result.value).toHaveProperty('label');
            });
        });

        it('should reject invalid category responses', () => {
            const questionConfig = ticketManager.questionFlow.category;
            
            const invalidResponses = ['0', '5', 'abc', 'technical'];
            invalidResponses.forEach(response => {
                const result = ticketManager.validateResponse('category', response, questionConfig);
                expect(result.isValid).toBe(false);
                expect(result.error).toContain('valid option');
            });
            
            // Test empty response separately
            const emptyResult = ticketManager.validateResponse('category', '', questionConfig);
            expect(emptyResult.isValid).toBe(false);
            expect(emptyResult.error).toContain('cannot be empty');
        });

        it('should return correct labels for category selections', () => {
            const questionConfig = ticketManager.questionFlow.category;
            
            const result1 = ticketManager.validateResponse('category', '1', questionConfig);
            expect(result1.value.label).toBe('Technical Issue');
            
            const result2 = ticketManager.validateResponse('category', '2', questionConfig);
            expect(result2.value.label).toBe('Moderation Issue');
            
            const result3 = ticketManager.validateResponse('category', '3', questionConfig);
            expect(result3.value.label).toBe('General Support');
            
            const result4 = ticketManager.validateResponse('category', '4', questionConfig);
            expect(result4.value.label).toBe('Report User/Content');
        });
    });

    describe('Response Validation - Priority Selection', () => {
        it('should validate correct priority responses', () => {
            const questionConfig = ticketManager.questionFlow.priority;
            
            const validResponses = ['1', '2', '3', '4'];
            validResponses.forEach(response => {
                const result = ticketManager.validateResponse('priority', response, questionConfig);
                expect(result.isValid).toBe(true);
                expect(result.value).toHaveProperty('key', response);
                expect(result.value).toHaveProperty('label');
            });
        });

        it('should reject invalid priority responses', () => {
            const questionConfig = ticketManager.questionFlow.priority;
            
            const invalidResponses = ['0', '5', 'high', 'urgent'];
            invalidResponses.forEach(response => {
                const result = ticketManager.validateResponse('priority', response, questionConfig);
                expect(result.isValid).toBe(false);
                expect(result.error).toContain('valid option');
            });
            
            // Test empty response separately
            const emptyResult = ticketManager.validateResponse('priority', '', questionConfig);
            expect(emptyResult.isValid).toBe(false);
            expect(emptyResult.error).toContain('cannot be empty');
        });

        it('should return correct labels for priority selections', () => {
            const questionConfig = ticketManager.questionFlow.priority;
            
            const result1 = ticketManager.validateResponse('priority', '1', questionConfig);
            expect(result1.value.label).toBe('Low - Can wait a few days');
            
            const result2 = ticketManager.validateResponse('priority', '2', questionConfig);
            expect(result2.value.label).toBe('Medium - Should be addressed within 24 hours');
            
            const result3 = ticketManager.validateResponse('priority', '3', questionConfig);
            expect(result3.value.label).toBe('High - Needs attention within a few hours');
            
            const result4 = ticketManager.validateResponse('priority', '4', questionConfig);
            expect(result4.value.label).toBe('Urgent - Immediate attention required');
        });
    });

    describe('Response Validation - Description Collection', () => {
        it('should validate detailed descriptions', () => {
            const validDescriptions = [
                'This is a detailed description of my technical issue with the bot',
                'I am experiencing problems with the moderation system that need attention',
                'The watchlist feature is not working correctly and I need help resolving this',
                'x'.repeat(100) // Long but valid description
            ];

            validDescriptions.forEach(description => {
                const result = ticketManager.validateResponse('description', description);
                expect(result.isValid).toBe(true);
                expect(result.value).toBe(description);
            });
        });

        it('should reject descriptions that are too short', () => {
            const shortDescriptions = ['short', 'help', 'bug', 'x'.repeat(9)];
            
            shortDescriptions.forEach(description => {
                const result = ticketManager.validateResponse('description', description);
                expect(result.isValid).toBe(false);
                expect(result.error).toContain('at least 10 characters');
            });
            
            // Test empty response separately
            const emptyResult = ticketManager.validateResponse('description', '');
            expect(emptyResult.isValid).toBe(false);
            expect(emptyResult.error).toContain('cannot be empty');
        });

        it('should reject descriptions that are too long', () => {
            const longDescription = 'x'.repeat(2001);
            
            const result = ticketManager.validateResponse('description', longDescription);
            expect(result.isValid).toBe(false);
            expect(result.error).toContain('too long');
            expect(result.error).toContain('2000 characters');
        });

        it('should accept descriptions at boundary lengths', () => {
            const minValidDescription = 'x'.repeat(10);
            const maxValidDescription = 'x'.repeat(2000);
            
            const minResult = ticketManager.validateResponse('description', minValidDescription);
            expect(minResult.isValid).toBe(true);
            
            const maxResult = ticketManager.validateResponse('description', maxValidDescription);
            expect(maxResult.isValid).toBe(true);
        });
    });

    describe('Response Validation - Server Context Collection', () => {
        it('should validate server context responses', () => {
            const validContexts = [
                'Test Server',
                'My Gaming Community',
                'none',
                'Guild ID: 123456789',
                'The server where I moderate',
                'x'.repeat(500) // Long but valid
            ];

            validContexts.forEach(context => {
                const result = ticketManager.validateResponse('serverContext', context);
                expect(result.isValid).toBe(true);
                expect(result.value).toBe(context);
            });
        });

        it('should reject server context that is too long', () => {
            const longContext = 'x'.repeat(1001);
            
            const result = ticketManager.validateResponse('serverContext', longContext);
            expect(result.isValid).toBe(false);
            expect(result.error).toContain('too long');
            expect(result.error).toContain('1000 characters');
        });

        it('should accept server context at boundary length', () => {
            const maxValidContext = 'x'.repeat(1000);
            
            const result = ticketManager.validateResponse('serverContext', maxValidContext);
            expect(result.isValid).toBe(true);
        });
    });

    describe('Response Validation - Previous Attempts Collection', () => {
        it('should validate previous attempts responses', () => {
            const validAttempts = [
                'I tried restarting the bot',
                'Checked the documentation and tried the suggested fixes',
                'none',
                'Asked other moderators but they could not help',
                'x'.repeat(500) // Long but valid
            ];

            validAttempts.forEach(attempt => {
                const result = ticketManager.validateResponse('previousAttempts', attempt);
                expect(result.isValid).toBe(true);
                expect(result.value).toBe(attempt);
            });
        });

        it('should reject previous attempts that are too long', () => {
            const longAttempts = 'x'.repeat(1001);
            
            const result = ticketManager.validateResponse('previousAttempts', longAttempts);
            expect(result.isValid).toBe(false);
            expect(result.error).toContain('too long');
            expect(result.error).toContain('1000 characters');
        });

        it('should accept previous attempts at boundary length', () => {
            const maxValidAttempts = 'x'.repeat(1000);
            
            const result = ticketManager.validateResponse('previousAttempts', maxValidAttempts);
            expect(result.isValid).toBe(true);
        });
    });

    describe('Complete Questionnaire Flow', () => {
        it('should process complete questionnaire flow correctly', async () => {
            const responses = [
                { step: 'category', input: '1', expectedNext: 'priority' },
                { step: 'priority', input: '3', expectedNext: 'description' },
                { step: 'description', input: 'Detailed description of my technical issue', expectedNext: 'serverContext' },
                { step: 'serverContext', input: 'My Test Server', expectedNext: 'previousAttempts' },
                { step: 'previousAttempts', input: 'Tried restarting and checking logs', expectedNext: null }
            ];

            // Start questionnaire
            const questionnaire = {
                userId: mockUser.id,
                ticketId: null,
                currentStep: 'category',
                responses: {},
                startedAt: new Date().toISOString()
            };
            ticketManager.activeQuestions.set(mockUser.id, questionnaire);

            // Process each response
            for (const { step, input, expectedNext } of responses) {
                const mockMessage = { content: input };
                
                const processed = await ticketManager.processQuestionnaireResponse(mockUser, mockMessage);
                expect(processed).toBe(true);
                
                const currentQuestionnaire = ticketManager.activeQuestions.get(mockUser.id);
                
                if (expectedNext) {
                    expect(currentQuestionnaire.currentStep).toBe(expectedNext);
                    expect(currentQuestionnaire.responses[step]).toBeDefined();
                } else {
                    // Should finalize ticket and remove questionnaire
                    expect(ticketManager.activeQuestions.has(mockUser.id)).toBe(false);
                }
            }
        });

        it('should handle cancellation at any step', async () => {
            const steps = ['category', 'priority', 'description', 'serverContext', 'previousAttempts'];
            
            for (const step of steps) {
                // Setup questionnaire at this step
                const questionnaire = {
                    userId: mockUser.id,
                    ticketId: null,
                    currentStep: step,
                    responses: {},
                    startedAt: new Date().toISOString()
                };
                ticketManager.activeQuestions.set(mockUser.id, questionnaire);

                const mockMessage = { content: 'cancel' };
                const processed = await ticketManager.processQuestionnaireResponse(mockUser, mockMessage);
                
                expect(processed).toBe(true);
                expect(ticketManager.activeQuestions.has(mockUser.id)).toBe(false);
                expect(mockUser.send).toHaveBeenCalledWith({
                    embeds: [expect.any(Object)]
                });
            }
        });

        it('should handle invalid responses with error messages', async () => {
            const invalidCases = [
                { step: 'category', input: '5', shouldRetry: true },
                { step: 'priority', input: 'high', shouldRetry: true },
                { step: 'description', input: 'short', shouldRetry: true },
                { step: 'serverContext', input: 'x'.repeat(1001), shouldRetry: true },
                { step: 'previousAttempts', input: 'x'.repeat(1001), shouldRetry: true }
            ];

            for (const { step, input, shouldRetry } of invalidCases) {
                // Setup questionnaire at this step
                const questionnaire = {
                    userId: mockUser.id,
                    ticketId: null,
                    currentStep: step,
                    responses: {},
                    startedAt: new Date().toISOString()
                };
                ticketManager.activeQuestions.set(mockUser.id, questionnaire);

                const mockMessage = { content: input };
                const processed = await ticketManager.processQuestionnaireResponse(mockUser, mockMessage);
                
                expect(processed).toBe(true);
                
                if (shouldRetry) {
                    // Should stay on same step and show error
                    const currentQuestionnaire = ticketManager.activeQuestions.get(mockUser.id);
                    expect(currentQuestionnaire.currentStep).toBe(step);
                    expect(mockUser.send).toHaveBeenCalledWith({
                        embeds: [expect.any(Object)]
                    });
                }
            }
        });
    });

    describe('Questionnaire Data Collection', () => {
        it('should collect and store all user responses correctly', async () => {
            const questionnaire = {
                userId: mockUser.id,
                ticketId: null,
                currentStep: 'previousAttempts',
                responses: {
                    category: { key: '2', label: 'Moderation Issue' },
                    priority: { key: '4', label: 'Urgent - Immediate attention required' },
                    description: 'There is a serious moderation issue that needs immediate attention',
                    serverContext: 'Main Gaming Server (ID: 123456789)',
                    initialMessage: 'Help! Something is wrong!'
                },
                startedAt: new Date().toISOString()
            };

            ticketManager.activeQuestions.set(mockUser.id, questionnaire);

            const result = await ticketManager.finalizeTicket(mockUser, questionnaire);
            
            expect(result.success).toBe(true);
            expect(result.ticket.responses).toEqual(questionnaire.responses);
            expect(result.ticket.responses.category.label).toBe('Moderation Issue');
            expect(result.ticket.responses.priority.label).toBe('Urgent - Immediate attention required');
        });

        it('should include initial message in questionnaire responses', async () => {
            const initialMessage = 'I need help with a technical issue';
            
            const result = await ticketManager.createTicket(mockUser, initialMessage);
            
            expect(result.success).toBe(true);
            expect(result.inProgress).toBe(true);
            
            const questionnaire = ticketManager.activeQuestions.get(mockUser.id);
            expect(questionnaire.responses.initialMessage).toBe(initialMessage);
        });

        it('should determine source guild from user context', async () => {
            // Setup multiple guilds for user
            const guild1 = { id: 'guild456', name: 'Source Guild' };
            const guild2 = { id: 'guild789', name: 'Other Guild' };
            
            mockClient.guilds.cache.set('guild456', guild1);
            mockClient.guilds.cache.set('guild789', guild2);
            
            // Mock guild members to include our user
            guild1.members = { cache: new Map([['user123', {}]]) };
            guild2.members = { cache: new Map([['user123', {}]]) };

            const questionnaire = {
                userId: mockUser.id,
                responses: {
                    category: { key: '1', label: 'Technical Issue' },
                    priority: { key: '2', label: 'Medium - Should be addressed within 24 hours' },
                    description: 'Test description',
                    serverContext: 'Source Guild',
                    previousAttempts: 'None'
                }
            };

            const result = await ticketManager.finalizeTicket(mockUser, questionnaire);
            
            expect(result.success).toBe(true);
            // Should attempt to match server context to actual guild
        });
    });

    describe('Error Handling in Questionnaire Flow', () => {
        it('should handle user send failures gracefully', async () => {
            mockUser.send.mockRejectedValue(new Error('Cannot send DM'));
            
            const result = await ticketManager.createTicket(mockUser);
            
            expect(result.success).toBe(false);
            expect(result.error).toBe('Cannot send DM');
        });

        it('should clean up questionnaire on finalization errors', async () => {
            ticketManager.setSupportServer(null); // Force error
            
            const questionnaire = {
                userId: mockUser.id,
                responses: {
                    category: { key: '1', label: 'Technical Issue' },
                    priority: { key: '2', label: 'Medium' },
                    description: 'Test description',
                    serverContext: 'Test server',
                    previousAttempts: 'None'
                }
            };

            ticketManager.activeQuestions.set(mockUser.id, questionnaire);
            
            const result = await ticketManager.finalizeTicket(mockUser, questionnaire);
            
            expect(result.success).toBe(false);
            expect(ticketManager.activeQuestions.has(mockUser.id)).toBe(false);
        });

        it('should handle missing questionnaire gracefully', async () => {
            const mockMessage = { content: 'test response' };
            
            const processed = await ticketManager.processQuestionnaireResponse(mockUser, mockMessage);
            
            expect(processed).toBe(false);
        });
    });

    describe('User Information Collection', () => {
        it('should collect comprehensive user information in ticket data', async () => {
            const questionnaire = {
                userId: mockUser.id,
                responses: {
                    category: { key: '1', label: 'Technical Issue' },
                    priority: { key: '2', label: 'Medium - Should be addressed within 24 hours' },
                    description: 'Detailed technical issue description',
                    serverContext: 'My Gaming Server',
                    previousAttempts: 'Tried restarting bot and checking permissions'
                }
            };

            const result = await ticketManager.finalizeTicket(mockUser, questionnaire);
            
            expect(result.success).toBe(true);
            expect(result.ticket).toMatchObject({
                userId: mockUser.id,
                username: mockUser.username,
                discriminator: mockUser.discriminator || '0',
                responses: questionnaire.responses
            });
        });

        it('should include timestamp information', async () => {
            const questionnaire = {
                userId: mockUser.id,
                responses: {
                    category: { key: '1', label: 'Technical Issue' },
                    priority: { key: '2', label: 'Medium' },
                    description: 'Test description',
                    serverContext: 'Test server',
                    previousAttempts: 'None'
                }
            };

            const result = await ticketManager.finalizeTicket(mockUser, questionnaire);
            
            expect(result.success).toBe(true);
            expect(result.ticket.createdAt).toBeDefined();
            expect(new Date(result.ticket.createdAt)).toBeInstanceOf(Date);
        });
    });
});