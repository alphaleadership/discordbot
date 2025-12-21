import fs from 'fs';
import path from 'path';

export class BanlistManager {
    /**
     * Ajoute un utilisateur à la liste de bannissement
     * @param {string} userId - L'ID de l'utilisateur à bannir
     * @param {string} reason - La raison du bannissement
     * @param {string} authorId - L'ID de l'auteur de la commande
     * @returns {Promise<{success: boolean, message: string}>}
     */
    async addToBanlist(userId, reason, authorId) {
        try {
            if (!fs.existsSync('banlist.txt')) {
                fs.writeFileSync('banlist.txt', '', 'utf-8');
            }
            
            const fileContent = fs.readFileSync('banlist.txt', 'utf-8');
            const lines = fileContent.split('\n').filter(line => line.trim() !== '');
            
            const existingEntry = lines.find(line => line.startsWith(`${userId} -`));
            if (existingEntry) {
                return {
                    success: false,
                    message: `L'utilisateur avec l'ID ${userId} est déjà dans la liste de bannissement.`
                };
            }
            
            const timestamp = new Date().toISOString();
            const newEntry = `${userId} - ${reason} | Ajouté par: ${authorId} | Le: ${timestamp}\n`;
            
            fs.appendFileSync('banlist.txt', newEntry, 'utf-8');
            
            return {
                success: true,
                message: `L'utilisateur avec l'ID ${userId} a été ajouté à la liste de bannissement.`
            };
        } catch (error) {
            console.error('Erreur lors de l\'ajout à la banlist:', error);
            return {
                success: false,
                message: 'Une erreur est survenue lors de l\'ajout à la liste de bannissement.'
            };
        }
    }

    async addManyToBanlist(userIds, reason, authorId) {
        try {
            if (!Array.isArray(userIds)) {
                return {
                    success: false,
                    message: 'Liste d\'IDs invalide.',
                    added: 0,
                    skipped: 0,
                    invalid: 0,
                    total: 0
                };
            }

            if (!fs.existsSync('banlist.txt')) {
                fs.writeFileSync('banlist.txt', '', 'utf-8');
            }

            const fileContent = fs.readFileSync('banlist.txt', 'utf-8');
            const lines = fileContent.split('\n').filter(line => line.trim() !== '');
            const existingIds = new Set();

            for (const line of lines) {
                const match = line.match(/^(\d{17,19})\s*-/);
                if (match) existingIds.add(match[1]);
            }

            const normalizedUnique = [];
            const seen = new Set();
            let invalid = 0;

            for (const raw of userIds) {
                const id = String(raw || '').trim();
                if (!/^\d{17,19}$/.test(id)) {
                    invalid++;
                    continue;
                }
                if (seen.has(id)) continue;
                seen.add(id);
                normalizedUnique.push(id);
            }

            let added = 0;
            let skipped = 0;
            const timestamp = new Date().toISOString();
            const entriesToAppend = [];

            for (const userId of normalizedUnique) {
                if (existingIds.has(userId)) {
                    skipped++;
                    continue;
                }
                entriesToAppend.push(`${userId} - ${reason} | Ajouté par: ${authorId} | Le: ${timestamp}\n`);
                existingIds.add(userId);
                added++;
            }

            if (entriesToAppend.length > 0) {
                fs.appendFileSync('banlist.txt', entriesToAppend.join(''), 'utf-8');
            }

            return {
                success: true,
                message: `${added} ajouté(s), ${skipped} déjà présent(s), ${invalid} invalide(s).`,
                added,
                skipped,
                invalid,
                total: userIds.length
            };
        } catch (error) {
            console.error('Erreur lors de l\'ajout en masse à la banlist:', error);
            return {
                success: false,
                message: 'Une erreur est survenue lors de l\'ajout en masse à la liste de bannissement.',
                added: 0,
                skipped: 0,
                invalid: 0,
                total: Array.isArray(userIds) ? userIds.length : 0
            };
        }
    }

    /**
     * Vérifie si un utilisateur est dans la liste de bannissement
     * @param {string} userId - L'ID de l'utilisateur à vérifier
     * @returns {Promise<{banned: boolean, reason: string}>}
     */
    async isBanned(userId) {
        try {
            if (!fs.existsSync('banlist.txt')) {
                return { banned: false, reason: '' };
            }
            
            const fileContent = fs.readFileSync('banlist.txt', 'utf-8');
            const lines = fileContent.split('\n').filter(line => line.trim() !== '');
            
            const banEntry = lines.find(line => line.startsWith(`${userId} -`));
            if (banEntry) {
                // Extraire la raison du bannissement (tout ce qui suit ' - ' et précède ' | ')
                const reasonMatch = banEntry.match(/ - (.*?)( \| Ajouté par:|$)/);
                const reason = reasonMatch ? reasonMatch[1] : 'Raison non spécifiée';
                return { banned: true, reason };
            }
            
            return { banned: false, reason: '' };
        } catch (error) {
            console.error('Erreur lors de la vérification de la banlist:', error);
            // En cas d'erreur, on considère que l'utilisateur n'est pas banni pour éviter les faux positifs
            return { banned: false, reason: '' };
        }
    }

    reload() {
        // BanlistManager n'a pas de fichier de configuration à recharger
        console.log('BanlistManager rechargé (pas de fichier de configuration).');
    }
}
