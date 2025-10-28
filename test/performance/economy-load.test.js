import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EconomyManager } from '../../utils/EconomyManager.js';
import fs from 'fs';
import path from 'path';

describe('Economy System Performance Tests', () => {
    let economyManager;
    let testDataPath;
    let testGuildId;

    beforeEach(() => {
        testDataPath = path.join(process.cwd(), 'test/test-data/performance-economy.json');
        economyManager = new EconomyManager(testDataPath);
        testGuildId = '123456789012345678';
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
        if (fs.existsSync(testDataPath)) {
            fs.unlinkSync(testDataPath);
        }
        vi.clearAllMocks();
    });

    describe('High Volume Transaction Performance', () => {
        it('should handle 1000 concurrent currency additions within acceptable time', async () => {
            const startTime = performance.now();
            const userCount = 100;
            const transactionsPerUser = 10;
            const totalTransactions = userCount * transactionsPerUser;
            
            // Generate test users
            const users = Array.from({ length: userCount }, (_, i) => `user_${i}_${Date.now()}`);
            
            // Create concurrent transaction promises
            const transactionPromises = [];
            
            for (const userId of users) {
                for (let i = 0; i < transactionsPerUser; i++) {
                    transactionPromises.push(
                        economyManager.addCurrency(userId, testGuildId, 10, `Transaction ${i}`)
                    );
                }
            }
            
            // Execute all transactions concurrently
            await Promise.all(transactionPromises);
            
            const endTime = performance.now();
            const executionTime = endTime - startTime;
            
            // Performance benchmark: should complete within 5 seconds
            expect(executionTime).toBeLessThan(5000);
            
            // Verify data integrity
            const stats = await economyManager.getEconomicStats(testGuildId);
            expect(stats.totalCurrency).toBe(totalTransactions * 10);
            expect(stats.totalUsers).toBe(userCount);
            
            console.log(`✓ Processed ${totalTransactions} transactions in ${executionTime.toFixed(2)}ms`);
            console.log(`✓ Average: ${(executionTime / totalTransactions).toFixed(2)}ms per transaction`);
        });

        it('should handle 500 concurrent transfers without data corruption', async () => {
            const startTime = performance.now();
            const userCount = 50;
            const transferCount = 500;
            const initialBalance = 1000;
            
            // Initialize users with balances
            const users = Array.from({ length: userCount }, (_, i) => `user_${i}_${Date.now()}`);
            
            for (const userId of users) {
                await economyManager.addCurrency(userId, testGuildId, initialBalance, 'Initial balance');
            }
            
            // Create random transfer pairs
            const transferPromises = [];
            
            for (let i = 0; i < transferCount; i++) {
                const fromUser = users[Math.floor(Math.random() * users.length)];
                const toUser = users[Math.floor(Math.random() * users.length)];
                
                if (fromUser !== toUser) {
                    transferPromises.push(
                        economyManager.transferCurrency(fromUser, toUser, testGuildId, 10)
                    );
                }
            }
            
            // Execute all transfers concurrently
            const results = await Promise.all(transferPromises);
            
            const endTime = performance.now();
            const executionTime = endTime - startTime;
            
            // Performance benchmark: should complete within 3 seconds
            expect(executionTime).toBeLessThan(3000);
            
            // Verify no failed transactions due to race conditions
            const successfulTransfers = results.filter(result => result.success).length;
            const failureRate = (results.length - successfulTransfers) / results.length;
            
            // Allow up to 5% failure rate due to insufficient funds from concurrent operations
            expect(failureRate).toBeLessThan(0.05);
            
            // Verify total currency conservation
            const finalBalances = await Promise.all(
                users.map(userId => economyManager.getBalance(userId, testGuildId))
            );
            
            const totalFinalBalance = finalBalances.reduce((sum, balance) => sum + balance, 0);
            const expectedTotal = userCount * initialBalance;
            
            expect(totalFinalBalance).toBe(expectedTotal);
            
            console.log(`✓ Processed ${transferCount} transfers in ${executionTime.toFixed(2)}ms`);
            console.log(`✓ Success rate: ${((successfulTransfers / results.length) * 100).toFixed(1)}%`);
        });

        it('should maintain performance with large user base (10,000 users)', async () => {
            const startTime = performance.now();
            const userCount = 10000;
            const batchSize = 100;
            
            // Process users in batches to avoid memory issues
            for (let batch = 0; batch < userCount; batch += batchSize) {
                const batchPromises = [];
                
                for (let i = batch; i < Math.min(batch + batchSize, userCount); i++) {
                    const userId = `user_${i}`;
                    batchPromises.push(
                        economyManager.addCurrency(userId, testGuildId, Math.floor(Math.random() * 100) + 1, 'Initial')
                    );
                }
                
                await Promise.all(batchPromises);
            }
            
            const setupTime = performance.now();
            
            // Test market value calculation performance with large dataset
            const marketValue = await economyManager.calculateMarketValue(testGuildId);
            expect(marketValue).toBeGreaterThan(0);
            
            // Test statistics generation performance
            const stats = await economyManager.getEconomicStats(testGuildId);
            expect(stats.totalUsers).toBe(userCount);
            
            const endTime = performance.now();
            const totalTime = endTime - startTime;
            const calculationTime = endTime - setupTime;
            
            // Performance benchmarks
            expect(totalTime).toBeLessThan(30000); // 30 seconds total
            expect(calculationTime).toBeLessThan(1000); // 1 second for calculations
            
            console.log(`✓ Processed ${userCount} users in ${totalTime.toFixed(2)}ms`);
            console.log(`✓ Market calculations took ${calculationTime.toFixed(2)}ms`);
        });
    });

    describe('Market Calculation Performance', () => {
        it('should calculate market dynamics efficiently under various conditions', async () => {
            // Setup diverse economic conditions
            const scenarios = [
                { users: 100, avgBalance: 50, name: 'Small economy' },
                { users: 1000, avgBalance: 200, name: 'Medium economy' },
                { users: 5000, avgBalance: 1000, name: 'Large economy' }
            ];
            
            for (const scenario of scenarios) {
                const scenarioStartTime = performance.now();
                
                // Clear previous data
                economyManager.economy.guilds[testGuildId] = {
                    totalCurrency: 0,
                    baseValue: 1.0,
                    currentValue: 1.0,
                    inflationRate: 0.0,
                    lastUpdate: new Date().toISOString(),
                    users: {},
                    shop: {}
                };
                
                // Setup scenario
                const setupPromises = [];
                for (let i = 0; i < scenario.users; i++) {
                    const userId = `scenario_user_${i}`;
                    const balance = Math.floor(Math.random() * scenario.avgBalance * 2);
                    setupPromises.push(
                        economyManager.addCurrency(userId, testGuildId, balance, 'Scenario setup')
                    );
                }
                
                await Promise.all(setupPromises);
                
                const calculationStartTime = performance.now();
                
                // Test market calculations
                const marketValue = await economyManager.calculateMarketValue(testGuildId);
                await economyManager.updateInflation(testGuildId);
                const stats = await economyManager.getEconomicStats(testGuildId);
                
                const calculationEndTime = performance.now();
                const calculationTime = calculationEndTime - calculationStartTime;
                const totalScenarioTime = calculationEndTime - scenarioStartTime;
                
                // Performance benchmarks scale with user count
                const maxCalculationTime = Math.max(100, scenario.users * 0.1); // 0.1ms per user minimum 100ms
                expect(calculationTime).toBeLessThan(maxCalculationTime);
                
                // Verify calculations are correct
                expect(marketValue).toBeGreaterThan(0);
                expect(stats.totalUsers).toBe(scenario.users);
                expect(stats.averageBalance).toBeCloseTo(scenario.avgBalance, 0);
                
                console.log(`✓ ${scenario.name}: ${scenario.users} users, calculations in ${calculationTime.toFixed(2)}ms`);
            }
        });
    });

    describe('Memory Usage and Resource Management', () => {
        it('should maintain reasonable memory usage during intensive operations', async () => {
            const initialMemory = process.memoryUsage();
            
            // Perform memory-intensive operations
            const operations = [];
            
            // Create many users and transactions
            for (let i = 0; i < 1000; i++) {
                operations.push(
                    economyManager.addCurrency(`memory_test_user_${i}`, testGuildId, 100, 'Memory test')
                );
            }
            
            await Promise.all(operations);
            
            // Force garbage collection if available
            if (global.gc) {
                global.gc();
            }
            
            const finalMemory = process.memoryUsage();
            const memoryIncrease = finalMemory.heapUsed - initialMemory.heapUsed;
            
            // Memory increase should be reasonable (less than 50MB for 1000 users)
            expect(memoryIncrease).toBeLessThan(50 * 1024 * 1024);
            
            console.log(`✓ Memory increase: ${(memoryIncrease / 1024 / 1024).toFixed(2)}MB`);
        });

        it('should handle file I/O efficiently with frequent saves', async () => {
            const startTime = performance.now();
            const saveCount = 100;
            
            // Perform operations that trigger saves
            for (let i = 0; i < saveCount; i++) {
                await economyManager.addCurrency(`save_test_user_${i}`, testGuildId, 10, 'Save test');
                
                // Force save every 10 operations
                if (i % 10 === 0) {
                    await economyManager.saveEconomy();
                }
            }
            
            const endTime = performance.now();
            const executionTime = endTime - startTime;
            
            // Should complete within reasonable time
            expect(executionTime).toBeLessThan(5000);
            
            // Verify file integrity
            const fileStats = fs.statSync(testDataPath);
            expect(fileStats.size).toBeGreaterThan(0);
            
            // Verify data can be loaded correctly
            const loadedData = JSON.parse(fs.readFileSync(testDataPath, 'utf-8'));
            expect(loadedData.guilds[testGuildId]).toBeDefined();
            expect(Object.keys(loadedData.guilds[testGuildId].users)).toHaveLength(saveCount);
            
            console.log(`✓ ${saveCount} operations with saves in ${executionTime.toFixed(2)}ms`);
        });
    });
});