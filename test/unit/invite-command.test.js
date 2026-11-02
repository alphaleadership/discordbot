import { describe, it, expect, vi, beforeEach } from 'vitest';
import inviteCmd from '../../commands/invite.js';
import { CommandHandler } from '../../utils/CommandHandler.js';
import { Collection } from 'discord.js';

describe('Bot Invite Commands (/invite and /bot-invite alias)', () => {
    let mockInteraction;

    beforeEach(() => {
        mockInteraction = {
            isCommand: () => true,
            commandName: 'invite',
            client: {
                user: {
                    id: '998877665544332211',
                    username: 'SuperGitBot',
                    displayAvatarURL: vi.fn().mockReturnValue('https://cdn.discordapp.com/avatars/998877665544332211/avatar.png')
                },
                guilds: {
                    cache: {
                        get: vi.fn().mockReturnValue(null)
                    }
                }
            },
            options: {
                getString: vi.fn().mockReturnValue(null)
            },
            reply: vi.fn().mockResolvedValue(true)
        };
    });

    describe('Command Structure', () => {
        it('has valid structure for /invite', () => {
            expect(inviteCmd.data.name).toBe('invite');
            expect(inviteCmd.data.description).toContain('invitation');
            expect(inviteCmd.execute).toBeTypeOf('function');
        });
    });

    describe('Execution of /invite', () => {
        it('replies with an embed and action row buttons containing OAuth2 links', async () => {
            await inviteCmd.execute(mockInteraction);

            expect(mockInteraction.reply).toHaveBeenCalled();
            const replyArgs = mockInteraction.reply.mock.calls[0][0];

            expect(replyArgs.embeds).toBeDefined();
            expect(replyArgs.embeds.length).toBe(1);
            const embed = replyArgs.embeds[0];

            expect(embed.data.title).toContain('SuperGitBot');
            expect(embed.data.thumbnail.url).toContain('cdn.discordapp.com');

            // Fields contains OAuth2 invite links with client id and scopes
            const fieldsText = embed.data.fields.map(f => f.value).join(' ');
            expect(fieldsText).toContain('998877665544332211');
            expect(fieldsText).toContain('scope=bot%20applications.commands');
            expect(fieldsText).toContain('discord.com/oauth2/authorize');

            // Action row buttons
            expect(replyArgs.components).toBeDefined();
            expect(replyArgs.components.length).toBe(1);
            const buttons = replyArgs.components[0].components;
            expect(buttons.length).toBeGreaterThanOrEqual(2);
            expect(buttons[0].data.url).toContain('client_id=998877665544332211');
            expect(buttons[1].data.url).toContain('permissions=8');
        });

        it('supports choosing specific permission types (admin, basic)', async () => {
            mockInteraction.options.getString.mockReturnValue('admin');
            await inviteCmd.execute(mockInteraction);

            expect(mockInteraction.reply).toHaveBeenCalled();
            const replyArgs = mockInteraction.reply.mock.calls[0][0];
            expect(replyArgs.embeds[0].data.fields[1].value).toContain('permissions=8');
        });
    });

    describe('Execution of /bot-invite via CommandHandler alias', () => {
        it('delegates properly from bot-invite to invite command', async () => {
            const client = {
                commands: new Collection(),
                user: mockInteraction.client.user
            };
            const handler = new CommandHandler(client);
            handler.client.commands.set('invite', inviteCmd);
            mockInteraction.commandName = 'bot-invite';

            await handler.handleCommand(mockInteraction);

            expect(mockInteraction.reply).toHaveBeenCalled();
            const replyArgs = mockInteraction.reply.mock.calls[0][0];
            expect(replyArgs.embeds[0].data.title).toContain('SuperGitBot');
            expect(replyArgs.components[0].components[0].data.url).toContain('998877665544332211');
        });
    });
});
