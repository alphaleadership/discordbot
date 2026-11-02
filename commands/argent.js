import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';

export default {
    data: new SlashCommandBuilder()
        .setName('argent')
        .setDescription('Consulter les sous et statistiques économiques d\'un utilisateur')
        .addUserOption(option =>
            option.setName('utilisateur')
                .setDescription('L\'utilisateur dont consulter l\'argent (par défaut vous-même)')
                .setRequired(false)
        )
        .addStringOption(option =>
            option.setName('id')
                .setDescription('ID Discord de l\'utilisateur à vérifier (optionnel)')
                .setRequired(false)
        ),
    async execute(interaction, adminManager, warnManager, guildConfig, sharedConfig, backupToGitHub, reportManager, banlistManager, blockedWordsManager, watchlistManager, telegramIntegration, funCommandsManager, raidDetector, doxDetector, enhancedReloadSystem, permissionValidator, economyManager) {
        try {
            if (!interaction.inGuild()) {
                return interaction.reply({
                    content: '❌ Cette commande ne peut être utilisée que dans un serveur.',
                    ephemeral: true
                });
            }

            const ecoManager = (economyManager && typeof economyManager.getBalance === 'function')
                ? economyManager
                : [arguments[16], arguments[17], arguments[18], arguments[19]].find(arg => arg && typeof arg.getBalance === 'function') || economyManager;

            if (!ecoManager || typeof ecoManager.getUserStats !== 'function') {
                return interaction.reply({
                    content: '❌ Le système économique n\'est pas disponible.',
                    ephemeral: true
                });
            }

            const inputUser = interaction.options.getUser('utilisateur');
            const inputId = interaction.options.getString('id')?.trim();

            let targetId = inputUser?.id || inputId || interaction.user.id;
            let targetTag = inputUser?.tag || interaction.user.tag;
            let avatarUrl = inputUser?.displayAvatarURL?.({ dynamic: true }) || interaction.user.displayAvatarURL?.({ dynamic: true });

            if (inputId && !inputUser && inputId !== interaction.user.id) {
                if (!/^\d{17,20}$/.test(inputId)) {
                    return interaction.reply({
                        content: '❌ L\'identifiant Discord fourni est invalide.',
                        ephemeral: true
                    });
                }
                try {
                    const fetched = await interaction.client.users.fetch(inputId);
                    if (fetched) {
                        targetTag = fetched.tag;
                        avatarUrl = fetched.displayAvatarURL?.({ dynamic: true });
                    }
                } catch (e) {
                    targetTag = `Utilisateur (\`${inputId}\`)`;
                }
            }

            const guildId = interaction.guild.id;
            const stats = await ecoManager.getUserStats(targetId, guildId);

            if (!stats) {
                return interaction.reply({
                    content: `❌ Impossible de récupérer les données économiques pour cet utilisateur.`,
                    ephemeral: true
                });
            }

            const realValue = Math.round(stats.balance * stats.currentValue);

            const embed = new EmbedBuilder()
                .setColor('#FFD700')
                .setTitle(`💰 Porte-monnaie de ${targetTag}`)
                .setDescription(`Compte local sur **${interaction.guild.name}** et compte bancaire inter-serveur`)
                .addFields(
                    {
                        name: '💵 Portefeuille local',
                        value: `**${stats.balance.toLocaleString()}** coins`,
                        inline: true
                    },
                    {
                        name: '🏦 Banque inter-serveur',
                        value: `**${(stats.bankBalance ?? 0).toLocaleString()}** coins`,
                        inline: true
                    },
                    {
                        name: '💎 Patrimoine total',
                        value: `**${(stats.netWorth ?? stats.balance).toLocaleString()}** coins`,
                        inline: true
                    },
                    {
                        name: '📈 Taux de marché',
                        value: `**${stats.currentValue.toFixed(2)}x**`,
                        inline: true
                    },
                    {
                        name: '📊 Total gagné',
                        value: `${stats.totalEarned.toLocaleString()} coins`,
                        inline: true
                    },
                    {
                        name: '💸 Total dépensé',
                        value: `${stats.totalSpent.toLocaleString()} coins`,
                        inline: true
                    },
                    {
                        name: '🎁 Bonus quotidien',
                        value: stats.canClaimDaily ? '✅ Disponible (`/daily-bonus`)' : '❌ Déjà réclamé',
                        inline: true
                    }
                )
                .setFooter({
                    text: `Dernière activité: ${stats.lastActivity ? new Date(stats.lastActivity).toLocaleDateString('fr-FR') : 'Aucune'}`
                })
                .setTimestamp();

            if (avatarUrl) {
                embed.setThumbnail(avatarUrl);
            }

            return interaction.reply({ embeds: [embed] });

        } catch (error) {
            console.error('Erreur lors de la commande argent:', error);
            const errorMsg = error.message || 'Une erreur inattendue est survenue.';
            if (interaction.deferred || interaction.replied) {
                await interaction.editReply({ content: `❌ Erreur: ${errorMsg}` });
            } else {
                await interaction.reply({ content: `❌ Erreur: ${errorMsg}`, ephemeral: true });
            }
        }
    }
};
