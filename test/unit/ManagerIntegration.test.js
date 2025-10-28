import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Client, GatewayIntentBits } from 'discord.js';
import { EconomyManager } from '../../utils/EconomyManager.js';
import { ForumReportManager } from '../../utils/ForumReportManager.js';
import AutoConfigManager from '../../utils/AutoConfigManager.js';
import { DMTicketManager } from '../../utils/DMTicketManager.js';
import { ReportManager } from '../../utils/ReportManager.js';
import MessageLogger from '../../utils/MessageLogger.js';
import { GuildConfig } from '../../utils/GuildConfig.js';
import fs from 'fs';
import path from 'path';

describe('Manager Integration Tests', () => {
    let client;
    let guildConfig;
    let reportManager;
    let messageLogger;
    let economyManager;
    let forumReportManager;
    let autoConfigManager;
    let dmTicketManager;
    let testDataDir;

    beforeEach(async () => {
        // Create test data directory
        testDataDir = path.join(process.cwd(), 'test', 'test-data', 'integration');
        if (!fs.existsSync(testDataDir)) {
            fs.mkdirSync(testDataDir, { recursive: true });
        }

        // Mock Discord client
        client = {
            user: { id: 'test-bot-id', tag: 'TestBot#0001' },
            guilds: {
                cache: new Map(),
                fetch: vi.fn()
            },
            channels: {
                fetch: vi.fn()
            },
            users: {
                fetch: vi.fn()
            }
        };

        // Initialize managers with test data paths
        guildConfig = new GuildConfig(path.join(testDataDir, 'guilds_config.json'));
        reportManager = new ReportManager();
        messageLogger = new MessageLogger(reportManager);
        
        economyManager = new EconomyManager(path.join(testDataDir, 'economy.json'));
        forumReportManager = new ForumReportManager(client, guildConfig, reportManager);
        autoConfigManager = new AutoConfigManager(client, guildConfig);
        
        dmTicketManager = new DMTicketManager(client, guildConfig);
    });

    afterEach(() => {
        // Clean up test files
        if (fs.existsSync(testDataDir)) {
            fs.rmSync(testDataDir, { recursive: true, force: true });
        }
    });

    describe('Manager Initialization', () => {
        it('should initialize all managers without errors', () => {
            expect(economyManager).toBeDefined();
            expect(forumReportManager).toBeDefined();
            expect(autoConfigManager).toBeDefined();
            expect(dmTicketManager).toBeDefined();
        });

        it('should have proper dependencies between managers', () => {
            expect(forumReportManager.reportManager).toBe(reportManager);
            expect(dmTicketManager.client).toBe(client);
            expect(dmTicketManager.guildConfig).toBe(guildConfig);
        });
    });

    describe('Cross-Manager Interactions', () => {
        it('should handle economy rewards for ticket activities', async () => {
            const userId = 'test-user-123';
            const guildId = 'test-guild-456';
            
            // Initialize guild economy
            economyManager.ensureGuildExists(guildId);
            
            // Simulate ticket creation (should award currency)
            const initialBalance = await economyManager.getBalance(userId, guildId);
            await economyManager.addCurrency(userId, guildId, 10, 'Ticket created');
            
            const newBalance = await economyManager.getBalance(userId, guildId);
            expect(newBalance).toBe(initialBalance + 10);
        });

        it('should integrate forum reports with ticket system', async () => {
            const mockGuild = {
                id: 'test-guild-789',
                name: 'Test Guild',
                channels: {
                    create: vi.fn().mockResolvedValue({
                        id: 'test-forum-channel',
                        type: 15 // Forum channel
                    })
                }
            };

            // Mock forum report creation
            const reportData = {
                reportedUser: 'test-reported-user',
                reportedBy: 'test-reporter',
                reason: 'Test violation',
                category: 'spam'
            };

            // This should work without throwing errors
            expect(() => {
                forumReportManager.categorizeReport('spam');
            }).not.toThrow();
        });

        it('should handle auto-configuration with existing managers', async () => {
            const mockGuild = {
                id: 'test-guild-auto',
                name: 'Auto Config Test Guild',
                memberCount: 50,
                channels: {
                    create: vi.fn().mockResolvedValue({
                        id: 'test-channel',
                        name: 'test-channel'
                    })
                },
                roles: {
                    create: vi.fn().mockResolvedValue({
                        id: 'test-role',
                        name: 'test-role'
                    })
                }
            };

            const serverSize = autoConfigManager.detectServerSize(mockGuild);
            expect(['small', 'medium', 'large']).toContain(serverSize);
        });
    });

    describe('Error Handling Integration', () => {
        it('should handle manager failures gracefully', async () => {
            // Test economy manager with invalid data
            const invalidEconomyManager = new EconomyManager('/invalid/path/economy.json');
            expect(invalidEconomyManager).toBeDefined();
            
            // Should not throw when trying to get balance from invalid manager
            const balance = await invalidEconomyManager.getBalance('test-user', 'test-guild');
            expect(typeof balance).toBe('number');
        });

        it('should handle missing dependencies', () => {
            // Test ForumReportManager without reportManager
            const forumManagerWithoutReport = new ForumReportManager(client, guildConfig, null);
            expect(forumManagerWithoutReport.reportManager).toBeNull();
        });
    });

    describe('Data Consistency', () => {
        it('should maintain data consistency across managers', async () => {
            const userId = 'consistency-test-user';
            const guildId = 'consistency-test-guild';
            
            // Initialize economy
            economyManager.ensureGuildExists(guildId);
            
            // Add currency
            await economyManager.addCurrency(userId, guildId, 100, 'Test reward');
            
            // Check balance
            const balance = await economyManager.getBalance(userId, guildId);
            expect(balance).toBe(100);
            
            // Transfer currency
            const recipientId = 'recipient-user';
            await economyManager.transferCurrency(userId, recipientId, guildId, 50);
            
            const senderBalance = await economyManager.getBalance(userId, guildId);
            const recipientBalance = await economyManager.getBalance(recipientId, guildId);
            
            expect(senderBalance).toBe(50);
            expect(recipientBalance).toBe(50);
        });
    });
});