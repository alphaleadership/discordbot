import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';

export default {
    data: new SlashCommandBuilder()
        .setName('watchlist-list')
        .setDescription('Afficher la liste de surveillance locale du serveur')
        .addIntegerOption(option =>
            option.setName('page')
                .setDescription('Numéro de page à afficher')
                .setMinValue(1)
                .setRequired(false)
        ),
    async execute(interaction, adminManager, permissionValidator, watchlistManager) {
        try {
            // Validate permissions using PermissionValidator
            const permissionResult = permissionValidator.validateWatchlistPermission(interaction.member);

            if (!permissionResult.success) {
                return interaction.reply({
                    content: permissionResult.message,
                    ephemeral: true
                });
            }

            const page = interaction.options.getInteger('page') || 1;
            const itemsPerPage = 10;

            // Get all active watchlist entries for this guild
            const allEntries = watchlistManager.getGuildWatchlist(interaction.guild.id);
            const activeEntries = allEntries.filter(entry => entry.active);

            if (activeEntries.length === 0) {
                const emptyEmbed = new EmbedBuilder()
                    .setColor('#808080')
                    .setTitle('👁️ Liste de surveillance - Vide')
                    .setDescription('Aucun utilisateur n\'est actuellement surveillé sur ce serveur.')
                    .addFields({
                        name: 'Comment ajouter un utilisateur',
                        value: 'Utilisez `/watchlist-add` pour ajouter un utilisateur à la surveillance.'
                    });

                return interaction.reply({ embeds: [emptyEmbed], ephemeral: true });
            }

            // Calculate pagination
            const totalPages = Math.ceil(activeEntries.length / itemsPerPage);
            
            if (page > totalPages) {
                return interaction.reply({
                    content: `❌ Page invalide. Il y a seulement ${totalPages} page(s) disponible(s).`,
                    ephemeral: true
                });
            }

            const startIndex = (page - 1) * itemsPerPage;
            const endIndex = startIndex + itemsPerPage;
            const pageEntries = activeEntries.slice(startIndex, endIndex);

            // Sort entries by addedAt (most recent first)
            pageEntries.sort((a, b) => new Date(b.addedAt) - new Date(a.addedAt));

            // Create embed
            const listEmbed = new EmbedBuilder()
                .setColor('#FFA500')
                .setTitle(`👁️ Liste de surveillance - ${interaction.guild.name}`)
                .setDescription(`Page ${page}/${totalPages} - ${activeEntries.length} utilisateur(s) surveillé(s)`)
                .setFooter({ 
                    text: `Utilisez /watchlist-info pour plus de détails sur un utilisateur` 
                });

            // Add entries to embed
            for (let i = 0; i < pageEntries.length; i++) {
                const entry = pageEntries[i];
                const entryNumber = startIndex + i + 1;
                
                // Try to get user info
                let userDisplay = `ID: ${entry.userId}`;
                if (entry.username) {
                    userDisplay = entry.discriminator && entry.discriminator !== '0' 
                        ? `${entry.username}#${entry.discriminator}` 
                        : entry.username;
                }

                const watchLevelIcon = this.getWatchLevelIcon(entry.watchLevel);
                const addedDate = new Date(entry.addedAt).toLocaleDateString('fr-FR');
                
                // Truncate reason if too long
                let displayReason = entry.reason;
                if (displayReason.length > 100) {
                    displayReason = displayReason.substring(0, 97) + '...';
                }

                const fieldValue = [
                    `**Utilisateur:** ${userDisplay}`,
                    `**Niveau:** ${watchLevelIcon} ${entry.watchLevel}`,
                    `**Raison:** ${displayReason}`,
                    `**Ajouté le:** ${addedDate}`,
                    `**Notes:** ${entry.notes?.length || 0} | **Incidents:** ${entry.incidents?.length || 0}`
                ].join('\n');

                listEmbed.addFields({
                    name: `${entryNumber}. ${entry.userId}`,
                    value: fieldValue,
                    inline: false
                });
            }

            // Add navigation info if multiple pages
            if (totalPages > 1) {
                let navigationText = `Page ${page} sur ${totalPages}`;
                if (page < totalPages) {
                    navigationText += ` | Utilisez \`/watchlist-list page:${page + 1}\` pour la page suivante`;
                }
                if (page > 1) {
                    navigationText += ` | Utilisez \`/watchlist-list page:${page - 1}\` pour la page précédente`;
                }
                
                listEmbed.addFields({
                    name: 'Navigation',
                    value: navigationText,
                    inline: false
                });
            }

            await interaction.reply({ embeds: [listEmbed], ephemeral: true });

            // Log the action
            console.log(`[WATCHLIST-LIST] Liste consultée par ${interaction.user.tag} (${interaction.user.id}) - Serveur: ${interaction.guild.name} - Page: ${page}`);

        } catch (error) {
            console.error('Erreur dans la commande watchlist-list:', error);
            
            const errorMessage = '❌ Une erreur inattendue est survenue lors de l\'affichage de la liste de surveillance.';
            
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp({
                    content: errorMessage,
                    ephemeral: true
                });
            } else {
                await interaction.reply({
                    content: errorMessage,
                    ephemeral: true
                });
            }
        }
    },

    /**
     * Gets icon for watch level
     * @param {string} watchLevel - The watch level
     * @returns {string} Icon
     */
    getWatchLevelIcon(watchLevel) {
        const icons = {
            'observe': '🔍',
            'alert': '🚨',
            'action': '⚡'
        };
        return icons[watchLevel] || '❓';
    }
};