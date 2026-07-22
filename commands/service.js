import { SlashCommandBuilder, EmbedBuilder, PermissionsBitField, ChannelType } from 'discord.js';
import fs from 'fs';
import path from 'path';

// Stockage persistant de l'état des services et historique/stats
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

function saveActivityData(data) {
    try {
        const dir = path.dirname(dbPath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(dbPath, JSON.stringify(data, null, 2), 'utf8');
    } catch (e) {
        console.error('Erreur écriture services_activity.json:', e);
    }
}

export default {
    data: new SlashCommandBuilder()
        .setName('service')
        .setDescription('Gestion de la prise et fin de service (duty/shift)')
        .setDMPermission(false)
        .addSubcommand(subcommand =>
            subcommand
                .setName('setup')
                .setDescription('Configure le rôle et le salon de logs pour la prise de service')
                .addRoleOption(option =>
                    option.setName('role')
                        .setDescription('Le rôle attribué en service')
                        .setRequired(true))
                .addChannelOption(option =>
                    option.setName('logs')
                        .setDescription('Le salon où envoyer les logs de service')
                        .addChannelTypes(ChannelType.GuildText)
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('on')
                .setDescription('Prendre son service'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('off')
                .setDescription('Terminer son service'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('stats')
                .setDescription('Afficher vos statistiques ou celles d\'un modérateur')
                .addUserOption(option =>
                    option.setName('mod')
                        .setDescription('Le modérateur ciblé (optionnel)')
                        .setRequired(false))),

    async execute(interaction, adminManager, warnManager, guildConfig) {
        const subcommand = interaction.options.getSubcommand();
        const guildId = interaction.guild.id;
        const userId = interaction.user.id;

        // Configuration du système de service
        if (subcommand === 'setup') {
            // Vérifier les permissions administratives
            if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
                return interaction.reply({ content: '❌ Vous devez être administrateur pour configurer ce système.', ephemeral: true });
            }

            const role = interaction.options.getRole('role');
            const logChannel = interaction.options.getChannel('logs');

            guildConfig.setServiceSettings(guildId, role.id, logChannel.id);

            const embed = new EmbedBuilder()
                .setTitle('⚙️ Service configuré')
                .setDescription('Le système de prise de service a été configuré avec succès !')
                .addFields(
                    { name: 'Rôle de service', value: `${role}`, inline: true },
                    { name: 'Salon de logs', value: `${logChannel}`, inline: true }
                )
                .setColor('#3b82f6')
                .setTimestamp();

            return interaction.reply({ embeds: [embed] });
        }

        // Chargement de la configuration
        const settings = guildConfig.getServiceSettings(guildId);
        if (!settings || !settings.roleId) {
            return interaction.reply({ content: '❌ Le système de service n\'est pas encore configuré sur ce serveur. Demandez à un administrateur d\'utiliser `/service setup`.', ephemeral: true });
        }

        const role = interaction.guild.roles.cache.get(settings.roleId);
        if (!role) {
            return interaction.reply({ content: '❌ Le rôle de service configuré n\'existe plus. Veuillez refaire le `/service setup`.', ephemeral: true });
        }

        const logChannel = interaction.guild.channels.cache.get(settings.logChannelId);
        const activity = loadActivityData();
        const activeKey = `${guildId}_${userId}`;

        if (subcommand === 'on') {
            if (activity.active[activeKey]) {
                return interaction.reply({ content: '⚠️ Vous êtes déjà en service !', ephemeral: true });
            }

            try {
                // Donner le rôle de service
                await interaction.member.roles.add(role, 'Prise de service');

                activity.active[activeKey] = {
                    start: Date.now(),
                    tag: interaction.user.tag
                };
                saveActivityData(activity);

                const embed = new EmbedBuilder()
                    .setTitle('🟢 Prise de Service')
                    .setDescription(`${interaction.user} a pris son service.`)
                    .setColor('#10b981')
                    .setTimestamp();

                await interaction.reply({ embeds: [embed] });

                if (logChannel) {
                    await logChannel.send({ embeds: [embed] }).catch(() => {});
                }
            } catch (err) {
                console.error(err);
                return interaction.reply({ content: '❌ Impossible de vous attribuer le rôle de service. Vérifiez les permissions et la hiérarchie du bot.', ephemeral: true });
            }
        }
        else if (subcommand === 'off') {
            if (!activity.active[activeKey]) {
                // Retrait préventif du rôle s'il est présent
                if (interaction.member.roles.cache.has(role.id)) {
                    await interaction.member.roles.remove(role, 'Fin de service forcé').catch(() => {});
                }
                return interaction.reply({ content: '⚠️ Vous n\'étiez pas enregistré en service.', ephemeral: true });
            }

            try {
                // Retirer le rôle de service
                await interaction.member.roles.remove(role, 'Fin de service');

                const session = activity.active[activeKey];
                const durationMs = Date.now() - session.start;
                const durationMinutes = Math.round(durationMs / 60000);

                // Enregistrer l'historique
                activity.history.push({
                    guildId,
                    userId,
                    tag: interaction.user.tag,
                    start: session.start,
                    end: Date.now(),
                    durationMinutes
                });

                delete activity.active[activeKey];
                saveActivityData(activity);

                // Formater le temps passé
                const hours = Math.floor(durationMinutes / 60);
                const mins = durationMinutes % 60;
                const timeString = hours > 0 ? `${hours}h ${mins}m` : `${mins}min`;

                const embed = new EmbedBuilder()
                    .setTitle('🔴 Fin de Service')
                    .setDescription(`${interaction.user} a terminé son service.`)
                    .addFields(
                        { name: 'Durée de la session', value: timeString }
                    )
                    .setColor('#ef4444')
                    .setTimestamp();

                await interaction.reply({ embeds: [embed] });

                if (logChannel) {
                    await logChannel.send({ embeds: [embed] }).catch(() => {});
                }
            } catch (err) {
                console.error(err);
                return interaction.reply({ content: '❌ Impossible de modifier vos rôles. Vérifiez la hiérarchie du bot.', ephemeral: true });
            }
        }
        else if (subcommand === 'stats') {
            const targetUser = interaction.options.getUser('mod') || interaction.user;
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
    }
};
