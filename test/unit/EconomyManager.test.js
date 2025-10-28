import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { EconomyManager } from '../../utils/EconomyManager.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Test configuration
const TEST_DATA_DIR = path.join(__dirname, '../test-data');
const TEST_ECONOMY_FILE = path.join(TEST_DATA_DIR, 'test-economy.json');

describe('EconomyManager Tests', () => {
    let economyManager;

    beforeEach(() => {
        // Ensure test data directory exists
        if (!fs.existsSync(TEST_DATA_DIR)) {
            fs.mkdirSync(TEST_DATA_DIR, { recursive: true });
        }

        // Clean up test files
        if (fs.existsSync(TEST_ECONOMY_FILE)) {
            fs.unlinkSync(TEST_ECONOMY_FILE);
        }

        // Create fresh EconomyManager instance
        economyManager = new EconomyManager(TEST_ECONOMY_FILE);
    });

    afterEach(() => {
        // Clean up test files
        if (fs.existsSync(TEST_ECONOMY_FILE)) {
            fs.unlinkSync(TEST_ECONOMY_FILE);
        }
    });

    describe('Initialization', () => {
        test('should create EconomyManager instance', () => {
            expect(economyManager).toBeDefined();
            expect(economyManager.economy).toBeDefined();
            expect(economyManager.filePath).toBe(TEST_ECONOMY_FILE);
        });

        test('should create default economy data structure', () => {
            const defaultData = economyManager.getDefaultEconomyData();
            
            expect(defaultData).toHaveProperty('_metadata');
            expect(defaultData).toHaveProperty('guilds');
            expect(defaultData._metadata).toHaveProperty('version');
            expect(defaultData._metadata).toHaveProperty('created');
            expect(defaultData._metadata).toHaveProperty('lastModified');
            expect(defaultData.guilds).toEqual({});
        });

        test('should ensure file exists on initialization', async () => {
            await economyManager.ensureFileExists();
            expect(fs.existsSync(TEST_ECONOMY_FILE)).toBe(true);
        });

        test('should handle missing directory gracefully', async () => {
            const invalidPath = path.join(TEST_DATA_DIR, 'nonexistent', 'economy.json');
            const manager = new EconomyManager(invalidPath);
            
            await expect(manager.ensureFileExists()).resolves.not.toThrow();
        });
    });

    describe('Data Management', () => {
        test('should load economy data from file', async () => {
            const testData = {
                _metadata: { version: '1.0' },
                guilds: {
                    'test-guild': {
                        totalCurrency: 100,
                        users: {
                            'test-user': { balance: 50 }
                        }
                    }
                }
            };

            fs.writeFileSync(TEST_ECONOMY_FILE, JSON.stringify(testData, null, 2));
            
            const loadedData = await economyManager.loadEconomy();
            expect(loadedData.guilds['test-guild'].totalCurrency).toBe(100);
            expect(loadedData.guilds['test-guild'].users['test-user'].balance).toBe(50);
        });

        test('should handle corrupted JSON gracefully', async () => {
            fs.writeFileSync(TEST_ECONOMY_FILE, 'invalid json content');
            
            const loadedData = await economyManager.loadEconomy();
            const defaultData = economyManager.getDefaultEconomyData();
            
            // Check structure without comparing exact timestamps
            expect(loadedData).toHaveProperty('_metadata');
            expect(loadedData).toHaveProperty('guilds');
            expect(loadedData._metadata).toHaveProperty('version');
            expect(loadedData._metadata.version).toBe(defaultData._metadata.version);
            expect(loadedData.guilds).toEqual({});
        });

        test('should save economy data to file', async () => {
            economyManager.economy = {
                _metadata: { version: '1.0' },
                guilds: {
                    'test-guild': { totalCurrency: 200 }
                }
            };

            const result = await economyManager.saveEconomy();
            expect(result).toBe(true);
            expect(fs.existsSync(TEST_ECONOMY_FILE)).toBe(true);

            const savedData = JSON.parse(fs.readFileSync(TEST_ECONOMY_FILE, 'utf-8'));
            expect(savedData.guilds['test-guild'].totalCurrency).toBe(200);
        });
    });

    describe('Guild and User Management', () => {
        test('should ensure guild exists', () => {
            const guildId = 'test-guild-123';
            economyManager.ensureGuildExists(guildId);
            
            expect(economyManager.economy.guilds[guildId]).toBeDefined();
            expect(economyManager.economy.guilds[guildId].totalCurrency).toBe(0);
            expect(economyManager.economy.guilds[guildId].baseValue).toBe(1.0);
            expect(economyManager.economy.guilds[guildId].users).toEqual({});
        });

        test('should ensure user exists', () => {
            const guildId = 'test-guild-123';
            const userId = 'test-user-456';
            
            economyManager.ensureUserExists(guildId, userId);
            
            expect(economyManager.economy.guilds[guildId]).toBeDefined();
            expect(economyManager.economy.guilds[guildId].users[userId]).toBeDefined();
            expect(economyManager.economy.guilds[guildId].users[userId].balance).toBe(0);
            expect(economyManager.economy.guilds[guildId].users[userId].totalEarned).toBe(0);
            expect(economyManager.economy.guilds[guildId].users[userId].totalSpent).toBe(0);
        });

        test('should not overwrite existing guild data', () => {
            const guildId = 'test-guild-123';
            
            economyManager.ensureGuildExists(guildId);
            economyManager.economy.guilds[guildId].totalCurrency = 500;
            
            economyManager.ensureGuildExists(guildId);
            expect(economyManager.economy.guilds[guildId].totalCurrency).toBe(500);
        });

        test('should not overwrite existing user data', () => {
            const guildId = 'test-guild-123';
            const userId = 'test-user-456';
            
            economyManager.ensureUserExists(guildId, userId);
            economyManager.economy.guilds[guildId].users[userId].balance = 100;
            
            economyManager.ensureUserExists(guildId, userId);
            expect(economyManager.economy.guilds[guildId].users[userId].balance).toBe(100);
        });
    });

    describe('Balance Operations', () => {
        test('should get user balance', async () => {
            const guildId = 'test-guild-123';
            const userId = 'test-user-456';
            
            const balance = await economyManager.getBalance(userId, guildId);
            expect(balance).toBe(0);
            
            // Set a balance and test again
            economyManager.ensureUserExists(guildId, userId);
            economyManager.economy.guilds[guildId].users[userId].balance = 150;
            
            const newBalance = await economyManager.getBalance(userId, guildId);
            expect(newBalance).toBe(150);
        });

        test('should handle errors when getting balance', async () => {
            // Test with invalid parameters
            const balance = await economyManager.getBalance(null, null);
            expect(balance).toBe(0);
        });
    });

    describe('Currency Addition', () => {
        test('should add currency to user balance', async () => {
            const guildId = 'test-guild-123';
            const userId = 'test-user-456';
            const amount = 100;
            
            const result = await economyManager.addCurrency(userId, guildId, amount, 'Test reward');
            
            expect(result.success).toBe(true);
            expect(result.newBalance).toBe(100);
            expect(result.reason).toBe('Test reward');
            
            const user = economyManager.economy.guilds[guildId].users[userId];
            expect(user.balance).toBe(100);
            expect(user.totalEarned).toBe(100);
            expect(economyManager.economy.guilds[guildId].totalCurrency).toBe(100);
        });

        test('should reject negative amounts', async () => {
            const result = await economyManager.addCurrency('user', 'guild', -50);
            
            expect(result.success).toBe(false);
            expect(result.message).toBe('Amount must be positive');
        });

        test('should reject zero amounts', async () => {
            const result = await economyManager.addCurrency('user', 'guild', 0);
            
            expect(result.success).toBe(false);
            expect(result.message).toBe('Amount must be positive');
        });

        test('should update timestamps on currency addition', async () => {
            const guildId = 'test-guild-123';
            const userId = 'test-user-456';
            
            const beforeTime = new Date();
            await economyManager.addCurrency(userId, guildId, 50);
            const afterTime = new Date();
            
            const user = economyManager.economy.guilds[guildId].users[userId];
            const guild = economyManager.economy.guilds[guildId];
            
            const userActivityTime = new Date(user.lastActivity);
            const guildUpdateTime = new Date(guild.lastUpdate);
            
            expect(userActivityTime.getTime()).toBeGreaterThanOrEqual(beforeTime.getTime());
            expect(userActivityTime.getTime()).toBeLessThanOrEqual(afterTime.getTime());
            expect(guildUpdateTime.getTime()).toBeGreaterThanOrEqual(beforeTime.getTime());
            expect(guildUpdateTime.getTime()).toBeLessThanOrEqual(afterTime.getTime());
        });
    });

    describe('Currency Removal', () => {
        test('should remove currency from user balance', async () => {
            const guildId = 'test-guild-123';
            const userId = 'test-user-456';
            
            // First add some currency
            await economyManager.addCurrency(userId, guildId, 200);
            
            // Then remove some
            const result = await economyManager.removeCurrency(userId, guildId, 75, 'Test purchase');
            
            expect(result.success).toBe(true);
            expect(result.newBalance).toBe(125);
            expect(result.reason).toBe('Test purchase');
            
            const user = economyManager.economy.guilds[guildId].users[userId];
            expect(user.balance).toBe(125);
            expect(user.totalSpent).toBe(75);
            expect(economyManager.economy.guilds[guildId].totalCurrency).toBe(125);
        });

        test('should reject removal when insufficient balance', async () => {
            const guildId = 'test-guild-123';
            const userId = 'test-user-456';
            
            await economyManager.addCurrency(userId, guildId, 50);
            
            const result = await economyManager.removeCurrency(userId, guildId, 100);
            
            expect(result.success).toBe(false);
            expect(result.message).toBe('Insufficient balance');
        });

        test('should reject negative amounts for removal', async () => {
            const result = await economyManager.removeCurrency('user', 'guild', -25);
            
            expect(result.success).toBe(false);
            expect(result.message).toBe('Amount must be positive');
        });
    });

    describe('Currency Transfer', () => {
        test('should transfer currency between users', async () => {
            const guildId = 'test-guild-123';
            const fromUserId = 'user-from';
            const toUserId = 'user-to';
            
            // Give sender some currency
            await economyManager.addCurrency(fromUserId, guildId, 200);
            
            const result = await economyManager.transferCurrency(fromUserId, toUserId, guildId, 75);
            
            expect(result.success).toBe(true);
            expect(result.fromBalance).toBe(125);
            expect(result.toBalance).toBe(75);
            
            const fromUser = economyManager.economy.guilds[guildId].users[fromUserId];
            const toUser = economyManager.economy.guilds[guildId].users[toUserId];
            
            expect(fromUser.balance).toBe(125);
            expect(fromUser.totalSpent).toBe(75);
            expect(toUser.balance).toBe(75);
            expect(toUser.totalEarned).toBe(75);
            
            // Total currency should remain the same
            expect(economyManager.economy.guilds[guildId].totalCurrency).toBe(200);
        });

        test('should reject transfer to self', async () => {
            const result = await economyManager.transferCurrency('user1', 'user1', 'guild', 50);
            
            expect(result.success).toBe(false);
            expect(result.message).toBe('Cannot transfer to yourself');
        });

        test('should reject transfer with insufficient balance', async () => {
            const guildId = 'test-guild-123';
            const fromUserId = 'user-from';
            const toUserId = 'user-to';
            
            await economyManager.addCurrency(fromUserId, guildId, 30);
            
            const result = await economyManager.transferCurrency(fromUserId, toUserId, guildId, 50);
            
            expect(result.success).toBe(false);
            expect(result.message).toBe('Insufficient balance');
        });

        test('should reject negative transfer amounts', async () => {
            const result = await economyManager.transferCurrency('user1', 'user2', 'guild', -25);
            
            expect(result.success).toBe(false);
            expect(result.message).toBe('Amount must be positive');
        });
    });

    describe('Activity Rewards', () => {
        test('should award currency for message activity', async () => {
            const guildId = 'test-guild-123';
            const userId = 'test-user-456';
            
            const result = await economyManager.awardActivity(userId, guildId, 'message');
            
            expect(result.success).toBe(true);
            expect(result.newBalance).toBe(1); // Default message reward
            expect(result.reason).toBe('Activity: message');
        });

        test('should award currency for reaction activity', async () => {
            const guildId = 'test-guild-123';
            const userId = 'test-user-456';
            
            const result = await economyManager.awardActivity(userId, guildId, 'reaction');
            
            expect(result.success).toBe(true);
            expect(result.newBalance).toBe(0.5); // Default reaction reward
        });

        test('should award currency for voice activity with multiplier', async () => {
            const guildId = 'test-guild-123';
            const userId = 'test-user-456';
            
            const result = await economyManager.awardActivity(userId, guildId, 'voice', 5); // 5 minutes
            
            expect(result.success).toBe(true);
            expect(result.newBalance).toBe(10); // 2 per minute * 5 minutes
        });

        test('should reject invalid activity types', async () => {
            const result = await economyManager.awardActivity('user', 'guild', 'invalid');
            
            expect(result.success).toBe(false);
            expect(result.message).toBe('Invalid activity type');
        });
    });

    describe('Daily Bonus', () => {
        test('should allow claiming daily bonus', async () => {
            const guildId = 'test-guild-123';
            const userId = 'test-user-456';
            
            const result = await economyManager.claimDailyBonus(userId, guildId);
            
            expect(result.success).toBe(true);
            expect(result.newBalance).toBe(50); // Default daily bonus
            
            const user = economyManager.economy.guilds[guildId].users[userId];
            expect(user.lastDailyBonus).toBeDefined();
        });

        test('should prevent claiming daily bonus twice in same day', async () => {
            const guildId = 'test-guild-123';
            const userId = 'test-user-456';
            
            // Claim first time
            const result1 = await economyManager.claimDailyBonus(userId, guildId);
            expect(result1.success).toBe(true);
            
            // Try to claim again
            const result2 = await economyManager.claimDailyBonus(userId, guildId);
            expect(result2.success).toBe(false);
            expect(result2.message).toBe('Daily bonus already claimed today');
        });
    });

    describe('User Statistics', () => {
        test('should get comprehensive user statistics', async () => {
            const guildId = 'test-guild-123';
            const userId = 'test-user-456';
            
            // Add some activity
            await economyManager.addCurrency(userId, guildId, 100);
            await economyManager.removeCurrency(userId, guildId, 25);
            await economyManager.claimDailyBonus(userId, guildId);
            
            const stats = await economyManager.getUserStats(userId, guildId);
            
            expect(stats).toBeDefined();
            expect(stats.balance).toBe(125); // 100 - 25 + 50 (daily bonus)
            expect(stats.totalEarned).toBe(150); // 100 + 50
            expect(stats.totalSpent).toBe(25);
            expect(stats.lastActivity).toBeDefined();
            expect(stats.lastDailyBonus).toBeDefined();
            expect(stats.currentValue).toBeGreaterThan(0); // Market value should be positive
            expect(stats.canClaimDaily).toBe(false);
        });

        test('should handle errors when getting user stats', async () => {
            const stats = await economyManager.getUserStats(null, null);
            expect(stats).toBeNull();
        });
    });

    describe('Validation', () => {
        test('should validate transaction data correctly', () => {
            const validResult = economyManager.validateTransaction('user123', 'guild456', 100);
            expect(validResult.isValid).toBe(true);
            expect(validResult.errors).toHaveLength(0);
        });

        test('should reject invalid user ID', () => {
            const result = economyManager.validateTransaction('', 'guild456', 100);
            expect(result.isValid).toBe(false);
            expect(result.errors).toContain('Valid userId is required');
        });

        test('should reject invalid guild ID', () => {
            const result = economyManager.validateTransaction('user123', null, 100);
            expect(result.isValid).toBe(false);
            expect(result.errors).toContain('Valid guildId is required');
        });

        test('should reject invalid amounts', () => {
            const result1 = economyManager.validateTransaction('user123', 'guild456', 'invalid');
            expect(result1.isValid).toBe(false);
            expect(result1.errors).toContain('Amount must be a valid number');
            
            const result2 = economyManager.validateTransaction('user123', 'guild456', -50);
            expect(result2.isValid).toBe(false);
            expect(result2.errors).toContain('Amount must be positive');
            
            const result3 = economyManager.validateTransaction('user123', 'guild456', 2000000);
            expect(result3.isValid).toBe(false);
            expect(result3.errors).toContain('Amount exceeds maximum limit');
        });
    });

    describe('Error Handling', () => {
        test('should handle file system errors gracefully', async () => {
            // Create manager with truly invalid path (null character in Windows)
            const invalidPath = process.platform === 'win32' ? 'C:\\invalid\x00path\\economy.json' : '/dev/null/invalid/economy.json';
            const invalidManager = new EconomyManager(invalidPath);
            
            const result = await invalidManager.addCurrency('user', 'guild', 50);
            expect(result.success).toBe(false);
        });

        test('should handle concurrent operations', async () => {
            const guildId = 'test-guild-123';
            const userId = 'test-user-456';
            
            // Simulate concurrent operations
            const promises = [
                economyManager.addCurrency(userId, guildId, 10),
                economyManager.addCurrency(userId, guildId, 20),
                economyManager.addCurrency(userId, guildId, 30)
            ];
            
            const results = await Promise.all(promises);
            
            // All operations should succeed
            results.forEach(result => {
                expect(result.success).toBe(true);
            });
            
            // Final balance should be correct
            const finalBalance = await economyManager.getBalance(userId, guildId);
            expect(finalBalance).toBe(60);
        });
    });

    describe('Market Dynamics', () => {
        test('should calculate market value based on currency circulation', async () => {
            const guildId = 'test-guild-123';
            const userId = 'test-user-456';
            
            // Start with base value
            let marketValue = await economyManager.calculateMarketValue(guildId);
            expect(marketValue).toBe(1.0); // Base value
            
            // Add currency below inflation threshold
            await economyManager.addCurrency(userId, guildId, 5000);
            marketValue = await economyManager.calculateMarketValue(guildId);
            expect(marketValue).toBe(1.0); // Should still be base value
            
            // Add currency above inflation threshold
            await economyManager.addCurrency(userId, guildId, 10000);
            marketValue = await economyManager.calculateMarketValue(guildId);
            expect(marketValue).toBeLessThan(1.0); // Should decrease due to inflation
        });

        test('should handle deflation when currency is scarce', async () => {
            const guildId = 'test-guild-123';
            
            // Ensure guild exists first
            economyManager.ensureGuildExists(guildId);
            
            // Set total currency below deflation threshold
            economyManager.economy.guilds[guildId].totalCurrency = 500;
            
            const marketValue = await economyManager.calculateMarketValue(guildId);
            expect(marketValue).toBeGreaterThan(1.0); // Should increase due to deflation
        });

        test('should update inflation rate correctly', async () => {
            const guildId = 'test-guild-123';
            const userId = 'test-user-456';
            
            // Set initial state
            await economyManager.addCurrency(userId, guildId, 5000);
            const initialValue = await economyManager.calculateMarketValue(guildId);
            
            // Add more currency to cause inflation
            await economyManager.addCurrency(userId, guildId, 10000);
            const inflationResult = await economyManager.updateInflation(guildId);
            
            expect(inflationResult.success).toBe(true);
            expect(inflationResult.previousValue).toBeDefined();
            expect(inflationResult.newValue).toBeDefined();
            expect(inflationResult.inflationRate).toBeDefined();
            expect(inflationResult.trend).toMatch(/inflation|deflation|stable/);
        });

        test('should get comprehensive economic statistics', async () => {
            const guildId = 'test-guild-123';
            const userId1 = 'user-1';
            const userId2 = 'user-2';
            
            // Add some economic activity
            await economyManager.addCurrency(userId1, guildId, 1000);
            await economyManager.addCurrency(userId2, guildId, 500);
            await economyManager.removeCurrency(userId1, guildId, 200);
            
            const stats = await economyManager.getEconomicStats(guildId);
            
            expect(stats).toBeDefined();
            expect(stats.guild).toHaveProperty('totalCurrency');
            expect(stats.guild).toHaveProperty('currentValue');
            expect(stats.guild).toHaveProperty('inflationRate');
            expect(stats.users).toHaveProperty('count');
            expect(stats.users).toHaveProperty('averageBalance');
            expect(stats.users).toHaveProperty('totalEarned');
            expect(stats.users).toHaveProperty('totalSpent');
            expect(stats.market).toHaveProperty('velocityOfMoney');
            expect(stats.market).toHaveProperty('marketHealth');
            
            expect(stats.users.count).toBe(2);
            expect(stats.users.totalEarned).toBe(1500);
            expect(stats.users.totalSpent).toBe(200);
        });

        test('should calculate market health score', () => {
            const guild = {
                totalCurrency: 5000,
                config: {
                    baseValue: 1.0,
                    inflationThreshold: 10000
                },
                inflationRate: 5,
                users: {
                    'user1': { balance: 100 },
                    'user2': { balance: 200 },
                    'user3': { balance: 150 }
                }
            };
            
            const healthScore = economyManager.calculateMarketHealth(guild, 1.0);
            
            expect(healthScore).toBeGreaterThanOrEqual(0);
            expect(healthScore).toBeLessThanOrEqual(100);
            expect(typeof healthScore).toBe('number');
        });

        test('should simulate market dynamics over time', async () => {
            const guildId = 'test-guild-123';
            const userId = 'test-user-456';
            
            // Set up initial economy state
            await economyManager.addCurrency(userId, guildId, 5000);
            
            const simulation = await economyManager.simulateMarketDynamics(guildId, 10);
            
            expect(Array.isArray(simulation)).toBe(true);
            expect(simulation).toHaveLength(10);
            
            simulation.forEach((day, index) => {
                expect(day).toHaveProperty('day');
                expect(day).toHaveProperty('totalCurrency');
                expect(day).toHaveProperty('marketValue');
                expect(day).toHaveProperty('activity');
                expect(day).toHaveProperty('trend');
                expect(day.day).toBe(index + 1);
                expect(day.marketValue).toBeGreaterThan(0);
            });
        });

        test('should adjust market parameters', async () => {
            const guildId = 'test-guild-123';
            
            const adjustments = {
                inflationThreshold: 15000,
                deflationThreshold: 800,
                baseValue: 1.2,
                messageReward: 2,
                dailyBonus: 75
            };
            
            const result = await economyManager.adjustMarketParameters(guildId, adjustments);
            
            expect(result.success).toBe(true);
            expect(result.newConfig).toBeDefined();
            expect(result.newConfig.inflationThreshold).toBe(15000);
            expect(result.newConfig.deflationThreshold).toBe(800);
            expect(result.newConfig.baseValue).toBe(1.2);
            expect(result.newConfig.messageReward).toBe(2);
            expect(result.newConfig.dailyBonus).toBe(75);
        });

        test('should reject invalid parameter adjustments', async () => {
            const guildId = 'test-guild-123';
            
            const invalidAdjustments = {
                inflationThreshold: -1000,
                baseValue: -0.5,
                messageReward: -10
            };
            
            const result = await economyManager.adjustMarketParameters(guildId, invalidAdjustments);
            
            expect(result.success).toBe(true);
            // Invalid values should be ignored, so config should remain unchanged
            const guild = economyManager.economy.guilds[guildId];
            expect(guild.config.inflationThreshold).toBe(10000); // Default value
            expect(guild.config.baseValue).toBe(1.0); // Default value
        });

        test('should handle market calculation errors gracefully', async () => {
            const invalidGuildId = null;
            
            const marketValue = await economyManager.calculateMarketValue(invalidGuildId);
            expect(marketValue).toBe(1.0); // Should return default base value
            
            const stats = await economyManager.getEconomicStats(invalidGuildId);
            expect(stats).toBeDefined(); // getEconomicStats creates guild if it doesn't exist
        });

        test('should maintain market value bounds', async () => {
            const guildId = 'test-guild-123';
            
            // Ensure guild exists first
            economyManager.ensureGuildExists(guildId);
            
            // Test extreme inflation scenario
            economyManager.economy.guilds[guildId].totalCurrency = 1000000;
            let marketValue = await economyManager.calculateMarketValue(guildId);
            expect(marketValue).toBeGreaterThanOrEqual(0.1);
            
            // Test extreme deflation scenario
            economyManager.economy.guilds[guildId].totalCurrency = 1;
            marketValue = await economyManager.calculateMarketValue(guildId);
            expect(marketValue).toBeLessThanOrEqual(10.0);
        });
    });

    describe('Shop System', () => {
        test('should get default shop items', async () => {
            const guildId = 'test-guild-123';
            
            const shopItems = await economyManager.getShopItems(guildId);
            
            expect(Array.isArray(shopItems)).toBe(true);
            expect(shopItems.length).toBeGreaterThan(0);
            
            // Check that each item has required properties
            shopItems.forEach(item => {
                expect(item).toHaveProperty('id');
                expect(item).toHaveProperty('name');
                expect(item).toHaveProperty('basePrice');
                expect(item).toHaveProperty('currentPrice');
                expect(item).toHaveProperty('stock');
                expect(item).toHaveProperty('category');
            });
        });

        test('should update item prices based on market dynamics', async () => {
            const guildId = 'test-guild-123';
            
            // Get initial prices
            const initialItems = await economyManager.getShopItems(guildId);
            const initialPrice = initialItems[0].currentPrice;
            
            // Change market conditions by adding lots of currency (inflation)
            await economyManager.addCurrency('user1', guildId, 20000);
            
            // Update prices
            await economyManager.updateItemPrices(guildId);
            
            // Get updated prices
            const updatedItems = await economyManager.getShopItems(guildId);
            const updatedPrice = updatedItems[0].currentPrice;
            
            // Prices should change due to market dynamics
            expect(updatedPrice).not.toBe(initialPrice);
        });

        test('should successfully purchase an item', async () => {
            const guildId = 'test-guild-123';
            const userId = 'test-user-456';
            
            // Give user some currency
            await economyManager.addCurrency(userId, guildId, 500);
            
            // Get shop items
            const shopItems = await economyManager.getShopItems(guildId);
            const itemToPurchase = shopItems[0];
            
            // Purchase the item
            const result = await economyManager.purchaseItem(userId, guildId, itemToPurchase.id);
            
            expect(result.success).toBe(true);
            expect(result.item.id).toBe(itemToPurchase.id);
            expect(result.newBalance).toBe(500 - itemToPurchase.currentPrice);
            
            // Check that purchase was recorded
            const purchases = await economyManager.getUserPurchases(userId, guildId);
            expect(purchases.totalPurchases).toBe(1);
            expect(purchases.items[itemToPurchase.id]).toBeDefined();
            expect(purchases.items[itemToPurchase.id].count).toBe(1);
        });

        test('should reject purchase with insufficient balance', async () => {
            const guildId = 'test-guild-123';
            const userId = 'test-user-456';
            
            // Give user minimal currency
            await economyManager.addCurrency(userId, guildId, 10);
            
            // Get shop items
            const shopItems = await economyManager.getShopItems(guildId);
            const expensiveItem = shopItems.find(item => item.currentPrice > 10);
            
            if (expensiveItem) {
                const result = await economyManager.purchaseItem(userId, guildId, expensiveItem.id);
                
                expect(result.success).toBe(false);
                expect(result.message).toContain('Insufficient balance');
            }
        });

        test('should reject purchase of non-existent item', async () => {
            const guildId = 'test-guild-123';
            const userId = 'test-user-456';
            
            await economyManager.addCurrency(userId, guildId, 500);
            
            const result = await economyManager.purchaseItem(userId, guildId, 'non_existent_item');
            
            expect(result.success).toBe(false);
            expect(result.message).toBe('Item not found in shop');
        });

        test('should handle stock limitations', async () => {
            const guildId = 'test-guild-123';
            const userId = 'test-user-456';
            
            // Add a limited stock item
            await economyManager.addShopItem(guildId, {
                name: 'Limited Item',
                basePrice: 50,
                stock: 1,
                category: 'limited'
            });
            
            await economyManager.addCurrency(userId, guildId, 200);
            
            // First purchase should succeed
            const result1 = await economyManager.purchaseItem(userId, guildId, 'limited_item');
            expect(result1.success).toBe(true);
            
            // Second purchase should fail due to stock
            const result2 = await economyManager.purchaseItem(userId, guildId, 'limited_item');
            expect(result2.success).toBe(false);
            expect(result2.message).toBe('Item is out of stock');
        });

        test('should add new shop items', async () => {
            const guildId = 'test-guild-123';
            
            const itemData = {
                name: 'Test Item',
                description: 'A test item for testing',
                basePrice: 100,
                stock: 5,
                category: 'test'
            };
            
            const result = await economyManager.addShopItem(guildId, itemData);
            
            expect(result.success).toBe(true);
            expect(result.itemId).toBeDefined();
            
            // Verify item was added
            const shopItems = await economyManager.getShopItems(guildId);
            const addedItem = shopItems.find(item => item.name === 'Test Item');
            expect(addedItem).toBeDefined();
            expect(addedItem.basePrice).toBe(100);
            expect(addedItem.stock).toBe(5);
        });

        test('should validate shop item data', () => {
            const validItem = {
                name: 'Valid Item',
                basePrice: 50
            };
            
            const invalidItem = {
                name: '',
                basePrice: -10
            };
            
            const validResult = economyManager.validateShopItem(validItem);
            expect(validResult.isValid).toBe(true);
            
            const invalidResult = economyManager.validateShopItem(invalidItem);
            expect(invalidResult.isValid).toBe(false);
            expect(invalidResult.errors.length).toBeGreaterThan(0);
        });

        test('should get shop statistics', async () => {
            const guildId = 'test-guild-123';
            const userId = 'test-user-456';
            
            // Add currency and make some purchases
            await economyManager.addCurrency(userId, guildId, 1000);
            
            const shopItems = await economyManager.getShopItems(guildId);
            await economyManager.purchaseItem(userId, guildId, shopItems[0].id);
            await economyManager.purchaseItem(userId, guildId, shopItems[1].id);
            
            const stats = await economyManager.getShopStats(guildId);
            
            expect(stats).toHaveProperty('totalItems');
            expect(stats).toHaveProperty('totalPurchases');
            expect(stats).toHaveProperty('totalRevenue');
            expect(stats).toHaveProperty('popularItems');
            expect(stats).toHaveProperty('categories');
            
            expect(stats.totalItems).toBeGreaterThan(0);
            expect(stats.totalPurchases).toBeGreaterThanOrEqual(2);
            expect(Array.isArray(stats.popularItems)).toBe(true);
        });

        test('should track user purchase history', async () => {
            const guildId = 'test-guild-123';
            const userId = 'test-user-456';
            
            await economyManager.addCurrency(userId, guildId, 500);
            
            const shopItems = await economyManager.getShopItems(guildId);
            const item = shopItems[0];
            
            // Make multiple purchases
            const purchase1 = await economyManager.purchaseItem(userId, guildId, item.id);
            const purchase2 = await economyManager.purchaseItem(userId, guildId, item.id);
            
            const purchases = await economyManager.getUserPurchases(userId, guildId);
            
            expect(purchases.totalPurchases).toBe(2);
            expect(purchases.items[item.id]).toBeDefined();
            expect(purchases.items[item.id].count).toBe(2);
            // Total spent should be the sum of actual purchase prices (which may change due to dynamic pricing)
            expect(purchases.items[item.id].totalSpent).toBeGreaterThan(0);
            expect(purchases.items[item.id].lastPurchase).toBeDefined();
        });

        test('should generate valid item IDs', () => {
            const id1 = economyManager.generateItemId('Test Item Name');
            const id2 = economyManager.generateItemId('Special!@# Characters$%^');
            
            expect(id1).toBe('test_item_name');
            expect(id2).toBe('special_characters');
            expect(id1.length).toBeLessThanOrEqual(20);
            expect(id2.length).toBeLessThanOrEqual(20);
        });

        test('should handle price bounds correctly', async () => {
            const guildId = 'test-guild-123';
            
            // Add an item with very low base price
            await economyManager.addShopItem(guildId, {
                name: 'Cheap Item',
                basePrice: 1
            });
            
            // Create extreme market conditions
            await economyManager.addCurrency('user1', guildId, 100000);
            await economyManager.updateItemPrices(guildId);
            
            const shopItems = await economyManager.getShopItems(guildId);
            const cheapItem = shopItems.find(item => item.name === 'Cheap Item');
            
            // Price should not go below 10% of base price
            expect(cheapItem.currentPrice).toBeGreaterThanOrEqual(0.1);
            
            // Price should not exceed 500% of base price
            expect(cheapItem.currentPrice).toBeLessThanOrEqual(5);
        });
    });

    describe('Reload Functionality', () => {
        test('should reload economy data from file', async () => {
            const guildId = 'test-guild-123';
            const userId = 'test-user-456';
            
            // Add some data
            await economyManager.addCurrency(userId, guildId, 100);
            await economyManager.saveEconomy();
            
            // Modify in-memory data
            economyManager.economy.guilds[guildId].users[userId].balance = 999;
            
            // Reload should restore from file
            await economyManager.reload();
            
            const balance = await economyManager.getBalance(userId, guildId);
            expect(balance).toBe(100);
        });

        test('should handle reload errors gracefully', async () => {
            // Delete the file to cause an error
            if (fs.existsSync(TEST_ECONOMY_FILE)) {
                fs.unlinkSync(TEST_ECONOMY_FILE);
            }
            
            await expect(economyManager.reload()).resolves.not.toThrow();
        });
    });
});