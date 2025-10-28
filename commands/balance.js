import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';

export default {
    data: new SlashCommandBuilder()
        .setName('balance')
        .setDescription('Check your current balance and economy stats')
        .addUserOption(option =>
            option.setName('user')
                .setDescription('Check another user\'s balance (optional)')
                .setRequired(false)),
    
    async execute(interaction, adminManager, warnManager, guildConfig, sharedConfig, backupToGitHub, reportManager, banlistManager, blockedWordsManager, watchlistManager, telegramIntegration, funCommandsManager, raidDetector, doxDetector, enhancedReloadSystem, permissionValidator, dmTicketManager, economyManager) {
        try {
            if (!economyManager) {
                return await interaction.reply({
                    content: '❌ Le système économique n\'est pas disponible.',
                    ephemeral: true
                });
            }

            const targetUser = interaction.options.getUser('user') || interaction.user;
            const guildId = interaction.guild.id;

            // Get user statistics
            const userStats = await economyManager.getUserStats(targetUser.id, guildId);
            
            if (!userStats) {
                return await interaction.reply({
                    content: '❌ Impossible de récupérer les statistiques économiques.',
                    ephemeral: true
                });
            }

            const embed = new EmbedBuilder()
                .setColor('#00ff00')
                .setTitle(`💰 Balance de ${targetUser.username}`)
                .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
                .addFields(
                    { 
                        name: '💵 Balance Actuelle', 
                        value: `**${userStats.balance.toLocaleString()}** coins`, 
                        inline: true 
                    },
                    { 
                        name: '📈 Valeur du Marché', 
                        value: `**${userStats.currentValue.toFixed(2)}**x`, 
                        inline: true 
                    },
                    { 
                        name: '💎 Valeur Réelle', 
                        value: `**${(userStats.balance * userStats.currentValue).toLocaleString()}** points`, 
                        inline: true 
                    },
                    { 
                        name: '📊 Total Gagné', 
                        value: `${userStats.totalEarned.toLocaleString()} coins`, 
                        inline: true 
                    },
                    { 
                        name: '💸 Total Dépensé', 
                        value: `${userStats.totalSpent.toLocaleString()} coins`, 
                        inline: true 
                    },
                    { 
                        name: '🎁 Bonus Quotidien', 
                        value: userStats.canClaimDaily ? '✅ Disponible' : '❌ Déjà réclamé', 
                        inline: true 
                    }
                )
                .setFooter({ 
                    text: `Dernière activité: ${userStats.lastActivity ? new Date(userStats.lastActivity).toLocaleDateString() : 'Jamais'}` 
                })
                .setTimestamp();

            // Add daily bonus claim button if available and it's the user's own balance
            if (userStats.canClaimDaily && targetUser.id === interaction.user.id) {
                embed.addFields({
                    name: '💡 Astuce',
                    value: 'Vous pouvez réclamer votre bonus quotidien! Utilisez `/daily-bonus` pour le récupérer.',
                    inline: false
                });
            }

            await interaction.reply({ embeds: [embed] });

        } catch (error) {
            console.error('Error in balance command:', error);
            await interaction.reply({
                content: '❌ Une erreur est survenue lors de la récupération de la balance.',
                ephemeral: true
            });
        }
    },
};