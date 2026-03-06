import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';

export default {
    data: new SlashCommandBuilder()
        .setName('closeticket')
        .setDescription('Ferme le ticket actuel')
        .addStringOption(option =>
            option.setName('raison')
                .setDescription('Raison de la fermeture du ticket')
                .setRequired(false)
        ),

    async execute(interaction, adminManager, warnManager, guildConfig, sharedConfig, backupToGitHub, reportManager, banlistManager, blockedWordsManager, watchlistManager, telegramIntegration, funCommandsManager, raidDetector, doxDetector, enhancedReloadSystem, permissionValidator, economyManager, forumReportManager, autoConfigManager, dmTicketManager) {
        // Check if the command is used in a ticket channel
        if (!interaction.channel.name.startsWith('ticket-') && !interaction.channel.name.startsWith('report-')) {
            return interaction.reply({
                content: '❌ Cette commande ne peut être utilisée que dans un salon de ticket ou de report.',
                ephemeral: true
            });
        }

        const reason = interaction.options.getString('raison') || 'Aucune raison spécifiée';
        
        try {
            if (dmTicketManager) {
                // Determine ticket ID from the channel ID directly
                const ticket = dmTicketManager.getTicketByChannelId(interaction.channel.id);
                if (ticket) {
                    await interaction.reply({ content: '🔒 Fermeture du ticket en cours...', ephemeral: true });
                    const result = await dmTicketManager.closeTicket(ticket.id, reason, interaction.user);
                    
                    if (!result.success) {
                        return interaction.editReply({ content: `❌ Erreur lors de la fermeture: ${result.error}` });
                    }
                    return; // La fonction closeTicket s'occupe de supprimer le salon et de DM l'utilisateur
                }
            }

            // Fallback (si DM Ticket Manager n'est pas actif ou si on est dans un autre type de salon)
            const closeEmbed = new EmbedBuilder()
                .setColor('#e74c3c')
                .setTitle('🔒 Ticket Fermé')
                .setDescription(`Ce ticket a été fermé par ${interaction.user}`)
                .addFields(
                    { name: 'Raison', value: reason },
                    { name: 'Fermé le', value: new Date().toLocaleString('fr-FR') }
                );

            await interaction.reply({ embeds: [closeEmbed] });

            // Delete the channel after a short delay
            setTimeout(() => {
                interaction.channel.delete().catch(console.error);
            }, 5000);

        } catch (error) {
            console.error('Error closing ticket:', error);
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({
                    content: '❌ Une erreur est survenue lors de la fermeture du ticket.',
                    ephemeral: true
                });
            }
        }
    }
};
