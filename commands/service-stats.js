import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import fs from 'fs';
import path from 'path';

const dbPath = path.join(process.cwd(), 'data', 'services_activity.json');

function loadActivityData() {
    try {
        if (fs.existsSync(dbPath)) {
            return JSON.parse(fs.readFileSync(dbPath, 'utf8'));
        }
    } catch (e) {
        console.error('Erreur lecture services_activity.json:', e);
    }
    return { active: {}, history: [] };
}

export default {
    data: new SlashCommandBuilder()
        .setName('service-stats')
        .setDescription('Afficher vos statistiques ou celles d\'un modérateur')
        .setDMPermission(false)
        .addUserOption(option =>
            option.setName('mod')
                .setDescription('Le modérateur ciblé (optionnel)')
                .setRequired(false)),

    async execute(interaction, adminManager, warnManager, guildConfig) {
        const guildId = interaction.guild.id;
        const targetUser = interaction.options.getUser('mod') || interaction.user;
        
        const activity = loadActivityData();
        const targetHistory = activity.history.filter(h => h.guildId === guildId && h.userId === targetUser.id);
        const isCurrentlyActive = activity.active[`${guildId}_${targetUser.id}`];

        const totalSessions = targetHistory.length;
        const totalMinutes = targetHistory.reduce((sum, h) => sum + h.durationMinutes, 0);

        const totalHours = Math.floor(totalMinutes / 60);
        const totalMins = totalMinutes % 60;
        const totalTimeString = `${totalHours}h ${totalMins}m`;

        const embed = new EmbedBuilder()
            .setTitle(`📊 Statistiques de Service - ${targetUser.username}`)
            .addFields(
                { name: 'Statut Actuel', value: isCurrentlyActive ? '🟢 En service' : '🔴 Hors service', inline: false },
                { name: 'Sessions terminées', value: `${totalSessions}`, inline: true },
                { name: 'Temps total cumulé', value: totalTimeString, inline: true }
            )
            .setColor('#3b82f6')
            .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
            .setTimestamp();

        return interaction.reply({ embeds: [embed] });
    }
};
