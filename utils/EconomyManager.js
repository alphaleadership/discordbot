import fs from 'fs';
import path from 'path';

export class EconomyManager {
    constructor(filePath = 'data/economy.json') {
        this.filePath = path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath);
        this.economy = {};
        this.isLoading = false;
        this.isSaving = false;
        
        // Default configuration for currency awards
        this.defaultConfig = {
            messageReward: 1,
            reactionReward: 0.5,
            voiceTimeReward: 2, // per minute
            dailyBonus: 50,
            baseValue: 1.0,
            inflationThreshold: 10000, // Total currency threshold for inflation
            deflationThreshold: 1000   // Total currency threshold for deflation
        };
        
        this.initializeEconomy();
    }

    /**
     * Initializes the economy system
     */
    initializeEconomy() {
        try {
            this.economy = this.loadEconomySync();
            console.log('EconomyManager initialized successfully');
        } catch (error) {
            console.error('Failed to initialize EconomyManager:', error);
            this.economy = this.getDefaultEconomyData();
        }
    }

    /**
     * Synchronous version of loadEconomy for initialization
     * @returns {Object} The economy data
     */
    loadEconomySync() {
        try {
            this.ensureFileExistsSync();
            
            const data = fs.readFileSync(this.filePath, 'utf-8');
            return this.parseEconomyData(data);
        } catch (error) {
            console.error('Failed to load economy synchronously:', error);
            return this.getDefaultEconomyData();
        }
    }

    /**
     * Synchronous version of ensureFileExists for initialization
     */
    ensureFileExistsSync() {
        try {
            const dir = path.dirname(this.filePath);
            
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
                console.log(`Created directory: ${dir}`);
            }
            
            if (!fs.existsSync(this.filePath)) {
                const defaultData = this.getDefaultEconomyData();
                fs.writeFileSync(this.filePath, JSON.stringify(defaultData, null, 2), 'utf-8');
                console.log(`Created economy file: ${this.filePath}`);
            }
        } catch (error) {
            console.error('Error ensuring file exists synchronously:', error);
            throw new Error(`Failed to ensure economy file exists: ${error.message}`);
        }
    }

    /**
     * Gets default economy data structure
     * @returns {Object} Default economy data
     */
    getDefaultEconomyData() {
        return {
            _metadata: {
                version: '1.0',
                created: new Date().toISOString(),
                lastModified: new Date().toISOString()
            },
            guilds: {}
        };
    }

    /**
     * Ensures the economy file and directory exist
     */
    async ensureFileExists() {
        try {
            const dir = path.dirname(this.filePath);
            
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
                console.log(`Created directory: ${dir}`);
            }
            
            if (!fs.existsSync(this.filePath)) {
                const defaultData = this.getDefaultEconomyData();
                fs.writeFileSync(this.filePath, JSON.stringify(defaultData, null, 2), 'utf-8');
                console.log(`Created economy file: ${this.filePath}`);
            }
        } catch (error) {
            console.error('Error ensuring file exists:', error);
            throw new Error(`Failed to ensure economy file exists: ${error.message}`);
        }
    }

    /**
     * Loads the economy data from file
     * @returns {Promise<Object>} The economy data
     */
    async loadEconomy() {
        if (this.isLoading) {
            return this.economy;
        }
        
        this.isLoading = true;
        
        try {
            await this.ensureFileExists();
            
            const data = fs.readFileSync(this.filePath, 'utf-8');
            const parsedData = this.parseEconomyData(data);
            
            this.isLoading = false;
            return parsedData;
        } catch (error) {
            console.error('Failed to load economy:', error);
            this.isLoading = false;
            return this.getDefaultEconomyData();
        }
    }

    /**
     * Parses economy data with error recovery
     * @param {string} data - Raw file data
     * @returns {Object} Parsed economy data
     */
    parseEconomyData(data) {
        try {
            if (!data || data.trim() === '') {
                console.warn('Empty economy file, using default data');
                return this.getDefaultEconomyData();
            }
            
            const parsed = JSON.parse(data);
            
            if (typeof parsed !== 'object' || parsed === null) {
                throw new Error('Invalid economy data structure');
            }
            
            return parsed;
        } catch (error) {
            console.error('Error parsing economy data:', error);
            console.warn('Using default data due to parse failure');
            return this.getDefaultEconomyData();
        }
    }

    /**
     * Saves the economy data to file
     * @returns {Promise<boolean>} Success status
     */
    async saveEconomy() {
        if (this.isSaving) {
            return true;
        }
        
        this.isSaving = true;
        
        try {
            // Ensure directory exists before saving
            await this.ensureFileExists();
            
            // Update metadata
            if (!this.economy._metadata) {
                this.economy._metadata = this.getDefaultEconomyData()._metadata;
            }
            this.economy._metadata.lastModified = new Date().toISOString();
            
            const dataToSave = JSON.stringify(this.economy, null, 2);
            fs.writeFileSync(this.filePath, dataToSave, 'utf-8');
            
            this.isSaving = false;
            return true;
        } catch (error) {
            console.error('Failed to save economy:', error);
            this.isSaving = false;
            throw error;
        }
    }

    /**
     * Ensures guild exists in economy data
     * @param {string} guildId - Guild ID
     */
    ensureGuildExists(guildId) {
        if (!this.economy.guilds) {
            this.economy.guilds = {};
        }
        
        if (!this.economy.guilds[guildId]) {
            this.economy.guilds[guildId] = {
                totalCurrency: 0,
                baseValue: this.defaultConfig.baseValue,
                currentValue: this.defaultConfig.baseValue,
                inflationRate: 0.0,
                lastUpdate: new Date().toISOString(),
                users: {},
                config: { ...this.defaultConfig }
            };
        }
    }

    /**
     * Ensures user exists in guild economy data
     * @param {string} guildId - Guild ID
     * @param {string} userId - User ID
     */
    ensureUserExists(guildId, userId) {
        this.ensureGuildExists(guildId);
        
        if (!this.economy.guilds[guildId].users[userId]) {
            this.economy.guilds[guildId].users[userId] = {
                balance: 0,
                totalEarned: 0,
                totalSpent: 0,
                lastActivity: new Date().toISOString(),
                lastDailyBonus: null
            };
        }
    }

    /**
     * Gets user balance
     * @param {string} userId - User ID
     * @param {string} guildId - Guild ID
     * @returns {Promise<number>} User balance
     */
    async getBalance(userId, guildId) {
        try {
            this.ensureUserExists(guildId, userId);
            return this.economy.guilds[guildId].users[userId].balance;
        } catch (error) {
            console.error('Error getting balance:', error);
            return 0;
        }
    }

    /**
     * Adds currency to user balance
     * @param {string} userId - User ID
     * @param {string} guildId - Guild ID
     * @param {number} amount - Amount to add
     * @param {string} reason - Reason for the transaction
     * @returns {Promise<Object>} Transaction result
     */
    async addCurrency(userId, guildId, amount, reason = 'Unknown') {
        try {
            if (amount <= 0) {
                return {
                    success: false,
                    message: 'Amount must be positive'
                };
            }

            this.ensureUserExists(guildId, userId);
            
            const user = this.economy.guilds[guildId].users[userId];
            const guild = this.economy.guilds[guildId];
            
            // Update user balance
            user.balance += amount;
            user.totalEarned += amount;
            user.lastActivity = new Date().toISOString();
            
            // Update guild total currency
            guild.totalCurrency += amount;
            guild.lastUpdate = new Date().toISOString();
            
            // Update market value based on new currency circulation
            await this.calculateMarketValue(guildId);
            
            // Save changes
            await this.saveEconomy();
            
            return {
                success: true,
                message: `Added ${amount} currency to user ${userId}`,
                newBalance: user.balance,
                reason: reason
            };
        } catch (error) {
            console.error('Error adding currency:', error);
            return {
                success: false,
                message: 'Failed to add currency'
            };
        }
    }

    /**
     * Removes currency from user balance
     * @param {string} userId - User ID
     * @param {string} guildId - Guild ID
     * @param {number} amount - Amount to remove
     * @param {string} reason - Reason for the transaction
     * @returns {Promise<Object>} Transaction result
     */
    async removeCurrency(userId, guildId, amount, reason = 'Unknown') {
        try {
            if (amount <= 0) {
                return {
                    success: false,
                    message: 'Amount must be positive'
                };
            }

            this.ensureUserExists(guildId, userId);
            
            const user = this.economy.guilds[guildId].users[userId];
            const guild = this.economy.guilds[guildId];
            
            // Check if user has sufficient balance
            if (user.balance < amount) {
                return {
                    success: false,
                    message: 'Insufficient balance'
                };
            }
            
            // Update user balance
            user.balance -= amount;
            user.totalSpent += amount;
            user.lastActivity = new Date().toISOString();
            
            // Update guild total currency
            guild.totalCurrency -= amount;
            guild.lastUpdate = new Date().toISOString();
            
            // Update market value based on new currency circulation
            await this.calculateMarketValue(guildId);
            
            // Save changes
            await this.saveEconomy();
            
            return {
                success: true,
                message: `Removed ${amount} currency from user ${userId}`,
                newBalance: user.balance,
                reason: reason
            };
        } catch (error) {
            console.error('Error removing currency:', error);
            return {
                success: false,
                message: 'Failed to remove currency'
            };
        }
    }

    /**
     * Transfers currency between users
     * @param {string} fromUserId - Sender user ID
     * @param {string} toUserId - Recipient user ID
     * @param {string} guildId - Guild ID
     * @param {number} amount - Amount to transfer
     * @returns {Promise<Object>} Transaction result
     */
    async transferCurrency(fromUserId, toUserId, guildId, amount) {
        try {
            if (amount <= 0) {
                return {
                    success: false,
                    message: 'Amount must be positive'
                };
            }

            if (fromUserId === toUserId) {
                return {
                    success: false,
                    message: 'Cannot transfer to yourself'
                };
            }

            this.ensureUserExists(guildId, fromUserId);
            this.ensureUserExists(guildId, toUserId);
            
            const fromUser = this.economy.guilds[guildId].users[fromUserId];
            const toUser = this.economy.guilds[guildId].users[toUserId];
            
            // Check if sender has sufficient balance
            if (fromUser.balance < amount) {
                return {
                    success: false,
                    message: 'Insufficient balance'
                };
            }
            
            // Perform transfer
            fromUser.balance -= amount;
            fromUser.totalSpent += amount;
            fromUser.lastActivity = new Date().toISOString();
            
            toUser.balance += amount;
            toUser.totalEarned += amount;
            toUser.lastActivity = new Date().toISOString();
            
            // Save changes
            await this.saveEconomy();
            
            return {
                success: true,
                message: `Transferred ${amount} currency from ${fromUserId} to ${toUserId}`,
                fromBalance: fromUser.balance,
                toBalance: toUser.balance
            };
        } catch (error) {
            console.error('Error transferring currency:', error);
            return {
                success: false,
                message: 'Failed to transfer currency'
            };
        }
    }

    /**
     * Awards currency for user activity
     * @param {string} userId - User ID
     * @param {string} guildId - Guild ID
     * @param {string} activityType - Type of activity (message, reaction, voice)
     * @param {number} multiplier - Activity multiplier (default 1)
     * @returns {Promise<Object>} Award result
     */
    async awardActivity(userId, guildId, activityType, multiplier = 1) {
        try {
            this.ensureUserExists(guildId, userId);
            
            const config = this.economy.guilds[guildId].config;
            let amount = 0;
            
            switch (activityType) {
                case 'message':
                    amount = config.messageReward * multiplier;
                    break;
                case 'reaction':
                    amount = config.reactionReward * multiplier;
                    break;
                case 'voice':
                    amount = config.voiceTimeReward * multiplier;
                    break;
                default:
                    return {
                        success: false,
                        message: 'Invalid activity type'
                    };
            }
            
            if (amount > 0) {
                return await this.addCurrency(userId, guildId, amount, `Activity: ${activityType}`);
            }
            
            return {
                success: false,
                message: 'No reward for this activity'
            };
        } catch (error) {
            console.error('Error awarding activity:', error);
            return {
                success: false,
                message: 'Failed to award activity'
            };
        }
    }

    /**
     * Claims daily bonus for user
     * @param {string} userId - User ID
     * @param {string} guildId - Guild ID
     * @returns {Promise<Object>} Claim result
     */
    async claimDailyBonus(userId, guildId) {
        try {
            this.ensureUserExists(guildId, userId);
            
            const user = this.economy.guilds[guildId].users[userId];
            const guild = this.economy.guilds[guildId];
            const config = guild.config;
            const now = new Date();
            const today = now.toDateString();
            
            // Check if user already claimed today
            if (user.lastDailyBonus && new Date(user.lastDailyBonus).toDateString() === today) {
                return {
                    success: false,
                    message: 'Daily bonus already claimed today'
                };
            }
            
            // Award daily bonus
            const result = await this.addCurrency(userId, guildId, config.dailyBonus, 'Daily bonus');
            
            if (result.success) {
                user.lastDailyBonus = now.toISOString();
                await this.saveEconomy();
                return {
                    ...result,
                    amountClaimed: config.dailyBonus,
                    currentValue: guild.currentValue
                };
            }
            
            return result;
        } catch (error) {
            console.error('Error claiming daily bonus:', error);
            return {
                success: false,
                message: 'Failed to claim daily bonus'
            };
        }
    }

    /**
     * Gets user statistics
     * @param {string} userId - User ID
     * @param {string} guildId - Guild ID
     * @returns {Promise<Object>} User statistics
     */
    async getUserStats(userId, guildId) {
        try {
            if (!userId || !guildId) {
                return null;
            }
            
            this.ensureUserExists(guildId, userId);
            
            const user = this.economy.guilds[guildId].users[userId];
            const guild = this.economy.guilds[guildId];
            
            return {
                balance: user.balance,
                totalEarned: user.totalEarned,
                totalSpent: user.totalSpent,
                lastActivity: user.lastActivity,
                lastDailyBonus: user.lastDailyBonus,
                currentValue: guild.currentValue,
                canClaimDaily: !user.lastDailyBonus || 
                              new Date(user.lastDailyBonus).toDateString() !== new Date().toDateString()
            };
        } catch (error) {
            console.error('Error getting user stats:', error);
            return null;
        }
    }

    /**
     * Validates transaction data
     * @param {string} userId - User ID
     * @param {string} guildId - Guild ID
     * @param {number} amount - Transaction amount
     * @returns {Object} Validation result
     */
    validateTransaction(userId, guildId, amount) {
        const errors = [];
        
        if (!userId || typeof userId !== 'string') {
            errors.push('Valid userId is required');
        }
        
        if (!guildId || typeof guildId !== 'string') {
            errors.push('Valid guildId is required');
        }
        
        if (typeof amount !== 'number' || isNaN(amount)) {
            errors.push('Amount must be a valid number');
        }
        
        if (amount <= 0) {
            errors.push('Amount must be positive');
        }
        
        if (amount > 1000000) {
            errors.push('Amount exceeds maximum limit');
        }
        
        return {
            isValid: errors.length === 0,
            errors
        };
    }

    /**
     * Calculates the current market value based on currency circulation
     * @param {string} guildId - Guild ID
     * @returns {Promise<number>} Current market value
     */
    async calculateMarketValue(guildId) {
        try {
            this.ensureGuildExists(guildId);
            
            const guild = this.economy.guilds[guildId];
            const config = guild.config;
            
            // Base calculation: more currency = lower value, less currency = higher value
            const totalCurrency = guild.totalCurrency;
            const baseValue = config.baseValue;
            
            if (totalCurrency === 0) {
                return baseValue;
            }
            
            // Calculate inflation/deflation based on thresholds
            let marketValue = baseValue;
            
            if (totalCurrency > config.inflationThreshold) {
                // Inflation: currency loses value
                const inflationFactor = Math.log(totalCurrency / config.inflationThreshold) * 0.1;
                marketValue = baseValue / (1 + inflationFactor);
            } else if (totalCurrency < config.deflationThreshold) {
                // Deflation: currency gains value
                const deflationFactor = Math.log(config.deflationThreshold / totalCurrency) * 0.1;
                marketValue = baseValue * (1 + deflationFactor);
            }
            
            // Ensure market value doesn't go below 0.1 or above 10
            marketValue = Math.max(0.1, Math.min(10.0, marketValue));
            
            // Update guild's current value
            guild.currentValue = marketValue;
            guild.lastUpdate = new Date().toISOString();
            
            return marketValue;
        } catch (error) {
            console.error('Error calculating market value:', error);
            return this.defaultConfig.baseValue;
        }
    }

    /**
     * Updates inflation rate based on market changes
     * @param {string} guildId - Guild ID
     * @returns {Promise<Object>} Inflation update result
     */
    async updateInflation(guildId) {
        try {
            this.ensureGuildExists(guildId);
            
            const guild = this.economy.guilds[guildId];
            const previousValue = guild.currentValue;
            const newValue = await this.calculateMarketValue(guildId);
            
            // Calculate inflation rate as percentage change
            const inflationRate = ((previousValue - newValue) / previousValue) * 100;
            
            guild.inflationRate = inflationRate;
            guild.lastUpdate = new Date().toISOString();
            
            await this.saveEconomy();
            
            return {
                success: true,
                previousValue,
                newValue,
                inflationRate,
                trend: inflationRate > 0 ? 'inflation' : inflationRate < 0 ? 'deflation' : 'stable'
            };
        } catch (error) {
            console.error('Error updating inflation:', error);
            return {
                success: false,
                message: 'Failed to update inflation'
            };
        }
    }

    /**
     * Gets comprehensive economic statistics for a guild
     * @param {string} guildId - Guild ID
     * @returns {Promise<Object>} Economic statistics
     */
    async getEconomicStats(guildId) {
        try {
            this.ensureGuildExists(guildId);
            
            const guild = this.economy.guilds[guildId];
            const users = guild.users;
            
            // Calculate user statistics
            const userCount = Object.keys(users).length;
            const totalBalances = Object.values(users).reduce((sum, user) => sum + user.balance, 0);
            const totalEarned = Object.values(users).reduce((sum, user) => sum + user.totalEarned, 0);
            const totalSpent = Object.values(users).reduce((sum, user) => sum + user.totalSpent, 0);
            
            // Calculate wealth distribution
            const balances = Object.values(users).map(user => user.balance).sort((a, b) => b - a);
            const averageBalance = userCount > 0 ? totalBalances / userCount : 0;
            const medianBalance = userCount > 0 ? 
                (balances.length % 2 === 0 ? 
                    (balances[balances.length / 2 - 1] + balances[balances.length / 2]) / 2 : 
                    balances[Math.floor(balances.length / 2)]) : 0;
            
            // Calculate market health indicators
            const currentValue = await this.calculateMarketValue(guildId);
            const velocityOfMoney = totalSpent > 0 ? totalEarned / totalSpent : 0;
            
            return {
                guild: {
                    totalCurrency: guild.totalCurrency,
                    currentValue: currentValue,
                    baseValue: guild.config.baseValue,
                    inflationRate: guild.inflationRate,
                    lastUpdate: guild.lastUpdate
                },
                users: {
                    count: userCount,
                    totalBalances,
                    averageBalance,
                    medianBalance,
                    totalEarned,
                    totalSpent
                },
                market: {
                    velocityOfMoney,
                    wealthConcentration: userCount > 0 ? (balances[0] || 0) / totalBalances : 0,
                    economicActivity: totalEarned + totalSpent,
                    marketHealth: this.calculateMarketHealth(guild, currentValue)
                }
            };
        } catch (error) {
            console.error('Error getting economic stats:', error);
            return null;
        }
    }

    /**
     * Calculates market health score (0-100)
     * @param {Object} guild - Guild economy data
     * @param {number} currentValue - Current market value
     * @returns {number} Market health score
     */
    calculateMarketHealth(guild, currentValue) {
        let healthScore = 50; // Base score
        
        // Factor 1: Market stability (how close to base value)
        const valueStability = 1 - Math.abs(currentValue - guild.config.baseValue) / guild.config.baseValue;
        healthScore += valueStability * 20;
        
        // Factor 2: Currency circulation
        const circulationScore = Math.min(guild.totalCurrency / guild.config.inflationThreshold, 1) * 15;
        healthScore += circulationScore;
        
        // Factor 3: Inflation control
        const inflationPenalty = Math.abs(guild.inflationRate) > 10 ? -15 : 0;
        healthScore += inflationPenalty;
        
        // Factor 4: User participation
        const userCount = Object.keys(guild.users).length;
        const participationBonus = Math.min(userCount / 10, 1) * 15;
        healthScore += participationBonus;
        
        return Math.max(0, Math.min(100, Math.round(healthScore)));
    }

    /**
     * Simulates market dynamics over time
     * @param {string} guildId - Guild ID
     * @param {number} days - Number of days to simulate
     * @returns {Promise<Array>} Simulation results
     */
    async simulateMarketDynamics(guildId, days = 30) {
        try {
            this.ensureGuildExists(guildId);
            
            const guild = this.economy.guilds[guildId];
            const simulation = [];
            let currentCurrency = guild.totalCurrency;
            let currentValue = guild.currentValue;
            
            for (let day = 0; day < days; day++) {
                // Simulate daily economic activity
                const dailyActivity = Math.random() * 100; // Random activity level
                const currencyChange = (dailyActivity - 50) * 10; // Net currency change
                
                currentCurrency = Math.max(0, currentCurrency + currencyChange);
                
                // Calculate new market value
                if (currentCurrency > guild.config.inflationThreshold) {
                    const inflationFactor = Math.log(currentCurrency / guild.config.inflationThreshold) * 0.1;
                    currentValue = guild.config.baseValue / (1 + inflationFactor);
                } else if (currentCurrency < guild.config.deflationThreshold) {
                    const deflationFactor = Math.log(guild.config.deflationThreshold / currentCurrency) * 0.1;
                    currentValue = guild.config.baseValue * (1 + deflationFactor);
                } else {
                    currentValue = guild.config.baseValue;
                }
                
                currentValue = Math.max(0.1, Math.min(10.0, currentValue));
                
                simulation.push({
                    day: day + 1,
                    totalCurrency: Math.round(currentCurrency),
                    marketValue: Math.round(currentValue * 100) / 100,
                    activity: Math.round(dailyActivity),
                    trend: day > 0 ? 
                        (currentValue > simulation[day - 1].marketValue ? 'up' : 
                         currentValue < simulation[day - 1].marketValue ? 'down' : 'stable') : 'stable'
                });
            }
            
            return simulation;
        } catch (error) {
            console.error('Error simulating market dynamics:', error);
            return [];
        }
    }

    /**
     * Adjusts market parameters based on economic conditions
     * @param {string} guildId - Guild ID
     * @param {Object} adjustments - Parameter adjustments
     * @returns {Promise<Object>} Adjustment result
     */
    async adjustMarketParameters(guildId, adjustments = {}) {
        try {
            this.ensureGuildExists(guildId);
            
            const guild = this.economy.guilds[guildId];
            const config = guild.config;
            
            // Apply adjustments with validation
            if (adjustments.inflationThreshold && adjustments.inflationThreshold > 0) {
                config.inflationThreshold = adjustments.inflationThreshold;
            }
            
            if (adjustments.deflationThreshold && adjustments.deflationThreshold > 0) {
                config.deflationThreshold = adjustments.deflationThreshold;
            }
            
            if (adjustments.baseValue && adjustments.baseValue > 0) {
                config.baseValue = adjustments.baseValue;
            }
            
            if (adjustments.messageReward !== undefined && adjustments.messageReward >= 0) {
                config.messageReward = adjustments.messageReward;
            }
            
            if (adjustments.reactionReward !== undefined && adjustments.reactionReward >= 0) {
                config.reactionReward = adjustments.reactionReward;
            }
            
            if (adjustments.voiceTimeReward !== undefined && adjustments.voiceTimeReward >= 0) {
                config.voiceTimeReward = adjustments.voiceTimeReward;
            }
            
            if (adjustments.dailyBonus !== undefined && adjustments.dailyBonus >= 0) {
                config.dailyBonus = adjustments.dailyBonus;
            }
            
            guild.lastUpdate = new Date().toISOString();
            await this.saveEconomy();
            
            return {
                success: true,
                message: 'Market parameters updated successfully',
                newConfig: { ...config }
            };
        } catch (error) {
            console.error('Error adjusting market parameters:', error);
            return {
                success: false,
                message: 'Failed to adjust market parameters'
            };
        }
    }

    /**
     * Gets shop items for a guild with current prices
     * @param {string} guildId - Guild ID
     * @returns {Promise<Array>} Shop items with current prices
     */
    async getShopItems(guildId) {
        try {
            this.ensureGuildExists(guildId);
            
            const guild = this.economy.guilds[guildId];
            
            // Initialize default shop if it doesn't exist
            if (!guild.shop) {
                guild.shop = this.getDefaultShopItems();
                await this.saveEconomy();
            }
            
            // Update prices based on current market value
            await this.updateItemPrices(guildId);
            
            // Convert shop object to array with item details
            const shopItems = Object.entries(guild.shop).map(([itemId, item]) => ({
                id: itemId,
                name: item.name,
                description: item.description || 'No description available',
                basePrice: item.basePrice,
                currentPrice: item.currentPrice,
                stock: item.stock,
                purchases: item.purchases || 0,
                category: item.category || 'general'
            }));
            
            return shopItems;
        } catch (error) {
            console.error('Error getting shop items:', error);
            return [];
        }
    }

    /**
     * Gets default shop items configuration
     * @returns {Object} Default shop items
     */
    getDefaultShopItems() {
        return {
            'role_color': {
                name: 'Custom Role Color',
                description: 'Change your role color for 30 days',
                basePrice: 100,
                currentPrice: 100,
                stock: -1, // Unlimited
                purchases: 0,
                category: 'cosmetic'
            },
            'nickname_change': {
                name: 'Nickname Change',
                description: 'Change your nickname (moderator approval required)',
                basePrice: 50,
                currentPrice: 50,
                stock: -1,
                purchases: 0,
                category: 'cosmetic'
            },
            'channel_boost': {
                name: 'Channel Boost',
                description: 'Boost a channel to the top of the list for 24 hours',
                basePrice: 200,
                currentPrice: 200,
                stock: 5,
                purchases: 0,
                category: 'utility'
            },
            'lottery_ticket': {
                name: 'Lottery Ticket',
                description: 'Enter the weekly lottery draw',
                basePrice: 25,
                currentPrice: 25,
                stock: -1,
                purchases: 0,
                category: 'gambling'
            },
            'voice_priority': {
                name: 'Voice Priority',
                description: 'Skip voice channel queue for 7 days',
                basePrice: 75,
                currentPrice: 75,
                stock: 10,
                purchases: 0,
                category: 'utility'
            }
        };
    }

    /**
     * Updates item prices based on market dynamics
     * @param {string} guildId - Guild ID
     * @returns {Promise<boolean>} Success status
     */
    async updateItemPrices(guildId) {
        try {
            this.ensureGuildExists(guildId);
            
            const guild = this.economy.guilds[guildId];
            const currentMarketValue = await this.calculateMarketValue(guildId);
            
            if (!guild.shop) {
                guild.shop = this.getDefaultShopItems();
            }
            
            // Update prices for each item based on market value and demand
            for (const [itemId, item] of Object.entries(guild.shop)) {
                // Base price adjustment based on market value
                let priceMultiplier = 1 / currentMarketValue;
                
                // Demand-based pricing: more purchases = higher price
                const demandMultiplier = 1 + (item.purchases * 0.1);
                
                // Stock-based pricing: limited stock = higher price
                let stockMultiplier = 1;
                if (item.stock > 0) {
                    stockMultiplier = 1 + (1 / Math.max(item.stock, 1)) * 0.5;
                }
                
                // Calculate final price
                const finalPrice = Math.round(item.basePrice * priceMultiplier * demandMultiplier * stockMultiplier);
                
                // Ensure price doesn't go below 10% or above 500% of base price
                item.currentPrice = Math.max(
                    Math.round(item.basePrice * 0.1),
                    Math.min(Math.round(item.basePrice * 5), finalPrice)
                );
            }
            
            guild.lastUpdate = new Date().toISOString();
            await this.saveEconomy();
            
            return true;
        } catch (error) {
            console.error('Error updating item prices:', error);
            return false;
        }
    }

    /**
     * Purchases an item from the shop
     * @param {string} userId - User ID
     * @param {string} guildId - Guild ID
     * @param {string} itemId - Item ID to purchase
     * @returns {Promise<Object>} Purchase result
     */
    async purchaseItem(userId, guildId, itemId) {
        try {
            this.ensureUserExists(guildId, userId);
            
            const guild = this.economy.guilds[guildId];
            const user = guild.users[userId];
            
            // Initialize shop if it doesn't exist
            if (!guild.shop) {
                guild.shop = this.getDefaultShopItems();
            }
            
            // Check if item exists
            if (!guild.shop[itemId]) {
                return {
                    success: false,
                    message: 'Item not found in shop'
                };
            }
            
            const item = guild.shop[itemId];
            
            // Update prices before purchase
            await this.updateItemPrices(guildId);
            
            // Check stock availability
            if (item.stock === 0) {
                return {
                    success: false,
                    message: 'Item is out of stock'
                };
            }
            
            // Check if user has sufficient balance
            if (user.balance < item.currentPrice) {
                return {
                    success: false,
                    message: `Insufficient balance. Need ${item.currentPrice}, have ${user.balance}`
                };
            }
            
            // Process purchase
            const removeResult = await this.removeCurrency(userId, guildId, item.currentPrice, `Shop purchase: ${item.name}`);
            
            if (!removeResult.success) {
                return removeResult;
            }
            
            // Update item statistics
            item.purchases = (item.purchases || 0) + 1;
            
            // Reduce stock if limited
            if (item.stock > 0) {
                item.stock -= 1;
            }
            
            // Initialize user purchases if not exists
            if (!user.purchases) {
                user.purchases = {};
            }
            
            if (!user.purchases[itemId]) {
                user.purchases[itemId] = {
                    count: 0,
                    totalSpent: 0,
                    lastPurchase: null
                };
            }
            
            // Update user purchase history
            user.purchases[itemId].count += 1;
            user.purchases[itemId].totalSpent += item.currentPrice;
            user.purchases[itemId].lastPurchase = new Date().toISOString();
            
            // Update market prices after purchase (increased demand)
            await this.updateItemPrices(guildId);
            
            await this.saveEconomy();
            
            return {
                success: true,
                message: `Successfully purchased ${item.name}`,
                item: {
                    id: itemId,
                    name: item.name,
                    price: item.currentPrice
                },
                newBalance: user.balance,
                purchaseCount: user.purchases[itemId].count
            };
        } catch (error) {
            console.error('Error purchasing item:', error);
            return {
                success: false,
                message: 'Failed to purchase item'
            };
        }
    }

    /**
     * Gets user's purchase history
     * @param {string} userId - User ID
     * @param {string} guildId - Guild ID
     * @returns {Promise<Object>} User purchase history
     */
    async getUserPurchases(userId, guildId) {
        try {
            this.ensureUserExists(guildId, userId);
            
            const user = this.economy.guilds[guildId].users[userId];
            const guild = this.economy.guilds[guildId];
            
            if (!user.purchases) {
                return {
                    totalPurchases: 0,
                    totalSpent: user.totalSpent || 0,
                    items: {}
                };
            }
            
            // Enrich purchase data with item details
            const enrichedPurchases = {};
            for (const [itemId, purchaseData] of Object.entries(user.purchases)) {
                const shopItem = guild.shop && guild.shop[itemId];
                enrichedPurchases[itemId] = {
                    ...purchaseData,
                    itemName: shopItem ? shopItem.name : 'Unknown Item',
                    itemDescription: shopItem ? shopItem.description : 'Item no longer available'
                };
            }
            
            const totalPurchases = Object.values(user.purchases).reduce((sum, item) => sum + item.count, 0);
            
            return {
                totalPurchases,
                totalSpent: user.totalSpent || 0,
                items: enrichedPurchases
            };
        } catch (error) {
            console.error('Error getting user purchases:', error);
            return {
                totalPurchases: 0,
                totalSpent: 0,
                items: {}
            };
        }
    }

    /**
     * Adds a new item to the shop
     * @param {string} guildId - Guild ID
     * @param {Object} itemData - Item configuration
     * @returns {Promise<Object>} Add item result
     */
    async addShopItem(guildId, itemData) {
        try {
            this.ensureGuildExists(guildId);
            
            const guild = this.economy.guilds[guildId];
            
            // Initialize shop if it doesn't exist
            if (!guild.shop) {
                guild.shop = this.getDefaultShopItems();
            }
            
            // Validate item data
            const validation = this.validateShopItem(itemData);
            if (!validation.isValid) {
                return {
                    success: false,
                    message: `Invalid item data: ${validation.errors.join(', ')}`
                };
            }
            
            const itemId = itemData.id || this.generateItemId(itemData.name);
            
            // Check if item already exists
            if (guild.shop[itemId]) {
                return {
                    success: false,
                    message: 'Item with this ID already exists'
                };
            }
            
            // Add item to shop
            guild.shop[itemId] = {
                name: itemData.name,
                description: itemData.description || 'No description available',
                basePrice: itemData.basePrice,
                currentPrice: itemData.basePrice,
                stock: itemData.stock || -1,
                purchases: 0,
                category: itemData.category || 'general',
                createdAt: new Date().toISOString()
            };
            
            guild.lastUpdate = new Date().toISOString();
            await this.saveEconomy();
            
            return {
                success: true,
                message: `Successfully added item: ${itemData.name}`,
                itemId: itemId
            };
        } catch (error) {
            console.error('Error adding shop item:', error);
            return {
                success: false,
                message: 'Failed to add shop item'
            };
        }
    }

    /**
     * Validates shop item data
     * @param {Object} itemData - Item data to validate
     * @returns {Object} Validation result
     */
    validateShopItem(itemData) {
        const errors = [];
        
        if (!itemData.name || typeof itemData.name !== 'string' || itemData.name.trim().length === 0) {
            errors.push('Item name is required');
        }
        
        if (!itemData.basePrice || typeof itemData.basePrice !== 'number' || itemData.basePrice <= 0) {
            errors.push('Base price must be a positive number');
        }
        
        if (itemData.stock !== undefined && typeof itemData.stock !== 'number') {
            errors.push('Stock must be a number');
        }
        
        if (itemData.category && typeof itemData.category !== 'string') {
            errors.push('Category must be a string');
        }
        
        return {
            isValid: errors.length === 0,
            errors
        };
    }

    /**
     * Generates a unique item ID from item name
     * @param {string} name - Item name
     * @returns {string} Generated item ID
     */
    generateItemId(name) {
        return name.toLowerCase()
            .replace(/[^a-z0-9\s]/g, '')
            .replace(/\s+/g, '_')
            .substring(0, 20);
    }

    /**
     * Gets shop statistics for a guild
     * @param {string} guildId - Guild ID
     * @returns {Promise<Object>} Shop statistics
     */
    async getShopStats(guildId) {
        try {
            this.ensureGuildExists(guildId);
            
            const guild = this.economy.guilds[guildId];
            
            if (!guild.shop) {
                return {
                    totalItems: 0,
                    totalPurchases: 0,
                    totalRevenue: 0,
                    popularItems: [],
                    categories: {}
                };
            }
            
            const items = Object.entries(guild.shop);
            const totalItems = items.length;
            const totalPurchases = items.reduce((sum, [, item]) => sum + (item.purchases || 0), 0);
            
            // Calculate total revenue (approximate based on current prices)
            const totalRevenue = items.reduce((sum, [, item]) => {
                return sum + ((item.purchases || 0) * item.currentPrice);
            }, 0);
            
            // Get popular items (top 5 by purchases)
            const popularItems = items
                .sort((a, b) => (b[1].purchases || 0) - (a[1].purchases || 0))
                .slice(0, 5)
                .map(([itemId, item]) => ({
                    id: itemId,
                    name: item.name,
                    purchases: item.purchases || 0,
                    currentPrice: item.currentPrice
                }));
            
            // Group by categories
            const categories = {};
            items.forEach(([itemId, item]) => {
                const category = item.category || 'general';
                if (!categories[category]) {
                    categories[category] = {
                        itemCount: 0,
                        totalPurchases: 0,
                        totalRevenue: 0
                    };
                }
                categories[category].itemCount += 1;
                categories[category].totalPurchases += item.purchases || 0;
                categories[category].totalRevenue += (item.purchases || 0) * item.currentPrice;
            });
            
            return {
                totalItems,
                totalPurchases,
                totalRevenue,
                popularItems,
                categories
            };
        } catch (error) {
            console.error('Error getting shop stats:', error);
            return {
                totalItems: 0,
                totalPurchases: 0,
                totalRevenue: 0,
                popularItems: [],
                categories: {}
            };
        }
    }

    /**
     * Reloads the economy data from file
     */
    async reload() {
        try {
            console.log('Reloading EconomyManager...');
            this.economy = await this.loadEconomy();
            console.log('EconomyManager reloaded successfully');
        } catch (error) {
            console.error('Failed to reload EconomyManager:', error);
            throw error;
        }
    }
}