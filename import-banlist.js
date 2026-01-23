import fs from 'fs';
import path from 'path';
import { BanlistManager } from './utils/BanlistManager.js';

function parseArgs(argv) {
    const args = argv.slice(2);
    const out = {
        file: null,
        reason: 'raideur',
        author: '840985745182425108',
        dryRun: false
    };

    for (let i = 0; i < args.length; i++) {
        const a = args[i];
        if (a === '--file' || a === '-f') {
            out.file = args[i + 1] || "./import.txt";
            i++;
            continue;
        }
        if (a === '--reason' || a === '-r') {
            out.reason = args[i + 1] ?? out.reason;
            i++;
            continue;
        }
        if (a === '--author' || a === '-a') {
            out.author = args[i + 1] ?? out.author;
            i++;
            continue;
        }
        if (a === '--dry-run') {
            out.dryRun = true;
            continue;
        }
        if (a === '--help' || a === '-h') {
            out.help = true;
            continue;
        }
        if (!out.file && !a.startsWith('-')) {
            out.file = a;
        }
    }

    return out;
}

function printHelp() {
    console.log('Usage: node import-banlist.js --file <ids.txt> [--reason <texte>] [--author <id>] [--dry-run]');
    console.log('Alias: node import-banlist.js <ids.txt> [--reason <texte>] [--author <id>] [--dry-run]');
}

function extractIds(text) {
    const ids = new Set();
    const lines = text.split(/\r?\n/);
    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        if (trimmed.startsWith('#')) continue;
        const matches = trimmed.match(/\b\d{10,25}\b/g);
        if (!matches) continue;
        for (const m of matches) ids.add(m);
    }
    console.log(ids)
    return Array.from(ids);
}

async function main() {
    const { file, reason, author, dryRun, help } = parseArgs(process.argv);
    if (help) {
        printHelp();
        process.exit(0);
    }

    if (!file) {
        printHelp();
        process.exit(2);
    }

    const filePath = path.resolve(process.cwd(), file);
    if (!fs.existsSync(filePath)) {
        console.error(`Fichier introuvable: ${filePath}`);
        process.exit(2);
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    const ids = extractIds(content);

    if (ids.length === 0) {
        console.log('Aucun ID Discord trouvé dans le fichier.');
        process.exit(0);
    }

    if (dryRun) {
        console.log(`Dry-run: ${ids.length} ID(s) détecté(s).`);
        process.exit(0);
    }

    const banlistManager = new BanlistManager();
    const result = await banlistManager.addManyToBanlist(ids, reason, author);

    if (!result.success) {
        console.error(result.message);
        process.exit(1);
    }

    console.log(result.message);
    process.exit(0);
}

main().catch(error => {
    console.error('Erreur fatale:', error);
    process.exit(1);
});

