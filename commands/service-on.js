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
        .setName('service-on')
        .setDescription('Prendre son service (duty)')
        .setDMPermission(false),

    async execute(interaction, adminManager, warnManager, guildConfig) {
        const guildId = interaction.guild.id;
        const userId = interaction.user.id;

        const settings = guildConfig.getServiceSettings(guildId);
        if (!settings || !settings.roleId) {
            return interaction.reply({ content: '❌ Le système de service n\'est pas encore configuré sur ce serveur. Demandez à un administrateur d\'utiliser `/service-setup`.', ephemeral: true });
        }

        const role = interaction.guild.roles.cache.get(settings.roleId);
        if (!role) {
            return interaction.reply({ content: '❌ Le rôle de service configuré n\'existe plus. Veuillez refaire le `/service-setup`.', ephemeral: true });
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
};
