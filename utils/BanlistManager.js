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
