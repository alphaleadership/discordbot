import { SlashCommandBuilder, EmbedBuilder, PermissionsBitField } from 'discord.js';

export default {
    data: new SlashCommandBuilder()
        .setName('unwarn')
        .setDescription('Retirer un avertissement spécifique d\'un utilisateur par son identifiant')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.ModerateMembers)
        .setDMPermission(false)
        .addUserOption(option =>
            option.setName('utilisateur')
                .setDescription('L\'utilisateur dont retirer l\'avertissement')
                .setRequired(true)
        )
        .addStringOption(option =>
            option.setName('id_avertissement')
                .setDescription('L\'identifiant unique de l\'avertissement à retirer')
                .setRequired(true)
        )
        .addBooleanOption(option =>
            option.setName('global')
                .setDescription('Retirer un avertissement global (au lieu de local)')
                .setRequired(false)
        ),
    async execute(interaction, adminManager, warnManager, guildConfig, sharedConfig, backupToGitHub, reportManager) {
        try {
            if (!interaction.inGuild()) {
                return interaction.reply({
                    content: '❌ Cette commande ne peut être utilisée que dans un serveur.',
                    ephemeral: true
                });
            }

            if (!interaction.memberPermissions?.has(PermissionsBitField.Flags.ModerateMembers)) {
                return interaction.reply({
                    content: '❌ Vous devez avoir la permission de modérer les membres pour utiliser cette commande.',
                    ephemeral: true
                });
            }

            const targetUser = interaction.options.getUser('utilisateur');
            const warnId = interaction.options.getString('id_avertissement');
            const isGlobal = interaction.options.getBoolean('global') ?? false;

            const guildId = isGlobal ? 'global' : interaction.guild.id;
            const userWarns = warnManager.getWarns(guildId, targetUser.id);

            if (userWarns.length === 0) {
                return interaction.reply({
                    content: `ℹ️ ${targetUser.tag} n'a aucun avertissement ${isGlobal ? 'global' : 'sur ce serveur'}.`,
                    ephemeral: true
                });
            }

            const warnToRemove = userWarns.find(w => w.id === warnId);
            if (!warnToRemove) {
                return interaction.reply({
                    content: `❌ Aucun avertissement avec l'identifiant \`${warnId}\` n'a été trouvé pour ${targetUser.tag}. Utilisez \`/warnings\` pour consulter la liste des avertissements.`,
                    ephemeral: true
                });
            }

            const success = warnManager.removeWarn(guildId, targetUser.id, warnId);
            if (!success) {
                return interaction.reply({
                    content: `❌ Échec du retrait de l'avertissement \`${warnId}\`.`,
                    ephemeral: true
                });
            }

            const remainingWarns = warnManager.getWarns(guildId, targetUser.id).length;

            const embed = new EmbedBuilder()
                .setColor('#00FF00')
                .setTitle('🗑️ Avertissement retiré')
                .addFields(
                    { name: 'Utilisateur', value: `${targetUser.tag} (${targetUser.id})`, inline: true },
                    { name: 'Modérateur', value: interaction.user.tag, inline: true },
                    { name: 'ID Avertissement', value: `\`${warnId}\``, inline: true },
                    { name: 'Raison initiale', value: warnToRemove.reason || 'Aucune raison spécifiée', inline: false },
                    { name: 'Avertissements restants', value: `${remainingWarns}`, inline: true },
                    { name: 'Portée', value: isGlobal ? 'Globale' : 'Locale', inline: true }
                )
                .setTimestamp();

            await interaction.reply({ embeds: [embed] });

            // Log action if moderation logger is present
            if (reportManager && reportManager.moderationLogger) {
                await reportManager.moderationLogger.logModerationAction({
                    type: 'unwarn',
                    moderatorId: interaction.user.id,
                    moderatorTag: interaction.user.tag,
                    targetId: targetUser.id,
                    targetTag: targetUser.tag,
                    guildId: interaction.guild.id,
                    guildName: interaction.guild.name,
                    reason: `Retrait du warn ${warnId} (${warnToRemove.reason})`,
                    success: true,
                    channelId: interaction.channel.id,
                    details: {
                        warnId,
                        isGlobal,
                        remainingWarns
                    }
                });
            }

        } catch (error) {
            console.error('Erreur lors du retrait de l\'avertissement:', error);
            const errorMsg = error.message || 'Une erreur inattendue est survenue.';
            if (interaction.deferred || interaction.replied) {
                await interaction.editReply({ content: `❌ Erreur: ${errorMsg}` });
            } else {
                await interaction.reply({ content: `❌ Erreur: ${errorMsg}`, ephemeral: true });
            }
        }
    }
};
