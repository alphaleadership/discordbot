import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { localWarnManager, globalWarnManager } from '../utils/WarnManager.js';

export default {
    data: new SlashCommandBuilder()
        .setName('warnings')
        .setDescription('Voir les avertissements d\'un utilisateur')
        .addUserOption(option =>
            option.setName('utilisateur')
                .setDescription('L\'utilisateur dont voir les avertissements (par défaut: vous-même)')
                .setRequired(false)
        ),
    async execute(interaction) {
        const targetUser = interaction.options.getUser('utilisateur') || interaction.user;
        
        const localGuildId = interaction.guild.id;
        const localWarns = localWarnManager.getWarns(localGuildId, targetUser.id).map(w => ({ ...w, scope: `Serveur: ${interaction.guild.name}` }));
        const globalWarns = globalWarnManager.getWarns('global', targetUser.id).map(w => ({ ...w, scope: 'Global' }));

        const allWarns = [...localWarns, ...globalWarns];

        if (allWarns.length === 0) {
            return interaction.reply({
                content: `ℹ️ ${targetUser === interaction.user ? 'Vous n\'avez' : `${targetUser} n\'a`} aucun avertissement.`,
                ephemeral: true
            });
        }

        const embed = new EmbedBuilder()
            .setColor('#FFA500')
            .setTitle(`⚠️ Avertissements de ${targetUser?.tag || 'Utilisateur inconnu'}`)
            .setThumbnail(targetUser?.displayAvatarURL?.() || null)
            .setDescription(`Total: ${allWarns.length} avertissement(s)`);

        allWarns.slice(0, 25).forEach((warn, index) => {
            const moderator = interaction.guild.members.cache.get(warn.moderatorId)?.user.tag || `ID: ${warn.moderatorId}`;
            embed.addFields({
                name: `Avertissement #${index + 1} (ID: ${warn.id})`,
                value: `**Portée:** ${warn.scope}\n` +
                       `**Raison:** ${warn.reason}\n` +
                       `**Modérateur:** ${moderator}\n` +
                       `**Date:** ${new Date(warn.date).toLocaleString('fr-FR')}`,
                inline: false
            });
        });

        if (allWarns.length > 25) {
            embed.setFooter({ text: `Affiche 25 avertissements sur ${allWarns.length} au total.` });
        }

        interaction.reply({ embeds: [embed], ephemeral: true });
    },
};