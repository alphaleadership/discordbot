import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Obtenir le chemin du répertoire actuel en ESM
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class GuildConfig {
    constructor(filePath = 'guilds_config.json') {
        this.filePath = path.join(process.cwd(), filePath);
        this.defaultCharLimit = 2000; // Define a default character limit
        this.config = this.loadConfig();
    }

    loadConfig() {
        let loadedConfig = {};
        try {
            if (fs.existsSync(this.filePath)) {
                const data = fs.readFileSync(this.filePath, 'utf8');
                loadedConfig = JSON.parse(data);
            }
        } catch (error) {
            console.error('Erreur lors du chargement de la configuration des serveurs:', error);
        }

        // Ensure antiInvite and charLimit structure for all loaded guilds
        for (const guildId in loadedConfig) {
            if (loadedConfig.hasOwnProperty(guildId)) {
                loadedConfig[guildId].antiInvite = loadedConfig[guildId].antiInvite || {
                    enabled: false,
                    whitelistedChannels: []
                };
                loadedConfig[guildId].antiInvite.enabled = loadedConfig[guildId].antiInvite.enabled ?? false;
                loadedConfig[guildId].antiInvite.whitelistedChannels = loadedConfig[guildId].antiInvite.whitelistedChannels || [];
                
                // Ensure charLimit exists and has a default value
                loadedConfig[guildId].charLimit = loadedConfig[guildId].charLimit ?? this.defaultCharLimit;
            }
        }
        return loadedConfig;
    }

    saveConfig() {
        try {
            const dir = path.dirname(this.filePath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            fs.writeFileSync(this.filePath, JSON.stringify(this.config, null, 2), 'utf8');
        } catch (error) {
            console.error('Erreur lors de la sauvegarde de la configuration des serveurs:', error);
        }
    }

    ensureFileExists() {
        if (!fs.existsSync(this.filePath)) {
            try {
                const dir = path.dirname(this.filePath);
                if (!fs.existsSync(dir)) {
                    fs.mkdirSync(dir, { recursive: true });
                }
                fs.writeFileSync(this.filePath, '{}', 'utf8');
                console.log(`Fichier de configuration créé: ${this.filePath}`);
            } catch (error) {
                console.error(`Erreur lors de la création du fichier de configuration ${this.filePath}:`, error);
            }
        }
    }


    /**
     * Active ou désactive l'anti-invite pour un serveur
     * @param {string} guildId - L'ID du serveur
     * @param {boolean} status - true pour activer, false pour désactiver
     * @param {string} [channelId] - ID du salon où activer/désactiver (optionnel)
     */
    setAntiInvite(guildId, status, channelId = null) {
        if (!this.config[guildId]) {
            this.config[guildId] = {};
        }
        // Ensure antiInvite structure exists for the guild
        this.config[guildId].antiInvite = this.config[guildId].antiInvite || {
            enabled: false,
            whitelistedChannels: []
        };

        if (channelId) {
            // Gestion par salon
            const channelIndex = this.config[guildId].antiInvite.whitelistedChannels.indexOf(channelId);
            if (status && channelIndex === -1) {
                // Désactiver pour ce salon (ajouter à la whitelist)
                this.config[guildId].antiInvite.whitelistedChannels.push(channelId);
            } else if (!status && channelIndex !== -1) {
                // Réactiver pour ce salon (retirer de la whitelist)
                this.config[guildId].antiInvite.whitelistedChannels.splice(channelIndex, 1);
            }
        } else {
            // Gestion globale
            this.config[guildId].antiInvite.enabled = status;
        }
        
        this.saveConfig();
    }

    /**
     * Définit la limite de caractères pour la détection de spam pour un serveur.
     * @param {string} guildId - L'ID du serveur.
     * @param {number} limit - La nouvelle limite de caractères.
     */
    setCharLimit(guildId, limit) {
        if (!this.config[guildId]) {
            this.config[guildId] = {};
        }
        this.config[guildId].charLimit = limit;
        this.saveConfig();
    }

    /**
     * Récupère la limite de caractères pour la détection de spam pour un serveur.
     * @param {string} guildId - L'ID du serveur.
     * @returns {number} La limite de caractères ou la limite par défaut si non définie.
     */
    getCharLimit(guildId) {
        const guildConfig = this.config[guildId];
        if (!guildConfig || guildConfig.charLimit === undefined) {
            return this.defaultCharLimit;
        }
        return guildConfig.charLimit;
    }

    /**
     * Initialise la configuration par défaut pour un serveur donné si elle n'existe pas,
     * ou s'assure que les propriétés par défaut sont présentes.
     * @param {string} guildId - L'ID du serveur à initialiser.
     */
    initializeGuild(guildId) {
        if (!this.config[guildId]) {
            this.config[guildId] = {};
        }

        // Ensure antiInvite structure
        this.config[guildId].antiInvite = this.config[guildId].antiInvite || {
            enabled: false,
            whitelistedChannels: []
        };
        this.config[guildId].antiInvite.enabled = this.config[guildId].antiInvite.enabled ?? false;
        this.config[guildId].antiInvite.whitelistedChannels = this.config[guildId].antiInvite.whitelistedChannels || [];

        // Ensure charLimit exists and has a default value
        this.config[guildId].charLimit = this.config[guildId].charLimit ?? this.defaultCharLimit;

        this.saveConfig();
    }

    /**
     * Vérifie si l'anti-invite est activé pour un salon
     * @param {string} guildId - L'ID du serveur
     * @param {string} channelId - L'ID du salon
     * @returns {boolean} true si l'anti-invite est actif pour ce salon
     */
    isAntiInviteEnabled(guildId, channelId) {
        const guildConfig = this.config[guildId];
        if (!guildConfig || !guildConfig.antiInvite) return false;
        
        // Si le salon est dans la whitelist, l'anti-invite est désactivé pour ce salon
        if (guildConfig.antiInvite.whitelistedChannels?.includes(channelId)) {
            return false;
        }
        
        return guildConfig.antiInvite.enabled === true;
    }

    /**
     * Définit les paramètres de quarantaine
     * @param {string} guildId - L'ID du serveur
     * @param {string} roleId - L'ID du rôle de quarantaine
     * @param {string} channelId - L'ID du salon de quarantaine
     */
    setQuarantineSettings(guildId, roleId, channelId) {
        if (!this.config[guildId]) {
            this.config[guildId] = {};
        }
        this.config[guildId].quarantine = {
            roleId,
            channelId
        };
        this.saveConfig();
    }

    /**
     * Récupère les paramètres de quarantaine
     * @param {string} guildId - L'ID du serveur
     * @returns {Object|null} Les paramètres de quarantaine ou null si non configuré
     */
    getQuarantineSettings(guildId) {
        const guildConfig = this.config[guildId];
        return guildConfig ? guildConfig.quarantine : null;
    }

    /**
     * Définit les paramètres de prise de service
     * @param {string} guildId - L'ID du serveur
     * @param {string} roleId - L'ID du rôle de service
     * @param {string} logChannelId - L'ID du salon de logs de service
     */
    setServiceSettings(guildId, roleId, logChannelId) {
        if (!this.config[guildId]) {
            this.config[guildId] = {};
        }
        this.config[guildId].service = {
            roleId,
            logChannelId
        };
        this.saveConfig();
    }

    /**
     * Récupère les paramètres de prise de service
     * @param {string} guildId - L'ID du serveur
     * @returns {Object|null} Les paramètres de service ou null si non configurés
     */
    getServiceSettings(guildId) {
        const guildConfig = this.config[guildId];
        return guildConfig ? guildConfig.service : null;
    }

    /**
     * Définit la liaison d'un dépôt GitHub à un salon Discord
     * @param {string} guildId - L'ID du serveur
     * @param {string} channelId - L'ID du salon Discord
     * @param {string} repoOwner - Le propriétaire du dépôt GitHub
     * @param {string} repoName - Le nom du dépôt GitHub
     */
    setGithubLink(guildId, channelId, repoOwner, repoName) {
        if (!this.config[guildId]) {
            this.config[guildId] = {};
        }
        if (!this.config[guildId].githubLinks) {
            this.config[guildId].githubLinks = {};
        }
        this.config[guildId].githubLinks[channelId] = {
            owner: repoOwner,
            repo: repoName
        };
        this.saveConfig();
    }

    /**
     * Récupère la liaison GitHub pour un salon Discord donné
     * @param {string} guildId - L'ID du serveur
     * @param {string} channelId - L'ID du salon Discord
     * @returns {Object|null} Les paramètres du dépôt {owner, repo} ou null si non lié
     */
    getGithubLink(guildId, channelId) {
        const guildConfig = this.config[guildId];
        if (!guildConfig || !guildConfig.githubLinks) return null;
        return guildConfig.githubLinks[channelId] || null;
    }

    reload() {
        this.config = this.loadConfig();
    }
}

const guildConfig = new GuildConfig();
export default guildConfig;
export { GuildConfig };
