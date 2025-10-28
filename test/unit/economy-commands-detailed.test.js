import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { EconomyManager } from '../../utils/EconomyManager.js';
import fs from 'fs';
import path from 'path';

// Mock Discord.js properly
vi.mock('discord.js', () => {
    const mockBuilder = {
        setName: vi.fn().mockReturnThis(),
        setDescription: vi.fn().mockReturnThis(),
        addUserOption: vi.fn().mockReturnThis(),
        addIntegerOption: vi.fn().mockReturnThis(),
        addStringOption: vi.fn().mockReturnThis(),
        addSubcommand: vi.fn().mockReturnThis(),
        setRequired: vi.fn().mockReturnThis(),
        setMinValue: vi.fn().mockReturnThis(),
        setMaxValue: vi.fn().mockReturnThis(),
        addChoices: vi.fn().mockReturnThis()
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
            data: {}
        }))
    };
});

describe('Economy Commands Detailed Integration Tests', () => {
    let economyManager;
    let testFilePath;
    let mockInteraction;
    let mockAdminManager;

    beforeEach(() => {
        // Create test file path
        testFilePath = path.join(process.cwd(), 'test', 'test-data', 'test-economy-commands.json');
        
        // Ensure test directory exists
        const testDir = path.dirname(testFilePath);
        if (!fs.existsSync(testDir)) {
            fs.mkdirSync(testDir, { recursive: true });
        }

        // Clean up any existing test file
        if (fs.existsSync(testFilePath)) {
            fs.unlinkSync(testFilePath);
        }

        // Create economy manager
        economyManager = new EconomyManager(testFilePath);

        // Setup mock interaction
        mockInteraction = {
            user: { 
                id: 'user123', 
                username: 'testuser', 
                tag: 'testuser#1234',
                bot: false,
                displayAvatarURL: vi.fn(() => 'https://example.com/avatar.png')
            },
            guild: { 
                id: 'guild789', 
                name: 'Test Guild',
                channels: {
                    cache: {
                        find: vi.fn(() => null)
                    }
                }
            },
            options: {
                getUser: vi.fn(),
                getInteger: vi.fn(),
                getString: vi.fn(),
                getSubcommand: vi.fn()
            },
            reply: vi.fn(),
            deferReply: vi.fn(),
            editReply: vi.fn()
        };

        // Setup mock admin manager
        mockAdminManager = {
            isAdmin: vi.fn(() => Promise.resolve(true))
        };
    });

    afterEach(() => {
        // Clean up test file
        if (fs.existsSync(testFilePath)) {
            fs.unlinkSync(testFilePath);
        }
    });

    describe('Balance Command Integration', () => {
        test('should display user balance correctly', async () => {
            const balanceCommand = await import('../../commands/balance.js');
            
            // Setup user with some balance
            await economyManager.addCurrency('user123', 'guild789', 1000, 'Test setup');
            
            // Mock interaction options
            mockInteraction.options.getUser.mockReturnValue(null); // Check own balance
            
            // Execute command
            await balanceCommand.default.execute(
                mockInteraction,
                mockAdminManager,
                null, null, null, null, null, null, null, null, null, null, null, null, null, null,
                economyManager
            );

            // Verify reply was called with embed
            expect(mockInteraction.reply).toHaveBeenCalledWith({
                embeds: expect.any(Array)
            });
        });

        test('should display another user balance when specified', async () => {
            const balanceCommand = await import('../../commands/balance.js');
            
            // Setup target user with balance
            await economyManager.addCurrency('user456', 'guild789', 500, 'Test setup');
            
            // Mock interaction options
            const targetUser = { 
                id: 'user456', 
                username: 'targetuser',
                displayAvatarURL: vi.fn(() => 'https://example.com/avatar2.png')
            };
            mockInteraction.options.getUser.mockReturnValue(targetUser);
            
            // Execute command
            await balanceCommand.default.execute(
                mockInteraction,
                mockAdminManager,
                null, null, null, null, null, null, null, null, null, null, null, null, null, null,
                economyManager
            );

            // Verify reply was called
            expect(mockInteraction.reply).toHaveBeenCalled();
        });
    });

    describe('Transfer Command Integration', () => {
        test('should transfer currency successfully', async () => {
            const transferCommand = await import('../../commands/transfer.js');
            
            // Setup sender with balance
            await economyManager.addCurrency('user123', 'guild789', 1000, 'Test setup');
            
            // Mock interaction options
            const recipient = { 
                id: 'user456', 
                username: 'recipient',
                tag: 'recipient#5678',
                bot: false,
                send: vi.fn() // Mock DM capability
            };
            mockInteraction.options.getUser.mockReturnValue(recipient);
            mockInteraction.options.getInteger.mockReturnValue(250);
            
            // Execute command
            await transferCommand.default.execute(
                mockInteraction,
                mockAdminManager,
                null, null, null, null, null, null, null, null, null, null, null, null, null, null,
                economyManager
            );

            // Verify transfer occurred
            const senderBalance = await economyManager.getBalance('user123', 'guild789');
            const recipientBalance = await economyManager.getBalance('user456', 'guild789');
            
            expect(senderBalance).toBe(750);
            expect(recipientBalance).toBe(250);
            expect(mockInteraction.reply).toHaveBeenCalled();
        });

        test('should reject transfer to bot', async () => {
            const transferCommand = await import('../../commands/transfer.js');
            
            // Mock bot recipient
            const botRecipient = { 
                id: 'bot123', 
                username: 'testbot',
                bot: true
            };
            mockInteraction.options.getUser.mockReturnValue(botRecipient);
            mockInteraction.options.getInteger.mockReturnValue(100);
            
            // Execute command
            await transferCommand.default.execute(
                mockInteraction,
                mockAdminManager,
                null, null, null, null, null, null, null, null, null, null, null, null, null, null,
                economyManager
            );

            // Verify rejection
            expect(mockInteraction.reply).toHaveBeenCalledWith({
                content: '❌ Vous ne pouvez pas transférer de l\'argent à un bot.',
                ephemeral: true
            });
        });

        test('should reject transfer with insufficient balance', async () => {
            const transferCommand = await import('../../commands/transfer.js');
            
            // Setup sender with insufficient balance
            await economyManager.addCurrency('user123', 'guild789', 50, 'Test setup');
            
            // Mock interaction options
            const recipient = { 
                id: 'user456', 
                username: 'recipient',
                bot: false
            };
            mockInteraction.options.getUser.mockReturnValue(recipient);
            mockInteraction.options.getInteger.mockReturnValue(100);
            
            // Execute command
            await transferCommand.default.execute(
                mockInteraction,
                mockAdminManager,
                null, null, null, null, null, null, null, null, null, null, null, null, null, null,
                economyManager
            );

            // Verify rejection
            expect(mockInteraction.reply).toHaveBeenCalledWith({
                content: expect.stringContaining('❌ Balance insuffisante'),
                ephemeral: true
            });
        });
    });

    describe('Shop Command Integration', () => {
        test('should display shop list correctly', async () => {
            const shopCommand = await import('../../commands/shop.js');
            
            // Mock interaction options for list subcommand
            mockInteraction.options.getSubcommand.mockReturnValue('list');
            
            // Execute command
            await shopCommand.default.execute(
                mockInteraction,
                mockAdminManager,
                null, null, null, null, null, null, null, null, null, null, null, null, null, null,
                economyManager
            );

            // Verify reply was called with embed
            expect(mockInteraction.reply).toHaveBeenCalledWith({
                embeds: expect.any(Array)
            });
        });

        test('should handle successful purchase', async () => {
            const shopCommand = await import('../../commands/shop.js');
            
            // Setup user with sufficient balance
            await economyManager.addCurrency('user123', 'guild789', 2000, 'Test setup');
            
            // Mock interaction options for buy subcommand
            mockInteraction.options.getSubcommand.mockReturnValue('buy');
            mockInteraction.options.getString.mockReturnValue('vip_7d');
            mockInteraction.options.getInteger.mockReturnValue(1);
            
            // Execute command
            await shopCommand.default.execute(
                mockInteraction,
                mockAdminManager,
                null, null, null, null, null, null, null, null, null, null, null, null, null, null,
                economyManager
            );

            // Verify purchase occurred (balance should be reduced)
            const balance = await economyManager.getBalance('user123', 'guild789');
            expect(balance).toBeLessThan(2000);
            expect(mockInteraction.reply).toHaveBeenCalled();
        });

        test('should reject purchase with insufficient balance', async () => {
            const shopCommand = await import('../../commands/shop.js');
            
            // Setup user with insufficient balance
            await economyManager.addCurrency('user123', 'guild789', 100, 'Test setup');
            
            // Mock interaction options for expensive item
            mockInteraction.options.getSubcommand.mockReturnValue('buy');
            mockInteraction.options.getString.mockReturnValue('server_boost');
            mockInteraction.options.getInteger.mockReturnValue(1);
            
            // Execute command
            await shopCommand.default.execute(
                mockInteraction,
                mockAdminManager,
                null, null, null, null, null, null, null, null, null, null, null, null, null, null,
                economyManager
            );

            // Verify rejection
            expect(mockInteraction.reply).toHaveBeenCalledWith({
                content: expect.stringContaining('❌ Balance insuffisante'),
                ephemeral: true
            });
        });
    });

    describe('Economy Stats Command Integration', () => {
        test('should display overview for admin', async () => {
            const economyStatsCommand = await import('../../commands/economy-stats.js');
            
            // Setup some economy data
            await economyManager.addCurrency('user123', 'guild789', 1000, 'Test setup');
            await economyManager.addCurrency('user456', 'guild789', 500, 'Test setup');
            
            // Mock interaction options
            mockInteraction.options.getSubcommand.mockReturnValue('overview');
            
            // Execute command
            await economyStatsCommand.default.execute(
                mockInteraction,
                mockAdminManager,
                null, null, null, null, null, null, null, null, null, null, null, null, null, null,
                economyManager
            );

            // Verify reply was called with embed
            expect(mockInteraction.reply).toHaveBeenCalledWith({
                embeds: expect.any(Array)
            });
        });

        test('should reject non-admin users', async () => {
            const economyStatsCommand = await import('../../commands/economy-stats.js');
            
            // Mock non-admin user
            mockAdminManager.isAdmin.mockResolvedValue(false);
            
            // Execute command
            await economyStatsCommand.default.execute(
                mockInteraction,
                mockAdminManager,
                null, null, null, null, null, null, null, null, null, null, null, null, null, null,
                economyManager
            );

            // Verify rejection
            expect(mockInteraction.reply).toHaveBeenCalledWith({
                content: '❌ Cette commande est réservée aux administrateurs.',
                ephemeral: true
            });
        });

        test('should handle market analysis subcommand', async () => {
            const economyStatsCommand = await import('../../commands/economy-stats.js');
            
            // Setup economy data
            await economyManager.addCurrency('user123', 'guild789', 1000, 'Test setup');
            
            // Mock interaction options
            mockInteraction.options.getSubcommand.mockReturnValue('market');
            
            // Execute command
            await economyStatsCommand.default.execute(
                mockInteraction,
                mockAdminManager,
                null, null, null, null, null, null, null, null, null, null, null, null, null, null,
                economyManager
            );

            // Verify reply was called
            expect(mockInteraction.reply).toHaveBeenCalled();
        });

        test('should handle simulation subcommand', async () => {
            const economyStatsCommand = await import('../../commands/economy-stats.js');
            
            // Setup economy data
            await economyManager.addCurrency('user123', 'guild789', 1000, 'Test setup');
            
            // Mock interaction options
            mockInteraction.options.getSubcommand.mockReturnValue('simulate');
            mockInteraction.options.getInteger.mockReturnValue(7);
            
            // Execute command
            await economyStatsCommand.default.execute(
                mockInteraction,
                mockAdminManager,
                null, null, null, null, null, null, null, null, null, null, null, null, null, null,
                economyManager
            );

            // Verify deferred reply and edit were called
            expect(mockInteraction.deferReply).toHaveBeenCalled();
            expect(mockInteraction.editReply).toHaveBeenCalled();
        });
    });

    describe('Error Handling', () => {
        test('should handle economy manager errors gracefully', async () => {
            const balanceCommand = await import('../../commands/balance.js');
            
            // Create a broken economy manager
            const brokenEconomyManager = {
                getUserStats: vi.fn(() => Promise.resolve(null))
            };
            
            // Execute command with broken manager
            await balanceCommand.default.execute(
                mockInteraction,
                mockAdminManager,
                null, null, null, null, null, null, null, null, null, null, null, null, null, null,
                brokenEconomyManager
            );

            // Verify error handling
            expect(mockInteraction.reply).toHaveBeenCalledWith({
                content: '❌ Impossible de récupérer les statistiques économiques.',
                ephemeral: true
            });
        });

        test('should handle command execution errors', async () => {
            const transferCommand = await import('../../commands/transfer.js');
            
            // Create a broken economy manager that throws
            const brokenEconomyManager = {
                getBalance: vi.fn(() => { throw new Error('Test error'); }),
                transferCurrency: vi.fn(() => { throw new Error('Test error'); })
            };
            
            // Mock valid options
            mockInteraction.options.getUser.mockReturnValue({ 
                id: 'user456', 
                username: 'recipient',
                bot: false
            });
            mockInteraction.options.getInteger.mockReturnValue(100);
            
            // Execute command with broken manager
            await transferCommand.default.execute(
                mockInteraction,
                mockAdminManager,
                null, null, null, null, null, null, null, null, null, null, null, null, null, null,
                brokenEconomyManager
            );

            // Verify error handling
            expect(mockInteraction.reply).toHaveBeenCalledWith({
                content: '❌ Une erreur est survenue lors du transfert.',
                ephemeral: true
            });
        });
    });

    describe('Market Dynamics Integration', () => {
        test('should reflect market changes in shop prices', async () => {
            const shopCommand = await import('../../commands/shop.js');
            
            // Add large amount of currency to trigger inflation
            await economyManager.addCurrency('user123', 'guild789', 50000, 'Inflation test');
            
            // Mock interaction for shop list
            mockInteraction.options.getSubcommand.mockReturnValue('list');
            
            // Execute command
            await shopCommand.default.execute(
                mockInteraction,
                mockAdminManager,
                null, null, null, null, null, null, null, null, null, null, null, null, null, null,
                economyManager
            );

            // Verify that market value affects pricing (should be called)
            expect(mockInteraction.reply).toHaveBeenCalled();
            
            // Check that market value calculation was triggered
            const marketValue = await economyManager.calculateMarketValue('guild789');
            expect(typeof marketValue).toBe('number');
        });
    });
});