import { Client, GatewayIntentBits, ChannelType } from 'discord.js';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config();

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages
    ]
});

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

    console.log(`📂 Recherche du salon forum '📁︙dossiers-espionnage' dans ${guild.name}...`);
    
    // Tenter de charger le forum ID depuis le JSON si présent
    let forumChannelId = null;
    const jsonPath = path.join(process.cwd(), 'espionage_dossiers.json');
    if (fs.existsSync(jsonPath)) {
        try {
            const data = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
            if (data.guilds && data.guilds[targetGuildId]) {
                forumChannelId = data.guilds[targetGuildId].forumChannelId;
            }
        } catch (e) {
            console.error('Erreur lors de la lecture du fichier JSON :', e);
        }
    }

    let forumChannel = null;
    if (forumChannelId) {
        forumChannel = guild.channels.cache.get(forumChannelId) || await guild.channels.fetch(forumChannelId).catch(() => null);
    }

    if (!forumChannel) {
        forumChannel = guild.channels.cache.find(ch => 
            ch.name.includes('dossiers-espionnage') && ch.type === ChannelType.GuildForum
        );
    }

    if (!forumChannel) {
        console.error('❌ Salon forum dossiers-espionnage introuvable.');
        process.exit(1);
    }

    console.log(`🧹 Nettoyage des threads dans le salon : ${forumChannel.name}...`);

    let deleteCount = 0;

    // Fetch active threads
    const active = await forumChannel.threads.fetchActive().catch(() => ({ threads: new Map() }));
    for (const [_, thread] of active.threads) {
        if (thread.name.includes('dossiers-')) {
            console.log(`🗑️ Suppression du thread actif : ${thread.name}`);
            await thread.delete('Nettoyage manuel des dossiers d\'espionnage.').catch(err => {
                console.error(`Impossible de supprimer ${thread.name}:`, err.message);
            });
            deleteCount++;
        }
    }

    // Fetch archived threads
    const archived = await forumChannel.threads.fetchArchived().catch(() => ({ threads: new Map() }));
    for (const [_, thread] of archived.threads) {
        if (thread.name.includes('dossiers-')) {
            console.log(`🗑️ Suppression du thread archivé : ${thread.name}`);
            await thread.delete('Nettoyage manuel des dossiers d\'espionnage.').catch(err => {
                console.error(`Impossible de supprimer ${thread.name}:`, err.message);
            });
            deleteCount++;
        }
    }

    // Reset local JSON targets data for this guild if file exists
    if (fs.existsSync(jsonPath)) {
        try {
            const data = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
            if (data.guilds && data.guilds[targetGuildId]) {
                data.guilds[targetGuildId].targets = {};
                fs.writeFileSync(jsonPath, JSON.stringify(data, null, 2), 'utf-8');
                console.log(`⚙️ Fichier local espionage_dossiers.json réinitialisé pour la guilde ${targetGuildId}.`);
            }
        } catch (e) {
            console.error('Erreur lors du reset du fichier JSON :', e);
        }
    }

    console.log(`🎉 Succès : ${deleteCount} thread(s) de dossiers supprimé(s).`);
    client.destroy();
    process.exit(0);
}

main().catch(err => {
    console.error('Erreur critique :', err);
    process.exit(1);
});
