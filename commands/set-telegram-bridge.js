import { SlashCommandBuilder, EmbedBuilder, ChannelType } from 'discord.js';

const command = {
    data: new SlashCommandBuilder()
        .setName('set-telegram-bridge')
        .setDescription('Configure bidirectional bridge between Discord and Telegram channels')
        // Required options first
        .addStringOption(option =>
            option.setName('telegram_channel_id')
                .setDescription('Telegram channel ID (e.g., @channelname or -1001234567890)')
                .setRequired(true))
        .addChannelOption(option =>
            option.setName('discord_channel')
                .setDescription('Discord channel for bidirectional communication')
                .setRequired(true)
                .addChannelTypes(ChannelType.GuildText))
        // Optional options last
        .addBooleanOption(option =>
            option.setName('enable_notifications')
                .setDescription('Also enable Discord to Telegram notifications')
                .setRequired(false)),
    
    async execute(interaction, adminManager, warnManager, guildConfig, sharedConfig, backupToGitHub, reportManager, banlistManager, blockedWordsManager, watchlistManager, telegramIntegration) {
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

        const telegramChannelId = interaction.options.getString('telegram_channel_id');
        const discordChannel = interaction.options.getChannel('discord_channel');
        const enableNotifications = interaction.options.getBoolean('enable_notifications') ?? true;
        const guildId = interaction.guild.id;

        // Defer reply as setup might take some time
        await interaction.deferReply();

        try {
            // Check if Discord channel is valid
            if (discordChannel.type !== ChannelType.GuildText) {
                return interaction.editReply({
                    content: '❌ Le canal Discord doit être un canal textuel.'
                });
            }

            // Check bot permissions in Discord channel
            const botMember = interaction.guild.members.cache.get(interaction.client.user.id);
            const permissions = discordChannel.permissionsFor(botMember);
            
            if (!permissions.has(['SendMessages', 'AttachFiles', 'EmbedLinks'])) {
                return interaction.editReply({
                    content: `❌ Le bot n'a pas les permissions nécessaires dans ${discordChannel}.\nPermissions requises: Envoyer des messages, Joindre des fichiers, Intégrer des liens.`
                });
            }

            // Configure the bridge
            const success = telegramIntegration.configureGuildChannel(
                guildId, 
                telegramChannelId, 
                discordChannel.id
            );
            
            if (!success) {
                return interaction.editReply({
                    content: '❌ Erreur lors de la configuration du bridge Telegram.'
                });
            }

            // Update configuration for bridge
            const config = telegramIntegration.loadConfig();
            if (config.guilds[guildId]) {
                config.guilds[guildId].bridgeEnabled = true;
                config.guilds[guildId].discordChannelId = discordChannel.id;
                
                // Set notification preferences if requested
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

            // Test the connection
            const testResult = await telegramIntegration.testMessage(
                guildId, 
                `Bridge configuré entre Discord (#${discordChannel.name}) et Telegram ! 🌉`
            );
            
            // Send a test message to Discord channel
            await discordChannel.send({
                content: '🌉 **Bridge Telegram configuré !**\n' +
                        'Les messages de Telegram seront maintenant transférés vers ce canal.\n' +
                        `Canal Telegram: \`${telegramChannelId}\`\n` +
                        `Configuré par: ${interaction.user}`
            });

            const embed = new EmbedBuilder()
                .setColor(testResult ? '#00ff00' : '#ffaa00')
                .setTitle('🌉 Bridge Telegram Configuré')
                .setDescription(testResult ? 
                    'Bridge bidirectionnel configuré avec succès !' : 
                    'Bridge configuré, mais le test d\'envoi vers Telegram a échoué.')
                .addFields(
                    { name: '📺 Canal Telegram', value: telegramChannelId, inline: true },
                    { name: '💬 Canal Discord', value: `${discordChannel}`, inline: true },
                    { name: '🔄 Bridge Status', value: '✅ Activé', inline: true },
                    { name: '📊 Notifications', value: enableNotifications ? '✅ Activées' : '❌ Désactivées', inline: true },
                    { name: '🔗 Connexion Telegram', value: testResult ? '✅ Connecté' : '⚠️ Problème', inline: true },
                    { name: '🛡️ Permissions Discord', value: '✅ Vérifiées', inline: true }
                )
                .addFields(
                    { 
                        name: '📋 Fonctionnalités', 
                        value: '• Messages texte bidirectionnels\n• Transfert d\'images et fichiers\n• Informations sur l\'expéditeur\n• Support des réponses et transferts', 
                        inline: false 
                    },
                    { 
                        name: '⚠️ Limitations', 
                        value: '• Fichiers limités à 8MB\n• Certains formats peuvent ne pas être supportés\n• Les messages de bots Telegram sont ignorés', 
                        inline: false 
                    }
                )
                .setFooter({ text: 'Le bridge est maintenant actif. Testez en envoyant un message depuis Telegram !' })
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });

            // Send notification to Telegram about the bridge setup
            if (testResult) {
                await telegramIntegration.sendNotification(guildId, {
                    status: 'Bridge Configured',
                    message: `Bidirectional bridge established between Telegram and Discord channel #${discordChannel.name}`,
                    configurator: interaction.user.tag,
                    discordChannel: discordChannel.name,
                    telegramChannel: telegramChannelId
                }, 'normal', 'status');
            }

        } catch (error) {
            console.error('Error configuring Telegram bridge:', error);
            
            const errorEmbed = new EmbedBuilder()
                .setColor('#ff0000')
                .setTitle('❌ Erreur de Configuration du Bridge')
                .setDescription('Une erreur est survenue lors de la configuration du bridge Telegram.')
                .addFields(
                    { name: 'Erreur', value: error.message || 'Erreur inconnue' },
                    { name: 'Canal Telegram', value: telegramChannelId },
                    { name: 'Canal Discord', value: `${discordChannel}` },
                    { 
                        name: 'Suggestions', 
                        value: '• Vérifiez que l\'ID du canal Telegram est correct\n' +
                               '• Assurez-vous que le bot Telegram est ajouté au canal\n' +
                               '• Vérifiez les permissions du bot Telegram\n' +
                               '• Utilisez `/telegram-status` pour diagnostiquer'
                    }
                )
                .setTimestamp();

            await interaction.editReply({ embeds: [errorEmbed] });
        }
    }
};

export default command;