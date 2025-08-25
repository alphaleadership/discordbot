import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';

export default {
    data: new SlashCommandBuilder()
        .setName('reload-status')
        .setDescription('Afficher le statut du système de rechargement (Admin uniquement)')
        .addBooleanOption(option =>
            option.setName('detailed')
                .setDescription('Afficher les détails complets du système')
                .setRequired(false)
        )
        .addBooleanOption(option =>
            option.setName('history')
                .setDescription('Afficher l\'historique des rechargements')
                .setRequired(false)
        )
        .addBooleanOption(option =>
            option.setName('health')
                .setDescription('Effectuer une vérification de santé des composants')
                .setRequired(false)
        ),
    async execute(interaction, adminManager, warnManager, guildConfig, sharedConfig, backupToGitHub, reportManager, banlistManager, blockedWordsManager, watchlistManager, telegramIntegration, funCommandsManager, enhancedReloadSystem) {
        // Vérifier les permissions administrateur
        if (!adminManager.isAdmin(interaction.user.id)) {
            return interaction.reply({
                content: '❌ Seuls les administrateurs peuvent utiliser cette commande.',
                ephemeral: true
            });
        }

        const detailed = interaction.options.getBoolean('detailed') || false;
        const showHistory = interaction.options.getBoolean('history') || false;
        const performHealthCheck = interaction.options.getBoolean('health') || false;

        try {
            await interaction.deferReply({ ephemeral: true });

            if (!enhancedReloadSystem) {
                const embed = new EmbedBuilder()
                    .setColor('#ffa500')
                    .setTitle('⚠️ Système de rechargement basique')
                    .setDescription('Le système de rechargement amélioré n\'est pas disponible.')
                    .addFields(
                        { name: 'Commandes chargées', value: interaction.client.commands.size.toString(), inline: true },
                        { name: 'Statut', value: 'Système basique actif', inline: true }
                    )
                    .setTimestamp();

                return interaction.editReply({ embeds: [embed] });
            }

            // Get system status
            const status = enhancedReloadSystem.getStatus();
            
            // Perform health check if requested
            let healthStatus = null;
            if (performHealthCheck) {
                healthStatus = await enhancedReloadSystem.performHealthCheck();
            }

            // Create main status embed
            const embed = new EmbedBuilder()
                .setColor(status.reloadInProgress ? '#ffa500' : '#2ecc71')
                .setTitle('🔄 Statut du système de rechargement')
                .setDescription(status.reloadInProgress ? 
                    '⏳ Rechargement en cours...' : 
                    '✅ Système opérationnel')
                .addFields(
                    { name: 'Dernier rechargement', value: status.lastReloadTime ? 
                        `<t:${Math.floor(new Date(status.lastReloadTime).getTime() / 1000)}:R>` : 
                        'Aucun', inline: true },
                    { name: 'Total des rechargements', value: status.totalReloads.toString(), inline: true },
                    { name: 'États de rollback', value: status.rollbackStatesAvailable.toString(), inline: true }
                );

            // Add last reload details if available
            if (status.lastReload) {
                const lastReload = status.lastReload;
                embed.addFields(
                    { name: 'Dernier rechargement', value: 
                        `**Succès**: ${lastReload.success ? '✅' : '❌'}\n` +
                        `**Durée**: ${lastReload.duration}ms\n` +
                        `**Composants**: ${lastReload.components.join(', ') || 'Aucun'}\n` +
                        `**Erreurs**: ${lastReload.errors.length}`, inline: false }
                );
            }

            // Add health status if requested
            if (healthStatus) {
                const healthEmoji = {
                    'healthy': '✅',
                    'degraded': '⚠️',
                    'unhealthy': '❌'
                };

                embed.addFields(
                    { name: 'État de santé global', value: 
                        `${healthEmoji[healthStatus.overall]} ${healthStatus.overall.toUpperCase()}`, inline: true }
                );

                if (healthStatus.issues.length > 0) {
                    const issues = healthStatus.issues.slice(0, 5).map(issue => 
                        `**${issue.component}**: ${issue.issue}`
                    ).join('\n');
                    embed.addFields(
                        { name: 'Problèmes détectés', value: issues, inline: false }
                    );
                }
            }

            // Add detailed information if requested
            if (detailed) {
                embed.addFields(
                    { name: 'Ordre de rechargement', value: 
                        status.reloadOrder.join(' → '), inline: false },
                    { name: 'Fichiers surveillés', value: 
                        status.watchedFiles.length > 0 ? 
                        status.watchedFiles.slice(0, 10).map(f => `\`${f.split('/').pop()}\``).join(', ') + 
                        (status.watchedFiles.length > 10 ? `\n... et ${status.watchedFiles.length - 10} autres` : '') :
                        'Aucun', inline: false }
                );
            }

            embed.setTimestamp();
            const embeds = [embed];

            // Add history embed if requested
            if (showHistory) {
                const history = enhancedReloadSystem.getHistory(10);
                
                if (history.length > 0) {
                    const historyEmbed = new EmbedBuilder()
                        .setColor('#3498db')
                        .setTitle('📊 Historique des rechargements')
                        .setDescription('Les 10 derniers rechargements');

                    const historyText = history.map((reload, index) => {
                        const timestamp = new Date(reload.timestamp);
                        const status = reload.success ? '✅' : '❌';
                        const components = reload.reloadedComponents.slice(0, 3).join(', ');
                        const moreComponents = reload.reloadedComponents.length > 3 ? 
                            ` (+${reload.reloadedComponents.length - 3})` : '';
                        
                        return `${status} <t:${Math.floor(timestamp.getTime() / 1000)}:t> - ${components}${moreComponents} (${reload.duration}ms)`;
                    }).join('\n');

                    historyEmbed.addFields(
                        { name: 'Historique', value: historyText || 'Aucun historique disponible', inline: false }
                    );

                    embeds.push(historyEmbed);
                } else {
                    const historyEmbed = new EmbedBuilder()
                        .setColor('#95a5a6')
                        .setTitle('📊 Historique des rechargements')
                        .setDescription('Aucun historique de rechargement disponible.');
                    
                    embeds.push(historyEmbed);
                }
            }

            // Add component health details if health check was performed
            if (performHealthCheck && healthStatus) {
                const healthEmbed = new EmbedBuilder()
                    .setColor(healthStatus.overall === 'healthy' ? '#2ecc71' : 
                             healthStatus.overall === 'degraded' ? '#ffa500' : '#e74c3c')
                    .setTitle('🏥 Vérification de santé des composants')
                    .setDescription(`Vérification effectuée à <t:${Math.floor(new Date(healthStatus.timestamp).getTime() / 1000)}:t>`);

                const componentsList = Object.entries(healthStatus.components).map(([name, health]) => {
                    const statusEmoji = {
                        'healthy': '✅',
                        'warning': '⚠️',
                        'error': '❌'
                    };
                    
                    const statusText = `${statusEmoji[health.status] || '❓'} **${name}**`;
                    const issueText = health.issue ? ` - ${health.issue}` : '';
                    const commandCount = health.commandCount !== undefined ? ` (${health.commandCount} commandes)` : '';
                    
                    return statusText + issueText + commandCount;
                }).join('\n');

                healthEmbed.addFields(
                    { name: 'État des composants', value: componentsList || 'Aucun composant vérifié', inline: false }
                );

                embeds.push(healthEmbed);
            }

            await interaction.editReply({ embeds });

        } catch (error) {
            console.error('Erreur lors de la récupération du statut de rechargement:', error);
            
            const errorEmbed = new EmbedBuilder()
                .setColor('#e74c3c')
                .setTitle('❌ Erreur')
                .setDescription('Une erreur est survenue lors de la récupération du statut.')
                .addFields(
                    { name: 'Détails', value: `\`\`\`${error.message.substring(0, 1000)}\`\`\`` }
                )
                .setTimestamp();

            if (interaction.deferred) {
                await interaction.editReply({ embeds: [errorEmbed] });
            } else {
                await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
            }
        }
    },
};