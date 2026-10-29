import { SlashCommandBuilder, EmbedBuilder, PermissionsBitField, ChannelType } from 'discord.js';
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
        .setDescription('Gérer la prise et fin de service (duty) ainsi que les statistiques')
        .setDMPermission(false)
        .addSubcommand(sub =>
            sub.setName('on')
                .setDescription('Prendre son service (duty)')
        )
        .addSubcommand(sub =>
            sub.setName('off')
                .setDescription('Terminer son service (duty)')
        )
        .addSubcommand(sub =>
            sub.setName('setup')
                .setDescription('Configurer le rôle et le salon de logs pour le service (Admin)')
                .addRoleOption(option =>
                    option.setName('role')
                        .setDescription('Le rôle attribué en service')
                        .setRequired(true))
                .addChannelOption(option =>
                    option.setName('logs')
                        .setDescription('Le salon où envoyer les logs de service')
                        .addChannelTypes(ChannelType.GuildText)
                        .setRequired(true))
        )
        .addSubcommand(sub =>
            sub.setName('stats')
                .setDescription('Afficher vos statistiques de service ou celles d\'un modérateur')
                .addUserOption(option =>
                    option.setName('mod')
                        .setDescription('Le modérateur ciblé (optionnel)')
                        .setRequired(false))
        ),

    async execute(interaction, adminManager, warnManager, guildConfig) {
        const subcommand = interaction.options.getSubcommand();
        const guildId = interaction.guild.id;
        const userId = interaction.user.id;

        if (subcommand === 'on') {
            const settings = guildConfig.getServiceSettings(guildId);
            if (!settings || !settings.roleId) {
                return interaction.reply({ content: '❌ Le système de service n\'est pas encore configuré sur ce serveur. Demandez à un administrateur d\'utiliser `/service setup`.', ephemeral: true });
            }

            const role = interaction.guild.roles.cache.get(settings.roleId);
            if (!role) {
                return interaction.reply({ content: '❌ Le rôle de service configuré n\'existe plus. Veuillez refaire `/service setup`.', ephemeral: true });
            }

            const logChannel = interaction.guild.channels.cache.get(settings.logChannelId);
            const activity = loadActivityData();
            const activeKey = `${guildId}_${userId}`;

            if (activity.active[activeKey]) {
                return interaction.reply({ content: '⚠️ Vous êtes déjà en service !', ephemeral: true });
            }

            try {
                await interaction.member.roles.add(role, 'Prise de service');
                activity.active[activeKey] = {
                    guildId,
                    userId,
                    start: Date.now()
                };
                saveActivityData(activity);

                const embed = new EmbedBuilder()
                    .setTitle('🟢 Prise de service')
                    .setDescription(`${interaction.user} a **pris son service** !`)
                    .setColor('#22c55e')
                    .setTimestamp();

                if (logChannel) {
                    await logChannel.send({ embeds: [embed] }).catch(() => {});
                }

                return interaction.reply({ content: '✅ Vous avez pris votre service !', ephemeral: true });
            } catch (err) {
                console.error('Erreur service on:', err);
                return interaction.reply({ content: '❌ Impossible de vous attribuer le rôle de service (vérifiez la hiérarchie des rôles).', ephemeral: true });
            }
        }

        if (subcommand === 'off') {
            const settings = guildConfig.getServiceSettings(guildId);
            if (!settings || !settings.roleId) {
                return interaction.reply({ content: '❌ Le système de service n\'est pas encore configuré sur ce serveur.', ephemeral: true });
            }

            const role = interaction.guild.roles.cache.get(settings.roleId);
            if (!role) {
                return interaction.reply({ content: '❌ Le rôle de service configuré n\'existe plus.', ephemeral: true });
            }

            const logChannel = interaction.guild.channels.cache.get(settings.logChannelId);
            const activity = loadActivityData();
            const activeKey = `${guildId}_${userId}`;

            if (!activity.active[activeKey]) {
                if (interaction.member.roles.cache.has(role.id)) {
                    await interaction.member.roles.remove(role, 'Fin de service forcé').catch(() => {});
                }
                return interaction.reply({ content: '⚠️ Vous n\'étiez pas enregistré en service.', ephemeral: true });
            }

            try {
                await interaction.member.roles.remove(role, 'Fin de service');

                const session = activity.active[activeKey];
                const durationMs = Date.now() - session.start;
                const durationMinutes = Math.round(durationMs / 60000);

                activity.history.push({
                    guildId,
                    userId,
                    start: session.start,
                    end: Date.now(),
                    durationMinutes
                });

                delete activity.active[activeKey];
                saveActivityData(activity);

                const hours = Math.floor(durationMinutes / 60);
                const mins = durationMinutes % 60;
                const timeString = `${hours}h ${mins}m`;

                const embed = new EmbedBuilder()
                    .setTitle('🔴 Fin de service')
                    .setDescription(`${interaction.user} a **terminé son service** !`)
                    .addFields({ name: 'Durée du service', value: timeString, inline: true })
                    .setColor('#ef4444')
                    .setTimestamp();

                if (logChannel) {
                    await logChannel.send({ embeds: [embed] }).catch(() => {});
                }

                return interaction.reply({ content: `✅ Service terminé ! Durée : **${timeString}**.`, ephemeral: true });
            } catch (err) {
                console.error('Erreur service off:', err);
                return interaction.reply({ content: '❌ Impossible de retirer le rôle de service.', ephemeral: true });
            }
        }

        if (subcommand === 'setup') {
            if (!interaction.memberPermissions?.has(PermissionsBitField.Flags.Administrator) && !adminManager?.isAdmin(interaction.user.id)) {
                return interaction.reply({ content: '❌ Seuls les administrateurs peuvent configurer le service.', ephemeral: true });
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

        if (subcommand === 'stats') {
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
                .setThumbnail(targetUser.displayAvatarURL ? targetUser.displayAvatarURL({ dynamic: true }) : null)
                .setTimestamp();

            return interaction.reply({ embeds: [embed] });
        }
    }
};
