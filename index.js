/**
 * index.js — Superviseur Nodemon pour le Bot Discord GitBot
 *
 * Ce script agit comme un runner nodemon intégré :
 * 1. Démarre le bot principal (bot.js) dans un processus enfant dédié.
 * 2. Surveille en temps réel bot.js, index.js, package.json, .env, commands/, utils/, public/.
 * 3. Dès qu'un fichier est modifié ou téléversé (via SFTP / sync.js / git pull),
 *    redémarre automatiquement le bot avec debouncing et arrêt propre.
 * 4. Redémarre automatiquement le bot en cas de crash inattendu.
 */

import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Si NO_SUPERVISOR=true est spécifié, exécuter bot.js directement
if (process.env.NO_SUPERVISOR === 'true') {
    await import('./bot.js');
} else {
    runSupervisor();
}

function runSupervisor() {
    const BOT_SCRIPT = path.join(__dirname, 'bot.js');
    // Surveillance EXCLUSIVE de bot.js uniquement.
    // Tous les autres fichiers et répertoires (commands/, utils/, data/, logs/, public/, etc.) sont exclus.
    const WATCH_TARGETS = [
        BOT_SCRIPT
    ];

    let botProcess = null;
    let restartTimeout = null;
    let isRestarting = false;
    let killTimeout = null;
    const DEBOUNCE_DELAY = 1000; // 1s pour laisser le temps au SFTP/git d'écrire complètement le fichier

    function log(msg) {
        const time = new Date().toLocaleTimeString('fr-FR');
        console.log(`[\x1b[36mNodemon\x1b[0m][${time}] ${msg}`);
    }

    function startBot() {
        if (botProcess) return;

        if (!fs.existsSync(BOT_SCRIPT)) {
            log(`\x1b[31mErreur critique : Le fichier principal ${BOT_SCRIPT} est introuvable !\x1b[0m`);
            return;
        }

        log(`🚀 Lancement du bot (\x1b[32m${path.basename(BOT_SCRIPT)}\x1b[0m)...`);

        botProcess = spawn(process.execPath, [BOT_SCRIPT, ...process.argv.slice(2)], {
            cwd: __dirname,
            env: { ...process.env, SUPERVISED_BY_NODEMON: 'true' },
            stdio: 'inherit'
        });

        botProcess.on('exit', (code, signal) => {
            const exitMsg = signal ? `signal ${signal}` : `code ${code}`;
            botProcess = null;
            if (killTimeout) {
                clearTimeout(killTimeout);
                killTimeout = null;
            }

            if (isRestarting) {
                isRestarting = false;
                log(`Arrêt terminé (${exitMsg}). \x1b[32mRedémarrage immédiat...\x1b[0m`);
                startBot();
            } else {
                if (code !== 0 && code !== null) {
                    log(`\x1b[33m⚠️ Le bot s'est arrêté de manière inattendue (${exitMsg}). Relance automatique dans 2s...\x1b[0m`);
                    setTimeout(() => {
                        startBot();
                    }, 2000);
                } else {
                    log(`Bot arrêté proprement (${exitMsg}). En attente de modifications...`);
                }
            }
        });

        botProcess.on('error', (err) => {
            log(`\x1b[31mErreur de processus enfant : ${err.message}\x1b[0m`);
        });
    }

    function triggerRestart(changedPath) {
        if (restartTimeout) {
            clearTimeout(restartTimeout);
        }

        restartTimeout = setTimeout(() => {
            restartTimeout = null;
            log(`🔄 \x1b[33mModification détectée dans ${changedPath}\x1b[0m. Redémarrage du bot...`);

            if (botProcess) {
                isRestarting = true;
                try {
                    botProcess.kill('SIGTERM');
                } catch (_) {
                    try { botProcess.kill('SIGKILL'); } catch (__) {}
                }

                // Forcer SIGKILL après 3s si le processus ne répond plus
                killTimeout = setTimeout(() => {
                    if (botProcess) {
                        log(`\x1b[33mForçage de l'arrêt du bot (SIGKILL)...\x1b[0m`);
                        try { botProcess.kill('SIGKILL'); } catch (_) {}
                    }
                }, 3000);
            } else {
                startBot();
            }
        }, DEBOUNCE_DELAY);
    }

    function watchDirectory(dir) {
        if (!fs.existsSync(dir)) return;

        try {
            fs.watch(dir, (eventType, filename) => {
                if (!filename) return;
                if (filename.endsWith('.tmp') || filename.endsWith('.swp') || filename.endsWith('~') || filename.startsWith('.')) return;
                const rel = path.join(path.basename(dir), filename);
                triggerRestart(rel);
            });

            // Surveiller récursivement les sous-dossiers
            const entries = fs.readdirSync(dir, { withFileTypes: true });
            for (const entry of entries) {
                if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
                    watchDirectory(path.join(dir, entry.name));
                }
            }
        } catch (err) {
            log(`Attention : impossible de surveiller le dossier ${dir} (${err.message})`);
        }
    }

    function watchTarget(target) {
        if (!fs.existsSync(target)) return;
        try {
            fs.watch(target, (eventType) => {
                triggerRestart(path.basename(target));
            });
            log(`👁️ Surveillance active EXCLUSIVEMENT sur : \x1b[32m${path.basename(target)}\x1b[0m (aucun autre fichier n'est surveillé)`);
        } catch (err) {
            log(`Attention : impossible de surveiller ${target} (${err.message})`);
        }
    }

    // Surveiller index.js lui-même : si le superviseur est modifié, relancer tout le superviseur
    function watchSupervisor() {
        try {
            fs.watch(__filename, () => {
                log(`🔄 \x1b[35mindex.js a été modifié. Rechargement du superviseur complet...\x1b[0m`);
                if (botProcess) {
                    try { botProcess.kill('SIGKILL'); } catch (_) {}
                }
                const newSupervisor = spawn(process.execPath, [__filename, ...process.argv.slice(2)], {
                    cwd: __dirname,
                    stdio: 'inherit',
                    detached: false
                });
                process.exit(0);
            });
            log(`👁️ Surveillance active sur le superviseur : \x1b[34mindex.js\x1b[0m`);
        } catch (_) {}
    }

    // Gestion propre des signaux d'arrêt
    process.on('SIGINT', () => {
        log('Signal SIGINT reçu. Arrêt du superviseur et du bot...');
        if (botProcess) {
            try { botProcess.kill('SIGINT'); } catch (_) {}
        }
        process.exit(0);
    });

    process.on('SIGTERM', () => {
        log('Signal SIGTERM reçu. Arrêt du superviseur et du bot...');
        if (botProcess) {
            try { botProcess.kill('SIGTERM'); } catch (_) {}
        }
        process.exit(0);
    });

    log('╔════════════════════════════════════════════╗');
    log('║     SUPERVISEUR NODEMON GITBOT ACTIF       ║');
    log('╚════════════════════════════════════════════╝');

    watchSupervisor();
    for (const target of WATCH_TARGETS) {
        watchTarget(target);
    }
    startBot();
}
