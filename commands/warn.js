import { SlashCommandBuilder, EmbedBuilder, PermissionsBitField } from 'discord.js';
import { localWarnManager, globalWarnManager } from '../utils/WarnManager.js';

export default {
    data: new SlashCommandBuilder()
        .setName('warn')
        .setDescription('Avertir un utilisateur avec application d\'une amende')
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
        .addStringOption(option =>
            option.setName('amende')
                .setDescription('Montant de l\'amende en coins (ex: 200, 10k) ou pourcentage (ex: 15%). Défaut: 100 coins')
                .setRequired(false)
        )
        .addBooleanOption(option =>
            option.setName('global')
                .setDescription('Avertissement global (visible dans tous les serveurs)')
                .setRequired(false)
        ),
    async execute(interaction, adminManager, warnManagerParam, guildConfig, sharedConfig, backupToGitHub, reportManager, banlistManager, blockedWordsManager, watchlistManager, telegramIntegration, funCommandsManager, raidDetector, doxDetector, enhancedReloadSystem, permissionValidator, economyManager, forumReportManager, autoConfigManager, dmTicketManager, customsManager, espionageManager) {
        const isGlobal = interaction.options.getBoolean('global') ?? false;
        const warnManager = isGlobal ? globalWarnManager : (warnManagerParam || localWarnManager);
        const guildId = isGlobal ? 'global' : (interaction.guild?.id || 'guild');

        const hasModeratePerms = interaction.memberPermissions?.has?.(PermissionsBitField.Flags.ModerateMembers)
            || interaction.member?.permissions?.has?.(PermissionsBitField.Flags.ModerateMembers)
            || (adminManager && typeof adminManager.isAdmin === 'function' ? await adminManager.isAdmin(interaction.user.id) : false);

        if (!hasModeratePerms) {
            return interaction.reply({
                content: '❌ Vous devez avoir la permission de modérer les membres pour utiliser cette commande.',
                ephemeral: true
            });
        }

        const user = interaction.options.getUser('utilisateur');
        const reason = interaction.options.getString('raison');
        
        if (adminManager && typeof adminManager.isAdmin === 'function' && await adminManager.isAdmin(user.id)) {
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

        // Résolution défensive du gestionnaire économique
        const ecoManager = (economyManager && (typeof economyManager.applyFine === 'function' || typeof economyManager.getBalance === 'function'))
            ? economyManager
            : [arguments[16], arguments[17], arguments[18], arguments[19], arguments[20]].find(arg => arg && (typeof arg.applyFine === 'function' || typeof arg.getBalance === 'function')) || interaction.client?.economyManager;

        // Calcul du montant de l'amende
        const targetGuildId = interaction.guild?.id || guildId;
        let fineAmount = 100; // Amende par défaut : 100 coins
        const rawAmende = interaction.options.getString('amende') ?? interaction.options.getInteger?.('amende');

        if (rawAmende !== null && rawAmende !== undefined) {
            if (typeof rawAmende === 'number') {
                fineAmount = Math.max(0, rawAmende);
            } else if (typeof rawAmende === 'string') {
                const trimmed = rawAmende.trim();
                if (trimmed === '0' || trimmed.toLowerCase() === 'aucun' || trimmed.toLowerCase() === 'none') {
                    fineAmount = 0;
                } else if (trimmed.endsWith('%')) {
                    const parsedPct = parseFloat(trimmed.slice(0, -1).replace(',', '.'));
                    if (!isNaN(parsedPct) && parsedPct > 0) {
                        const userBalance = ecoManager && typeof ecoManager.getBalance === 'function' 
                            ? await ecoManager.getBalance(user.id, targetGuildId) 
                            : 0;
                        const bankBalance = ecoManager && typeof ecoManager.getGlobalBankBalance === 'function'
                            ? await ecoManager.getGlobalBankBalance(user.id)
                            : 0;
                        const baseBalance = userBalance > 0 ? userBalance : bankBalance;
                        fineAmount = Math.round((baseBalance * parsedPct) / 100);
                    } else {
                        fineAmount = 0;
                    }
                } else {
                    let multiplier = 1;
                    let numStr = trimmed;
                    if (/k$/i.test(trimmed)) {
                        multiplier = 1000;
                        numStr = trimmed.slice(0, -1);
                    } else if (/m$/i.test(trimmed)) {
                        multiplier = 1000000;
                        numStr = trimmed.slice(0, -1);
                    }
                    const parsed = parseFloat(numStr.replace(',', '.'));
                    fineAmount = (!isNaN(parsed) && parsed >= 0) ? Math.round(parsed * multiplier) : 100;
                }
            }
        }

        // Application du prélèvement de l'amende via EconomyManager
        let fineResult = null;
        if (ecoManager && fineAmount > 0 && targetGuildId !== 'global') {
            if (typeof ecoManager.applyFine === 'function') {
                fineResult = await ecoManager.applyFine(
                    user.id,
                    targetGuildId,
                    fineAmount,
                    `[Warn] Avertissement: ${reason}`
                );
            } else if (typeof ecoManager.removeCurrency === 'function') {
                const balance = typeof ecoManager.getBalance === 'function' ? await ecoManager.getBalance(user.id, targetGuildId) : fineAmount;
                const bankBalance = typeof ecoManager.getGlobalBankBalance === 'function' ? await ecoManager.getGlobalBankBalance(user.id) : 0;
                const deductedLocal = Math.min(fineAmount, balance);
                const remainingFine = fineAmount - deductedLocal;
                const deductedBank = remainingFine > 0 ? Math.min(remainingFine, bankBalance) : 0;
                const totalDeducted = deductedLocal + deductedBank;

                if (deductedLocal > 0) {
                    await ecoManager.removeCurrency(user.id, targetGuildId, deductedLocal, `[Warn] Avertissement: ${reason}`);
                }
                if (deductedBank > 0 && typeof ecoManager.adminSetBankBalance === 'function') {
                    await ecoManager.adminSetBankBalance(user.id, bankBalance - deductedBank, `[Warn] Avertissement (banque): ${reason}`);
                }
                fineResult = {
                    success: true,
                    deducted: totalDeducted,
                    deductedFromLocal: deductedLocal,
                    deductedFromBank: deductedBank,
                    requestedAmount: fineAmount,
                    remainingBalance: Math.max(0, balance - deductedLocal),
                    remainingBankBalance: Math.max(0, bankBalance - deductedBank),
                    paidByBank: deductedBank > 0,
                    paidFullyByBank: deductedLocal === 0 && deductedBank > 0,
                    wasPartial: totalDeducted < fineAmount
                };
            }
        }

        const fineDeducted = fineResult ? fineResult.deducted : 0;

        try {
            const warn = warnManager.addWarn(guildId, user.id, reason, interaction.user.id, fineDeducted);
            const warnCount = warnManager.getWarnCount(guildId, user.id);

            // Remplissage automatique du dossier d'espionnage lors d'un warn
            if (espionageManager && interaction.guild) {
                const member = await interaction.guild.members.fetch(user.id).catch(() => null);
                if (member) {
                    const fineNote = fineDeducted > 0 ? ` (Amende : -${fineDeducted.toLocaleString()} coins)` : '';
                    await espionageManager.addNote(
                        member, 
                        `⚠️ Avertissement reçu : "${reason}"${fineNote} (Nombre total : ${warnCount}/3)`, 
                        interaction.user.id
                    ).catch(() => null);
                }
            }

            // Formulation du détail de l'amende pour l'embed
            let fineDescription = 'Aucune amende';
            if (fineResult && fineResult.requestedAmount > 0) {
                if (fineResult.deductedFromBank > 0) {
                    if (fineResult.deductedFromLocal > 0) {
                        fineDescription = `💸 **-${fineResult.deducted.toLocaleString()}** coins prélevés :\n` +
                            `  • Portefeuille local : \`-${fineResult.deductedFromLocal.toLocaleString()}\` coins *(épuisé)*\n` +
                            `  • Banque inter-serveur : \`-${fineResult.deductedFromBank.toLocaleString()}\` coins\n` +
                            `💰 **Soldes :** Local : \`${fineResult.remainingBalance.toLocaleString()}\` | Banque : \`${(fineResult.remainingBankBalance ?? 0).toLocaleString()}\` coins` +
                            (fineResult.wasPartial ? ` *(sur ${fineResult.requestedAmount.toLocaleString()} demandés)*` : '');
                    } else {
                        fineDescription = `💸 **-${fineResult.deducted.toLocaleString()}** coins prélevés sur la **Banque inter-serveur** *(portefeuille local vide)*\n` +
                            `💰 **Soldes :** Local : \`0\` | Banque : \`${(fineResult.remainingBankBalance ?? 0).toLocaleString()}\` coins` +
                            (fineResult.wasPartial ? ` *(sur ${fineResult.requestedAmount.toLocaleString()} demandés)*` : '');
                    }
                } else if (fineResult.wasPartial) {
                    fineDescription = `💸 **-${fineResult.deducted.toLocaleString()}** coins *(sur ${fineResult.requestedAmount.toLocaleString()} demandés - solde insuffisant)*\n💰 **Nouveau solde :** \`${fineResult.remainingBalance.toLocaleString()}\` coins`;
                } else {
                    fineDescription = `💸 **-${fineResult.deducted.toLocaleString()}** coins déduits\n💰 **Nouveau solde :** \`${fineResult.remainingBalance.toLocaleString()}\` coins`;
                }
            } else if (fineAmount === 0) {
                fineDescription = 'Aucune amende (0 coin)';
            }

            const embed = new EmbedBuilder()
                .setColor('#FFA500')
                .setTitle(isGlobal ? '⚠️ Avertissement Global' : '⚠️ Avertissement')
                .setDescription(`Vous avez reçu un avertissement ${isGlobal ? 'global' : `sur ${interaction.guild?.name || 'le serveur'}`}.\n\n*Si vous souhaitez contester cette sanction ou vous expliquer, vous pouvez soumettre une demande d'appel en répondant directement à ce bot par message privé (MP).*`)
                .addFields(
                    { name: 'Raison', value: reason },
                    { name: 'Amende financière', value: fineDescription },
                    { name: 'Avertissements actuels', value: `${warnCount}/3` },
                    { name: 'Modérateur', value: interaction.user.tag },
                    { name: 'Date', value: new Date(warn.date).toLocaleString('fr-FR') }
                )
                .setFooter({ text: `ID: ${warn.id}` });

            await user.send({ embeds: [embed] }).catch(() => {
                console.log(`Impossible d'envoyer un MP à ${user.tag}`);
            });

            // Texte de confirmation public
            let fineText = '';
            if (fineResult && fineResult.requestedAmount > 0) {
                if (fineResult.deducted > 0) {
                    if (fineResult.deductedFromBank > 0 && fineResult.deductedFromLocal > 0) {
                        fineText = ` | 💸 Amende : -${fineResult.deducted.toLocaleString()} coins (${fineResult.deductedFromLocal} local + ${fineResult.deductedFromBank} banque)`;
                    } else if (fineResult.deductedFromBank > 0) {
                        fineText = ` | 💸 Amende : -${fineResult.deducted.toLocaleString()} coins (payée par la banque inter-serveur)`;
                    } else {
                        fineText = ` | 💸 Amende : -${fineResult.deducted.toLocaleString()} coins (Solde : ${fineResult.remainingBalance.toLocaleString()})`;
                    }
                } else {
                    fineText = ` | 💸 Amende : 0 coin prélevé (Soldes local et banque nuls)`;
                }
            }

            await interaction.reply({
                content: `✅ ${user} a été averti ${isGlobal ? 'globalement' : 'localement'} pour: ${reason} (Avertissement ${warnCount}/3)${fineText}`,
                ephemeral: false
            });

            if (!isGlobal && warnCount >= 3 && interaction.guild) {
                await interaction.guild.members.ban(user.id, { 
                    reason: `3 avertissements locaux atteints. Dernier avertissement: ${reason}`
                });
                
                const banEmbed = new EmbedBuilder()
                    .setColor('#FF0000')
                    .setTitle('🔨 Bannissement')
                    .setDescription(`Vous avez été banni de ${interaction.guild.name} pour avoir atteint 3 avertissements.\n\n*Si vous estimez qu'il s'agit d'une erreur ou si vous souhaitez contester cette sanction, vous pouvez soumettre une demande d'appel en répondant directement à ce bot par message privé (MP).*`)
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
            if (interaction.deferred || interaction.replied) {
                await interaction.editReply({ content: '❌ Une erreur est survenue lors de l\'avertissement.' });
            } else {
                await interaction.reply({
                    content: '❌ Une erreur est survenue lors de l\'avertissement.',
                    ephemeral: true
                });
            }
        }
    },
};
