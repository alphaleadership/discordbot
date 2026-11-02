import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { GiveawayManager } from '../../utils/GiveawayManager.js';
import giveawayCmd from '../../commands/giveaway.js';

describe('GiveawayManager and /giveaway Command', () => {
    const testFilePath = path.join(process.cwd(), 'data', 'test-giveaways.json');
    let giveawayManager;
    let mockEcoManager;
    let mockClient;

    beforeEach(() => {
        // Clean test file if exists
        if (fs.existsSync(testFilePath)) {
            fs.unlinkSync(testFilePath);
        }

        mockEcoManager = {
            addCurrency: vi.fn().mockResolvedValue({ success: true })
        };

        mockClient = {
            channels: {
                fetch: vi.fn().mockResolvedValue({
                    send: vi.fn().mockResolvedValue({ id: 'announce_msg_1' }),
                    messages: {
                        fetch: vi.fn().mockResolvedValue({
                            edit: vi.fn().mockResolvedValue(true)
                        })
                    }
                })
            }
        };

        giveawayManager = new GiveawayManager(mockEcoManager, testFilePath);
    });

    afterEach(() => {
        giveawayManager.stop();
        if (fs.existsSync(testFilePath)) {
            fs.unlinkSync(testFilePath);
        }
    });

    describe('Duration Parsing (parseDuration)', () => {
        it('parses seconds, minutes, hours, days, weeks', () => {
            expect(giveawayManager.parseDuration('30s')).toBe(30 * 1000);
            expect(giveawayManager.parseDuration('15m')).toBe(15 * 60 * 1000);
            expect(giveawayManager.parseDuration('2h')).toBe(2 * 60 * 60 * 1000);
            expect(giveawayManager.parseDuration('1d')).toBe(24 * 60 * 60 * 1000);
            expect(giveawayManager.parseDuration('3j')).toBe(3 * 24 * 60 * 60 * 1000);
            expect(giveawayManager.parseDuration('1w')).toBe(7 * 24 * 60 * 60 * 1000);
        });

        it('parses combined durations (e.g. 1d 2h 30m)', () => {
            const expected = (24 * 3600 + 2 * 3600 + 30 * 60) * 1000;
            expect(giveawayManager.parseDuration('1d 2h 30m')).toBe(expected);
        });

        it('returns null for invalid durations', () => {
            expect(giveawayManager.parseDuration('')).toBeNull();
            expect(giveawayManager.parseDuration('invalid')).toBeNull();
            expect(giveawayManager.parseDuration(null)).toBeNull();
        });
    });

    describe('Giveaway Lifecycle & Creation', () => {
        it('creates a giveaway and persists to disk', () => {
            const gw = giveawayManager.createGiveaway({
                messageId: 'msg_101',
                guildId: 'guild_1',
                channelId: 'chan_1',
                prize: 'Discord Nitro',
                durationMs: 3600000,
                winnerCount: 2,
                hostedBy: 'Host#0001',
                hostedById: 'host_1',
                coinsReward: 1000,
                roleRequiredId: 'role_vip',
                minAccountAgeDays: 7,
                description: 'Bonne chance !'
            });

            expect(gw.id).toBe('msg_101');
            expect(gw.prize).toBe('Discord Nitro');
            expect(gw.winnerCount).toBe(2);
            expect(gw.participants).toEqual([]);
            expect(gw.ended).toBe(false);

            // Verify persistence by loading into a new manager
            const newManager = new GiveawayManager(mockEcoManager, testFilePath);
            expect(newManager.giveaways.has('msg_101')).toBe(true);
            const loaded = newManager.giveaways.get('msg_101');
            expect(loaded.prize).toBe('Discord Nitro');
        });
    });

    describe('Embed & Component Building', () => {
        it('builds active, ended and cancelled embeds properly', () => {
            const gw = giveawayManager.createGiveaway({
                messageId: 'msg_embed',
                guildId: 'guild_1',
                channelId: 'chan_1',
                prize: 'Steam Key',
                durationMs: 3600000,
                winnerCount: 1,
                hostedBy: 'Host#0001',
                hostedById: 'host_1',
                coinsReward: 500,
                roleRequiredId: 'role_test',
                minAccountAgeDays: 3
            });

            // Active embed
            const activeEmbed = giveawayManager.buildEmbed(gw);
            expect(activeEmbed.data.title).toContain('Steam Key');
            expect(activeEmbed.data.description).toContain('Participants actuels');

            // Active action row
            const activeRow = giveawayManager.buildActionRow(gw);
            expect(activeRow.components[0].data.label).toContain('Participer (0)');

            // Ended embed
            gw.ended = true;
            gw.winners = ['winner_1'];
            gw.participants = ['winner_1', 'user_2'];
            const endedEmbed = giveawayManager.buildEmbed(gw);
            expect(endedEmbed.data.title).toContain('GIVEAWAY TERMINÉ');
            expect(endedEmbed.data.description).toContain('<@winner_1>');

            const endedRow = giveawayManager.buildActionRow(gw);
            expect(endedRow.components[0].data.disabled).toBe(true);

            // Cancelled embed
            gw.cancelled = true;
            gw.cancelReason = 'Erreur de configuration';
            const cancelledEmbed = giveawayManager.buildEmbed(gw);
            expect(cancelledEmbed.data.title).toContain('GIVEAWAY ANNULÉ');
            expect(cancelledEmbed.data.description).toContain('Erreur de configuration');
        });
    });

    describe('Button Interaction (handleButton)', () => {
        let mockInteraction;
        let gw;

        beforeEach(() => {
            gw = giveawayManager.createGiveaway({
                messageId: 'msg_btn_1',
                guildId: 'guild_1',
                channelId: 'chan_1',
                prize: '1000 Coins',
                durationMs: 3600000,
                winnerCount: 1,
                hostedBy: 'Host#0001',
                hostedById: 'host_1',
                roleRequiredId: 'role_vip',
                minAccountAgeDays: 5
            });

            mockInteraction = {
                isButton: vi.fn().mockReturnValue(true),
                customId: 'giveaway_join_msg_btn_1',
                user: { id: 'participant_1', tag: 'Part#0001', createdTimestamp: Date.now() - (10 * 86400000) },
                member: {
                    roles: {
                        cache: {
                            has: vi.fn((roleId) => roleId === 'role_vip')
                        }
                    }
                },
                message: {
                    edit: vi.fn().mockResolvedValue(true)
                },
                reply: vi.fn().mockResolvedValue(true)
            };
        });

        it('allows eligible user to join and then leave (toggle)', async () => {
            // First click: Join
            await giveawayManager.handleButton(mockInteraction);
            expect(gw.participants).toContain('participant_1');
            expect(mockInteraction.reply).toHaveBeenCalledWith(expect.objectContaining({
                content: expect.stringContaining('désormais inscrit'),
                ephemeral: true
            }));

            // Second click: Leave
            await giveawayManager.handleButton(mockInteraction);
            expect(gw.participants).not.toContain('participant_1');
            expect(mockInteraction.reply).toHaveBeenCalledWith(expect.objectContaining({
                content: expect.stringContaining('retiré du tirage'),
                ephemeral: true
            }));
        });

        it('rejects user without required role', async () => {
            mockInteraction.member.roles.cache.has.mockReturnValue(false);

            await giveawayManager.handleButton(mockInteraction);
            expect(gw.participants).not.toContain('participant_1');
            expect(mockInteraction.reply).toHaveBeenCalledWith(expect.objectContaining({
                content: expect.stringContaining('posséder le rôle'),
                ephemeral: true
            }));
        });

        it('rejects user whose account is too recent', async () => {
            // Account created only 1 day ago
            mockInteraction.user.createdTimestamp = Date.now() - (1 * 86400000);

            await giveawayManager.handleButton(mockInteraction);
            expect(gw.participants).not.toContain('participant_1');
            expect(mockInteraction.reply).toHaveBeenCalledWith(expect.objectContaining({
                content: expect.stringContaining('trop récent'),
                ephemeral: true
            }));
        });
    });

    describe('Ending, Rerolling and Cancelling Giveaways', () => {
        it('ends giveaway, picks winners without duplicates, and awards coins', async () => {
            const gw = giveawayManager.createGiveaway({
                messageId: 'msg_end_test',
                guildId: 'guild_1',
                channelId: 'chan_1',
                prize: 'Gros Lot',
                durationMs: 3600000,
                winnerCount: 2,
                hostedBy: 'Host#0001',
                hostedById: 'host_1',
                coinsReward: 2500
            });

            gw.participants = ['user_A', 'user_B', 'user_C'];

            const result = await giveawayManager.endGiveaway(gw.id, mockClient);
            expect(result.success).toBe(true);
            expect(result.winners.length).toBe(2);
            expect(result.winners[0]).not.toBe(result.winners[1]);
            expect(gw.ended).toBe(true);

            // Verified coins were credited
            expect(mockEcoManager.addCurrency).toHaveBeenCalledTimes(2);
            expect(mockEcoManager.addCurrency).toHaveBeenCalledWith(
                expect.any(String),
                'guild_1',
                2500,
                expect.stringContaining('Gain du giveaway')
            );
        });

        it('rerolls a new winner from remaining participants', async () => {
            const gw = giveawayManager.createGiveaway({
                messageId: 'msg_reroll_test',
                guildId: 'guild_1',
                channelId: 'chan_1',
                prize: 'Lot Reroll',
                durationMs: 3600000,
                winnerCount: 1,
                hostedBy: 'Host#0001',
                hostedById: 'host_1'
            });

            gw.participants = ['winner_old', 'candidate_new'];
            gw.ended = true;
            gw.winners = ['winner_old'];

            const rerollResult = await giveawayManager.rerollGiveaway(gw.id, mockClient, 1);
            expect(rerollResult.success).toBe(true);
            expect(rerollResult.newWinners).toEqual(['candidate_new']);
            expect(gw.winners).toEqual(['candidate_new']);
        });

        it('cancels active giveaway with custom reason', async () => {
            const gw = giveawayManager.createGiveaway({
                messageId: 'msg_cancel_test',
                guildId: 'guild_1',
                channelId: 'chan_1',
                prize: 'Lot Annulé',
                durationMs: 3600000,
                winnerCount: 1,
                hostedBy: 'Host#0001',
                hostedById: 'host_1'
            });

            const cancelResult = await giveawayManager.cancelGiveaway(gw.id, mockClient, 'Gagnant déjà trouvé ailleurs');
            expect(cancelResult.success).toBe(true);
            expect(gw.cancelled).toBe(true);
            expect(gw.cancelReason).toBe('Gagnant déjà trouvé ailleurs');
        });

        it('filters guild giveaways and active ones', () => {
            giveawayManager.createGiveaway({
                messageId: 'gw_active',
                guildId: 'guild_X',
                channelId: 'chan_1',
                prize: 'Lot 1',
                durationMs: 10000
            });
            const gwEnded = giveawayManager.createGiveaway({
                messageId: 'gw_ended',
                guildId: 'guild_X',
                channelId: 'chan_1',
                prize: 'Lot 2',
                durationMs: 10000
            });
            gwEnded.ended = true;

            const allForGuild = giveawayManager.getGuildGiveaways('guild_X', false);
            const activeOnly = giveawayManager.getGuildGiveaways('guild_X', true);

            expect(allForGuild.length).toBe(2);
            expect(activeOnly.length).toBe(1);
            expect(activeOnly[0].id).toBe('gw_active');
        });
    });

    describe('/giveaway Slash Command', () => {
        let mockInteraction;
        let mockAdminManager;

        beforeEach(() => {
            mockAdminManager = {
                isAdmin: vi.fn().mockResolvedValue(true)
            };

            mockInteraction = {
                inGuild: vi.fn().mockReturnValue(true),
                client: { giveawayManager },
                guild: { id: 'guild_cmd', name: 'Cmd Guild' },
                user: { id: 'admin_user', tag: 'Admin#0001' },
                member: {
                    permissions: {
                        has: vi.fn().mockReturnValue(true)
                    }
                },
                channel: {
                    id: 'current_chan_id',
                    send: vi.fn().mockResolvedValue({
                        id: 'created_msg_123',
                        edit: vi.fn().mockResolvedValue(true)
                    })
                },
                options: {
                    getSubcommand: vi.fn(),
                    getString: vi.fn(),
                    getInteger: vi.fn(),
                    getChannel: vi.fn(),
                    getRole: vi.fn()
                },
                reply: vi.fn().mockResolvedValue(true),
                deferReply: vi.fn().mockResolvedValue(true),
                editReply: vi.fn().mockResolvedValue(true)
            };
        });

        it('has valid slash command structure', () => {
            expect(giveawayCmd.data.name).toBe('giveaway');
            expect(giveawayCmd.execute).toBeTypeOf('function');
        });

        it('rejects execution by non-admins', async () => {
            mockAdminManager.isAdmin.mockResolvedValue(false);
            mockInteraction.member.permissions.has.mockReturnValue(false);

            await giveawayCmd.execute(mockInteraction, mockAdminManager);
            expect(mockInteraction.reply).toHaveBeenCalledWith(expect.objectContaining({
                content: expect.stringContaining('gérer le serveur'),
                ephemeral: true
            }));
        });

        it('starts a giveaway via /giveaway start', async () => {
            mockInteraction.options.getSubcommand.mockReturnValue('start');
            mockInteraction.options.getString.mockImplementation((name) => {
                if (name === 'lot') return 'Nitro Boost';
                if (name === 'duree') return '1h';
                return null;
            });
            mockInteraction.options.getInteger.mockImplementation((name) => {
                if (name === 'gagnants') return 1;
                return 0;
            });

            await giveawayCmd.execute(mockInteraction, mockAdminManager);
            expect(mockInteraction.deferReply).toHaveBeenCalledWith({ ephemeral: true });
            expect(mockInteraction.channel.send).toHaveBeenCalled();
            expect(mockInteraction.editReply).toHaveBeenCalledWith(expect.objectContaining({
                content: expect.stringContaining('Nitro Boost')
            }));

            expect(giveawayManager.giveaways.has('created_msg_123')).toBe(true);
        });

        it('ends a giveaway via /giveaway end', async () => {
            const gw = giveawayManager.createGiveaway({
                messageId: 'msg_to_end',
                guildId: 'guild_cmd',
                channelId: 'current_chan_id',
                prize: 'Lot Fin',
                durationMs: 3600000
            });
            gw.participants = ['user_1'];

            mockInteraction.options.getSubcommand.mockReturnValue('end');
            mockInteraction.options.getString.mockImplementation((name) => {
                if (name === 'message_id') return 'msg_to_end';
                return null;
            });

            await giveawayCmd.execute(mockInteraction, mockAdminManager);
            expect(mockInteraction.reply).toHaveBeenCalledWith(expect.objectContaining({
                content: expect.stringContaining('clôturé avec succès')
            }));
            expect(gw.ended).toBe(true);
        });

        it('cancels a giveaway via /giveaway cancel', async () => {
            const gw = giveawayManager.createGiveaway({
                messageId: 'msg_to_cancel',
                guildId: 'guild_cmd',
                channelId: 'current_chan_id',
                prize: 'Lot Annulation',
                durationMs: 3600000
            });

            mockInteraction.options.getSubcommand.mockReturnValue('cancel');
            mockInteraction.options.getString.mockImplementation((name) => {
                if (name === 'message_id') return 'msg_to_cancel';
                if (name === 'raison') return 'Raison test';
                return null;
            });

            await giveawayCmd.execute(mockInteraction, mockAdminManager);
            expect(mockInteraction.reply).toHaveBeenCalledWith(expect.objectContaining({
                content: expect.stringContaining('bien été annulé')
            }));
            expect(gw.cancelled).toBe(true);
        });

        it('lists active giveaways via /giveaway list', async () => {
            giveawayManager.createGiveaway({
                messageId: 'active_1',
                guildId: 'guild_cmd',
                channelId: 'current_chan_id',
                prize: 'Lot Liste 1',
                durationMs: 3600000
            });

            mockInteraction.options.getSubcommand.mockReturnValue('list');

            await giveawayCmd.execute(mockInteraction, mockAdminManager);
            expect(mockInteraction.reply).toHaveBeenCalled();
            const call = mockInteraction.reply.mock.calls[0][0];
            expect(call.embeds[0].data.title).toContain('Giveaways actifs');
        });
    });
});
