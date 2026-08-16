import Client from 'ssh2-sftp-client';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import fs from 'fs';

// Charger les variables d'environnement depuis le fichier .env
dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const config = {
    host: process.env.SFTP_HOST,
    port: parseInt(process.env.SFTP_PORT || '22', 10),
    username: process.env.SFTP_USER,
    password: process.env.SFTP_PASS,
    // bypass host key verification for simplicity, or set to true if host keys are configured
    readyTimeout: 20000
};

async function syncDirectory(sftp, localPath, remotePath) {
    console.log(`🚀 Début de la synchronisation (Local -> Distant) : ${localPath} -> ${remotePath}...`);
    try {
        // S'assurer que le dossier distant existe
        const exists = await sftp.exists(remotePath);
        if (!exists) {
            console.log(`Creating remote directory ${remotePath}...`);
            await sftp.mkdir(remotePath, true);
        }
        
        // Upload de tout le dossier local vers le dossier distant
        const result = await sftp.uploadDir(localPath, remotePath);
        console.log(`✅ Synchronisation réussie pour ${path.basename(localPath)} !`);
        return result;
    } catch (err) {
        console.error(`❌ Échec de la synchronisation de ${localPath}:`, err.message);
        throw err;
    }
}

async function downloadDirectory(sftp, remotePath, localPath) {
    console.log(`📥 Début du téléchargement (Distant -> Local) : ${remotePath} -> ${localPath}...`);
    try {
        const exists = await sftp.exists(remotePath);
        if (exists) {
            if (!fs.existsSync(localPath)) {
                fs.mkdirSync(localPath, { recursive: true });
            }
            await sftp.downloadDir(remotePath, localPath);
            console.log(`✅ Téléchargement réussi pour ${path.basename(localPath)} !`);
        } else {
            console.log(`ℹ️ Le dossier distant ${remotePath} n'existe pas. Ignoré.`);
        }
    } catch (err) {
        console.warn(`⚠️ Échec du téléchargement de ${remotePath}:`, err.message);
        console.log(`ℹ️ Poursuite de la synchronisation malgré l'échec de téléchargement du dossier.`);
    }
}

async function downloadFile(sftp, remoteFile, localFile) {
    console.log(`📥 Téléchargement du fichier (Distant -> Local) : ${remoteFile} -> ${localFile}...`);
    try {
        const exists = await sftp.exists(remoteFile);
        if (exists) {
            await sftp.fastGet(remoteFile, localFile);
            console.log(`✅ Fichier ${path.basename(localFile)} téléchargé avec succès !`);
        } else {
            console.log(`ℹ️ Le fichier distant ${remoteFile} n'existe pas. Ignoré.`);
        }
    } catch (err) {
        console.warn(`⚠️ Échec du téléchargement de ${remoteFile}:`, err.message);
        throw err;
    }
}

async function uploadFile(sftp, localFile, remoteFile) {
    console.log(`🚀 Téléversement du fichier (Local -> Distant) : ${localFile} -> ${remoteFile}...`);
    try {
        await sftp.fastPut(localFile, remoteFile);
        console.log(`✅ Fichier ${path.basename(localFile)} téléversé avec succès !`);
    } catch (err) {
        console.error(`❌ Échec du téléversement de ${localFile}:`, err.message);
        throw err;
    }
}

async function main() {
    const sftp = new Client();
    
    try {
        console.log('🔌 Connexion au serveur SFTP (orion1.ccshield.fr:2022)...');
        await sftp.connect(config);
        console.log('✅ Connexion établie avec succès !');
        
        // 1. UPLOAD du code local vers distant
        const localCommands = path.join(__dirname, 'commands');
        const remoteCommands = './commands';
        await syncDirectory(sftp, localCommands, remoteCommands);
        
        const localUtils = path.join(__dirname, 'utils');
        const remoteUtils = './utils';
        await syncDirectory(sftp, localUtils, remoteUtils);

        // Upload public folder (dashboard web panel files)
        const localPublic = path.join(__dirname, 'public');
        const remotePublic = './public';
        await syncDirectory(sftp, localPublic, remotePublic);

        // Upload index.js
        const localIndex = path.join(__dirname, 'index.js');
        const remoteIndex = './index.js';
        await uploadFile(sftp, localIndex, remoteIndex);

        // Upload de package.json (indispensable pour l'installation des dépendances comme node-cron)
        const localPackage = path.join(__dirname, 'package.json');
        const remotePackage = './package.json';
        await uploadFile(sftp, localPackage, remotePackage);
        
        // 2. DOWNLOAD des logs distants vers local
        console.log('\n🔄 Récupération des logs du serveur...');
        
        const remoteLogs = './logs';
        const localLogs = path.join(__dirname, 'logs');
        await downloadDirectory(sftp, remoteLogs, localLogs);
        
        const remoteBotLog = './bot.log';
        const localBotLog = path.join(__dirname, 'bot.log');
        await downloadFile(sftp, remoteBotLog, localBotLog);

        // 3. DOWNLOAD des messages distants vers local
        console.log('\n🔄 Récupération des messages du serveur...');
        const remoteMessages = './messages';
        const localMessages = path.join(__dirname, 'messages');
        await downloadDirectory(sftp, remoteMessages, localMessages);

        // 4. DOWNLOAD du fichier des dossiers d'espionnage
        console.log('\n🔄 Récupération des dossiers d\'espionnage du serveur...');
        const remoteEspionage = './espionage_dossiers.json';
        const localEspionage = path.join(__dirname, 'espionage_dossiers.json');
        await downloadFile(sftp, remoteEspionage, localEspionage);

        // 5. DOWNLOAD de la banlist.txt du serveur
        console.log('\n🔄 Récupération de la banlist du serveur...');
        const remoteBanlist = './banlist.txt';
        const localBanlist = path.join(__dirname, 'banlist.txt');
        await downloadFile(sftp, remoteBanlist, localBanlist);
        
        console.log('\n🎉 Synchronisation globale terminée avec succès !');
    } catch (err) {
        console.error('\n❌ Une erreur critique est survenue lors de la synchronisation :', err.message);
        process.exitCode = 1;
    } finally {
        await sftp.end();
        console.log('🔌 Déconnexion du serveur SFTP.');
    }
}

main();
