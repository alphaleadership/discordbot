import { SlashCommandBuilder, EmbedBuilder, PermissionsBitField } from 'discord.js';
import { localWarnManager, globalWarnManager } from '../utils/WarnManager.js';

export default {
    data: new SlashCommandBuilder()
        .setName('warn')
        .setDescription('Avertir un utilisateur')
        .addUserOption(option =>
            option.setName('utilisateur')
                .setDescription('L\'utilisateur à avertir')
                .setRequired(true)
        )
        .addStringOption(option =>
            option.setName('raison')
                .setDescription('La raison de l\'avertissement')
                .setRequired(true)
        )
        .addBooleanOption(option =>
            option.setName('global')
                .setDescription('Avertissement global (visible dans tous les serveurs)')
                .setRequired(false)
        ),
    async execute(interaction, adminManager, warnManagerParam, guildConfig, sharedConfig, backupToGitHub, reportManager, banlistManager, blockedWordsManager, watchlistManager, telegramIntegration, funCommandsManager, raidDetector, doxDetector, enhancedReloadSystem, permissionValidator, economyManager, forumReportManager, autoConfigManager, dmTicketManager, customsManager, espionageManager) {
        const isGlobal = interaction.options.getBoolean('global') ?? false;
        const warnManager = isGlobal ? globalWarnManager : localWarnManager;
        const guildId = isGlobal ? 'global' : interaction.guild.id;

        if (!interaction.memberPermissions?.has(PermissionsBitField.Flags.ModerateMembers)) {
            return interaction.reply({
                content: '❌ Vous devez avoir la permission de modérer les membres pour utiliser cette commande.',
                ephemeral: true
            });
        }

        const user = interaction.options.getUser('utilisateur');
        const reason = interaction.options.getString('raison');
        
        if (adminManager.isAdmin(user.id)) {
            return interaction.reply({
                content: '❌ Vous ne pouvez pas avertir un administrateur du bot.',
                ephemeral: true
            });
        }

        if (user.id === interaction.user.id) {
            return interaction.reply({
                content: '❌ Vous ne pouvez pas vous mettre d\'avertissement à vous-même.',
                ephemeral: true
            });
        }

        if (user.bot) {
            return interaction.reply({
                content: '❌ Vous ne pouvez pas avertir un bot.',
                ephemeral: true
            });
        }

        try {
            const warn = warnManager.addWarn(guildId, user.id, reason, interaction.user.id);
            const warnCount = warnManager.getWarnCount(guildId, user.id);

            // Remplissage automatique du dossier d'espionnage lors d'un warn
            if (espionageManager && interaction.guild) {
                const member = await interaction.guild.members.fetch(user.id).catch(() => null);
                if (member) {
                    await espionageManager.addNote(
                        member, 
                        `⚠️ Avertissement reçu : "${reason}" (Nombre total : ${warnCount}/3)`, 
                        interaction.user.id
                    ).catch(() => null);
                }
            }

            const embed = new EmbedBuilder()
                .setColor('#FFA500')
                .setTitle(isGlobal ? '⚠️ Avertissement Global' : '⚠️ Avertissement')
                .setDescription(`Vous avez reçu un avertissement ${isGlobal ? 'global' : `sur ${interaction.guild.name}`}.`)
                .addFields(
                    { name: 'Raison', value: reason },
                    { name: 'Avertissements actuels', value: `${warnCount}/3` },
                    { name: 'Modérateur', value: interaction.user.tag },
                    { name: 'Date', value: new Date(warn.date).toLocaleString('fr-FR') }
                )
                .setFooter({ text: `ID: ${warn.id}` });

            await user.send({ embeds: [embed] }).catch(() => {
                console.log(`Impossible d\'envoyer un MP à ${user.tag}`);
            });

            await interaction.reply({
                content: `✅ ${user} a été averti ${isGlobal ? 'globalement' : 'localement'} pour: ${reason} (Avertissement ${warnCount}/3)`,
                ephemeral: false
            });

            if (!isGlobal && warnCount >= 3) {
                await interaction.guild.members.ban(user.id, { 
                    reason: `3 avertissements locaux atteints. Dernier avertissement: ${reason}`
                });
                
                const banEmbed = new EmbedBuilder()
                    .setColor('#FF0000')
                    .setTitle('🔨 Bannissement')
                    .setDescription(`Vous avez été banni de ${interaction.guild.name} pour avoir atteint 3 avertissements.`)
                    .addFields(
                        { name: 'Dernier avertissement', value: reason },
                        { name: 'Modérateur', value: interaction.user.tag },
                        { name: 'Date', value: new Date().toLocaleString('fr-FR') }
                    );

                await user.send({ embeds: [banEmbed] }).catch(() => {});
                
                warnManager.clearWarns(guildId, user.id);
                
                await interaction.followUp({
                    content: `⚠️ ${user} a été banni pour avoir atteint 3 avertissements.`, 
                    ephemeral: false
                });
            }
        } catch (error) {
            console.error('Erreur lors de l\'avertissement:', error);
            interaction.reply({
                content: '❌ Une erreur est survenue lors de l\'avertissement.',
                ephemeral: true
            });
        }
    },
};