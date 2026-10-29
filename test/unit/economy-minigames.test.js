import { describe, it, expect, vi, beforeEach } from 'vitest';
import slotsCmd from '../../commands/slots.js';
import rouletteCmd from '../../commands/roulette.js';
import workCmd from '../../commands/work.js';
import inventoryCmd from '../../commands/inventory.js';
import gambleCmd from '../../commands/gamble.js';
import guessNumberCmd from '../../commands/guess-number.js';

describe('Economy and Minigame Commands', () => {
    let mockEcoManager;
    let mockInteraction;

    beforeEach(() => {
        mockEcoManager = {
            getBalance: vi.fn().mockResolvedValue(500),
            addCurrency: vi.fn().mockResolvedValue({ success: true }),
            removeCurrency: vi.fn().mockResolvedValue({ success: true }),
            executeWork: vi.fn().mockResolvedValue({ success: true, amount: 80, newBalance: 580 }),
            getUserPurchases: vi.fn().mockResolvedValue([]),
            getShopItems: vi.fn().mockResolvedValue({})
        };

        mockInteraction = {
            inGuild: vi.fn().mockReturnValue(true),
            user: { id: 'user_123', tag: 'Player#0001', username: 'Player' },
            guild: { id: 'guild_123', name: 'Test Guild' },
            options: {
                getInteger: vi.fn(),
                getString: vi.fn(),
                getUser: vi.fn()
            },
            reply: vi.fn().mockResolvedValue(true)
        };
    });

    describe('/slots', () => {
        it('has valid command structure', () => {
            expect(slotsCmd.data.name).toBe('slots');
            expect(slotsCmd.execute).toBeTypeOf('function');
        });

        it('rejects bet when balance is insufficient', async () => {
            mockInteraction.options.getInteger.mockReturnValue(1000); // balance is 500
            await slotsCmd.execute(mockInteraction, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, mockEcoManager);
            expect(mockInteraction.reply).toHaveBeenCalled();
            expect(mockInteraction.reply.mock.calls[0][0].content).toContain('Solde insuffisant');
        });

        it('executes a round of slots when balance is sufficient', async () => {
            mockInteraction.options.getInteger.mockReturnValue(50);
            await slotsCmd.execute(mockInteraction, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, mockEcoManager);
            expect(mockInteraction.reply).toHaveBeenCalled();
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            expect(replyCall.embeds).toBeDefined();
            expect(replyCall.embeds[0].data.title).toContain('Machine à Sous');
        });
    });

    describe('/roulette', () => {
        it('has valid command structure', () => {
            expect(rouletteCmd.data.name).toBe('roulette');
            expect(rouletteCmd.execute).toBeTypeOf('function');
        });

        it('rejects number bet without specified number', async () => {
            mockInteraction.options.getInteger.mockImplementation(name => (name === 'mise' ? 50 : null));
            mockInteraction.options.getString.mockReturnValue('nombre');
            await rouletteCmd.execute(mockInteraction, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, mockEcoManager);
            expect(mockInteraction.reply.mock.calls[0][0].content).toContain('spécifier l\'option `numero`');
        });

        it('executes roulette bet when valid', async () => {
            mockInteraction.options.getInteger.mockReturnValue(50);
            mockInteraction.options.getString.mockReturnValue('rouge');
            await rouletteCmd.execute(mockInteraction, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, mockEcoManager);
            expect(mockInteraction.reply).toHaveBeenCalled();
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            expect(replyCall.embeds[0].data.title).toContain('Roulette');
        });
    });

    describe('/work', () => {
        it('has valid command structure', () => {
            expect(workCmd.data.name).toBe('work');
            expect(workCmd.execute).toBeTypeOf('function');
        });

        it('executes work and gives salary', async () => {
            await workCmd.execute(mockInteraction, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, mockEcoManager);
            expect(mockEcoManager.executeWork).toHaveBeenCalledWith('user_123', 'guild_123', 30);
            expect(mockInteraction.reply).toHaveBeenCalled();
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            expect(replyCall.embeds[0].data.title).toContain('Journée de travail');
        });

        it('handles cooldown correctly', async () => {
            mockEcoManager.executeWork.mockResolvedValue({
                success: false,
                cooldown: true,
                message: 'Vous devez vous reposer encore 15 minute(s)'
            });

            await workCmd.execute(mockInteraction, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, mockEcoManager);
            expect(mockInteraction.reply).toHaveBeenCalled();
            expect(mockInteraction.reply.mock.calls[0][0].content).toContain('reposer encore 15 minute(s)');
        });
    });

    describe('/inventory', () => {
        it('has valid command structure', () => {
            expect(inventoryCmd.data.name).toBe('inventory');
            expect(inventoryCmd.execute).toBeTypeOf('function');
        });

        it('shows empty inventory notice', async () => {
            mockEcoManager.getUserPurchases.mockResolvedValue([]);
            await inventoryCmd.execute(mockInteraction, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, mockEcoManager);
            expect(mockInteraction.reply).toHaveBeenCalled();
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            expect(replyCall.embeds[0].data.description).toContain('Votre inventaire est vide');
        });

        it('displays user purchases when populated', async () => {
            mockEcoManager.getUserPurchases.mockResolvedValue([
                { itemId: 'vip_7d', quantity: 1, totalSpent: 200, lastPurchased: new Date().toISOString() }
            ]);
            mockEcoManager.getShopItems.mockResolvedValue({
                vip_7d: { name: 'VIP Role (7 days)', description: 'Access to VIP' }
            });

            await inventoryCmd.execute(mockInteraction, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, mockEcoManager);
            expect(mockInteraction.reply).toHaveBeenCalled();
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            expect(replyCall.embeds[0].data.fields[0].name).toContain('VIP Role');
        });
    });

    describe('/gamble', () => {
        it('has valid command structure', () => {
            expect(gambleCmd.data.name).toBe('gamble');
            expect(gambleCmd.execute).toBeTypeOf('function');
        });

        it('handles coinflip betting', async () => {
            mockInteraction.options.getInteger.mockReturnValue(50);
            mockInteraction.options.getString.mockReturnValue('pile');
            await gambleCmd.execute(mockInteraction, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, mockEcoManager);
            expect(mockInteraction.reply).toHaveBeenCalled();
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            expect(replyCall.embeds[0].data.title).toContain('Jeu de Hasard');
        });

        it('handles dice betting', async () => {
            mockInteraction.options.getInteger.mockReturnValue(50);
            mockInteraction.options.getString.mockReturnValue('des_haut');
            await gambleCmd.execute(mockInteraction, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, mockEcoManager);
            expect(mockInteraction.reply).toHaveBeenCalled();
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            expect(replyCall.embeds[0].data.title).toContain('Jeu de Hasard');
        });
    });

    describe('/guess-number', () => {
        it('has valid command structure', () => {
            expect(guessNumberCmd.data.name).toBe('guess-number');
            expect(guessNumberCmd.execute).toBeTypeOf('function');
        });

        it('starts game and provides clue', async () => {
            mockInteraction.options.getInteger.mockReturnValue(50);
            await guessNumberCmd.execute(mockInteraction, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, mockEcoManager);
            expect(mockInteraction.reply).toHaveBeenCalled();
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            expect(replyCall.embeds[0].data.title).toContain('Devine le nombre');
        });
    });
});
