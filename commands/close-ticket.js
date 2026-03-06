import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';

export default {
    data: new SlashCommandBuilder()
        .setName('close-ticket')
        .setDescription('Close a support ticket')
        .addStringOption(option =>
            option.setName('ticket-id')
                .setDescription('The ID of the ticket to close')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('reason')
                .setDescription('Reason for closing the ticket')
                .setRequired(false)),
    
    async execute(interaction, adminManager, warnManager, guildConfig, sharedConfig, backupToGitHub, reportManager, banlistManager, blockedWordsManager, watchlistManager, telegramIntegration, funCommandsManager, raidDetector, doxDetector, enhancedReloadSystem, permissionValidator, dmTicketManager) {
        try {
            // Check if user is an admin or moderator
            if (!adminManager.isAdmin(interaction.user.id)) {
                // Check if user has moderator permissions in the guild
                if (!interaction.member?.permissions.has('ManageMessages')) {
                    return await interaction.reply({
                        content: '❌ Vous devez être administrateur ou modérateur pour utiliser cette commande.',
                        ephemeral: true
                    });
                }
            }

            if (!dmTicketManager) {
                return await interaction.reply({
                    content: '❌ Le système de tickets n\'est pas disponible.',
                    ephemeral: true
                });
            }

            const ticketId = interaction.options.getString('ticket-id');
            const reason = interaction.options.getString('reason') || 'Aucune raison spécifiée';

            // Get ticket information
            const ticket = dmTicketManager.tickets.tickets[ticketId];
            if (!ticket) {
                return await interaction.reply({
                    content: `❌ Ticket ${ticketId} introuvable.`,
                    ephemeral: true
                });
            }

            if (ticket.status !== 'open') {
                return await interaction.reply({
                    content: `❌ Le ticket ${ticketId} est déjà fermé.`,
                    ephemeral: true
                });
            }

            // Close the ticket
            await interaction.reply({ content: '🔒 Fermeture du ticket en cours...', ephemeral: true });
            const result = await dmTicketManager.closeTicket(ticketId, reason, interaction.user);
            
            if (!result.success) {
                await interaction.editReply({
                    content: `❌ Erreur lors de la fermeture du ticket: ${result.error}`,
                    ephemeral: true
                });
            }
            // If success, nothing else to do. `closeTicket` already deletes the channel and notifies the user.

        } catch (error) {
            console.error('Error in close-ticket command:', error);
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({
                    content: '❌ Une erreur est survenue lors de la fermeture du ticket.',
                    ephemeral: true
                });
            }
        }
    },

    calculateDuration(createdAt) {
        const created = new Date(createdAt);
        const now = new Date();
        const diffMs = now - created;
        
        const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        const hours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
        
        if (days > 0) {
            return `${days}j ${hours}h ${minutes}m`;
        } else if (hours > 0) {
            return `${hours}h ${minutes}m`;
        } else {
            return `${minutes}m`;
        }
    }
};