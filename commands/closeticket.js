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

    async execute(interaction, adminManager, warnManager, guildConfig, sharedConfig, backupToGitHub, reportManager, banlistManager, blockedWordsManager, watchlistManager, telegramIntegration, funCommandsManager, raidDetector, doxDetector, enhancedReloadSystem, permissionValidator) {
        // Check if the command is used in a ticket channel
        if (!interaction.channel.name.startsWith('ticket-') && !interaction.channel.name.startsWith('report-')) {
            return interaction.reply({
                content: '❌ Cette commande ne peut être utilisée que dans un salon de ticket ou de report.',
                ephemeral: true
            });
        }

        const reason = interaction.options.getString('raison') || 'Aucune raison spécifiée';
        const ticketCreatorId = interaction.channel.topic;
        
        try {
            // Send closing message
            const closeEmbed = new EmbedBuilder()
                .setColor('#e74c3c')
                .setTitle('🔒 Ticket Fermé')
                .setDescription(`Ce ticket a été fermé par ${interaction.user}`)
                .addFields(
                    { name: 'Raison', value: reason },
                    { name: 'Fermé le', value: new Date().toLocaleString('fr-FR') }
                );

            await interaction.reply({ embeds: [closeEmbed] });

            // Try to notify the ticket creator
            try {
                if (ticketCreatorId) {
                    const user = await interaction.client.users.fetch(ticketCreatorId);
                    await user.send({
                        embeds: [
                            new EmbedBuilder()
                                .setColor('#e74c3c')
                                .setTitle('🔒 Ticket Fermé')
                                .setDescription(`Votre ticket sur ${interaction.guild.name} a été fermé.`)
                                .addFields(
                                    { name: 'Fermé par', value: interaction.user.tag },
                                    { name: 'Raison', value: reason },
                                    { name: 'Date', value: new Date().toLocaleString('fr-FR') }
                                )
                        ]
                    });
                }
            } catch (dmError) {
                console.error('Could not DM user about ticket closure:', dmError);
            }

            // Delete the channel after a short delay
            setTimeout(() => {
                interaction.channel.delete().catch(console.error);
            }, 5000);

        } catch (error) {
            console.error('Error closing ticket:', error);
            if (!interaction.replied) {
                await interaction.reply({
                    content: '❌ Une erreur est survenue lors de la fermeture du ticket.',
                    ephemeral: true
                });
            }
        }
    }
};
