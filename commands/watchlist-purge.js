import { SlashCommandBuilder, EmbedBuilder, PermissionsBitField } from 'discord.js';

export default {
    data: new SlashCommandBuilder()
        .setName('watchlist-purge')
        .setDescription('Purger de la surveillance (watchlist) les entrées sans raison valide ou orphelines')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator)
        .addBooleanOption(option =>
            option.setName('verifier-comptes')
                .setDescription('Vérifier et purger également les comptes supprimés de Discord (plus lent)')
                .setRequired(false)
        ),
    async execute(interaction, adminManager, warnManager, guildConfig, sharedConfig, backupToGitHub, reportManager, banlistManager, blockedWordsManager, watchlistManager) {
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

            // 1. Purge des entrées sans motif ou invalides
            const purgeResults = await watchlistManager.purgeEntriesWithoutReason();

            // 2. Nettoyage des comptes supprimés si demandé
            let deletedResults = { checked: 0, removed: 0, errors: 0 };
            if (checkAccounts) {
                deletedResults = await watchlistManager.cleanupDeletedUsers(interaction.client);
            }

            const embed = new EmbedBuilder()
                .setColor('#00FF00')
                .setTitle('🧹 Purge de la Watchlist terminée')
                .setDescription(`Rapport d'assainissement de la base de surveillance (\`data/watchlist.json\`).`)
                .addFields(
                    { name: 'Entrées examinées', value: `${purgeResults.checked}`, inline: true },
                    { name: 'Sans raison purgées', value: `${purgeResults.removed}`, inline: true },
                    { name: 'Comptes fantômes supprimés', value: checkAccounts ? `${deletedResults.removed}` : 'Non vérifiés', inline: true }
                )
                .setTimestamp();

            if (purgeResults.purgedKeys && purgeResults.purgedKeys.length > 0) {
                const sample = purgeResults.purgedKeys.slice(0, 10).map(k => `• \`${k}\``).join('\n');
                embed.addFields({
                    name: `Clés supprimées (${purgeResults.purgedKeys.length} au total)`,
                    value: sample.length > 1024 ? sample.substring(0, 1020) + '...' : sample,
                    inline: false
                });
            }

            return interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error('Erreur lors de la purge de la watchlist:', error);
            const errorMsg = error.message || 'Une erreur inattendue est survenue.';
            if (interaction.deferred || interaction.replied) {
                await interaction.editReply({ content: `❌ Erreur: ${errorMsg}` });
            } else {
                await interaction.reply({ content: `❌ Erreur: ${errorMsg}`, ephemeral: true });
            }
        }
    }
};
