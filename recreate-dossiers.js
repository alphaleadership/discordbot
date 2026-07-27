import { Client, GatewayIntentBits, ChannelType, PermissionsBitField, EmbedBuilder } from 'discord.js';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config();

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildMembers
    ]
});

// Mock minimal structures to mimic EspionageManager buildDossierEmbed and other methods
class EspionageManagerMock {
    constructor(client, banlistManager) {
        this.client = client;
        this.banlistManager = banlistManager;
    }

    getThreatEmoji(level) {
        switch (level) {
            case 'Critical': return '🔴';
            case 'High': return 'orange';
            case 'Medium': return '🟡';
            case 'Low':
            default:
                return '🟢';
        }
    }

    getThreatColor(level) {
        switch (level) {
            case 'Critical': return 0xff0000;
            case 'High': return 0xffa500;
            case 'Medium': return 0xffff00;
            case 'Low':
            default:
                return 0x00ff00;
        }
    }

    async buildDossierEmbed(member, threatLevel, messageCount, notes) {
        const threatEmoji = this.getThreatEmoji(threatLevel);
        const threatColor = this.getThreatColor(threatLevel);

        const createdDate = `<t:${Math.floor(member.user.createdTimestamp / 1000)}:R>`;
        const joinedDate = `<t:${Math.floor(member.joinedTimestamp / 1000)}:R>`;

        let warnsText = 'Aucun avertissement actif.';

        const recentNotes = notes.slice(-5).map(n => {
            const author = n.author === 'system' ? '💻 Système' : `<@${n.author}>`;
            return `• *le <t:${Math.floor(new Date(n.timestamp).getTime() / 1000)}:d>* : ${n.content} (par ${author})`;
        }).join('\n') || 'Aucune note rédigée pour le moment.';

        let banStatusText = 'Non présent dans la banlist';
        if (this.banlistManager) {
            const guildId = member.guild?.id || member.guildId || '1475239703853928523';
            const banCheck = await this.banlistManager.isBanned(member.id, guildId);
            if (banCheck.banned) {
                banStatusText = `🔴 **BANNI**\n**Raison :** ${banCheck.reason}`;
            }
        }

        const rolesList = member.roles?.cache 
            ? member.roles.cache.filter(r => r.id !== member.guild?.roles?.everyone?.id).map(r => `<@&${r.id}>`).join(', ')
            : 'Aucun rôle';

        return new EmbedBuilder()
            .setColor(threatColor)
            .setTitle(`📂 DOSSIER CLASSÉ : ${member.user.username}`)
            .setDescription(`Fiche de renseignement confidentielle concernant le citoyen/sujet <@${member.id}>.`)
            .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
            .addFields(
                { name: '👤 Identité', value: `**Username:** ${member.user.username}\n**ID:** \`${member.id}\``, inline: true },
                { name: '⚠️ Niveau de Menace', value: `${threatEmoji} **${threatLevel.toUpperCase()}**`, inline: true },
                { name: '📅 Registre Temporel', value: `**Création compte:** ${createdDate}\n**Arrivée serveur:** ${joinedDate}`, inline: false },
                { name: '📊 Activité', value: `**Messages détectés:** \`${messageCount}\``, inline: true },
                { name: '🛑 Statut Banlist', value: banStatusText, inline: true },
                { name: '🛡️ Rôles Actuels', value: rolesList || 'Aucun rôle', inline: false },
                { name: '🚨 Historique des Infractions', value: warnsText, inline: false },
                { name: '🕵️ Derniers rapports d\'agents', value: recentNotes, inline: false }
            )
            .setFooter({ text: 'Service de Renseignement de Monteloria - Confidentiel Défense' })
            .setTimestamp();
    }
}

class BanlistManagerMock {
    async isBanned(userId, guildId = null) {
        if (!fs.existsSync('banlist.txt')) {
            return { banned: false, reason: '' };
        }
        const fileContent = fs.readFileSync('banlist.txt', 'utf-8');
        const lines = fileContent.split('\n').filter(line => line.trim() !== '');
        const banEntry = lines.find(line => line.startsWith(`${userId} -`));
        if (banEntry) {
            const reasonMatch = banEntry.match(/ - (.*?)( \| Ajouté par:|$)/);
            const reason = reasonMatch ? reasonMatch[1] : 'Raison non spécifiée';
            return { banned: true, reason };
        }
        return { banned: false, reason: '' };
    }
}

async function main() {
    console.log('🔌 Connexion au bot Discord...');
    await client.login(process.env.DISCORD_TOKEN);
    console.log(`✅ Connecté en tant que ${client.user.tag}`);

    const targetGuildId = '1475239703853928523';
    const guild = client.guilds.cache.get(targetGuildId) || await client.guilds.fetch(targetGuildId).catch(() => null);

    if (!guild) {
        console.error(`❌ Serveur ${targetGuildId} introuvable.`);
        process.exit(1);
    }

    const jsonPath = path.join(process.cwd(), 'espionage_dossiers.json');
    if (!fs.existsSync(jsonPath)) {
        console.error('❌ Fichier espionage_dossiers.json introuvable.');
        process.exit(1);
    }

    const data = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
    if (!data.guilds || !data.guilds[targetGuildId]) {
        console.error(`❌ Aucune configuration pour le serveur ${targetGuildId} dans le fichier JSON.`);
        process.exit(1);
    }

    const forumChannelId = data.guilds[targetGuildId].forumChannelId;
    if (!forumChannelId) {
        console.error('❌ forumChannelId non configuré pour ce serveur dans le JSON.');
        process.exit(1);
    }

    const forumChannel = guild.channels.cache.get(forumChannelId) || await guild.channels.fetch(forumChannelId).catch(() => null);
    if (!forumChannel || forumChannel.type !== ChannelType.GuildForum) {
        console.error(`❌ Le salon d'ID ${forumChannelId} n'est pas trouvé ou n'est pas un forum.`);
        process.exit(1);
    }

    console.log(`📂 Forum d'espionnage trouvé : ${forumChannel.name}. Début de la recréation des threads...`);

    const espionageMock = new EspionageManagerMock(client, new BanlistManagerMock());
    const targets = data.guilds[targetGuildId].targets;
    const userIds = Object.keys(targets);

    let createdCount = 0;

    for (const userId of userIds) {
        const targetData = targets[userId];
        
        // Skip if thread already exists
        if (targetData.threadId) {
            let existingThread = guild.channels.cache.get(targetData.threadId);
            if (!existingThread) {
                existingThread = await guild.channels.fetch(targetData.threadId).catch(() => null);
            }
            if (existingThread) {
                console.log(`ℹ️ Thread existe déjà pour ${userId} (${existingThread.name}). Sauté.`);
                continue;
            }
        }

        console.log(`⏳ Récupération du membre ${userId}...`);
        let member = await guild.members.fetch(userId).catch(() => null);
        
        if (!member) {
            console.log(`⚠️ Membre ${userId} introuvable sur le serveur. Récupération de l'utilisateur global...`);
            const user = await client.users.fetch(userId).catch(() => null);
            if (!user) {
                console.log(`❌ Utilisateur global ${userId} introuvable. Sauté.`);
                continue;
            }
            // Mock a partial member structure
            member = {
                id: userId,
                user: user,
                guild: guild,
                joinedTimestamp: Date.now(),
                roles: {
                    cache: {
                        filter: () => ({ map: () => [] })
                    }
                }
            };
        }

        try {
            const threatEmoji = espionageMock.getThreatEmoji(targetData.threatLevel || 'Low');
            const threadName = `${threatEmoji} dossiers-${member.user.username}-${userId.slice(-6)}`;
            
            console.log(`🆕 Création du thread forum pour ${member.user.username}...`);
            const embed = await espionageMock.buildDossierEmbed(member, targetData.threatLevel || 'Low', targetData.messageCount || 0, targetData.notes || []);

            const thread = await forumChannel.threads.create({
                name: threadName,
                message: {
                    embeds: [embed]
                }
            });

            // Enregistrer l'ID du thread dans la structure en mémoire
            targetData.threadId = thread.id;
            createdCount++;
            console.log(`✅ Thread créé avec succès : ${threadName} (ID: ${thread.id})`);

            // Envoyer également les notes/rapports passés en messages dans le thread
            if (targetData.notes && targetData.notes.length > 0) {
                for (const noteEntry of targetData.notes) {
                    const authorText = noteEntry.author === 'system' ? '💻 Système' : `<@${noteEntry.author}>`;
                    const noteEmbed = new EmbedBuilder()
                        .setColor('#2b2d31')
                        .setAuthor({ name: 'Rapport d\'Agent / Note de Dossier' })
                        .setDescription(noteEntry.content)
                        .addFields({ name: 'Agent', value: authorText, inline: true })
                        .setTimestamp(new Date(noteEntry.timestamp));

                    await thread.send({ embeds: [noteEmbed] }).catch(() => null);
                }
            }

            // Attendre un peu pour éviter le rate limit Discord
            await new Promise(resolve => setTimeout(resolve, 1500));

        } catch (err) {
            console.error(`❌ Échec de la création pour ${member.user.username}:`, err.message);
        }
    }

    // Sauvegarder le JSON mis à jour avec les nouveaux threadId
    fs.writeFileSync(jsonPath, JSON.stringify(data, null, 2), 'utf-8');
    console.log(`⚙️ Fichier JSON espionage_dossiers.json mis à jour avec les nouveaux ID de threads.`);

    console.log(`🎉 Fin de la recréation : ${createdCount} thread(s) créé(s).`);
    client.destroy();
    process.exit(0);
}

main().catch(err => {
    console.error('Erreur critique :', err);
    process.exit(1);
});
