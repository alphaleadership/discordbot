import { Client, GatewayIntentBits, PermissionsBitField, EmbedBuilder, SlashCommandBuilder, Partials, ChannelType } from 'discord.js';
import fs from 'fs';
import { Octokit } from '@octokit/rest';
import express from 'express';
import dotenv from 'dotenv';
import MessageLogger from './utils/MessageLogger.js';
import AdminManager from './utils/AdminManager.js';
import { InteractionHandler } from './utils/InteractionHandler.js';
import { CommandHandler } from './utils/CommandHandler.js';
import { ReportManager } from './utils/ReportManager.js';
import { BanlistManager } from './utils/BanlistManager.js';
import { BlockedWordsManager } from './utils/BlockedWordsManager.js';
import { WatchlistManager } from './utils/WatchlistManager.js';
import { TelegramIntegration } from './utils/TelegramIntegration.js';
import { initInteractionConfig, InteractionConfig } from './utils/InteractionConfig.js';
import { fileURLToPath } from 'url';
import path from 'path';

import GuildConfig from './utils/GuildConfig.js';
import enhancedGuildConfig from './utils/config/EnhancedGuildConfig.js';
import ModerationLogger from './utils/ModerationLogger.js';

// Import all new managers
import {
    RaidDetector,
    DoxDetector,
    FunCommandsManager
} from './utils/managers/index.js';
import { EnhancedReloadSystem } from './utils/EnhancedReloadSystem.js';
import AutoWatchHandler from './utils/handlers/AutoWatchHandler.js';
import UnifiedErrorReporter from './utils/UnifiedErrorReporter.js';
import PermissionValidator from './utils/PermissionValidator.js';
import { DMTicketManager } from './utils/DMTicketManager.js';
import { EconomyManager } from './utils/EconomyManager.js';
import { ForumReportManager } from './utils/ForumReportManager.js';
import AutoConfigManager from './utils/AutoConfigManager.js';
import { EspionageManager } from './utils/EspionageManager.js';

let dmTicketManager; // Declare dmTicketManager here




// Charger les variables d'environnement d'abord
dotenv.config();

const token = process.env.DISCORD_TOKEN;
const prefix = process.env.BOT_PREFIX || '!';
const ownerID = process.env.OWNER_ID;
const defaultCooldown = parseInt(process.env.DEFAULT_COOLDOWN || '3', 10);
const supportRoleId = process.env.SUPPORT_ROLE_ID;
const ticketCategory = process.env.TICKET_CATEGORY_ID;

const config = {
    token,
    prefix,
    ownerID,
    defaultCooldown,
    supportRoleId,
    ticketCategory
};

// Variables de suivi des sauvegardes


let isLoggingToGithub = false;  // Déclaration déplacée ici
const lastBackupTimes = new Map();

// Initialiser les configurations et les gestionnaires
const guildConfig = enhancedGuildConfig;
guildConfig.ensureFileExists();
const adminManager = new AdminManager();
const permissionValidator = new PermissionValidator(adminManager);
class WarnManager {
    constructor(filePath = 'warnings.json') {
        this.filePath = path.join(process.cwd(), filePath);
        this.warnings = this.loadWarnings();
    }

    ensureFileExists() {
        if (!fs.existsSync(this.filePath)) {
            this.saveWarnings();
        }
    }

    /**
     * Charge les avertissements depuis le fichier JSON
     * @returns {Object} Les avertissements chargés
     */
    loadWarnings() {
        try {
            if (fs.existsSync(this.filePath)) {
                const data = fs.readFileSync(this.filePath, 'utf8');
                return JSON.parse(data);
            }
        } catch (error) {
            console.error('Erreur lors du chargement des avertissements:', error);
        }
        return {}; // Retourne un objet vide si le fichier n'existe pas ou en cas d'erreur
    }

    reload() {
        this.warnings = this.loadWarnings();
        console.log(`Avertissements rechargés depuis ${this.filePath}`);
    }

    /**
     * Sauvegarde les avertissements dans le fichier JSON
     */
    saveWarnings() {
        try {
            const dir = path.dirname(this.filePath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            fs.writeFileSync(this.filePath, JSON.stringify(this.warnings, null, 2), 'utf8');
        } catch (error) {
            console.error('Erreur lors de la sauvegarde des avertissements:', error);
        }
    }

    /**
     * Ajoute un avertissement à un utilisateur
     * @param {string} userId - L'ID de l'utilisateur
     * @param {string} reason - La raison de l'avertissement
     * @param {string} moderatorId - L'ID du modérateur (optionnel)
     * @returns {Object} Les informations sur l'avertissement
     */
    addWarn(userId, reason, moderatorId = 'système') {
        if (!this.warnings[userId]) {
            this.warnings[userId] = [];
        }

        const warnData = {
            id: Date.now().toString(),
            reason: reason,
            date: new Date().toISOString(),
            moderator: moderatorId
        };

        this.warnings[userId].push(warnData);
        this.saveWarnings();

        return {
            ...warnData,
            count: this.warnings[userId].length
        };
    }

    /**
     * Récupère les avertissements d'un utilisateur
     * @param {string} userId - L'ID de l'utilisateur
     * @returns {Array} La liste des avertissements de l'utilisateur
     */
    getWarns(userId) {
        return this.warnings[userId] || [];
    }

    /**
     * Supprime un avertissement spécifique
     * @param {string} userId - L'ID de l'utilisateur
     * @param {string} warnId - L'ID de l'avertissement à supprimer
     * @returns {boolean} True si l'avertissement a été supprimé, false sinon
     */
    removeWarn(userId, warnId) {
        if (!this.warnings[userId]) return false;
        
        const initialLength = this.warnings[userId].length;
        this.warnings[userId] = this.warnings[userId].filter(warn => warn.id !== warnId);
        
        if (this.warnings[userId].length !== initialLength) {
            this.saveWarnings();
            return true;
        }
        return false;
    }

    /**
     * Supprime tous les avertissements d'un utilisateur
     * @param {string} userId - L'ID de l'utilisateur
     * @returns {boolean} True si des avertissements ont été supprimés, false sinon
     */
    clearWarns(userId) {
        if (this.warnings[userId]) {
            delete this.warnings[userId];
            this.saveWarnings();
            return true;
        }
        return false;
    }

    /**
     * Vérifie si un utilisateur a des avertissements
     * @param {string} userId - L'ID de l'utilisateur
     * @returns {boolean} True si l'utilisateur a des avertissements, false sinon
     */
    hasWarns(userId) {
        return !!this.warnings[userId] && this.warnings[userId].length > 0;
    }

    /**
     * Récupère le nombre d'avertissements d'un utilisateur
     * @param {string} userId - L'ID de l'utilisateur
     * @returns {number} Le nombre d'avertissements
     */
    getWarnCount(userId) {
        return this.warnings[userId] ? this.warnings[userId].length : 0;
    }
}
const warnManager = new WarnManager('data/warnings.json');
warnManager.ensureFileExists();
const blockedWordsManager = new BlockedWordsManager();
blockedWordsManager.ensureFileExists();


// Configuration GitHub
const GITHUB_OWNER = process.env.GITHUB_OWNER || 'alphaleadership';
const GITHUB_REPO = process.env.GITHUB_REPO || 'alphaleadership.github.io';
const GITHUB_BRANCH = process.env.GITHUB_BRANCH || 'main';
const BACKUP_FILES = [
    'data/messages',
    'data/warnings.json',
    'guilds_config.json',
    'data/admins.json',
    'messages',
    // Enhanced system data files
    'data/watchlist.json',
    'data/raid_events',
    'data/dox_detections',
    'data/watchlist_incidents',
    'data/system_logs',
    'data/error_logs',
    'data/fun_command_usage.json',
    'data/telegram_messages.json',
    'data/telegram_notifications.json',
    'data/blocked_words.json',
    'data/dox_exceptions.json'
]

// Fonction pour encoder le contenu en base64
function encodeContent(content) {
    return Buffer.from(content).toString('base64');
}

// Fonction pour sauvegarder un fichier sur GitHub
async function saveFileToGitHub(path, content, message) {
    try {
        const filePath = path;
        const fileContent = typeof content === 'string' ? content : JSON.stringify(content, null, 2);
        
        let sha;
        let existingContent = '';

        try {
            const { data } = await octokit.repos.getContent({
                owner: GITHUB_OWNER,
                repo: GITHUB_REPO,
                path: filePath,
                ref: GITHUB_BRANCH
            });
            sha = data.sha;
            existingContent = Buffer.from(data.content, 'base64').toString('utf8');
        } catch (error) {
            if (error.status !== 404) {
                throw error;
            }
        }

        if (sha && existingContent === fileContent) {
           // console.log(`Fichier inchangé, pas de sauvegarde nécessaire: ${filePath}`);
            return true;
        }

        await octokit.repos.createOrUpdateFileContents({
            owner: GITHUB_OWNER,
            repo: GITHUB_REPO,
            path: filePath,
            message: message || `Backup: ${filePath}`,
            content: encodeContent(fileContent),
            sha,
            branch: GITHUB_BRANCH
        });
        
        
        return true;
    } catch (error) {
        // console.error(`Erreur lors de la sauvegarde de ${path}:`, error.message); // Logs de backup désactivés
        return false;
    }
}

// Fonction pour sauvegarder un dossier récursivement
async function backupDirectory(dirPath, basePath = '') {
    const fullPath = path.join(process.cwd(), dirPath);
    const entries = fs.readdirSync(fullPath, { withFileTypes: true });
    
    for (const entry of entries) {
        const fullEntryPath = path.join(fullPath, entry.name);
        const relativePath = path.join(basePath, entry.name);
        
        if (entry.isDirectory()) {
            await backupDirectory(path.join(dirPath, entry.name), relativePath);
        } else {
            try {
                const content = fs.readFileSync(fullEntryPath, 'utf8');
                await saveFileToGitHub(
                    path.join(dirPath, entry.name),
                    content,
                    `Backup: ${path.join(dirPath, entry.name)}`
                );
            } catch (error) {
                // console.error(`Erreur lors de la lecture du fichier ${fullEntryPath}:`, error); // Logs de backup désactivés
            }
        }
    }
}

// Déclaration de la fonction backupToGitHub
async function backupToGitHub() {
    if (isLoggingToGithub) {
        // console.log('Une sauvegarde est déjà en cours, annulation de la nouvelle tentative'); // Logs de backup désactivés
        return false;
    }
    
    isLoggingToGithub = true;
    
    try {
        if (!octokit) {
            
            return false;
        }
        
        // console.log('Début de la sauvegarde sur GitHub...'); // Logs de backup désactivés
        
        // Sauvegarder chaque fichier/dossier de la liste
        for (const filePath of BACKUP_FILES) {
            const fullPath = path.join(process.cwd(), filePath);
            
            if (fs.existsSync(fullPath)) {
                const stats = fs.statSync(fullPath);
                
                if (stats.isDirectory()) {
                    await backupDirectory(filePath);
                } else {
                    const content = fs.readFileSync(fullPath, 'utf8');
                    await saveFileToGitHub(filePath, content, `Backup: ${filePath}`);
                }
            } else {
                // console.warn(`Le fichier/dossier n'existe pas: ${filePath}`); // Logs de backup désactivés
            }
        }
        
        // Mettre à jour le temps de la dernière sauvegarde
        const now = new Date();
        sharedConfig.lastBackupTime = now.getTime();
        lastBackupTimes.set('lastBackup', now.toISOString());
        saveBackupTime();
        initInteractionConfig(sharedConfig);
        
        // console.log('Sauvegarde sur GitHub terminée avec succès'); // Logs de backup désactivés
        return true;
    } catch (error) {
        // console.error('Erreur lors de la sauvegarde sur GitHub:', error); // Logs de backup désactivés
        return false;
    } finally {
        isLoggingToGithub = false;
    }
}

// Initialiser la configuration partagée avec des valeurs par défaut
const sharedConfig = {
    backupToGitHub: null, // Sera défini plus tard
    lastBackupTime: 0
};
initInteractionConfig(sharedConfig);

// Définir la fonction de sauvegarde dans la configuration partagée
sharedConfig.backupToGitHub = backupToGitHub;

// Initialiser le gestionnaire d'interactions (will be updated per client)
let interactionHandler;

const tokens = process.env.DISCORD_TOKEN.split(',');
const webPassword = process.env.WEB_PASSWORD || 'password';
const webServerEnabled = process.env.WEB_SERVER_ENABLED === 'true' || process.env.WEB_SERVER_ENABLED === '1';

// Configuration d'Octokit avec authentification pour la journalisation
let octokit = null;

// Initialiser le logger de messages avant de l'utiliser (will be updated per client)
let messageLogger;

// Charger les informations de sauvegarde au démarrage
loadBackupTime();

// Initialiser la configuration partagée avec la fonction de sauvegarde
sharedConfig.backupToGitHub = backupToGitHub;
initInteractionConfig(sharedConfig);

function initOctokit() {
    if (!process.env.ACCESS_TOKEN || process.env.ACCESS_TOKEN === 'votre_token_github') {
        // console.warn('Avertissement: Aucun token GitHub valide trouvé. La journalisation sera désactivée.'); // Logs de backup désactivés
        return null;
    }
    
    try {
        const instance = new Octokit({
            auth: process.env.ACCESS_TOKEN,
            userAgent: 'GitBot',
            timeZone: 'Europe/Paris',
            log: {
          
                warn: console.warn,
                error: console.error
            },
            request: {
                timeout: 10000,
                headers: {
                    'X-GitHub-Api-Version': '2022-11-28'
                }
            }
        });
        
        // console.log('✅ Configuration GitHub chargée avec succès'); // Logs de backup désactivés
        return instance;
        
    } catch (error) {
        // console.error('❌ Erreur lors de l\'initialisation d\'Octokit:', error.message); // Logs de backup désactivés
        return null;
    }
}

// Initialiser Octokit
octokit = initOctokit();



// Fonction pour détecter les liens d'invitation Discord
function containsInviteLink(text) {
    // Détecte les liens d'invitation Discord (discord.gg/xxx, discord.com/invite/xxx, etc.)
    const inviteRegex = /(https?:\/\/)?(www\.)?(discord\.(gg|io|me|li)|discordapp\.com\/invite|discord\.com\/invite)\/+[a-zA-Z0-9-]+/gi;
    return inviteRegex.test(text);
}

// Système de détection de spam
const spamTracker = new Map(); // userId -> { messages: [], lastMessageTime: timestamp }

async function checkSpam(userId, messageContent, guild, interactionHandler) {
    // Vérifier si l'utilisateur est un administrateur du bot
    const isAdmin = interactionHandler.adminManager && await interactionHandler.adminManager.isAdmin(userId);
    if (isAdmin) {
        return false; // Les administrateurs sont immunisés contre la détection de spam
    }
    
    const now = Date.now();
    const userData = spamTracker.get(userId) || { messages: [], lastMessageTime: 0 };
    const charLimit = guildConfig.getCharLimit(guild.id);
    
    const ONE_MINUTE = 60 * 1000; // 1 minute en millisecondes
    
    // Ajouter le nouveau message
    userData.messages.push({
        content: messageContent,
        timestamp: now
    });
    
    // Ne pas limiter le nombre de messages, on garde tout
    // Seul le filtre d'âge est appliqué
    const FIVE_MINUTES = 5 * 60 * 1000; // 5 minutes en millisecondes
    userData.messages = userData.messages.filter(msg => now - msg.timestamp < FIVE_MINUTES);
    
    // Si pas assez de messages récents, pas de vérification de spam
    if (userData.messages.length < 2) {
        spamTracker.set(userId, userData);
        return false;
    }
    
    // Calculer le temps total et le nombre total de caractères
    const firstMsg = userData.messages[0];
    const lastMsg = userData.messages[userData.messages.length - 1];
    const timeDiff = (lastMsg.timestamp - firstMsg.timestamp) / 1000; // en secondes
    
    // Si la fenêtre de temps est trop courte, on l'étend à 1 seconde pour éviter les divisions par zéro
    const windowTime = Math.max(timeDiff, 1);
    
    // Calculer le nombre total de caractères
    const charCount = userData.messages.reduce((sum, msg) => sum + msg.content.length, 0);
    
    // Calculer la vitesse moyenne de frappe (caractères/seconde)
    const speed = charCount / windowTime;
    
    // console.log(`Analyse anti-spam pour ${userId}:`); // Logs d'analyse de message désactivés
    // console.log(`- Messages analysés: ${userData.messages.length}`); // Logs d'analyse de message désactivés
    // console.log(`- Fenêtre temporelle: ${windowTime.toFixed(2)} secondes`); // Logs d'analyse de message désactivés
    // console.log(`- Caractères totaux: ${charCount}`); // Logs d'analyse de message désactivés
    // console.log(`- Vitesse: ${speed.toFixed(2)} caractères/seconde (limite: ${charLimit} cps)`); // Logs d'analyse de message désactivés
    
    // Mettre à jour le suivi des messages
    spamTracker.set(userId, userData);
    if(messageContent.includes("https://imgur.com/")){
     const warn = warnManager.addWarn(
            userId, 
            `Spam détecté (${speed.toFixed(2)} caractères/seconde, max ${charLimit} autorisés)`,
            guild.client.user.id
        );
        
        // Envoyer un message d'avertissement en MP
        const user = await guild.client.users.fetch(userId).catch(error => { /* console.error(error); */ }); // Logs d'analyse de message désactivés
        if (user) {
            const embed = new EmbedBuilder()
                .setColor('#FFA500')
                .setTitle('⚠️ Avertissement')
                .setDescription(`Vous avez reçu un avertissement pour lien suspect.`)
                .addFields(
                    { name: 'Raison', value: warn.reason },
                    { name: 'Avertissements actuels', value: `${warn.count}/2` },
                    { name: 'Date', value: new Date(warn.date).toLocaleString('fr-FR') }
                )
                .setFooter({ text: `ID: ${warn.id}` });
            
            await user.send({ embeds: [embed] })
                .catch(() => { /* console.log(`Impossible d'envoyer un MP à ${user.tag}`); */ }); // Logs d'analyse de message désactivés
        }
if (warn.count >= 2) {
            try {
                await guild.members.ban(userId, { reason: `Spam détecté après 2 avertissements` });
                // console.log(`Utilisateur ${userId} banni après 2 avertissements`); // Logs d'analyse de message désactivés
                
                // Ajouter à la banlist
                const banReason = `lien suspect (après 2 avertissements)`;
                const result = await interactionHandler.addToBanlist(userId, banReason, guild.client.user.id);
                
                if (!result.success) {
                    // console.error(`Erreur lors de l'ajout à la banlist: ${result.message}`); // Logs d'analyse de message désactivés
                }
                
                // Supprimer les avertissements après bannissement
                warnManager.clearWarns(userId);
            } catch (error) {
                // console.error(`Erreur lors du bannissement de ${userId}:`, error); // Logs d'analyse de message désactivés
            }
        }
        
        // Nettoyer les données de spam tracking
        spamTracker.delete(userId);
        return true; // Spam détecté et traité
}
    // Vérifier si la limite est dépassée
    if (speed > charLimit) {
        // console.log(`Spam détecté pour ${userId}: ${speed.toFixed(2)} caractères/seconde`); // Logs d'analyse de message désactivés
        
        // Ajouter un avertissement avec le gestionnaire
        const warn = warnManager.addWarn(
            userId, 
            `Spam détecté (${speed.toFixed(2)} caractères/seconde, max ${charLimit} autorisés)`,
            guild.client.user.id
        );
        
        // Envoyer un message d'avertissement en MP
        const user = await guild.client.users.fetch(userId).catch(error => { /* console.error(error); */ }); // Logs d'analyse de message désactivés
        if (user) {
            const embed = new EmbedBuilder()
                .setColor('#FFA500')
                .setTitle('⚠️ Avertissement')
                .setDescription(`Vous avez reçu un avertissement pour spam.`)
                .addFields(
                    { name: 'Raison', value: warn.reason },
                    { name: 'Avertissements actuels', value: `${warn.count}/2` },
                    { name: 'Date', value: new Date(warn.date).toLocaleString('fr-FR') }
                )
                .setFooter({ text: `ID: ${warn.id}` });
            
            await user.send({ embeds: [embed] })
                .catch(() => { /* console.log(`Impossible d'envoyer un MP à ${user.tag}`); */ }); // Logs d'analyse de message désactivés
        }
        
        // console.log(`Avertissement ${warn.count}/2 pour ${userId} (ID: ${warn.id})`); // Logs d'analyse de message désactivés
        
        // Si c'est le deuxième avertissement, bannir
        if (warn.count >= 2) {
            try {
                await guild.members.ban(userId, { reason: `Spam détecté après 2 avertissements` });
                // console.log(`Utilisateur ${userId} banni après 2 avertissements`); // Logs d'analyse de message désactivés
                
                // Ajouter à la banlist
                const banReason = `Spam détecté (après 2 avertissements)`;
                const result = await interactionHandler.addToBanlist(userId, banReason, guild.client.user.id);
                
                if (!result.success) {
                    // console.error(`Erreur lors de l'ajout à la banlist: ${result.message}`); // Logs d'analyse de message désactivés
                }
                
                // Supprimer les avertissements après bannissement
                warnManager.clearWarns(userId);
            } catch (error) {
                // console.error(`Erreur lors du bannissement de ${userId}:`, error); // Logs d'analyse de message désactivés
            }
        }
        
        // Nettoyer les données de spam tracking
        spamTracker.delete(userId);
        return true; // Spam détecté et traité
    }
    
    // Si pas de spam, mettre à jour le suivi des messages
    spamTracker.set(userId, userData);
    return false; // Pas de spam détecté
}

// ... (le reste du code reste inchangé)
// Function to clean message storage
function cleanMessageStorage() {
    const globalConfig = guildConfig.getGlobalConfig();
    if (!globalConfig.cleanMessagesOnStartup) {
        console.log('Nettoyage au démarrage désactivé dans la configuration globale.');
        return;
    }

    const messagesDir = 'messages';
    if (fs.existsSync(messagesDir)) {
        console.log('Nettoyage du dossier de stockage des messages...');
        try {
            fs.rmSync(messagesDir, { recursive: true, force: true });
            fs.mkdirSync(messagesDir);
            console.log('Dossier messages nettoyé.');
        } catch (error) {
            console.error('Erreur lors du nettoyage du dossier messages:', error);
        }
    }
}

// Clean message storage at startup
cleanMessageStorage();

// Créer les clients pour chaque token
for (const token of tokens) {
    const client = new Client({
        intents: [
            GatewayIntentBits.Guilds,
            GatewayIntentBits.GuildMembers,
            GatewayIntentBits.GuildBans,
            GatewayIntentBits.GuildEmojisAndStickers,
            GatewayIntentBits.GuildIntegrations,
            GatewayIntentBits.GuildWebhooks,
            GatewayIntentBits.GuildInvites,
            GatewayIntentBits.GuildVoiceStates,
            GatewayIntentBits.GuildPresences,
            GatewayIntentBits.GuildMessages,
            GatewayIntentBits.GuildMessageReactions,
            GatewayIntentBits.GuildMessageTyping,
            GatewayIntentBits.DirectMessages,
            GatewayIntentBits.DirectMessageReactions,
            GatewayIntentBits.DirectMessageTyping,
            GatewayIntentBits.MessageContent,
            GatewayIntentBits.GuildScheduledEvents,
            GatewayIntentBits.AutoModerationConfiguration,
            GatewayIntentBits.AutoModerationExecution
        ],
        partials: [Partials.Channel, Partials.Message]
    });

    const reportManager = new ReportManager();
    reportManager.moderationLogger = new ModerationLogger(reportManager);
    const banlistManager = new BanlistManager();
    const blockedWordsManager = new BlockedWordsManager();
    const watchlistManager = new WatchlistManager('data/watchlist.json', reportManager);
    const telegramIntegration = new TelegramIntegration(process.env.TELEGRAM_BOT_TOKEN, client);
    const funCommandsManager = new FunCommandsManager(guildConfig);
    
    // Initialize new managers
    const economyManager = new EconomyManager('data/economy.json');
    const forumReportManager = new ForumReportManager(client, guildConfig, reportManager);
    const autoConfigManager = new AutoConfigManager(client, guildConfig);
    const espionageManager = new EspionageManager(client, guildConfig, warnManager);
    
    // Initialize enhanced message logger with report manager
    messageLogger = new MessageLogger(reportManager);
  
    // Initialize unified error reporter
    const errorReporter = new UnifiedErrorReporter(reportManager, messageLogger);
    
    // Initialize new enhanced managers
    const raidDetector = new RaidDetector(client, guildConfig, reportManager);
    const doxDetector = new DoxDetector(warnManager, reportManager);
    const enhancedReloadSystem = new EnhancedReloadSystem();
    const autoWatchHandler = new AutoWatchHandler(client, guildConfig, reportManager);
    
    // Initialize interaction handler with new managers
    interactionHandler = new InteractionHandler(adminManager, reportManager, raidDetector, doxDetector, watchlistManager);
    dmTicketManager = new DMTicketManager(client, config, reportManager, messageLogger);
    const commandHandler = new CommandHandler(client, adminManager, warnManager, guildConfig, sharedConfig, backupToGitHub, reportManager, banlistManager, blockedWordsManager, watchlistManager, telegramIntegration, funCommandsManager, raidDetector, doxDetector, enhancedReloadSystem, permissionValidator, economyManager, forumReportManager, autoConfigManager, dmTicketManager, undefined, espionageManager);
    
    // Initialize EnhancedReloadSystem dependencies after CommandHandler creation
    enhancedReloadSystem.commandHandler = commandHandler;
    enhancedReloadSystem.reportManager = reportManager;
    enhancedReloadSystem.managers = {
        adminManager,
        guildConfig,
        reportManager,
        banlistManager,
        blockedWordsManager,
        watchlistManager,
        telegramIntegration,
        funCommandsManager,
        raidDetector,
        doxDetector
    };

    commandHandler.loadCommands();

    // Enregistrer les commandes
    client.once('ready', async () => {
       
        await commandHandler.registerCommands();
        console.log(`=== BOT CONNECTÉ EN TANT QUE ${client.user.tag} ===`);
        console.log(`ID du bot: ${client.user.id}`);
        console.log(`Présent sur ${client.guilds.cache.size} serveurs`);
        // Initialize configuration for all guilds the bot is currently in
        for (const guild of client.guilds.cache.values()) {
            guildConfig.initializeGuild(guild.id);
            console.log(`Initialized config for guild: ${guild.name} (${guild.id})`);
            
            // Vérification et création automatique du salon Honeypot
            const honeypotConfig = guildConfig.getHoneypotConfig(guild.id);
            if (honeypotConfig && honeypotConfig.enabled) {
                let channel = honeypotConfig.channelId ? guild.channels.cache.get(honeypotConfig.channelId) : null;
                
                if (!channel) {
                    console.log(`[HONEYPOT] Salon manquant pour ${guild.name}. Création en cours...`);
                    try {
                        channel = await guild.channels.create({
                            name: 'honeypot-raid',
                            type: ChannelType.GuildText,
                            permissionOverwrites: [
                                {
                                    id: guild.id, // @everyone
                                    allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages],
                                },
                                {
                                    id: client.user.id,
                                    allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory, PermissionsBitField.Flags.ManageChannels],
                                }
                            ],
                            topic: '⚠️ NE PAS ÉCRIRE ICI - SYSTÈME DE PROTECTION ANTI-RAID ⚠️ Toute personne envoyant un message ici sera bannie.'
                        });
                        
                        guildConfig.setHoneypotChannelId(guild.id, channel.id);
                        
                        const embed = new EmbedBuilder()
                            .setColor('#FF0000')
                            .setTitle('🛡️ Système Honeypot Activé')
                            .setDescription('Ce salon sert de piège pour les robots de raid et les comptes compromis.\n\n⚠️ **ATTENTION** : Toute personne (hors administrateurs) qui envoie un message dans ce salon sera **immédiatement bannie** du serveur.')
                            .addFields(
                                { name: 'Pourquoi ce salon ?', value: 'Les outils de raid automatisés tentent souvent de poster dans tous les salons visibles. Ce salon permet de les détecter et de les éliminer instantanément.' },
                                { name: 'Sécurité', value: 'Ce salon est visible par tout le monde afin de piéger les comptes compromis. Ne postez jamais ici.' }
                            )
                            .setTimestamp();
                        
                        await channel.send({ embeds: [embed] });
                        console.log(`[HONEYPOT] Salon créé avec succès pour ${guild.name}`);
                    } catch (error) {
                        console.error(`[HONEYPOT] Erreur lors de la création auto pour ${guild.name}:`, error);
                    }
                }
            }
        }
    });

    // Gestion des interactions (boutons et commandes slash)
    client.on('interactionCreate', async interaction => {
        // Handle ticket close button
        if (interaction.isButton() && interaction.customId.startsWith('close_ticket_')) {
            await dmTicketManager.handleTicketClose(interaction);
            return;
        } else if (interaction.isButton() && interaction.customId.startsWith('reopen_ticket_')) {
            await dmTicketManager.handleTicketReopen(interaction);
            return;
        }
        
        // Handle other interactions
        try {
            if (interaction.isCommand()) {
                await commandHandler.handleCommand(interaction);
            } else {
                await interactionHandler.handleInteraction(interaction);
            }
        } catch (error) {
            await errorReporter.reportError(error, 'InteractionHandler', {
                interactionType: interaction.type,
                commandName: interaction.commandName || 'N/A',
                userId: interaction.user?.id,
                guildId: interaction.guild?.id
            }, client);
        }
    });

    // Cache pour la détection des messages identiques d'affilée
    const duplicateMessagesCache = new Map(); // key: `${userId}-${guildId}` -> content

    // Gestion des messages
    client.on('messageCreate', async message => {
        const isDM = message.guild === null;
        // console.log(`Nouveau message reçu - Type: ${message.channel.type}, DM: ${isDM}`); // Logs d'analyse de message désactivés
        
        // Handle DMs
        if (isDM) { // DM channel ou message sans serveur
            if (message.author.bot) return; // Ignore les messages du bot lui-même
            // console.log(`DM reçu de ${message.author.tag}: ${message.content}`); // Logs d'analyse de message désactivés
            try {
                await dmTicketManager.handleDMMessage(message);
            } catch (error) {
                // console.error('Erreur dans la gestion du DM:', error); // Logs d'analyse de message désactivés
            }
            return;
        }

        // Remplissage automatique des dossiers d'espionnage
        if (message.guild && !message.author.bot) {
            await espionageManager.recordMessage(message).catch(() => null);
        }

        // Système de détection de double message identique d'affilée
        if (message.guild && !message.author.bot && message.content) {
            // Vérifier si l'utilisateur est admin ou modérateur pour éviter de fausses alertes sur eux
            const isAdmin = await adminManager.isAdmin(message.author.id);
            const isOwner = message.author.id === message.guild.ownerId;
            const hasAdminPerm = message.member && (
                message.member.permissions.has(PermissionsBitField.Flags.Administrator) ||
                message.member.permissions.has(PermissionsBitField.Flags.ManageGuild)
            );

            if (!isAdmin && !isOwner && !hasAdminPerm) {
                const cacheKey = `${message.author.id}-${message.guild.id}`;
                const lastContent = duplicateMessagesCache.get(cacheKey);

                if (lastContent === message.content) {
                    try {
                        console.log(`[DUPLICATE DETECTION] ${message.author.tag} (${message.author.id}) a envoyé deux fois le même message d'affilée.`);
                        
                        // 1. Supprimer le message actuel
                        if (message.deletable) {
                            await message.delete().catch(() => {});
                        }

                        // 2. Mettre en quarantaine
                        let settings = guildConfig.getQuarantineSettings(message.guild.id);
                        const botMember = message.guild.members.me;

                        // Auto-setup de la quarantaine si non configuré
                        if ((!settings || !settings.roleId) && 
                            botMember.permissions.has(PermissionsBitField.Flags.ManageRoles) && 
                            botMember.permissions.has(PermissionsBitField.Flags.ManageChannels)) {
                            try {
                                const role = await message.guild.roles.create({
                                    name: 'Quarantaine',
                                    color: '#ff0000',
                                    reason: 'Auto-setup quarantaine pour double message identique'
                                });
                                const channel = await message.guild.channels.create({
                                    name: 'quarantaine',
                                    type: ChannelType.GuildText,
                                    permissionOverwrites: [
                                        { id: message.guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
                                        { id: role.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.ReadMessageHistory], deny: [PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.AddReactions] }
                                    ],
                                    reason: 'Auto-setup quarantaine pour double message identique'
                                });
                                guildConfig.setQuarantineSettings(message.guild.id, role.id, channel.id);
                                settings = guildConfig.getQuarantineSettings(message.guild.id);
                            } catch (e) {
                                console.error('Auto-setup quarantaine échoué:', e);
                            }
                        }

                        if (settings && settings.roleId) {
                            const member = message.member || await message.guild.members.fetch(message.author.id).catch(() => null);
                            if (member) {
                                await member.roles.add(settings.roleId, 'Auto-quarantaine : Envoi de deux messages identiques d\'affilée (Automod)');
                                
                                const alertEmbed = new EmbedBuilder()
                                    .setColor('#FF0000')
                                    .setTitle('🔒 Auto-Quarantaine : Répétition de message')
                                    .setDescription(`L'utilisateur **${message.author.tag}** (${message.author.id}) a été placé en quarantaine automatiquement pour avoir envoyé deux fois le même message d'affilée.`)
                                    .setTimestamp();

                                await message.channel.send({ embeds: [alertEmbed] });
                            }
                        }

                        // 3. Créer un report global
                        if (forumReportManager) {
                            try {
                                const reportData = {
                                    reportedUserId: message.author.id,
                                    reportedUsername: message.author.username,
                                    reporterUserId: client.user.id,
                                    reporterUsername: client.user.username,
                                    category: 'spam',
                                    reason: `Double message identique d'affilée (Automod)`,
                                    evidence: `Message : "${message.content}"`,
                                    messageId: message.id,
                                    channelId: message.channel.id,
                                    timestamp: new Date().toISOString()
                                };
                                await forumReportManager.createForumReport(reportData, message.guild.id);
                            } catch (reportErr) {
                                console.error('Erreur lors de la création du rapport global pour double message :', reportErr);
                            }
                        }

                        // Nettoyer le cache pour cet utilisateur pour éviter de reboucler
                        duplicateMessagesCache.delete(cacheKey);
                        return; // Arrêter le traitement pour ce message
                    } catch (err) {
                        console.error('Erreur lors de la gestion du double message d\'affilée :', err);
                    }
                } else {
                    duplicateMessagesCache.set(cacheKey, message.content);
                }
            }
        }

        // Système de Honeypot (Autoban)
        if (message.guild) {
            const honeypotConfig = guildConfig.getHoneypotConfig(message.guild.id);
            if (honeypotConfig && honeypotConfig.enabled && honeypotConfig.channelId === message.channel.id) {
                // Vérifier si l'utilisateur est un admin ou le proprio
                const isAdmin = await adminManager.isAdmin(message.author.id);
                const isOwner = message.author.id === message.guild.ownerId;
                const hasAdminPerm = message.member && message.member.permissions.has(PermissionsBitField.Flags.Administrator);
                
                if (!isAdmin && !isOwner && !hasAdminPerm && !message.author.bot) {
                    try {
                        console.log(`[HONEYPOT] ${message.author.tag} (${message.author.id}) a écrit dans le salon honeypot. Bannissement en cours...`);
                        
                        // 1. Ajouter d'abord à la banlist (blocklist globale)
                        if (banlistManager) {
                            try {
                                await banlistManager.addToBanlist(message.author.id, 'Honeypot : Autoban (anti-raid)', client.user.id);
                            } catch (e) {
                                console.error("Erreur lors de l'ajout à la banlist :", e);
                            }
                        }
                        
                        // 2. Bannir l'utilisateur du serveur local
                        await message.guild.members.ban(message.author.id, { 
                            reason: 'Honeypot : Autoban pour avoir écrit dans un salon interdit (protection anti-raid/compte compromis)' 
                        });

                        // Envoyer un log dans le salon de log si configuré
                        const guildConfigData = guildConfig.loadConfig()[message.guild.id] || {};
                        if (guildConfigData.logChannelId) {
                            const logChannel = message.guild.channels.cache.get(guildConfigData.logChannelId);
                            if (logChannel) {
                                const embed = new EmbedBuilder()
                                    .setColor('#FF0000')
                                    .setTitle('🚨 Honeypot Déclenché')
                                    .setDescription(`**${message.author.tag}** a été banni automatiquement pour avoir écrit dans le salon honeypot.`)
                                    .addFields(
                                        { name: 'Utilisateur', value: `${message.author.tag} (${message.author.id})`, inline: true },
                                        { name: 'Salon', value: message.channel.name, inline: true },
                                        { name: 'Message', value: message.content || '(aucun contenu)', inline: false }
                                    )
                                    .setTimestamp();
                                await logChannel.send({ embeds: [embed] });
                            }
                        }
                        
                        // Nettoyer le salon en supprimant le message s'il est encore là
                        if (message.deletable) {
                            await message.delete().catch(() => {});
                        }
                        
                        return; // Arrêter le traitement pour ce message
                    } catch (error) {
                        console.error(`Erreur lors du bannissement honeypot pour ${message.author.tag}:`, error);
                        if (error.code === 50013) {
                            await message.channel.send(`⚠️ **Erreur** : Je n'ai pas la permission de bannir ${message.author}. Vérifiez que j'ai la permission "Bannir des membres" et que mon rôle est placé au-dessus du sien dans les paramètres du serveur.`);
                        }
                    }
                } else if (!message.author.bot && (hasAdminPerm || isOwner || isAdmin)) {
                    await message.reply("⚠️ *En tant qu'administrateur, vous êtes immunisé contre le honeypot. Cependant, gardez à l'esprit que ce salon bannira immédiatement tout membre normal qui y écrira !*");
                }
            }
        }
        
        // Vérifier le spam
        if (!message.author.bot && message.content) {
            const isSpam = await checkSpam(
                message.author.id,
                message.content,
                message.guild,
                interactionHandler
            );
            
            if (isSpam) {
                await message.delete().catch(console.error);
            }
        }
        if (message.author.bot) return;

        // Traiter les messages venant des salons de support (tickets)
        if (message.guild && message.channel.name && message.channel.name.startsWith('ticket-')) {
            try {
                const handled = await dmTicketManager.handleSupportChannelMessage(message);
                // Si le message a été traité et renvoyé, on n'a pas nécessairement besoin de l'ignorer pour la suite (economy etc),
                // mais on peut le faire si on veut qu'il soit purement administratif.
                // Par souci de simplicité, on le laisse continuer pour l'économie (economyManager), à moins qu'on veuille return.
            } catch (error) {
                // Log the error but don't crash
            }
        }

        // Système de mine terrestre
        // Toute personne qui envoie un message et dont l'ensemble des rôles sont sous le bot a 1% de chance de prendre un mute de 10 minutes.
        if (message.guild) { // S'assurer que ce n'est pas un DM
            const member = message.member;
            const botMember = message.guild.members.me;

            // Vérifier si le bot a la permission de gérer les rôles et de timeout
            if (botMember && botMember.permissions.has(PermissionsBitField.Flags.ModerateMembers)) {
                // Vérifier si le rôle le plus élevé de l'utilisateur est inférieur à celui du bot
                // et que l'utilisateur n'est pas le propriétaire du serveur
                if (member && botMember.roles.highest.position > member.roles.highest.position && member.id !== message.guild.ownerId) {
                    // 1% de chance de déclencher la mine
                    if (Math.random() < 0.05) {
                        const muteDuration = 10 * 60 * 1000; // 10 minutes en millisecondes
                        try {
                         //   await member.timeout(muteDuration, 'Mine terrestre activée');
                            //await message.channel.send(`💥 **${member.user.tag}** a marché sur une mine terrestre et est mis en sourdine pendant 10 minutes !`);
                            console.log(`[MINE TERRESTRE] ${member.user.tag} a été mis en sourdine pendant 10 minutes.`);
                        } catch (error) {
                            console.error(`Erreur lors de l'application du timeout pour ${member.user.tag}:`, error);
                            // Gérer les erreurs de permission ou autres
                            await message.channel.send(`Oops ! Une mine terrestre a tenté de s'activer pour **${member.user.tag}**, mais quelque chose a mal tourné. (Vérifiez les permissions du bot)`);
                        }
                    }
                }
            }
        }
        
        // Award economy currency for message activity
        if (economyManager && message.guild) {
            try {
                await economyManager.addCurrency(
                    message.author.id, 
                    message.guild.id, 
                    1, // Default message reward
                    'Message sent'
                );
            } catch (error) {
                console.error('Error awarding currency for message:', error);
            }
        }
        
        // Handle auto-watch for keywords
        if (autoWatchHandler) {
            try {
                await autoWatchHandler.handleMessage(message, watchlistManager, client);
            } catch (error) {
                console.error('Error in auto-watch handler:', error);
            }
        }
        
        // Handle watchlist monitoring
        if (watchlistManager.handleUserMessage) {
            try {
                const userId = message.author.id;
                const guildId = message.guild.id;
                const watchlistEntry = watchlistManager.getWatchlistEntry(userId, guildId) || watchlistManager.getWatchlistEntry(userId, 'GLOBAL');
                
                if (watchlistEntry && espionageManager) {
                    const member = await message.guild.members.fetch(userId).catch(() => null);
                    if (member) {
                        const contentPreview = message.content.length > 200 
                            ? message.content.substring(0, 200) + '...' 
                            : message.content;
                        await espionageManager.addNote(
                            member,
                            `👁️ DÉTECTION SURVEILLANCE : Message intercepté dans <#${message.channel.id}> (Niveau: ${watchlistEntry.watchLevel})\n**Contenu** : "${contentPreview}"`,
                            'system'
                        ).catch(() => null);
                    }
                }
            } catch (err) {
                console.error('Error integrating watchlist with espionage manager:', err);
            }
            watchlistManager.handleUserMessage(message);
        }
        
        const timestamp = new Date().toISOString();
        const logMessage = `${timestamp} - ${message.author.tag}: ${message.content}`;
        logQueue.push(logMessage);
        
        // Sauvegarder le message dans le système de logs
        await messageLogger.saveMessage(message);
          backupToGitHub()
        // Vérifier le spam
        const isSpam = await checkSpam(message.author.id, message.content, message.guild, interactionHandler);
        
        if (isSpam) {
            // Le message a été traité comme spam et l'utilisateur a été banni
            return;
        }
 const isAdmin = interactionHandler.adminManager && await interactionHandler.adminManager.isAdmin(message.author.id);
    if (isAdmin) {
        return false; // Les administrateurs sont immunisés contre la détection de spam
    }
        // Vérifier les mots bloqués
        if (blockedWordsManager.isBlocked(message.guild.id, message.content)) {
            try {
                await message.delete();
                const warning = warnManager.addWarn(
                    message.author.id,
                    'Utilisation de mots bloqués',
                    client.user.id
                );
                const embed = new EmbedBuilder()
                    .setColor('#FFA500')
                    .setTitle('⚠️ Avertissement')
                    .setDescription(`Votre message dans **${message.guild.name}** a été supprimé car il contenait un mot bloqué.`) 
                    .addFields(
                        { name: 'Message supprimé', value: message.content.length > 1000 ? message.content.substring(0, 1000) + '...' : message.content },
                        { name: 'Avertissements actuels', value: `${warning.count}/3` },
                        { name: 'Rappel', value: 'L\'utilisation de certains mots n\'est pas autorisée sur ce serveur.' }
                    )
                    .setFooter({ text: `ID: ${warning.id}` });

                await message.author.send({ embeds: [embed] }).catch(() => {
                    message.channel.send({
                        content: `${message.author}, votre message a été supprimé car il contenait un mot bloqué. (Je n\'ai pas pu vous envoyer de message privé, veuillez activer les MP des membres du serveur pour recevoir les avertissements.)`,
                        ephemeral: true
                    }).catch(console.error);
                });

                if (warning.count >= 3) {
                    await message.guild.members.ban(message.author.id, { 
                        reason: '3 avertissements atteints (mots bloqués)'
                    }).catch(console.error);
                    
                    const banEmbed = new EmbedBuilder()
                        .setColor('#FF0000')
                        .setTitle('🔨 Bannissement')
                        .setDescription(`Vous avez été banni de **${message.guild.name}** pour avoir atteint 3 avertissements.`)
                        .addFields(
                            { name: 'Dernier avertissement', value: 'Utilisation de mots bloqués' },
                            { name: 'Date', value: new Date().toLocaleString('fr-FR') }
                        );
                    await message.author.send({ embeds: [banEmbed] }).catch(() => {});
                    
                    warnManager.clearWarns(message.author.id);
                }
            } catch (error) {
                console.error('Erreur lors de la gestion du message avec mot bloqué:', error);
            }
            return;
        }

        // Check for dox content (personal information) using enhanced DoxDetector
        if (doxDetector && doxDetector.analyzeMessage) {
            try {
                const analysis = await doxDetector.analyzeMessage(message);
                if (analysis && analysis.hasDetections) {
                    console.log(`[DOX DETECTED] Personal information detected in message from ${message.author.tag}: ${analysis.overallRisk} risk level`);
                    
                    // Handle the detection with proper escalation
                    const actionResults = await doxDetector.handleDetection(message, analysis, client);
                    
                    if (actionResults.messageDeleted) {
                        return; // Exit early after handling dox content
                    }
                }
            } catch (error) {
                console.error('Error handling dox detection:', error);
            }
        }
 
        // Ignorer les messages des bots et les messages sans serveur (DM)
        if (message.author.bot || !message.guild) return;

        // Vérifier si l'anti-invite est activé pour ce salon
        if (!guildConfig.isAntiInviteEnabled(message.guild.id, message.channel.id)) {
            return; // Anti-invite désactivé pour ce salon
        }

        // Vérifier si le message contient un lien d'invitation
        if (containsInviteLink(message.content)) {
            try {
                // Supprimer le message
                await message.delete().catch(console.error);
                
                // Envoyer un avertissement à l'utilisateur
                const warning = warnManager.addWarn(
                    message.author.id,
                    'Envoi de lien d\'invitation non autorisé',
                    client.user.id
                );

                // Envoyer un message d'avertissement en MP
                const embed = new EmbedBuilder()
                    .setColor('#FFA500')
                    .setTitle('⚠️ Avertissement')
                    .setDescription(`Votre message dans **${message.guild.name}** a été supprimé car il contenait un lien d'invitation.`)
                    .addFields(
                        { name: 'Message supprimé', value: message.content.length > 1000 ? message.content.substring(0, 1000) + '...' : message.content },
                        { name: 'Avertissements actuels', value: `${warning.count}/3` },
                        { name: 'Rappel', value: 'Les liens d\'invitation ne sont pas autorisés sur ce serveur.' }
                    )
                    .setFooter({ text: `ID: ${warning.id}` });

                await message.author.send({ embeds: [embed] }).catch(() => {
                    // Si on ne peut pas envoyer de MP, on répond dans le salon
                    message.channel.send({
                        content: `${message.author}, votre message a été supprimé car il contenait un lien d'invitation. (Je n'ai pas pu vous envoyer de message privé, veuillez activer les MP des membres du serveur pour recevoir les avertissements.)`,
                        ephemeral: true
                    }).catch(console.error);
                });

                // Si l'utilisateur atteint 3 avertissements, le bannir
                if (warning.count >= 3) {
                    await message.guild.members.ban(message.author.id, { 
                        reason: '3 avertissements atteints (liens d\'invitation)'
                    }).catch(console.error);
                    
                    // Envoyer un message de bannissement
                    const banEmbed = new EmbedBuilder()
                        .setColor('#FF0000')
                        .setTitle('🔨 Bannissement')
                        .setDescription(`Vous avez été banni de **${message.guild.name}** pour avoir atteint 3 avertissements.`)
                        .addFields(
                            { name: 'Dernier avertissement', value: 'Envoi de lien d\'invitation non autorisé' },
                            { name: 'Date', value: new Date().toLocaleString('fr-FR') }
                        );
                    await processLogQueue();
                    await message.author.send({ embeds: [banEmbed] }).catch(() => {});
                    
                    // Supprimer les avertissements après bannissement
                    warnManager.clearWarns(message.author.id);
                }
            } catch (error) {
                console.error('Erreur lors de la gestion du message avec lien d\'invitation:', error);
            }
            
            return;
        }
    });

    

    // Gestion des nouveaux membres qui rejoignent le serveur
    client.on('guildMemberAdd', async member => {
        try {
            // Vérifier si l'utilisateur est dans la banlist
            const { banned, reason } = await banlistManager.isBanned(member.id, member.guild.id);
            
            if (banned) {
                // Bannir l'utilisateur avec la raison du bannissement
                try {
                    await member.ban({ 
                        reason: `Banni automatiquement - ${reason || 'Raison non spécifiée'}` 
                    });
                    
                    console.log(`[BAN AUTOMATIQUE] ${member.user.tag} (${member.id}) a été banni automatiquement car il figure dans la banlist.`);
                    
                    // Envoyer un message dans le canal de logs si configuré
                    const guildConfigs = guildConfig.loadConfig();
                    const guildConfigData = guildConfigs[member.guild.id] || {};
                    
                    if (guildConfigData.logChannelId) {
                        const logChannel = member.guild.channels.cache.get(guildConfigData.logChannelId);
                        if (logChannel) {
                            const embed = new EmbedBuilder()
                                .setColor('#ff0000')
                                .setTitle('🚨 Bannissement Automatique')
                                .setDescription(`**${member.user.tag}** a été banni automatiquement car il figure dans la banlist.`)
                                .addFields(
                                    { name: 'ID', value: member.id, inline: true },
                                    { name: 'Raison', value: reason || 'Non spécifiée', inline: true },
                                    { name: 'Compte créé le', value: member.user.createdAt.toLocaleString('fr-FR'), inline: true }
                                )
                                .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
                                .setTimestamp();
                                
                            await logChannel.send({ embeds: [embed] });
                        }
                    }
                } catch (error) {
                    console.error(`Erreur lors du bannissement automatique de ${member.user.tag}:`, error);
                }
                return; // Exit early if user was banned
            }

            // Check watchlist for new member
            if (watchlistManager && watchlistManager.handleUserJoin) {
                await watchlistManager.handleUserJoin(member);
            }

            // Check for raid detection
            if (raidDetector && raidDetector.detectRapidJoins) {
                const raidResult = raidDetector.detectRapidJoins(member.guild.id, member);
                if (raidResult.isRaid) {
                    console.log(`[RAID DETECTED] Potential raid detected in ${member.guild.name}: ${raidResult.severity} severity`);
                    
                    // Apply protective measures
                    let measures = null;
                    if (raidDetector.applyProtectiveMeasures) {
                        measures = await raidDetector.applyProtectiveMeasures(member.guild, raidResult.severity, raidResult);
                    }
                    
                    // Notify administrators
                    if (raidDetector.notifyRaidDetected && measures) {
                        await raidDetector.notifyRaidDetected(member.guild.id, raidResult, measures);
                    }
                }
            }
        } catch (error) {
            await errorReporter.reportError(error, 'GuildMemberAdd', {
                memberId: member.id,
                guildId: member.guild.id,
                memberTag: member.user.tag
            }, client);
        }
    });

    // Gestion de l'enregistrement automatique dans le dossier d'espionnage lors d'un ban
    client.on('guildBanAdd', async (ban) => {
        try {
            const guild = ban.guild;
            const user = ban.user;
            const reason = ban.reason || "Aucune raison fournie (Bannissement Discord)";
            
            if (espionageManager) {
                // Simuler un membre du serveur (car non présent)
                const fakeMember = {
                    guild: guild,
                    id: user.id,
                    user: user,
                    roles: {
                        cache: {
                            filter: () => ({ map: () => [] })
                        }
                    },
                    joinedTimestamp: Date.now()
                };
                
                const thread = await espionageManager.getOrCreateMemberDossier(fakeMember);
                if (thread) {
                    await espionageManager.addNote(
                        fakeMember,
                        `🔨 BANNI DU SERVEUR : L'utilisateur a été banni.\n**Raison** : ${reason}`,
                        'system'
                    );
                    
                    const guildData = espionageManager.getGuildConfig(guild.id);
                    if (guildData.targets[user.id]) {
                        guildData.targets[user.id].threatLevel = 'Critical';
                        espionageManager.saveDossiers();
                        await espionageManager.updateDossier(fakeMember);
                    }
                }
            }
        } catch (error) {
            console.error("Erreur lors de la gestion de guildBanAdd pour l'espionnage :", error);
        }
    });

    // Détection des liens d'invitation dans les messages
    client.on('messageCreate', async message => {
    
    });

    // Economy activity tracking - Reaction rewards
    client.on('messageReactionAdd', async (reaction, user) => {
        if (user.bot) return;
        if (!reaction.message.guild) return; // Skip DMs
        
        try {
            await economyManager.addCurrency(
                user.id,
                reaction.message.guild.id,
                0.5, // Reaction reward (half of message reward)
                'Reaction added'
            );
        } catch (error) {
            console.error('Error awarding currency for reaction:', error);
        }
    });

    // Economy activity tracking - Voice activity rewards
    client.on('voiceStateUpdate', async (oldState, newState) => {
        if (newState.member.user.bot) return;
        if (!newState.guild) return;
        
        // Award currency when user joins a voice channel
        if (!oldState.channel && newState.channel) {
            try {
                await economyManager.addCurrency(
                    newState.member.id,
                    newState.guild.id,
                    2, // Voice join reward
                    'Joined voice channel'
                );
            } catch (error) {
                console.error('Error awarding currency for voice join:', error);
            }
        }
    });

    // Initialize DM Ticket Manager

    
    

    // Connexion du client
    client.login(token).catch(error => {
        console.error(`Failed to login with token: ${token.substring(0, 5)}...`, error);
    });

    //clients.push(client);
}

const app = express();
app.use(express.json());
app.use(express.static('public'));

// --- Configuration de la sauvegarde GitHub ---
let logQueue = [];
const BACKUP_INTERVAL = 5 * 60 * 1000; // 5 minutes

// Utiliser l'instance Octokit déjà configurée
if (!octokit) {
    // console.warn('⚠️ La sauvegarde sur GitHub est désactivée (problème de configuration)'); // Logs de backup désactivés
}

// Variables de suivi des sauvegardes


// Fonction pour sauvegarder la date de dernière sauvegarde
function saveBackupTime() {
    try {
        const backupInfo = {
            lastBackupTime: sharedConfig.lastBackupTime || 0,
            lastBackupTimes: Object.fromEntries(lastBackupTimes)
        };
        
        // Créer le dossier data s'il n'existe pas
        if (!fs.existsSync('data')) {
            fs.mkdirSync('data', { recursive: true });
        }
        
        fs.writeFileSync('data/backup_info.json', JSON.stringify(backupInfo, null, 2));
    } catch (error) {
        // console.error('Erreur lors de la sauvegarde des informations de sauvegarde:', error); // Logs de backup désactivés
    }
}

function loadBackupTime(interaction = null) {
    try {
        if (fs.existsSync('data/backup_info.json')) {
            const data = JSON.parse(fs.readFileSync('data/backup_info.json', 'utf8'));
            
            // Mettre à jour la configuration partagée
            if (data.lastBackupTime) {
                sharedConfig.lastBackupTime = data.lastBackupTime;
                initInteractionConfig(sharedConfig);
            }
            
            // Mettre à jour les sauvegardes par fichier
            if (data.lastBackupTimes) {
                for (const [filePath, timestamp] of Object.entries(data.lastBackupTimes)) {
                    lastBackupTimes.set(filePath, timestamp);
                }
            }
            
            if (interaction) {
                interaction.reply('✅ Configuration de sauvegarde chargée avec succès!');
            }
        } else if (interaction) {
            interaction.reply('ℹ️ Aucune configuration de sauvegarde précédente trouvée.');
        }
    } catch (error) {
        // console.error('Erreur lors du chargement de la configuration de sauvegarde:', error); // Logs de backup désactivés
        if (interaction) {
            interaction.reply('❌ Erreur lors du chargement de la configuration de sauvegarde.');
        }
    }
}

// Charger les informations de sauvegarde au démarrage
loadBackupTime();

// Planifier des sauvegardes régulières
setInterval(() => {
    if (octokit) {
        // console.log('\n=== Démarrage de la sauvegarde planifiée ==='); // Logs de backup désactivés
        backupToGitHub()
            .then(() => {
                // Mettre à jour le temps de la dernière sauvegarde
                sharedConfig.lastBackupTime = Date.now();
                initInteractionConfig(sharedConfig);
                saveBackupTime();
            })
            .catch(error => { /* console.error(error); */ }); // Logs de backup désactivés
    }
}, BACKUP_INTERVAL);

// Fonction pour forcer une sauvegarde manuelle
async function forceBackup() {
    if (octokit) {
        
        await backupToGitHub();
        // Mettre à jour le temps de la dernière sauvegarde
        sharedConfig.lastBackupTime = Date.now();
        lastBackupTimes.set('lastBackup', new Date().toISOString());
        saveBackupTime();
        initInteractionConfig(sharedConfig);
    } else {
        // console.error('Impossible de sauvegarder: configuration GitHub manquante'); // Logs de backup désactivés
    }
}

export { forceBackup };

// La configuration d'Octokit a été déplacée en haut du fichier pour une meilleure organisation

async function processLogQueue() {
    // Vérifier si on est déjà en train de traiter ou s'il n'y a rien à faire
    if (isLoggingToGithub || logQueue.length === 0) {
        return;
    }
    
    // Vérifier si Octokit est correctement configuré
    if (!octokit) {
        // console.warn('Octokit n\'est pas configuré. Impossible d\'envoyer les logs vers GitHub.'); // Logs de backup désactivés
        logQueue = []; // Vider la file pour éviter une boucle infinie
        return;
    }
    
    isLoggingToGithub = true;
    let logsToProcess = '';
    const batchSize = 20; // Réduit pour éviter les timeouts
    
    try {
        // Préparer le lot de logs à envoyer
        logsToProcess = logQueue.splice(0, batchSize).join('\n') + '\n';
        const logCount = logsToProcess.split('\n').filter(line => line.trim()).length;
        
        // console.log(`Tentative d'envoi de ${logCount} logs vers GitHub...`); // Logs de backup désactivés

        // Vérification des variables d'environnement
        if (!process.env.GITHUB_OWNER || !process.env.GITHUB_REPO) {
            throw new Error('Configuration GitHub manquante. Vérifiez les variables GITHUB_OWNER et GITHUB_REPO.');
        }

        // Récupération du contenu actuel du fichier
        let existingContent = '';
        let fileSha = undefined;
        
        try {
            // console.log('Récupération du contenu existant du fichier...'); // Logs de backup désactivés
            const { data } = await octokit.repos.getContent({
                owner: process.env.GITHUB_OWNER,
                repo: process.env.GITHUB_REPO,
                path: 'bot.log',
                ref: process.env.GITHUB_BRANCH || 'main'
            });
            
            if (data && data.content) {
                existingContent = Buffer.from(data.content, 'base64').toString('utf8');
                fileSha = data.sha;
                // console.log(`Fichier existant récupéré (${existingContent.length} caractères)`); // Logs de backup désactivés
            }
        } catch (error) {
            // Si le fichier n'existe pas (erreur 404), on continue avec un contenu vide
            if (error.status !== 404) {
                // console.error('Erreur lors de la récupération du fichier de logs:', error.message); // Logs de backup désactivés
                throw error;
            }
            // console.log('Aucun fichier de logs existant trouvé, création d\'un nouveau fichier.'); // Logs de backup désactivés
        }

        // Préparer le nouveau contenu
        const newContent = existingContent + logsToProcess;
        
        // Vérifier la taille du contenu
        if (newContent.length > 1000000) { // 1MB max
            // console.warn('Le fichier de logs dépasse 1MB, il sera tronqué.'); // Logs de backup désactivés
            // Garder seulement les logs les plus récents
            const truncatedContent = newContent.slice(-900000); // Garder les 900 derniers KB
            logsToProcess = truncatedContent;
        }
        
        // console.log('Envoi des mises à jour vers GitHub...'); // Logs de backup désactivés
        
        try {
            const response = await octokit.repos.createOrUpdateFileContents({
                owner: process.env.GITHUB_OWNER,
                repo: process.env.GITHUB_REPO,
                path: 'bot.log',
                message: `[Bot] Mise à jour des logs - ${new Date().toISOString()}`,
                content: Buffer.from(newContent).toString('base64'),
                sha: fileSha,
                branch: process.env.GITHUB_BRANCH || 'main',
                committer: {
                    name: 'GitBot',
                    email: 'noreply@github.com'
                },
                author: {
                    name: 'GitBot',
                    email: 'noreply@github.com'
                }
            });

            // console.log(`Logs envoyés avec succès vers GitHub. Commit SHA: ${response.data.commit.sha}`); // Logs de backup désactivés
            
            // Sauvegarder une copie locale des logs
            try {
                const logDir = path.join(process.cwd(), 'logs');
                if (!fs.existsSync(logDir)) {
                    fs.mkdirSync(logDir, { recursive: true });
                }
                
                const logFilePath = path.join(logDir, 'bot.log');
                await fs.promises.appendFile(logFilePath, logsToProcess);
                // console.log('Fichier de log local mis à jour avec succès'); // Logs de backup désactivés
            } catch (fsError) {
                // console.error('Erreur lors de l\'écriture du fichier de log local:', fsError); // Logs de backup désactivés
            }
            
        } catch (apiError) {
            // console.error('Erreur lors de l\'appel à l\'API GitHub:', apiError.message); // Logs de backup désactivés
            if (apiError.status === 403) {
                // console.error('Erreur 403 - Vérifiez les permissions du token GitHub et les limites de taux.'); // Logs de backup désactivés
            }
            throw apiError; // Relancer pour le bloc catch principal
        }

    } catch (error) {
        // console.error('Erreur lors de l\'envoi des logs vers GitHub:', error.message); // Logs de backup désactivés
        
        // Remettre les logs non traités dans la file d'attente
        if (logsToProcess) {
            const failedLogs = logsToProcess.trim().split('\n').filter(log => log.trim());
            logQueue.unshift(...failedLogs);
            // console.log(`Remis ${failedLogs.length} logs dans la file d'attente`); // Logs de backup désactivés
        }
        
        // Attendre avant de réessayer
        const retryDelay = 30000; // 30 secondes
        // console.log(`Nouvelle tentative dans ${retryDelay/1000} secondes...`); // Logs de backup désactivés
        await new Promise(resolve => setTimeout(resolve, retryDelay));
        
    } finally {
        isLoggingToGithub = false;
        
        // Vérifier s'il reste des logs à traiter
        if (logQueue.length > 0) {
            // console.log(`Il reste ${logQueue.length} logs à traiter, nouvelle tentative...`); // Logs de backup désactivés
            setImmediate(processLogQueue); // Utiliser setImmediate pour éviter la récursion trop profonde
        } else {
            
        }
    }
}

// Web Server
app.post('/login', (req, res) => {
    if (req.body.password === webPassword) {
        res.json({ success: true });
    } else {
        res.json({ success: false });
    }
});

app.get('/banlist', (req, res) => {
    fs.readFile('banlist.txt', 'utf8', (err, data) => {
        if (err) {
            res.status(500).send('Error reading banlist');
        } else {
            res.send(data);
        }
    });
});

app.post('/banlist', (req, res) => {
    fs.writeFile('banlist.txt', req.body.banlist, 'utf8', (err) => {
        if (err) {
            res.json({ success: false });
        } else {
            res.json({ success: true });
        }
    });
});

app.get('/servers', (req, res) => {
    const allGuilds = [];
    clients.forEach(client => {
        client.guilds.cache.forEach(guild => {
            allGuilds.push({ id: guild.id, name: guild.name });
        });
    });
    res.json(allGuilds);
});

app.post('/massban', async (req, res) => {
    const { serverId } = req.body;
    let guild;
    for (const client of clients) {
        guild = client.guilds.cache.get(serverId);
        if (guild) break;
    }
    if (!guild) {
        return res.status(404).json({ message: 'Server not found.' });
    }

    if (!guild.members.me?.permissions?.has(PermissionsBitField.Flags.BanMembers)) {
        return res.status(403).json({ message: 'I do not have permission to ban members on this server.' });
    }

    fs.readFile('banlist.txt', 'utf8', async (err, data) => {
        if (err) {
            return res.status(500).json({ message: 'Error reading banlist.txt' });
        }

        const idsToBan = data.split(/\r?\n/).filter(id => id.trim() !== '');
        if (idsToBan.length === 0) {
            return res.status(400).json({ message: 'The ban list is empty.' });
        }

        let successfulBans = 0;
        let failedBans = 0;

        for (const id of idsToBan) {
            try {
                await guild.members.ban(id, { reason: 'Mass ban from web interface.' });
                successfulBans++;
            } catch (error) {
                failedBans++;
                console.error(`Failed to ban ${id} on server ${guild.name}:`, error);
            }
        }

        res.json({ message: `Mass ban complete on ${guild.name}. Successful: ${successfulBans}, Failed: ${failedBans}` });
    });
});

app.get('/exportbans', async (req, res) => {
    const { serverId } = req.query;
    let guild;
    for (const client of clients) {
        guild = client.guilds.cache.get(serverId);
        if (guild) break;
    }
    if (!guild) {
        return res.status(404).send('Server not found.');
    }

    if (!guild.members.me?.permissions?.has(PermissionsBitField.Flags.BanMembers)) {
        return res.status(403).send('I do not have permission to view bans on this server.');
    }

    try {
        const bans = await guild.bans.fetch();
        const banIds = bans.map(ban => ban.user.id).join('\n');
        res.header('Content-Disposition', `attachment; filename=${guild.name}-bans.txt`);
        res.type('text/plain');
        res.send(banIds);
    } catch (error) {
        console.error(`Failed to fetch bans from ${guild.name}:`, error);
        res.status(500).send('Failed to fetch bans.');
    }
});

app.get('/exportmembers', async (req, res) => {
    const { serverId } = req.query;
    let guild;
    for (const client of clients) {
        guild = client.guilds.cache.get(serverId);
        if (guild) break;
    }

    if (!guild) {
        return res.status(404).send('Server not found.');
    }

    try {
        await guild.members.fetch();
        const memberIds = guild.members.cache.map(member => member.id).join('\n');
        res.header('Content-Disposition', `attachment; filename=${guild.name}-members.txt`);
        res.type('text/plain');
        res.send(memberIds);
    } catch (error) {
        console.error(`Failed to fetch members from ${guild.name}:`, error);
        res.status(500).send('Failed to fetch members.');
    }
});

app.get('/channels', (req, res) => {
    const { serverId } = req.query;
    let guild;
    for (const client of clients) {
        guild = client.guilds.cache.get(serverId);
        if (guild) break;
    }

    if (!guild) {
        return res.status(404).send('Server not found.');
    }

    const textChannels = guild.channels.cache.filter(channel => channel.type === 0); // 0 for GUILD_TEXT
    const channelList = textChannels.map(channel => ({ id: channel.id, name: channel.name }));
    res.json(channelList);
});

app.get('/messages', async (req, res) => {
    const { serverId, channelId } = req.query;
    let guild;
    for (const client of clients) {
        guild = client.guilds.cache.get(serverId);
        if (guild) break;
    }

    if (!guild) {
        return res.status(404).send('Server not found.');
    }

    const channel = guild.channels.cache.get(channelId);
    if (!channel || channel.type !== 0) { // 0 for GUILD_TEXT
        return res.status(404).send('Text channel not found.');
    }

    try {
        const messages = await channel.messages.fetch({ limit: 50 });
        const messageList = messages.map(message => ({
            author: message.author.tag,
            content: message.content,
            timestamp: message.createdAt.toLocaleString()
        }));
        res.json(messageList);
    } catch (error) {
        console.error(`Failed to fetch messages from channel ${channel.name} in server ${guild.name}:`, error);
        res.status(500).send('Failed to fetch messages.');
    }
});


// Démarrer le serveur web seulement si activé
if (webServerEnabled) {
    app.listen(3000, () => {
        console.log('Web server listening on port 3000');
    });
} else {
    console.log('Web server disabled. Set WEB_SERVER_ENABLED=true in .env to enable it.');
}