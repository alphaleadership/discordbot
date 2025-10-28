import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';

export default {
    data: new SlashCommandBuilder()
        .setName('watchlist-add')
        .setDescription('Ajouter un utilisateur à la liste de surveillance locale')
        .addUserOption(option =>
            option.setName('utilisateur')
                .setDescription('L\'utilisateur à ajouter à la surveillance')
                .setRequired(true)
        )
        .addStringOption(option =>
            option.setName('raison')
                .setDescription('La raison de la surveillance')
                .setRequired(true)
        )
        .addStringOption(option =>
            option.setName('niveau')
                .setDescription('Le niveau de surveillance')
                .setRequired(false)
                .addChoices(
                    { name: 'Observer - Enregistrer seulement les activités', value: 'observe' },
                    { name: 'Alerte - Notifier les modérateurs des activités', value: 'alert' },
                    { name: 'Action - Alerte + actions automatiques possibles', value: 'action' }
                )
        ),
    async execute(interaction, adminManager, warnManager, guildConfig, sharedConfig, backupToGitHub, reportManager, banlistManager, blockedWordsManager, watchlistManager, telegramIntegration, funCommandsManager, raidDetector, doxDetector, enhancedReloadSystem, permissionValidator) {
        try {
            const targetUser = interaction.options.getUser('utilisateur');
            const reason = interaction.options.getString('raison');
            const watchLevel = interaction.options.getString('niveau') || 'observe';

            // Validate permissions using PermissionValidator
            const permissionResult = permissionValidator.validateWatchlistPermission(interaction.member);

            if (!permissionResult.success) {
                // Log permission denial
                if (reportManager && reportManager.moderationLogger) {
                    await reportManager.moderationLogger.logPermissionDenial({
                        action: 'watchlist-add',
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

            // Validate watch level
            const validWatchLevels = ['observe', 'alert', 'action'];
            if (!validWatchLevels.includes(watchLevel)) {
                return interaction.reply({
                    content: '❌ Niveau de surveillance invalide. Utilisez: observe, alert, ou action.',
                    ephemeral: true
                });
            }

            // Validate reason length
            if (reason.trim().length < 3) {
                return interaction.reply({
                    content: '❌ La raison doit contenir au moins 3 caractères.',
                    ephemeral: true
                });
            }

            if (reason.length > 500) {
                return interaction.reply({
                    content: '❌ La raison ne peut pas dépasser 500 caractères.',
                    ephemeral: true
                });
            }

            // Try to get target member info for better display
            let targetMember = null;
            try {
                targetMember = await interaction.guild.members.fetch(targetUser.id);
            } catch (error) {
                // User is not in the guild, we can still add them to watchlist
                console.log(`Utilisateur ${targetUser.tag} non trouvé sur le serveur, ajout à la surveillance par ID`);
            }

            // Add to watchlist
            const result = await watchlistManager.addToWatchlist(
                targetUser.id,
                reason,
                interaction.user.id,
                interaction.guild.id,
                {
                    watchLevel: watchLevel,
                    username: targetUser.username,
                    discriminator: targetUser.discriminator
                }
            );

            if (!result.success) {
                // Log failed watchlist operation
                if (reportManager && reportManager.moderationLogger) {
                    await reportManager.moderationLogger.logWatchlistOperation({
                        operation: 'add',
                        moderatorId: interaction.user.id,
                        moderatorTag: interaction.user.tag,
                        targetId: targetUser.id,
                        targetTag: targetUser.tag,
                        guildId: interaction.guild.id,
                        guildName: interaction.guild.name,
                        isGlobal: false,
                        success: false,
                        data: {
                            reason: reason,
                            watchLevel: watchLevel,
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
                .setColor('#FFA500')
                .setTitle('👁️ Utilisateur ajouté à la surveillance')
                .addFields(
                    { name: 'Utilisateur', value: `${targetUser.tag} (${targetUser.id})` },
                    { name: 'Raison', value: reason },
                    { name: 'Niveau de surveillance', value: this.getWatchLevelDisplay(watchLevel) },
                    { name: 'Modérateur', value: interaction.user.tag },
                    { name: 'Serveur', value: interaction.guild.name },
                    { name: 'Date', value: new Date().toLocaleString('fr-FR') }
                );

            // Add warnings if any
            if (result.warnings && result.warnings.length > 0) {
                successEmbed.addFields({
                    name: '⚠️ Avertissements',
                    value: result.warnings.join('\n')
                });
            }

            await interaction.reply({ embeds: [successEmbed] });

            // Log the successful watchlist operation
            if (reportManager && reportManager.moderationLogger) {
                await reportManager.moderationLogger.logWatchlistOperation({
                    operation: 'add',
                    moderatorId: interaction.user.id,
                    moderatorTag: interaction.user.tag,
                    targetId: targetUser.id,
                    targetTag: targetUser.tag,
                    guildId: interaction.guild.id,
                    guildName: interaction.guild.name,
                    isGlobal: false,
                    success: true,
                    data: {
                        reason: reason,
                        watchLevel: watchLevel,
                        warnings: result.warnings
                    }
                });
            }

            // Legacy console logging
            console.log(`[WATCHLIST-ADD] ${targetUser.tag} (${targetUser.id}) ajouté à la surveillance par ${interaction.user.tag} (${interaction.user.id}) - Niveau: ${watchLevel} - Raison: ${reason}`);

        } catch (error) {
            console.error('Erreur dans la commande watchlist-add:', error);
            
            // Log error
            if (reportManager && reportManager.moderationLogger) {
                await reportManager.moderationLogger.logError('watchlist-add', error, {
                    moderatorId: interaction.user.id,
                    moderatorTag: interaction.user.tag,
                    targetUserId: interaction.options.getUser('utilisateur')?.id,
                    guildId: interaction.guild.id,
                    guildName: interaction.guild.name
                });
            }
            
            const errorMessage = '❌ Une erreur inattendue est survenue lors de l\'ajout à la liste de surveillance.';
            
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
            'observe': '🔍 Observer - Enregistrement des activités',
            'alert': '🚨 Alerte - Notifications aux modérateurs',
            'action': '⚡ Action - Alerte + actions automatiques'
        };
        return levels[watchLevel] || watchLevel;
    }
};