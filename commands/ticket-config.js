import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';

export default {
    data: new SlashCommandBuilder()
        .setName('ticket-config')
        .setDescription('Configure the support server for ticket management')
        .addStringOption(option =>
            option.setName('support-server-id')
                .setDescription('The ID of the server to use for support tickets')
                .setRequired(true)),
    
    async execute(interaction, adminManager, warnManager, guildConfig, sharedConfig, backupToGitHub, reportManager, banlistManager, blockedWordsManager, watchlistManager, telegramIntegration, funCommandsManager, raidDetector, doxDetector, enhancedReloadSystem, permissionValidator,EconomyManager,ForumReportManager ,AutoConfigManager, dmTicketManager) {

        try {
            // Check if user is an admin
            if (!adminManager.isAdmin(interaction.user.id)) {
                return await interaction.reply({
                    content: '❌ Vous devez être administrateur pour utiliser cette commande.',
                    ephemeral: true
                });
            }

            const supportServerId = interaction.options.getString('support-server-id');

            // Validate that the support server exists and bot has access
            const supportGuild = interaction.client.guilds.cache.get(supportServerId);
            if (!supportGuild) {
                return await interaction.reply({
                    content: '❌ Le serveur de support spécifié est introuvable ou le bot n\'y a pas accès.',
                    ephemeral: true
                });
            }

            // Check bot permissions in support server
            const botMember = supportGuild.members.cache.get(interaction.client.user.id);
            if (!botMember) {
                return await interaction.reply({
                    content: '❌ Le bot n\'est pas membre du serveur de support spécifié.',
                    ephemeral: true
                });
            }

            const requiredPermissions = ['ManageChannels', 'ViewChannel', 'SendMessages'];
            const missingPermissions = requiredPermissions.filter(
                perm => !botMember.permissions.has(perm)
            );

            if (missingPermissions.length > 0) {
                return await interaction.reply({
                    content: `❌ Le bot manque des permissions requises sur le serveur de support: ${missingPermissions.join(', ')}`,
                    ephemeral: true
                });
            }

            // Set the support server
            if (dmTicketManager) {
                dmTicketManager.setSupportServer(supportServerId);
                
                const embed = new EmbedBuilder()
                    .setColor('#00ff00')
                    .setTitle('✅ Configuration des Tickets')
                    .setDescription('Le serveur de support a été configuré avec succès!')
                    .addFields(
                        { name: 'Serveur de Support', value: `${supportGuild.name} (${supportServerId})`, inline: false },
                        { name: 'Statut', value: 'Configuré et prêt', inline: true }
                    )
                    .setFooter({ text: 'Les utilisateurs peuvent maintenant créer des tickets via MP' })
                    .setTimestamp();

                await interaction.reply({ embeds: [embed] });
            } else {
                await interaction.reply({
                    content: '❌ Le système de tickets n\'est pas disponible.',
                    ephemeral: true
                });
            }

        } catch (error) {
            console.error('Error in ticket-config command:', error);
            await interaction.reply({
                content: '❌ Une erreur est survenue lors de la configuration des tickets.',
                ephemeral: true
            });
        }
    },
};