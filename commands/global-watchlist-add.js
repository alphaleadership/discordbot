import { SlashCommandBuilder, PermissionsBitField } from 'discord.js';

export default {
    data: new SlashCommandBuilder()
        .setName('global-watchlist-add')
        .setDescription('Ajouter un utilisateur à la liste de surveillance globale (tous les serveurs)')
        .addUserOption(option =>
            option.setName('utilisateur')
                .setDescription('L\'utilisateur à ajouter à la liste de surveillance globale')
                .setRequired(true)
        )
        .addStringOption(option =>
            option.setName('raison')
                .setDescription('La raison de l\'ajout à la liste de surveillance globale')
                .setRequired(true)
        )
        .addStringOption(option =>
            option.setName('niveau')
                .setDescription('Niveau de surveillance globale')
                .setRequired(false)
                .addChoices(
                    { name: 'Observer', value: 'observe' },
                    { name: 'Alerte', value: 'alert' },
                    { name: 'Action', value: 'action' }
                )
        ),
    async execute(interaction, adminManager, warnManager, guildConfig, sharedConfig, backupToGitHub, reportManager, banlistManager, blockedWordsManager, watchlistManager, telegramIntegration, funCommandsManager, raidDetector, doxDetector, enhancedReloadSystem, permissionValidator) {
        const permissionResult = permissionValidator.validateGlobalWatchlistPermission(interaction.member);
        if (!permissionResult.success) {
            // Log permission denial
            if (reportManager && reportManager.moderationLogger) {
                await reportManager.moderationLogger.logPermissionDenial({
                    action: 'global-watchlist-add',
                    userId: interaction.user.id,
                    userTag: interaction.user.tag,
                    targetId: interaction.options.getUser('utilisateur')?.id,
                    targetTag: interaction.options.getUser('utilisateur')?.tag,
                    guildId: interaction.guild.id,
                    guildName: interaction.guild.name,
                    reason: permissionResult.message,
                    requiredPermission: 'BOT_ADMIN',
                    userPermissions: interaction.member.permissions.toArray()
                });
            }
            
            return interaction.reply({
                content: permissionResult.message,
                ephemeral: true
            });
        }

        const user = interaction.options.getUser('utilisateur');
        const reason = interaction.options.getString('raison');
        const watchLevel = interaction.options.getString('niveau') || 'alert'; // Default to alert for global

        // Check if user is a bot admin
        if (adminManager.isAdmin(user.id)) {
            return interaction.reply({
                content: '❌ Vous ne pouvez pas ajouter un administrateur du bot à la liste de surveillance globale.',
                ephemeral: true
            });
        }

        if (user.id === interaction.user.id) {
            return interaction.reply({
                content: '❌ Vous ne pouvez pas vous ajouter à la liste de surveillance globale.',
                ephemeral: true
            });
        }

        if (user.bot) {
            return interaction.reply({
                content: '❌ Vous ne pouvez pas ajouter un bot à la liste de surveillance globale.',
                ephemeral: true
            });
        }

        try {
            const result = await watchlistManager.addToGlobalWatchlist(
                user.id,
                reason,
                interaction.user.id,
                {
                    watchLevel,
                    username: user.username,
                    discriminator: user.discriminator
                }
            );

            if (result.success) {
                const levelEmojis = {
                    observe: '👁️',
                    alert: '⚠️',
                    action: '🚨'
                };

                await interaction.reply({
                    content: `✅ ${user} a été ajouté à la liste de surveillance **GLOBALE**.\n` +
                            `🌍 **Portée:** Tous les serveurs où le bot est présent\n` +
                            `**Niveau:** ${levelEmojis[watchLevel]} ${watchLevel.toUpperCase()}\n` +
                            `**Raison:** ${reason}\n\n` +
                            `⚠️ Cet utilisateur sera surveillé sur **tous les serveurs** où le bot est actif.`,
                    ephemeral: false
                });
                
                // Log successful global watchlist operation
                if (reportManager && reportManager.moderationLogger) {
                    await reportManager.moderationLogger.logWatchlistOperation({
                        operation: 'add',
                        moderatorId: interaction.user.id,
                        moderatorTag: interaction.user.tag,
                        targetId: user.id,
                        targetTag: user.tag,
                        guildId: interaction.guild.id,
                        guildName: interaction.guild.name,
                        isGlobal: true,
                        success: true,
                        data: {
                            reason: reason,
                            watchLevel: watchLevel
                        }
                    });
                }
            } else {
                // Log failed global watchlist operation
                if (reportManager && reportManager.moderationLogger) {
                    await reportManager.moderationLogger.logWatchlistOperation({
                        operation: 'add',
                        moderatorId: interaction.user.id,
                        moderatorTag: interaction.user.tag,
                        targetId: user.id,
                        targetTag: user.tag,
                        guildId: interaction.guild.id,
                        guildName: interaction.guild.name,
                        isGlobal: true,
                        success: false,
                        data: {
                            reason: reason,
                            watchLevel: watchLevel,
                            error: result.error
                        }
                    });
                }
                
                await interaction.reply({
                    content: `❌ ${result.error}`,
                    ephemeral: true
                });
            }
        } catch (error) {
            console.error('Erreur lors de l\'ajout à la watchlist globale:', error);
            
            // Log error
            if (reportManager && reportManager.moderationLogger) {
                await reportManager.moderationLogger.logError('global-watchlist-add', error, {
                    moderatorId: interaction.user.id,
                    moderatorTag: interaction.user.tag,
                    targetUserId: user?.id,
                    guildId: interaction.guild.id,
                    guildName: interaction.guild.name,
                    reason: reason,
                    watchLevel: watchLevel
                });
            }
            
            await interaction.reply({
                content: '❌ Une erreur est survenue lors de l\'ajout à la liste de surveillance globale.',
                ephemeral: true
            });
        }
    },
};