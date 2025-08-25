import { SlashCommandBuilder, EmbedBuilder, PermissionsBitField } from 'discord.js';

export default {
    data: new SlashCommandBuilder()
        .setName('global-watchlist-info')
        .setDescription('Afficher les détails d\'un utilisateur de la surveillance globale')
        .addUserOption(option =>
            option.setName('utilisateur')
                .setDescription('L\'utilisateur dont afficher les détails de surveillance globale')
                .setRequired(true)
        ),
    async execute(interaction, adminManager, warnManager, guildConfig, sharedConfig, backupToGitHub, reportManager, banlistManager, blockedWordsManager, watchlistManager, telegramIntegration, funCommandsManager, raidDetector, doxDetector, enhancedReloadSystem, permissionValidator) {
        const permissionResult = permissionValidator.validateGlobalWatchlistPermission(interaction.member);
        if (!permissionResult.success) {
            return interaction.reply({
                content: permissionResult.message,
                ephemeral: true
            });
        }

        const user = interaction.options.getUser('utilisateur');

        try {
            const globalEntry = watchlistManager.getGlobalWatchlistEntry(user.id);

            if (!globalEntry) {
                return interaction.reply({
                    content: `❌ ${user} n'est pas dans la liste de surveillance globale.`,
                    ephemeral: true
                });
            }

            // Helper function to get watch level color
            const getWatchLevelColor = (watchLevel) => {
                switch (watchLevel) {
                    case 'observe': return '#3498db'; // Blue
                    case 'alert': return '#f39c12';   // Orange
                    case 'action': return '#e74c3c';  // Red
                    default: return '#95a5a6';        // Gray
                }
            };

            // Helper function to get watch level emoji
            const getWatchLevelEmoji = (watchLevel) => {
                switch (watchLevel) {
                    case 'observe': return '👁️';
                    case 'alert': return '⚠️';
                    case 'action': return '🚨';
                    default: return '❓';
                }
            };

            // Create main embed
            const embed = new EmbedBuilder()
                .setColor('#ff6b6b') // Red color for global watchlist
                .setTitle(`🌍 Détails de Surveillance GLOBALE`)
                .setDescription(`Informations détaillées pour ${user.tag}\n\n⚠️ **Cet utilisateur est surveillé sur TOUS les serveurs**`)
                .setThumbnail(user.displayAvatarURL({ dynamic: true }))
                .addFields(
                    { name: 'Utilisateur', value: `${globalEntry.username}#${globalEntry.discriminator}`, inline: true },
                    { name: 'ID Utilisateur', value: globalEntry.userId, inline: true },
                    { name: 'Niveau de surveillance', value: `${getWatchLevelEmoji(globalEntry.watchLevel)} ${globalEntry.watchLevel.toUpperCase()} 🌍`, inline: true },
                    { name: 'Raison', value: globalEntry.reason, inline: false },
                    { name: 'Ajouté par', value: `<@${globalEntry.addedBy}>`, inline: true },
                    { name: 'Ajouté le', value: new Date(globalEntry.addedAt).toLocaleString('fr-FR'), inline: true }
                )
                .setTimestamp()
                .setFooter({ text: `Demandé par ${interaction.user.tag}` });

            // Add last seen if available
            if (globalEntry.lastSeen) {
                embed.addFields({
                    name: 'Dernière activité',
                    value: new Date(globalEntry.lastSeen).toLocaleString('fr-FR'),
                    inline: true
                });
            }

            // Add statistics
            const totalIncidents = globalEntry.incidents?.length || 0;
            const totalNotes = globalEntry.notes?.length || 0;
            const recentIncidents = globalEntry.incidents?.filter(inc => 
                new Date(inc.timestamp) > new Date(Date.now() - 24 * 60 * 60 * 1000)
            ).length || 0;

            embed.addFields({
                name: 'Statistiques Globales',
                value: `**Incidents totaux:** ${totalIncidents}\n` +
                       `**Incidents (24h):** ${recentIncidents}\n` +
                       `**Notes:** ${totalNotes}`,
                inline: true
            });

            const userHistory = watchlistManager.getUserHistory(user.id);
            const localWatchlists = userHistory.guilds.filter(g => g.guildId !== 'GLOBAL');

            if (localWatchlists.length > 0) {
                const localGuilds = localWatchlists.map(entry => `• Serveur ${entry.guildId} (${getWatchLevelEmoji(entry.watchLevel)} ${entry.watchLevel})`).join('\n');
                embed.addFields({
                    name: `Watchlists Locales (${localWatchlists.length})`,
                    value: localGuilds.length > 1000 ? localGuilds.substring(0, 1000) + '...' : localGuilds,
                    inline: false
                });
            }

            // Add recent incidents (last 5)
            if (globalEntry.incidents && globalEntry.incidents.length > 0) {
                const recentIncidentsList = globalEntry.incidents
                    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
                    .slice(0, 5)
                    .map(incident => {
                        const date = new Date(incident.timestamp).toLocaleDateString('fr-FR');
                        const time = new Date(incident.timestamp).toLocaleTimeString('fr-FR', { 
                            hour: '2-digit', 
                            minute: '2-digit' 
                        });
                        return `• **${incident.type}** - ${incident.description.substring(0, 50)}${incident.description.length > 50 ? '...' : ''} *(${date} ${time})*`;
                    })
                    .join('\n');

                embed.addFields({
                    name: `Incidents récents (${Math.min(5, globalEntry.incidents.length)}/${totalIncidents})`,
                    value: recentIncidentsList || 'Aucun incident récent',
                    inline: false
                });
            }

            // Add recent notes (last 3)
            if (globalEntry.notes && globalEntry.notes.length > 0) {
                const recentNotesList = globalEntry.notes
                    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
                    .slice(0, 3)
                    .map(note => {
                        const date = new Date(note.timestamp).toLocaleDateString('fr-FR');
                        return `• ${note.note.substring(0, 100)}${note.note.length > 100 ? '...' : ''} *(${date})*`;
                    })
                    .join('\n');

                embed.addFields({
                    name: `Notes récentes (${Math.min(3, globalEntry.notes.length)}/${totalNotes})`,
                    value: recentNotesList || 'Aucune note',
                    inline: false
                });
            }

            // Add status and scope warning
            embed.addFields(
                {
                    name: 'Statut',
                    value: globalEntry.active ? '🟢 Actif' : '🔴 Inactif',
                    inline: true
                },
                {
                    name: '🌍 Portée Globale',
                    value: 'Cet utilisateur est surveillé sur **tous les serveurs** où le bot est présent.',
                    inline: false
                }
            );

            await interaction.reply({ embeds: [embed], ephemeral: true });

        } catch (error) {
            console.error('Erreur lors de l\'affichage des détails de la watchlist globale:', error);
            await interaction.reply({
                content: '❌ Une erreur est survenue lors de l\'affichage des détails de surveillance globale.',
                ephemeral: true
            });
        }
    },
};