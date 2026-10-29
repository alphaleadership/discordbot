import { SlashCommandBuilder, EmbedBuilder, PermissionsBitField } from 'discord.js';

export default {
    data: new SlashCommandBuilder()
        .setName('banlist-purge')
        .setDescription('Purger de la banlist les entrées corrompues, sans raison ou sans compte Discord')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator)
        .addBooleanOption(option =>
            option.setName('verifier-comptes')
                .setDescription('Vérifier et purger également les comptes supprimés de Discord (plus lent)')
                .setRequired(false)
        ),
    async execute(interaction, adminManager, warnManager, guildConfig, sharedConfig, backupToGitHub, reportManager, banlistManager) {
        try {
            const isBotAdmin = await adminManager.isAdmin(interaction.user.id);
            if (!isBotAdmin && !interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
                return interaction.reply({
                    content: '❌ Cette commande est réservée aux administrateurs du bot.',
                    ephemeral: true
                });
            }

            await interaction.deferReply({ ephemeral: true });

            const checkAccounts = interaction.options.getBoolean('verifier-comptes') ?? false;

            // 1. Purge des entrées sans raison
            const purgeResults = await banlistManager.purgeEntriesWithoutReason();

            // 2. Nettoyage des comptes supprimés si demandé
            let deletedResults = { checked: 0, removed: 0, errors: 0 };
            if (checkAccounts) {
                deletedResults = await banlistManager.cleanupDeletedUsers(interaction.client);
            }

            const embed = new EmbedBuilder()
                .setColor('#00FF00')
                .setTitle('🧹 Purge de la banlist terminée')
                .setDescription(`Rapport d'assainissement de la banlist globale (\`banlist.txt\`).`)
                .addFields(
                    { name: 'Entrées examinées', value: `${purgeResults.checked}`, inline: true },
                    { name: 'Sans raison purgées', value: `${purgeResults.removed}`, inline: true },
                    { name: 'Comptes fantômes supprimés', value: checkAccounts ? `${deletedResults.removed}` : 'Non vérifiés', inline: true }
                )
                .setTimestamp();

            if (purgeResults.purgedUsers && purgeResults.purgedUsers.length > 0) {
                const sample = purgeResults.purgedUsers.slice(0, 5).map(u => `• ID: \`${u.userId}\` (${u.reason})`).join('\n');
                embed.addFields({
                    name: `Exemples d'entrées purgées (${purgeResults.purgedUsers.length} au total)`,
                    value: sample.length > 1024 ? sample.substring(0, 1020) + '...' : sample,
                    inline: false
                });
            }

            return interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error('Erreur lors de la purge de la banlist:', error);
            const errorMsg = error.message || 'Une erreur inattendue est survenue.';
            if (interaction.deferred || interaction.replied) {
                await interaction.editReply({ content: `❌ Erreur: ${errorMsg}` });
            } else {
                await interaction.reply({ content: `❌ Erreur: ${errorMsg}`, ephemeral: true });
            }
        }
    }
};
