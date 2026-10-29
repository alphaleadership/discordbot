import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

export default {
    data: new SlashCommandBuilder()
        .setName('reload')
        .setDescription('Recharger les commandes et composants du système (Admin uniquement)')
        .addSubcommand(subcommand =>
            subcommand
                .setName('component')
                .setDescription('Recharger un composant ou une commande spécifique')
                .addStringOption(option =>
                    option.setName('component')
                        .setDescription('Composant spécifique à recharger')
                        .setRequired(false)
                        .addChoices(
                            { name: 'Toutes les commandes', value: 'commands' },
                            { name: 'Gestionnaire d\'admins', value: 'adminManager' },
                            { name: 'Configuration des serveurs', value: 'guildConfig' },
                            { name: 'Gestionnaire de rapports', value: 'reportManager' },
                            { name: 'Gestionnaire de banlist', value: 'banlistManager' },
                            { name: 'Gestionnaire de mots bloqués', value: 'blockedWordsManager' },
                            { name: 'Gestionnaire de watchlist', value: 'watchlistManager' },
                            { name: 'Intégration Telegram', value: 'telegramIntegration' },
                            { name: 'Commandes amusantes', value: 'funCommandsManager' },
                            { name: 'Tout recharger', value: 'all' }
                        )
                )
                .addStringOption(option =>
                    option.setName('commande')
                        .setDescription('Nom de la commande spécifique à recharger (optionnel)')
                        .setRequired(false)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('health')
                .setDescription('Vérification complète de la santé du système')
                .addBooleanOption(option =>
                    option.setName('detailed')
                        .setDescription('Afficher les détails complets de chaque composant')
                        .setRequired(false)
                )
                .addBooleanOption(option =>
                    option.setName('fix-issues')
                        .setDescription('Tenter de corriger automatiquement les problèmes détectés')
                        .setRequired(false)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('rollback')
                .setDescription('Effectuer un rollback du système')
                .addBooleanOption(option =>
                    option.setName('confirm')
                        .setDescription('Confirmer l\'opération de rollback')
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option.setName('components')
                        .setDescription('Composants spécifiques à restaurer (séparés par des virgules)')
                        .setRequired(false)
                )
                .addBooleanOption(option =>
                    option.setName('emergency')
                        .setDescription('Mode de récupération d\'urgence')
                        .setRequired(false)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('status')
                .setDescription('Afficher le statut du système de rechargement')
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
                )
        ),

    async execute(interaction, adminManager, warnManager, guildConfig, sharedConfig, backupToGitHub, reportManager, banlistManager, blockedWordsManager, watchlistManager, telegramIntegration, funCommandsManager, raidDetector, doxDetector, enhancedReloadSystem, permissionValidator) {
        // Vérifier les permissions administrateur
        if (!adminManager.isAdmin(interaction.user.id)) {
            return interaction.reply({
                content: '❌ Seuls les administrateurs peuvent utiliser cette commande.',
                ephemeral: true
            });
        }

        const subcommand = interaction.options.getSubcommand(false) || 'component';

        if (subcommand === 'health') {
            return handleHealth(interaction, enhancedReloadSystem);
        } else if (subcommand === 'rollback') {
            return handleRollback(interaction, enhancedReloadSystem);
        } else if (subcommand === 'status') {
            return handleStatus(interaction, enhancedReloadSystem);
        } else {
            return handleReloadComponent(interaction, enhancedReloadSystem);
        }
    }
};

async function handleReloadComponent(interaction, enhancedReloadSystem) {
    const component = interaction.options.getString('component');
    const commandName = interaction.options.getString('commande');
    
    try {
        let result;
        
        if (enhancedReloadSystem) {
            await interaction.deferReply({ ephemeral: true });
            
            if (commandName) {
                await enhancedReloadSystem.reloadCommand(`${commandName}.js`);
                result = {
                    success: true,
                    reloadedComponents: [commandName],
                    duration: 0,
                    errors: []
                };
            } else if (component) {
                const componentsToReload = component === 'all' ? null : [component];
                result = await enhancedReloadSystem.hotReload(componentsToReload);
            } else {
                result = await enhancedReloadSystem.hotReload();
            }
            
            const embed = new EmbedBuilder()
                .setColor(result.success ? '#2ecc71' : '#e74c3c')
                .setTitle(result.success ? '✅ Rechargement réussi' : '❌ Rechargement échoué')
                .setDescription(result.success ? 
                    'Les composants ont été rechargés avec succès !' : 
                    'Certains composants n\'ont pas pu être rechargés.')
                .addFields(
                    { name: 'Composants rechargés', value: result.reloadedComponents.length > 0 ? result.reloadedComponents.join(', ') : 'Aucun', inline: true },
                    { name: 'Durée', value: `${result.duration}ms`, inline: true },
                    { name: 'Erreurs', value: result.errors.length.toString(), inline: true }
                );
            
            if (result.totalCommands !== undefined) {
                embed.addFields(
                    { name: 'Commandes chargées', value: result.totalCommands.toString(), inline: true }
                );
            }
            
            if (result.errors.length > 0) {
                const errorDetails = result.errors.slice(0, 3).map(err => 
                    `**${err.component}**: ${err.error}`
                ).join('\n');
                embed.addFields(
                    { name: 'Détails des erreurs', value: errorDetails }
                );
            }
            
            embed.setTimestamp();
            await interaction.editReply({ embeds: [embed] });
            
        } else {
            if (commandName) {
                const __filename = fileURLToPath(import.meta.url);
                const __dirname = path.dirname(__filename);
                const commandsPath = path.join(__dirname, '..', 'commands');
                const filePath = path.join(commandsPath, `${commandName}.js`);
                
                if (!fs.existsSync(filePath)) {
                    return interaction.reply({
                        content: `❌ Aucune commande nommée "${commandName}" n'a été trouvée.`,
                        ephemeral: true
                    });
                }
                
                const commandHandler = interaction.client.commandHandler;
                if (commandHandler.client.commands.has(commandName)) {
                    commandHandler.client.commands.delete(commandName);
                }
                
                await commandHandler.loadCommandFile(commandsPath, `${commandName}.js`);
                await commandHandler.registerCommands();
                
                result = {
                    success: true,
                    added: commandHandler.client.commands.has(commandName) ? [commandName] : [],
                    removed: [],
                    total: commandHandler.client.commands.size
                };
            } else {
                const commandHandler = interaction.client.commandHandler;
                result = await commandHandler.reloadCommands();
            }
            
            const embed = new EmbedBuilder()
                .setColor('#2ecc71')
                .setTitle('🔁 Rechargement des commandes')
                .setDescription('Les commandes ont été rechargées avec succès !')
                .addFields(
                    { name: 'Commandes chargées', value: result.total.toString(), inline: true },
                    { name: 'Nouvelles commandes', value: result.added.length > 0 ? result.added.join(', ') : 'Aucune', inline: true },
                    { name: 'Commandes supprimées', value: result.removed.length > 0 ? result.removed.join(', ') : 'Aucune', inline: true }
                )
                .setTimestamp();
                
            await interaction.reply({ embeds: [embed], ephemeral: true });
        }
        
    } catch (error) {
        console.error('Erreur lors du rechargement:', error);
        
        const errorEmbed = new EmbedBuilder()
            .setColor('#e74c3c')
            .setTitle('❌ Erreur de rechargement')
            .setDescription('Une erreur est survenue lors du rechargement.')
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
}

async function handleHealth(interaction, enhancedReloadSystem) {
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

        const healthStatus = await enhancedReloadSystem.performHealthCheck();
        const systemStatus = enhancedReloadSystem.getStatus();

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
                { name: 'Dernière vérification', value: `<t:${Math.floor(new Date(healthStatus.timestamp).getTime() / 1000)}:R>`, inline: true },
                { name: 'Métriques système', value: 
                    `**Rechargements totaux**: ${systemStatus.totalReloads}\n` +
                    `**Dernier rechargement**: ${systemStatus.lastReloadTime ? `<t:${Math.floor(new Date(systemStatus.lastReloadTime).getTime() / 1000)}:R>` : 'Aucun'}\n` +
                    `**États de rollback**: ${systemStatus.rollbackStatesAvailable}\n` +
                    `**Fichiers surveillés**: ${systemStatus.watchedFiles.length}`, inline: false }
            );

        const embeds = [mainEmbed];

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
                if (health.issue) details += `\n   └ ${health.issue}`;
                if (health.commandCount !== undefined) details += `\n   └ ${health.commandCount} commandes chargées`;
                if (health.lastReload) details += `\n   └ Dernier rechargement: ${health.lastReload}`;
                return details;
            }).join('\n\n');

            componentsEmbed.addFields(
                { name: 'État des composants', value: componentDetails || 'Aucun composant vérifié', inline: false }
            );

            embeds.push(componentsEmbed);
        }

        if (healthStatus.issues.length > 0) {
            const issuesEmbed = new EmbedBuilder()
                .setColor('#e74c3c')
                .setTitle('⚠️ Problèmes détectés')
                .setDescription(`${healthStatus.issues.length} problème(s) nécessitent votre attention`);

            const issuesList = healthStatus.issues.map((issue, index) => 
                `**${index + 1}.** ${issue.component}: ${issue.issue}`
            ).join('\n');

            issuesEmbed.addFields({ name: 'Liste des problèmes', value: issuesList, inline: false });

            const recommendations = [];
            for (const issue of healthStatus.issues) {
                switch (issue.component) {
                    case 'telegramIntegration':
                        if (issue.issue.includes('not connected')) recommendations.push('• Vérifiez la configuration Telegram avec `/telegram status`');
                        break;
                    case 'adminManager':
                        if (issue.issue.includes('No administrators')) recommendations.push('• Ajoutez des administrateurs avec les commandes appropriées');
                        break;
                    case 'guildConfig':
                        if (issue.issue.includes('No guild configurations')) recommendations.push('• Initialisez les configurations de serveur');
                        break;
                    case 'commands':
                        if (issue.issue.includes('No commands')) recommendations.push('• Rechargez les commandes avec `/reload component:commands`');
                        break;
                }
            }

            if (recommendations.length === 0) {
                recommendations.push('• Essayez un rechargement avec `/reload`');
                recommendations.push('• Vérifiez les logs du serveur pour plus de détails');
            }

            issuesEmbed.addFields({ name: 'Recommandations', value: recommendations.join('\n'), inline: false });
            embeds.push(issuesEmbed);
        }

        if (fixIssues && healthStatus.issues.length > 0) {
            const fixEmbed = new EmbedBuilder()
                .setColor('#ffa500')
                .setTitle('🔧 Tentative de correction automatique')
                .setDescription('Tentative de résolution des problèmes détectés...');

            await interaction.editReply({ embeds: [...embeds, fixEmbed] });

            const fixResults = [];
            try {
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
                
                fixEmbed.setColor('#2ecc71')
                    .setTitle('🔧 Résultats de la correction automatique')
                    .setDescription('Tentatives de correction terminées')
                    .addFields({ name: 'Résultats', value: fixResults.join('\n') || 'Aucune action effectuée', inline: false });

                const newHealthStatus = await enhancedReloadSystem.performHealthCheck();
                const resolvedIssues = healthStatus.issues.length - newHealthStatus.issues.length;
                
                if (resolvedIssues > 0) {
                    fixEmbed.addFields({ name: 'Problèmes résolus', value: `${resolvedIssues} problème(s) résolu(s)`, inline: true });
                }
            } catch (error) {
                fixEmbed.setColor('#e74c3c')
                    .setTitle('❌ Échec de la correction automatique')
                    .setDescription(`Erreur lors de la correction: ${error.message}`);
            }

            embeds[embeds.length - 1] = fixEmbed;
        }

        embeds.forEach(embed => embed.setTimestamp());
        await interaction.editReply({ embeds });

    } catch (error) {
        console.error('Erreur lors de la vérification de santé:', error);
        const errorEmbed = new EmbedBuilder()
            .setColor('#e74c3c')
            .setTitle('❌ Erreur de vérification')
            .setDescription('Une erreur est survenue lors de la vérification de santé.')
            .addFields({ name: 'Détails', value: `\`\`\`${error.message.substring(0, 1000)}\`\`\`` })
            .setTimestamp();
        
        if (interaction.deferred) {
            await interaction.editReply({ embeds: [errorEmbed] });
        } else {
            await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
        }
    }
}

async function handleRollback(interaction, enhancedReloadSystem) {
    const componentsStr = interaction.options.getString('components');
    const emergency = interaction.options.getBoolean('emergency') || false;
    const confirm = interaction.options.getBoolean('confirm');

    if (!confirm) {
        return interaction.reply({
            content: '❌ Vous devez confirmer l\'opération de rollback en définissant le paramètre `confirm` sur `true`.',
            ephemeral: true
        });
    }

    if (!enhancedReloadSystem) {
        return interaction.reply({
            content: '❌ Le système de rechargement amélioré n\'est pas disponible.',
            ephemeral: true
        });
    }

    try {
        await interaction.deferReply({ ephemeral: true });

        let result;
        const startTime = Date.now();

        if (emergency) {
            const embed = new EmbedBuilder()
                .setColor('#ff0000')
                .setTitle('🚨 Mode de récupération d\'urgence')
                .setDescription('Démarrage de la récupération d\'urgence du système...')
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
            await enhancedReloadSystem.emergencyRecovery();
            
            result = {
                success: true,
                type: 'emergency',
                duration: Date.now() - startTime
            };

        } else if (componentsStr) {
            const components = componentsStr.split(',').map(c => c.trim()).filter(c => c.length > 0);
            
            const embed = new EmbedBuilder()
                .setColor('#ffa500')
                .setTitle('🔄 Rollback sélectif')
                .setDescription(`Rollback des composants: ${components.join(', ')}`)
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
            await enhancedReloadSystem.selectiveRollback(components);
            
            result = {
                success: true,
                type: 'selective',
                components: components,
                duration: Date.now() - startTime
            };

        } else {
            const embed = new EmbedBuilder()
                .setColor('#ffa500')
                .setTitle('🔄 Rollback complet')
                .setDescription('Rollback de tous les composants vers le dernier état stable...')
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
            await enhancedReloadSystem.rollback();
            
            result = {
                success: true,
                type: 'full',
                duration: Date.now() - startTime
            };
        }

        const successEmbed = new EmbedBuilder()
            .setColor('#2ecc71')
            .setTitle('✅ Rollback réussi')
            .setDescription('Le système a été restauré avec succès.')
            .addFields(
                { name: 'Type de rollback', value: result.type === 'emergency' ? 'Récupération d\'urgence' : 
                                                  result.type === 'selective' ? 'Rollback sélectif' : 
                                                  'Rollback complet', inline: true },
                { name: 'Durée', value: `${result.duration}ms`, inline: true }
            );

        if (result.components) {
            successEmbed.addFields(
                { name: 'Composants restaurés', value: result.components.join(', '), inline: false }
            );
        }

        successEmbed.addFields(
            { name: 'Recommandations', value: 
                '• Vérifiez le statut avec `/reload status`\n' +
                '• Testez les fonctionnalités critiques\n' +
                '• Surveillez les logs pour d\'éventuelles erreurs', inline: false }
        );

        successEmbed.setTimestamp();
        await interaction.editReply({ embeds: [successEmbed] });

    } catch (error) {
        console.error('Erreur lors du rollback:', error);
        
        const errorEmbed = new EmbedBuilder()
            .setColor('#e74c3c')
            .setTitle('❌ Échec du rollback')
            .setDescription('Une erreur est survenue lors du rollback.')
            .addFields(
                { name: 'Détails de l\'erreur', value: `\`\`\`${error.message.substring(0, 1000)}\`\`\`` },
                { name: '⚠️ Actions recommandées', value: 
                    '• Essayez un rollback d\'urgence avec `emergency: true`\n' +
                    '• Contactez l\'administrateur système\n' +
                    '• Vérifiez les logs du serveur', inline: false }
            )
            .setTimestamp();

        await interaction.editReply({ embeds: [errorEmbed] });
    }
}

async function handleStatus(interaction, enhancedReloadSystem) {
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

        const status = enhancedReloadSystem.getStatus();
        
        let healthStatus = null;
        if (performHealthCheck) {
            healthStatus = await enhancedReloadSystem.performHealthCheck();
        }

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

        if (showHistory) {
            const history = enhancedReloadSystem.getHistory(10);
            
            if (history.length > 0) {
                const historyEmbed = new EmbedBuilder()
                    .setColor('#3498db')
                    .setTitle('📊 Historique des rechargements')
                    .setDescription('Les 10 derniers rechargements');

                const historyText = history.map(reload => {
                    const timestamp = new Date(reload.timestamp);
                    const relStatus = reload.success ? '✅' : '❌';
                    const components = reload.reloadedComponents.slice(0, 3).join(', ');
                    const moreComponents = reload.reloadedComponents.length > 3 ? 
                        ` (+${reload.reloadedComponents.length - 3})` : '';
                    
                    return `${relStatus} <t:${Math.floor(timestamp.getTime() / 1000)}:t> - ${components}${moreComponents} (${reload.duration}ms)`;
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
}
