
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

    reload() {
        // ReportManager doesn't have a file to reload, but we add this method for consistency
        console.log('ReportManager rechargé (pas de fichier de configuration).');
    }
}
