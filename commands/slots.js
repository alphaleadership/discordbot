import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';

export default {
    data: new SlashCommandBuilder()
        .setName('slots')
        .setDescription('Jouer à la machine à sous avec vos coins d\'économie')
        .addIntegerOption(option =>
            option.setName('mise')
                .setDescription('Montant de coins à miser (entre 10 et 50 000)')
                .setRequired(true)
                .setMinValue(10)
                .setMaxValue(50000)
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
            const userId = interaction.user.id;
            const guildId = interaction.guild.id;

            const currentBalance = await ecoManager.getBalance(userId, guildId);
            if (currentBalance < bet) {
                return interaction.reply({
                    content: `❌ Solde insuffisant ! Vous disposez actuellement de **${currentBalance.toLocaleString()}** coins, mais vous tentez de miser **${bet.toLocaleString()}** coins.`,
                    ephemeral: true
                });
            }

            // Symbol pool with weighted probability
            const symbols = [
                '🍒', '🍒', '🍒', '🍒', // Cherry
                '🍋', '🍋', '🍋',       // Lemon
                '🍇', '🍇', '🍇',       // Grape
                '🔔', '🔔',             // Bell
                '⭐', '⭐',             // Star
                '💎',                   // Diamond
                '7️⃣'                    // Seven (Jackpot)
            ];

            const getRandomSymbol = () => symbols[Math.floor(Math.random() * symbols.length)];
            const s1 = getRandomSymbol();
            const s2 = getRandomSymbol();
            const s3 = getRandomSymbol();

            let multiplier = 0;
            let outcomeText = '';
            let isWin = false;

            if (s1 === s2 && s2 === s3) {
                isWin = true;
                if (s1 === '7️⃣') {
                    multiplier = 20;
                    outcomeText = '🌟 **MÉGA JACKPOT 777 !!** Vous décrochez le pactole suprême (x20) !';
                } else if (s1 === '💎') {
                    multiplier = 12;
                    outcomeText = '💎 **JACKPOT DIAMANT !** Trois diamants étincelants (x12) !';
                } else if (s1 === '⭐') {
                    multiplier = 8;
                    outcomeText = '⭐ **SUPER ÉTOILE !** Alignement stellaire parfait (x8) !';
                } else if (s1 === '🔔') {
                    multiplier = 6;
                    outcomeText = '🔔 **LES CLOCHES DE LA FORTUNE !** Triple cloche (x6) !';
                } else {
                    multiplier = 4;
                    outcomeText = `🎉 **TRIPLE ${s1} !** Magnifique combinaison gagnante (x4) !`;
                }
            } else if (s1 === s2 || s2 === s3 || s1 === s3) {
                isWin = true;
                multiplier = 1.5;
                const matchSym = (s1 === s2 || s1 === s3) ? s1 : s2;
                outcomeText = `✨ **PAIRE DE ${matchSym} !** Petite victoire rassurante (x1.5) !`;
            } else {
                outcomeText = '💸 **Pas de combinaison !** Vous perdez votre mise. Tentez à nouveau votre chance !';
            }

            let newBalance = currentBalance;

            if (isWin) {
                const totalReturn = Math.floor(bet * multiplier);
                const profit = totalReturn - bet;
                if (profit > 0) {
                    await ecoManager.addCurrency(userId, guildId, profit, `Victoire Slots (${s1} ${s2} ${s3})`);
                }
                newBalance = await ecoManager.getBalance(userId, guildId);
            } else {
                await ecoManager.removeCurrency(userId, guildId, bet, `Perte Slots (${s1} ${s2} ${s3})`);
                newBalance = await ecoManager.getBalance(userId, guildId);
            }

            const embed = new EmbedBuilder()
                .setColor(isWin ? (multiplier >= 6 ? '#FFD700' : '#00FF00') : '#FF0000')
                .setTitle('🎰 Machine à Sous')
                .setDescription(
                    `**[ ${s1} | ${s2} | ${s3} ]**\n\n` +
                    `${outcomeText}\n\n` +
                    `• **Mise** : \`${bet.toLocaleString()}\` coins\n` +
                    `• **Résultat** : ${isWin ? `+${(Math.floor(bet * multiplier) - bet).toLocaleString()} coins` : `-${bet.toLocaleString()} coins`}\n` +
                    `• **Nouveau solde** : \`${newBalance.toLocaleString()}\` coins`
                )
                .setFooter({ text: `Joueur: ${interaction.user.tag}` })
                .setTimestamp();

            return interaction.reply({ embeds: [embed] });

        } catch (error) {
            console.error('Erreur lors de la commande slots:', error);
            const errorMsg = error.message || 'Une erreur inattendue est survenue.';
            if (interaction.deferred || interaction.replied) {
                await interaction.editReply({ content: `❌ Erreur: ${errorMsg}` });
            } else {
                await interaction.reply({ content: `❌ Erreur: ${errorMsg}`, ephemeral: true });
            }
        }
    }
};
