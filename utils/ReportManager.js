import fs from 'fs';
import path from 'path';
import { EmbedBuilder } from 'discord.js';

export class ReportManager {
    // ID du canal de rapport
    REPORT_CHANNEL_ID = '1406985746430296084';

    /**
     * Envoie un rapport dans le canal dédié
     * @param {import('discord.js').Client} client - Le client Discord
     * @param {string} reporterId - L'ID de la personne qui fait le rapport
     * @param {string} reportedId - L'ID de la personne signalée
     * @param {string} reason - La raison du signalement
     * @param {string} [proof] - Une preuve optionnelle (lien, etc.)
     * @returns {Promise<{success: boolean, message: string}>}
     */
    async report(client, reporterId, reportedId, reason, proof = 'Aucune preuve fournie') {
        try {
            const reportChannel = await client.channels.fetch(this.REPORT_CHANNEL_ID);
            if (!reportChannel) {
                return {
                    success: false,
                    message: 'Le canal de rapport est introuvable.'
                };
            }
            
            const [reporter, reported] = await Promise.all([
                client.users.fetch(reporterId).catch(() => null),
                client.users.fetch(reportedId).catch(() => null)
            ]);
            
            const embed = new EmbedBuilder()
                .setColor(0xff0000)
                .setTitle('🚨 Nouveau rapport')
                .addFields(
                    { name: 'Signalé par', value: reporter ? `${reporter.tag} (${reporterId})` : `ID: ${reporterId}`, inline: true },
                    { name: 'Utilisateur signalé', value: reported ? `${reported.tag} (${reportedId})` : `ID: ${reportedId}`, inline: true },
                    { name: 'Raison', value: reason },
                    { name: 'Preuve', value: proof }
                )
                .setTimestamp()
                .setFooter({ text: 'Système de rapport', iconURL: client.user.displayAvatarURL() });
            
            await reportChannel.send({ embeds: [embed] });

            // Envoyer une copie au serveur de support si configuré
            try {
                const configPath = path.join(process.cwd(), 'data/forum_reports.json');
                if (fs.existsSync(configPath)) {
                    const forumReportsData = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
                    const supportGuildId = forumReportsData.config?.supportGuildId;
                    const reportsForumId = forumReportsData.config?.reportsForumId;
                    
                    if (supportGuildId && reportsForumId) {
                        const supportGuild = client.guilds.cache.get(supportGuildId);
                        if (supportGuild) {
                            const forumChannel = supportGuild.channels.cache.get(reportsForumId);
                            if (forumChannel && forumChannel.id !== this.REPORT_CHANNEL_ID) {
                                const threadName = `copie-report-${reported ? reported.username : reportedId}`;
                                const embedCopy = EmbedBuilder.from(embed)
                                    .setTitle(`🚨 [COPIE] Nouveau rapport`);
                                    
                                await forumChannel.threads.create({
                                    name: threadName,
                                    message: {
                                        embeds: [embedCopy]
                                    }
                                }).catch(err => console.error('Erreur lors de la copie du rapport sur le serveur de support:', err));
                            }
                        }
                    }
                }
            } catch (err) {
                console.error('Erreur lors de la lecture de la configuration du serveur de support pour copie:', err);
            }
            
            return {
                success: true,
                message: 'Votre rapport a été envoyé avec succès.'
            };
        } catch (error) {
            console.error('Erreur lors de l\'envoi du rapport:', error);
            return {
                success: false,
                message: 'Une erreur est survenue lors de l\'envoi du rapport.'
            };
        }
    }

    /**
     * Sends a watchlist alert to the report channel
     * @param {import('discord.js').Client} client - The Discord client
     * @param {string} guildId - The guild ID
     * @param {import('discord.js').EmbedBuilder} embed - The alert embed
     * @returns {Promise<{success: boolean, message: string}>}
     */
    async sendWatchlistAlert(client, guildId, embed) {
        try {
            const reportChannel = await client.channels.fetch(this.REPORT_CHANNEL_ID);
            if (!reportChannel) {
                return {
                    success: false,
                    message: 'Le canal de rapport est introuvable.'
                };
            }
            
            // Add guild information to the embed
            const guild = client.guilds.cache.get(guildId);
            if (guild) {
                embed.addFields(
                    { name: 'Serveur', value: `${guild.name} (${guildId})`, inline: true }
                );
            }
            
            await reportChannel.send({ embeds: [embed] });
            
            return {
                success: true,
                message: 'Alerte de watchlist envoyée avec succès.'
            };
        } catch (error) {
            console.error('Erreur lors de l\'envoi de l\'alerte de watchlist:', error);
            return {
                success: false,
                message: 'Une erreur est survenue lors de l\'envoi de l\'alerte de watchlist.'
            };
        }
    }

    /**
     * Sends a general system alert to the report channel
     * @param {import('discord.js').Client} client - The Discord client
     * @param {string} title - Alert title
     * @param {string} description - Alert description
     * @param {Object} fields - Additional fields for the embed
     * @param {string} color - Embed color (hex or number)
     * @returns {Promise<{success: boolean, message: string}>}
     */
    async sendSystemAlert(client, title, description, fields = [], color = 0xff9900) {
        try {
            const reportChannel = await client.channels.fetch(this.REPORT_CHANNEL_ID);
            if (!reportChannel) {
                return {
                    success: false,
                    message: 'Le canal de rapport est introuvable.'
                };
            }
            
            const embed = new EmbedBuilder()
                .setColor(color)
                .setTitle(title)
                .setDescription(description)
                .setTimestamp()
                .setFooter({ text: 'Système de surveillance', iconURL: client.user.displayAvatarURL() });
            
            if (fields.length > 0) {
                embed.addFields(fields);
            }
            
            await reportChannel.send({ embeds: [embed] });
            
            return {
                success: true,
                message: 'Alerte système envoyée avec succès.'
            };
        } catch (error) {
            console.error('Erreur lors de l\'envoi de l\'alerte système:', error);
            return {
                success: false,
                message: 'Une erreur est survenue lors de l\'envoi de l\'alerte système.'
            };
        }
    }

    reload() {
        // ReportManager doesn't have a file to reload, but we add this method for consistency
        console.log('ReportManager rechargé (pas de fichier de configuration).');
    }
}
