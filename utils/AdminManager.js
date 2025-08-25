import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Obtenir le chemin du répertoire actuel en ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default class AdminManager {
    constructor(filePath = 'data/admins.json') {
        this.filePath = path.join(process.cwd(), filePath);
        this.admins = this.loadAdmins();
    }

    loadAdmins() {
        try {
            if (fs.existsSync(this.filePath)) {
                const data = fs.readFileSync(this.filePath, 'utf8');
                return JSON.parse(data);
            } else {
                // Créer le dossier data s'il n'existe pas
                const dir = path.dirname(this.filePath);
                if (!fs.existsSync(dir)) {
                    fs.mkdirSync(dir, { recursive: true });
                }
                
                // Ajouter l'admin par défaut
                const defaultAdmin = '419033737607512065';
                fs.writeFileSync(this.filePath, JSON.stringify([defaultAdmin], null, 2));
                return [defaultAdmin];
            }
        } catch (error) {
            console.error('Erreur lors du chargement des administrateurs:', error);
            // En cas d'erreur, retourner quand même l'admin par défaut
            return ['419033737607512065'];
        }
    }

    saveAdmins() {
        try {
            const dir = path.dirname(this.filePath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            // Sauvegarder en JSON
            fs.writeFileSync(this.filePath, JSON.stringify(this.admins, null, 2), 'utf8');
            
            // Sauvegarder en texte brut
            const textFilePath = path.join(dir, 'admins.txt');
            const textContent = this.admins.join('\n');
            fs.writeFileSync(textFilePath, textContent, 'utf8');
            
            return true;
        } catch (error) {
            console.error('Erreur lors de la sauvegarde des administrateurs:', error);
            return false;
        }
    }

    /**
     * Recharge les administrateurs depuis le fichier
     * @returns {boolean} True si le rechargement a réussi, false sinon
     */
    reload() {
        try {
            this.admins = this.loadAdmins();
            return true;
        } catch (error) {
            console.error('Erreur lors du rechargement des administrateurs:', error);
            return false;
        }
    }

    isAdmin(userId) {
        return this.admins.includes(userId);
    }

    addAdmin(userId) {
        try {
            if (!this.admins.includes(userId)) {
                this.admins.push(userId);
                const result = this.saveAdmins();
                if (!result) {
                    console.error(`Échec de la sauvegarde lors de l'ajout de l'admin ${userId}`);
                }
                return result;
            }
            return false;
        } catch (error) {
            console.error(`Erreur lors de l'ajout de l'admin ${userId}:`, error);
            return false;
        }
    }

    removeAdmin(userId) {
        try {
            const initialLength = this.admins.length;
            this.admins = this.admins.filter(id => id !== userId);
            if (this.admins.length !== initialLength) {
                const result = this.saveAdmins();
                if (!result) {
                    console.error(`Échec de la sauvegarde lors de la suppression de l'admin ${userId}`);
                }
                return result;
            }
            return false;
        } catch (error) {
            console.error(`Erreur lors de la suppression de l'admin ${userId}:`, error);
            return false;
        }
    }
    
    // Méthode pour sauvegarder dans un fichier texte brut (en plus du JSON)
    saveToTextFile() {
        try {
            const textFilePath = path.join(process.cwd(), 'data/admins.txt');
            const textContent = this.admins.join('\n');
            fs.writeFileSync(textFilePath, textContent, 'utf8');
            return true;
        } catch (error) {
            console.error('Erreur lors de la sauvegarde des administrateurs dans le fichier texte:', error);
            return false;
        }
    }
}

