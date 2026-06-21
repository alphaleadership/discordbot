import { SlashCommandBuilder, EmbedBuilder, ChannelType } from 'discord.js';

export default {
    data: new SlashCommandBuilder()
        .setName('server-info')
        .setDescription('Affiche des informations détaillées sur le serveur')
        .addStringOption(option =>
            option.setName('guild-id')
                .setDescription('ID du serveur à analyser (optionnel)')
                .setRequired(false)
        ),
    
    async execute(interaction, adminManager, warnManager, guildConfig, sharedConfig, backupToGitHub, reportManager, banlistManager, blockedWordsManager, watchlistManager, telegramIntegration, funCommandsManager, raidDetector, doxDetector, enhancedReloadSystem, permissionValidator, dmTicketManager, economyManager) {
        try {
            const guildIdInput = interaction.options.getString('guild-id');
            let guild = interaction.guild;

            if (guildIdInput) {
                // Fetch guild by ID from client cache or API
                guild = interaction.client.guilds.cache.get(guildIdInput) || 
                        await interaction.client.guilds.fetch(guildIdInput).catch(() => null);

                if (!guild) {
                    return await interaction.reply({
                        content: `❌ Le serveur avec l'ID \`${guildIdInput}\` est introuvable ou je n'y suis pas connecté.`,
                        ephemeral: true
                    });
                }
            }

            if (!guild) {
                return await interaction.reply({
                    content: '❌ Cette commande doit être utilisée sur un serveur ou avec un ID de serveur valide.',
                    ephemeral: true
                });
            }

            // Fetch owner
            const owner = await guild.members.fetch(guild.ownerId).catch(() => null);

            // Count channels
            const channels = await guild.channels.fetch().catch(() => new Map());
            const textChannels = channels.filter(c => c.type === ChannelType.GuildText).size;
            const voiceChannels = channels.filter(c => c.type === ChannelType.GuildVoice).size;
            const categoryChannels = channels.filter(c => c.type === ChannelType.GuildCategory).size;

            // Guild config details
            const config = (guildConfig && guildConfig.config) ? (guildConfig.config[guild.id] || {}) : {};

            const formatChannel = (channelId) => channelId ? `<#${channelId}>` : '*Non configuré*';
            const formatStatus = (enabled) => enabled ? '🟢 **Activé**' : '🔴 **Désactivé**';

            const logChannel = formatChannel(config.logChannelId);
            const announcementChannel = formatChannel(config.announcementChannelId);
            const antiInviteStatus = formatStatus(config.antiInvite?.enabled);
            const charLimit = config.charLimit ?? 2000;
            const raidStatus = formatStatus(config.raidDetection?.enabled);
            const doxStatus = formatStatus(config.doxDetection?.enabled);
            const watchlistStatus = formatStatus(config.watchlist?.enabled);
            const funStatus = formatStatus(config.funCommands?.enabled);
            const honeypotStatus = formatStatus(config.honeypot?.enabled) + 
                (config.honeypot?.enabled && config.honeypot?.channelId ? ` (<#${config.honeypot.channelId}>)` : '');
            
            const telegramStatus = `Bridge : ${config.telegram?.bridgeEnabled ? '🟢' : '🔴'} | Notifs : ${config.telegram?.notificationsEnabled ? '🟢' : '🔴'}`;

            const embed = new EmbedBuilder()
                .setColor('#3498db')
                .setTitle(`Informations sur le serveur ${guild.name}`)
                .setThumbnail(guild.iconURL({ dynamic: true, size: 256 }))
                .addFields(
                    { name: '📝 Nom du serveur', value: guild.name, inline: true },
                    { name: '🆔 ID du serveur', value: guild.id, inline: true },
                    { name: '👑 Propriétaire', value: owner ? `${owner.user.tag} (${owner.id})` : `Inconnu (${guild.ownerId})`, inline: false },
                    { name: '👥 Membres', value: `${guild.memberCount.toLocaleString()}`, inline: true },
                    { name: '🎭 Rôles', value: `${guild.roles.cache.size}`, inline: true },
                    { name: '📅 Date de création', value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:F> (<t:${Math.floor(guild.createdTimestamp / 1000)}:R>)`, inline: false },
                    { 
                        name: '📁 Salons', 
                        value: `💬 Texte : **${textChannels}**\n🔊 Vocal : **${voiceChannels}**\n📁 Catégories : **${categoryChannels}**\nTotal : **${channels.size}**`, 
                        inline: true 
                    },
                    {
                        name: '⚙️ Configuration Interne',
                        value: `🛡️ **Anti-Invite** : ${antiInviteStatus}\n` +
                               `🚨 **Raid** : ${raidStatus}\n` +
                               `🔒 **Dox** : ${doxStatus}\n` +
                               `👁️ **Watchlist** : ${watchlistStatus}\n` +
                               `🍯 **Honeypot** : ${honeypotStatus}\n` +
                               `🎮 **Cmds Fun** : ${funStatus}\n` +
                               `📏 **Spam** : \`${charLimit}\` chars`,
                        inline: true
                    },
                    {
                        name: '📡 Canaux & Intégrations',
                        value: `📝 **Logs** : ${logChannel}\n` +
                               `📢 **Annonces** : ${announcementChannel}\n` +
                               `✈️ **Telegram** : ${telegramStatus}`,
                        inline: false
                    }
                )
                .setTimestamp()
                .setFooter({ 
                    text: `Demandé par ${interaction.user.tag}`,
                    iconURL: interaction.user.displayAvatarURL({ dynamic: true })
                });

            if (guild.description) {
                embed.setDescription(`*${guild.description}*`);
            }

            if (guild.bannerURL()) {
                embed.setImage(guild.bannerURL({ size: 1024 }));
            }

            await interaction.reply({ embeds: [embed] });

        } catch (error) {
            console.error('Erreur lors de l\'exécution de la commande server-info:', error);
            await interaction.reply({
                content: '❌ Une erreur est survenue lors de la récupération des informations du serveur.',
                ephemeral: true
            });
        }
    }
};
