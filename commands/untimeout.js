import { SlashCommandBuilder, EmbedBuilder, PermissionsBitField } from 'discord.js';

export default {
    data: new SlashCommandBuilder()
        .setName('untimeout')
        .setDescription('Retirer le timeout d\'un utilisateur')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.ModerateMembers)
        .setDMPermission(false)
        .addUserOption(option =>
            option.setName('utilisateur')
                .setDescription('L\'utilisateur dont retirer le timeout')
                .setRequired(true)
        )
        .addStringOption(option =>
            option.setName('raison')
                .setDescription('La raison du retrait du timeout')
                .setRequired(false)
        ),
    async execute(interaction, adminManager, warnManager, guildConfig, sharedConfig, backupToGitHub, reportManager, banlistManager, blockedWordsManager, watchlistManager, telegramIntegration, funCommandsManager, raidDetector, doxDetector, enhancedReloadSystem, permissionValidator) {
        try {
            const targetUser = interaction.options.getUser('utilisateur');
            const reason = interaction.options.getString('raison') || 'Timeout levé par un modérateur';

            // Get target member from guild
            let targetMember;
            try {
                targetMember = await interaction.guild.members.fetch(targetUser.id);
            } catch (error) {
                return interaction.reply({
                    content: '❌ Utilisateur non trouvé sur ce serveur.',
                    ephemeral: true
                });
            }

            // Check if member is actually timed out
            if (!targetMember.isCommunicationDisabled()) {
                return interaction.reply({
                    content: `ℹ️ L'utilisateur ${targetUser.tag} n'est actuellement pas en timeout.`,
                    ephemeral: true
                });
            }

            // Validate permissions using PermissionValidator
            if (permissionValidator && permissionValidator.validateTimeoutPermission) {
                const permissionResult = permissionValidator.validateTimeoutPermission(
                    interaction.member,
                    targetMember
                );

                if (!permissionResult.success) {
                    return interaction.reply({
                        content: permissionResult.message,
                        ephemeral: true
                    });
                }
            } else if (!interaction.member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) {
                return interaction.reply({
                    content: '❌ Vous n\'avez pas la permission de modérer les membres.',
                    ephemeral: true
                });
            }

            // Attempt to DM the user
            let dmSent = false;
            try {
                const dmEmbed = new EmbedBuilder()
                    .setColor('#00FF00')
                    .setTitle(`🔓 Timeout levé sur ${interaction.guild.name}`)
                    .setDescription(`Votre exclusion temporaire a été levée par un modérateur.`)
                    .addFields(
                        { name: 'Raison', value: reason },
                        { name: 'Modérateur', value: interaction.user.tag }
                    )
                    .setTimestamp();

                await targetMember.send({ embeds: [dmEmbed] });
                dmSent = true;
            } catch (dmError) {
                // Ignore DM failure (DMs might be closed)
            }

            // Remove timeout
            await targetMember.timeout(null, `${reason} | Par ${interaction.user.tag}`);

            const successEmbed = new EmbedBuilder()
                .setColor('#00FF00')
                .setTitle('🔓 Timeout levé avec succès')
                .addFields(
                    { name: 'Utilisateur', value: `${targetUser.tag} (${targetUser.id})`, inline: true },
                    { name: 'Modérateur', value: interaction.user.tag, inline: true },
                    { name: 'Raison', value: reason, inline: false },
                    { name: 'Notification MP', value: dmSent ? '✅ Envoyée' : '❌ Non envoyée (MP fermés)', inline: true }
                )
                .setTimestamp();

            await interaction.reply({ embeds: [successEmbed] });

            // Log the action with ModerationLogger
            if (reportManager && reportManager.moderationLogger) {
                await reportManager.moderationLogger.logModerationAction({
                    type: 'untimeout',
                    moderatorId: interaction.user.id,
                    moderatorTag: interaction.user.tag,
                    targetId: targetUser.id,
                    targetTag: targetUser.tag,
                    guildId: interaction.guild.id,
                    guildName: interaction.guild.name,
                    reason: reason,
                    success: true,
                    channelId: interaction.channel.id,
                    details: { dmSent }
                });
            }

            console.log(`[UNTIMEOUT] ${targetUser.tag} (${targetUser.id}) libéré du timeout par ${interaction.user.tag} (${interaction.user.id}) - Raison: ${reason}`);

        } catch (error) {
            console.error('Erreur lors du untimeout:', error);
            const errorMsg = error.message || 'Une erreur inattendue est survenue.';
            if (interaction.deferred || interaction.replied) {
                await interaction.editReply({ content: `❌ Erreur lors du retrait du timeout: ${errorMsg}` });
            } else {
                await interaction.reply({ content: `❌ Erreur lors du retrait du timeout: ${errorMsg}`, ephemeral: true });
            }
        }
    }
};
