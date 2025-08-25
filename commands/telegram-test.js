import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';

export default {
    data: new SlashCommandBuilder()
        .setName('telegram-test')
        .setDescription('Test Telegram message delivery')
        .addStringOption(option =>
            option.setName('message')
                .setDescription('Custom test message to send')
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

    const customMessage = interaction.options.getString('message');
    const guildId = interaction.guild.id;

    // Defer reply as the test might take some time
    await interaction.deferReply();

    try {
        // Check if guild has Telegram configuration
        const config = telegramIntegration.loadConfig();
        const guildConfig = config.guilds[guildId];

        if (!guildConfig || !guildConfig.telegramChannelId) {
            const embed = new EmbedBuilder()
                .setColor('#ff0000')
                .setTitle('❌ Configuration Manquante')
                .setDescription('Aucun canal Telegram configuré pour ce serveur.')
                .addFields(
                    { name: '💡 Solution', value: 'Utilisez `/set-telegram-notification-channel` pour configurer un canal' }
                )
                .setTimestamp();

            return interaction.editReply({ embeds: [embed] });
        }

        // Prepare test message
        const testMessage = customMessage || `Test de connexion depuis ${interaction.guild.name}`;
        const testData = {
            status: 'Test Message',
            message: testMessage,
            tester: interaction.user.tag,
            guild: interaction.guild.name,
            timestamp: new Date().toISOString()
        };

        // Get initial status
        const initialStatus = telegramIntegration.getStatus();
        
        // Send test message
        const startTime = Date.now();
        const success = await telegramIntegration.sendNotification(guildId, testData, 'normal', 'status');
        const endTime = Date.now();
        const responseTime = endTime - startTime;

        // Get final status
        const finalStatus = telegramIntegration.getStatus();

        // Create result embed
        const embed = new EmbedBuilder()
            .setColor(success ? '#00ff00' : '#ff0000')
            .setTitle(success ? '✅ Test Réussi' : '❌ Test Échoué')
            .setDescription(success ? 
                'Le message de test a été envoyé avec succès vers Telegram.' : 
                'Échec de l\'envoi du message de test vers Telegram.')
            .addFields(
                { name: '📺 Canal Telegram', value: guildConfig.telegramChannelId, inline: true },
                { name: '⏱️ Temps de Réponse', value: `${responseTime}ms`, inline: true },
                { name: '🔗 Connexion', value: finalStatus.connected ? '✅ Connecté' : '❌ Déconnecté', inline: true },
                { name: '📊 File d\'Attente (Avant)', value: `${initialStatus.queueSize} messages`, inline: true },
                { name: '📊 File d\'Attente (Après)', value: `${finalStatus.queueSize} messages`, inline: true },
                { name: '⚡ Rate Limit', value: `${finalStatus.rateLimitRemaining}/30 disponible`, inline: true }
            );

        if (customMessage) {
            embed.addFields(
                { name: '💬 Message Testé', value: customMessage, inline: false }
            );
        }

        // Add troubleshooting info if test failed
        if (!success) {
            let troubleshooting = '';
            if (!finalStatus.connected) {
                troubleshooting += '• Bot Telegram déconnecté\n';
            }
            if (finalStatus.queueSize > initialStatus.queueSize) {
                troubleshooting += '• Message ajouté à la file d\'attente\n';
            }
            if (finalStatus.rateLimitRemaining === 0) {
                troubleshooting += '• Limite de taux atteinte\n';
            }
            troubleshooting += '• Vérifiez que le bot Telegram est ajouté au canal\n';
            troubleshooting += '• Vérifiez les permissions du bot dans le canal\n';
            troubleshooting += '• Vérifiez l\'ID du canal Telegram\n';

            embed.addFields(
                { name: '🔧 Dépannage', value: troubleshooting, inline: false }
            );
        }

        embed.setFooter({ 
            text: success ? 'Vérifiez votre canal Telegram pour voir le message' : 'Utilisez /telegram-status pour plus d\'informations'
        }).setTimestamp();

        await interaction.editReply({ embeds: [embed] });

        // If test was successful, also send a confirmation to the report channel if configured
        if (success && reportManager) {
            try {
                await reportManager.sendReport(interaction.guild.id, {
                    title: '📱 Test Telegram Réussi',
                    description: `Test de connexion Telegram effectué par ${interaction.user.tag}`,
                    fields: [
                        { name: 'Canal Telegram', value: guildConfig.telegramChannelId },
                        { name: 'Temps de Réponse', value: `${responseTime}ms` },
                        { name: 'Message', value: testMessage }
                    ],
                    color: '#00ff00'
                });
            } catch (error) {
                // Ignore report errors, don't fail the test
                console.log('Could not send test report:', error.message);
            }
        }

    } catch (error) {
        console.error('Error during Telegram test:', error);
        
        const errorEmbed = new EmbedBuilder()
            .setColor('#ff0000')
            .setTitle('❌ Erreur de Test')
            .setDescription('Une erreur est survenue lors du test de connexion Telegram.')
            .addFields(
                { name: 'Erreur', value: error.message || 'Erreur inconnue' },
                { name: '🔧 Suggestions', value: '• Vérifiez la configuration Telegram\n• Utilisez `/telegram-status` pour diagnostiquer\n• Contactez l\'administrateur si le problème persiste' }
            )
            .setTimestamp();

        await interaction.editReply({ embeds: [errorEmbed] });
    }
}
};