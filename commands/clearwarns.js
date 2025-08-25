import { SlashCommandBuilder, PermissionsBitField } from 'discord.js';
import { localWarnManager, globalWarnManager } from '../utils/WarnManager.js';

export default {
    data: new SlashCommandBuilder()
        .setName('clearwarns')
        .setDescription('Supprimer un ou tous les avertissements d\'un utilisateur')
        .addUserOption(option =>
            option.setName('utilisateur')
                .setDescription('L\'utilisateur dont supprimer les avertissements')
                .setRequired(true)
        )
        .addStringOption(option =>
            option.setName('id_avertissement')
                .setDescription('L\'ID de l\'avertissement à supprimer (laisser vide pour tout supprimer)')
                .setRequired(false)
        )
        .addBooleanOption(option =>
            option.setName('global')
                .setDescription('Supprimer un avertissement global')
                .setRequired(false)
        ),
    async execute(interaction, adminManager, warnManager, guildConfig, sharedConfig, backupToGitHub, reportManager, banlistManager, blockedWordsManager, watchlistManager, telegramIntegration, funCommandsManager, raidDetector, doxDetector, enhancedReloadSystem, permissionValidator) {
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

        const user = interaction.options.getUser('utilisateur');
        const warnId = interaction.options.getString('id_avertissement');
        const isGlobal = interaction.options.getBoolean('global') ?? false;
        
      
        const guildId = isGlobal ? 'global' : interaction.guild.id;

        const userWarns = warnManager.getWarns(guildId, user.id);
        if (userWarns.length === 0) {
            return interaction.reply({
                content: `ℹ️ ${user} n'a aucun avertissement ${isGlobal ? 'global' : 'local'}.`,
                ephemeral: true
            });
        }

        try {
            let result;
            if (warnId) {
                const success = warnManager.removeWarn(guildId, user.id, warnId);
                if (!success) {
                    return interaction.reply({
                        content: `❌ Aucun avertissement avec l\'ID ``${warnId}`` trouvé pour ${user} ${isGlobal ? 'globalement' : 'localement'}.`,
                        ephemeral: true
                    });
                }
                result = `L\'avertissement ``${warnId}`` a été supprimé pour ${user}.`;
            } else {
                warnManager.clearWarns(guildId, user.id);
                result = `Tous les avertissements ${isGlobal ? 'globaux' : 'locaux'} de ${user} ont été supprimés.`;
            }

            interaction.reply({
                content: `✅ ${result}`,
                ephemeral: false
            });
        } catch (error) {
            console.error('Erreur lors de la suppression des avertissements:', error);
            interaction.reply({
                content: '❌ Une erreur est survenue lors de la suppression des avertissements.',
                ephemeral: true
            });
        }
    },
};