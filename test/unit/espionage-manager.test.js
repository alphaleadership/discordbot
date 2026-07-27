import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EspionageManager } from '../../utils/EspionageManager.js';

const ESPIONAGE_GUILD_ID = '1475239703853928523';

describe('EspionageManager', () => {
    let manager;
    let mockGuild;
    let mockForumChannel;
    let mockThread;

    beforeEach(() => {
        mockThread = {
            id: 'thread-123',
            name: 'thread-name',
            setName: vi.fn().mockResolvedValue({}),
            send: vi.fn().mockResolvedValue({}),
            messages: {
                fetch: vi.fn().mockResolvedValue(null)
            }
        };

        mockForumChannel = {
            id: 'forum-123',
            name: '📁︙dossiers-espionnage',
            type: 15,
            threads: {
                create: vi.fn().mockResolvedValue(mockThread)
            }
        };

        mockGuild = {
            id: ESPIONAGE_GUILD_ID,
            name: 'Espionage Guild',
            channels: {
                cache: {
                    get: vi.fn().mockImplementation((id) => id === 'forum-123' ? mockForumChannel : undefined),
                    find: vi.fn().mockReturnValue(mockForumChannel)
                },
                fetch: vi.fn().mockImplementation((id) => id === 'thread-123' ? mockThread : undefined)
            },
            members: {
                fetch: vi.fn().mockResolvedValue(null)
            },
            roles: {
                everyone: { id: '@everyone' },
                cache: new Map()
            }
        };

        const client = {
            user: { id: 'bot-id' },
            guilds: {
                cache: {
                    get: vi.fn().mockReturnValue(mockGuild)
                },
                fetch: vi.fn().mockResolvedValue(mockGuild)
            },
            users: {
                fetch: vi.fn().mockResolvedValue({
                    id: 'user-123',
                    username: 'alice',
                    tag: 'alice#0001'
                })
            }
        };

        manager = new EspionageManager(client, {});
        manager.dossiersData.guilds[ESPIONAGE_GUILD_ID] = {
            forumChannelId: 'forum-123',
            targets: {
                'user-123': {
                    threadId: 'thread-123',
                    messageCount: 0,
                    threatLevel: 'Low',
                    notes: []
                }
            }
        };
    });

    it('fetches an existing dossier thread even when activeThreads is unavailable', async () => {
        const result = await manager.getOrCreateMemberDossier('user-123');

        expect(result).toBe(mockThread);
        expect(mockGuild.channels.fetch).toHaveBeenCalledWith('thread-123');
    });
});
