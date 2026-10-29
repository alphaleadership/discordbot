import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';

/**
 * Analyse une saisie de montant bancaire (supporte nombres, 'all', 'max', 'tout', pourcentages et suffixes k/M)
 * @param {string|number} rawInput
 * @param {number} availableBalance
 * @returns {number}
 */
export function parseBankAmount(rawInput, availableBalance) {
    if (rawInput === null || rawInput === undefined) return 0;
    if (typeof rawInput === 'number') return Math.max(0, Math.floor(rawInput));

    const trimmed = String(rawInput).trim().toLowerCase();
    if (trimmed === 'all' || trimmed === 'max' || trimmed === 'tout') {
        return availableBalance;
    }

    if (trimmed.endsWith('%')) {
        const pct = parseFloat(trimmed.slice(0, -1).replace(',', '.'));
        if (isNaN(pct) || pct <= 0) return 0;
        return Math.round((availableBalance * pct) / 100);
    }

    let multiplier = 1;
    let numStr = trimmed;
    if (/k$/i.test(trimmed)) {
        multiplier = 1000;
        numStr = trimmed.slice(0, -1);
    } else if (/m$/i.test(trimmed)) {
        multiplier = 1000000;
        numStr = trimmed.slice(0, -1);
    }

    const val = parseFloat(numStr.replace(',', '.'));
    if (isNaN(val) || val <= 0) return 0;
    return Math.round(val * multiplier);
}

export default {
    data: new SlashCommandBuilder()
        .setName('banque')
        .setDescription('Gérer votre compte bancaire inter-serveur et votre portefeuille local')
        .addSubcommand(subcommand =>
            subcommand
                .setName('solde')
                .setDescription('Consulter votre solde bancaire inter-serveur et votre portefeuille')
                .addUserOption(option =>
                    option.setName('utilisateur')
                        .setDescription('Utilisateur dont consulter la banque (par défaut vous-même)')
                        .setRequired(false)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('deposer')
                .setDescription('Déposer du cash local vers votre compte bancaire inter-serveur')
                .addStringOption(option =>
                    option.setName('montant')
                        .setDescription('Montant (ex: 500, 10k), pourcentage (ex: 50%) ou "all"')
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('retirer')
                .setDescription('Retirer des fonds de votre compte bancaire inter-serveur vers ce serveur')
                .addStringOption(option =>
                    option.setName('montant')
                        .setDescription('Montant (ex: 500, 10k), pourcentage (ex: 50%) ou "all"')
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('virement')
                .setDescription('Virement bancaire inter-serveur direct vers un autre utilisateur')
                .addUserOption(option =>
                    option.setName('destinataire')
                        .setDescription('Le membre qui reçoit le virement')
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option.setName('montant')
                        .setDescription('Montant du virement (ex: 500, 50% ou "all")')
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option.setName('motif')
                        .setDescription('Motif du virement')
                        .setRequired(false)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('interets')
                .setDescription('Réclamer vos intérêts bancaires quotidiens (taux dynamique selon l\'économie du serveur)')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('taux')
                .setDescription('Consulter les taux d\'intérêt dynamiques et la santé économique du serveur')
        ),

    async execute(interaction, adminManager, warnManager, guildConfig, sharedConfig, backupToGitHub, reportManager, banlistManager, blockedWordsManager, watchlistManager, telegramIntegration, funCommandsManager, raidDetector, doxDetector, enhancedReloadSystem, permissionValidator, economyManager) {
        try {
            if (!interaction.inGuild()) {
                return interaction.reply({
                    content: '❌ Cette commande doit être exécutée dans un serveur.',
                    ephemeral: true
                });
            }

            const ecoManager = (economyManager && typeof economyManager.getBankStats === 'function')
                ? economyManager
                : [arguments[16], arguments[17], arguments[18], arguments[19], arguments[20]].find(arg => arg && typeof arg.getBankStats === 'function') || interaction.client?.economyManager;

            if (!ecoManager || typeof ecoManager.getBankStats !== 'function') {
                return interaction.reply({
                    content: '❌ Le système bancaire n\'est pas disponible actuellement.',
                    ephemeral: true
                });
            }

            const subcommand = interaction.options.getSubcommand();
            const guildId = interaction.guild.id;
            const userId = interaction.user.id;

            if (subcommand === 'solde') {
                const targetUser = interaction.options.getUser('utilisateur') || interaction.user;

                // Récupération automatique des intérêts si éligible
                let autoCreditedMsg = '';
                if (typeof ecoManager.autoProcessDailyInterestForUser === 'function') {
                    const autoRes = await ecoManager.autoProcessDailyInterestForUser(targetUser.id, guildId);
                    if (autoRes.credited) {
                        autoCreditedMsg = `⚡ **Intérêts du jour automatiquement crédités :** \`+${autoRes.interest.toLocaleString()}\` coins !\n\n`;
                    }
                }

                const stats = ecoManager.getBankStats(targetUser.id, guildId);

                const embed = new EmbedBuilder()
                    .setColor('#1E90FF')
                    .setTitle(`🏦 Relevé Bancaire Inter-Serveur • ${targetUser.tag}`)
                    .setDescription(`${autoCreditedMsg}Comptes financiers de **${targetUser.username}** reliant l'ensemble des serveurs`)
                    .addFields(
                        {
                            name: '👛 Portefeuille local',
                            value: `**${stats.localBalance.toLocaleString()}** coins\n*(disponibles sur ${interaction.guild.name})*`,
                            inline: true
                        },
                        {
                            name: '🏛️ Banque Inter-Serveur',
                            value: `**${stats.bankBalance.toLocaleString()}** coins\n*(sécurisés et partagés partout)*`,
                            inline: true
                        },
                        {
                            name: '💎 Patrimoine Total',
                            value: `**${stats.netWorth.toLocaleString()}** coins\n*(fortune globale : **${stats.totalNetWorth.toLocaleString()}**)*`,
                            inline: true
                        },
                        {
                            name: `📈 Intérêts automatiques (${stats.interestRatePercentage || '1.00%'}/j)`,
                            value: stats.receivedToday > 0
                                ? `✅ **+${stats.receivedToday.toLocaleString()}** coins crédités automatiquement aujourd'hui !\n` +
                                  `*(Taux: **${stats.todayInterestRate}** | Prochain versement automatique demain)*`
                                : (stats.bankBalance <= 0 
                                    ? '❌ Compte vide (aucun intérêt)' 
                                    : `⏳ Prochain versement automatique demain\n*(Taux: **${stats.interestRatePercentage || '1.00%'}**)*`),
                            inline: true
                        },
                        {
                            name: '📥 Total déposé',
                            value: `+${stats.totalDeposited.toLocaleString()} coins`,
                            inline: true
                        },
                        {
                            name: '📤 Total retiré',
                            value: `-${stats.totalWithdrawn.toLocaleString()} coins`,
                            inline: true
                        }
                    )
                    .setFooter({ text: 'Banque Centrale Inter-Serveur • Vos fonds sont protégés' })
                    .setTimestamp();

                if (typeof targetUser.displayAvatarURL === 'function') {
                    embed.setThumbnail(targetUser.displayAvatarURL({ dynamic: true }));
                }

                return interaction.reply({ embeds: [embed] });
            }

            if (subcommand === 'deposer') {
                const rawMontant = interaction.options.getString('montant');
                const localBalance = await ecoManager.getBalance(userId, guildId);

                const amountToDeposit = parseBankAmount(rawMontant, localBalance);

                if (amountToDeposit <= 0) {
                    if (localBalance <= 0) {
                        return interaction.reply({
                            content: '❌ Votre portefeuille sur ce serveur est vide (0 coin). Aucun dépôt possible.',
                            ephemeral: true
                        });
                    }
                    return interaction.reply({
                        content: '❌ Montant de dépôt invalide. Spécifiez un nombre positif, un pourcentage ou "all".',
                        ephemeral: true
                    });
                }

                if (localBalance < amountToDeposit) {
                    return interaction.reply({
                        content: `❌ Solde insuffisant ! Vous n'avez que **${localBalance.toLocaleString()}** coins en portefeuille local.`,
                        ephemeral: true
                    });
                }

                const result = await ecoManager.depositToBank(userId, guildId, amountToDeposit, `Dépôt depuis ${interaction.guild.name}`);

                if (!result.success) {
                    return interaction.reply({
                        content: `❌ Échec du dépôt : ${result.message}`,
                        ephemeral: true
                    });
                }

                const embed = new EmbedBuilder()
                    .setColor('#00FA9A')
                    .setTitle('📥 Dépôt Bancaire Réussi')
                    .setDescription(`Vous avez déposé **${result.deposited.toLocaleString()}** coins sur votre compte bancaire inter-serveur.`)
                    .addFields(
                        { name: 'Montant déposé', value: `\`+${result.deposited.toLocaleString()}\` coins`, inline: true },
                        { name: 'Nouveau solde local', value: `\`${result.localBalance.toLocaleString()}\` coins`, inline: true },
                        { name: 'Solde Banque Globale', value: `\`${result.bankBalance.toLocaleString()}\` coins`, inline: true }
                    )
                    .setFooter({ text: 'Vos fonds sont maintenant disponibles sur n\'importe quel serveur !' })
                    .setTimestamp();

                return interaction.reply({ embeds: [embed] });
            }

            if (subcommand === 'retirer') {
                const rawMontant = interaction.options.getString('montant');
                const bankBalance = ecoManager.getGlobalBankBalance(userId);

                const amountToWithdraw = parseBankAmount(rawMontant, bankBalance);

                if (amountToWithdraw <= 0) {
                    if (bankBalance <= 0) {
                        return interaction.reply({
                            content: '❌ Votre compte bancaire inter-serveur est vide (0 coin). Aucun retrait possible.',
                            ephemeral: true
                        });
                    }
                    return interaction.reply({
                        content: '❌ Montant de retrait invalide. Spécifiez un nombre positif, un pourcentage ou "all".',
                        ephemeral: true
                    });
                }

                if (bankBalance < amountToWithdraw) {
                    return interaction.reply({
                        content: `❌ Solde bancaire insuffisant ! Vous avez **${bankBalance.toLocaleString()}** coins en banque inter-serveur.`,
                        ephemeral: true
                    });
                }

                const result = await ecoManager.withdrawFromBank(userId, guildId, amountToWithdraw, `Retrait vers ${interaction.guild.name}`);

                if (!result.success) {
                    return interaction.reply({
                        content: `❌ Échec du retrait : ${result.message}`,
                        ephemeral: true
                    });
                }

                const embed = new EmbedBuilder()
                    .setColor('#FF6347')
                    .setTitle('📤 Retrait Bancaire Réussi')
                    .setDescription(`Vous avez retiré **${result.withdrawn.toLocaleString()}** coins vers votre portefeuille sur ce serveur.`)
                    .addFields(
                        { name: 'Montant retiré', value: `\`-${result.withdrawn.toLocaleString()}\` coins`, inline: true },
                        { name: 'Nouveau solde local', value: `\`${result.localBalance.toLocaleString()}\` coins`, inline: true },
                        { name: 'Solde Banque Globale', value: `\`${result.bankBalance.toLocaleString()}\` coins`, inline: true }
                    )
                    .setFooter({ text: 'Les coins sont désormais utilisables pour les jeux et la boutique locale' })
                    .setTimestamp();

                return interaction.reply({ embeds: [embed] });
            }

            if (subcommand === 'virement') {
                const recipient = interaction.options.getUser('destinataire');
                const rawMontant = interaction.options.getString('montant');
                const motif = interaction.options.getString('motif') || 'Virement inter-serveur';

                if (recipient.bot) {
                    return interaction.reply({
                        content: '❌ Les bots ne possèdent pas de compte bancaire.',
                        ephemeral: true
                    });
                }

                if (recipient.id === userId) {
                    return interaction.reply({
                        content: '❌ Vous ne pouvez pas effectuer un virement à vous-même.',
                        ephemeral: true
                    });
                }

                const bankBalance = ecoManager.getGlobalBankBalance(userId);
                const transferAmount = parseBankAmount(rawMontant, bankBalance);

                if (transferAmount <= 0) {
                    return interaction.reply({
                        content: '❌ Montant de virement invalide. Spécifiez un nombre positif, un pourcentage ou "all".',
                        ephemeral: true
                    });
                }

                if (bankBalance < transferAmount) {
                    return interaction.reply({
                        content: `❌ Solde bancaire insuffisant ! Vous n'avez que **${bankBalance.toLocaleString()}** coins sur votre compte bancaire.`,
                        ephemeral: true
                    });
                }

                const result = await ecoManager.transferBank(userId, recipient.id, transferAmount, motif);

                if (!result.success) {
                    return interaction.reply({
                        content: `❌ Échec du virement : ${result.message}`,
                        ephemeral: true
                    });
                }

                const embed = new EmbedBuilder()
                    .setColor('#9370DB')
                    .setTitle('💸 Virement Bancaire Inter-Serveur Réussi')
                    .setDescription(`Un virement bancaire a été effectué avec succès vers **${recipient.tag}**.`)
                    .addFields(
                        { name: 'Bénéficiaire', value: `${recipient.tag} (\`${recipient.id}\`)`, inline: true },
                        { name: 'Montant transféré', value: `\`${result.amount.toLocaleString()}\` coins`, inline: true },
                        { name: 'Votre nouveau solde bancaire', value: `\`${result.senderBalance.toLocaleString()}\` coins`, inline: true },
                        { name: 'Motif', value: motif, inline: false }
                    )
                    .setFooter({ text: 'Virement instantané inter-serveur' })
                    .setTimestamp();

                // Tentative d'avertissement en MP au destinataire
                recipient.send({
                    content: `🔔 Vous avez reçu un virement bancaire inter-serveur de **${result.amount.toLocaleString()}** coins de la part de **${interaction.user.tag}** !\n*Motif : ${motif}*`
                }).catch(() => {});

                return interaction.reply({ embeds: [embed] });
            }

            if (subcommand === 'interets') {
                const result = await ecoManager.claimBankInterest(userId, guildId);

                if (!result.success) {
                    if (result.alreadyCredited) {
                        const embed = new EmbedBuilder()
                            .setColor('#1E90FF')
                            .setTitle('📈 Intérêts Déjà Versés Automatiquement')
                            .setDescription('ℹ️ **La récupération des intérêts est désormais 100% automatique !**\nVous n\'avez plus besoin d\'exécuter cette commande manuellement.')
                            .addFields(
                                { name: 'Intérêts reçus aujourd\'hui', value: `\`+${(result.interest || 0).toLocaleString()}\` coins`, inline: true },
                                { name: 'Taux appliqué', value: `\`${result.ratePercentage || '1.00%'}\``, inline: true },
                                { name: 'Solde actuel en banque', value: `\`${result.newBankBalance.toLocaleString()}\` coins`, inline: true }
                            )
                            .setFooter({ text: 'Vos prochains intérêts seront crédités automatiquement demain !' })
                            .setTimestamp();
                        return interaction.reply({ embeds: [embed] });
                    }

                    return interaction.reply({
                        content: `⚠️ ${result.message}`,
                        ephemeral: true
                    });
                }

                const rateStr = result.rateInfo?.ratePercentage || (result.rate ? `${(result.rate * 100).toFixed(2)}%` : '+1%');
                const embed = new EmbedBuilder()
                    .setColor('#FFD700')
                    .setTitle('📈 Intérêts Bancaires Crédités')
                    .setDescription(`Votre épargne bancaire inter-serveur vous a rapporté des intérêts journaliers ajustés à l'activité de ce serveur !`)
                    .addFields(
                        { name: 'Intérêts reçus', value: `\`+${result.interest.toLocaleString()}\` coins`, inline: true },
                        { name: 'Taux dynamique appliqué', value: `\`${rateStr}\``, inline: true },
                        { name: 'Nouveau solde banque', value: `\`${result.newBankBalance.toLocaleString()}\` coins`, inline: true },
                        {
                            name: '⚡ Distribution automatique',
                            value: 'La récupération est désormais automatique : chaque jour, vos intérêts d\'épargne sont versés directement sans action de votre part !',
                            inline: false
                        }
                    )
                    .setFooter({ text: 'Banque Inter-Serveur • Intérêts 100% automatiques' })
                    .setTimestamp();

                return interaction.reply({ embeds: [embed] });
            }

            if (subcommand === 'taux') {
                const rateInfo = (typeof ecoManager.calculateDynamicInterestRate === 'function')
                    ? ecoManager.calculateDynamicInterestRate(guildId)
                    : {
                        rate: 0.01,
                        ratePercentage: '1.00%',
                        baseRate: 0.01,
                        currencyModifier: 0,
                        transactionBonus: 0,
                        totalCurrency: 0,
                        transactionCount: 0,
                        minRate: 0.005,
                        maxRate: 0.05
                    };

                const currencyModStr = (rateInfo.currencyModifier >= 0 ? '+' : '') + (rateInfo.currencyModifier * 100).toFixed(2) + '%';
                const txBonusStr = '+' + (rateInfo.transactionBonus * 100).toFixed(2) + '%';

                const embed = new EmbedBuilder()
                    .setColor('#00CED1')
                    .setTitle(`📊 Santé Économique & Taux d'Intérêt • ${interaction.guild.name}`)
                    .setDescription(`Les taux d'intérêt de la banque s'adaptent en temps réel selon la masse monétaire et l'activité des membres sur ce serveur.`)
                    .addFields(
                        { 
                            name: '📈 Taux d\'intérêt journalier actuel', 
                            value: `🔥 **${rateInfo.ratePercentage}** / jour\n*(Base : ${(rateInfo.baseRate * 100).toFixed(2)}% | Fourchette : ${(rateInfo.minRate * 100).toFixed(2)}% - ${(rateInfo.maxRate * 100).toFixed(2)}%)*`,
                            inline: false 
                        },
                        { 
                            name: '💵 Monnaie en circulation', 
                            value: `**${rateInfo.totalCurrency.toLocaleString()}** coins\n*Modificateur de liquidité : \`${currencyModStr}\`*`,
                            inline: true 
                        },
                        { 
                            name: '🔄 Transactions enregistrées', 
                            value: `**${rateInfo.transactionCount.toLocaleString()}** opérations\n*Bonus de vélocité : \`${txBonusStr}\`*`,
                            inline: true 
                        },
                        {
                            name: '💡 Comment faire grimper le taux ?',
                            value: 'Plus les membres échangent de l\'argent, travaillent (`/work`), jouent aux mini-jeux (`/gamble`, `/slots`, `/roulette`) et font circuler la monnaie, plus la banque rémunère l\'épargne !',
                            inline: false
                        }
                    )
                    .setFooter({ text: 'Banque Inter-Serveur • Taux dynamiques décentralisés' })
                    .setTimestamp();

                return interaction.reply({ embeds: [embed] });
            }

        } catch (error) {
            console.error('Erreur commande banque:', error);
            const errorMsg = error.message || 'Une erreur inattendue est survenue.';
            if (interaction.deferred || interaction.replied) {
                await interaction.editReply({ content: `❌ Erreur: ${errorMsg}` });
            } else {
                await interaction.reply({ content: `❌ Erreur: ${errorMsg}`, ephemeral: true });
            }
        }
    }
};
