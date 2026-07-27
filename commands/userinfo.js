import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';

export default {
    data: new SlashCommandBuilder()
        .setName('userinfo')
        .setDescription('Affiche des informations détaillées sur un utilisateur')
        .addUserOption(option =>
            option.setName('utilisateur')
                .setDescription('L\'utilisateur dont vous voulez voir les informations')
                .setRequired(false)
        ),
    async execute(interaction, adminManager, warnManager, guildConfig, sharedConfig, backupToGitHub, reportManager, banlistManager, blockedWordsManager, watchlistManager) {
        try {
            // Get selected user or author
            const user = interaction.options.getUser('utilisateur') || interaction.user;
            
            // Try to fetch guild member object to get join date and roles
            const member = await interaction.guild.members.fetch(user.id).catch(() => null);

            const embed = new EmbedBuilder()
                .setColor('#3498db')
                .setTitle(`Informations sur ${user.tag}`)
                .setThumbnail(user.displayAvatarURL({ dynamic: true, size: 256 }))
                .addFields(
                    { name: '👤 Nom d\'utilisateur', value: user.username, inline: true },
                    { name: '🆔 ID', value: user.id, inline: true },
                    { name: '🤖 Type de compte', value: user.bot ? 'Bot' : 'Utilisateur', inline: true },
                    { name: '📅 Création du compte', value: `<t:${Math.floor(user.createdTimestamp / 1000)}:F>\n(<t:${Math.floor(user.createdTimestamp / 1000)}:R>)`, inline: false }
                )
                .setTimestamp()
                .setFooter({ 
                    text: `Demandé par ${interaction.user.tag}`,
                    iconURL: interaction.user.displayAvatarURL({ dynamic: true })
                });

            // Add server specific member info if member is in guild
            if (member) {
                if (member.joinedTimestamp) {
                    embed.addFields({ 
                        name: '📥 Arrivée sur le serveur', 
                        value: `<t:${Math.floor(member.joinedTimestamp / 1000)}:F>\n(<t:${Math.floor(member.joinedTimestamp / 1000)}:R>)`, 
                        inline: false 
                    });
                }

                // Get role info
                const roles = member.roles.cache
                    .filter(role => role.id !== interaction.guild.roles.everyone.id)
                    .map(role => role.toString());
                
                const rolesDisplay = roles.length > 0 
                    ? (roles.length > 10 ? `${roles.slice(0, 10).join(', ')} et ${roles.length - 10} de plus...` : roles.join(', '))
                    : 'Aucun rôle';

                embed.addFields(
                    { name: '👑 Rôle le plus élevé', value: member.roles.highest.toString(), inline: true },
                    { name: `🎭 Rôles (${roles.length})`, value: rolesDisplay, inline: false }
                );
            }

            // Check watchlist status if watchlistManager is available
            if (watchlistManager) {
                const onLocalWatch = watchlistManager.isOnWatchlist ? watchlistManager.isOnWatchlist(user.id, interaction.guildId) : false;
                const onGlobalWatch = watchlistManager.isOnGlobalWatchlist ? watchlistManager.isOnGlobalWatchlist(user.id) : false;

                let watchStatus = '🟢 Surveillance inactive';
                if (onGlobalWatch) {
                    watchStatus = '🚨 **Surveillance Globale active**';
                } else if (onLocalWatch) {
                    watchStatus = '⚠️ **Surveillance Locale active**';
                }

                embed.addFields({ name: '🛡️ Statut Watchlist', value: watchStatus, inline: true });
            }

            // Check warning count if warnManager is available
            if (warnManager) {
                const warnings = warnManager.getWarns ? warnManager.getWarns(user.id) : null;
                const warnCount = warnings ? warnings.count : 0;
                embed.addFields({ name: '⚠️ Avertissements', value: `${warnCount} avertissement(s)`, inline: true });
            }

            return interaction.reply({ embeds: [embed] });

        } catch (error) {
            console.error('Erreur lors de l\'exécution de la commande userinfo :', error);
            return interaction.reply({ 
                content: '❌ Une erreur est survenue lors de la récupération des informations de l\'utilisateur.', 
                ephemeral: true 
            });
        }
    }
};
