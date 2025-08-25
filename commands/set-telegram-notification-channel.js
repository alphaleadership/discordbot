import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';

const command = {
    data: new SlashCommandBuilder()
        .setName('telegram-notify')
        .setDescription('Configure Telegram channel for Discord notifications')
        .addStringOption(option =>
            option.setName('channel_id')
                .setDescription('Telegram channel ID (e.g., @channelname or -1001234567890)')
                .setRequired(true))
        .addBooleanOption(option =>
            option.setName('moderation')
                .setDescription('Enable moderation notifications')
                .setRequired(false))
        .addBooleanOption(option =>
            option.setName('raids')
                .setDescription('Enable raid detection notifications')
                .setRequired(false))
        .addBooleanOption(option =>
            option.setName('dox')
                .setDescription('Enable dox detection notifications')
                .setRequired(false))
        .addBooleanOption(option =>
            option.setName('status')
                .setDescription('Enable bot status notifications')
                .setRequired(false)),
    
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

        const channelId = interaction.options.getString('channel_id');
        const guildId = interaction.guild.id;
        
        // Get notification type preferences
        const notificationTypes = {
            moderation: interaction.options.getBoolean('moderation') ?? true,
            raids: interaction.options.getBoolean('raids') ?? true,
            dox: interaction.options.getBoolean('dox') ?? true,
            status: interaction.options.getBoolean('status') ?? true,
            stats: false // Default to false for stats
        };

        try {
            // Configure the Telegram channel
            const success = telegramIntegration.configureGuildChannel(guildId, channelId);
            
            if (!success) {
                return interaction.reply({
                    content: '❌ Erreur lors de la configuration du canal Telegram.',
                    ephemeral: true
                });
            }

            // Update notification preferences
            const config = telegramIntegration.loadConfig();
            if (config.guilds[guildId]) {
                config.guilds[guildId].notificationTypes = notificationTypes;
                telegramIntegration.saveConfig(config);
            }

            // Test the connection
            const testResult = await telegramIntegration.testMessage(guildId, 'Configuration Telegram réussie ! 🎉');
            
            const embed = new EmbedBuilder()
                .setColor(testResult ? '#00ff00' : '#ffaa00')
                .setTitle('📱 Configuration Telegram')
                .setDescription(testResult ? 
                    'Canal Telegram configuré avec succès !' : 
                    'Canal configuré, mais le test d\'envoi a échoué.')
                .addFields(
                    { name: '📺 Canal Telegram', value: channelId, inline: true },
                    { name: '🏠 Serveur Discord', value: interaction.guild.name, inline: true },
                    { name: '📊 Status', value: testResult ? '✅ Connecté' : '⚠️ Problème de connexion', inline: true },
                    { name: '🛡️ Modération', value: notificationTypes.moderation ? '✅' : '❌', inline: true },
                    { name: '🚨 Raids', value: notificationTypes.raids ? '✅' : '❌', inline: true },
                    { name: '🔒 Dox', value: notificationTypes.dox ? '✅' : '❌', inline: true },
                    { name: 'ℹ️ Status', value: notificationTypes.status ? '✅' : '❌', inline: true }
                )
                .setFooter({ text: 'Utilisez /telegram-test pour tester la connexion' })
                .setTimestamp();

            await interaction.reply({ embeds: [embed] });

            // Send a notification to Telegram about the configuration
            if (testResult) {
                await telegramIntegration.sendNotification(guildId, {
                    status: 'Configuration Updated',
                    message: `Telegram notifications configured for Discord server: ${interaction.guild.name}`,
                    configurator: interaction.user.tag,
                    notificationTypes: Object.entries(notificationTypes)
                        .filter(([key, value]) => value)
                        .map(([key]) => key)
                        .join(', ')
                }, 'normal', 'status');
            }
        } catch (error) {
            console.error('Error configuring Telegram channel:', error);
            
            const errorEmbed = new EmbedBuilder()
                .setColor('#ff0000')
                .setTitle('❌ Erreur de Configuration')
                .setDescription('Une erreur est survenue lors de la configuration du canal Telegram.')
                .addFields(
                    { name: 'Erreur', value: error.message || 'Erreur inconnue' },
                    { name: 'Canal', value: channelId },
                    { name: 'Suggestions', value: '• Vérifiez que l\'ID du canal est correct\n• Assurez-vous que le bot Telegram est ajouté au canal\n• Vérifiez les permissions du bot' }
                )
                .setTimestamp();

            await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
        }
    }
};

export default command;