/**
 * db-setup.js — Script d'initialisation de la base de données MySQL Free.fr
 * 
 * Usage : node db-setup.js
 * 
 * Ce script :
 *   1. Se connecte à MySQL avec les credentials du .env
 *   2. Crée toutes les tables si elles n'existent pas
 *   3. Affiche un résumé des tables créées
 */

import dotenv from 'dotenv';
dotenv.config();

import { db } from './utils/Database.js';
import { runMigrations, MIGRATIONS } from './utils/DatabaseMigrations.js';

async function main() {
    console.log('🚀 Initialisation de la base de données MySQL...\n');

    // Vérifier que les variables sont configurées
    const required = ['MYSQL_HOST', 'MYSQL_USER', 'MYSQL_PASS', 'MYSQL_DB'];
    const missing = required.filter(v => !process.env[v] || process.env[v].startsWith('VOTRE_'));

    if (missing.length > 0) {
        console.error('❌ Variables MySQL non configurées dans .env :');
        missing.forEach(v => console.error(`   - ${v}`));
        console.error('\n👉 Remplis les valeurs dans .env puis relance : node db-setup.js');
        process.exit(1);
    }

    console.log(`📡 Connexion à ${process.env.MYSQL_HOST}/${process.env.MYSQL_DB}...`);

    // Connexion
    await db.connect();

    if (!db.isConnected()) {
        console.error('❌ Impossible de se connecter à MySQL. Vérifie tes credentials dans .env.');
        process.exit(1);
    }

    // Exécuter les migrations
    await runMigrations(db);

    // Vérifier les tables créées
    console.log('\n📋 Tables présentes dans la base :');
    try {
        const tables = await db.query('SHOW TABLES');
        if (tables.length === 0) {
            console.log('   (aucune table)');
        } else {
            tables.forEach(row => {
                const tableName = Object.values(row)[0];
                console.log(`   ✅ ${tableName}`);
            });
        }
    } catch (err) {
        console.error('   ❌ Erreur lors de la vérification :', err.message);
    }

    console.log('\n🎉 Setup terminé ! La base de données est prête.');
    console.log('   Ajoute db.connect() dans index.js pour activer la DB au démarrage du bot.\n');

    await db.disconnect();
    process.exit(0);
}

main().catch(err => {
    console.error('Erreur critique :', err.message);
    process.exit(1);
});
