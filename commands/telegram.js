import { SlashCommandBuilder, EmbedBuilder, ChannelType } from 'discord.js';

export default {
    data: new SlashCommandBuilder()
        .setName('telegram')
        .setDescription('Gestion et configuration de l\'intégration Telegram')
        .addSubcommand(sub =>
            sub.setName('status')
                .setDescription('Vérifier le statut et la configuration de l\'intégration Telegram')
        )
        .addSubcommand(sub =>
            sub.setName('config')
                .setDescription('Gérer la configuration Telegram')
                .addStringOption(opt =>
                    opt.setName('action')
                        .setDescription('Action à effectuer')
                        .setRequired(true)
                        .addChoices(
                            { name: 'Afficher la configuration', value: 'show' },
                            { name: 'Activer l\'intégration', value: 'enable' },
                            { name: 'Désactiver l\'intégration', value: 'disable' },
                            { name: 'Réinitialiser la configuration', value: 'reset' }
                        )
                )
        )
        .addSubcommand(sub =>
            sub.setName('notifications')
                .setDescription('Configurer les types de notifications envoyées vers Telegram')
                .addBooleanOption(opt => opt.setName('moderation').setDescription('Notifications de modération'))
                .addBooleanOption(opt => opt.setName('raids').setDescription('Notifications de détection de raids'))
                .addBooleanOption(opt => opt.setName('dox').setDescription('Notifications de détection de dox'))
                .addBooleanOption(opt => opt.setName('status').setDescription('Notifications d\'état du bot'))
                .addBooleanOption(opt => opt.setName('stats').setDescription('Notifications de statistiques'))
        )
        .addSubcommand(sub =>
            sub.setName('notify')
                .setDescription('Configurer le canal Telegram pour les notifications Discord')
                .addStringOption(opt =>
                    opt.setName('channel_id')
                        .setDescription('ID ou nom du canal Telegram (@nom ou -100xxx)')
                        .setRequired(true)
                )
                .addBooleanOption(opt => opt.setName('moderation').setDescription('Activer les alertes modération'))
                .addBooleanOption(opt => opt.setName('raids').setDescription('Activer les alertes raid'))
                .addBooleanOption(opt => opt.setName('dox').setDescription('Activer les alertes dox'))
                .addBooleanOption(opt => opt.setName('status').setDescription('Activer les alertes statut'))
        )
        .addSubcommand(sub =>
            sub.setName('bridge')
                .setDescription('Configurer le pont bidirectionnel entre Discord et Telegram')
                .addStringOption(opt =>
                    opt.setName('telegram_channel_id')
                        .setDescription('ID du canal Telegram (ex: @canal ou -100xxx)')
                        .setRequired(true)
                )
                .addChannelOption(opt =>
                    opt.setName('discord_channel')
                        .setDescription('Salon textuel Discord pour la passerelle')
                        .setRequired(true)
                        .addChannelTypes(ChannelType.GuildText)
                )
                .addBooleanOption(opt =>
                    opt.setName('enable_notifications')
                        .setDescription('Activer également les notifications Discord vers Telegram')
                )
        )
        .addSubcommand(sub =>
            sub.setName('test')
                .setDescription('Tester la transmission des messages vers Telegram')
                .addStringOption(opt =>
                    opt.setName('message')
                        .setDescription('Message personnalisé à envoyer')
                )
        ),

    async execute(interaction, adminManager, warnManager, guildConfig, sharedConfig, backupToGitHub, reportManager, banlistManager, blockedWordsManager, watchlistManager, telegramIntegration) {
        const isAdmin = await adminManager.isAdmin(interaction.user.id);
        if (!isAdmin) {
            return interaction.reply({
                content: '❌ Vous devez être administrateur pour utiliser cette commande.',
                ephemeral: true
            });
        }

        if (!telegramIntegration) {
            const embed = new EmbedBuilder()
                .setColor('#ff0000')
                .setTitle('❌ Intégration Telegram Indisponible')
                .setDescription('L\'intégration Telegram n\'est pas configurée ou le jeton est manquant.')
                .setTimestamp();
            return interaction.reply({ embeds: [embed], ephemeral: true });
        }

        const subcommand = interaction.options.getSubcommand();
        const guildId = interaction.guild.id;

        switch (subcommand) {
            case 'status':
                return handleStatus(interaction, telegramIntegration, guildId);
            case 'config':
                return handleConfig(interaction, telegramIntegration, guildId);
            case 'notifications':
                return handleNotifications(interaction, telegramIntegration, guildId);
            case 'notify':
                return handleNotify(interaction, telegramIntegration, guildId);
            case 'bridge':
                return handleBridge(interaction, telegramIntegration, guildId);
            case 'test':
                return handleTest(interaction, telegramIntegration, guildId, reportManager);
            default:
                return interaction.reply({ content: '❌ Sous-commande non reconnue.', ephemeral: true });
        }
    }
};

async function handleStatus(interaction, telegramIntegration, guildId) {
    try {
        const status = telegramIntegration.getStatus();
        const config = telegramIntegration.loadConfig();
        const guildConf = config.guilds[guildId];

        const embed = new EmbedBuilder()
            .setColor(status.connected ? '#00ff00' : '#ff0000')
            .setTitle('📱 Status Intégration Telegram')
            .setDescription(status.connected ? 
                'L\'intégration Telegram est opérationnelle.' : 
                'L\'intégration Telegram rencontre des problèmes.')
            .addFields(
                { name: '🔗 Connexion', value: status.connected ? '✅ Connecté' : '❌ Déconnecté', inline: true },
                { name: '📊 File d\'Attente', value: `${status.queueSize} messages`, inline: true },
                { name: '⚡ Rate Limit', value: `${status.rateLimitRemaining}/30 disponible`, inline: true }
            );

        if (guildConf) {
            embed.addFields(
                { name: '📺 Canal Telegram', value: guildConf.telegramChannelId || 'Non configuré', inline: true },
                { name: '💬 Canal Discord', value: guildConf.discordChannelId ? `<#${guildConf.discordChannelId}>` : 'Non configuré', inline: true },
                { name: '🌉 Bridge', value: guildConf.bridgeEnabled ? '✅ Activé' : '❌ Désactivé', inline: true }
            );
        } else {
            embed.addFields(
                { name: '⚠️ Configuration', value: 'Aucune configuration pour ce serveur. Utilisez `/telegram notify`.', inline: false }
            );
        }

        embed.setTimestamp();
        await interaction.reply({ embeds: [embed], ephemeral: true });
    } catch (error) {
        console.error('Error in telegram status:', error);
        await interaction.reply({ content: `❌ Erreur: ${error.message}`, ephemeral: true });
    }
}

async function handleConfig(interaction, telegramIntegration, guildId) {
    const action = interaction.options.getString('action');
    const config = telegramIntegration.loadConfig();
    const guildConf = config.guilds[guildId];

    if (action === 'show') {
        const status = telegramIntegration.getStatus();
        const embed = new EmbedBuilder()
            .setColor(guildConf?.enabled ? '#00ff00' : '#ff0000')
            .setTitle('📱 Configuration Telegram')
            .setDescription('Configuration actuelle de l\'intégration Telegram pour ce serveur');

        if (guildConf) {
            const notificationTypes = guildConf.notificationTypes || {};
            const notificationStatus = Object.entries(notificationTypes)
                .map(([type, enabled]) => `${enabled ? '✅' : '❌'} ${type.charAt(0).toUpperCase() + type.slice(1)}`)
                .join('\n') || 'Aucune';

            embed.addFields(
                { name: '🔗 Status', value: guildConf.enabled ? '✅ Activé' : '❌ Désactivé', inline: true },
                { name: '📺 Canal Telegram', value: guildConf.telegramChannelId || 'Non configuré', inline: true },
                { name: '💬 Canal Discord', value: guildConf.discordChannelId ? `<#${guildConf.discordChannelId}>` : 'Non configuré', inline: true },
                { name: '🌉 Bridge', value: guildConf.bridgeEnabled ? '✅ Activé' : '❌ Désactivé', inline: true },
                { name: '📢 Notifications', value: notificationStatus, inline: false }
            );
        } else {
            embed.addFields({ name: '⚠️ Info', value: 'Aucune configuration trouvée. Utilisez `/telegram notify`.' });
        }
        return interaction.reply({ embeds: [embed] });
    }

    if (action === 'disable') {
        if (!guildConf) {
            return interaction.reply({ content: '❌ Aucune configuration Telegram trouvée.', ephemeral: true });
        }
        guildConf.enabled = false;
        telegramIntegration.saveConfig(config);
        return interaction.reply({ content: '✅ Intégration Telegram désactivée pour ce serveur.' });
    }

    if (action === 'enable') {
        if (!guildConf || !guildConf.telegramChannelId) {
            return interaction.reply({ content: '❌ Aucune configuration trouvée. Utilisez `/telegram notify` d\'abord.', ephemeral: true });
        }
        guildConf.enabled = true;
        telegramIntegration.saveConfig(config);
        return interaction.reply({ content: '✅ Intégration Telegram activée pour ce serveur.' });
    }

    if (action === 'reset') {
        if (!guildConf) {
            return interaction.reply({ content: '❌ Aucune configuration à réinitialiser.', ephemeral: true });
        }
        delete config.guilds[guildId];
        telegramIntegration.saveConfig(config);
        return interaction.reply({ content: '🔄 Configuration Telegram réinitialisée avec succès.' });
    }
}

async function handleNotifications(interaction, telegramIntegration, guildId) {
    const config = telegramIntegration.loadConfig();
    if (!config.guilds[guildId]) {
        return interaction.reply({ content: '❌ Aucune configuration Telegram trouvée pour ce serveur.', ephemeral: true });
    }

    const moderation = interaction.options.getBoolean('moderation');
    const raids = interaction.options.getBoolean('raids');
    const dox = interaction.options.getBoolean('dox');
    const status = interaction.options.getBoolean('status');
    const stats = interaction.options.getBoolean('stats');

    const notificationTypes = config.guilds[guildId].notificationTypes || {};
    if (moderation !== null) notificationTypes.moderation = moderation;
    if (raids !== null) notificationTypes.raids = raids;
    if (dox !== null) notificationTypes.dox = dox;
    if (status !== null) notificationTypes.status = status;
    if (stats !== null) notificationTypes.stats = stats;

    config.guilds[guildId].notificationTypes = notificationTypes;
    telegramIntegration.saveConfig(config);

    const embed = new EmbedBuilder()
        .setColor('#00ff00')
        .setTitle('📢 Notifications Telegram mises à jour')
        .addFields(
            { name: 'Modération', value: notificationTypes.moderation ? '✅' : '❌', inline: true },
            { name: 'Raids', value: notificationTypes.raids ? '✅' : '❌', inline: true },
            { name: 'Dox', value: notificationTypes.dox ? '✅' : '❌', inline: true },
            { name: 'Status', value: notificationTypes.status ? '✅' : '❌', inline: true },
            { name: 'Stats', value: notificationTypes.stats ? '✅' : '❌', inline: true }
        )
        .setTimestamp();

    return interaction.reply({ embeds: [embed] });
}

async function handleNotify(interaction, telegramIntegration, guildId) {
    const channelId = interaction.options.getString('channel_id');
    const notificationTypes = {
        moderation: interaction.options.getBoolean('moderation') ?? true,
        raids: interaction.options.getBoolean('raids') ?? true,
        dox: interaction.options.getBoolean('dox') ?? true,
        status: interaction.options.getBoolean('status') ?? true,
        stats: false
    };

    try {
        const success = telegramIntegration.configureGuildChannel(guildId, channelId);
        if (!success) {
            return interaction.reply({ content: '❌ Erreur lors de la configuration du canal Telegram.', ephemeral: true });
        }

        const config = telegramIntegration.loadConfig();
        if (config.guilds[guildId]) {
            config.guilds[guildId].notificationTypes = notificationTypes;
            telegramIntegration.saveConfig(config);
        }

        const testResult = await telegramIntegration.testMessage(guildId, 'Configuration Telegram réussie ! 🎉');

        const embed = new EmbedBuilder()
            .setColor(testResult ? '#00ff00' : '#ffaa00')
            .setTitle('📱 Canal Telegram Configuré')
            .setDescription(testResult ? 'Canal Telegram configuré avec succès !' : 'Canal configuré, mais le test a échoué.')
            .addFields(
                { name: 'Canal Telegram', value: channelId, inline: true },
                { name: 'Statut du test', value: testResult ? '✅ Réussi' : '⚠️ Échoué', inline: true }
            )
            .setTimestamp();

        return interaction.reply({ embeds: [embed] });
    } catch (err) {
        return interaction.reply({ content: `❌ Erreur: ${err.message}`, ephemeral: true });
    }
}

async function handleBridge(interaction, telegramIntegration, guildId) {
    const telegramChannelId = interaction.options.getString('telegram_channel_id');
    const discordChannel = interaction.options.getChannel('discord_channel');
    const enableNotifications = interaction.options.getBoolean('enable_notifications') ?? true;

    await interaction.deferReply();

    try {
        if (discordChannel.type !== ChannelType.GuildText) {
            return interaction.editReply({ content: '❌ Le canal Discord doit être un salon textuel.' });
        }

        const success = telegramIntegration.configureGuildChannel(guildId, telegramChannelId, discordChannel.id);
        if (!success) {
            return interaction.editReply({ content: '❌ Erreur lors de la configuration du pont Telegram.' });
        }

        const config = telegramIntegration.loadConfig();
        if (config.guilds[guildId]) {
            config.guilds[guildId].bridgeEnabled = true;
            config.guilds[guildId].discordChannelId = discordChannel.id;
            if (enableNotifications) {
                config.guilds[guildId].notificationTypes = {
                    moderation: true,
                    raids: true,
                    dox: true,
                    status: true,
                    stats: false
                };
            }
            telegramIntegration.saveConfig(config);
        }

        const testResult = await telegramIntegration.testMessage(guildId, `Bridge configuré avec #${discordChannel.name} ! 🌉`);

        const embed = new EmbedBuilder()
            .setColor(testResult ? '#00ff00' : '#ffaa00')
            .setTitle('🌉 Bridge Telegram Configuré')
            .addFields(
                { name: 'Canal Telegram', value: telegramChannelId, inline: true },
                { name: 'Salon Discord', value: `${discordChannel}`, inline: true },
                { name: 'Bridge Status', value: '✅ Activé', inline: true }
            )
            .setTimestamp();

        return interaction.editReply({ embeds: [embed] });
    } catch (err) {
        return interaction.editReply({ content: `❌ Erreur: ${err.message}` });
    }
}

async function handleTest(interaction, telegramIntegration, guildId, reportManager) {
    const customMessage = interaction.options.getString('message');
    await interaction.deferReply();

    try {
        const config = telegramIntegration.loadConfig();
        const guildConf = config.guilds[guildId];

        if (!guildConf || !guildConf.telegramChannelId) {
            return interaction.editReply({ content: '❌ Aucun canal Telegram configuré. Utilisez `/telegram notify`.' });
        }

        const testMsg = customMessage || `Test de connexion depuis ${interaction.guild.name}`;
        const startTime = Date.now();
        const success = await telegramIntegration.sendNotification(guildId, {
            status: 'Test Message',
            message: testMsg,
            tester: interaction.user.tag,
            guild: interaction.guild.name,
            timestamp: new Date().toISOString()
        }, 'normal', 'status');
        const duration = Date.now() - startTime;

        const embed = new EmbedBuilder()
            .setColor(success ? '#00ff00' : '#ff0000')
            .setTitle(success ? '✅ Test Réussi' : '❌ Test Échoué')
            .setDescription(success ? 'Message envoyé avec succès vers Telegram.' : 'Échec de l\'envoi.')
            .addFields(
                { name: 'Canal Telegram', value: guildConf.telegramChannelId, inline: true },
                { name: 'Durée', value: `${duration}ms`, inline: true }
            )
            .setTimestamp();

        return interaction.editReply({ embeds: [embed] });
    } catch (err) {
        return interaction.editReply({ content: `❌ Erreur: ${err.message}` });
    }
}
