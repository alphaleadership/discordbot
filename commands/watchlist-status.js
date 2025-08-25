import { SlashCommandBuilder, EmbedBuilder, PermissionsBitField } from 'discord.js';

export default {
    data: new SlashCommandBuilder()
        .setName('watchlist-status')
        .setDescription('Vérifier le statut de surveillance d\'un utilisateur (local + global)')
        .addUserOption(option =>
            option.setName('utilisateur')
                .setDescription('L\'utilisateur dont vérifier le statut de surveillance')
                .setRequired(true)
        ),
    async execute(interaction, adminManager, warnManager, guildConfig, sharedConfig, backupToGitHub, reportManager, banlistManager, blockedWordsManager, commandHandler, watchlistManager) {
        // Check permissions - bot admins can bypass permission requirements
        const isAdmin = adminManager.isAdmin(interaction.user.id);
        if (!isAdmin && !interaction.memberPermissions?.has(PermissionsBitField.Flags.ModerateMembers)) {
            return interaction.reply({
                content: '❌ Vous devez avoir la permission de modérer les membres pour utiliser cette commande.',
                ephemeral: true
            });
        }

        const user = interaction.options.getUser('utilisateur');

        try {
            // Check watchlist status for both guild and global
            const watchStatus = watchlistManager.isOnAnyWatchlist(user.id, interaction.guild.id);

            // Helper functions
            const getWatchLevelEmoji = (watchLevel) => {
                switch (watchLevel) {
                    case 'observe': return '👁️';
                    case 'alert': return '⚠️';
                    case 'action': return '🚨';
                    default: return '❓';
                }
            };

            const getWatchLevelColor = (watchLevel) => {
                switch (watchLevel) {
                    case 'observe': return '#3498db'; // Blue
                    case 'alert': return '#f39c12';   // Orange
                    case 'action': return '#e74c3c';  // Red
                    default: return '#95a5a6';        // Gray
                }
            };

            // Create status embed
            let embedColor = '#95a5a6'; // Default gray
            let statusTitle = '📋 Statut de Surveillance';
            let statusDescription = `Statut de surveillance pour ${user.tag}`;

            if (watchStatus.onGlobalWatchlist || watchStatus.onGuildWatchlist) {
                embedColor = getWatchLevelColor(watchStatus.highestWatchLevel);
                statusTitle = `🔍 Utilisateur Surveillé - ${getWatchLevelEmoji(watchStatus.highestWatchLevel)} ${watchStatus.highestWatchLevel?.toUpperCase()}`;
            }

            const embed = new EmbedBuilder()
                .setColor(embedColor)
                .setTitle(statusTitle)
                .setDescription(statusDescription)
                .setThumbnail(user.displayAvatarURL({ dynamic: true }))
                .addFields(
                    { name: 'Utilisateur', value: `${user.tag}`, inline: true },
                    { name: 'ID Utilisateur', value: user.id, inline: true },
                    { name: 'Compte créé le', value: user.createdAt.toLocaleDateString('fr-FR'), inline: true }
                )
                .setTimestamp()
                .setFooter({ text: `Demandé par ${interaction.user.tag}` });

            // Global watchlist status
            if (watchStatus.onGlobalWatchlist) {
                const globalEntry = watchStatus.globalEntry;
                embed.addFields({
                    name: '🌍 Surveillance Globale',
                    value: `**Statut:** ${getWatchLevelEmoji(globalEntry.watchLevel)} ${globalEntry.watchLevel.toUpperCase()} - ACTIF\n` +
                           `**Raison:** ${globalEntry.reason}\n` +
                           `**Ajouté le:** ${new Date(globalEntry.addedAt).toLocaleDateString('fr-FR')}\n` +
                           `**Ajouté par:** <@${globalEntry.addedBy}>\n` +
                           `**Incidents:** ${globalEntry.incidents?.length || 0} total`,
                    inline: false
                });
            } else {
                embed.addFields({
                    name: '🌍 Surveillance Globale',
                    value: '**Statut:** ❌ Non surveillé globalement',
                    inline: false
                });
            }

            // Guild watchlist status
            if (watchStatus.onGuildWatchlist) {
                const guildEntry = watchStatus.guildEntry;
                embed.addFields({
                    name: `🏠 Surveillance Locale (${interaction.guild.name})`,
                    value: `**Statut:** ${getWatchLevelEmoji(guildEntry.watchLevel)} ${guildEntry.watchLevel.toUpperCase()} - ACTIF\n` +
                           `**Raison:** ${guildEntry.reason}\n` +
                           `**Ajouté le:** ${new Date(guildEntry.addedAt).toLocaleDateString('fr-FR')}\n` +
                           `**Ajouté par:** <@${guildEntry.addedBy}>\n` +
                           `**Incidents:** ${guildEntry.incidents?.length || 0} total`,
                    inline: false
                });
            } else {
                embed.addFields({
                    name: `🏠 Surveillance Locale (${interaction.guild.name})`,
                    value: '**Statut:** ❌ Non surveillé sur ce serveur',
                    inline: false
                });
            }

            // Overall status summary
            let overallStatus = '';
            if (watchStatus.onGlobalWatchlist && watchStatus.onGuildWatchlist) {
                overallStatus = `🚨 **SURVEILLANCE DOUBLE** - Cet utilisateur est surveillé à la fois globalement et localement.\n` +
                               `**Niveau le plus élevé:** ${getWatchLevelEmoji(watchStatus.highestWatchLevel)} ${watchStatus.highestWatchLevel.toUpperCase()}`;
            } else if (watchStatus.onGlobalWatchlist) {
                overallStatus = `🌍 **SURVEILLANCE GLOBALE** - Cet utilisateur est surveillé sur tous les serveurs.`;
            } else if (watchStatus.onGuildWatchlist) {
                overallStatus = `🏠 **SURVEILLANCE LOCALE** - Cet utilisateur est surveillé uniquement sur ce serveur.`;
            } else {
                overallStatus = `✅ **AUCUNE SURVEILLANCE** - Cet utilisateur n'est pas surveillé.`;
            }

            embed.addFields({
                name: 'Résumé du Statut',
                value: overallStatus,
                inline: false
            });

            // Add recent activity summary if watched
            if (watchStatus.onGlobalWatchlist || watchStatus.onGuildWatchlist) {
                const now = new Date();
                const last24Hours = new Date(now.getTime() - 24 * 60 * 60 * 1000);
                
                let totalRecentIncidents = 0;
                let lastActivity = null;

                if (watchStatus.globalEntry) {
                    const globalRecent = watchStatus.globalEntry.incidents?.filter(inc => 
                        new Date(inc.timestamp) > last24Hours
                    ).length || 0;
                    totalRecentIncidents += globalRecent;
                    
                    if (watchStatus.globalEntry.lastSeen) {
                        const globalLastSeen = new Date(watchStatus.globalEntry.lastSeen);
                        if (!lastActivity || globalLastSeen > lastActivity) {
                            lastActivity = globalLastSeen;
                        }
                    }
                }

                if (watchStatus.guildEntry) {
                    const guildRecent = watchStatus.guildEntry.incidents?.filter(inc => 
                        new Date(inc.timestamp) > last24Hours
                    ).length || 0;
                    totalRecentIncidents += guildRecent;
                    
                    if (watchStatus.guildEntry.lastSeen) {
                        const guildLastSeen = new Date(watchStatus.guildEntry.lastSeen);
                        if (!lastActivity || guildLastSeen > lastActivity) {
                            lastActivity = guildLastSeen;
                        }
                    }
                }

                let activitySummary = `**Incidents (24h):** ${totalRecentIncidents}`;
                if (lastActivity) {
                    activitySummary += `\n**Dernière activité:** ${lastActivity.toLocaleString('fr-FR')}`;
                }

                embed.addFields({
                    name: 'Activité Récente',
                    value: activitySummary,
                    inline: true
                });
            }

            // Add admin-only information
            if (isAdmin) {
                embed.addFields({
                    name: '🔧 Informations Admin',
                    value: 'Utilisez `/global-watchlist-info` pour plus de détails sur la surveillance globale.\n' +
                           'Utilisez `/watchlist-info` pour plus de détails sur la surveillance locale.',
                    inline: false
                });
            }

            await interaction.reply({ embeds: [embed], ephemeral: true });

        } catch (error) {
            console.error('Erreur lors de la vérification du statut de surveillance:', error);
            await interaction.reply({
                content: '❌ Une erreur est survenue lors de la vérification du statut de surveillance.',
                ephemeral: true
            });
        }
    },
};