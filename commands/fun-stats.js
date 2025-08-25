import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';

export default {
    data: new SlashCommandBuilder()
        .setName('fun-stats')
        .setDescription('Affiche les statistiques d\'utilisation des commandes amusantes')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addSubcommand(subcommand =>
            subcommand
                .setName('guild')
                .setDescription('Statistiques globales du serveur'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('user')
                .setDescription('Statistiques d\'un utilisateur spécifique')
                .addUserOption(option =>
                    option.setName('target')
                        .setDescription('L\'utilisateur à analyser')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('abuse')
                .setDescription('Vérifier les patterns d\'abus')
                .addUserOption(option =>
                    option.setName('target')
                        .setDescription('L\'utilisateur à vérifier')
                        .setRequired(true))),
    async execute(interaction, adminManager, warnManager, guildConfig, sharedConfig, backupToGitHub, reportManager, banlistManager, blockedWordsManager, watchlistManager, telegramIntegration, funCommandsManager, raidDetector, doxDetector, enhancedReloadSystem, permissionValidator) {
        try {
            // Check if user is admin
            const isAdmin = await adminManager.isAdmin(interaction.user.id);
            if (!isAdmin) {
                await interaction.reply({ 
                    content: 'Vous devez être administrateur pour utiliser cette commande.', 
                    ephemeral: true 
                });
                return;
            }

            if (!funCommandsManager) {
                await interaction.reply({ 
                    content: 'Le gestionnaire de commandes amusantes n\'est pas disponible.', 
                    ephemeral: true 
                });
                return;
            }

            const subcommand = interaction.options.getSubcommand();
            const guildId = interaction.guild.id;

            switch (subcommand) {
                case 'guild':
                    const guildStats = funCommandsManager.getGuildUsageStats(guildId);
                    
                    let guildMessage = `📊 **Statistiques des Commandes Amusantes**\n\n`;
                    guildMessage += `**Utilisateurs actifs :** ${guildStats.totalUsers}\n`;
                    guildMessage += `**Utilisation totale :** ${guildStats.totalUsage}\n\n`;
                    
                    if (Object.keys(guildStats.commandStats).length > 0) {
                        guildMessage += `**📈 Statistiques par commande :**\n`;
                        Object.entries(guildStats.commandStats).forEach(([command, stats]) => {
                            guildMessage += `• **${command}** : ${stats.totalUses} utilisations par ${stats.uniqueUsers} utilisateurs\n`;
                        });
                        guildMessage += `\n`;
                    }
                    
                    if (Object.keys(guildStats.gameStats).length > 0) {
                        guildMessage += `**🎮 Statistiques des jeux :**\n`;
                        Object.entries(guildStats.gameStats).forEach(([game, stats]) => {
                            guildMessage += `• **${game}** : ${stats.totalPlayers} joueurs, ${stats.totalGames} parties, ${stats.averageAccuracy}% de réussite moyenne\n`;
                        });
                    }
                    
                    await interaction.reply(guildMessage);
                    break;

                case 'user':
                    const targetUser = interaction.options.getUser('target');
                    const userStats = funCommandsManager.getUserStats(targetUser.id, guildId);
                    
                    if (!userStats) {
                        await interaction.reply(`L'utilisateur ${targetUser.tag} n'a pas encore utilisé de commandes amusantes.`);
                        return;
                    }
                    
                    let userMessage = `📊 **Statistiques de ${targetUser.tag}**\n\n`;
                    userMessage += `**Utilisation totale :** ${userStats.totalUsage}\n\n`;
                    
                    if (userStats.commands && Object.keys(userStats.commands).length > 0) {
                        userMessage += `**📈 Commandes utilisées :**\n`;
                        Object.entries(userStats.commands).forEach(([command, data]) => {
                            const lastUsed = new Date(data.lastUsed).toLocaleString('fr-FR');
                            userMessage += `• **${command}** : ${data.count} fois (dernière: ${lastUsed})\n`;
                        });
                        userMessage += `\n`;
                    }
                    
                    if (userStats.scores && Object.keys(userStats.scores).length > 0) {
                        userMessage += `**🎮 Scores des jeux :**\n`;
                        Object.entries(userStats.scores).forEach(([game, data]) => {
                            const accuracy = data.gamesPlayed > 0 
                                ? Math.round((data.correctAnswers / data.gamesPlayed) * 100)
                                : 0;
                            userMessage += `• **${game}** : ${data.totalPoints} points, ${data.gamesPlayed} parties, ${accuracy}% de réussite\n`;
                        });
                    }
                    
                    await interaction.reply(userMessage);
                    break;

                case 'abuse':
                    const abuseUser = interaction.options.getUser('target');
                    const abuseCheck = funCommandsManager.checkForAbuse(abuseUser.id, guildId);
                    
                    let abuseMessage = `🔍 **Analyse d'abus pour ${abuseUser.tag}**\n\n`;
                    
                    if (abuseCheck.hasAbuse) {
                        abuseMessage += `⚠️ **Patterns d'abus détectés :**\n`;
                        abuseCheck.reasons.forEach(reason => {
                            abuseMessage += `• ${reason}\n`;
                        });
                        
                        // Check if user is temporarily banned
                        if (funCommandsManager.isUserTemporarilyBanned(abuseUser.id, guildId)) {
                            const remainingTime = funCommandsManager.getRemainingBanTime(abuseUser.id, guildId);
                            abuseMessage += `\n🚫 **Utilisateur temporairement suspendu**\n`;
                            abuseMessage += `Temps restant : ${Math.ceil(remainingTime / 60)} minutes\n`;
                        }
                    } else {
                        abuseMessage += `✅ **Aucun pattern d'abus détecté**\n`;
                        
                        if (abuseCheck.userData) {
                            abuseMessage += `Utilisation totale : ${abuseCheck.userData.totalUsage}\n`;
                        } else {
                            abuseMessage += `L'utilisateur n'a pas encore utilisé de commandes amusantes.\n`;
                        }
                    }
                    
                    await interaction.reply({ content: abuseMessage, ephemeral: true });
                    break;

                default:
                    await interaction.reply({ 
                        content: 'Sous-commande non reconnue.', 
                        ephemeral: true 
                    });
            }
        } catch (error) {
            console.error('Error executing fun-stats command:', error);
            await interaction.reply({ 
                content: 'Une erreur est survenue lors de l\'exécution de la commande.', 
                ephemeral: true 
            });
        }
    },
};