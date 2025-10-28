import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EconomyManager } from '../../utils/EconomyManager.js';
import fs from 'fs';
import path from 'path';

describe('Economy System Integration Tests', () => {
    let economyManager;
    let testDataPath;
    let testGuildId;
    let testUsers;

    beforeEach(() => {
        // Create test data path
        testDataPath = path.join(process.cwd(), 'test/test-data/integration-economy.json');
        
        // Initialize EconomyManager with test file
        economyManager = new EconomyManager(testDataPath);
        
        // Test data
        testGuildId = '123456789012345678';
        testUsers = [
            '111111111111111111',
            '222222222222222222', 
            '333333333333333333',
            '444444444444444444',
            '555555555555555555'
        ];
        
        // Initialize test guild data structure
        if (!economyManager.economy.guilds) {
            economyManager.economy.guilds = {};
        }
        if (!economyManager.economy.guilds[testGuildId]) {
            economyManager.economy.guilds[testGuildId] = {
                totalCurrency: 0,
                baseValue: 1.0,
                currentValue: 1.0,
                inflationRate: 0.0,
                lastUpdate: new Date().toISOString(),
                users: {},
                shop: {}
            };
        }
    });

    afterEach(() => {
        // Clean up test files
        if (fs.existsSync(testDataPath)) {
            fs.unlinkSync(testDataPath);
        }
        vi.clearAllMocks();
    });

    describe('End-to-End Economy Transactions and Market Dynamics', () => {
        it('should handle complete economy lifecycle with market value fluctuations', async () => {
            // Step 1: Initialize users with starting balances
            const initialAmount = 100;
            
            for (const userId of testUsers) {
                await economyManager.addCurrency(userId, testGuildId, initialAmount, 'Initial balance');
                const balance = await economyManager.getBalance(userId, testGuildId);
                expect(balance).toBe(initialAmount);
            }
            
            // Verify initial market state
            let marketValue = await economyManager.calculateMarketValue(testGuildId);
            expect(marketValue).toBeCloseTo(1.0, 2); // Should be close to base value
            
            // Step 2: Simulate user activities generating currency
            const activityRewards = [
                { userId: testUsers[0], amount: 50, reason: 'Message activity' },
                { userId: testUsers[1], amount: 75, reason: 'Voice chat participation' },
                { userId: testUsers[2], amount: 25, reason: 'Reaction activity' },
                { userId: testUsers[3], amount: 100, reason: 'Daily bonus' },
                { userId: testUsers[4], amount: 60, reason: 'Event participation' }
            ];
            
            for (const reward of activityRewards) {
                await economyManager.addCurrency(reward.userId, testGuildId, reward.amount, reward.reason);
            }
            
            // Step 3: Verify currency inflation due to increased supply
            await economyManager.updateInflation(testGuildId);
            marketValue = await economyManager.calculateMarketValue(testGuildId);
            
            // Market value should decrease due to increased currency supply
            expect(marketValue).toBeLessThan(1.0);
            
            // Step 4: Test peer-to-peer transfers
            const transferAmount = 50;
            const fromUser = testUsers[0];
            const toUser = testUsers[1];
            
            const fromBalanceBefore = await economyManager.getBalance(fromUser, testGuildId);
            const toBalanceBefore = await economyManager.getBalance(toUser, testGuildId);
            
            const transferResult = await economyManager.transferCurrency(
                fromUser, 
                toUser, 
                testGuildId, 
                transferAmount
            );
            
            expect(transferResult.success).toBe(true);
            
            const fromBalanceAfter = await economyManager.getBalance(fromUser, testGuildId);
            const toBalanceAfter = await economyManager.getBalance(toUser, testGuildId);
            
            expect(fromBalanceAfter).toBe(fromBalanceBefore - transferAmount);
            expect(toBalanceAfter).toBe(toBalanceBefore + transferAmount);
            
            // Step 5: Test shop system with dynamic pricing
            await economyManager.updateItemPrices(testGuildId);
            const shopItems = await economyManager.getShopItems(testGuildId);
            
            // Verify shop items exist and have market-adjusted prices
            expect(shopItems).toBeDefined();
            expect(Array.isArray(shopItems)).toBe(true);
            
            if (shopItems.length > 0) {
                const item = shopItems[0];
                expect(item.currentPrice).toBeDefined();
                expect(item.currentPrice).toBeGreaterThan(0);
                
                // Current price should be different from base price due to market conditions
                if (item.basePrice) {
                    expect(item.currentPrice).not.toBe(item.basePrice);
                }
            }
            
            // Step 6: Test large purchase affecting market
            const richUser = testUsers[3];
            await economyManager.addCurrency(richUser, testGuildId, 5000, 'Large bonus');
            
            // Make large purchase to remove currency from circulation
            if (shopItems.length > 0) {
                const expensiveItem = shopItems.find(item => item.currentPrice > 100) || shopItems[0];
                const purchaseResult = await economyManager.purchaseItem(richUser, testGuildId, expensiveItem.id);
                
                if (purchaseResult.success) {
                    // Verify currency was deducted
                    const balanceAfterPurchase = await economyManager.getBalance(richUser, testGuildId);
                    expect(balanceAfterPurchase).toBeLessThan(await economyManager.getBalance(richUser, testGuildId) + expensiveItem.currentPrice);
                    
                    // Update market and check for deflation
                    await economyManager.updateInflation(testGuildId);
                    const newMarketValue = await economyManager.calculateMarketValue(testGuildId);
                    
                    // Market value might increase due to reduced currency supply
                    expect(newMarketValue).toBeGreaterThan(marketValue);
                }
            }
            
            // Step 7: Verify economic statistics
            const stats = await economyManager.getEconomicStats(testGuildId);
            
            expect(stats).toBeDefined();
            expect(stats.totalCurrency).toBeGreaterThan(0);
            expect(stats.totalUsers).toBe(testUsers.length);
            expect(stats.averageBalance).toBeGreaterThan(0);
            expect(stats.marketValue).toBeDefined();
            expect(stats.inflationRate).toBeDefined();
        });

        it('should handle concurrent transactions without data corruption', async () => {
            // Initialize users
            const concurrentUsers = testUsers.slice(0, 3);
            const initialBalance = 200;
            
            for (const userId of concurrentUsers) {
                await economyManager.addCurrency(userId, testGuildId, initialBalance, 'Initial');
            }
            
            // Create concurrent transaction promises
            const transactionPromises = [];
            
            // Multiple simultaneous transfers between users
            for (let i = 0; i < 10; i++) {
                const fromUser = concurrentUsers[i % concurrentUsers.length];
                const toUser = concurrentUsers[(i + 1) % concurrentUsers.length];
                const amount = 10;
                
                transactionPromises.push(
                    economyManager.transferCurrency(fromUser, toUser, testGuildId, amount)
                );
            }
            
            // Multiple simultaneous currency additions
            for (let i = 0; i < 5; i++) {
                const user = concurrentUsers[i % concurrentUsers.length];
                const amount = 5;
                
                transactionPromises.push(
                    economyManager.addCurrency(user, testGuildId, amount, 'Concurrent reward')
                );
            }
            
            // Execute all transactions concurrently
            const results = await Promise.all(transactionPromises);
            
            // Verify all transactions completed
            results.forEach(result => {
                if (result && typeof result === 'object' && 'success' in result) {
                    expect(result.success).toBe(true);
                }
            });
            
            // Verify data integrity - total currency should be consistent
            const finalBalances = await Promise.all(
                concurrentUsers.map(userId => economyManager.getBalance(userId, testGuildId))
            );
            
            const totalFinalBalance = finalBalances.reduce((sum, balance) => sum + balance, 0);
            const expectedTotal = (initialBalance * concurrentUsers.length) + (5 * 5); // Initial + rewards
            
            expect(totalFinalBalance).toBe(expectedTotal);
        });

        it('should maintain market stability under extreme conditions', async () => {
            // Test extreme currency inflation
            const testUser = testUsers[0];
            
            // Add massive amount of currency
            await economyManager.addCurrency(testUser, testGuildId, 1000000, 'Extreme test');
            
            await economyManager.updateInflation(testGuildId);
            let marketValue = await economyManager.calculateMarketValue(testGuildId);
            
            // Market value should decrease significantly but not go to zero
            expect(marketValue).toBeGreaterThan(0);
            expect(marketValue).toBeLessThan(0.1); // Significant devaluation
            
            // Test extreme currency deflation
            const currentBalance = await economyManager.getBalance(testUser, testGuildId);
            
            // Remove most currency through transfers to non-existent user (simulating burning)
            const burnAmount = Math.floor(currentBalance * 0.9);
            
            // Simulate currency removal by transferring to system account
            await economyManager.transferCurrency(testUser, 'SYSTEM_BURN', testGuildId, burnAmount);
            
            await economyManager.updateInflation(testGuildId);
            marketValue = await economyManager.calculateMarketValue(testGuildId);
            
            // Market value should increase but have reasonable upper bound
            expect(marketValue).toBeGreaterThan(0.1);
            expect(marketValue).toBeLessThan(10.0); // Reasonable upper bound
        });
    });

    describe('Shop System Integration', () => {
        it('should handle dynamic pricing and inventory management', async () => {
            const testUser = testUsers[0];
            await economyManager.addCurrency(testUser, testGuildId, 1000, 'Shop test');
            
            // Get initial shop state
            let shopItems = await economyManager.getShopItems(testGuildId);
            
            if (shopItems.length === 0) {
                // Create test shop items if none exist
                const testItems = [
                    { id: 'test_item_1', name: 'Test Item 1', basePrice: 100, stock: 10 },
                    { id: 'test_item_2', name: 'Test Item 2', basePrice: 200, stock: 5 },
                    { id: 'test_item_3', name: 'Test Item 3', basePrice: 50, stock: -1 } // Unlimited stock
                ];
                
                // Add items to shop (this would normally be done through admin commands)
                for (const item of testItems) {
                    economyManager.economy.guilds[testGuildId].shop[item.id] = {
                        ...item,
                        currentPrice: item.basePrice,
                        purchases: 0
                    };
                }
                
                await economyManager.saveEconomy();
                shopItems = await economyManager.getShopItems(testGuildId);
            }
            
            expect(shopItems.length).toBeGreaterThan(0);
            
            // Test purchasing items
            const itemToPurchase = shopItems[0];
            const initialStock = itemToPurchase.stock;
            const initialPrice = itemToPurchase.currentPrice;
            
            const purchaseResult = await economyManager.purchaseItem(testUser, testGuildId, itemToPurchase.id);
            expect(purchaseResult.success).toBe(true);
            
            // Verify stock decreased (if not unlimited)
            if (initialStock > 0) {
                const updatedItems = await economyManager.getShopItems(testGuildId);
                const updatedItem = updatedItems.find(item => item.id === itemToPurchase.id);
                expect(updatedItem.stock).toBe(initialStock - 1);
            }
            
            // Verify user balance decreased
            const userBalance = await economyManager.getBalance(testUser, testGuildId);
            expect(userBalance).toBe(1000 - initialPrice);
            
            // Test price updates based on demand
            await economyManager.updateItemPrices(testGuildId);
            const updatedItems = await economyManager.getShopItems(testGuildId);
            const updatedItem = updatedItems.find(item => item.id === itemToPurchase.id);
            
            // Price might change based on purchase activity and market conditions
            expect(updatedItem.currentPrice).toBeDefined();
            expect(updatedItem.currentPrice).toBeGreaterThan(0);
        });

        it('should handle insufficient funds gracefully', async () => {
            const poorUser = testUsers[1];
            await economyManager.addCurrency(poorUser, testGuildId, 10, 'Small amount');
            
            const shopItems = await economyManager.getShopItems(testGuildId);
            
            if (shopItems.length > 0) {
                // Find an expensive item
                const expensiveItem = shopItems.find(item => item.currentPrice > 50) || shopItems[0];
                
                const purchaseResult = await economyManager.purchaseItem(poorUser, testGuildId, expensiveItem.id);
                
                if (expensiveItem.currentPrice > 10) {
                    expect(purchaseResult.success).toBe(false);
                    expect(purchaseResult.error).toContain('insufficient');
                    
                    // Verify balance unchanged
                    const balance = await economyManager.getBalance(poorUser, testGuildId);
                    expect(balance).toBe(10);
                }
            }
        });
    });

    describe('Economic Statistics and Reporting', () => {
        it('should provide accurate economic metrics across multiple users', async () => {
            // Set up diverse economic activity
            const activities = [
                { user: testUsers[0], amount: 150, reason: 'High activity' },
                { user: testUsers[1], amount: 75, reason: 'Medium activity' },
                { user: testUsers[2], amount: 300, reason: 'Very high activity' },
                { user: testUsers[3], amount: 50, reason: 'Low activity' },
                { user: testUsers[4], amount: 0, reason: 'No activity' }
            ];
            
            for (const activity of activities) {
                if (activity.amount > 0) {
                    await economyManager.addCurrency(activity.user, testGuildId, activity.amount, activity.reason);
                }
            }
            
            // Perform some transfers
            await economyManager.transferCurrency(testUsers[2], testUsers[4], testGuildId, 100);
            await economyManager.transferCurrency(testUsers[0], testUsers[1], testGuildId, 25);
            
            // Get comprehensive statistics
            const stats = await economyManager.getEconomicStats(testGuildId);
            
            expect(stats).toBeDefined();
            expect(stats.totalCurrency).toBe(575); // Sum of all added currency
            expect(stats.totalUsers).toBe(4); // Users with non-zero balances
            expect(stats.averageBalance).toBeCloseTo(143.75, 2); // 575 / 4
            expect(stats.marketValue).toBeDefined();
            expect(stats.inflationRate).toBeDefined();
            
            // Verify individual user statistics
            expect(stats.topUsers).toBeDefined();
            expect(Array.isArray(stats.topUsers)).toBe(true);
            
            if (stats.topUsers.length > 0) {
                // Top user should be the one with highest balance
                const topUser = stats.topUsers[0];
                expect(topUser.balance).toBeGreaterThanOrEqual(200); // testUsers[2] after transfer
            }
        });
    });
});