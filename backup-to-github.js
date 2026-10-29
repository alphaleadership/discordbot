import dotenv from 'dotenv';
import { Octokit } from '@octokit/rest';
import fs from 'fs';
import path from 'path';

import { fileURLToPath } from 'url';

// Charger les variables d'environnement
dotenv.config();

// Configuration
const FILES_TO_BACKUP = [
    'bot.log',
    'data/warnings.json',
    'data/guilds_config.json'
];

// Vérifier que le dossier data existe
if (!fs.existsSync('data')) {
    fs.mkdirSync('data', { recursive: true });
}

// Dernière version de l'API REST GitHub
const GITHUB_API_VERSION = process.env.GITHUB_API_VERSION || '2026-03-10';

/**
 * Crée et configure une instance Octokit avec la dernière version de l'API GitHub
 */
function createOctokitClient(token = process.env.GITHUB_TOKEN) {
    if (!token) {
        return null;
    }
    return new Octokit({
        auth: token,
        userAgent: 'GitBot Backup',
        timeZone: 'Europe/Paris',
        request: {
            headers: {
                'Accept': 'application/vnd.github+json',
                'X-GitHub-Api-Version': GITHUB_API_VERSION
            }
        }
    });
}

// Créer une instance Octokit par défaut si le token est disponible
let octokit = null;
if (process.env.GITHUB_TOKEN) {
    octokit = createOctokitClient(process.env.GITHUB_TOKEN);
}

/**
 * Sauvegarde un fichier sur GitHub
 */
async function backupFile(filePath, client = octokit) {
    if (!client) {
        console.error('❌ Client Octokit non initialisé (token manquant)');
        return false;
    }
    try {
        const fileName = path.basename(filePath);
        
        // Vérifier si le fichier source existe
        if (!fs.existsSync(filePath)) {
            console.warn(`⚠️ Fichier non trouvé: ${filePath}`);
            return false;
        }
        
        // Lire le contenu du fichier
        const content = fs.readFileSync(filePath, 'utf8');
        
        // Vérifier si le fichier existe déjà sur GitHub
        let sha;
        try {
            const repos = client.repos || client.rest?.repos;
            const { data } = await repos.getContent({
                owner: process.env.GITHUB_OWNER,
                repo: process.env.GITHUB_REPO,
                path: filePath,
                ref: process.env.GITHUB_BRANCH || 'main'
            });
            sha = data.sha;
            console.log(`📝 Mise à jour du fichier existant: ${filePath}`);
        } catch (error) {
            if (error.status !== 404) {
                throw error;
            }
            console.log(`🆕 Création d'un nouveau fichier: ${filePath}`);
        }
        
        // Envoyer ou mettre à jour le fichier
        const repos = client.repos || client.rest?.repos;
        const payload = {
            owner: process.env.GITHUB_OWNER,
            repo: process.env.GITHUB_REPO,
            path: filePath,
            message: `[Backup] ${new Date().toISOString()} - ${fileName}`,
            content: Buffer.from(content).toString('base64'),
            branch: process.env.GITHUB_BRANCH || 'main',
            committer: {
                name: 'GitBot Backup',
                email: 'backup@gitbot.com'
            },
            author: {
                name: 'GitBot Backup',
                email: 'backup@gitbot.com'
            },
            ...(sha ? { sha } : {})
        };
        const response = await repos.createOrUpdateFileContents(payload);
        
        console.log(`✅ ${filePath} sauvegardé avec succès!`);
        console.log(`   URL: ${response.data.content?.html_url || response.data.commit?.html_url || 'OK'}`);
        return true;
        
    } catch (error) {
        console.error(`❌ Erreur lors de la sauvegarde de ${filePath}:`, error.message);
        if (error.status === 403) {
            console.error('   Vérifiez que votre token GitHub a les permissions nécessaires (repo)');
        }
        return false;
    }
}

/**
 * Fonction principale de sauvegarde
 */
async function runBackup(client = octokit, files = FILES_TO_BACKUP) {
    console.log('=== Début de la sauvegarde ===');
    console.log(`API GitHub Version: ${GITHUB_API_VERSION}`);
    console.log(`Dépôt: ${process.env.GITHUB_OWNER}/${process.env.GITHUB_REPO}`);
    console.log(`Branche: ${process.env.GITHUB_BRANCH || 'main'}`);
    console.log('Fichiers à sauvegarder:', files.join(', '));
    
    let successCount = 0;
    
    // Sauvegarder chaque fichier
    for (const filePath of files) {
        const success = await backupFile(filePath, client);
        if (success) successCount++;
        console.log(''); // Ligne vide pour une meilleure lisibilité
    }
    
    // Afficher le résumé
    console.log('=== Résumé de la sauvegarde ===');
    console.log(`✅ ${successCount} fichiers sauvegardés avec succès`);
    console.log(`❌ ${files.length - successCount} échecs`);
    
    return successCount === files.length;
}

export {
    FILES_TO_BACKUP,
    GITHUB_API_VERSION,
    createOctokitClient,
    backupFile,
    runBackup
};

// Exécution directe si le script est appelé en ligne de commande
const isDirectRun = process.argv[1] && (
    (typeof import.meta.url === 'string' && process.argv[1] === fileURLToPath(import.meta.url)) ||
    process.argv[1].endsWith('backup-to-github.js')
);

if (isDirectRun) {
    if (!process.env.GITHUB_TOKEN) {
        console.error('❌ GITHUB_TOKEN non défini dans .env');
        process.exit(1);
    }
    runBackup()
        .then(success => {
            console.log(success ? '\n✅ Sauvegarde terminée avec succès!' : '\n⚠️ La sauvegarde a rencontré des erreurs.');
            process.exit(success ? 0 : 1);
        })
        .catch(error => {
            console.error('❌ Erreur critique lors de la sauvegarde:', error);
            process.exit(1);
        });
}
