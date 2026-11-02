import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';

export default {
    data: new SlashCommandBuilder()
        .setName('gamble')
        .setDescription('Parier vos coins sur un lancer de pièce ou de dés')
        .addIntegerOption(option =>
            option.setName('mise')
                .setDescription('Montant de coins à parier (entre 10 et 25 000)')
                .setRequired(true)
                .setMinValue(10)
                .setMaxValue(25000)
        )
        .addStringOption(option =>
            option.setName('jeu')
                .setDescription('Le pari choisi')
                .setRequired(true)
                .addChoices(
                    { name: '🪙 Pile (Cote x2)', value: 'pile' },
                    { name: '🪙 Face (Cote x2)', value: 'face' },
                    { name: '🎲 Dés Hauts (Score 7-12, Cote x2)', value: 'des_haut' },
                    { name: '🎲 Dés Bas (Score 2-6, Cote x2)', value: 'des_bas' }
                )
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

            const bet = interaction.options.getInteger('mise');
            const choice = interaction.options.getString('jeu');
            const userId = interaction.user.id;
            const guildId = interaction.guild.id;

            const currentBalance = await ecoManager.getBalance(userId, guildId);
            if (currentBalance < bet) {
                return interaction.reply({
                    content: `❌ Solde insuffisant ! Votre solde est de **${currentBalance.toLocaleString()}** coins.`,
                    ephemeral: true
                });
            }

            let isWin = false;
            let resultDetail = '';

            if (choice === 'pile' || choice === 'face') {
                const flip = Math.random() < 0.5 ? 'pile' : 'face';
                const coinEmoji = flip === 'pile' ? '🪙 Pile' : '🪙 Face';
                isWin = flip === choice;
                resultDetail = `La pièce retombe sur **${coinEmoji}** !`;
            } else {
                // Two dice (2d6, range 2 to 12)
                const d1 = Math.floor(Math.random() * 6) + 1;
                const d2 = Math.floor(Math.random() * 6) + 1;
                const total = d1 + d2;
                const isHigh = total >= 7;

                isWin = (choice === 'des_haut' && isHigh) || (choice === 'des_bas' && !isHigh);
                resultDetail = `Les dés affichent **[${d1}] + [${d2}] = ${total}** (${isHigh ? 'Dés Hauts' : 'Dés Bas'}) !`;
            }

            let newBalance = currentBalance;
            if (isWin) {
                await ecoManager.addCurrency(userId, guildId, bet, `Victoire Pari Gamble (${choice})`);
                newBalance = await ecoManager.getBalance(userId, guildId);
            } else {
                await ecoManager.removeCurrency(userId, guildId, bet, `Perte Pari Gamble (${choice})`);
                newBalance = await ecoManager.getBalance(userId, guildId);
            }

            const embed = new EmbedBuilder()
                .setColor(isWin ? '#00FF00' : '#FF0000')
                .setTitle('🎲 Jeu de Hasard (Gamble)')
                .setDescription(
                    `${resultDetail}\n\n` +
                    `• **Votre choix** : \`${choice}\`\n` +
                    `• **Mise** : \`${bet.toLocaleString()}\` coins\n` +
                    `• **Résultat** : ${isWin ? `🎉 **GAGNÉ !** Vous doublez votre mise (+${bet.toLocaleString()} coins)` : `💥 **PERDU !** (-${bet.toLocaleString()} coins)`}\n` +
                    `• **Nouveau solde** : \`${newBalance.toLocaleString()}\` coins`
                )
                .setFooter({ text: `Joueur: ${interaction.user.tag}` })
                .setTimestamp();

            return interaction.reply({ embeds: [embed] });

        } catch (error) {
            console.error('Erreur lors du pari gamble:', error);
            const errorMsg = error.message || 'Une erreur inattendue est survenue.';
            if (interaction.deferred || interaction.replied) {
                await interaction.editReply({ content: `❌ Erreur: ${errorMsg}` });
            } else {
                await interaction.reply({ content: `❌ Erreur: ${errorMsg}`, ephemeral: true });
            }
        }
    }
};
