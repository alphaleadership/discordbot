import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { EconomyManager } from '../../utils/EconomyManager.js';
import banqueCmd, { parseBankAmount } from '../../commands/banque.js';
import argentCmd from '../../commands/argent.js';

describe('Per-Server Accounts and Inter-Server Bank System', () => {
    const testEcoPath = path.join(process.cwd(), 'data', 'test-bank-economy.json');
    let economyManager;
    let mockInteraction;

    beforeEach(() => {
        if (fs.existsSync(testEcoPath)) {
            fs.unlinkSync(testEcoPath);
        }

        economyManager = new EconomyManager(testEcoPath);

        mockInteraction = {
            inGuild: vi.fn().mockReturnValue(true),
            guild: { id: 'guild_alpha', name: 'Alpha Server' },
            user: { id: 'bank_user_1', tag: 'Banker#0001', username: 'Banker' },
            options: {
                getSubcommand: vi.fn(),
                getUser: vi.fn(),
                getString: vi.fn()
            },
            reply: vi.fn().mockResolvedValue(true)
        };
    });

    afterEach(() => {
        if (fs.existsSync(testEcoPath)) {
            fs.unlinkSync(testEcoPath);
        }
    });

    describe('parseBankAmount helper', () => {
        it('parses raw numbers and strings', () => {
            expect(parseBankAmount(500, 1000)).toBe(500);
            expect(parseBankAmount('250', 1000)).toBe(250);
        });

        it('parses all, max and tout as full available balance', () => {
            expect(parseBankAmount('all', 1500)).toBe(1500);
            expect(parseBankAmount('max', 2000)).toBe(2000);
            expect(parseBankAmount('tout', 750)).toBe(750);
        });

        it('parses percentages against available balance', () => {
            expect(parseBankAmount('50%', 1000)).toBe(500);
            expect(parseBankAmount('25%', 800)).toBe(200);
            expect(parseBankAmount('100%', 1200)).toBe(1200);
        });

        it('parses unit suffixes (k, m)', () => {
            expect(parseBankAmount('5k', 100000)).toBe(5000);
            expect(parseBankAmount('1.5M', 10000000)).toBe(1500000);
        });

        it('returns 0 for invalid inputs', () => {
            expect(parseBankAmount(null, 1000)).toBe(0);
            expect(parseBankAmount('invalid', 1000)).toBe(0);
            expect(parseBankAmount('-50', 1000)).toBe(0);
        });
    });

    describe('EconomyManager Inter-Server Bank Core', () => {
        it('deposits cash from local server wallet into global inter-server bank', async () => {
            // Set 1000 coins on Alpha Server
            await economyManager.setBalance('bank_user_1', 'guild_alpha', 1000, 'Init');

            const res = await economyManager.depositToBank('bank_user_1', 'guild_alpha', 400);
            expect(res.success).toBe(true);
            expect(res.deposited).toBe(400);
            expect(res.localBalance).toBe(600);
            expect(res.bankBalance).toBe(400);

            // Verify local balance
            expect(await economyManager.getBalance('bank_user_1', 'guild_alpha')).toBe(600);
            // Verify global bank balance
            expect(economyManager.getGlobalBankBalance('bank_user_1')).toBe(400);
        });

        it('allows withdrawing funds deposited on Server A to Server B (cross-server portability)', async () => {
            // Give cash on Server A and deposit to bank
            await economyManager.setBalance('traveler', 'server_A', 2000, 'Init server A');
            await economyManager.depositToBank('traveler', 'server_A', 1500);

            expect(economyManager.getGlobalBankBalance('traveler')).toBe(1500);
            expect(await economyManager.getBalance('traveler', 'server_A')).toBe(500);

            // On Server B, traveler initially has 0 local coins
            expect(await economyManager.getBalance('traveler', 'server_B')).toBe(0);

            // Traveler withdraws 1000 coins from global bank into Server B local wallet!
            const withdrawRes = await economyManager.withdrawFromBank('traveler', 'server_B', 1000);
            expect(withdrawRes.success).toBe(true);
            expect(withdrawRes.withdrawn).toBe(1000);
            expect(withdrawRes.localBalance).toBe(1000); // 1000 on Server B
            expect(withdrawRes.bankBalance).toBe(500);    // 500 left in inter-server bank

            // Verify local balances on both servers
            expect(await economyManager.getBalance('traveler', 'server_A')).toBe(500);
            expect(await economyManager.getBalance('traveler', 'server_B')).toBe(1000);
        });

        it('rejects deposit when local balance is insufficient', async () => {
            await economyManager.setBalance('user_poor', 'guild_alpha', 100, 'Init');
            const res = await economyManager.depositToBank('user_poor', 'guild_alpha', 500);

            expect(res.success).toBe(false);
            expect(res.message).toContain('insuffisant');
            expect(economyManager.getGlobalBankBalance('user_poor')).toBe(0);
        });

        it('rejects withdraw when bank balance is insufficient', async () => {
            await economyManager.adminSetBankBalance('user_low_bank', 50);
            const res = await economyManager.withdrawFromBank('user_low_bank', 'guild_alpha', 200);

            expect(res.success).toBe(false);
            expect(res.message).toContain('insuffisant');
        });

        it('performs inter-server bank wire transfer between users', async () => {
            await economyManager.adminSetBankBalance('alice', 1000);
            await economyManager.adminSetBankBalance('bob', 200);

            const transferRes = await economyManager.transferBank('alice', 'bob', 400, 'Remboursement');
            expect(transferRes.success).toBe(true);
            expect(transferRes.amount).toBe(400);
            expect(transferRes.senderBalance).toBe(600);
            expect(transferRes.recipientBalance).toBe(600);

            expect(economyManager.getGlobalBankBalance('alice')).toBe(600);
            expect(economyManager.getGlobalBankBalance('bob')).toBe(600);
        });

        it('claims daily bank interest and enforces once per day cooldown', async () => {
            await economyManager.adminSetBankBalance('saver', 10000);

            // First claim
            const res1 = await economyManager.claimBankInterest('saver');
            expect(res1.success).toBe(true);
            // 1% of 10000 = 100 coins
            expect(res1.interest).toBe(100);
            expect(res1.newBankBalance).toBe(10100);

            // Immediate second claim should be rejected
            const res2 = await economyManager.claimBankInterest('saver');
            expect(res2.success).toBe(false);
            expect(res2.message).toContain('déjà réclamé');
        });

        it('calculates comprehensive net worth across all servers and bank', async () => {
            await economyManager.setBalance('magnate', 'server_1', 300);
            await economyManager.setBalance('magnate', 'server_2', 700);
            await economyManager.adminSetBankBalance('magnate', 5000);

            const stats = economyManager.getBankStats('magnate', 'server_1');
            expect(stats.localBalance).toBe(300);
            expect(stats.bankBalance).toBe(5000);
            expect(stats.netWorth).toBe(5300); // server_1 + bank
            expect(stats.totalNetWorth).toBe(6000); // server_1 (300) + server_2 (700) + bank (5000)
        });
    });

    describe('/banque Command', () => {
        beforeEach(async () => {
            await economyManager.setBalance('bank_user_1', 'guild_alpha', 1000, 'Init');
            await economyManager.adminSetBankBalance('bank_user_1', 2500);
        });

        it('displays bank statement with /banque solde', async () => {
            mockInteraction.options.getSubcommand.mockReturnValue('solde');

            await banqueCmd.execute(mockInteraction, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, economyManager);

            expect(mockInteraction.reply).toHaveBeenCalled();
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            expect(replyCall.embeds).toBeDefined();
            expect(replyCall.embeds[0].data.title).toContain('Relevé Bancaire');
            expect(replyCall.embeds[0].data.fields[0].value).toContain('1 000');
            expect(replyCall.embeds[0].data.fields[1].value).toMatch(/2 5/);
        });

        it('deposits cash using /banque deposer', async () => {
            mockInteraction.options.getSubcommand.mockReturnValue('deposer');
            mockInteraction.options.getString.mockReturnValue('500');

            await banqueCmd.execute(mockInteraction, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, economyManager);

            expect(mockInteraction.reply).toHaveBeenCalled();
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            expect(replyCall.embeds[0].data.title).toContain('Dépôt Bancaire Réussi');

            expect(economyManager.getGlobalBankBalance('bank_user_1')).toBe(3000);
            expect(await economyManager.getBalance('bank_user_1', 'guild_alpha')).toBe(500);
        });

        it('withdraws cash using /banque retirer with percentage', async () => {
            mockInteraction.options.getSubcommand.mockReturnValue('retirer');
            mockInteraction.options.getString.mockReturnValue('50%'); // 50% of 2500 = 1250

            await banqueCmd.execute(mockInteraction, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, economyManager);

            expect(mockInteraction.reply).toHaveBeenCalled();
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            expect(replyCall.embeds[0].data.title).toContain('Retrait Bancaire Réussi');

            expect(economyManager.getGlobalBankBalance('bank_user_1')).toBe(1250);
            expect(await economyManager.getBalance('bank_user_1', 'guild_alpha')).toBe(2250);
        });

        it('performs wire transfer using /banque virement', async () => {
            const recipient = {
                id: 'recipient_user',
                tag: 'Recipient#0001',
                bot: false,
                send: vi.fn().mockResolvedValue(true)
            };

            mockInteraction.options.getSubcommand.mockReturnValue('virement');
            mockInteraction.options.getUser.mockReturnValue(recipient);
            mockInteraction.options.getString.mockImplementation((name) => {
                if (name === 'montant') return '500';
                if (name === 'motif') return 'Paiement projet';
                return null;
            });

            await banqueCmd.execute(mockInteraction, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, economyManager);

            expect(mockInteraction.reply).toHaveBeenCalled();
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            expect(replyCall.embeds[0].data.title).toContain('Virement Bancaire Inter-Serveur Réussi');

            expect(economyManager.getGlobalBankBalance('bank_user_1')).toBe(2000);
            expect(economyManager.getGlobalBankBalance('recipient_user')).toBe(500);
            expect(recipient.send).toHaveBeenCalled();
        });

        it('claims interest using /banque interets', async () => {
            mockInteraction.options.getSubcommand.mockReturnValue('interets');

            await banqueCmd.execute(mockInteraction, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, economyManager);

            expect(mockInteraction.reply).toHaveBeenCalled();
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            expect(replyCall.embeds[0].data.title).toContain('Intérêts Bancaires');
        });
    });

    describe('/argent Command with Bank integration', () => {
        it('displays both local balance and global bank in /argent embed', async () => {
            await economyManager.setBalance('bank_user_1', 'guild_alpha', 1000);
            await economyManager.adminSetBankBalance('bank_user_1', 4000);

            await argentCmd.execute(mockInteraction, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, economyManager);

            expect(mockInteraction.reply).toHaveBeenCalled();
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            const fields = replyCall.embeds[0].data.fields;

            const localField = fields.find(f => f.name.includes('Portefeuille local'));
            const bankField = fields.find(f => f.name.includes('Banque inter-serveur'));
            const netWorthField = fields.find(f => f.name.includes('Patrimoine total'));

            expect(localField.value).toContain('1 000');
            expect(bankField.value).toContain('4 000');
            expect(netWorthField.value).toContain('5 000');
        });
    });

    describe('Dynamic Interest Rates System', () => {
        it('calculates baseline rate when no guildId is provided', () => {
            const rateInfo = economyManager.calculateDynamicInterestRate(null);
            expect(rateInfo.rate).toBe(0.01);
            expect(rateInfo.ratePercentage).toBe('1.00%');
            expect(rateInfo.isDynamic).toBe(false);
        });

        it('calculates lower dynamic rate when money supply is scarce and no transactions', async () => {
            await economyManager.setBalance('poor_user', 'guild_poor', 200); // < 1000 coins
            const rateInfo = economyManager.calculateDynamicInterestRate('guild_poor');

            expect(rateInfo.rate).toBeLessThan(0.01); // 0.8%
            expect(rateInfo.currencyModifier).toBe(-0.002);
            expect(rateInfo.isDynamic).toBe(true);
        });

        it('calculates higher dynamic rate when money supply and transactions increase', async () => {
            // Setup an active guild with 50,000 currency and multiple transactions
            await economyManager.setBalance('rich_user', 'guild_active', 50000);
            for (let i = 0; i < 20; i++) {
                economyManager.recordGuildTransaction('guild_active');
            }

            const rateInfo = economyManager.calculateDynamicInterestRate('guild_active');
            expect(rateInfo.rate).toBeGreaterThan(0.01); // Higher than base 1.0%
            expect(rateInfo.currencyModifier).toBeGreaterThan(0);
            expect(rateInfo.transactionBonus).toBeGreaterThan(0);
            expect(rateInfo.totalCurrency).toBe(50000);
            expect(rateInfo.transactionCount).toBeGreaterThanOrEqual(20);
        });

        it('automatically tracks transactions on economy operations (add, remove, deposit, withdraw)', async () => {
            await economyManager.setBalance('trader', 'guild_tx', 5000);
            const initialCount = economyManager.getGuildTransactionCount('guild_tx');
            expect(initialCount).toBe(1); // setBalance counts as 1

            await economyManager.addCurrency('trader', 'guild_tx', 200, 'Work');
            expect(economyManager.getGuildTransactionCount('guild_tx')).toBe(2);

            await economyManager.depositToBank('trader', 'guild_tx', 1000);
            expect(economyManager.getGuildTransactionCount('guild_tx')).toBe(3);

            await economyManager.withdrawFromBank('trader', 'guild_tx', 500);
            expect(economyManager.getGuildTransactionCount('guild_tx')).toBe(4);
        });

        it('credits dynamic interest based on the server when claiming interest', async () => {
            await economyManager.adminSetBankBalance('dyn_saver', 10000);
            await economyManager.setBalance('dyn_saver', 'guild_boosted', 100000);
            for (let i = 0; i < 50; i++) {
                economyManager.recordGuildTransaction('guild_boosted');
            }

            const expectedRateInfo = economyManager.calculateDynamicInterestRate('guild_boosted');
            const result = await economyManager.claimBankInterest('dyn_saver', 'guild_boosted');

            expect(result.success).toBe(true);
            expect(result.rate).toBe(expectedRateInfo.rate);
            // Interest should be bank balance * dynamic rate
            expect(result.interest).toBe(Math.round(10000 * expectedRateInfo.rate));
            expect(result.interest).toBeGreaterThan(100); // Base 1% was 100, dynamic will be > 100
        });

        it('displays dynamic interest analysis with /banque taux', async () => {
            await economyManager.setBalance('bank_user_1', 'guild_alpha', 30000);
            mockInteraction.options.getSubcommand.mockReturnValue('taux');

            await banqueCmd.execute(mockInteraction, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, economyManager);

            expect(mockInteraction.reply).toHaveBeenCalled();
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            const embed = replyCall.embeds[0];

            expect(embed.data.title).toContain('Santé Économique');
            const fields = embed.data.fields;
            expect(fields.find(f => f.name.includes('Taux d\'intérêt'))).toBeDefined();
            expect(fields.find(f => f.name.includes('Monnaie en circulation'))).toBeDefined();
            expect(fields.find(f => f.name.includes('Transactions enregistrées'))).toBeDefined();
        });
    });

    describe('Automatic Interest Distribution System', () => {
        it('automatically credits daily interest for individual user via autoProcessDailyInterestForUser', async () => {
            await economyManager.adminSetBankBalance('auto_user_1', 8000);
            await economyManager.setBalance('auto_user_1', 'guild_alpha', 20000);

            const res = await economyManager.autoProcessDailyInterestForUser('auto_user_1', 'guild_alpha');
            expect(res.credited).toBe(true);
            expect(res.interest).toBeGreaterThan(0);
            expect(res.newBankBalance).toBe(8000 + res.interest);

            // Re-running on same day should skip
            const res2 = await economyManager.autoProcessDailyInterestForUser('auto_user_1', 'guild_alpha');
            expect(res2.credited).toBe(false);
            expect(res2.reason).toContain('Déjà crédité');
        });

        it('automatically processes all pending bank interests in batch via processAllPendingBankInterests', async () => {
            await economyManager.adminSetBankBalance('saver_a', 5000);
            await economyManager.adminSetBankBalance('saver_b', 12000);
            await economyManager.adminSetBankBalance('saver_empty', 0); // Should be skipped

            await economyManager.setBalance('saver_a', 'guild_alpha', 15000);
            await economyManager.setBalance('saver_b', 'guild_alpha', 30000);

            const batchRes = await economyManager.processAllPendingBankInterests('guild_alpha');
            expect(batchRes.success).toBe(true);
            expect(batchRes.totalAccountsProcessed).toBeGreaterThanOrEqual(2);
            expect(batchRes.totalInterestDistributed).toBeGreaterThan(0);

            // Balances should be updated
            expect(economyManager.getGlobalBankBalance('saver_a')).toBeGreaterThan(5000);
            expect(economyManager.getGlobalBankBalance('saver_b')).toBeGreaterThan(12000);
            expect(economyManager.getGlobalBankBalance('saver_empty')).toBe(0);

            // Second batch immediately after should process 0 accounts (already credited)
            const secondBatch = await economyManager.processAllPendingBankInterests('guild_alpha');
            expect(secondBatch.totalAccountsProcessed).toBe(0);
            expect(secondBatch.totalInterestDistributed).toBe(0);
        });

        it('auto-credits interest when user views /banque solde', async () => {
            await economyManager.adminSetBankBalance('bank_user_1', 10000);
            mockInteraction.options.getSubcommand.mockReturnValue('solde');

            // User has interest due today
            await banqueCmd.execute(mockInteraction, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, economyManager);

            expect(mockInteraction.reply).toHaveBeenCalled();
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            const embed = replyCall.embeds[0];

            // Balance should be auto-incremented
            const newBal = economyManager.getGlobalBankBalance('bank_user_1');
            expect(newBal).toBeGreaterThan(10000);

            const interestField = embed.data.fields.find(f => f.name.includes('Intérêts automatiques'));
            expect(interestField).toBeDefined();
            expect(interestField.value).toContain('crédités automatiquement');
        });

        it('notifies user that interest is 100% automatic when using /banque interets if already credited', async () => {
            await economyManager.adminSetBankBalance('bank_user_1', 10000);
            // Process interest automatically first
            await economyManager.autoProcessDailyInterestForUser('bank_user_1', 'guild_alpha');

            mockInteraction.options.getSubcommand.mockReturnValue('interets');
            await banqueCmd.execute(mockInteraction, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, economyManager);

            expect(mockInteraction.reply).toHaveBeenCalled();
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            const embed = replyCall.embeds[0];

            expect(embed.data.title).toContain('Intérêts');
            expect(embed.data.description).toContain('automatique');
        });
    });
});
