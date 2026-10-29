/**
 * generate-gateway-key.js
 * 
 * 1. Génère une clé secrète 256 bits
 * 2. Met à jour .env (GATEWAY_SECRET) et db_gateway.php (GATEWAY_KEY)
 * 3. Upload automatiquement db_gateway.php sur Free.fr via FTP
 * 
 * Usage : node generate-gateway-key.js
 * 
 * Variables .env requises pour le FTP :
 *   FTP_FREE_HOST  (défaut : ftpperso.free.fr)
 *   FTP_FREE_USER  (ton login Free.fr)
 *   FTP_FREE_PASS  (ton mot de passe Free.fr)
 *   FTP_FREE_PATH  (défaut : /db_gateway.php)
 */

import crypto  from 'crypto';
import fs      from 'fs';
import path    from 'path';
import { fileURLToPath } from 'url';
import dotenv  from 'dotenv';
import * as ftp from 'basic-ftp';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ENV_FILE  = path.join(__dirname, '.env');
const PHP_FILE  = path.join(__dirname, 'db_gateway.php');

// ─── 1. Générer la clé ────────────────────────────────────────────────────────
const newKey = crypto.randomBytes(32).toString('hex');

console.log('🔑 Nouvelle clé générée :');
console.log('   ' + newKey);
console.log('');

let updated = 0;

// ─── 2. Mettre à jour .env ────────────────────────────────────────────────────
if (fs.existsSync(ENV_FILE)) {
    let env = fs.readFileSync(ENV_FILE, 'utf-8');
    if (env.match(/GATEWAY_SECRET=.*/)) {
        env = env.replace(/GATEWAY_SECRET=.*/, `GATEWAY_SECRET=${newKey}`);
    } else {
        env += `\nGATEWAY_SECRET=${newKey}\n`;
    }
    fs.writeFileSync(ENV_FILE, env, 'utf-8');
    console.log('✅ .env mis à jour (GATEWAY_SECRET)');
    updated++;
} else {
    console.warn('⚠️  .env introuvable');
}

// ─── 3. Mettre à jour db_gateway.php ─────────────────────────────────────────
if (fs.existsSync(PHP_FILE)) {
    let php = fs.readFileSync(PHP_FILE, 'utf-8');
    if (php.match(/define\('GATEWAY_KEY',\s*'[^']*'\)/)) {
        php = php.replace(
            /define\('GATEWAY_KEY',\s*'[^']*'\)/,
            `define('GATEWAY_KEY',  '${newKey}')`
        );
        fs.writeFileSync(PHP_FILE, php, 'utf-8');
        console.log('✅ db_gateway.php mis à jour (GATEWAY_KEY)');
        updated++;
    } else {
        console.warn('⚠️  define(GATEWAY_KEY) introuvable dans db_gateway.php');
    }
} else {
    console.warn('⚠️  db_gateway.php introuvable');
}

if (updated < 2) {
    console.error('\n❌ Mise à jour incomplète — upload FTP annulé.');
    process.exit(1);
}

// ─── 4. Upload FTP vers Free.fr ───────────────────────────────────────────────
const ftpHost = process.env.FTP_FREE_HOST || 'ftpperso.free.fr';
const ftpUser = process.env.FTP_FREE_USER;
const ftpPass = process.env.FTP_FREE_PASS;
const ftpPath = process.env.FTP_FREE_PATH || '/db_gateway.php';

if (!ftpUser || !ftpPass || ftpUser.startsWith('VOTRE_')) {
    console.log('');
    console.warn('⚠️  FTP_FREE_USER / FTP_FREE_PASS non configurés dans .env');
    console.warn('   Ajoute ces variables puis relance pour uploader automatiquement :');
    console.warn('   FTP_FREE_HOST=ftpperso.free.fr');
    console.warn('   FTP_FREE_USER=ton_login_free');
    console.warn('   FTP_FREE_PASS=ton_mot_de_passe_free');
    console.warn('   FTP_FREE_PATH=/db_gateway.php');
    console.log('');
    console.log('🎉 Clé générée et fichiers locaux mis à jour. Upload manuel requis.');
    process.exit(0);
}

console.log(`\n📤 Upload FTP vers ${ftpHost}${ftpPath}...`);

const client = new ftp.Client(10000);
client.ftp.verbose = false;

try {
    await client.access({
        host:    ftpHost,
        user:    ftpUser,
        password: ftpPass,
        secure:  false   // Free.fr ne supporte pas FTPS sur ftpperso
    });

    console.log('   ✅ Connecté au FTP Free.fr');

    // S'assurer qu'on est à la racine
    const dir = path.posix.dirname(ftpPath);
    if (dir && dir !== '/') {
        await client.ensureDir(dir);
    }

    await client.uploadFrom(PHP_FILE, ftpPath);
    console.log(`   ✅ db_gateway.php uploadé → ${ftpPath}`);

} catch (err) {
    console.error('   ❌ Erreur FTP :', err.message);
    console.warn('   Upload manuel requis : dépose db_gateway.php via ton client FTP.');
} finally {
    client.close();
}

console.log('\n🎉 Terminé ! .env, db_gateway.php et Free.fr sont synchronisés.');
