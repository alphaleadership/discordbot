import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';

export default {
    data: new SlashCommandBuilder()
        .setName('roulette')
        .setDescription('Jouer à la roulette de casino avec vos coins d\'économie')
        .addIntegerOption(option =>
            option.setName('mise')
                .setDescription('Montant de coins à parier (entre 10 et 50 000)')
                .setRequired(true)
                .setMinValue(10)
                .setMaxValue(50000)
        )
        .addStringOption(option =>
            option.setName('pari')
                .setDescription('Type de pari')
                .setRequired(true)
                .addChoices(
                    { name: 'Rouge (x2)', value: 'rouge' },
                    { name: 'Noir (x2)', value: 'noir' },
                    { name: 'Pair (x2)', value: 'pair' },
                    { name: 'Impair (x2)', value: 'impair' },
                    { name: 'Vert / Zéro (x14)', value: 'vert' },
                    { name: 'Numéro exact (x36)', value: 'nombre' }
                )
        )
        .addIntegerOption(option =>
            option.setName('numero')
                .setDescription('Le numéro précis choisi (0 à 36) si vous avez sélectionné "Numéro exact"')
                .setRequired(false)
                .setMinValue(0)
                .setMaxValue(36)
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
            const betType = interaction.options.getString('pari');
            const betNumber = interaction.options.getInteger('numero');
            const userId = interaction.user.id;
            const guildId = interaction.guild.id;

            if (betType === 'nombre' && (betNumber === null || betNumber === undefined)) {
                return interaction.reply({
                    content: '❌ Vous devez spécifier l\'option `numero` (entre 0 et 36) lorsque vous pariez sur un "Numéro exact".',
                    ephemeral: true
                });
            }

            const currentBalance = await ecoManager.getBalance(userId, guildId);
            if (currentBalance < bet) {
                return interaction.reply({
                    content: `❌ Solde insuffisant ! Votre solde actuel est de **${currentBalance.toLocaleString()}** coins.`,
                    ephemeral: true
                });
            }

            // Standard European Roulette definitions (0 to 36)
            const redNumbers = [1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36];
            const blackNumbers = [2, 4, 6, 8, 10, 11, 13, 15, 17, 20, 22, 24, 26, 28, 29, 31, 33, 35];

            // Spin the wheel
            const spunNumber = Math.floor(Math.random() * 37); // 0 to 36

            let colorEmoji = '🟢';
            let colorName = 'Vert';
            if (redNumbers.includes(spunNumber)) {
                colorEmoji = '🔴';
                colorName = 'Rouge';
            } else if (blackNumbers.includes(spunNumber)) {
                colorEmoji = '⚫';
                colorName = 'Noir';
            }

            let isWin = false;
            let multiplier = 0;

            switch (betType) {
                case 'rouge':
                    if (redNumbers.includes(spunNumber)) {
                        isWin = true;
                        multiplier = 2;
                    }
                    break;
                case 'noir':
                    if (blackNumbers.includes(spunNumber)) {
                        isWin = true;
                        multiplier = 2;
                    }
                    break;
                case 'pair':
                    if (spunNumber > 0 && spunNumber % 2 === 0) {
                        isWin = true;
                        multiplier = 2;
                    }
                    break;
                case 'impair':
                    if (spunNumber > 0 && spunNumber % 2 !== 0) {
                        isWin = true;
                        multiplier = 2;
                    }
                    break;
                case 'vert':
                    if (spunNumber === 0) {
                        isWin = true;
                        multiplier = 14;
                    }
                    break;
                case 'nombre':
                    if (spunNumber === betNumber) {
                        isWin = true;
                        multiplier = 36;
                    }
                    break;
            }

            let newBalance = currentBalance;
            if (isWin) {
                const totalWin = bet * multiplier;
                const profit = totalWin - bet;
                await ecoManager.addCurrency(userId, guildId, profit, `Victoire Roulette (${betType} sur ${spunNumber})`);
                newBalance = await ecoManager.getBalance(userId, guildId);
            } else {
                await ecoManager.removeCurrency(userId, guildId, bet, `Perte Roulette (${betType} sur ${spunNumber})`);
                newBalance = await ecoManager.getBalance(userId, guildId);
            }

            const embed = new EmbedBuilder()
                .setColor(isWin ? '#00FF00' : '#FF0000')
                .setTitle('🎡 Roulette de Casino')
                .setDescription(
                    `La bille s'arrête sur... **${colorEmoji} ${spunNumber} ${colorName}** !\n\n` +
                    `• **Votre pari** : \`${betType}${betType === 'nombre' ? ` (${betNumber})` : ''}\`\n` +
                    `• **Mise engagée** : \`${bet.toLocaleString()}\` coins\n` +
                    `• **Verdict** : ${isWin ? `🎉 **GAGNÉ !** Vous remportez **${(bet * multiplier - bet).toLocaleString()}** coins (Cote: x${multiplier})` : '💥 **PERDU !** Votre mise a été engloutie par la banque.'}\n` +
                    `• **Nouveau solde** : \`${newBalance.toLocaleString()}\` coins`
                )
                .setFooter({ text: `Joueur: ${interaction.user.tag}` })
                .setTimestamp();

            return interaction.reply({ embeds: [embed] });

        } catch (error) {
            console.error('Erreur lors de la roulette:', error);
            const errorMsg = error.message || 'Une erreur inattendue est survenue.';
            if (interaction.deferred || interaction.replied) {
                await interaction.editReply({ content: `❌ Erreur: ${errorMsg}` });
            } else {
                await interaction.reply({ content: `❌ Erreur: ${errorMsg}`, ephemeral: true });
            }
        }
    }
};
