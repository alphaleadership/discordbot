import { SlashCommandBuilder, EmbedBuilder, PermissionsBitField } from 'discord.js';

export default {
    data: new SlashCommandBuilder()
        .setName('global-watchlist-list')
        .setDescription('Afficher la liste de surveillance globale')
        .addIntegerOption(option =>
            option.setName('page')
                .setDescription('Numéro de page à afficher')
                .setRequired(false)
                .setMinValue(1)
        ),
    async execute(interaction, adminManager, warnManager, guildConfig, sharedConfig, backupToGitHub, reportManager, banlistManager, blockedWordsManager, watchlistManager, telegramIntegration, funCommandsManager, raidDetector, doxDetector, enhancedReloadSystem, permissionValidator) {
        const permissionResult = permissionValidator.validateGlobalWatchlistPermission(interaction.member);
        if (!permissionResult.success) {
            return interaction.reply({
                content: permissionResult.message,
                ephemeral: true
            });
        }

        const page = interaction.options.getInteger('page') || 1;
        const itemsPerPage = 10;

        try {
            const globalWatchlist = watchlistManager.getGlobalWatchlist();

            if (globalWatchlist.length === 0) {
                return interaction.reply({
                    content: 'ℹ️ La liste de surveillance globale est vide.',
                    ephemeral: true
                });
            }

            // Calculate pagination
            const totalPages = Math.ceil(globalWatchlist.length / itemsPerPage);
            const startIndex = (page - 1) * itemsPerPage;
            const endIndex = startIndex + itemsPerPage;
            const pageEntries = globalWatchlist.slice(startIndex, endIndex);

            if (page > totalPages) {
                return interaction.reply({
                    content: `❌ Page ${page} n'existe pas. Il y a ${totalPages} page(s) au total.`,
                    ephemeral: true
                });
            }

            // Create embed
            const embed = new EmbedBuilder()
                .setColor('#ff6b6b') // Red color for global watchlist
                .setTitle(`🌍 Liste de Surveillance GLOBALE`)
                .setDescription(`Page ${page}/${totalPages} • ${globalWatchlist.length} utilisateur(s) surveillé(s) globalement\n\n` +
                               `⚠️ **Ces utilisateurs sont surveillés sur TOUS les serveurs où le bot est présent**`)
                .setTimestamp()
                .setFooter({ text: `Demandé par ${interaction.user.tag}` });

            // Add entries to embed
            const levelEmojis = {
                observe: '👁️',
                alert: '⚠️',
                action: '🚨'
            };

            for (const entry of pageEntries) {
                const addedDate = new Date(entry.addedAt).toLocaleDateString('fr-FR');
                const incidentCount = entry.incidents?.length || 0;
                const recentIncidents = entry.incidents?.filter(inc => 
                    new Date(inc.timestamp) > new Date(Date.now() - 24 * 60 * 60 * 1000)
                ).length || 0;

                let fieldValue = `**Niveau:** ${levelEmojis[entry.watchLevel]} ${entry.watchLevel.toUpperCase()} 🌍\n`;
                fieldValue += `**Raison:** ${entry.reason}\n`;
                fieldValue += `**Ajouté le:** ${addedDate}\n`;
                fieldValue += `**Incidents:** ${incidentCount} total (${recentIncidents} dernières 24h)`;

                if (entry.lastSeen) {
                    const lastSeenDate = new Date(entry.lastSeen).toLocaleDateString('fr-FR');
                    fieldValue += `\n**Dernière activité:** ${lastSeenDate}`;
                }

                embed.addFields({
                    name: `${entry.username}#${entry.discriminator} (${entry.userId})`,
                    value: fieldValue,
                    inline: false
                });
            }

            // Add navigation info if multiple pages
            if (totalPages > 1) {
                embed.addFields({
                    name: 'Navigation',
                    value: `Utilisez \`/global-watchlist-list page:${page + 1}\` pour la page suivante` +
                           (page > 1 ? ` ou \`/global-watchlist-list page:${page - 1}\` pour la page précédente` : ''),
                    inline: false
                });
            }

            // Add warning about global scope
            embed.addFields({
                name: '⚠️ Portée Globale',
                value: 'Ces utilisateurs sont surveillés sur **tous les serveurs** où le bot est actif. ' +
                       'Les incidents sont enregistrés peu importe le serveur d\'origine.',
                inline: false
            });

            await interaction.reply({ embeds: [embed], ephemeral: true });

        } catch (error) {
            console.error('Erreur lors de l\'affichage de la watchlist globale:', error);
            await interaction.reply({
                content: '❌ Une erreur est survenue lors de l\'affichage de la liste de surveillance globale.',
                ephemeral: true
            });
        }
    },
};