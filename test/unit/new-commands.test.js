import { describe, it, expect, vi } from 'vitest';
import untimeoutCmd from '../../commands/untimeout.js';
import unwarnCmd from '../../commands/unwarn.js';
import banlistCheckCmd from '../../commands/banlist-check.js';
import banlistPurgeCmd from '../../commands/banlist-purge.js';
import watchlistPurgeCmd from '../../commands/watchlist-purge.js';

describe('New Moderation and Management Commands', () => {
    describe('/untimeout', () => {
        it('has valid command structure', () => {
            expect(untimeoutCmd.data.name).toBe('untimeout');
            expect(untimeoutCmd.data.description).toBeDefined();
            expect(untimeoutCmd.execute).toBeTypeOf('function');
        });

        it('handles case when target is not timed out', async () => {
            const mockTargetMember = {
                id: '123456789012345678',
                isCommunicationDisabled: vi.fn().mockReturnValue(false)
            };
            const mockInteraction = {
                options: {
                    getUser: vi.fn().mockReturnValue({ id: '123456789012345678', tag: 'test#0001' }),
                    getString: vi.fn().mockReturnValue('Pardon')
                },
                guild: {
                    members: {
                        fetch: vi.fn().mockResolvedValue(mockTargetMember)
                    }
                },
                reply: vi.fn().mockResolvedValue(true)
            };

            await untimeoutCmd.execute(mockInteraction, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {}, {});
            expect(mockInteraction.reply).toHaveBeenCalled();
            expect(mockInteraction.reply.mock.calls[0][0].content).toContain("n'est actuellement pas en timeout");
        });
    });

    describe('/unwarn', () => {
        it('has valid command structure', () => {
            expect(unwarnCmd.data.name).toBe('unwarn');
            expect(unwarnCmd.data.description).toBeDefined();
            expect(unwarnCmd.execute).toBeTypeOf('function');
        });

        it('removes a warning when found', async () => {
            const mockInteraction = {
                inGuild: vi.fn().mockReturnValue(true),
                memberPermissions: {
                    has: vi.fn().mockReturnValue(true)
                },
                options: {
                    getUser: vi.fn().mockReturnValue({ id: 'target1', tag: 'target#0001' }),
                    getString: vi.fn().mockReturnValue('warn_123'),
                    getBoolean: vi.fn().mockReturnValue(false)
                },
                guild: { id: 'guild1', name: 'Guild' },
                user: { tag: 'mod#0001', id: 'mod1' },
                channel: { id: 'chan1' },
                reply: vi.fn().mockResolvedValue(true)
            };

            const mockWarnManager = {
                getWarns: vi.fn().mockReturnValue([{ id: 'warn_123', reason: 'Spam' }]),
                removeWarn: vi.fn().mockReturnValue(true)
            };

            await unwarnCmd.execute(mockInteraction, {}, mockWarnManager, {}, {}, {}, null);
            expect(mockWarnManager.removeWarn).toHaveBeenCalledWith('guild1', 'target1', 'warn_123');
            expect(mockInteraction.reply).toHaveBeenCalled();
        });
    });

    describe('/banlist-check', () => {
        it('has valid command structure', () => {
            expect(banlistCheckCmd.data.name).toBe('banlist-check');
            expect(banlistCheckCmd.data.description).toBeDefined();
            expect(banlistCheckCmd.execute).toBeTypeOf('function');
        });

        it('checks if user is banned and replies with embed', async () => {
            const mockInteraction = {
                options: {
                    getString: vi.fn().mockReturnValue('123456789012345678'),
                    getUser: vi.fn().mockReturnValue(null)
                },
                guild: { id: 'guild1' },
                deferReply: vi.fn().mockResolvedValue(true),
                editReply: vi.fn().mockResolvedValue(true),
                client: {
                    users: {
                        fetch: vi.fn().mockResolvedValue({ tag: 'banned#0001' })
                    }
                }
            };

            const mockBanlistManager = {
                isWhitelisted: vi.fn().mockReturnValue(false),
                isBanned: vi.fn().mockResolvedValue({ banned: true, reason: 'Raid' })
            };

            await banlistCheckCmd.execute(mockInteraction, {}, {}, {}, {}, {}, {}, mockBanlistManager);
            expect(mockInteraction.deferReply).toHaveBeenCalled();
            expect(mockInteraction.editReply).toHaveBeenCalled();
            const replyArg = mockInteraction.editReply.mock.calls[0][0];
            expect(replyArg.embeds).toBeDefined();
        });
    });

    describe('/banlist-purge', () => {
        it('has valid command structure', () => {
            expect(banlistPurgeCmd.data.name).toBe('banlist-purge');
            expect(banlistPurgeCmd.data.description).toBeDefined();
            expect(banlistPurgeCmd.execute).toBeTypeOf('function');
        });

        it('executes purge when user is admin', async () => {
            const mockInteraction = {
                user: { id: 'admin1' },
                member: { permissions: { has: vi.fn().mockReturnValue(true) } },
                options: { getBoolean: vi.fn().mockReturnValue(false) },
                deferReply: vi.fn().mockResolvedValue(true),
                editReply: vi.fn().mockResolvedValue(true)
            };

            const mockAdminManager = {
                isAdmin: vi.fn().mockResolvedValue(true)
            };

            const mockBanlistManager = {
                purgeEntriesWithoutReason: vi.fn().mockResolvedValue({ checked: 10, removed: 2, purgedUsers: [] })
            };

            await banlistPurgeCmd.execute(mockInteraction, mockAdminManager, {}, {}, {}, {}, {}, mockBanlistManager);
            expect(mockBanlistManager.purgeEntriesWithoutReason).toHaveBeenCalled();
            expect(mockInteraction.editReply).toHaveBeenCalled();
        });
    });

    describe('/watchlist-purge', () => {
        it('has valid command structure', () => {
            expect(watchlistPurgeCmd.data.name).toBe('watchlist-purge');
            expect(watchlistPurgeCmd.data.description).toBeDefined();
            expect(watchlistPurgeCmd.execute).toBeTypeOf('function');
        });

        it('executes purge when user is admin', async () => {
            const mockInteraction = {
                user: { id: 'admin1' },
                member: { permissions: { has: vi.fn().mockReturnValue(true) } },
                options: { getBoolean: vi.fn().mockReturnValue(false) },
                deferReply: vi.fn().mockResolvedValue(true),
                editReply: vi.fn().mockResolvedValue(true)
            };

            const mockAdminManager = {
                isAdmin: vi.fn().mockResolvedValue(true)
            };

            const mockWatchlistManager = {
                purgeEntriesWithoutReason: vi.fn().mockResolvedValue({ checked: 8, removed: 3, purgedKeys: [] })
            };

            await watchlistPurgeCmd.execute(mockInteraction, mockAdminManager, {}, {}, {}, {}, {}, {}, {}, mockWatchlistManager);
            expect(mockWatchlistManager.purgeEntriesWithoutReason).toHaveBeenCalled();
            expect(mockInteraction.editReply).toHaveBeenCalled();
        });
    });
});
