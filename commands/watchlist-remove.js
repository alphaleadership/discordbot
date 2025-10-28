import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';

export default {
    data: new SlashCommandBuilder()
        .setName('watchlist-remove')
        .setDescription('Retirer un utilisateur de la liste de surveillance locale')
        .addUserOption(option =>
            option.setName('utilisateur')
                .setDescription('L\'utilisateur à retirer de la surveillance')
                .setRequired(true)
        ),
    async execute(interaction, adminManager, warnManager, guildConfig, sharedConfig, backupToGitHub, reportManager, banlistManager, blockedWordsManager, watchlistManager, telegramIntegration, funCommandsManager, raidDetector, doxDetector, enhancedReloadSystem, permissionValidator) {
        try {
            const targetUser = interaction.options.getUser('utilisateur');

            // Validate permissions using PermissionValidator
            const permissionResult = permissionValidator.validateWatchlistPermission(interaction.member);

            if (!permissionResult.success) {
                // Log permission denial
                if (reportManager && reportManager.moderationLogger) {
                    await reportManager.moderationLogger.logPermissionDenial({
                        action: 'watchlist-remove',
                        userId: interaction.user.id,
                        userTag: interaction.user.tag,
                        targetId: targetUser.id,
                        targetTag: targetUser.tag,
                        guildId: interaction.guild.id,
                        guildName: interaction.guild.name,
                        reason: permissionResult.message,
                        requiredPermission: 'WATCHLIST_MANAGEMENT',
                        userPermissions: interaction.member.permissions.toArray()
                    });
                }
                
                return interaction.reply({
                    content: permissionResult.message,
                    ephemeral: true
                });
            }

            // Check if user is on watchlist first
            const existingEntry = watchlistManager.getWatchlistEntry(targetUser.id, interaction.guild.id);
            if (!existingEntry || !existingEntry.active) {
                return interaction.reply({
                    content: `❌ L'utilisateur ${targetUser.tag} n'est pas sur la liste de surveillance de ce serveur.`,
                    ephemeral: true
                });
            }

            // Remove from watchlist
            const result = await watchlistManager.removeFromWatchlist(targetUser.id, interaction.guild.id);

            if (!result.success) {
                // Log failed watchlist operation
                if (reportManager && reportManager.moderationLogger) {
                    await reportManager.moderationLogger.logWatchlistOperation({
                        operation: 'remove',
                        moderatorId: interaction.user.id,
                        moderatorTag: interaction.user.tag,
                        targetId: targetUser.id,
                        targetTag: targetUser.tag,
                        guildId: interaction.guild.id,
                        guildName: interaction.guild.name,
                        isGlobal: false,
                        success: false,
                        data: {
                            error: result.error
                        }
                    });
                }
                
                return interaction.reply({
                    content: `❌ ${result.error}`,
                    ephemeral: true
                });
            }

            // Create success embed
            const successEmbed = new EmbedBuilder()
                .setColor('#00FF00')
                .setTitle('✅ Utilisateur retiré de la surveillance')
                .addFields(
                    { name: 'Utilisateur', value: `${targetUser.tag} (${targetUser.id})` },
                    { name: 'Raison originale', value: existingEntry.reason || 'Non spécifiée' },
                    { name: 'Niveau de surveillance', value: this.getWatchLevelDisplay(existingEntry.watchLevel) },
                    { name: 'Ajouté par', value: `<@${existingEntry.addedBy}>` },
                    { name: 'Ajouté le', value: new Date(existingEntry.addedAt).toLocaleString('fr-FR') },
                    { name: 'Retiré par', value: interaction.user.tag },
                    { name: 'Date de retrait', value: new Date().toLocaleString('fr-FR') }
                );

            // Add notes count if any
            if (existingEntry.notes && existingEntry.notes.length > 0) {
                successEmbed.addFields({
                    name: 'Notes archivées',
                    value: `${existingEntry.notes.length} note(s) conservée(s) dans l'historique`
                });
            }

            // Add incidents count if any
            if (existingEntry.incidents && existingEntry.incidents.length > 0) {
                successEmbed.addFields({
                    name: 'Incidents archivés',
                    value: `${existingEntry.incidents.length} incident(s) conservé(s) dans l'historique`
                });
            }

            await interaction.reply({ embeds: [successEmbed] });

            // Log the successful watchlist operation
            if (reportManager && reportManager.moderationLogger) {
                await reportManager.moderationLogger.logWatchlistOperation({
                    operation: 'remove',
                    moderatorId: interaction.user.id,
                    moderatorTag: interaction.user.tag,
                    targetId: targetUser.id,
                    targetTag: targetUser.tag,
                    guildId: interaction.guild.id,
                    guildName: interaction.guild.name,
                    isGlobal: false,
                    success: true,
                    data: {
                        originalReason: existingEntry.reason,
                        originalWatchLevel: existingEntry.watchLevel,
                        notesCount: existingEntry.notes?.length || 0,
                        incidentsCount: existingEntry.incidents?.length || 0
                    }
                });
            }

            // Legacy console logging
            console.log(`[WATCHLIST-REMOVE] ${targetUser.tag} (${targetUser.id}) retiré de la surveillance par ${interaction.user.tag} (${interaction.user.id}) - Serveur: ${interaction.guild.name}`);

        } catch (error) {
            console.error('Erreur dans la commande watchlist-remove:', error);
            
            // Log error
            if (reportManager && reportManager.moderationLogger) {
                await reportManager.moderationLogger.logError('watchlist-remove', error, {
                    moderatorId: interaction.user.id,
                    moderatorTag: interaction.user.tag,
                    targetUserId: interaction.options.getUser('utilisateur')?.id,
                    guildId: interaction.guild.id,
                    guildName: interaction.guild.name
                });
            }
            
            const errorMessage = '❌ Une erreur inattendue est survenue lors du retrait de la liste de surveillance.';
            
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
     * Gets display text for watch level
     * @param {string} watchLevel - The watch level
     * @returns {string} Display text
     */
    getWatchLevelDisplay(watchLevel) {
        const levels = {
            'observe': '🔍 Observer',
            'alert': '🚨 Alerte',
            'action': '⚡ Action'
        };
        return levels[watchLevel] || watchLevel;
    }
};