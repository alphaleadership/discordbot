import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';

export default {
    data: new SlashCommandBuilder()
        .setName('inventory')
        .setDescription('Consulter votre inventaire d\'objets achetés dans la boutique du serveur')
        .addUserOption(option =>
            option.setName('utilisateur')
                .setDescription('Voir l\'inventaire d\'un autre membre (optionnel)')
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

            if (!ecoManager) {
                return interaction.reply({
                    content: '❌ Le système d\'économie n\'est pas disponible actuellement.',
                    ephemeral: true
                });
            }

            const targetUser = interaction.options.getUser('utilisateur') || interaction.user;
            const guildId = interaction.guild.id;

            const purchases = await ecoManager.getUserPurchases(targetUser.id, guildId);
            const shopItems = await ecoManager.getShopItems(guildId);

            const isSelf = targetUser.id === interaction.user.id;
            const embed = new EmbedBuilder()
                .setTitle(`🎒 Inventaire de ${targetUser.username}`)
                .setTimestamp();

            if (typeof targetUser.displayAvatarURL === 'function') {
                embed.setThumbnail(targetUser.displayAvatarURL({ dynamic: true }));
            }

            if (!purchases || purchases.length === 0) {
                embed.setColor('#FFA500')
                    .setDescription(
                        isSelf
                            ? '📦 Votre inventaire est vide ! Vous n\'avez encore acheté aucun article.\n\nUtilisez `/shop list` pour découvrir les articles disponibles et `/shop buy` pour en acquérir !'
                            : `📦 L'inventaire de **${targetUser.username}** est actuellement vide.`
                    );
                return interaction.reply({ embeds: [embed] });
            }

            embed.setColor('#3498DB')
                .setDescription(`Voici la liste des articles acquis dans la boutique :`);

            let totalSpent = 0;
            for (const item of purchases) {
                const shopDetail = shopItems ? shopItems[item.itemId] : null;
                const itemName = shopDetail ? shopDetail.name : (item.itemId || 'Article Inconnu');
                const itemDesc = shopDetail ? shopDetail.description : 'Objet acquis via la boutique';
                const dateStr = item.lastPurchased ? new Date(item.lastPurchased).toLocaleDateString('fr-FR') : 'Date inconnue';

                totalSpent += item.totalSpent || 0;

                embed.addFields({
                    name: `📦 ${itemName} (x${item.quantity})`,
                    value: `• **Description** : ${itemDesc}\n• **Total investi** : \`${(item.totalSpent || 0).toLocaleString()}\` coins\n• **Dernier achat** : ${dateStr}`,
                    inline: false
                });
            }

            embed.setFooter({
                text: `${purchases.length} article(s) différent(s) • Total dépensé : ${totalSpent.toLocaleString()} coins`
            });

            return interaction.reply({ embeds: [embed] });

        } catch (error) {
            console.error('Erreur lors de la consultation de l\'inventaire:', error);
            const errorMsg = error.message || 'Une erreur inattendue est survenue.';
            if (interaction.deferred || interaction.replied) {
                await interaction.editReply({ content: `❌ Erreur: ${errorMsg}` });
            } else {
                await interaction.reply({ content: `❌ Erreur: ${errorMsg}`, ephemeral: true });
            }
        }
    }
};
