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
            guilds: {},
            globalBank: {}
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

            if (!parsed.guilds || typeof parsed.guilds !== 'object') {
                parsed.guilds = {};
            }
            if (!parsed.globalBank || typeof parsed.globalBank !== 'object') {
                parsed.globalBank = {};
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
                totalTransactions: 0,
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
     * Enregistre une transaction sur le serveur pour le suivi économique
     * @param {string} guildId - ID du serveur
     */
    recordGuildTransaction(guildId) {
        if (!guildId) return;
        this.ensureGuildExists(guildId);
        this.economy.guilds[guildId].totalTransactions = (this.economy.guilds[guildId].totalTransactions || 0) + 1;
        this.economy.guilds[guildId].lastUpdate = new Date().toISOString();
    }

    /**
     * Récupère le nombre total de transactions enregistrées pour un serveur
     * @param {string} guildId - ID du serveur
     * @returns {number} Nombre de transactions
     */
    getGuildTransactionCount(guildId) {
        if (!guildId || !this.economy.guilds || !this.economy.guilds[guildId]) {
            return 0;
        }
        const guild = this.economy.guilds[guildId];
        let count = guild.totalTransactions || 0;
        
        // Comptabilise également l'historique utilisateur si disponible
        if (guild.users) {
            let userTxs = 0;
            for (const uid in guild.users) {
                if (Array.isArray(guild.users[uid]?.transactions)) {
                    userTxs += guild.users[uid].transactions.length;
                }
            }
            count = Math.max(count, userTxs);
        }
        return count;
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
            
            // Update guild total currency and transactions
            guild.totalCurrency += amount;
            guild.totalTransactions = (guild.totalTransactions || 0) + 1;
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
            
            // Update guild total currency and transactions
            guild.totalCurrency -= amount;
            guild.totalTransactions = (guild.totalTransactions || 0) + 1;
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
     * Applique une amende à un utilisateur (ex: avertissement / warn).
     * Prélève le montant spécifié sur le solde local du serveur.
     * Si le solde local est insuffisant ou nul, le compte bancaire inter-serveur prend le relais pour payer le reste.
     * @param {string} userId - ID de l'utilisateur
     * @param {string} guildId - ID du serveur
     * @param {number} amount - Montant de l'amende
     * @param {string} reason - Motif de l'amende
     * @returns {Promise<Object>} Résultat du prélèvement
     */
    async applyFine(userId, guildId, amount, reason = 'Amende disciplinaire') {
        try {
            this.ensureUserExists(guildId, userId);
            this.ensureGlobalBankUserExists(userId);
            
            const user = this.economy.guilds[guildId].users[userId];
            const guild = this.economy.guilds[guildId];
            const bankAccount = this.economy.globalBank[userId];

            const currentBalance = user.balance || 0;
            const currentBankBalance = bankAccount.balance || 0;
            const requestedAmount = Math.max(0, parseInt(amount, 10) || 0);

            if (requestedAmount <= 0) {
                return {
                    success: true,
                    deducted: 0,
                    deductedFromLocal: 0,
                    deductedFromBank: 0,
                    requestedAmount: 0,
                    remainingBalance: currentBalance,
                    remainingBankBalance: currentBankBalance,
                    paidByBank: false,
                    paidFullyByBank: false,
                    wasPartial: false,
                    message: 'Aucune amende à prélever'
                };
            }

            // 1. Déduction sur le solde local
            const deductedFromLocal = Math.min(requestedAmount, currentBalance);
            const remainingFine = requestedAmount - deductedFromLocal;

            // 2. Si solde local insuffisant, déduction sur le compte bancaire inter-serveur
            const deductedFromBank = remainingFine > 0 ? Math.min(remainingFine, currentBankBalance) : 0;
            const totalDeducted = deductedFromLocal + deductedFromBank;

            // Mise à jour du portefeuille local
            if (deductedFromLocal > 0) {
                user.balance -= deductedFromLocal;
                user.totalSpent = (user.totalSpent || 0) + deductedFromLocal;
                user.lastActivity = new Date().toISOString();

                guild.totalCurrency = Math.max(0, (guild.totalCurrency || 0) - deductedFromLocal);
                guild.totalTransactions = (guild.totalTransactions || 0) + 1;
                guild.lastUpdate = new Date().toISOString();

                await this.calculateMarketValue(guildId);
            }

            // Enregistrement de la transaction dans le portefeuille local
            if (totalDeducted > 0) {
                if (!user.transactions) {
                    user.transactions = [];
                }
                user.transactions.push({
                    type: 'fine',
                    amount: -totalDeducted,
                    requestedAmount,
                    deductedFromLocal,
                    deductedFromBank,
                    reason,
                    timestamp: new Date().toISOString(),
                    balanceAfter: user.balance
                });
            }

            // Mise à jour du compte bancaire inter-serveur si sollicité
            if (deductedFromBank > 0) {
                bankAccount.balance -= deductedFromBank;
                bankAccount.totalWithdrawn = (bankAccount.totalWithdrawn || 0) + deductedFromBank;
                bankAccount.lastWithdraw = new Date().toISOString();

                if (!bankAccount.transactions) {
                    bankAccount.transactions = [];
                }
                bankAccount.transactions.push({
                    type: 'fine',
                    subType: 'fine_deduction',
                    amount: -deductedFromBank,
                    requestedFine: requestedAmount,
                    deductedFromLocal,
                    deductedFromBank,
                    guildId,
                    reason,
                    timestamp: new Date().toISOString(),
                    balanceAfter: bankAccount.balance
                });
            }

            if (totalDeducted > 0) {
                await this.saveEconomy();
            }

            const wasPartial = totalDeducted < requestedAmount;
            let message = '';
            if (deductedFromBank > 0 && deductedFromLocal > 0) {
                message = wasPartial
                    ? `Amende partielle: ${totalDeducted}/${requestedAmount} coins prélevés (${deductedFromLocal} local + ${deductedFromBank} banque inter-serveur, soldes épuisés)`
                    : `Amende de ${totalDeducted} coins prélevée (${deductedFromLocal} local + ${deductedFromBank} banque inter-serveur)`;
            } else if (deductedFromBank > 0 && deductedFromLocal === 0) {
                message = wasPartial
                    ? `Amende partielle: ${totalDeducted}/${requestedAmount} coins prélevés sur la banque inter-serveur (portefeuille local et banque épuisés)`
                    : `Amende de ${totalDeducted} coins prélevée sur la banque inter-serveur (portefeuille local vide)`;
            } else if (wasPartial) {
                message = `Amende partielle: ${totalDeducted}/${requestedAmount} coins prélevés (soldes épuisés)`;
            } else {
                message = `Amende de ${totalDeducted} coins appliquée avec succès`;
            }

            return {
                success: true,
                deducted: totalDeducted,
                deductedFromLocal,
                deductedFromBank,
                requestedAmount,
                remainingBalance: user.balance,
                remainingBankBalance: bankAccount.balance,
                paidByBank: deductedFromBank > 0,
                paidFullyByBank: deductedFromLocal === 0 && deductedFromBank > 0,
                wasPartial,
                message
            };
        } catch (error) {
            console.error('[EconomyManager] Erreur lors de l\'application de l\'amende:', error);
            return {
                success: false,
                deducted: 0,
                deductedFromLocal: 0,
                deductedFromBank: 0,
                remainingBalance: 0,
                remainingBankBalance: 0,
                paidByBank: false,
                paidFullyByBank: false,
                wasPartial: true,
                message: error.message || 'Erreur lors du prélèvement de l\'amende'
            };
        }
    }

    /**
     * Sets a user's balance to an exact amount (Admin)
     * @param {string} userId - User ID
     * @param {string} guildId - Guild ID
     * @param {number} amount - New balance amount
     * @param {string} reason - Reason for setting balance
     * @returns {Promise<Object>} Result
     */
    async setBalance(userId, guildId, amount, reason = 'Admin set balance') {
        try {
            if (typeof amount !== 'number' || isNaN(amount) || amount < 0) {
                return {
                    success: false,
                    message: 'Le montant doit être un nombre positif ou nul'
                };
            }

            this.ensureUserExists(guildId, userId);
            const user = this.economy.guilds[guildId].users[userId];
            const oldBalance = user.balance;
            user.balance = amount;
            user.lastActivity = new Date().toISOString();

            // Adjust total currency in guild
            const diff = amount - oldBalance;
            this.economy.guilds[guildId].totalCurrency += diff;
            this.economy.guilds[guildId].totalTransactions = (this.economy.guilds[guildId].totalTransactions || 0) + 1;
            this.economy.guilds[guildId].lastUpdate = new Date().toISOString();

            await this.calculateMarketValue(guildId);
            await this.saveEconomy();

            return {
                success: true,
                oldBalance,
                newBalance: user.balance,
                reason,
                message: `Solde de ${userId} mis à jour : ${oldBalance} -> ${amount}`
            };
        } catch (error) {
            console.error('Error setting balance:', error);
            return {
                success: false,
                message: 'Failed to set balance'
            };
        }
    }

    /**
     * Resets a user's balance to 0 (Admin)
     * @param {string} userId - User ID
     * @param {string} guildId - Guild ID
     * @param {string} reason - Reason for reset
     * @returns {Promise<Object>} Result
     */
    async resetBalance(userId, guildId, reason = 'Admin reset balance') {
        return this.setBalance(userId, guildId, 0, reason);
    }

    /**
     * S'assure que la structure de la banque globale existe
     */
    ensureGlobalBankExists() {
        if (!this.economy.globalBank || typeof this.economy.globalBank !== 'object') {
            this.economy.globalBank = {};
        }
    }

    /**
     * S'assure qu'un compte bancaire inter-serveur existe pour un utilisateur
     * @param {string} userId - ID de l'utilisateur
     */
    ensureGlobalBankUserExists(userId) {
        this.ensureGlobalBankExists();
        if (!this.economy.globalBank[userId]) {
            this.economy.globalBank[userId] = {
                balance: 0,
                totalDeposited: 0,
                totalWithdrawn: 0,
                lastDeposit: null,
                lastWithdraw: null,
                lastInterest: null,
                createdAt: new Date().toISOString(),
                transactions: []
            };
        }
    }

    /**
     * Récupère le solde du compte bancaire inter-serveur d'un utilisateur
     * @param {string} userId - ID de l'utilisateur
     * @returns {number} Solde bancaire
     */
    getGlobalBankBalance(userId) {
        this.ensureGlobalBankUserExists(userId);
        return this.economy.globalBank[userId]?.balance || 0;
    }

    /**
     * Calcule le taux d'intérêt journalier dynamique pour un serveur donné,
     * en fonction de la masse monétaire en circulation et du volume de transactions.
     * 
     * Modèle macroéconomique :
     * - Taux de base : 1.00%
     * - Modificateur masse monétaire : Récompense la liquidité en circulation (+0.1% à +1.8% selon l'abondance)
     * - Bonus vélocité transactions : Récompense l'activité économique et le dynamisme du serveur (jusqu'à +2.0%)
     * - Bornes de sécurité : plancher à 0.50% et plafond à 5.00%
     * 
     * @param {string} [guildId=null] - ID du serveur
     * @returns {Object} Analyse et détail du taux d'intérêt dynamique
     */
    calculateDynamicInterestRate(guildId = null) {
        const baseRate = 0.01; // 1.00% de base
        const minRate = 0.005; // 0.50% plancher
        const maxRate = 0.050; // 5.00% plafond

        if (!guildId || !this.economy.guilds || !this.economy.guilds[guildId]) {
            return {
                rate: baseRate,
                ratePercent: 1.0,
                ratePercentage: '1.00%',
                baseRate,
                currencyModifier: 0,
                transactionBonus: 0,
                totalCurrency: 0,
                transactionCount: 0,
                minRate,
                maxRate,
                isDynamic: false
            };
        }

        const guild = this.economy.guilds[guildId];
        const totalCurrency = Math.max(0, guild.totalCurrency || 0);
        const transactionCount = this.getGuildTransactionCount(guildId);

        // 1. Modificateur basé sur la masse monétaire en circulation
        let currencyModifier = 0;
        if (totalCurrency <= 1000) {
            currencyModifier = -0.002; // -0.20% si l'économie est à sec (< 1000 coins)
        } else {
            // Entre 1,000 et 1,000,000+ coins : progression logarithmique
            const logRatio = Math.log10(totalCurrency / 1000);
            currencyModifier = Math.min(0.018, Math.max(0, logRatio * 0.006));
        }

        // 2. Bonus basé sur le nombre de transactions
        let transactionBonus = 0;
        if (transactionCount > 0) {
            // Progression logarithmique selon le volume de transactions enregistrées
            const logTx = Math.log10(Math.max(1, transactionCount));
            transactionBonus = Math.min(0.020, logTx * 0.0065);
        }

        const calculatedRate = baseRate + currencyModifier + transactionBonus;
        const finalRate = Math.max(minRate, Math.min(maxRate, calculatedRate));

        return {
            rate: finalRate,
            ratePercent: parseFloat((finalRate * 100).toFixed(2)),
            ratePercentage: (finalRate * 100).toFixed(2) + '%',
            baseRate,
            currencyModifier,
            transactionBonus,
            totalCurrency,
            transactionCount,
            minRate,
            maxRate,
            isDynamic: true
        };
    }

    /**
     * Récupère les statistiques bancaires et le patrimoine complet d'un utilisateur
     * @param {string} userId - ID de l'utilisateur
     * @param {string} [guildId=null] - ID du serveur actuel (optionnel)
     * @returns {Object} Statistiques bancaires
     */
    getBankStats(userId, guildId = null) {
        this.ensureGlobalBankUserExists(userId);
        if (guildId) {
            this.ensureUserExists(guildId, userId);
        }

        const localBalance = guildId ? (this.economy.guilds[guildId]?.users[userId]?.balance || 0) : 0;
        const bankAccount = this.economy.globalBank[userId];
        const bankBalance = bankAccount.balance || 0;

        // Calcul des intérêts quotidiens dynamiques
        const todayDate = new Date().toDateString();
        const lastInterestDate = bankAccount.lastInterest ? new Date(bankAccount.lastInterest).toDateString() : null;
        const canClaimInterest = bankBalance > 0 && lastInterestDate !== todayDate;
        
        const dynamicRateInfo = this.calculateDynamicInterestRate(guildId);
        const interestRate = dynamicRateInfo.rate;
        const potentialInterest = bankBalance > 0 ? Math.max(1, Math.round(bankBalance * interestRate)) : 0;

        // Trouver la dernière transaction d'intérêts aujourd'hui si déjà distribuée automatiquement
        const todayInterestTx = (bankAccount.transactions || []).slice().reverse().find(
            tx => tx.type === 'interest' && new Date(tx.timestamp).toDateString() === todayDate
        );
        const receivedToday = todayInterestTx?.amount || 0;

        // Calcul du patrimoine total à travers tous les serveurs
        let totalLocalBalances = 0;
        if (this.economy.guilds) {
            for (const gid in this.economy.guilds) {
                if (this.economy.guilds[gid]?.users?.[userId]) {
                    totalLocalBalances += (this.economy.guilds[gid].users[userId].balance || 0);
                }
            }
        }

        return {
            localBalance,
            bankBalance,
            netWorth: localBalance + bankBalance,
            totalNetWorth: totalLocalBalances + bankBalance,
            totalDeposited: bankAccount.totalDeposited || 0,
            totalWithdrawn: bankAccount.totalWithdrawn || 0,
            canClaimInterest,
            autoInterestEnabled: true,
            receivedToday,
            todayInterestRate: todayInterestTx?.ratePercentage || dynamicRateInfo.ratePercentage,
            interestRate: dynamicRateInfo.rate,
            interestRatePercent: dynamicRateInfo.ratePercent,
            interestRatePercentage: dynamicRateInfo.ratePercentage,
            interestRateInfo: dynamicRateInfo,
            potentialInterest,
            lastInterest: bankAccount.lastInterest,
            lastDeposit: bankAccount.lastDeposit,
            lastWithdraw: bankAccount.lastWithdraw,
            createdAt: bankAccount.createdAt
        };
    }

    /**
     * Dépose de l'argent du portefeuille local vers le compte bancaire inter-serveur
     * @param {string} userId - ID de l'utilisateur
     * @param {string} guildId - ID du serveur
     * @param {number} amount - Montant à déposer
     * @param {string} [reason='Dépôt bancaire'] - Motif
     * @returns {Promise<Object>} Résultat
     */
    async depositToBank(userId, guildId, amount, reason = 'Dépôt bancaire') {
        try {
            const depositAmount = Math.max(0, parseInt(amount, 10) || 0);
            if (depositAmount <= 0) {
                return {
                    success: false,
                    message: 'Le montant à déposer doit être supérieur à 0'
                };
            }

            this.ensureUserExists(guildId, userId);
            this.ensureGlobalBankUserExists(userId);

            const user = this.economy.guilds[guildId].users[userId];
            const bankAccount = this.economy.globalBank[userId];

            if (user.balance < depositAmount) {
                return {
                    success: false,
                    message: `Solde portefeuille insuffisant (${user.balance.toLocaleString()} coins disponibles, ${depositAmount.toLocaleString()} demandés)`
                };
            }

            // Débit portefeuille local
            user.balance -= depositAmount;
            user.lastActivity = new Date().toISOString();

            const guild = this.economy.guilds[guildId];
            guild.totalCurrency = Math.max(0, (guild.totalCurrency || 0) - depositAmount);
            guild.totalTransactions = (guild.totalTransactions || 0) + 1;
            guild.lastUpdate = new Date().toISOString();

            // Crédit compte bancaire inter-serveur
            bankAccount.balance += depositAmount;
            bankAccount.totalDeposited = (bankAccount.totalDeposited || 0) + depositAmount;
            bankAccount.lastDeposit = new Date().toISOString();

            if (!bankAccount.transactions) bankAccount.transactions = [];
            bankAccount.transactions.push({
                type: 'deposit',
                amount: depositAmount,
                guildId,
                reason,
                timestamp: new Date().toISOString(),
                balanceAfter: bankAccount.balance
            });

            await this.saveEconomy();

            return {
                success: true,
                deposited: depositAmount,
                localBalance: user.balance,
                bankBalance: bankAccount.balance,
                message: `Dépôt de ${depositAmount.toLocaleString()} coins effectué avec succès !`
            };
        } catch (error) {
            console.error('[EconomyManager] Erreur dépôt banque:', error);
            return {
                success: false,
                message: error.message || 'Échec du dépôt bancaire'
            };
        }
    }

    /**
     * Retire de l'argent du compte bancaire inter-serveur vers le portefeuille local
     * @param {string} userId - ID de l'utilisateur
     * @param {string} guildId - ID du serveur
     * @param {number} amount - Montant à retirer
     * @param {string} [reason='Retrait bancaire'] - Motif
     * @returns {Promise<Object>} Résultat
     */
    async withdrawFromBank(userId, guildId, amount, reason = 'Retrait bancaire') {
        try {
            const withdrawAmount = Math.max(0, parseInt(amount, 10) || 0);
            if (withdrawAmount <= 0) {
                return {
                    success: false,
                    message: 'Le montant à retirer doit être supérieur à 0'
                };
            }

            this.ensureUserExists(guildId, userId);
            this.ensureGlobalBankUserExists(userId);

            const user = this.economy.guilds[guildId].users[userId];
            const bankAccount = this.economy.globalBank[userId];

            if (bankAccount.balance < withdrawAmount) {
                return {
                    success: false,
                    message: `Solde bancaire insuffisant (${bankAccount.balance.toLocaleString()} coins en banque, ${withdrawAmount.toLocaleString()} demandés)`
                };
            }

            // Débit banque inter-serveur
            bankAccount.balance -= withdrawAmount;
            bankAccount.totalWithdrawn = (bankAccount.totalWithdrawn || 0) + withdrawAmount;
            bankAccount.lastWithdraw = new Date().toISOString();

            // Crédit portefeuille local
            user.balance += withdrawAmount;
            user.lastActivity = new Date().toISOString();

            const guild = this.economy.guilds[guildId];
            guild.totalCurrency = (guild.totalCurrency || 0) + withdrawAmount;
            guild.totalTransactions = (guild.totalTransactions || 0) + 1;
            guild.lastUpdate = new Date().toISOString();

            if (!bankAccount.transactions) bankAccount.transactions = [];
            bankAccount.transactions.push({
                type: 'withdraw',
                amount: -withdrawAmount,
                guildId,
                reason,
                timestamp: new Date().toISOString(),
                balanceAfter: bankAccount.balance
            });

            await this.saveEconomy();

            return {
                success: true,
                withdrawn: withdrawAmount,
                localBalance: user.balance,
                bankBalance: bankAccount.balance,
                message: `Retrait de ${withdrawAmount.toLocaleString()} coins effectué avec succès !`
            };
        } catch (error) {
            console.error('[EconomyManager] Erreur retrait banque:', error);
            return {
                success: false,
                message: error.message || 'Échec du retrait bancaire'
            };
        }
    }

    /**
     * Effectue un virement de banque à banque inter-serveur entre deux utilisateurs
     * @param {string} fromUserId - ID de l'expéditeur
     * @param {string} toUserId - ID du bénéficiaire
     * @param {number} amount - Montant du virement
     * @param {string} [reason='Virement bancaire'] - Motif
     * @returns {Promise<Object>} Résultat
     */
    async transferBank(fromUserId, toUserId, amount, reason = 'Virement bancaire') {
        try {
            if (fromUserId === toUserId) {
                return {
                    success: false,
                    message: 'Vous ne pouvez pas effectuer un virement à vous-même'
                };
            }

            const transferAmount = Math.max(0, parseInt(amount, 10) || 0);
            if (transferAmount <= 0) {
                return {
                    success: false,
                    message: 'Le montant du virement doit être supérieur à 0'
                };
            }

            this.ensureGlobalBankUserExists(fromUserId);
            this.ensureGlobalBankUserExists(toUserId);

            const senderAccount = this.economy.globalBank[fromUserId];
            const recipientAccount = this.economy.globalBank[toUserId];

            if (senderAccount.balance < transferAmount) {
                return {
                    success: false,
                    message: `Solde bancaire insuffisant (${senderAccount.balance.toLocaleString()} coins en banque, ${transferAmount.toLocaleString()} demandés)`
                };
            }

            // Débit expéditeur
            senderAccount.balance -= transferAmount;
            if (!senderAccount.transactions) senderAccount.transactions = [];
            senderAccount.transactions.push({
                type: 'wire_transfer_out',
                amount: -transferAmount,
                targetUserId: toUserId,
                reason,
                timestamp: new Date().toISOString(),
                balanceAfter: senderAccount.balance
            });

            // Crédit bénéficiaire
            recipientAccount.balance += transferAmount;
            if (!recipientAccount.transactions) recipientAccount.transactions = [];
            recipientAccount.transactions.push({
                type: 'wire_transfer_in',
                amount: transferAmount,
                fromUserId,
                reason,
                timestamp: new Date().toISOString(),
                balanceAfter: recipientAccount.balance
            });

            await this.saveEconomy();

            return {
                success: true,
                amount: transferAmount,
                senderBalance: senderAccount.balance,
                recipientBalance: recipientAccount.balance,
                message: `Virement inter-serveur de ${transferAmount.toLocaleString()} coins effectué avec succès !`
            };
        } catch (error) {
            console.error('[EconomyManager] Erreur virement banque:', error);
            return {
                success: false,
                message: error.message || 'Échec du virement bancaire'
            };
        }
    }

    /**
     * Identifie le serveur principal ou le plus actif pour un utilisateur
     * @param {string} userId - ID de l'utilisateur
     * @returns {string|null} ID du serveur principal
     */
    getPrimaryGuildForUser(userId) {
        if (!this.economy.guilds) return null;
        let bestGuildId = null;
        let maxBalance = -1;

        for (const gid in this.economy.guilds) {
            const user = this.economy.guilds[gid]?.users?.[userId];
            if (user) {
                const bal = user.balance || 0;
                if (bal > maxBalance) {
                    maxBalance = bal;
                    bestGuildId = gid;
                }
            }
        }
        return bestGuildId;
    }

    /**
     * Traite automatiquement les intérêts du jour pour un utilisateur individuel s'ils sont dus
     * @param {string} userId - ID de l'utilisateur
     * @param {string} [guildId=null] - ID du serveur
     * @returns {Promise<Object>} Résultat
     */
    async autoProcessDailyInterestForUser(userId, guildId = null) {
        this.ensureGlobalBankUserExists(userId);
        const bankAccount = this.economy.globalBank[userId];
        if (!bankAccount || !bankAccount.balance || bankAccount.balance <= 0) {
            return { credited: false, reason: 'Compte vide' };
        }

        const todayDate = new Date().toDateString();
        const lastInterestDate = bankAccount.lastInterest ? new Date(bankAccount.lastInterest).toDateString() : null;
        if (lastInterestDate === todayDate) {
            return { credited: false, reason: 'Déjà crédité aujourd\'hui' };
        }

        const targetGuildId = guildId || this.getPrimaryGuildForUser(userId);
        const rateInfo = this.calculateDynamicInterestRate(targetGuildId);
        const interest = Math.max(1, Math.round(bankAccount.balance * rateInfo.rate));

        bankAccount.balance += interest;
        bankAccount.lastInterest = new Date().toISOString();

        if (!bankAccount.transactions) bankAccount.transactions = [];
        bankAccount.transactions.push({
            type: 'interest',
            auto: true,
            amount: interest,
            rate: rateInfo.rate,
            ratePercentage: rateInfo.ratePercentage,
            guildId: targetGuildId,
            timestamp: new Date().toISOString(),
            balanceAfter: bankAccount.balance
        });

        await this.saveEconomy();

        return {
            credited: true,
            interest,
            rate: rateInfo.rate,
            rateInfo,
            newBankBalance: bankAccount.balance
        };
    }

    /**
     * Traite et verse automatiquement les intérêts quotidiens pour tous les comptes bancaires éligibles
     * @param {string} [defaultGuildId=null] - ID de serveur par défaut optionnel
     * @returns {Promise<Object>} Rapport de la distribution automatique
     */
    async processAllPendingBankInterests(defaultGuildId = null) {
        try {
            this.ensureGlobalBankExists();
            const todayDate = new Date().toDateString();
            let totalAccountsProcessed = 0;
            let totalInterestDistributed = 0;
            const details = [];

            for (const userId in this.economy.globalBank) {
                const bankAccount = this.economy.globalBank[userId];
                if (!bankAccount || !bankAccount.balance || bankAccount.balance <= 0) {
                    continue;
                }

                const lastInterestDate = bankAccount.lastInterest ? new Date(bankAccount.lastInterest).toDateString() : null;
                if (lastInterestDate === todayDate) {
                    continue;
                }

                const targetGuildId = defaultGuildId || this.getPrimaryGuildForUser(userId);
                const rateInfo = this.calculateDynamicInterestRate(targetGuildId);

                const interest = Math.max(1, Math.round(bankAccount.balance * rateInfo.rate));
                bankAccount.balance += interest;
                bankAccount.lastInterest = new Date().toISOString();

                if (!bankAccount.transactions) bankAccount.transactions = [];
                bankAccount.transactions.push({
                    type: 'interest',
                    auto: true,
                    amount: interest,
                    rate: rateInfo.rate,
                    ratePercentage: rateInfo.ratePercentage,
                    guildId: targetGuildId,
                    timestamp: new Date().toISOString(),
                    balanceAfter: bankAccount.balance
                });

                totalAccountsProcessed++;
                totalInterestDistributed += interest;
                details.push({
                    userId,
                    guildId: targetGuildId,
                    interest,
                    newBalance: bankAccount.balance,
                    rate: rateInfo.ratePercentage
                });
            }

            if (totalAccountsProcessed > 0) {
                await this.saveEconomy();
                console.log(`[Banque] Distribution automatique des intérêts : +${totalInterestDistributed} coins versés sur ${totalAccountsProcessed} comptes.`);
            }

            return {
                success: true,
                totalAccountsProcessed,
                totalInterestDistributed,
                details
            };
        } catch (error) {
            console.error('[EconomyManager] Erreur processAllPendingBankInterests:', error);
            return {
                success: false,
                totalAccountsProcessed: 0,
                totalInterestDistributed: 0,
                message: error.message
            };
        }
    }

    /**
     * Réclame les intérêts quotidiens sur le compte bancaire inter-serveur
     * La distribution est automatique, cette commande sert de vérification et versement immédiat si besoin
     * @param {string} userId - ID de l'utilisateur
     * @param {string} [guildId=null] - ID du serveur pour le calcul dynamique
     * @returns {Promise<Object>} Résultat
     */
    async claimBankInterest(userId, guildId = null) {
        try {
            this.ensureGlobalBankUserExists(userId);
            const bankAccount = this.economy.globalBank[userId];

            if (!bankAccount.balance || bankAccount.balance <= 0) {
                return {
                    success: false,
                    message: 'Votre compte bancaire est vide. Déposez des coins pour générer des intérêts.'
                };
            }

            const todayDate = new Date().toDateString();
            const lastInterestDate = bankAccount.lastInterest ? new Date(bankAccount.lastInterest).toDateString() : null;

            if (lastInterestDate === todayDate) {
                const todayTx = (bankAccount.transactions || []).slice().reverse().find(tx => tx.type === 'interest' && new Date(tx.timestamp).toDateString() === todayDate);
                const todayInterest = todayTx?.amount || 0;
                const todayRate = todayTx?.ratePercentage || '1.00%';
                return {
                    success: false,
                    alreadyCredited: true,
                    autoCredited: true,
                    interest: todayInterest,
                    ratePercentage: todayRate,
                    newBankBalance: bankAccount.balance,
                    message: `Vous avez déjà réclamé (ou reçu automatiquement) vos intérêts bancaires aujourd'hui (+${todayInterest.toLocaleString()} coins). Vos prochains intérêts seront versés automatiquement demain !`
                };
            }

            const dynamicRateInfo = this.calculateDynamicInterestRate(guildId);
            const interest = Math.max(1, Math.round(bankAccount.balance * dynamicRateInfo.rate));
            bankAccount.balance += interest;
            bankAccount.lastInterest = new Date().toISOString();

            if (!bankAccount.transactions) bankAccount.transactions = [];
            bankAccount.transactions.push({
                type: 'interest',
                auto: true,
                amount: interest,
                rate: dynamicRateInfo.rate,
                ratePercentage: dynamicRateInfo.ratePercentage,
                guildId,
                timestamp: new Date().toISOString(),
                balanceAfter: bankAccount.balance
            });

            await this.saveEconomy();

            return {
                success: true,
                interest,
                rate: dynamicRateInfo.rate,
                rateInfo: dynamicRateInfo,
                newBankBalance: bankAccount.balance,
                message: `Vous avez reçu +${interest.toLocaleString()} coins d'intérêts bancaires (taux : ${dynamicRateInfo.ratePercentage}) !`
            };
        } catch (error) {
            console.error('[EconomyManager] Erreur intérêts banque:', error);
            return {
                success: false,
                message: error.message || 'Échec de la réclamation des intérêts'
            };
        }
    }

    /**
     * Définit le solde bancaire inter-serveur d'un utilisateur (Admin)
     * @param {string} userId - ID de l'utilisateur
     * @param {number} amount - Nouveau solde
     * @param {string} [reason='Admin set bank balance'] - Motif
     * @returns {Promise<Object>} Résultat
     */
    async adminSetBankBalance(userId, amount, reason = 'Admin set bank balance') {
        try {
            const newBalance = Math.max(0, parseInt(amount, 10) || 0);
            this.ensureGlobalBankUserExists(userId);
            const bankAccount = this.economy.globalBank[userId];
            const oldBalance = bankAccount.balance || 0;

            bankAccount.balance = newBalance;

            if (!bankAccount.transactions) bankAccount.transactions = [];
            bankAccount.transactions.push({
                type: 'admin_set',
                amount: newBalance - oldBalance,
                reason,
                timestamp: new Date().toISOString(),
                balanceAfter: newBalance
            });

            await this.saveEconomy();

            return {
                success: true,
                oldBalance,
                newBalance,
                message: `Solde bancaire de ${userId} fixé à ${newBalance.toLocaleString()} coins`
            };
        } catch (error) {
            console.error('[EconomyManager] Erreur admin set bank balance:', error);
            return {
                success: false,
                message: error.message || 'Échec de la mise à jour du solde bancaire'
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
            
            this.economy.guilds[guildId].totalTransactions = (this.economy.guilds[guildId].totalTransactions || 0) + 1;
            this.economy.guilds[guildId].lastUpdate = new Date().toISOString();
            
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
     * Executes a work activity for a user with cooldown
     * @param {string} userId - User ID
     * @param {string} guildId - Guild ID
     * @param {number} cooldownMinutes - Cooldown in minutes (default 30)
     * @returns {Promise<Object>} Result with earnings, job and new balance or cooldown remaining
     */
    async executeWork(userId, guildId, cooldownMinutes = 30) {
        try {
            this.ensureUserExists(guildId, userId);
            const user = this.economy.guilds[guildId].users[userId];
            const now = Date.now();
            const cooldownMs = cooldownMinutes * 60 * 1000;

            if (user.lastWork) {
                const lastWorkTime = new Date(user.lastWork).getTime();
                const diff = now - lastWorkTime;
                if (diff < cooldownMs) {
                    const remainingMs = cooldownMs - diff;
                    const remainingMins = Math.ceil(remainingMs / 60000);
                    return {
                        success: false,
                        cooldown: true,
                        remainingMinutes: remainingMins,
                        message: `Vous devez vous reposer encore ${remainingMins} minute(s) avant de travailler à nouveau.`
                    };
                }
            }

            const guild = this.economy.guilds[guildId];
            const marketMultiplier = guild.currentValue || 1.0;
            const baseSalary = Math.floor(Math.random() * 70) + 50; // 50 - 120
            const finalSalary = Math.max(10, Math.round(baseSalary * marketMultiplier));

            const result = await this.addCurrency(userId, guildId, finalSalary, 'Salaire de travail');
            if (result.success) {
                user.lastWork = new Date().toISOString();
                await this.saveEconomy();
                return {
                    success: true,
                    amount: finalSalary,
                    newBalance: user.balance,
                    currentValue: guild.currentValue
                };
            }

            return result;
        } catch (error) {
            console.error('Error executing work:', error);
            return {
                success: false,
                message: 'Failed to execute work'
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
            
            const bankBalance = this.getGlobalBankBalance(userId);
            
            return {
                balance: user.balance,
                bankBalance,
                netWorth: user.balance + bankBalance,
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