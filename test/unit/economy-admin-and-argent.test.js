import { describe, it, expect, vi, beforeEach } from 'vitest';
import argentCmd from '../../commands/argent.js';
import ecoAdminCmd, { calculateEffectiveAmount } from '../../commands/eco-admin.js';

describe('Economy Admin and Argent Commands', () => {
    let mockEcoManager;
    let mockInteraction;
    let mockAdminManager;

    beforeEach(() => {
        mockEcoManager = {
            getBalance: vi.fn().mockResolvedValue(500),
            addCurrency: vi.fn().mockResolvedValue({ success: true }),
            removeCurrency: vi.fn().mockResolvedValue({ success: true }),
            setBalance: vi.fn().mockResolvedValue({ success: true, oldBalance: 500, newBalance: 1200 }),
            resetBalance: vi.fn().mockResolvedValue({ success: true, oldBalance: 500, newBalance: 0 }),
            getUserStats: vi.fn().mockResolvedValue({
                balance: 500,
                currentValue: 1.25,
                totalEarned: 2000,
                totalSpent: 1500,
                canClaimDaily: true,
                lastActivity: new Date().toISOString()
            })
        };

        mockAdminManager = {
            isAdmin: vi.fn().mockResolvedValue(true)
        };

        mockInteraction = {
            inGuild: vi.fn().mockReturnValue(true),
            user: { id: 'admin_123', tag: 'Admin#0001', username: 'Admin' },
            member: {
                permissions: {
                    has: vi.fn().mockReturnValue(true)
                }
            },
            guild: { id: 'guild_123', name: 'Test Guild' },
            options: {
                getSubcommand: vi.fn(),
                getInteger: vi.fn(),
                getString: vi.fn(),
                getUser: vi.fn()
            },
            reply: vi.fn().mockResolvedValue(true)
        };
    });

    describe('/argent', () => {
        it('has valid command structure', () => {
            expect(argentCmd.data.name).toBe('argent');
            expect(argentCmd.execute).toBeTypeOf('function');
        });

        it('displays user wealth and statistics in an embed', async () => {
            await argentCmd.execute(mockInteraction, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, mockEcoManager);
            expect(mockInteraction.reply).toHaveBeenCalled();
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            expect(replyCall.embeds).toBeDefined();
            expect(replyCall.embeds[0].data.title).toContain('Porte-monnaie');
            expect(replyCall.embeds[0].data.fields[0].value).toContain('500');
        });
    });

    describe('/eco-admin', () => {
        it('has valid command structure', () => {
            expect(ecoAdminCmd.data.name).toBe('eco-admin');
            expect(ecoAdminCmd.execute).toBeTypeOf('function');
        });

        it('rejects execution by non-admins', async () => {
            mockAdminManager.isAdmin.mockResolvedValue(false);
            mockInteraction.member.permissions.has.mockReturnValue(false);

            await ecoAdminCmd.execute(mockInteraction, mockAdminManager, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, mockEcoManager);
            expect(mockInteraction.reply).toHaveBeenCalledWith({
                content: expect.stringContaining('Vous devez être administrateur'),
                ephemeral: true
            });
        });

        it('handles add subcommand', async () => {
            mockInteraction.options.getSubcommand.mockReturnValue('add');
            mockInteraction.options.getUser.mockReturnValue({ id: 'target_1', tag: 'Target#0001' });
            mockInteraction.options.getInteger.mockReturnValue(250);
            mockInteraction.options.getString.mockReturnValue('Bonus animation');

            await ecoAdminCmd.execute(mockInteraction, mockAdminManager, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, mockEcoManager);
            expect(mockEcoManager.addCurrency).toHaveBeenCalledWith(
                'target_1',
                'guild_123',
                250,
                expect.stringContaining('Bonus animation')
            );
            expect(mockInteraction.reply).toHaveBeenCalled();
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            expect(replyCall.embeds[0].data.title).toContain('Ajout de cash réussi');
        });

        it('handles remove subcommand', async () => {
            mockInteraction.options.getSubcommand.mockReturnValue('remove');
            mockInteraction.options.getUser.mockReturnValue({ id: 'target_1', tag: 'Target#0001' });
            mockInteraction.options.getInteger.mockReturnValue(150);
            mockInteraction.options.getString.mockReturnValue('Amende modération');

            await ecoAdminCmd.execute(mockInteraction, mockAdminManager, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, mockEcoManager);
            expect(mockEcoManager.removeCurrency).toHaveBeenCalledWith(
                'target_1',
                'guild_123',
                150,
                expect.stringContaining('Amende modération')
            );
            expect(mockInteraction.reply).toHaveBeenCalled();
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            expect(replyCall.embeds[0].data.title).toContain('Retrait de cash réussi');
        });

        it('prevents remove when amount exceeds current balance', async () => {
            mockInteraction.options.getSubcommand.mockReturnValue('remove');
            mockInteraction.options.getUser.mockReturnValue({ id: 'target_1', tag: 'Target#0001' });
            mockInteraction.options.getInteger.mockReturnValue(10000); // balance is 500

            await ecoAdminCmd.execute(mockInteraction, mockAdminManager, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, mockEcoManager);
            expect(mockEcoManager.removeCurrency).not.toHaveBeenCalled();
            expect(mockInteraction.reply).toHaveBeenCalledWith({
                content: expect.stringContaining('ne peut pas être négatif'),
                ephemeral: true
            });
        });

        it('handles set subcommand', async () => {
            mockInteraction.options.getSubcommand.mockReturnValue('set');
            mockInteraction.options.getUser.mockReturnValue({ id: 'target_1', tag: 'Target#0001' });
            mockInteraction.options.getInteger.mockReturnValue(1200);

            await ecoAdminCmd.execute(mockInteraction, mockAdminManager, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, mockEcoManager);
            expect(mockEcoManager.setBalance).toHaveBeenCalledWith(
                'target_1',
                'guild_123',
                1200,
                expect.any(String)
            );
            expect(mockInteraction.reply).toHaveBeenCalled();
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            expect(replyCall.embeds[0].data.title).toContain('Solde défini');
        });

        it('handles reset subcommand', async () => {
            mockInteraction.options.getSubcommand.mockReturnValue('reset');
            mockInteraction.options.getUser.mockReturnValue({ id: 'target_1', tag: 'Target#0001' });

            await ecoAdminCmd.execute(mockInteraction, mockAdminManager, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, mockEcoManager);
            expect(mockEcoManager.resetBalance).toHaveBeenCalledWith(
                'target_1',
                'guild_123',
                expect.any(String)
            );
            expect(mockInteraction.reply).toHaveBeenCalled();
            const replyCall = mockInteraction.reply.mock.calls[0][0];
            expect(replyCall.embeds[0].data.title).toContain('réinitialisé à zéro');
        });

        describe('Percentage (%) and flexible amounts handling', () => {
            it('adds cash using a percentage string in montant option', async () => {
                mockInteraction.options.getSubcommand.mockReturnValue('add');
                mockInteraction.options.getUser.mockReturnValue({ id: 'target_pct', tag: 'PctUser#0001' });
                mockInteraction.options.getString.mockImplementation((name) => {
                    if (name === 'montant') return '50%';
                    if (name === 'raison') return 'Bonus +50%';
                    return null;
                });
                mockInteraction.options.getInteger.mockImplementation(() => null);

                await ecoAdminCmd.execute(mockInteraction, mockAdminManager, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, mockEcoManager);
                // 50% of balance 500 = 250
                expect(mockEcoManager.addCurrency).toHaveBeenCalledWith(
                    'target_pct',
                    'guild_123',
                    250,
                    expect.stringContaining('50% du solde')
                );
            });

            it('adds cash using the dedicated pourcentage option', async () => {
                mockInteraction.options.getSubcommand.mockReturnValue('add');
                mockInteraction.options.getUser.mockReturnValue({ id: 'target_pct', tag: 'PctUser#0001' });
                mockInteraction.options.getString.mockImplementation(() => null);
                mockInteraction.options.getInteger.mockImplementation((name) => {
                    if (name === 'pourcentage') return 20;
                    return null;
                });

                await ecoAdminCmd.execute(mockInteraction, mockAdminManager, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, mockEcoManager);
                // 20% of balance 500 = 100
                expect(mockEcoManager.addCurrency).toHaveBeenCalledWith(
                    'target_pct',
                    'guild_123',
                    100,
                    expect.stringContaining('20% du solde')
                );
            });

            it('adds cash combining both fixed amount and percentage option', async () => {
                mockInteraction.options.getSubcommand.mockReturnValue('add');
                mockInteraction.options.getUser.mockReturnValue({ id: 'target_pct', tag: 'PctUser#0001' });
                mockInteraction.options.getString.mockImplementation((name) => {
                    if (name === 'montant') return '100';
                    return null;
                });
                mockInteraction.options.getInteger.mockImplementation((name) => {
                    if (name === 'pourcentage') return 10;
                    return null;
                });

                await ecoAdminCmd.execute(mockInteraction, mockAdminManager, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, mockEcoManager);
                // 100 + (10% of 500 = 50) = 150
                expect(mockEcoManager.addCurrency).toHaveBeenCalledWith(
                    'target_pct',
                    'guild_123',
                    150,
                    expect.stringContaining('100 coins + 10%')
                );
            });

            it('rejects percentage add when current balance is 0', async () => {
                mockEcoManager.getBalance.mockResolvedValue(0);
                mockInteraction.options.getSubcommand.mockReturnValue('add');
                mockInteraction.options.getUser.mockReturnValue({ id: 'target_0', tag: 'ZeroUser#0001' });
                mockInteraction.options.getString.mockImplementation((name) => {
                    if (name === 'montant') return '50%';
                    return null;
                });
                mockInteraction.options.getInteger.mockImplementation(() => null);

                await ecoAdminCmd.execute(mockInteraction, mockAdminManager, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, mockEcoManager);
                expect(mockEcoManager.addCurrency).not.toHaveBeenCalled();
                expect(mockInteraction.reply).toHaveBeenCalledWith(expect.objectContaining({
                    content: expect.stringContaining('0 coin'),
                    ephemeral: true
                }));
            });

            it('removes cash using percentage', async () => {
                mockInteraction.options.getSubcommand.mockReturnValue('remove');
                mockInteraction.options.getUser.mockReturnValue({ id: 'target_pct', tag: 'PctUser#0001' });
                mockInteraction.options.getString.mockImplementation((name) => {
                    if (name === 'montant') return '50%';
                    return null;
                });
                mockInteraction.options.getInteger.mockImplementation(() => null);

                await ecoAdminCmd.execute(mockInteraction, mockAdminManager, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, mockEcoManager);
                // 50% of 500 = 250
                expect(mockEcoManager.removeCurrency).toHaveBeenCalledWith(
                    'target_pct',
                    'guild_123',
                    250,
                    expect.stringContaining('50% du solde')
                );
            });

            it('sets balance using percentage', async () => {
                mockInteraction.options.getSubcommand.mockReturnValue('set');
                mockInteraction.options.getUser.mockReturnValue({ id: 'target_pct', tag: 'PctUser#0001' });
                mockInteraction.options.getString.mockImplementation((name) => {
                    if (name === 'montant') return '50%';
                    return null;
                });
                mockInteraction.options.getInteger.mockImplementation(() => null);

                await ecoAdminCmd.execute(mockInteraction, mockAdminManager, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, mockEcoManager);
                // 50% of 500 = 250
                expect(mockEcoManager.setBalance).toHaveBeenCalledWith(
                    'target_pct',
                    'guild_123',
                    250,
                    expect.stringContaining('50% du solde')
                );
            });
        });

        describe('calculateEffectiveAmount helper', () => {
            it('parses fixed numbers', () => {
                const res = calculateEffectiveAmount(500, null, 1000);
                expect(res.totalAmount).toBe(500);
                expect(res.details).toBe('500 coins');
            });

            it('parses suffix shorthands (k, M)', () => {
                const resK = calculateEffectiveAmount('5k', null, 1000);
                expect(resK.totalAmount).toBe(5000);
                const resM = calculateEffectiveAmount('2.5m', null, 1000);
                expect(resM.totalAmount).toBe(2500000);
            });

            it('parses percentage string', () => {
                const res = calculateEffectiveAmount('25%', null, 2000);
                expect(res.totalAmount).toBe(500);
                expect(res.amountFromPercent).toBe(500);
                expect(res.percentage).toBe(25);
            });

            it('parses compound expression (fixed + percentage)', () => {
                const res = calculateEffectiveAmount('300 + 10%', null, 1000);
                expect(res.totalAmount).toBe(400); // 300 + 100
                expect(res.fixedAmount).toBe(300);
                expect(res.amountFromPercent).toBe(100);
            });

            it('parses combined options (fixed string and percent option)', () => {
                const res = calculateEffectiveAmount('500', 10, 2000);
                expect(res.totalAmount).toBe(700); // 500 + 200
            });

            it('throws on invalid percentage or negative value', () => {
                expect(() => calculateEffectiveAmount('invalid%', null, 1000)).toThrow('Pourcentage invalide');
                expect(() => calculateEffectiveAmount(-50, null, 1000)).toThrow('ne peut pas être négatif');
                expect(() => calculateEffectiveAmount(null, null, 1000)).toThrow('Veuillez spécifier');
            });
        });
    });
});

