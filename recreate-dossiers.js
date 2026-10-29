import { Client, GatewayIntentBits, ChannelType, EmbedBuilder } from 'discord.js';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config();

const TARGET_GUILD_ID = '1101569746333351986';

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildMembers
    ]
});

// ─── Helpers ────────────────────────────────────────────────────────────────

function getThreatEmoji(level) {
    switch (level) {
        case 'Critical': return '🔴';
        case 'High':     return '🟠';
        case 'Medium':   return '🟡';
        default:         return '🟢';
    }
}

function getThreatColor(level) {
    switch (level) {
        case 'Critical': return 0xff0000;
        case 'High':     return 0xffa500;
        case 'Medium':   return 0xffff00;
        default:         return 0x00ff00;
    }
}

/**
 * Construit l'embed principal du dossier.
 * @param {import('discord.js').User} user       – objet User Discord (toujours requis)
 * @param {import('discord.js').GuildMember|null} member – membre du serveur (peut être null)
 * @param {string} threatLevel
 * @param {number} messageCount
 * @param {Array}  notes
 * @param {import('discord.js').Guild} guild
 */
async function buildDossierEmbed(user, member, threatLevel, messageCount, notes, guild) {
    const threatEmoji = getThreatEmoji(threatLevel);
    const threatColor = getThreatColor(threatLevel);

    const createdDate = `<t:${Math.floor(user.createdTimestamp / 1000)}:R>`;
    const joinedDate  = member?.joinedTimestamp
        ? `<t:${Math.floor(member.joinedTimestamp / 1000)}:R>`
        : '⚠️ Non membre du serveur actuellement';

    // Banlist Discord
    let banStatusText = 'Non présent dans la banlist';
    try {
        const ban = await guild.bans.fetch(user.id).catch(() => null);
        if (ban) banStatusText = `🔴 **BANNI (Discord)**\n**Raison :** ${ban.reason || 'Aucune raison spécifiée'}`;
    } catch {}

    // Vérifier aussi banlist.txt local
    if (banStatusText === 'Non présent dans la banlist' && fs.existsSync('banlist.txt')) {
        const lines = fs.readFileSync('banlist.txt', 'utf-8').split('\n');
        const entry = lines.find(l => l.startsWith(`${user.id} -`));
        if (entry) {
            const m = entry.match(/ - (.*?)( \| Ajouté par:|$)/);
            banStatusText = `🔴 **BANNI (Banlist Interne)**\n**Raison :** ${m ? m[1] : 'Raison non spécifiée'}`;
        }
    }

    const rolesText = member
        ? (member.roles.cache
            .filter(r => r.id !== member.guild.roles.everyone.id)
            .map(r => `<@&${r.id}>`)
            .join(', ') || 'Aucun rôle')
        : '⚠️ Non membre du serveur actuellement';

    const recentNotes = notes.slice(-5).map(n => {
        const author = n.author === 'system' ? '💻 Système' : `<@${n.author}>`;
        const ts = Math.floor(new Date(n.timestamp).getTime() / 1000);
        const preview = n.content.length > 120 ? n.content.slice(0, 120) + '…' : n.content;
        return `• *le <t:${ts}:d>* : ${preview} (par ${author})`;
    }).join('\n') || 'Aucune note rédigée pour le moment.';

    const avatarUrl = typeof user.displayAvatarURL === 'function'
        ? user.displayAvatarURL({ dynamic: true })
        : null;

    const embed = new EmbedBuilder()
        .setColor(threatColor)
        .setTitle(`📂 DOSSIER CLASSÉ : ${user.username}`)
        .setDescription(
            `Fiche de renseignement confidentielle concernant le citoyen/sujet <@${user.id}>.` +
            (!member ? '\n⚠️ *Cette personne n\'est pas (ou plus) membre du serveur.*' : '')
        )
        .addFields(
            { name: '👤 Identité',             value: `**Username:** ${user.username}\n**ID:** \`${user.id}\``, inline: true },
            { name: '⚠️ Niveau de Menace',    value: `${threatEmoji} **${threatLevel.toUpperCase()}**`,          inline: true },
            { name: '📅 Registre Temporel',    value: `**Création compte:** ${createdDate}\n**Arrivée serveur:** ${joinedDate}`, inline: false },
            { name: '📊 Activité',             value: `**Messages détectés:** \`${messageCount}\``,              inline: true },
            { name: '🛑 Statut Banlist',       value: banStatusText,                                              inline: true },
            { name: '🛡️ Rôles Actuels',       value: rolesText,                                                  inline: false },
            { name: '🚨 Historique des Infractions', value: 'Aucun avertissement actif.',                        inline: false },
            { name: '🕵️ Derniers rapports d\'agents', value: recentNotes,                                        inline: false }
        )
        .setFooter({ text: 'Service de Renseignement - Confidentiel Défense' })
        .setTimestamp();

    if (avatarUrl) embed.setThumbnail(avatarUrl);
    return embed;
}

// ─── Main ───────────────────────────────────────────────────────────────────

async function main() {
    console.log('🔌 Connexion au bot Discord...');
    await client.login(process.env.DISCORD_TOKEN);
    console.log(`✅ Connecté en tant que ${client.user.tag}`);

    // Charger le JSON
    const jsonPath = path.join(process.cwd(), 'espionage_dossiers.json');
    if (!fs.existsSync(jsonPath)) {
        console.error('❌ Fichier espionage_dossiers.json introuvable.');
        process.exit(1);
    }
    const data = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));

    if (!data.guilds?.[TARGET_GUILD_ID]) {
        console.error(`❌ Aucune configuration pour ${TARGET_GUILD_ID} dans le JSON.`);
        process.exit(1);
    }

    // Récupérer la guilde
    let guild = client.guilds.cache.get(TARGET_GUILD_ID);
    if (!guild) guild = await client.guilds.fetch(TARGET_GUILD_ID).catch(() => null);
    if (!guild) {
        console.error(`❌ Serveur ${TARGET_GUILD_ID} introuvable (bot pas membre ?).`);
        process.exit(1);
    }
    console.log(`🏠 Serveur : ${guild.name}`);

    // Récupérer le canal forum
    const forumChannelId = data.guilds[TARGET_GUILD_ID].forumChannelId;
    if (!forumChannelId) {
        console.error('❌ forumChannelId non configuré dans le JSON pour cette guilde.');
        process.exit(1);
    }

    let forumChannel = guild.channels.cache.get(forumChannelId);
    if (!forumChannel) {
        // Forcer le fetch complet des channels de la guilde
        await guild.channels.fetch().catch(() => null);
        forumChannel = guild.channels.cache.get(forumChannelId);
    }
    if (!forumChannel) forumChannel = await guild.channels.fetch(forumChannelId).catch(() => null);

    // Si toujours introuvable, chercher par nom ou créer
    if (!forumChannel || forumChannel.type !== ChannelType.GuildForum) {
        console.log(`⚠️  Forum ${forumChannelId} introuvable. Recherche par nom...`);
        await guild.channels.fetch().catch(() => null);
        forumChannel = guild.channels.cache.find(ch =>
            ch.type === ChannelType.GuildForum &&
            (ch.name.includes('dossiers-espionnage') || ch.name.includes('dossiers-cibles'))
        );
    }

    // Créer le forum si vraiment introuvable
    if (!forumChannel) {
        console.log(`🆕 Création du salon forum dossiers-espionnage...`);
        try {
            forumChannel = await guild.channels.create({
                name: '📁︙dossiers-espionnage',
                type: ChannelType.GuildForum,
                topic: 'Dossiers de renseignement confidentiels - Confidentiel Défense',
                reason: 'Création automatique du système de dossiers d\'espionnage.'
            });
            console.log(`✅ Forum créé : #${forumChannel.name} (${forumChannel.id})`);
        } catch (err) {
            console.error(`❌ Impossible de créer le forum :`, err.message);
            process.exit(1);
        }
    }

    // Mettre à jour l'ID dans le JSON
    if (data.guilds[TARGET_GUILD_ID].forumChannelId !== forumChannel.id) {
        data.guilds[TARGET_GUILD_ID].forumChannelId = forumChannel.id;
        fs.writeFileSync(jsonPath, JSON.stringify(data, null, 2), 'utf-8');
        console.log(`💾 forumChannelId mis à jour : ${forumChannel.id}`);
    }
    console.log(`📂 Forum : #${forumChannel.name}`);

    const targets  = data.guilds[TARGET_GUILD_ID].targets;
    const userIds  = Object.keys(targets);
    const toCreate = userIds.filter(uid => !targets[uid].threadId);

    // Charger la banlist locale pour le filtre vert
    const banlistLines = fs.existsSync('banlist.txt')
        ? fs.readFileSync('banlist.txt', 'utf-8').split('\n')
        : [];
    const isInBanlist = (uid) => banlistLines.some(l => l.startsWith(`${uid} -`));

    /**
     * Détermine si un dossier mérite d'être créé.
     * Les dossiers 🟢 (Low) sont ignorés SAUF si :
     *   - l'utilisateur est dans la banlist locale
     *   - le dossier contient au moins une note
     */
    const shouldCreate = (uid, tData) => {
        if (tData.threatLevel !== 'Low') return true;      // Orange / Jaune / Rouge → toujours créer
        if ((tData.notes || []).length > 0) return true;   // A des notes → créer
        if (isInBanlist(uid)) return true;                 // Dans la banlist → créer
        return false;                                       // Vert sans notes ni banlist → skip
    };

    const skippedGreen = userIds.filter(uid => !targets[uid].threadId && !shouldCreate(uid, targets[uid])).length;
    console.log(`\n📋 Total targets : ${userIds.length} | À créer : ${toCreate.length} | Verts ignorés : ${skippedGreen}\n`);

    let createdCount = 0;
    let skippedCount = 0;
    let errorCount   = 0;

    for (const userId of userIds) {
        const targetData = targets[userId];

        // Déjà un thread — vérifier qu'il existe toujours
        if (targetData.threadId) {
            let existing = guild.channels.cache.get(targetData.threadId)
                || await guild.channels.fetch(targetData.threadId).catch(() => null);
            if (existing) {
                console.log(`ℹ️  Thread existant pour ${userId} → ${existing.name}. Sauté.`);
                skippedCount++;
                continue;
            }
            // Thread introuvable → on le recrée
            console.log(`⚠️  Thread ${targetData.threadId} introuvable pour ${userId}. Recréation...`);
            targetData.threadId = null;
        }

        // Filtrer les dossiers verts sans intérêt
        if (!shouldCreate(userId, targetData)) {
            console.log(`⏭️  Ignoré (🟢 Low, sans notes ni banlist) : ${userId}`);
            skippedCount++;
            continue;
        }

        // Résoudre l'utilisateur Discord
        console.log(`⏳ Récupération user ${userId}...`);
        const user = await client.users.fetch(userId).catch(() => null);
        if (!user) {
            console.log(`❌ Utilisateur ${userId} introuvable (compte supprimé ?). Sauté.`);
            errorCount++;
            continue;
        }

        // Résoudre le membre (optionnel)
        const member = await guild.members.fetch(userId).catch(() => null);
        if (!member) {
            console.log(`   ⚠️  ${user.username} n'est pas membre du serveur (dossier quand même créé).`);
        }

        try {
            const threatLevel  = targetData.threatLevel || 'Low';
            const threatEmoji  = getThreatEmoji(threatLevel);
            const threadName   = `${threatEmoji} dossier-${user.username}-${userId.slice(-6)}`;

            const embed = await buildDossierEmbed(
                user,
                member || null,
                threatLevel,
                targetData.messageCount || 0,
                targetData.notes || [],
                guild
            );

            console.log(`🆕 Création thread : ${threadName}`);
            const thread = await forumChannel.threads.create({
                name: threadName,
                message: { embeds: [embed] }
            });

            targetData.threadId = thread.id;
            createdCount++;
            console.log(`   ✅ Thread créé : ${thread.id}`);

            // Envoyer les notes comme messages séparés dans le thread
            for (const note of (targetData.notes || [])) {
                const authorText = note.author === 'system' ? '💻 Système' : `<@${note.author}>`;
                const noteEmbed  = new EmbedBuilder()
                    .setColor(0x2b2d31)
                    .setAuthor({ name: 'Rapport d\'Agent / Note de Dossier' })
                    .setDescription(note.content.slice(0, 4096))
                    .addFields({ name: 'Agent', value: authorText, inline: true })
                    .setTimestamp(new Date(note.timestamp));
                await thread.send({ embeds: [noteEmbed] }).catch(() => null);
                // Petit délai entre chaque note pour éviter le rate-limit
                await new Promise(r => setTimeout(r, 500));
            }

            // Sauvegarde intermédiaire toutes les 10 créations
            if (createdCount % 10 === 0) {
                fs.writeFileSync(jsonPath, JSON.stringify(data, null, 2), 'utf-8');
                console.log('   💾 Sauvegarde intermédiaire...');
            }

            // Délai entre les threads pour éviter le rate-limit Discord
            await new Promise(r => setTimeout(r, 2000));

        } catch (err) {
            console.error(`❌ Échec pour ${user.username} (${userId}) :`, err.message);
            errorCount++;
            // Attendre un peu plus en cas d'erreur (probable rate-limit)
            await new Promise(r => setTimeout(r, 5000));
        }
    }

    // Sauvegarde finale
    data.guilds[TARGET_GUILD_ID].targets = targets;
    data.metadata = data.metadata || {};
    data.metadata.lastModified = new Date().toISOString();
    fs.writeFileSync(jsonPath, JSON.stringify(data, null, 2), 'utf-8');

    console.log(`\n🎉 Terminé !`);
    console.log(`   ✅ Créés    : ${createdCount}`);
    console.log(`   ℹ️  Sautés   : ${skippedCount}`);
    console.log(`   ❌ Erreurs  : ${errorCount}`);

    client.destroy();
    process.exit(0);
}

main().catch(err => {
    console.error('Erreur critique :', err);
    client.destroy();
    process.exit(1);
});
