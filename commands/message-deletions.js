import { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } from 'discord.js';

export const data = new SlashCommandBuilder()
    .setName('message-deletions')
    .setDescription('Affiche les informations sur les suppressions de messages')
    .addSubcommand(subcommand =>
        subcommand
            .setName('stats')
            .setDescription('Affiche les statistiques de suppression')
            .addIntegerOption(option =>
                option
                    .setName('days')
                    .setDescription('Nombre de jours à analyser (défaut: 7)')
                    .setRequired(false)
                    .setMinValue(1)
                    .setMaxValue(30)
            )
    )
    .addSubcommand(subcommand =>
        subcommand
            .setName('recent')
            .setDescription('Affiche les suppressions récentes')
            .addChannelOption(option =>
                option
                    .setName('channel')
                    .setDescription('Canal à analyser (optionnel)')
                    .setRequired(false)
            )
            .addIntegerOption(option =>
                option
                    .setName('minutes')
                    .setDescription('Minutes à analyser (défaut: 30)')
                    .setRequired(false)
                    .setMinValue(1)
                    .setMaxValue(1440)
            )
    )
    .addSubcommand(subcommand =>
        subcommand
            .setName('search')
            .setDescription('Recherche des messages supprimés')
            .addUserOption(option =>
                option
                    .setName('user')
                    .setDescription('Utilisateur dont les messages ont été supprimés')
                    .setRequired(false)
            )
            .addChannelOption(option =>
                option
                    .setName('channel')
                    .setDescription('Canal où chercher')
                    .setRequired(false)
            )
            .addStringOption(option =>
                option
                    .setName('content')
                    .setDescription('Contenu à rechercher dans les messages supprimés')
                    .setRequired(false)
                    .setMaxLength(100)
            )
    )
    .addSubcommand(subcommand =>
        subcommand
            .setName('bulk')
            .setDescription('Affiche les suppressions en masse récentes')
            .addIntegerOption(option =>
                option
                    .setName('days')
                    .setDescription('Nombre de jours à analyser (défaut: 3)')
                    .setRequired(false)
                    .setMinValue(1)
                    .setMaxValue(14)
            )
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages);

export async function execute(interaction, adminManager, permissionValidator, watchlistManager, reportManager, forumReportManager, messageLogger) {
    try {
        // Vérifier les permissions de modération
        if (!permissionValidator.validateModerationPermission(interaction.member)) {
            return await interaction.reply({
                content: '❌ Vous n\'avez pas les permissions nécessaires pour voir les suppressions de messages.',
                ephemeral: true
            });
        }

        const subcommand = interaction.options.getSubcommand();

        switch (subcommand) {
            case 'stats':
                await handleStats(interaction, messageLogger);
                break;
            case 'recent':
                await handleRecent(interaction, messageLogger);
                break;
            case 'search':
                await handleSearch(interaction, messageLogger);
                break;
            case 'bulk':
                await handleBulk(interaction, messageLogger);
                break;
            default:
                await interaction.reply({
                    content: '❌ Sous-commande non reconnue.',
                    ephemeral: true
                });
        }
    } catch (error) {
        console.error('Error in message-deletions command:', error);
        await interaction.reply({
            content: '❌ Une erreur inattendue est survenue lors de l\'exécution de la commande.',
            ephemeral: true
        });
    }
}

async function handleStats(interaction, messageLogger) {
    const days = interaction.options.getInteger('days') || 7;
    
    try {
        const stats = messageLogger.getDeletionStats(interaction.guildId, days);
        
        const embed = new EmbedBuilder()
            .setColor('#FF6B6B')
            .setTitle('📊 Statistiques de Suppression de Messages')
            .setDescription(`Analyse des ${days} derniers jours`)
            .addFields(
                { 
                    name: '🗑️ Total des suppressions', 
                    value: stats.totalDeletions?.toString() || '0', 
                    inline: true 
                },
                { 
                    name: '📦 Suppressions en masse', 
                    value: stats.bulkDeletions?.toString() || '0', 
                    inline: true 
                },
                { 
                    name: '📈 Moyenne par jour', 
                    value: Math.round((stats.totalDeletions || 0) / days).toString(), 
                    inline: true 
                }
            )
            .setTimestamp()
            .setFooter({ text: `Serveur: ${interaction.guild.name}` });

        // Top channels with deletions
        if (stats.deletionsByChannel && Object.keys(stats.deletionsByChannel).length > 0) {
            const topChannels = Object.entries(stats.deletionsByChannel)
                .sort(([,a], [,b]) => b - a)
                .slice(0, 5)
                .map(([channelId, count]) => `<#${channelId}>: ${count}`)
                .join('\n');
            
            embed.addFields({ 
                name: '📍 Canaux les plus affectés', 
                value: topChannels || 'Aucun', 
                inline: false 
            });
        }

        // Top users with deleted messages
        if (stats.deletionsByUser && Object.keys(stats.deletionsByUser).length > 0) {
            const topUsers = Object.entries(stats.deletionsByUser)
                .sort(([,a], [,b]) => b - a)
                .slice(0, 5)
                .map(([userId, count]) => `<@${userId}>: ${count}`)
                .join('\n');
            
            embed.addFields({ 
                name: '👤 Utilisateurs les plus affectés', 
                value: topUsers || 'Aucun', 
                inline: false 
            });
        }

        // Daily breakdown
        if (stats.deletionsByDay && Object.keys(stats.deletionsByDay).length > 0) {
            const dailyBreakdown = Object.entries(stats.deletionsByDay)
                .sort(([a], [b]) => new Date(b) - new Date(a))
                .slice(0, 7)
                .map(([date, count]) => `${date}: ${count}`)
                .join('\n');
            
            embed.addFields({ 
                name: '📅 Répartition par jour', 
                value: dailyBreakdown || 'Aucune donnée', 
                inline: false 
            });
        }

        await interaction.reply({ embeds: [embed], ephemeral: true });
    } catch (error) {
        console.error('Error getting deletion stats:', error);
        await interaction.reply({
            content: '❌ Erreur lors de la récupération des statistiques.',
            ephemeral: true
        });
    }
}

async function handleRecent(interaction, messageLogger) {
    const channel = interaction.options.getChannel('channel');
    const minutes = interaction.options.getInteger('minutes') || 30;
    const channelId = channel?.id || interaction.channelId;
    
    try {
        const recentDeletions = await messageLogger.getRecentDeletions(interaction.guildId, channelId, minutes);
        
        const embed = new EmbedBuilder()
            .setColor('#FF9500')
            .setTitle('🕒 Suppressions Récentes')
            .setDescription(`Messages supprimés dans les ${minutes} dernières minutes`)
            .addFields(
                { 
                    name: '📍 Canal', 
                    value: `<#${channelId}>`, 
                    inline: true 
                },
                { 
                    name: '🗑️ Suppressions trouvées', 
                    value: recentDeletions.length.toString(), 
                    inline: true 
                },
                { 
                    name: '⏰ Période', 
                    value: `${minutes} minutes`, 
                    inline: true 
                }
            )
            .setTimestamp();

        if (recentDeletions.length > 0) {
            const deletionList = recentDeletions
                .slice(0, 10) // Limit to 10 most recent
                .map(deletion => {
                    const deletedTime = new Date(deletion.deletedAt);
                    const timeStr = `<t:${Math.floor(deletedTime.getTime() / 1000)}:R>`;
                    const author = deletion.author?.username || 'Inconnu';
                    const content = deletion.content?.substring(0, 50) || '[Contenu non disponible]';
                    
                    return `**${author}** ${timeStr}\n\`${content}${deletion.content?.length > 50 ? '...' : ''}\``;
                })
                .join('\n\n');
            
            embed.addFields({ 
                name: '📝 Messages supprimés', 
                value: deletionList, 
                inline: false 
            });

            if (recentDeletions.length > 10) {
                embed.setFooter({ text: `Affichage de 10 sur ${recentDeletions.length} suppressions` });
            }
        } else {
            embed.addFields({ 
                name: '✅ Aucune suppression', 
                value: 'Aucun message supprimé dans cette période.', 
                inline: false 
            });
        }

        await interaction.reply({ embeds: [embed], ephemeral: true });
    } catch (error) {
        console.error('Error getting recent deletions:', error);
        await interaction.reply({
            content: '❌ Erreur lors de la récupération des suppressions récentes.',
            ephemeral: true
        });
    }
}

async function handleSearch(interaction, messageLogger) {
    const user = interaction.options.getUser('user');
    const channel = interaction.options.getChannel('channel');
    const content = interaction.options.getString('content');
    
    if (!user && !channel && !content) {
        return await interaction.reply({
            content: '❌ Vous devez spécifier au moins un critère de recherche.',
            ephemeral: true
        });
    }

    try {
        // This is a simplified search - in a real implementation, you'd want to search through deletion logs
        const embed = new EmbedBuilder()
            .setColor('#9B59B6')
            .setTitle('🔍 Recherche de Messages Supprimés')
            .setDescription('Recherche dans les logs de suppression...')
            .addFields(
                { 
                    name: '🎯 Critères de recherche', 
                    value: [
                        user ? `👤 Utilisateur: ${user.tag}` : null,
                        channel ? `📍 Canal: ${channel.name}` : null,
                        content ? `📝 Contenu: "${content}"` : null
                    ].filter(Boolean).join('\n'), 
                    inline: false 
                }
            )
            .setTimestamp();

        // Note: This would require implementing a more sophisticated search function
        // For now, we'll show a placeholder
        embed.addFields({ 
            name: '⚠️ Fonctionnalité en développement', 
            value: 'La recherche avancée dans les logs de suppression sera bientôt disponible.', 
            inline: false 
        });

        await interaction.reply({ embeds: [embed], ephemeral: true });
    } catch (error) {
        console.error('Error searching deletions:', error);
        await interaction.reply({
            content: '❌ Erreur lors de la recherche.',
            ephemeral: true
        });
    }
}

async function handleBulk(interaction, messageLogger) {
    const days = interaction.options.getInteger('days') || 3;
    
    try {
        // Read bulk deletion logs
        const bulkDeletionsDir = `messages/${interaction.guildId}/bulk_deletions`;
        let bulkDeletions = [];
        
        if (require('fs').existsSync(bulkDeletionsDir)) {
            const files = require('fs').readdirSync(bulkDeletionsDir)
                .filter(file => file.endsWith('.json'))
                .sort()
                .reverse()
                .slice(0, days);
            
            for (const file of files) {
                try {
                    const filePath = require('path').join(bulkDeletionsDir, file);
                    const dayDeletions = JSON.parse(require('fs').readFileSync(filePath, 'utf8'));
                    bulkDeletions.push(...dayDeletions);
                } catch (e) {
                    // Ignore corrupted files
                }
            }
        }

        const embed = new EmbedBuilder()
            .setColor('#E74C3C')
            .setTitle('📦 Suppressions en Masse')
            .setDescription(`Suppressions en masse des ${days} derniers jours`)
            .addFields(
                { 
                    name: '🗑️ Total des événements', 
                    value: bulkDeletions.length.toString(), 
                    inline: true 
                },
                { 
                    name: '📊 Messages supprimés', 
                    value: bulkDeletions.reduce((sum, event) => sum + (event.deletedCount || 0), 0).toString(), 
                    inline: true 
                },
                { 
                    name: '📅 Période analysée', 
                    value: `${days} jour(s)`, 
                    inline: true 
                }
            )
            .setTimestamp();

        if (bulkDeletions.length > 0) {
            const recentEvents = bulkDeletions
                .slice(0, 5)
                .map(event => {
                    const deletedTime = new Date(event.deletedAt);
                    const timeStr = `<t:${Math.floor(deletedTime.getTime() / 1000)}:R>`;
                    
                    return `**${event.deletedCount} messages** dans <#${event.channelId}> ${timeStr}`;
                })
                .join('\n');
            
            embed.addFields({ 
                name: '📋 Événements récents', 
                value: recentEvents, 
                inline: false 
            });

            if (bulkDeletions.length > 5) {
                embed.setFooter({ text: `Affichage de 5 sur ${bulkDeletions.length} événements` });
            }
        } else {
            embed.addFields({ 
                name: '✅ Aucune suppression en masse', 
                value: 'Aucune suppression en masse détectée dans cette période.', 
                inline: false 
            });
        }

        await interaction.reply({ embeds: [embed], ephemeral: true });
    } catch (error) {
        console.error('Error getting bulk deletions:', error);
        await interaction.reply({
            content: '❌ Erreur lors de la récupération des suppressions en masse.',
            ephemeral: true
        });
    }
}