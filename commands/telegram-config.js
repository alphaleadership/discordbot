import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';

// Helper functions
async function handleShowConfig(interaction, telegramIntegration, guildId) {
    const config = telegramIntegration.loadConfig();
    const guildConfig = config.guilds[guildId];
    const status = telegramIntegration.getStatus();

    const embed = new EmbedBuilder()
        .setColor(guildConfig?.enabled ? '#00ff00' : '#ff0000')
        .setTitle('📱 Configuration Telegram')
        .setDescription('Configuration actuelle de l\'intégration Telegram pour ce serveur');

    if (guildConfig) {
        const notificationTypes = guildConfig.notificationTypes || {};
        const notificationStatus = Object.entries(notificationTypes)
            .map(([type, enabled]) => `${enabled ? '✅' : '❌'} ${type.charAt(0).toUpperCase() + type.slice(1)}`)
            .join('\n') || 'Aucune configuration';

        embed.addFields(
            { name: '🔗 Status', value: guildConfig.enabled ? '✅ Activé' : '❌ Désactivé', inline: true },
            { name: '📺 Canal Telegram', value: guildConfig.telegramChannelId || 'Non configuré', inline: true },
            { name: '💬 Canal Discord', value: guildConfig.discordChannelId ? `<#${guildConfig.discordChannelId}>` : 'Non configuré', inline: true },
            { name: '🌉 Bridge', value: guildConfig.bridgeEnabled ? '✅ Activé' : '❌ Désactivé', inline: true },
            { name: '🔗 Connexion Bot', value: status.connected ? '✅ Connecté' : '❌ Déconnecté', inline: true },
            { name: '📊 File d\'Attente', value: `${status.queueSize} messages`, inline: true },
            { name: '📢 Types de Notifications', value: notificationStatus, inline: false }
        );

        if (guildConfig.lastConfigured) {
            embed.addFields(
                { name: '⏰ Dernière Configuration', value: new Date(guildConfig.lastConfigured).toLocaleString('fr-FR'), inline: false }
            );
        }

        if (guildConfig.lastError) {
            embed.addFields(
                { name: '⚠️ Dernière Erreur', value: `${guildConfig.lastError.type}: ${guildConfig.lastError.message}`, inline: false }
            );
        }
    } else {
        embed.addFields(
            { name: '⚠️ Configuration', value: 'Aucune configuration trouvée pour ce serveur', inline: false },
            { name: '💡 Suggestion', value: 'Utilisez `/set-telegram-notification-channel` pour commencer', inline: false }
        );
    }

    // Add global status info
    embed.addFields(
        { name: '\u200B', value: '\u200B' }, // Spacer
        { 
            name: '📊 Statistiques Globales', 
            value: `Erreurs totales: ${status.errorStats?.total || 0}\n` +
                  `Limites de taux: ${status.errorStats?.rateLimits || 0}\n` +
                  `Erreurs réseau: ${status.errorStats?.network || 0}\n` +
                  `Erreurs d'auth: ${status.errorStats?.auth || 0}`, 
            inline: true 
        }
    );

    if (status.errorStats?.lastError) {
        embed.addFields(
            { 
                name: '🔍 Dernière Erreur Globale', 
                value: `${status.errorStats.lastError.context}: ${status.errorStats.lastError.message}`, 
                inline: false 
            }
        );
    }

    embed.setFooter({ text: 'Utilisez les sous-commandes pour modifier la configuration' })
         .setTimestamp();

    await interaction.reply({ embeds: [embed] });
}

async function handleDisable(interaction, telegramIntegration, guildId) {
    const config = telegramIntegration.loadConfig();
    
    if (!config.guilds[guildId]) {
        return interaction.reply({
            content: '❌ Aucune configuration Telegram trouvée pour ce serveur.',
            ephemeral: true
        });
    }

    config.guilds[guildId].enabled = false;
    const success = telegramIntegration.saveConfig(config);

    if (success) {
        const embed = new EmbedBuilder()
            .setColor('#ff0000')
            .setTitle('❌ Intégration Telegram Désactivée')
            .setDescription('L\'intégration Telegram a été désactivée pour ce serveur.')
            .addFields(
                { name: '📊 Status', value: 'Désactivé' },
                { name: '📢 Notifications', value: 'Arrêtées' },
                { name: '🌉 Bridge', value: 'Arrêté' },
                { name: '💡 Note', value: 'La configuration est conservée et peut être réactivée' }
            )
            .setTimestamp();

        await interaction.reply({ embeds: [embed] });
    } else {
        await interaction.reply({
            content: '❌ Erreur lors de la désactivation de l\'intégration Telegram.',
            ephemeral: true
        });
    }
}

async function handleEnable(interaction, telegramIntegration, guildId) {
    const config = telegramIntegration.loadConfig();
    
    if (!config.guilds[guildId] || !config.guilds[guildId].telegramChannelId) {
        return interaction.reply({
            content: '❌ Aucune configuration Telegram trouvée. Utilisez `/set-telegram-notification-channel` d\'abord.',
            ephemeral: true
        });
    }

    config.guilds[guildId].enabled = true;
    const success = telegramIntegration.saveConfig(config);

    if (success) {
        // Test the connection
        const testResult = await telegramIntegration.testMessage(guildId, 'Intégration Telegram réactivée ! ✅');
        
        const embed = new EmbedBuilder()
            .setColor('#00ff00')
            .setTitle('✅ Intégration Telegram Activée')
            .setDescription('L\'intégration Telegram a été activée pour ce serveur.')
            .addFields(
                { name: '📊 Status', value: 'Activé' },
                { name: '🔗 Test de Connexion', value: testResult ? '✅ Réussi' : '⚠️ Échoué' },
                { name: '📺 Canal Telegram', value: config.guilds[guildId].telegramChannelId },
                { name: '💡 Note', value: 'Les notifications vont reprendre immédiatement' }
            )
            .setTimestamp();

        await interaction.reply({ embeds: [embed] });
    } else {
        await interaction.reply({
            content: '❌ Erreur lors de l\'activation de l\'intégration Telegram.',
            ephemeral: true
        });
    }
}



export default {
    data: new SlashCommandBuilder()
        .setName('telegram-config')
        .setDescription('Manage Telegram integration configuration')
        .addSubcommand(subcommand =>
            subcommand
                .setName('show')
                .setDescription('Show current Telegram configuration'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('disable')
                .setDescription('Disable Telegram integration for this server'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('enable')
                .setDescription('Enable Telegram integration for this server'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('notifications')
                .setDescription('Configure notification types')
                .addBooleanOption(option =>
                    option.setName('moderation')
                        .setDescription('Enable/disable moderation notifications')
                        .setRequired(false))
                .addBooleanOption(option =>
                    option.setName('raids')
                        .setDescription('Enable/disable raid detection notifications')
                        .setRequired(false))
                .addBooleanOption(option =>
                    option.setName('dox')
                        .setDescription('Enable/disable dox detection notifications')
                        .setRequired(false))
                .addBooleanOption(option =>
                    option.setName('status')
                        .setDescription('Enable/disable bot status notifications')
                        .setRequired(false))
                .addBooleanOption(option =>
                    option.setName('stats')
                        .setDescription('Enable/disable statistics notifications')
                        .setRequired(false)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('reset')
                .setDescription('Reset Telegram configuration for this server')),
    execute: async function(interaction, adminManager, warnManager, guildConfig, sharedConfig, backupToGitHub, reportManager, banlistManager, blockedWordsManager, watchlistManager, telegramIntegration) {
        // Check if user is admin
        const isAdmin = await adminManager.isAdmin(interaction.user.id);
        if (!isAdmin) {
            return interaction.reply({
                content: '❌ Vous devez être administrateur pour utiliser cette commande.',
                ephemeral: true
            });
        }

        if (!telegramIntegration) {
            return interaction.reply({
                content: '❌ L\'intégration Telegram n\'est pas configurée.',
                ephemeral: true
            });
        }

        const subcommand = interaction.options.getSubcommand();
        const guildId = interaction.guild.id;

        try {
            switch (subcommand) {
                case 'show':
                    await handleShowConfig(interaction, telegramIntegration, guildId);
                    break;
                case 'disable':
                    await handleDisable(interaction, telegramIntegration, guildId);
                    break;
                case 'enable':
                    await handleEnable(interaction, telegramIntegration, guildId);
                    break;
                case 'notifications':
                    await handleNotifications(interaction, telegramIntegration, guildId);
                    break;
                case 'reset':
                    await handleReset(interaction, telegramIntegration, guildId);
                    break;
                default:
                    await interaction.reply({
                        content: '❌ Sous-commande non reconnue.',
                        ephemeral: true
                    });
        }
    } catch (error) {
        console.error('Error in telegram-config command:', error);
        
     
            const errorEmbed = new EmbedBuilder()
                .setColor('#ff0000')
                .setTitle('❌ Erreur de Configuration')
                .setDescription('Une erreur est survenue lors de la gestion de la configuration Telegram.')
                .addFields(
                    { name: 'Erreur', value: error.message || 'Erreur inconnue' }
                )
                .setTimestamp();
                

            if (interaction.replied || interaction.deferred) {
                await interaction.editReply({ embeds: [errorEmbed] });
            } else {
                await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
            }
        }
    }
}

async function handleNotifications(interaction, telegramIntegration, guildId) {
    const config = telegramIntegration.loadConfig();
    
    if (!config.guilds[guildId]) {
        return interaction.reply({
            content: '❌ Aucune configuration Telegram trouvée pour ce serveur.',
            ephemeral: true
        });
    }

    const moderation = interaction.options.getBoolean('moderation');
    const raids = interaction.options.getBoolean('raids');
    const dox = interaction.options.getBoolean('dox');
    const status = interaction.options.getBoolean('status');
    const stats = interaction.options.getBoolean('stats');

    // Update notification types
    const notificationTypes = config.guilds[guildId].notificationTypes || {};
    
    if (moderation !== null) notificationTypes.moderation = moderation;
    if (raids !== null) notificationTypes.raids = raids;
    if (dox !== null) notificationTypes.dox = dox;
    if (status !== null) notificationTypes.status = status;
    if (stats !== null) notificationTypes.stats = stats;

    config.guilds[guildId].notificationTypes = notificationTypes;
    const success = telegramIntegration.saveConfig(config);

    if (success) {
        const embed = new EmbedBuilder()
            .setColor('#00ff00')
            .setTitle('📢 Configuration des Notifications')
            .setDescription('Les types de notifications ont été mis à jour.')
            .addFields(
                { name: '🛡️ Modération', value: notificationTypes.moderation ? '✅ Activé' : '❌ Désactivé', inline: true },
                { name: '🚨 Raids', value: notificationTypes.raids ? '✅ Activé' : '❌ Désactivé', inline: true },
                { name: '🔒 Dox', value: notificationTypes.dox ? '✅ Activé' : '❌ Désactivé', inline: true },
                { name: 'ℹ️ Status', value: notificationTypes.status ? '✅ Activé' : '❌ Désactivé', inline: true },
                { name: '📊 Statistiques', value: notificationTypes.stats ? '✅ Activé' : '❌ Désactivé', inline: true }
            )
            .setFooter({ text: 'Les changements prennent effet immédiatement' })
            .setTimestamp();

        await interaction.reply({ embeds: [embed] });
    } else {
        await interaction.reply({
            content: '❌ Erreur lors de la mise à jour des notifications.',
            ephemeral: true
        });
    }
}

async function handleReset(interaction, telegramIntegration, guildId) {
    // Defer reply as this might take some time
    await interaction.deferReply();

    const config = telegramIntegration.loadConfig();
    
    if (!config.guilds[guildId]) {
        return interaction.editReply({
            content: '❌ Aucune configuration Telegram trouvée pour ce serveur.'
        });
    }

    // Backup current config
    const backupConfig = { ...config.guilds[guildId] };
    
    // Reset configuration
    delete config.guilds[guildId];
    const success = telegramIntegration.saveConfig(config);

    if (success) {
        const embed = new EmbedBuilder()
            .setColor('#ff0000')
            .setTitle('🔄 Configuration Réinitialisée')
            .setDescription('La configuration Telegram a été complètement réinitialisée pour ce serveur.')
            .addFields(
                { name: '📊 Status', value: 'Configuration supprimée' },
                { name: '📢 Notifications', value: 'Arrêtées' },
                { name: '🌉 Bridge', value: 'Arrêté' },
                { name: '💾 Sauvegarde', value: 'Configuration précédente sauvegardée dans les logs' },
                { name: '🔄 Prochaine Étape', value: 'Utilisez `/set-telegram-notification-channel` pour reconfigurer' }
            )
            .setTimestamp();

        await interaction.editReply({ embeds: [embed] });

        // Log the reset action
        console.log(`Telegram configuration reset for guild ${guildId} by ${interaction.user.tag}`);
        console.log('Backup config:', JSON.stringify(backupConfig, null, 2));
    } else {
        await interaction.editReply({
            content: '❌ Erreur lors de la réinitialisation de la configuration.'
        });
    }
}