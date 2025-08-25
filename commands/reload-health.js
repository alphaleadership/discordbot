import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';

export default {
    data: new SlashCommandBuilder()
        .setName('reload-health')
        .setDescription('Vérification complète de la santé du système (Admin uniquement)')
        .addBooleanOption(option =>
            option.setName('detailed')
                .setDescription('Afficher les détails complets de chaque composant')
                .setRequired(false)
        )
        .addBooleanOption(option =>
            option.setName('fix-issues')
                .setDescription('Tenter de corriger automatiquement les problèmes détectés')
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
        const fixIssues = interaction.options.getBoolean('fix-issues') || false;

        if (!enhancedReloadSystem) {
            return interaction.reply({
                content: '❌ Le système de rechargement amélioré n\'est pas disponible.',
                ephemeral: true
            });
        }

        try {
            await interaction.deferReply({ ephemeral: true });

            // Perform comprehensive health check
            const healthStatus = await enhancedReloadSystem.performHealthCheck();
            
            // Get system status
            const systemStatus = enhancedReloadSystem.getStatus();

            // Create main health embed
            const healthEmoji = {
                'healthy': '✅',
                'degraded': '⚠️',
                'unhealthy': '❌'
            };

            const mainEmbed = new EmbedBuilder()
                .setColor(healthStatus.overall === 'healthy' ? '#2ecc71' : 
                         healthStatus.overall === 'degraded' ? '#ffa500' : '#e74c3c')
                .setTitle(`🏥 Vérification de santé du système`)
                .setDescription(`**État global**: ${healthEmoji[healthStatus.overall]} ${healthStatus.overall.toUpperCase()}`)
                .addFields(
                    { name: 'Composants vérifiés', value: Object.keys(healthStatus.components).length.toString(), inline: true },
                    { name: 'Problèmes détectés', value: healthStatus.issues.length.toString(), inline: true },
                    { name: 'Dernière vérification', value: `<t:${Math.floor(new Date(healthStatus.timestamp).getTime() / 1000)}:R>`, inline: true }
                );

            // Add system metrics
            mainEmbed.addFields(
                { name: 'Métriques système', value: 
                    `**Rechargements totaux**: ${systemStatus.totalReloads}\n` +
                    `**Dernier rechargement**: ${systemStatus.lastReloadTime ? `<t:${Math.floor(new Date(systemStatus.lastReloadTime).getTime() / 1000)}:R>` : 'Aucun'}\n` +
                    `**États de rollback**: ${systemStatus.rollbackStatesAvailable}\n` +
                    `**Fichiers surveillés**: ${systemStatus.watchedFiles.length}`, inline: false }
            );

            const embeds = [mainEmbed];

            // Add component details if requested or if there are issues
            if (detailed || healthStatus.issues.length > 0) {
                const componentsEmbed = new EmbedBuilder()
                    .setColor('#3498db')
                    .setTitle('🔧 Détails des composants')
                    .setDescription('État détaillé de chaque composant du système');

                const componentDetails = Object.entries(healthStatus.components).map(([name, health]) => {
                    const statusEmoji = {
                        'healthy': '✅',
                        'warning': '⚠️',
                        'error': '❌'
                    };
                    
                    let details = `${statusEmoji[health.status] || '❓'} **${name}**`;
                    
                    if (health.issue) {
                        details += `\n   └ ${health.issue}`;
                    }
                    
                    if (health.commandCount !== undefined) {
                        details += `\n   └ ${health.commandCount} commandes chargées`;
                    }
                    
                    if (health.lastReload) {
                        details += `\n   └ Dernier rechargement: ${health.lastReload}`;
                    }
                    
                    return details;
                }).join('\n\n');

                componentsEmbed.addFields(
                    { name: 'État des composants', value: componentDetails || 'Aucun composant vérifié', inline: false }
                );

                embeds.push(componentsEmbed);
            }

            // Add issues summary if there are problems
            if (healthStatus.issues.length > 0) {
                const issuesEmbed = new EmbedBuilder()
                    .setColor('#e74c3c')
                    .setTitle('⚠️ Problèmes détectés')
                    .setDescription(`${healthStatus.issues.length} problème(s) nécessitent votre attention`);

                const issuesList = healthStatus.issues.map((issue, index) => 
                    `**${index + 1}.** ${issue.component}: ${issue.issue}`
                ).join('\n');

                issuesEmbed.addFields(
                    { name: 'Liste des problèmes', value: issuesList, inline: false }
                );

                // Add recommendations
                const recommendations = [];
                
                for (const issue of healthStatus.issues) {
                    switch (issue.component) {
                        case 'telegramIntegration':
                            if (issue.issue.includes('not connected')) {
                                recommendations.push('• Vérifiez la configuration Telegram avec `/telegram-status`');
                            }
                            break;
                        case 'adminManager':
                            if (issue.issue.includes('No administrators')) {
                                recommendations.push('• Ajoutez des administrateurs avec les commandes appropriées');
                            }
                            break;
                        case 'guildConfig':
                            if (issue.issue.includes('No guild configurations')) {
                                recommendations.push('• Initialisez les configurations de serveur');
                            }
                            break;
                        case 'commands':
                            if (issue.issue.includes('No commands')) {
                                recommendations.push('• Rechargez les commandes avec `/reload component:commands`');
                            }
                            break;
                    }
                }

                if (recommendations.length === 0) {
                    recommendations.push('• Essayez un rechargement avec `/reload`');
                    recommendations.push('• Vérifiez les logs du serveur pour plus de détails');
                }

                issuesEmbed.addFields(
                    { name: 'Recommandations', value: recommendations.join('\n'), inline: false }
                );

                embeds.push(issuesEmbed);
            }

            // Attempt to fix issues if requested
            if (fixIssues && healthStatus.issues.length > 0) {
                const fixEmbed = new EmbedBuilder()
                    .setColor('#ffa500')
                    .setTitle('🔧 Tentative de correction automatique')
                    .setDescription('Tentative de résolution des problèmes détectés...');

                await interaction.editReply({ embeds: [...embeds, fixEmbed] });

                const fixResults = [];
                
                try {
                    // Attempt to reload components with issues
                    const componentsWithIssues = healthStatus.issues.map(issue => issue.component);
                    const uniqueComponents = [...new Set(componentsWithIssues)];
                    
                    for (const component of uniqueComponents) {
                        try {
                            await enhancedReloadSystem.hotReload([component]);
                            fixResults.push(`✅ ${component}: Rechargé avec succès`);
                        } catch (error) {
                            fixResults.push(`❌ ${component}: Échec du rechargement - ${error.message}`);
                        }
                    }
                    
                    // Update fix embed with results
                    fixEmbed.setColor('#2ecc71')
                        .setTitle('🔧 Résultats de la correction automatique')
                        .setDescription('Tentatives de correction terminées')
                        .addFields(
                            { name: 'Résultats', value: fixResults.join('\n') || 'Aucune action effectuée', inline: false }
                        );

                    // Perform another health check to see if issues were resolved
                    const newHealthStatus = await enhancedReloadSystem.performHealthCheck();
                    const resolvedIssues = healthStatus.issues.length - newHealthStatus.issues.length;
                    
                    if (resolvedIssues > 0) {
                        fixEmbed.addFields(
                            { name: 'Problèmes résolus', value: `${resolvedIssues} problème(s) résolu(s)`, inline: true }
                        );
                    }
                    
                } catch (error) {
                    fixEmbed.setColor('#e74c3c')
                        .setTitle('❌ Échec de la correction automatique')
                        .setDescription(`Erreur lors de la correction: ${error.message}`);
                }

                embeds[embeds.length - 1] = fixEmbed;
            }

            // Add performance metrics
            if (detailed) {
                const perfEmbed = new EmbedBuilder()
                    .setColor('#9b59b6')
                    .setTitle('📊 Métriques de performance')
                    .setDescription('Statistiques de performance du système de rechargement');

                const reloadHistory = enhancedReloadSystem.getHistory(5);
                if (reloadHistory.length > 0) {
                    const avgDuration = reloadHistory.reduce((sum, reload) => sum + reload.duration, 0) / reloadHistory.length;
                    const successRate = (reloadHistory.filter(reload => reload.success).length / reloadHistory.length) * 100;
                    
                    perfEmbed.addFields(
                        { name: 'Durée moyenne de rechargement', value: `${Math.round(avgDuration)}ms`, inline: true },
                        { name: 'Taux de succès', value: `${Math.round(successRate)}%`, inline: true },
                        { name: 'Derniers rechargements', value: reloadHistory.length.toString(), inline: true }
                    );

                    const recentReloads = reloadHistory.slice(-3).map(reload => {
                        const status = reload.success ? '✅' : '❌';
                        const timestamp = new Date(reload.timestamp);
                        return `${status} <t:${Math.floor(timestamp.getTime() / 1000)}:t> (${reload.duration}ms)`;
                    }).join('\n');

                    perfEmbed.addFields(
                        { name: 'Historique récent', value: recentReloads || 'Aucun historique', inline: false }
                    );
                }

                embeds.push(perfEmbed);
            }

            // Set timestamp on all embeds
            embeds.forEach(embed => embed.setTimestamp());

            await interaction.editReply({ embeds });

        } catch (error) {
            console.error('Erreur lors de la vérification de santé:', error);
            
            const errorEmbed = new EmbedBuilder()
                .setColor('#e74c3c')
                .setTitle('❌ Erreur de vérification')
                .setDescription('Une erreur est survenue lors de la vérification de santé.')
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