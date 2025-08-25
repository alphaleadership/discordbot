import dotenv from 'dotenv';
import { Octokit } from '@octokit/rest';
import fs from 'fs';
import path from 'path';
dotenv.config();
// Configuration
const TEST_COUNT = 5; // Nombre de messages de test à générer
const LOG_FILE = 'logs/test-logs.log';
const GITHUB_LOG_FILE = 'test-logs.log'; // Fichier de test sur GitHub

// Fonction pour ajouter des logs de test
async function addTestLogs() {
    const logs = [];
    const timestamp = new Date().toISOString();
    
    console.log(`\n=== Début du test de journalisation (${timestamp}) ===`);
    
    // Créer des messages de test
    for (let i = 1; i <= TEST_COUNT; i++) {
        const logMessage = `[TEST] ${timestamp} - Message de test #${i} - ${Math.random().toString(36).substring(2, 8)}`;
        logs.push(logMessage);
        console.log(`Message ${i}: ${logMessage}`);
    }
    
    // Créer le dossier logs s'il n'existe pas
    const logDir = path.dirname(LOG_FILE);
    if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
        console.log(`Dossier créé: ${logDir}`);
    }
    
    // Écrire dans le fichier de log local
    try {
        fs.appendFileSync(LOG_FILE, logs.join('\n') + '\n');
        console.log(`\n✅ ${logs.length} messages écrits dans ${LOG_FILE}`);
    } catch (error) {
        console.error('❌ Erreur lors de l\'écriture du fichier de log local:', error.message);
    }
    
    return logs;
}

// Fonction pour envoyer les logs vers GitHub
async function sendLogsToGitHub(logs) {
    if (!process.env.GITHUB_TOKEN || !process.env.GITHUB_OWNER || !process.env.GITHUB_REPO) {
        console.log('\n⚠️ Configuration GitHub manquante. Test d\'envoi vers GitHub ignoré.');
        console.log('Assurez-vous que les variables GITHUB_TOKEN, GITHUB_OWNER et GITHUB_REPO sont définies.');
        return;
    }
    
    console.log('\n=== Test d\'envoi vers GitHub ===');
    
    try {
        const octokit = new Octokit({
            auth: process.env.GITHUB_TOKEN,
            userAgent: 'GitBot Test',
            timeZone: 'Europe/Paris'
        });
        
        // Préparer le contenu
        const content = logs.join('\n') + '\n';
        const message = `[Test] Ajout de logs de test - ${new Date().toISOString()}`;
        
        // Essayer de récupérer le fichier existant
        let sha;
        try {
            const { data } = await octokit.repos.getContent({
                owner: process.env.GITHUB_OWNER,
                repo: process.env.GITHUB_REPO,
                path: GITHUB_LOG_FILE,
                ref: process.env.GITHUB_BRANCH || 'main'
            });
            sha = data.sha;
            console.log('Fichier existant trouvé sur GitHub, mise à jour en cours...');
        } catch (error) {
            if (error.status === 404) {
                console.log('Création d\'un nouveau fichier sur GitHub...');
            } else {
                throw error;
            }
        }
        
        // Envoyer ou mettre à jour le fichier
        const response = await octokit.repos.createOrUpdateFileContents({
            owner: process.env.GITHUB_OWNER,
            repo: process.env.GITHUB_REPO,
            path: GITHUB_LOG_FILE,
            message: message,
            content: Buffer.from(content).toString('base64'),
            sha: sha,
            branch: process.env.GITHUB_BRANCH || 'main',
            committer: {
                name: 'GitBot Test',
                email: 'test@example.com'
            }
        });
        
        console.log(`✅ Fichier envoyé avec succès sur GitHub!`);
        console.log(`   URL: ${response.data.content.html_url}`);
        
    } catch (error) {
        console.error('❌ Erreur lors de l\'envoi vers GitHub:', error.message);
        if (error.status === 403) {
            console.error('   Vérifiez que votre token GitHub a les permissions nécessaires (repo ou public_repo)');
        }
    }
}

// Fonction principale
async function runTests() {
    console.log('=== Démarrage des tests de journalisation ===');
    console.log(`Configuration actuelle:`);
    console.log(`- Dépôt: ${process.env.GITHUB_OWNER}/${process.env.GITHUB_REPO || 'non défini'}`);
    console.log(`- Branche: ${process.env.GITHUB_BRANCH || 'main'}`);
    
    // 1. Tester la journalisation locale
    const logs = await addTestLogs();
    
    // 2. Tester l'envoi vers GitHub
    await sendLogsToGitHub(logs);
    
    console.log('\n=== Test terminé ===');
}

// Démarrer les tests
runTests().catch(console.error);
