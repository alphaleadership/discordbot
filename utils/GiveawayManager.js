import fs from 'fs';
import path from 'path';
import { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';

export class GiveawayManager {
    /**
     * @param {object} [economyManager=null] - Gestionnaire de l'économie optionnel
     * @param {string} [filePath='data/giveaways.json'] - Chemin du fichier JSON de stockage
     */
    constructor(economyManager = null, filePath = 'data/giveaways.json') {
        this.economyManager = economyManager;
        this.filePath = path.isAbsolute(filePath) ? filePath : path.join(process.cwd(), filePath);
        this.giveaways = new Map();
        this.checkInterval = null;

        this.ensureFileExists();
        this.loadGiveaways();
    }

    /**
     * S'assure que le dossier parent et le fichier de stockage existent
     */
    ensureFileExists() {
        const dir = path.dirname(this.filePath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        if (!fs.existsSync(this.filePath)) {
            fs.writeFileSync(this.filePath, JSON.stringify([], null, 2), 'utf8');
        }
    }

    /**
     * Charge les giveaways depuis le fichier JSON
     */
    loadGiveaways() {
        try {
            if (fs.existsSync(this.filePath)) {
                const data = fs.readFileSync(this.filePath, 'utf8');
                const list = JSON.parse(data);
                this.giveaways.clear();
                if (Array.isArray(list)) {
                    for (const item of list) {
                        if (item && item.id) {
                            this.giveaways.set(item.id, item);
                        }
                    }
                }
            }
        } catch (error) {
            console.error('[GiveawayManager] Erreur lors du chargement des giveaways:', error);
        }
    }

    /**
     * Sauvegarde les giveaways dans le fichier JSON
     */
    saveGiveaways() {
        try {
            this.ensureFileExists();
            const list = Array.from(this.giveaways.values());
            fs.writeFileSync(this.filePath, JSON.stringify(list, null, 2), 'utf8');
        } catch (error) {
            console.error('[GiveawayManager] Erreur lors de la sauvegarde des giveaways:', error);
        }
    }

    /**
     * Parse une durée textuelle (ex: 30s, 10m, 2h, 1d, 3j, 1w) en millisecondes
     * @param {string} durationStr
     * @returns {number|null} Durée en ms ou null si invalide
     */
    parseDuration(durationStr) {
        if (!durationStr || typeof durationStr !== 'string') return null;
        const regex = /(\d+)\s*([smhdwj])/gi;
        let totalMs = 0;
        let match;
        let found = false;

        const multipliers = {
            's': 1000,
            'm': 60 * 1000,
            'h': 60 * 60 * 1000,
            'd': 24 * 60 * 60 * 1000,
            'j': 24 * 60 * 60 * 1000,
            'w': 7 * 24 * 60 * 60 * 1000
        };

        while ((match = regex.exec(durationStr)) !== null) {
            found = true;
            const val = parseInt(match[1], 10);
            const unit = match[2].toLowerCase();
            if (multipliers[unit]) {
                totalMs += val * multipliers[unit];
            }
        }

        return found && totalMs > 0 ? totalMs : null;
    }

    /**
     * Crée un nouveau giveaway
     * @param {object} options
     * @returns {object} Le giveaway créé
     */
    createGiveaway({
        id,
        guildId,
        channelId,
        messageId,
        prize,
        durationMs,
        winnerCount = 1,
        hostedBy,
        hostedById,
        coinsReward = 0,
        roleRequiredId = null,
        minAccountAgeDays = 0,
        description = null
    }) {
        const giveawayId = id || messageId;
        const now = Date.now();

        const giveaway = {
            id: giveawayId,
            messageId: messageId || giveawayId,
            guildId,
            channelId,
            prize,
            winnerCount: Math.max(1, parseInt(winnerCount, 10) || 1),
            hostedBy,
            hostedById,
            coinsReward: parseInt(coinsReward, 10) || 0,
            roleRequiredId: roleRequiredId || null,
            minAccountAgeDays: parseInt(minAccountAgeDays, 10) || 0,
            description: description || null,
            createdAt: now,
            endsAt: now + durationMs,
            ended: false,
            cancelled: false,
            cancelReason: null,
            participants: [],
            winners: [],
            endedAt: null
        };

        this.giveaways.set(giveawayId, giveaway);
        this.saveGiveaways();
        return giveaway;
    }

    /**
     * Construit l'Embed Discord pour un giveaway donné
     * @param {object} giveaway
     * @returns {EmbedBuilder}
     */
    buildEmbed(giveaway) {
        if (giveaway.cancelled) {
            return new EmbedBuilder()
                .setColor('#E74C3C')
                .setTitle(`❌ GIVEAWAY ANNULÉ : ${giveaway.prize} ❌`)
                .setDescription(
                    `Ce tirage au sort a été annulé par un administrateur.\n\n` +
                    `👤 **Lancé par :** <@${giveaway.hostedById}>\n` +
                    `🚫 **Raison :** **${giveaway.cancelReason || 'Aucune raison spécifiée'}**\n` +
                    `👥 **Nombre d'inscrits au moment de l'annulation :** \`${giveaway.participants.length}\``
                )
                .setFooter({ text: `ID: ${giveaway.id} • Giveaway annulé` })
                .setTimestamp(giveaway.endedAt ? new Date(giveaway.endedAt) : new Date());
        }

        if (giveaway.ended) {
            const hasWinners = giveaway.winners && giveaway.winners.length > 0;
            const winnersList = hasWinners
                ? giveaway.winners.map(id => `<@${id}>`).join(', ')
                : '*Aucun gagnant (aucun participant valide)*';

            const embed = new EmbedBuilder()
                .setColor(hasWinners ? '#2ECC71' : '#95A5A6')
                .setTitle(`🎉 GIVEAWAY TERMINÉ : ${giveaway.prize} 🎉`)
                .setDescription(
                    `Le tirage au sort est désormais terminé !\n\n` +
                    `🏆 **Gagnant(s) :** ${winnersList}\n` +
                    `👤 **Lancé par :** <@${giveaway.hostedById}>\n` +
                    `👥 **Total participants :** \`${giveaway.participants.length}\`\n` +
                    (giveaway.coinsReward > 0 ? `💰 **Gain économique :** \`+${giveaway.coinsReward.toLocaleString()}\` coins versés à chaque gagnant !\n` : '') +
                    `⏰ **Terminé le :** <t:${Math.floor((giveaway.endedAt || Date.now()) / 1000)}:f>`
                )
                .setFooter({ text: `ID: ${giveaway.id} • Giveaway terminé` })
                .setTimestamp(giveaway.endedAt ? new Date(giveaway.endedAt) : new Date());

            return embed;
        }

        // Giveaway en cours
        let conditions = '';
        if (giveaway.roleRequiredId) {
            conditions += `\n🔒 **Rôle requis :** <@&${giveaway.roleRequiredId}>`;
        }
        if (giveaway.minAccountAgeDays > 0) {
            conditions += `\n📅 **Ancienneté requise :** Compte de plus de **${giveaway.minAccountAgeDays}** jours`;
        }

        const embed = new EmbedBuilder()
            .setColor('#5865F2')
            .setTitle(`🎉 GIVEAWAY : ${giveaway.prize} 🎉`)
            .setDescription(
                `Cliquez sur le bouton ci-dessous pour vous inscrire au tirage au sort !\n\n` +
                `⏰ **Fin du tirage :** <t:${Math.floor(giveaway.endsAt / 1000)}:R> (<t:${Math.floor(giveaway.endsAt / 1000)}:f>)\n` +
                `👤 **Organisé par :** <@${giveaway.hostedById}>\n` +
                `🏆 **Nombre de gagnant(s) :** **${giveaway.winnerCount}**\n` +
                `👥 **Participants actuels :** \`${giveaway.participants.length}\`\n` +
                (giveaway.coinsReward > 0 ? `💰 **Bonus cash :** \`+${giveaway.coinsReward.toLocaleString()}\` coins par gagnant\n` : '') +
                (conditions ? `${conditions}\n` : '') +
                (giveaway.description ? `\n📝 **Détails :** ${giveaway.description}` : '')
            )
            .setFooter({ text: `ID: ${giveaway.id} • Cliquez sur le bouton pour participer ou vous retirer !` })
            .setTimestamp(new Date(giveaway.endsAt));

        return embed;
    }

    /**
     * Construit les boutons ActionRow pour un giveaway
     * @param {object} giveaway
     * @returns {ActionRowBuilder}
     */
    buildActionRow(giveaway) {
        const row = new ActionRowBuilder();

        if (giveaway.cancelled) {
            row.addComponents(
                new ButtonBuilder()
                    .setCustomId(`giveaway_cancelled_${giveaway.id}`)
                    .setLabel('❌ Annulé')
                    .setStyle(ButtonStyle.Danger)
                    .setDisabled(true)
            );
            return row;
        }

        if (giveaway.ended) {
            row.addComponents(
                new ButtonBuilder()
                    .setCustomId(`giveaway_ended_${giveaway.id}`)
                    .setLabel(`🎉 Terminé (${giveaway.participants.length})`)
                    .setStyle(ButtonStyle.Secondary)
                    .setDisabled(true)
            );
            return row;
        }

        row.addComponents(
            new ButtonBuilder()
                .setCustomId(`giveaway_join_${giveaway.id}`)
                .setLabel(`🎉 Participer (${giveaway.participants.length})`)
                .setStyle(ButtonStyle.Success)
        );

        return row;
    }

    /**
     * Gère les clics sur les boutons de giveaway
     * @param {import('discord.js').ButtonInteraction} interaction
     */
    async handleButton(interaction) {
        if (!interaction.isButton() || !interaction.customId.startsWith('giveaway_join_')) {
            return;
        }

        const giveawayId = interaction.customId.replace('giveaway_join_', '');
        const giveaway = this.giveaways.get(giveawayId);

        if (!giveaway || giveaway.ended || giveaway.cancelled) {
            return interaction.reply({
                content: '❌ Ce tirage au sort est terminé ou n\'existe plus.',
                ephemeral: true
            });
        }

        const userId = interaction.user.id;

        // Vérification de la condition de rôle
        if (giveaway.roleRequiredId) {
            const hasRole = interaction.member?.roles?.cache?.has(giveaway.roleRequiredId);
            if (!hasRole) {
                return interaction.reply({
                    content: `❌ Vous devez posséder le rôle <@&${giveaway.roleRequiredId}> pour participer à ce giveaway.`,
                    ephemeral: true
                });
            }
        }

        // Vérification de l'ancienneté du compte
        if (giveaway.minAccountAgeDays > 0) {
            const createdTimestamp = interaction.user.createdTimestamp || 0;
            const ageDays = (Date.now() - createdTimestamp) / (24 * 60 * 60 * 1000);
            if (ageDays < giveaway.minAccountAgeDays) {
                return interaction.reply({
                    content: `❌ Votre compte Discord est trop récent (${Math.floor(ageDays)} jours). Une ancienneté minimale de **${giveaway.minAccountAgeDays}** jours est requise.`,
                    ephemeral: true
                });
            }
        }

        const index = giveaway.participants.indexOf(userId);
        let userJoined = false;

        if (index !== -1) {
            // Retirer l'utilisateur
            giveaway.participants.splice(index, 1);
            userJoined = false;
        } else {
            // Ajouter l'utilisateur
            giveaway.participants.push(userId);
            userJoined = true;
        }

        this.saveGiveaways();

        // Mettre à jour le message d'origine avec le nouveau nombre de participants
        try {
            if (interaction.message && typeof interaction.message.edit === 'function') {
                await interaction.message.edit({
                    embeds: [this.buildEmbed(giveaway)],
                    components: [this.buildActionRow(giveaway)]
                });
            }
        } catch (error) {
            console.error('[GiveawayManager] Impossible de mettre à jour le message de giveaway:', error);
        }

        if (userJoined) {
            return interaction.reply({
                content: `🎉 Vous êtes désormais inscrit au tirage au sort pour **${giveaway.prize}** ! Bonne chance ! 🍀\n*(Total participants : ${giveaway.participants.length})*`,
                ephemeral: true
            });
        } else {
            return interaction.reply({
                content: `👋 Vous vous êtes retiré du tirage au sort pour **${giveaway.prize}**.\n*(Total participants restants : ${giveaway.participants.length})*`,
                ephemeral: true
            });
        }
    }

    /**
     * Termine un giveaway et tire au sort les gagnants
     * @param {string} giveawayId
     * @param {import('discord.js').Client} [client=null]
     * @returns {Promise<{ success: boolean, giveaway: object, winners: string[], message?: string }>}
     */
    async endGiveaway(giveawayId, client = null) {
        const giveaway = this.giveaways.get(giveawayId);
        if (!giveaway) {
            return { success: false, message: 'Giveaway introuvable' };
        }
        if (giveaway.ended) {
            return { success: false, message: 'Le giveaway est déjà terminé' };
        }

        giveaway.ended = true;
        giveaway.endedAt = Date.now();

        // Tirage aléatoire sans doublons
        const pool = [...giveaway.participants];
        const winners = [];
        const targetWinnersCount = Math.min(giveaway.winnerCount, pool.length);

        for (let i = 0; i < targetWinnersCount; i++) {
            const randomIndex = Math.floor(Math.random() * pool.length);
            winners.push(pool[randomIndex]);
            pool.splice(randomIndex, 1);
        }

        giveaway.winners = winners;

        // Crédit des coins aux gagnants si configuré
        if (giveaway.coinsReward > 0 && winners.length > 0 && this.economyManager && typeof this.economyManager.addCurrency === 'function') {
            for (const winnerId of winners) {
                try {
                    await this.economyManager.addCurrency(
                        winnerId,
                        giveaway.guildId,
                        giveaway.coinsReward,
                        `[Giveaway] Gain du giveaway: ${giveaway.prize}`
                    );
                } catch (err) {
                    console.error(`[GiveawayManager] Erreur crédit coins à ${winnerId}:`, err);
                }
            }
        }

        this.saveGiveaways();

        // Mise à jour sur Discord
        if (client && client.channels && typeof client.channels.fetch === 'function') {
            try {
                const channel = await client.channels.fetch(giveaway.channelId).catch(() => null);
                if (channel) {
                    const message = await channel.messages.fetch(giveaway.messageId).catch(() => null);
                    if (message) {
                        await message.edit({
                            embeds: [this.buildEmbed(giveaway)],
                            components: [this.buildActionRow(giveaway)]
                        }).catch(console.error);
                    }

                    // Annonce publique du résultat
                    if (winners.length > 0) {
                        const mentions = winners.map(id => `<@${id}>`).join(', ');
                        const bonusCoins = giveaway.coinsReward > 0 ? ` (+${giveaway.coinsReward.toLocaleString()} coins reçus !)` : '';
                        await channel.send({
                            content: `🎉 Félicitations à ${mentions} ! Vous remportez **${giveaway.prize}** ! 🎁${bonusCoins}`
                        }).catch(console.error);
                    } else {
                        await channel.send({
                            content: `⚠️ Le tirage au sort pour **${giveaway.prize}** est terminé, mais aucun participant ne s'était inscrit.`
                        }).catch(console.error);
                    }
                }
            } catch (err) {
                console.error('[GiveawayManager] Erreur mise à jour Discord lors de la clôture:', err);
            }
        }

        return { success: true, giveaway, winners };
    }

    /**
     * Effectue un nouveau tirage (reroll) sur un giveaway déjà terminé
     * @param {string} giveawayId
     * @param {import('discord.js').Client} [client=null]
     * @param {number} [count=1]
     * @returns {Promise<{ success: boolean, newWinners: string[], message?: string }>}
     */
    async rerollGiveaway(giveawayId, client = null, count = 1) {
        const giveaway = this.giveaways.get(giveawayId);
        if (!giveaway) {
            return { success: false, message: 'Giveaway introuvable' };
        }
        if (!giveaway.ended) {
            return { success: false, message: 'Le giveaway est encore en cours, impossible de reroll' };
        }
        if (!giveaway.participants || giveaway.participants.length === 0) {
            return { success: false, message: 'Aucun participant dans ce giveaway' };
        }

        // On cherche d'abord parmi les participants non gagnants
        let candidatePool = giveaway.participants.filter(id => !giveaway.winners.includes(id));
        if (candidatePool.length === 0) {
            candidatePool = [...giveaway.participants];
        }

        const newWinners = [];
        const targetCount = Math.min(count, candidatePool.length);

        for (let i = 0; i < targetCount; i++) {
            const randomIndex = Math.floor(Math.random() * candidatePool.length);
            newWinners.push(candidatePool[randomIndex]);
            candidatePool.splice(randomIndex, 1);
        }

        // Remplacement ou ajout des gagnants
        giveaway.winners = newWinners;

        // Crédit des coins aux nouveaux gagnants
        if (giveaway.coinsReward > 0 && newWinners.length > 0 && this.economyManager && typeof this.economyManager.addCurrency === 'function') {
            for (const winnerId of newWinners) {
                try {
                    await this.economyManager.addCurrency(
                        winnerId,
                        giveaway.guildId,
                        giveaway.coinsReward,
                        `[Giveaway Reroll] Gain du giveaway: ${giveaway.prize}`
                    );
                } catch (err) {
                    console.error(`[GiveawayManager] Erreur crédit coins reroll à ${winnerId}:`, err);
                }
            }
        }

        this.saveGiveaways();

        if (client && client.channels && typeof client.channels.fetch === 'function') {
            try {
                const channel = await client.channels.fetch(giveaway.channelId).catch(() => null);
                if (channel) {
                    const message = await channel.messages.fetch(giveaway.messageId).catch(() => null);
                    if (message) {
                        await message.edit({
                            embeds: [this.buildEmbed(giveaway)],
                            components: [this.buildActionRow(giveaway)]
                        }).catch(console.error);
                    }

                    const mentions = newWinners.map(id => `<@${id}>`).join(', ');
                    await channel.send({
                        content: `🎲 **Nouveau tirage au sort (Reroll)** pour **${giveaway.prize}** !\nFélicitations à ${mentions} qui remporte(nt) le lot ! 🎁`
                    }).catch(console.error);
                }
            } catch (err) {
                console.error('[GiveawayManager] Erreur lors de l\'annonce du reroll:', err);
            }
        }

        return { success: true, newWinners };
    }

    /**
     * Annule un giveaway en cours
     * @param {string} giveawayId
     * @param {import('discord.js').Client} [client=null]
     * @param {string} [reason='Annulé par un administrateur']
     * @returns {Promise<{ success: boolean, giveaway?: object, message?: string }>}
     */
    async cancelGiveaway(giveawayId, client = null, reason = 'Annulé par un administrateur') {
        const giveaway = this.giveaways.get(giveawayId);
        if (!giveaway) {
            return { success: false, message: 'Giveaway introuvable' };
        }
        if (giveaway.ended) {
            return { success: false, message: 'Le giveaway est déjà terminé' };
        }

        giveaway.ended = true;
        giveaway.cancelled = true;
        giveaway.cancelReason = reason;
        giveaway.endedAt = Date.now();

        this.saveGiveaways();

        if (client && client.channels && typeof client.channels.fetch === 'function') {
            try {
                const channel = await client.channels.fetch(giveaway.channelId).catch(() => null);
                if (channel) {
                    const message = await channel.messages.fetch(giveaway.messageId).catch(() => null);
                    if (message) {
                        await message.edit({
                            embeds: [this.buildEmbed(giveaway)],
                            components: [this.buildActionRow(giveaway)]
                        }).catch(console.error);
                    }

                    await channel.send({
                        content: `❌ Le giveaway pour **${giveaway.prize}** a été annulé.\n*Raison : ${reason}*`
                    }).catch(console.error);
                }
            } catch (err) {
                console.error('[GiveawayManager] Erreur annonce annulation:', err);
            }
        }

        return { success: true, giveaway };
    }

    /**
     * Récupère la liste des giveaways d'un serveur
     * @param {string} guildId
     * @param {boolean} [activeOnly=false]
     * @returns {object[]}
     */
    getGuildGiveaways(guildId, activeOnly = false) {
        const all = Array.from(this.giveaways.values()).filter(g => g.guildId === guildId);
        if (activeOnly) {
            return all.filter(g => !g.ended && !g.cancelled);
        }
        return all;
    }

    /**
     * Démarre la boucle de vérification périodique des giveaways arrivés à expiration
     * @param {import('discord.js').Client} client
     * @param {number} [intervalMs=10000]
     */
    start(client, intervalMs = 10000) {
        if (this.checkInterval) {
            clearInterval(this.checkInterval);
        }

        this.checkInterval = setInterval(async () => {
            const now = Date.now();
            for (const giveaway of this.giveaways.values()) {
                if (!giveaway.ended && !giveaway.cancelled && now >= giveaway.endsAt) {
                    try {
                        await this.endGiveaway(giveaway.id, client);
                    } catch (err) {
                        console.error(`[GiveawayManager] Erreur lors de la clôture automatique du giveaway ${giveaway.id}:`, err);
                    }
                }
            }
        }, intervalMs);
    }

    /**
     * Arrête la boucle de vérification
     */
    stop() {
        if (this.checkInterval) {
            clearInterval(this.checkInterval);
            this.checkInterval = null;
        }
    }
}
