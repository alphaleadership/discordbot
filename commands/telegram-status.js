import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';

export default {
    data: new SlashCommandBuilder()
        .setName('telegram-status')
        .setDescription('Check Telegram integration status and configuration'),
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
        const embed = new EmbedBuilder()
            .setColor('#ff0000')
            .setTitle('❌ Intégration Telegram Indisponible')
            .setDescription('L\'intégration Telegram n\'est pas configurée ou activée.')
            .addFields(
                { name: 'Status', value: '🔴 Désactivé' },
                { name: 'Raison', value: 'Token Telegram manquant ou invalide' },
                { name: 'Solution', value: 'Configurez la variable d\'environnement TELEGRAM_BOT_TOKEN' }
            )
            .setTimestamp();

        return interaction.reply({ embeds: [embed], ephemeral: true });
    }

    try {
        const guildId = interaction.guild.id;
        const status = telegramIntegration.getStatus();
        const config = telegramIntegration.loadConfig();
        const guildConfig = config.guilds[guildId];

        const embed = new EmbedBuilder()
            .setColor(status.connected ? '#00ff00' : '#ff0000')
            .setTitle('📱 Status Intégration Telegram')
            .setDescription(status.connected ? 
                'L\'intégration Telegram est opérationnelle.' : 
                'L\'intégration Telegram rencontre des problèmes.')
            .addFields(
                { 
                    name: '🔗 Connexion', 
                    value: status.connected ? '✅ Connecté' : '❌ Déconnecté', 
                    inline: true 
                },
                { 
                    name: '🤖 Bot', 
                    value: status.botInfo, 
                    inline: true 
                },
                { 
                    name: '📊 File d\'attente', 
                    value: `${status.queueSize} messages`, 
                    inline: true 
                },
                { 
                    name: '⚡ Rate Limit', 
                    value: `${status.rateLimitRemaining}/30 disponible`, 
                    inline: true 
                }
            );

        // Add guild-specific configuration if available
        if (guildConfig) {
            embed.addFields(
                { name: '\u200B', value: '\u200B' }, // Empty field for spacing
                { 
                    name: '📺 Canal Telegram', 
                    value: guildConfig.telegramChannelId || 'Non configuré', 
                    inline: true 
                },
                { 
                    name: '🏠 Canal Discord', 
                    value: guildConfig.discordChannelId ? `<#${guildConfig.discordChannelId}>` : 'Non configuré', 
                    inline: true 
                },
                { 
                    name: '🔄 Bridge Activé', 
                    value: guildConfig.bridgeEnabled ? '✅' : '❌', 
                    inline: true 
                }
            );

            // Notification types
            const notificationTypes = guildConfig.notificationTypes || {};
            const notificationStatus = Object.entries(notificationTypes)
                .map(([type, enabled]) => `${enabled ? '✅' : '❌'} ${type.charAt(0).toUpperCase() + type.slice(1)}`)
                .join('\n');

            embed.addFields(
                { name: '📢 Types de Notifications', value: notificationStatus || 'Aucune configuration', inline: false }
            );

            if (guildConfig.lastConfigured) {
                embed.addFields(
                    { 
                        name: '⏰ Dernière Configuration', 
                        value: new Date(guildConfig.lastConfigured).toLocaleString('fr-FR'), 
                        inline: false 
                    }
                );
            }
        } else {
            embed.addFields(
                { name: '⚠️ Configuration', value: 'Aucune configuration trouvée pour ce serveur', inline: false },
                { name: '💡 Suggestion', value: 'Utilisez `/set-telegram-notification-channel` pour configurer', inline: false }
            );
        }

        // Add troubleshooting info if there are issues
        if (!status.connected || status.queueSize > 0) {
            let troubleshooting = '';
            if (!status.connected) {
                troubleshooting += '• Vérifiez le token du bot Telegram\n';
                troubleshooting += '• Assurez-vous que le bot est démarré\n';
            }
            if (status.queueSize > 0) {
                troubleshooting += `• ${status.queueSize} messages en attente de livraison\n`;
                troubleshooting += '• Vérifiez la connectivité réseau\n';
            }
            
            embed.addFields(
                { name: '🔧 Dépannage', value: troubleshooting, inline: false }
            );
        }

        embed.setFooter({ 
            text: 'Utilisez /telegram-test pour tester la connexion' 
        }).setTimestamp();

        await interaction.reply({ embeds: [embed] });

    } catch (error) {
        console.error('Error checking Telegram status:', error);
        
        const errorEmbed = new EmbedBuilder()
            .setColor('#ff0000')
            .setTitle('❌ Erreur de Status')
            .setDescription('Impossible de récupérer le status de l\'intégration Telegram.')
            .addFields(
                { name: 'Erreur', value: error.message || 'Erreur inconnue' }
            )
            .setTimestamp();

        await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
    }
}
};