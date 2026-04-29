import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Obtenir le chemin du répertoire actuel en ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default class AdminManager {
    constructor(adminFilePath = 'data/admins.json', agentFilePath = 'data/agents.json') {
        this.adminFilePath = path.join(process.cwd(), adminFilePath);
        this.agentFilePath = path.join(process.cwd(), agentFilePath);
        this.admins = this.loadAdmins();
        this.agents = this.loadAgents();
    }

    loadAdmins() {
        try {
            if (fs.existsSync(this.adminFilePath)) {
                const data = fs.readFileSync(this.adminFilePath, 'utf8');
                return JSON.parse(data);
            } else {
                // Créer le dossier data s'il n'existe pas
                const dir = path.dirname(this.adminFilePath);
                if (!fs.existsSync(dir)) {
                    fs.mkdirSync(dir, { recursive: true });
                }
                
                // Ajouter l'admin par défaut
                const defaultAdmin = '419033737607512065';
                fs.writeFileSync(this.adminFilePath, JSON.stringify([defaultAdmin], null, 2));
                return [defaultAdmin];
            }
        } catch (error) {
            console.error('Erreur lors du chargement des administrateurs:', error);
            // En cas d'erreur, retourner quand même l'admin par défaut
            return ['419033737607512065'];
        }
    }

    loadAgents() {
        try {
            if (fs.existsSync(this.agentFilePath)) {
                const data = fs.readFileSync(this.agentFilePath, 'utf8');
                return JSON.parse(data);
            } else {
                // Créer le dossier data s'il n'existe pas
                const dir = path.dirname(this.agentFilePath);
                if (!fs.existsSync(dir)) {
                    fs.mkdirSync(dir, { recursive: true });
                }
                
                // Pas d'agent par défaut
                fs.writeFileSync(this.agentFilePath, JSON.stringify([], null, 2));
                return [];
            }
        } catch (error) {
            console.error('Erreur lors du chargement des agents:', error);
            return [];
        }
    }

    saveAdmins() {
        try {
            const dir = path.dirname(this.adminFilePath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            // Sauvegarder en JSON
            fs.writeFileSync(this.adminFilePath, JSON.stringify(this.admins, null, 2), 'utf8');
            
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

    saveAgents() {
        try {
            const dir = path.dirname(this.agentFilePath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            // Sauvegarder en JSON
            fs.writeFileSync(this.agentFilePath, JSON.stringify(this.agents, null, 2), 'utf8');
            
            // Sauvegarder en texte brut
            const textFilePath = path.join(dir, 'agents.txt');
            const textContent = this.agents.join('\n');
            fs.writeFileSync(textFilePath, textContent, 'utf8');
            
            return true;
        } catch (error) {
            console.error('Erreur lors de la sauvegarde des agents:', error);
            return false;
        }
    }

    /**
     * Recharge les administrateurs et agents depuis les fichiers
     * @returns {boolean} True si le rechargement a réussi, false sinon
     */
    reload() {
        try {
            this.admins = this.loadAdmins();
            this.agents = this.loadAgents();
            return true;
        } catch (error) {
            console.error('Erreur lors du rechargement des données:', error);
            return false;
        }
    }

    isAdmin(userId) {
        return this.admins.includes(userId);
    }

    isAgent(userId) {
        return this.agents.includes(userId) || this.isAdmin(userId);
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

    addAgent(userId) {
        try {
            if (!this.agents.includes(userId)) {
                this.agents.push(userId);
                const result = this.saveAgents();
                if (!result) {
                    console.error(`Échec de la sauvegarde lors de l'ajout de l'agent ${userId}`);
                }
                return result;
            }
            return false;
        } catch (error) {
            console.error(`Erreur lors de l'ajout de l'agent ${userId}:`, error);
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

    removeAgent(userId) {
        try {
            const initialLength = this.agents.length;
            this.agents = this.agents.filter(id => id !== userId);
            if (this.agents.length !== initialLength) {
                const result = this.saveAgents();
                if (!result) {
                    console.error(`Échec de la sauvegarde lors de la suppression de l'agent ${userId}`);
                }
                return result;
            }
            return false;
        } catch (error) {
            console.error(`Erreur lors de la suppression de l'agent ${userId}:`, error);
            return false;
        }
    }
    
    // Méthode pour sauvegarder dans un fichier texte brut (en plus du JSON)
    saveToTextFile() {
        try {
            const adminTextFilePath = path.join(process.cwd(), 'data/admins.txt');
            const adminTextContent = this.admins.join('\n');
            fs.writeFileSync(adminTextFilePath, adminTextContent, 'utf8');

            const agentTextFilePath = path.join(process.cwd(), 'data/agents.txt');
            const agentTextContent = this.agents.join('\n');
            fs.writeFileSync(agentTextFilePath, agentTextContent, 'utf8');
            
            return true;
        } catch (error) {
            console.error('Erreur lors de la sauvegarde dans les fichiers texte:', error);
            return false;
        }
    }
}

