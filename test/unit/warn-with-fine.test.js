import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import warnCmd from '../../commands/warn.js';
import warningsCmd from '../../commands/warnings.js';
import { EconomyManager } from '../../utils/EconomyManager.js';
import { WarnManager } from '../../utils/WarnManager.js';

describe('Warn with Fines System', () => {
    const testEcoPath = path.join(process.cwd(), 'data', 'test-fine-economy.json');
    const testWarnPath = 'test-fine-warnings.json';
    const fullTestWarnPath = path.join(process.cwd(), 'data', testWarnPath);

    let economyManager;
    let warnManager;
    let mockInteraction;
    let mockAdminManager;

    beforeEach(() => {
        if (fs.existsSync(testEcoPath)) fs.unlinkSync(testEcoPath);
        if (fs.existsSync(fullTestWarnPath)) fs.unlinkSync(fullTestWarnPath);

        economyManager = new EconomyManager(testEcoPath);
        warnManager = new WarnManager(testWarnPath);

        mockAdminManager = {
            isAdmin: vi.fn().mockResolvedValue(false)
        };

        mockInteraction = {
            inGuild: vi.fn().mockReturnValue(true),
            guild: { id: 'guild_warn_test', name: 'Test Guild', members: { ban: vi.fn().mockResolvedValue(true) } },
            user: { id: 'mod_1', tag: 'Mod#0001' },
            member: {
                permissions: {
                    has: vi.fn().mockReturnValue(true)
                }
            },
            memberPermissions: {
                has: vi.fn().mockReturnValue(true)
            },
            options: {
                getUser: vi.fn(),
                getString: vi.fn(),
                getBoolean: vi.fn(),
                getInteger: vi.fn()
            },
            reply: vi.fn().mockResolvedValue(true)
        };
    });

    afterEach(() => {
        if (fs.existsSync(testEcoPath)) fs.unlinkSync(testEcoPath);
        if (fs.existsSync(fullTestWarnPath)) fs.unlinkSync(fullTestWarnPath);
    });

    describe('EconomyManager.applyFine', () => {
        it('deducts full fine when user has sufficient balance', async () => {
            await economyManager.setBalance('user_1', 'guild_1', 500, 'Initial setup');
            const result = await economyManager.applyFine('user_1', 'guild_1', 150, 'Avertissement');

            expect(result.success).toBe(true);
            expect(result.deducted).toBe(150);
            expect(result.remainingBalance).toBe(350);
            expect(result.wasPartial).toBe(false);

            const balance = await economyManager.getBalance('user_1', 'guild_1');
            expect(balance).toBe(350);
        });

        it('deducts remaining balance without going negative when user has insufficient balance', async () => {
            await economyManager.setBalance('user_poor', 'guild_1', 40, 'Initial setup');
            const result = await economyManager.applyFine('user_poor', 'guild_1', 100, 'Avertissement');

            expect(result.success).toBe(true);
            expect(result.deducted).toBe(40);
            expect(result.remainingBalance).toBe(0);
            expect(result.wasPartial).toBe(true);

            const balance = await economyManager.getBalance('user_poor', 'guild_1');
            expect(balance).toBe(0);
        });

        it('deducts 0 when user balance is already 0', async () => {
            await economyManager.setBalance('user_zero', 'guild_1', 0, 'Initial setup');
            const result = await economyManager.applyFine('user_zero', 'guild_1', 100, 'Avertissement');

            expect(result.success).toBe(true);
            expect(result.deducted).toBe(0);
            expect(result.remainingBalance).toBe(0);
            expect(result.wasPartial).toBe(true);
        });

        it('handles 0 or negative requested amounts safely', async () => {
            await economyManager.setBalance('user_1', 'guild_1', 300, 'Initial setup');
            const result = await economyManager.applyFine('user_1', 'guild_1', 0, 'Aucune amende');

            expect(result.success).toBe(true);
            expect(result.deducted).toBe(0);
            expect(result.remainingBalance).toBe(300);
            expect(result.wasPartial).toBe(false);
        });

        it('pays full fine from global inter-server bank when local balance is 0', async () => {
            await economyManager.setBalance('user_bank_payer', 'guild_1', 0, 'Local empty');
            await economyManager.adminSetBankBalance('user_bank_payer', 500, 'Bank savings');

            const result = await economyManager.applyFine('user_bank_payer', 'guild_1', 150, 'Avertissement');

            expect(result.success).toBe(true);
            expect(result.deducted).toBe(150);
            expect(result.deductedFromLocal).toBe(0);
            expect(result.deductedFromBank).toBe(150);
            expect(result.paidByBank).toBe(true);
            expect(result.paidFullyByBank).toBe(true);
            expect(result.remainingBalance).toBe(0);
            expect(result.remainingBankBalance).toBe(350);
            expect(result.wasPartial).toBe(false);

            const localBalance = await economyManager.getBalance('user_bank_payer', 'guild_1');
            const bankBalance = economyManager.getGlobalBankBalance('user_bank_payer');
            expect(localBalance).toBe(0);
            expect(bankBalance).toBe(350);
        });

        it('splits fine between local balance and global bank when local balance is insufficient', async () => {
            await economyManager.setBalance('user_split', 'guild_1', 40, 'Low local balance');
            await economyManager.adminSetBankBalance('user_split', 300, 'Bank balance');

            const result = await economyManager.applyFine('user_split', 'guild_1', 100, 'Avertissement');

            expect(result.success).toBe(true);
            expect(result.deducted).toBe(100);
            expect(result.deductedFromLocal).toBe(40);
            expect(result.deductedFromBank).toBe(60);
            expect(result.paidByBank).toBe(true);
            expect(result.paidFullyByBank).toBe(false);
            expect(result.remainingBalance).toBe(0);
            expect(result.remainingBankBalance).toBe(240);
            expect(result.wasPartial).toBe(false);

            const localBalance = await economyManager.getBalance('user_split', 'guild_1');
            const bankBalance = economyManager.getGlobalBankBalance('user_split');
            expect(localBalance).toBe(0);
            expect(bankBalance).toBe(240);
        });

        it('exhausts both local balance and global bank when combined balance is insufficient', async () => {
            await economyManager.setBalance('user_both_low', 'guild_1', 30, 'Local low');
            await economyManager.adminSetBankBalance('user_both_low', 50, 'Bank low');

            const result = await economyManager.applyFine('user_both_low', 'guild_1', 120, 'Grosse amende');

            expect(result.success).toBe(true);
            expect(result.deducted).toBe(80);
            expect(result.deductedFromLocal).toBe(30);
            expect(result.deductedFromBank).toBe(50);
            expect(result.remainingBalance).toBe(0);
            expect(result.remainingBankBalance).toBe(0);
            expect(result.wasPartial).toBe(true);

            const localBalance = await economyManager.getBalance('user_both_low', 'guild_1');
            const bankBalance = economyManager.getGlobalBankBalance('user_both_low');
            expect(localBalance).toBe(0);
            expect(bankBalance).toBe(0);
        });
    });

    describe('WarnManager with Fine', () => {
        it('records fine amount in warn object and persists to disk', () => {
            const warn = warnManager.addWarn('guild_1', 'user_1', 'Spam', 'mod_1', 150);

            expect(warn.fine).toBe(150);
            expect(warn.reason).toBe('Spam');

            // Verify persistence by loading into new instance
            const loadedManager = new WarnManager(testWarnPath);
            const userWarns = loadedManager.getWarns('guild_1', 'user_1');
            expect(userWarns.length).toBe(1);
            expect(userWarns[0].fine).toBe(150);
        });
    });

    describe('/warn Slash Command with Fines', () => {
        let targetUser;

        beforeEach(async () => {
            targetUser = {
                id: 'target_warned',
                tag: 'Target#0001',
                bot: false,
                send: vi.fn().mockResolvedValue(true)
            };
            mockInteraction.options.getUser.mockReturnValue(targetUser);
            mockInteraction.options.getString.mockImplementation((name) => {
                if (name === 'raison') return 'Comportement toxique';
                return null;
            });
            mockInteraction.options.getBoolean.mockReturnValue(false);

            // Give target 1,000 coins
            await economyManager.setBalance('target_warned', 'guild_warn_test', 1000, 'Init');
        });

        it('applies default fine (100 coins) when amende option is omitted', async () => {
            mockInteraction.options.getString.mockImplementation((name) => {
                if (name === 'raison') return 'Comportement toxique';
                return null; // amende omitted
            });

            await warnCmd.execute(
                mockInteraction,
                mockAdminManager,
                warnManager,
                {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {},
                economyManager
            );

            expect(mockInteraction.reply).toHaveBeenCalled();
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            expect(replyCall.content).toContain('Amende : -100 coins');

            const newBalance = await economyManager.getBalance('target_warned', 'guild_warn_test');
            expect(newBalance).toBe(900);

            // User received DM with fine info
            expect(targetUser.send).toHaveBeenCalled();
            const dmEmbed = targetUser.send.mock.calls[0][0].embeds[0];
            const fineField = dmEmbed.data.fields.find(f => f.name.includes('Amende'));
            expect(fineField.value).toContain('-100');
        });

        it('applies specific fixed fine (e.g. 250 coins)', async () => {
            mockInteraction.options.getString.mockImplementation((name) => {
                if (name === 'raison') return 'Insultes répétées';
                if (name === 'amende') return '250';
                return null;
            });

            await warnCmd.execute(
                mockInteraction,
                mockAdminManager,
                warnManager,
                {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {},
                economyManager
            );

            const newBalance = await economyManager.getBalance('target_warned', 'guild_warn_test');
            expect(newBalance).toBe(750);

            const replyCall = mockInteraction.reply.mock.calls[0][0];
            expect(replyCall.content).toContain('-250 coins');
        });

        it('applies percentage fine (e.g. 20% of 1000 = 200 coins)', async () => {
            mockInteraction.options.getString.mockImplementation((name) => {
                if (name === 'raison') return 'Provocation';
                if (name === 'amende') return '20%';
                return null;
            });

            await warnCmd.execute(
                mockInteraction,
                mockAdminManager,
                warnManager,
                {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {},
                economyManager
            );

            const newBalance = await economyManager.getBalance('target_warned', 'guild_warn_test');
            expect(newBalance).toBe(800); // 1000 - 200

            const replyCall = mockInteraction.reply.mock.calls[0][0];
            expect(replyCall.content).toContain('-200 coins');
        });

        it('applies 0 coins when amende is explicitly 0 or aucun', async () => {
            mockInteraction.options.getString.mockImplementation((name) => {
                if (name === 'raison') return 'Premier avertissement sans frais';
                if (name === 'amende') return '0';
                return null;
            });

            await warnCmd.execute(
                mockInteraction,
                mockAdminManager,
                warnManager,
                {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {},
                economyManager
            );

            const newBalance = await economyManager.getBalance('target_warned', 'guild_warn_test');
            expect(newBalance).toBe(1000); // unchanged
        });

        it('handles low balance safely with partial fine warning in DM', async () => {
            await economyManager.setBalance('target_warned', 'guild_warn_test', 35, 'Low balance');

            mockInteraction.options.getString.mockImplementation((name) => {
                if (name === 'raison') return 'Abus';
                if (name === 'amende') return '100';
                return null;
            });

            await warnCmd.execute(
                mockInteraction,
                mockAdminManager,
                warnManager,
                {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {},
                economyManager
            );

            const newBalance = await economyManager.getBalance('target_warned', 'guild_warn_test');
            expect(newBalance).toBe(0);

            const replyCall = mockInteraction.reply.mock.calls[0][0];
            expect(replyCall.content).toContain('-35 coins');

            const dmEmbed = targetUser.send.mock.calls[0][0].embeds[0];
            const fineField = dmEmbed.data.fields.find(f => f.name.includes('Amende'));
            expect(fineField.value).toContain('solde insuffisant');
        });

        it('pays fine from global bank when target user has 0 local coins', async () => {
            // Target has 0 local coins, but 500 in inter-server bank
            await economyManager.setBalance('target_warned', 'guild_warn_test', 0, 'Empty local');
            await economyManager.adminSetBankBalance('target_warned', 500, 'Bank savings');

            mockInteraction.options.getString.mockImplementation((name) => {
                if (name === 'raison') return 'Comportement toxique';
                if (name === 'amende') return '200';
                return null;
            });

            await warnCmd.execute(
                mockInteraction,
                mockAdminManager,
                warnManager,
                {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {},
                economyManager
            );

            const localBal = await economyManager.getBalance('target_warned', 'guild_warn_test');
            const bankBal = economyManager.getGlobalBankBalance('target_warned');
            expect(localBal).toBe(0);
            expect(bankBal).toBe(300);

            const replyCall = mockInteraction.reply.mock.calls[0][0];
            expect(replyCall.content).toContain('payée par la banque inter-serveur');

            const dmEmbed = targetUser.send.mock.calls[0][0].embeds[0];
            const fineField = dmEmbed.data.fields.find(f => f.name.includes('Amende'));
            expect(fineField.value).toContain('Banque inter-serveur');
            expect(fineField.value).toContain('-200');
        });

        it('calculates percentage fine on global bank when local balance is 0', async () => {
            // Target has 0 local coins, but 1000 in bank. Warn with 25% fine = 250 coins
            await economyManager.setBalance('target_warned', 'guild_warn_test', 0, 'Empty local');
            await economyManager.adminSetBankBalance('target_warned', 1000, 'Bank savings');

            mockInteraction.options.getString.mockImplementation((name) => {
                if (name === 'raison') return 'Spam abusif';
                if (name === 'amende') return '25%';
                return null;
            });

            await warnCmd.execute(
                mockInteraction,
                mockAdminManager,
                warnManager,
                {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {},
                economyManager
            );

            const bankBal = economyManager.getGlobalBankBalance('target_warned');
            expect(bankBal).toBe(750); // 1000 - 250 = 750

            const dmEmbed = targetUser.send.mock.calls[0][0].embeds[0];
            const fineField = dmEmbed.data.fields.find(f => f.name.includes('Amende'));
            expect(fineField.value).toContain('-250');
            expect(fineField.value).toContain('Banque inter-serveur');
        });

        it('rejects execution by non-moderators', async () => {
            mockInteraction.memberPermissions.has.mockReturnValue(false);
            mockInteraction.member.permissions.has.mockReturnValue(false);

            await warnCmd.execute(
                mockInteraction,
                mockAdminManager,
                warnManager,
                {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {},
                economyManager
            );

            expect(mockInteraction.reply).toHaveBeenCalledWith(expect.objectContaining({
                content: expect.stringContaining('permission de modérer'),
                ephemeral: true
            }));
        });
    });

    describe('/warnings Command Display with Fines', () => {
        it('displays fine in warnings list embed when fine was applied', async () => {
            const target = { id: 'user_warned_2', tag: 'Warned#0002' };
            warnManager.addWarn('guild_warn_test', 'user_warned_2', 'Spam vocal', 'mod_1', 120);

            mockInteraction.guild.members = {
                cache: {
                    get: vi.fn().mockReturnValue({ user: { tag: 'Mod#0001' } })
                }
            };
            mockInteraction.options.getUser.mockReturnValue(target);

            // Execute warnings command
            await warningsCmd.execute(mockInteraction, mockAdminManager, warnManager);

            expect(mockInteraction.reply).toHaveBeenCalled();
            const reply = mockInteraction.reply.mock.calls[0][0];
            expect(reply.embeds).toBeDefined();
            const field = reply.embeds[0].data.fields[0];
            expect(field.value).toContain('Amende:');
            expect(field.value).toContain('-120 coins');
        });
    });
});
