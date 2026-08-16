import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';

dotenv.config();

function main() {
    const jsonPath = path.join(process.cwd(), 'espionage_dossiers.json');
    if (!fs.existsSync(jsonPath)) {
        console.error('❌ Fichier espionage_dossiers.json introuvable.');
        process.exit(1);
    }

    console.log('🧹 Nettoyage des dossiers d\'espionnage inutiles (sans thread et sans notes)...');

    try {
        const data = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
        let totalCleaned = 0;

        if (data.guilds) {
            for (const guildId of Object.keys(data.guilds)) {
                const guildData = data.guilds[guildId];
                if (guildData.targets) {
                    const beforeCount = Object.keys(guildData.targets).length;
                    
                    for (const userId of Object.keys(guildData.targets)) {
                        const target = guildData.targets[userId];
                        
                        // Un dossier est considéré inutile s'il n'a pas de thread Discord lié ET s'il n'a pas de notes écrites par des agents
                        const hasNoThread = !target.threadId;
                        const hasNoNotes = !target.notes || target.notes.length === 0;

                        if (hasNoThread && hasNoNotes) {
                            console.log(`🗑️ Nettoyage de la cible passive : ${userId} (Messages: ${target.messageCount || 0})`);
                            delete guildData.targets[userId];
                            totalCleaned++;
                        }
                    }
                    
                    const afterCount = Object.keys(guildData.targets).length;
                    console.log(`⚙️ Guilde ${guildId} : ${beforeCount} -> ${afterCount} cibles (${beforeCount - afterCount} nettoyées).`);
                }
            }
        }

        if (totalCleaned > 0) {
            fs.writeFileSync(jsonPath, JSON.stringify(data, null, 2), 'utf-8');
            console.log(`🎉 Nettoyage terminé ! Au total, ${totalCleaned} dossier(s) inutile(s) ont été purgés de la base de données.`);
        } else {
            console.log('ℹ️ Aucun dossier inutile (sans thread et sans notes) n\'a été trouvé.');
        }

    } catch (error) {
        console.error('❌ Erreur lors du nettoyage :', error);
        process.exit(1);
    }
}

main();
