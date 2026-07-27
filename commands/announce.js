import { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } from 'discord.js';

export default {
    data: new SlashCommandBuilder()
        .setName('announce')
        .setDescription('Diffuse une annonce dans tous les serveurs (sauf le serveur de support)')
        .addStringOption(option =>
            option.setName('message')
                .setDescription('Le message de l\'annonce')
                .setRequired(true)
        )
        .addStringOption(option =>
            option.setName('titre')
                .setDescription('Le titre de l\'annonce (optionnel)')
                .setRequired(false)
        )
        .addStringOption(option =>
            option.setName('image')
                .setDescription('URL d\'une image à inclure (optionnel)')
                .setRequired(false)
        ),

    async execute(interaction, adminManager, warnManager, guildConfig, sharedConfig, backupToGitHub, reportManager, banlistManager, blockedWordsManager, watchlistManager) {
        // Restriction stricte aux administrateurs du bot
        const isAdmin = adminManager.isAdmin(interaction.user.id);
        if (!isAdmin) {
            return interaction.reply({
                content: '❌ Seuls les administrateurs du bot peuvent diffuser des annonces globales.',
                ephemeral: true
            });
        }

        const messageContent = interaction.options.getString('message');
        const title = interaction.options.getString('titre') || '📢 Annonce Officielle';
        const imageUrl = interaction.options.getString('image');
        
        const globalConfig = guildConfig.getGlobalConfig();
        const supportGuildId = globalConfig.supportGuildId;

        await interaction.deferReply({ ephemeral: true });

        const embed = new EmbedBuilder()
            .setColor('#0099ff')
            .setTitle(title)
            .setDescription(messageContent)
            .setTimestamp()
            .setFooter({ text: 'GitBot Announcements', iconURL: interaction.client.user.displayAvatarURL() });

        if (imageUrl) {
            embed.setImage(imageUrl);
        }

        let successCount = 0;
        let failCount = 0;
        let skippedCount = 0;

        const guilds = interaction.client.guilds.cache;
        
        for (const [guildId, guild] of guilds) {
            // Ignorer le serveur de support
            if (guildId === supportGuildId) {
                skippedCount++;
                continue;
            }

            let announcementChannelId = guildConfig.getAnnouncementChannelId(guildId);
            let channel = null;
            
            // Si aucun salon n'est configuré, on tente d'en trouver un existant ou d'en créer un
            if (!announcementChannelId) {
                try {
                    // 1. Chercher si un salon avec ce nom existe déjà
                    const existingChannel = guild.channels.cache.find(c => c.name === '📢-annonces' && c.isTextBased());
                    
                    if (existingChannel) {
                        channel = existingChannel;
                        guildConfig.setAnnouncementChannelId(guildId, channel.id);
                        announcementChannelId = channel.id;
                        console.log(`[ANNONCE] Salon existant trouvé et configuré sur ${guild.name} (${guildId})`);
                    } 
                    // 2. Sinon, tenter de le créer si on a les permissions
                    else if (guild.members.me.permissions.has(PermissionFlagsBits.ManageChannels)) {
                        channel = await guild.channels.create({
                            name: '📢-annonces',
                            type: 0, // GuildText
                            topic: 'Salon dédié aux annonces officielles du bot.',
                            permissionOverwrites: [
                                {
                                    id: guild.roles.everyone.id,
                                    deny: [PermissionFlagsBits.SendMessages],
                                    allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory]
                                },
                                {
                                    id: guild.members.me.id,
                                    allow: [PermissionFlagsBits.SendMessages, PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ManageChannels]
                                }
                            ]
                        });
                        
                        guildConfig.setAnnouncementChannelId(guildId, channel.id);
                        announcementChannelId = channel.id;
                        console.log(`[ANNONCE] Salon créé avec succès sur ${guild.name} (${guildId})`);
                    } else {
                        console.log(`[ANNONCE] Permissions insuffisantes pour créer un salon sur ${guild.name}`);
                    }
                } catch (error) {
                    if (error.code === 50035) {
                        console.error(`[ANNONCE] Erreur de validation lors de la création sur ${guild.name} (Nom invalide ?)`);
                    } else if (error.code === 30013) {
                        console.error(`[ANNONCE] Limite de salons atteinte sur le serveur ${guild.name}`);
                    } else {
                        console.error(`[ANNONCE] Erreur inattendue lors de la création sur ${guild.name}:`, error.message);
                    }
                }
            }

            if (announcementChannelId) {
                try {
                    if (!channel) {
                        channel = await guild.channels.fetch(announcementChannelId).catch(() => null);
                    }
                } catch (error) {
                    console.error(`Erreur de récupération du salon sur ${guild.name}:`, error);
                }
            }

            // Si toujours pas de salon (pas configuré, création échouée ou salon supprimé)
            // On cherche un salon de secours pour garantir l'envoi sur TOUS les serveurs
            let usedFallback = false;
            if (!channel || !channel.isTextBased()) {
                usedFallback = true;
                channel = guild.systemChannel || 
                          guild.publicUpdatesChannel || 
                          guild.channels.cache.find(c => c.isTextBased() && c.permissionsFor(guild.members.me).has(PermissionFlagsBits.SendMessages));
            }

            if (channel) {
                try {
                    const sendOptions = { embeds: [embed] };
                    if (usedFallback) {
                        sendOptions.content = "ℹ️ *Note : Les annonces sont envoyées ici car le bot n'a pas pu trouver ou créer son salon dédié. Si vous donnez au bot la permission « Gérer les salons », les futures annonces seront faites dans un canal dédié exclusif.*";
                    }
                    await channel.send(sendOptions);
                    successCount++;
                } catch (error) {
                    console.error(`Erreur d'envoi d'annonce au serveur ${guild.name} (${guildId}):`, error);
                    failCount++;
                }
            } else {
                console.warn(`[ANNONCE] Aucun salon trouvé pour envoyer l'annonce sur ${guild.name} (${guildId})`);
                failCount++;
            }
        }

        await interaction.editReply({
            content: `📢 Diffusion de l'annonce terminée.\n✅ Succès: ${successCount}\n❌ Échecs: ${failCount}\n⏭️ Ignorés (non configurés ou support): ${skippedCount}`
        });
    }
};
