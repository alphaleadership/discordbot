import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';

export default {
    data: new SlashCommandBuilder()
        .setName('economy-stats')
        .setDescription('View comprehensive economic statistics for the server (Admin only)')
        .addSubcommand(subcommand =>
            subcommand
                .setName('overview')
                .setDescription('View general economic overview'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('market')
                .setDescription('View detailed market analysis'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('users')
                .setDescription('View user economic statistics'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('simulate')
                .setDescription('Simulate market dynamics')
                .addIntegerOption(option =>
                    option.setName('days')
                        .setDescription('Number of days to simulate (default: 30)')
                        .setRequired(false)
                        .setMinValue(1)
                        .setMaxValue(365))),
    
    async execute(interaction, adminManager, warnManager, guildConfig, sharedConfig, backupToGitHub, reportManager, banlistManager, blockedWordsManager, watchlistManager, telegramIntegration, funCommandsManager, raidDetector, doxDetector, enhancedReloadSystem, permissionValidator, dmTicketManager, economyManager) {
        try {
            if (!economyManager) {
                return await interaction.reply({
                    content: '❌ Le système économique n\'est pas disponible.',
                    ephemeral: true
                });
            }

            // Check if user is admin
            const isAdmin = await adminManager.isAdmin(interaction.user.id);
            if (!isAdmin) {
                return await interaction.reply({
                    content: '❌ Cette commande est réservée aux administrateurs.',
                    ephemeral: true
                });
            }

            const subcommand = interaction.options.getSubcommand();
            const guildId = interaction.guild.id;

            switch (subcommand) {
                case 'overview':
                    await this.handleOverview(interaction, economyManager, guildId);
                    break;
                case 'market':
                    await this.handleMarketAnalysis(interaction, economyManager, guildId);
                    break;
                case 'users':
                    await this.handleUserStats(interaction, economyManager, guildId);
                    break;
                case 'simulate':
                    await this.handleSimulation(interaction, economyManager, guildId);
                    break;
            }

        } catch (error) {
            console.error('Error in economy-stats command:', error);
            await interaction.reply({
                content: '❌ Une erreur est survenue lors de la récupération des statistiques économiques.',
                ephemeral: true
            });
        }
    },

    async handleOverview(interaction, economyManager, guildId) {
        const stats = await economyManager.getEconomicStats(guildId);
        
        if (!stats) {
            return await interaction.reply({
                content: '❌ Impossible de récupérer les statistiques économiques.',
                ephemeral: true
            });
        }

        const embed = new EmbedBuilder()
            .setColor('#0099ff')
            .setTitle('📊 Aperçu Économique du Serveur')
            .setDescription(`Statistiques économiques pour **${interaction.guild.name}**`)
            .addFields(
                {
                    name: '💰 Économie Générale',
                    value: [
                        `💵 **Monnaie Totale:** ${stats.guild.totalCurrency.toLocaleString()} coins`,
                        `📈 **Valeur Actuelle:** ${stats.guild.currentValue.toFixed(2)}x`,
                        `📊 **Valeur de Base:** ${stats.guild.baseValue.toFixed(2)}x`,
                        `📉 **Taux d'Inflation:** ${stats.guild.inflationRate.toFixed(2)}%`
                    ].join('\n'),
                    inline: false
                },
                {
                    name: '👥 Statistiques Utilisateurs',
                    value: [
                        `👤 **Utilisateurs Actifs:** ${stats.users.count.toLocaleString()}`,
                        `💰 **Balance Moyenne:** ${stats.users.averageBalance.toLocaleString()} coins`,
                        `📊 **Balance Médiane:** ${stats.users.medianBalance.toLocaleString()} coins`,
                        `💸 **Total Dépensé:** ${stats.users.totalSpent.toLocaleString()} coins`
                    ].join('\n'),
                    inline: false
                },
                {
                    name: '📈 Santé du Marché',
                    value: [
                        `🏥 **Score de Santé:** ${stats.market.marketHealth}/100`,
                        `🔄 **Vélocité Monétaire:** ${stats.market.velocityOfMoney.toFixed(2)}`,
                        `⚡ **Activité Économique:** ${stats.market.economicActivity.toLocaleString()}`,
                        `📊 **Concentration Richesse:** ${(stats.market.wealthConcentration * 100).toFixed(1)}%`
                    ].join('\n'),
                    inline: false
                }
            )
            .setFooter({ 
                text: `Dernière mise à jour: ${new Date(stats.guild.lastUpdate).toLocaleString()}` 
            })
            .setTimestamp();

        // Add health indicator
        const healthEmoji = stats.market.marketHealth >= 80 ? '🟢' : 
                           stats.market.marketHealth >= 60 ? '🟡' : 
                           stats.market.marketHealth >= 40 ? '🟠' : '🔴';
        
        embed.setDescription(`${embed.data.description}\n\n${healthEmoji} **État du Marché:** ${this.getMarketHealthDescription(stats.market.marketHealth)}`);

        await interaction.reply({ embeds: [embed] });
    },

    async handleMarketAnalysis(interaction, economyManager, guildId) {
        const stats = await economyManager.getEconomicStats(guildId);
        
        if (!stats) {
            return await interaction.reply({
                content: '❌ Impossible de récupérer les statistiques de marché.',
                ephemeral: true
            });
        }

        // Calculate additional market metrics
        const inflationTrend = stats.guild.inflationRate > 0 ? 'Inflation' : 
                              stats.guild.inflationRate < 0 ? 'Déflation' : 'Stable';
        const inflationEmoji = stats.guild.inflationRate > 5 ? '📈' : 
                              stats.guild.inflationRate < -5 ? '📉' : '➡️';

        const embed = new EmbedBuilder()
            .setColor('#ff6600')
            .setTitle('📊 Analyse Détaillée du Marché')
            .setDescription(`Analyse approfondie pour **${interaction.guild.name}**`)
            .addFields(
                {
                    name: '💹 Dynamiques de Marché',
                    value: [
                        `📊 **Valeur Actuelle:** ${stats.guild.currentValue.toFixed(4)}x`,
                        `📈 **Tendance:** ${inflationEmoji} ${inflationTrend} (${Math.abs(stats.guild.inflationRate).toFixed(2)}%)`,
                        `💰 **Circulation Totale:** ${stats.guild.totalCurrency.toLocaleString()} coins`,
                        `🔄 **Vélocité:** ${stats.market.velocityOfMoney.toFixed(3)}`
                    ].join('\n'),
                    inline: true
                },
                {
                    name: '📈 Indicateurs Économiques',
                    value: [
                        `🏥 **Santé Globale:** ${stats.market.marketHealth}/100`,
                        `⚡ **Activité Totale:** ${stats.market.economicActivity.toLocaleString()}`,
                        `📊 **Concentration:** ${(stats.market.wealthConcentration * 100).toFixed(2)}%`,
                        `💎 **Valeur Réelle Totale:** ${(stats.users.totalBalances * stats.guild.currentValue).toLocaleString()}`
                    ].join('\n'),
                    inline: true
                },
                {
                    name: '🎯 Recommandations',
                    value: this.getMarketRecommendations(stats),
                    inline: false
                }
            )
            .setFooter({ 
                text: `Analyse générée le ${new Date().toLocaleString()}` 
            })
            .setTimestamp();

        await interaction.reply({ embeds: [embed] });
    },

    async handleUserStats(interaction, economyManager, guildId) {
        const stats = await economyManager.getEconomicStats(guildId);
        
        if (!stats) {
            return await interaction.reply({
                content: '❌ Impossible de récupérer les statistiques utilisateurs.',
                ephemeral: true
            });
        }

        const embed = new EmbedBuilder()
            .setColor('#00ff99')
            .setTitle('👥 Statistiques des Utilisateurs')
            .setDescription(`Analyse des utilisateurs pour **${interaction.guild.name}**`)
            .addFields(
                {
                    name: '📊 Distribution des Richesses',
                    value: [
                        `👤 **Utilisateurs Actifs:** ${stats.users.count.toLocaleString()}`,
                        `💰 **Balance Totale:** ${stats.users.totalBalances.toLocaleString()} coins`,
                        `📊 **Balance Moyenne:** ${stats.users.averageBalance.toLocaleString()} coins`,
                        `📈 **Balance Médiane:** ${stats.users.medianBalance.toLocaleString()} coins`
                    ].join('\n'),
                    inline: true
                },
                {
                    name: '💸 Activité Économique',
                    value: [
                        `💎 **Total Gagné:** ${stats.users.totalEarned.toLocaleString()} coins`,
                        `💸 **Total Dépensé:** ${stats.users.totalSpent.toLocaleString()} coins`,
                        `🔄 **Ratio Dépenses/Gains:** ${stats.users.totalEarned > 0 ? (stats.users.totalSpent / stats.users.totalEarned * 100).toFixed(1) : 0}%`,
                        `📊 **Concentration:** ${(stats.market.wealthConcentration * 100).toFixed(1)}%`
                    ].join('\n'),
                    inline: true
                },
                {
                    name: '🎯 Insights Utilisateurs',
                    value: this.getUserInsights(stats),
                    inline: false
                }
            )
            .setFooter({ 
                text: `Données mises à jour: ${new Date(stats.guild.lastUpdate).toLocaleString()}` 
            })
            .setTimestamp();

        await interaction.reply({ embeds: [embed] });
    },

    async handleSimulation(interaction, economyManager, guildId) {
        const days = interaction.options.getInteger('days') || 30;
        
        await interaction.deferReply();

        const simulation = await economyManager.simulateMarketDynamics(guildId, days);
        
        if (!simulation || simulation.length === 0) {
            return await interaction.editReply({
                content: '❌ Impossible de générer la simulation de marché.'
            });
        }

        // Analyze simulation results
        const firstDay = simulation[0];
        const lastDay = simulation[simulation.length - 1];
        const maxValue = Math.max(...simulation.map(day => day.marketValue));
        const minValue = Math.min(...simulation.map(day => day.marketValue));
        const avgActivity = simulation.reduce((sum, day) => sum + day.activity, 0) / simulation.length;

        const embed = new EmbedBuilder()
            .setColor('#9932cc')
            .setTitle('🔮 Simulation de Marché')
            .setDescription(`Simulation sur **${days} jours** pour **${interaction.guild.name}**`)
            .addFields(
                {
                    name: '📊 Résultats de Simulation',
                    value: [
                        `📅 **Période:** ${days} jours`,
                        `💰 **Monnaie Initiale:** ${firstDay.totalCurrency.toLocaleString()} coins`,
                        `💰 **Monnaie Finale:** ${lastDay.totalCurrency.toLocaleString()} coins`,
                        `📈 **Valeur Initiale:** ${firstDay.marketValue}x`
                    ].join('\n'),
                    inline: true
                },
                {
                    name: '📈 Analyse des Tendances',
                    value: [
                        `📊 **Valeur Finale:** ${lastDay.marketValue}x`,
                        `🔺 **Valeur Max:** ${maxValue}x`,
                        `🔻 **Valeur Min:** ${minValue}x`,
                        `⚡ **Activité Moyenne:** ${avgActivity.toFixed(1)}/100`
                    ].join('\n'),
                    inline: true
                },
                {
                    name: '🎯 Prédictions',
                    value: this.getSimulationInsights(simulation, days),
                    inline: false
                }
            )
            .setFooter({ 
                text: `Simulation générée le ${new Date().toLocaleString()}` 
            })
            .setTimestamp();

        // Add trend chart (simplified text representation)
        const chartData = this.generateSimpleChart(simulation);
        if (chartData) {
            embed.addFields({
                name: '📊 Graphique des Tendances (Valeur du Marché)',
                value: `\`\`\`${chartData}\`\`\``,
                inline: false
            });
        }

        await interaction.editReply({ embeds: [embed] });
    },

    getMarketHealthDescription(health) {
        if (health >= 80) return 'Excellent - Économie très stable';
        if (health >= 60) return 'Bon - Économie stable';
        if (health >= 40) return 'Moyen - Quelques fluctuations';
        if (health >= 20) return 'Faible - Économie instable';
        return 'Critique - Intervention nécessaire';
    },

    getMarketRecommendations(stats) {
        const recommendations = [];
        
        if (stats.guild.inflationRate > 10) {
            recommendations.push('🔴 **Inflation élevée** - Réduire les récompenses');
        } else if (stats.guild.inflationRate < -10) {
            recommendations.push('🔵 **Déflation forte** - Augmenter les récompenses');
        } else {
            recommendations.push('🟢 **Inflation contrôlée** - Maintenir les paramètres');
        }
        
        if (stats.market.wealthConcentration > 0.5) {
            recommendations.push('⚠️ **Concentration élevée** - Encourager les transferts');
        }
        
        if (stats.market.velocityOfMoney < 0.5) {
            recommendations.push('📈 **Faible vélocité** - Stimuler les dépenses');
        }
        
        if (stats.market.marketHealth < 50) {
            recommendations.push('🚨 **Santé faible** - Réviser la politique économique');
        }
        
        return recommendations.length > 0 ? recommendations.join('\n') : '✅ **Économie saine** - Aucune action requise';
    },

    getUserInsights(stats) {
        const insights = [];
        
        const participationRate = stats.users.count > 0 ? (stats.users.totalSpent / stats.users.totalEarned * 100) : 0;
        
        if (participationRate > 80) {
            insights.push('🟢 **Participation élevée** - Utilisateurs très actifs');
        } else if (participationRate > 50) {
            insights.push('🟡 **Participation modérée** - Engagement correct');
        } else {
            insights.push('🔴 **Participation faible** - Encourager l\'activité');
        }
        
        if (stats.market.wealthConcentration > 0.7) {
            insights.push('⚠️ **Inégalités importantes** - Redistribution recommandée');
        } else if (stats.market.wealthConcentration < 0.3) {
            insights.push('✅ **Distribution équitable** - Bonne répartition');
        }
        
        const avgBalance = stats.users.averageBalance;
        if (avgBalance > 10000) {
            insights.push('💰 **Richesse élevée** - Économie prospère');
        } else if (avgBalance < 1000) {
            insights.push('💸 **Richesse faible** - Augmenter les récompenses');
        }
        
        return insights.length > 0 ? insights.join('\n') : '📊 **Données insuffisantes** - Plus d\'activité nécessaire';
    },

    getSimulationInsights(simulation, days) {
        const insights = [];
        const trend = simulation[simulation.length - 1].marketValue - simulation[0].marketValue;
        
        if (Math.abs(trend) < 0.1) {
            insights.push('📊 **Marché stable** - Peu de variations prévues');
        } else if (trend > 0) {
            insights.push('📈 **Tendance haussière** - Valeur en augmentation');
        } else {
            insights.push('📉 **Tendance baissière** - Valeur en diminution');
        }
        
        const volatility = this.calculateVolatility(simulation);
        if (volatility > 0.5) {
            insights.push('⚡ **Haute volatilité** - Marché imprévisible');
        } else if (volatility < 0.2) {
            insights.push('🔒 **Faible volatilité** - Marché prévisible');
        }
        
        const avgCurrency = simulation.reduce((sum, day) => sum + day.totalCurrency, 0) / simulation.length;
        if (avgCurrency > simulation[0].totalCurrency * 1.2) {
            insights.push('💰 **Croissance monétaire** - Inflation possible');
        } else if (avgCurrency < simulation[0].totalCurrency * 0.8) {
            insights.push('💸 **Contraction monétaire** - Déflation possible');
        }
        
        return insights.length > 0 ? insights.join('\n') : '📊 **Simulation neutre** - Pas de tendances marquées';
    },

    calculateVolatility(simulation) {
        if (simulation.length < 2) return 0;
        
        const values = simulation.map(day => day.marketValue);
        const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
        const variance = values.reduce((sum, val) => sum + Math.pow(val - mean, 2), 0) / values.length;
        
        return Math.sqrt(variance);
    },

    generateSimpleChart(simulation) {
        if (simulation.length === 0) return null;
        
        const maxValue = Math.max(...simulation.map(day => day.marketValue));
        const minValue = Math.min(...simulation.map(day => day.marketValue));
        const range = maxValue - minValue;
        
        if (range === 0) return 'Valeur constante sur toute la période';
        
        const chartHeight = 8;
        const chart = [];
        
        // Create chart lines
        for (let i = chartHeight; i >= 0; i--) {
            const threshold = minValue + (range * i / chartHeight);
            let line = '';
            
            for (const day of simulation.slice(0, Math.min(30, simulation.length))) {
                if (day.marketValue >= threshold) {
                    line += '█';
                } else {
                    line += ' ';
                }
            }
            
            chart.push(`${threshold.toFixed(2)}|${line}`);
        }
        
        // Add bottom axis
        let axis = '     ';
        for (let i = 0; i < Math.min(30, simulation.length); i += 5) {
            axis += `${i + 1}`.padEnd(5);
        }
        chart.push(axis);
        
        return chart.join('\n');
    }
};