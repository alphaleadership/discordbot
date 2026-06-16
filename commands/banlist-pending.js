import { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } from 'discord.js';

export default {
    data: new SlashCommandBuilder()
        .setName('banlist-pending')
        .setDescription('Gérer les demandes d\'ajout à la banlist en attente')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addSubcommand(subcommand =>
            subcommand
                .setName('list')
                .setDescription('Lister les demandes en attente')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('approve')
                .setDescription('Approuver une demande d\'ajout')
                .addStringOption(option =>
                    option.setName('id')
                        .setDescription('L\'ID de la demande à approuver')
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('reject')
                .setDescription('Rejeter une demande d\'ajout')
                .addStringOption(option =>
                    option.setName('id')
                        .setDescription('L\'ID de la demande à rejeter')
                        .setRequired(true)
                )
        ),

    async execute(interaction, adminManager, warnManager, guildConfig, sharedConfig, backupToGitHub, reportManager, banlistManager) {
        // Vérifier si l'utilisateur est un administrateur du bot
        const isAdmin = adminManager.isAdmin(interaction.user.id);
        
        if (!isAdmin) {
            return interaction.reply({
                content: '❌ Vous n\'avez pas les permissions nécessaires (Admin Bot requis) pour utiliser cette commande.',
                ephemeral: true
            });
        }

        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'list') {
            const pendingRequests = banlistManager.getPendingRequests();

            if (pendingRequests.length === 0) {
                return interaction.reply({
                    content: 'ℹ️ Il n\'y a aucune demande d\'ajout à la banlist en attente.',
                    ephemeral: true
                });
            }

            const embed = new EmbedBuilder()
                .setTitle('⏳ Demandes d\'ajout à la banlist en attente')
                .setDescription(`Il y a actuellement **${pendingRequests.length}** demande(s) en attente de validation.`)
                .setColor('#FFA500')
                .setTimestamp()
                .setFooter({ text: 'Utilisez /banlist-pending approve <id> ou reject <id>' });

            // Afficher les 10 premières demandes
            pendingRequests.slice(0, 10).forEach(request => {
                embed.addFields({
                    name: `Demande ID: ${request.id}`,
                    value: `👤 **Utilisateur:** ${request.username} (${request.userId})\n👮 **Modérateur:** ${request.moderatorTag} (${request.moderatorId})\n📝 **Raison:** ${request.reason}\n🏠 **Serveur:** ${request.guildName}\n📅 **Date:** ${new Date(request.timestamp).toLocaleString('fr-FR')}`,
                    inline: false
                });
            });

            if (pendingRequests.length > 10) {
                embed.addFields({ name: '...', value: `Et ${pendingRequests.length - 10} autres demandes.` });
            }

            return interaction.reply({
                embeds: [embed],
                ephemeral: true
            });
        }

        if (subcommand === 'approve') {
            const requestId = interaction.options.getString('id');
            const pendingRequests = banlistManager.getPendingRequests();
            const request = pendingRequests.find(r => r.id === requestId);
            
            await interaction.deferReply({ ephemeral: true });

            const result = await banlistManager.approveRequest(requestId, interaction.user.id, interaction.guild);

            if (result.success) {
                // Tentative de logging si le manager est disponible
                if (reportManager && reportManager.moderationLogger && request) {
                    await reportManager.moderationLogger.logModerationAction({
                        type: 'banlist-approved',
                        moderatorId: interaction.user.id,
                        moderatorTag: interaction.user.tag,
                        targetId: request.userId,
                        targetTag: request.username,
                        guildId: interaction.guild.id,
                        guildName: interaction.guild.name,
                        reason: `Validation demande banlist (ID: ${requestId})`,
                        success: true,
                        channelId: interaction.channel.id,
                        details: { 
                            requestId, 
                            originalReason: request.reason, 
                            originalModerator: request.moderatorTag 
                        }
                    });
                }

                return interaction.editReply({
                    content: `✅ La demande **${requestId}** a été approuvée avec succès. L'utilisateur a été ajouté à la banlist et banni du serveur si présent.`
                });
            } else {
                return interaction.editReply({
                    content: `❌ Impossible d'approuver la demande: ${result.error || 'Erreur inconnue'}`
                });
            }
        }

        if (subcommand === 'reject') {
            const requestId = interaction.options.getString('id');
            const pendingRequests = banlistManager.getPendingRequests();
            const request = pendingRequests.find(r => r.id === requestId);
            
            await interaction.deferReply({ ephemeral: true });

            const result = await banlistManager.rejectRequest(requestId, interaction.user.id);

            if (result.success) {
                // Tentative de logging
                if (reportManager && reportManager.moderationLogger && request) {
                    await reportManager.moderationLogger.logModerationAction({
                        type: 'banlist-rejected',
                        moderatorId: interaction.user.id,
                        moderatorTag: interaction.user.tag,
                        targetId: request.userId,
                        targetTag: request.username,
                        guildId: interaction.guild.id,
                        guildName: interaction.guild.name,
                        reason: `Rejet demande banlist (ID: ${requestId})`,
                        success: true,
                        channelId: interaction.channel.id,
                        details: { 
                            requestId, 
                            originalReason: request.reason, 
                            originalModerator: request.moderatorTag 
                        }
                    });
                }

                return interaction.editReply({
                    content: `✅ La demande **${requestId}** a été rejetée.`
                });
            } else {
                return interaction.editReply({
                    content: `❌ Impossible de rejeter la demande: ${result.error || 'Erreur inconnue'}`
                });
            }
        }
    },
};
