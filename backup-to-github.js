import dotenv from 'dotenv';
import { Octokit } from '@octokit/rest';
import fs from 'fs';
import path from 'path';

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

// Créer une instance Octokit
let octokit;
if (process.env.GITHUB_TOKEN) {
    octokit = new Octokit({
        auth: process.env.GITHUB_TOKEN,
        userAgent: 'GitBot Backup',
        timeZone: 'Europe/Paris',
        request: {
            headers: {
                'X-GitHub-Api-Version': '2022-11-28'
            }
        }
    });
} else {
    console.error('❌ GITHUB_TOKEN non défini dans .env');
    process.exit(1);
}

/**
 * Sauvegarde un fichier sur GitHub
 */
async function backupFile(filePath) {
    try {
        const fileName = path.basename(filePath);
        const fileDir = path.dirname(filePath);
        
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
            const { data } = await octokit.repos.getContent({
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
        const response = await octokit.repos.createOrUpdateFileContents({
            owner: process.env.GITHUB_OWNER,
            repo: process.env.GITHUB_REPO,
            path: filePath,
            message: `[Backup] ${new Date().toISOString()} - ${fileName}`,
            content: Buffer.from(content).toString('base64'),
            sha: sha,
            branch: process.env.GITHUB_BRANCH || 'main',
            committer: {
                name: 'GitBot Backup',
                email: 'backup@gitbot.com'
            },
            author: {
                name: 'GitBot Backup',
                email: 'backup@gitbot.com'
            }
        });
        
        console.log(`✅ ${filePath} sauvegardé avec succès!`);
        console.log(`   URL: ${response.data.content.html_url}`);
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
async function runBackup() {
    console.log('=== Début de la sauvegarde ===');
    console.log(`Dépôt: ${process.env.GITHUB_OWNER}/${process.env.GITHUB_REPO}`);
    console.log(`Branche: ${process.env.GITHUB_BRANCH || 'main'}`);
    console.log('Fichiers à sauvegarder:', FILES_TO_BACKUP.join(', '));
    
    let successCount = 0;
    
    // Sauvegarder chaque fichier
    for (const filePath of FILES_TO_BACKUP) {
        const success = await backupFile(filePath);
        if (success) successCount++;
        console.log(''); // Ligne vide pour une meilleure lisibilité
    }
    
    // Afficher le résumé
    console.log('=== Résumé de la sauvegarde ===');
    console.log(`✅ ${successCount} fichiers sauvegardés avec succès`);
    console.log(`❌ ${FILES_TO_BACKUP.length - successCount} échecs`);
    
    return successCount === FILES_TO_BACKUP.length;
}

// Démarrer la sauvegarde
runBackup()
    .then(success => {
        console.log(success ? '\n✅ Sauvegarde terminée avec succès!' : '\n⚠️ La sauvegarde a rencontré des erreurs.');
        process.exit(success ? 0 : 1);
    })
    .catch(error => {
        console.error('❌ Erreur critique lors de la sauvegarde:', error);
        process.exit(1);
    });
