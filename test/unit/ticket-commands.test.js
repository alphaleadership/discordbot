import { describe, it, expect, beforeEach, vi } from 'vitest';
import ticketConfigCommand from '../../commands/ticket-config.js';
import closeTicketCommand from '../../commands/close-ticket.js';

describe('Ticket Management Commands', () => {
    let mockInteraction;
    let mockAdminManager;
    let mockDMTicketManager;
    let mockClient;
    let mockGuild;
    let mockMember;

    beforeEach(() => {
        // Mock guild and member
        mockMember = {
            permissions: {
                has: vi.fn().mockReturnValue(true)
            }
        };

        mockGuild = {
            id: 'support-server-123',
            name: 'Support Server',
            members: {
                cache: {
                    get: vi.fn().mockReturnValue(mockMember)
                }
            }
        };

        mockClient = {
            user: { id: 'bot-123' },
            guilds: {
                cache: {
                    get: vi.fn().mockReturnValue(mockGuild)
                }
            },
            channels: {
                cache: {
                    get: vi.fn().mockReturnValue({
                        delete: vi.fn().mockResolvedValue()
                    })
                }
            }
        };

        mockInteraction = {
            user: { id: 'user-123', tag: 'TestUser#1234' },
            client: mockClient,
            member: mockMember,
            options: {
                getString: vi.fn()
            },
            reply: vi.fn().mockResolvedValue()
        };

        mockAdminManager = {
            isAdmin: vi.fn().mockReturnValue(true)
        };

        mockDMTicketManager = {
            setSupportServer: vi.fn(),
            closeTicket: vi.fn().mockResolvedValue({ success: true }),
            tickets: {
                tickets: {
                    'ticket-000001': {
                        id: 'ticket-000001',
                        userId: 'user-456',
                        status: 'open',
                        supportChannelId: 'channel-123',
                        createdAt: new Date().toISOString()
                    }
                }
            }
        };
    });

    describe('ticket-config command', () => {
        it('should configure support server successfully for admin', async () => {
            mockInteraction.options.getString.mockReturnValue('support-server-123');

            await ticketConfigCommand.execute(
                mockInteraction,
                mockAdminManager,
                null, null, null, null, null, null, null, null, null, null, null, null, null, null,
                mockDMTicketManager
            );

            expect(mockDMTicketManager.setSupportServer).toHaveBeenCalledWith('support-server-123');
            expect(mockInteraction.reply).toHaveBeenCalledWith({
                embeds: expect.arrayContaining([
                    expect.objectContaining({
                        data: expect.objectContaining({
                            title: '✅ Configuration des Tickets'
                        })
                    })
                ])
            });
        });

        it('should reject non-admin users', async () => {
            mockAdminManager.isAdmin.mockReturnValue(false);

            await ticketConfigCommand.execute(
                mockInteraction,
                mockAdminManager,
                null, null, null, null, null, null, null, null, null, null, null, null, null, null,
                mockDMTicketManager
            );

            expect(mockInteraction.reply).toHaveBeenCalledWith({
                content: '❌ Vous devez être administrateur pour utiliser cette commande.',
                ephemeral: true
            });
        });

        it('should handle invalid support server ID', async () => {
            mockInteraction.options.getString.mockReturnValue('invalid-server');
            mockClient.guilds.cache.get.mockReturnValue(null);

            await ticketConfigCommand.execute(
                mockInteraction,
                mockAdminManager,
                null, null, null, null, null, null, null, null, null, null, null, null, null, null,
                mockDMTicketManager
            );

            expect(mockInteraction.reply).toHaveBeenCalledWith({
                content: '❌ Le serveur de support spécifié est introuvable ou le bot n\'y a pas accès.',
                ephemeral: true
            });
        });

        it('should handle missing bot permissions', async () => {
            mockInteraction.options.getString.mockReturnValue('support-server-123');
            mockMember.permissions.has.mockReturnValue(false);

            await ticketConfigCommand.execute(
                mockInteraction,
                mockAdminManager,
                null, null, null, null, null, null, null, null, null, null, null, null, null, null,
                mockDMTicketManager
            );

            expect(mockInteraction.reply).toHaveBeenCalledWith({
                content: expect.stringContaining('❌ Le bot manque des permissions requises'),
                ephemeral: true
            });
        });

        it('should handle missing DMTicketManager', async () => {
            mockInteraction.options.getString.mockReturnValue('support-server-123');

            await ticketConfigCommand.execute(
                mockInteraction,
                mockAdminManager,
                null, null, null, null, null, null, null, null, null, null, null, null, null, null,
                null // No DMTicketManager
            );

            expect(mockInteraction.reply).toHaveBeenCalledWith({
                content: '❌ Le système de tickets n\'est pas disponible.',
                ephemeral: true
            });
        });
    });

    describe('close-ticket command', () => {
        it('should close ticket successfully for admin', async () => {
            mockInteraction.options.getString
                .mockReturnValueOnce('ticket-000001') // ticket-id
                .mockReturnValueOnce('Issue resolved'); // reason

            await closeTicketCommand.execute(
                mockInteraction,
                mockAdminManager,
                null, null, null, null, null, null, null, null, null, null, null, null, null, null,
                mockDMTicketManager
            );

            expect(mockDMTicketManager.closeTicket).toHaveBeenCalledWith(
                'ticket-000001',
                'Issue resolved',
                mockInteraction.user
            );
            expect(mockInteraction.reply).toHaveBeenCalledWith({
                embeds: expect.arrayContaining([
                    expect.objectContaining({
                        data: expect.objectContaining({
                            title: '🔒 Ticket Fermé'
                        })
                    })
                ])
            });
        });

        it('should close ticket successfully for moderator', async () => {
            mockAdminManager.isAdmin.mockReturnValue(false);
            mockInteraction.options.getString
                .mockReturnValueOnce('ticket-000001')
                .mockReturnValueOnce('Issue resolved');

            await closeTicketCommand.execute(
                mockInteraction,
                mockAdminManager,
                null, null, null, null, null, null, null, null, null, null, null, null, null, null,
                mockDMTicketManager
            );

            expect(mockDMTicketManager.closeTicket).toHaveBeenCalledWith(
                'ticket-000001',
                'Issue resolved',
                mockInteraction.user
            );
        });

        it('should reject non-admin/non-moderator users', async () => {
            mockAdminManager.isAdmin.mockReturnValue(false);
            mockMember.permissions.has.mockReturnValue(false);

            await closeTicketCommand.execute(
                mockInteraction,
                mockAdminManager,
                null, null, null, null, null, null, null, null, null, null, null, null, null, null,
                mockDMTicketManager
            );

            expect(mockInteraction.reply).toHaveBeenCalledWith({
                content: '❌ Vous devez être administrateur ou modérateur pour utiliser cette commande.',
                ephemeral: true
            });
        });

        it('should handle non-existent ticket', async () => {
            mockInteraction.options.getString
                .mockReturnValueOnce('ticket-999999')
                .mockReturnValueOnce('Test reason');

            await closeTicketCommand.execute(
                mockInteraction,
                mockAdminManager,
                null, null, null, null, null, null, null, null, null, null, null, null, null, null,
                mockDMTicketManager
            );

            expect(mockInteraction.reply).toHaveBeenCalledWith({
                content: '❌ Ticket ticket-999999 introuvable.',
                ephemeral: true
            });
        });

        it('should handle already closed ticket', async () => {
            mockDMTicketManager.tickets.tickets['ticket-000001'].status = 'closed';
            mockInteraction.options.getString
                .mockReturnValueOnce('ticket-000001')
                .mockReturnValueOnce('Test reason');

            await closeTicketCommand.execute(
                mockInteraction,
                mockAdminManager,
                null, null, null, null, null, null, null, null, null, null, null, null, null, null,
                mockDMTicketManager
            );

            expect(mockInteraction.reply).toHaveBeenCalledWith({
                content: '❌ Le ticket ticket-000001 est déjà fermé.',
                ephemeral: true
            });
        });

        it('should use default reason when none provided', async () => {
            mockInteraction.options.getString
                .mockReturnValueOnce('ticket-000001') // ticket-id
                .mockReturnValueOnce(null); // reason (null)

            await closeTicketCommand.execute(
                mockInteraction,
                mockAdminManager,
                null, null, null, null, null, null, null, null, null, null, null, null, null, null,
                mockDMTicketManager
            );

            expect(mockDMTicketManager.closeTicket).toHaveBeenCalledWith(
                'ticket-000001',
                'Aucune raison spécifiée',
                mockInteraction.user
            );
        });

        it('should handle closeTicket failure', async () => {
            mockDMTicketManager.closeTicket.mockResolvedValue({ 
                success: false, 
                error: 'Database error' 
            });
            mockInteraction.options.getString
                .mockReturnValueOnce('ticket-000001')
                .mockReturnValueOnce('Test reason');

            await closeTicketCommand.execute(
                mockInteraction,
                mockAdminManager,
                null, null, null, null, null, null, null, null, null, null, null, null, null, null,
                mockDMTicketManager
            );

            expect(mockInteraction.reply).toHaveBeenCalledWith({
                content: '❌ Erreur lors de la fermeture du ticket: Database error',
                ephemeral: true
            });
        });

        it('should handle missing DMTicketManager', async () => {
            await closeTicketCommand.execute(
                mockInteraction,
                mockAdminManager,
                null, null, null, null, null, null, null, null, null, null, null, null, null, null,
                null // No DMTicketManager
            );

            expect(mockInteraction.reply).toHaveBeenCalledWith({
                content: '❌ Le système de tickets n\'est pas disponible.',
                ephemeral: true
            });
        });
    });

    describe('calculateDuration helper', () => {
        it('should calculate duration correctly for days', () => {
            const threeDaysAgo = new Date(Date.now() - (3 * 24 * 60 * 60 * 1000)).toISOString();
            const duration = closeTicketCommand.calculateDuration(threeDaysAgo);
            expect(duration).toMatch(/3j \d+h \d+m/);
        });

        it('should calculate duration correctly for hours', () => {
            const twoHoursAgo = new Date(Date.now() - (2 * 60 * 60 * 1000)).toISOString();
            const duration = closeTicketCommand.calculateDuration(twoHoursAgo);
            expect(duration).toMatch(/2h \d+m/);
        });

        it('should calculate duration correctly for minutes', () => {
            const thirtyMinutesAgo = new Date(Date.now() - (30 * 60 * 1000)).toISOString();
            const duration = closeTicketCommand.calculateDuration(thirtyMinutesAgo);
            expect(duration).toMatch(/\d+m/);
        });
    });
});