import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { EmbedBuilder } from 'discord.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MESSAGES_DIR =  'messages';

class MessageLogger {
    constructor(reportManager = null) {
        // S'assurer que le dossier des messages existe
        if (!fs.existsSync(MESSAGES_DIR)) {
            fs.mkdirSync(MESSAGES_DIR, { recursive: true });
        }
        
        this.reportManager = reportManager;
        
        // Initialize enhanced logging directories
        this.initializeEnhancedDirectories();
    }

    /**
     * Initialize directories for enhanced logging features
     */
    initializeEnhancedDirectories() {
        const enhancedDirs = [
            'data/raid_events',
            'data/dox_detections', 
            'data/watchlist_incidents',
            'data/system_logs',
            'data/error_logs'
        ];

        enhancedDirs.forEach(dir => {
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
        });
    }

    /**
     * Log message deletion event
     * @param {Object} deletedMessage - Deleted message data
     * @param {import('discord.js').Client} client - Discord client for reporting
     */
    async logMessageDeletion(deletedMessage, client = null) {
        try {
            const timestamp = new Date().toISOString();
            const guildId = deletedMessage.guildId || deletedMessage.guild?.id;
            const channelId = deletedMessage.channelId || deletedMessage.channel?.id;
            
            if (!guildId || !channelId) return;

            const logEntry = {
                messageId: deletedMessage.id,
                author: {
                    id: deletedMessage.author?.id,
                    username: deletedMessage.author?.username,
                    discriminator: deletedMessage.author?.discriminator,
                    bot: deletedMessage.author?.bot
                },
                channelId: channelId,
                channelName: deletedMessage.channel?.name,
                guildId: guildId,
                guildName: deletedMessage.guild?.name,
                content: deletedMessage.content || '[Contenu non disponible]',
                originalTimestamp: deletedMessage.createdTimestamp,
                deletedAt: timestamp,
                attachments: deletedMessage.attachments?.map(a => ({
                    id: a.id,
                    name: a.name,
                    url: a.url,
                    contentType: a.contentType,
                    size: a.size
                })) || [],
                embeds: deletedMessage.embeds || [],
                logType: 'message_deletion'
            };

            // Save to deletion log file
            const date = new Date().toISOString().split('T')[0];
            const deletionLogPath = path.join(MESSAGES_DIR, guildId, 'deletions', `${date}.json`);
            const deletionDir = path.dirname(deletionLogPath);
            
            // Create deletion directory if it doesn't exist
            if (!fs.existsSync(deletionDir)) {
                fs.mkdirSync(deletionDir, { recursive: true });
            }

            // Load existing deletions or initialize new array
            let deletions = [];
            if (fs.existsSync(deletionLogPath)) {
                try {
                    deletions = JSON.parse(fs.readFileSync(deletionLogPath, 'utf8'));
                } catch (e) {
                    console.error(`Erreur lors de la lecture du fichier de suppressions ${deletionLogPath}:`, e);
                }
            }

            deletions.push(logEntry);
            fs.writeFileSync(deletionLogPath, JSON.stringify(deletions, null, 2), 'utf8');

            // Also save to system logs for monitoring
            const systemLogPath = path.join('data/system_logs', `message_deletion_${Date.now()}.json`);
            fs.writeFileSync(systemLogPath, JSON.stringify(logEntry, null, 2));

            // Report suspicious deletions (multiple deletions in short time, etc.)
            if (this.reportManager && client) {
                const recentDeletions = await this.getRecentDeletions(guildId, channelId, 5); // Last 5 minutes
                
                if (recentDeletions.length >= 5) { // 5 or more deletions in 5 minutes
                    await this.reportManager.sendSystemAlert(
                        client,
                        '🗑️ Suppressions Massives Détectées',
                        `Plusieurs messages ont été supprimés rapidement dans le même canal.`,
                        [
                            { name: 'Serveur', value: `${deletedMessage.guild?.name} (${guildId})`, inline: true },
                            { name: 'Canal', value: `<#${channelId}>`, inline: true },
                            { name: 'Suppressions récentes', value: recentDeletions.length.toString(), inline: true },
                            { name: 'Dernier message supprimé', value: `Par: ${deletedMessage.author?.username || 'Inconnu'}`, inline: false }
                        ],
                        0xff9900
                    );
                }
            }

            console.log(`[MESSAGE DELETION] Message ${deletedMessage.id} deleted in guild ${guildId}, channel ${channelId}`);
        } catch (error) {
            console.error('Erreur lors de l\'enregistrement de la suppression de message:', error);
        }
    }

    /**
     * Log bulk message deletion event
     * @param {Collection} deletedMessages - Collection of deleted messages
     * @param {import('discord.js').Channel} channel - Channel where messages were deleted
     * @param {import('discord.js').Client} client - Discord client for reporting
     */
    async logBulkMessageDeletion(deletedMessages, channel, client = null) {
        try {
            const timestamp = new Date().toISOString();
            const guildId = channel.guild?.id;
            
            if (!guildId) return;

            const logEntry = {
                type: 'bulk_deletion',
                guildId: guildId,
                guildName: channel.guild?.name,
                channelId: channel.id,
                channelName: channel.name,
                deletedCount: deletedMessages.size,
                deletedAt: timestamp,
                messages: deletedMessages.map(msg => ({
                    id: msg.id,
                    author: {
                        id: msg.author?.id,
                        username: msg.author?.username,
                        discriminator: msg.author?.discriminator
                    },
                    content: msg.content || '[Contenu non disponible]',
                    createdTimestamp: msg.createdTimestamp,
                    attachments: msg.attachments?.map(a => ({
                        id: a.id,
                        name: a.name,
                        url: a.url
                    })) || []
                })),
                logType: 'bulk_message_deletion'
            };

            // Save to bulk deletion log
            const date = new Date().toISOString().split('T')[0];
            const bulkLogPath = path.join(MESSAGES_DIR, guildId, 'bulk_deletions', `${date}.json`);
            const bulkDir = path.dirname(bulkLogPath);
            
            if (!fs.existsSync(bulkDir)) {
                fs.mkdirSync(bulkDir, { recursive: true });
            }

            let bulkDeletions = [];
            if (fs.existsSync(bulkLogPath)) {
                try {
                    bulkDeletions = JSON.parse(fs.readFileSync(bulkLogPath, 'utf8'));
                } catch (e) {
                    console.error(`Erreur lors de la lecture du fichier de suppressions en masse ${bulkLogPath}:`, e);
                }
            }

            bulkDeletions.push(logEntry);
            fs.writeFileSync(bulkLogPath, JSON.stringify(bulkDeletions, null, 2), 'utf8');

            // Always report bulk deletions as they're significant events
            if (this.reportManager && client) {
                await this.reportManager.sendSystemAlert(
                    client,
                    '🗑️ Suppression en Masse Détectée',
                    `Une suppression en masse de messages a été effectuée.`,
                    [
                        { name: 'Serveur', value: `${channel.guild?.name} (${guildId})`, inline: true },
                        { name: 'Canal', value: `<#${channel.id}>`, inline: true },
                        { name: 'Messages supprimés', value: deletedMessages.size.toString(), inline: true },
                        { name: 'Heure', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: false }
                    ],
                    0xff4444
                );
            }

            console.log(`[BULK DELETION] ${deletedMessages.size} messages deleted in guild ${guildId}, channel ${channel.id}`);
        } catch (error) {
            console.error('Erreur lors de l\'enregistrement de la suppression en masse:', error);
        }
    }

    /**
     * Get recent message deletions for analysis
     * @param {string} guildId - Guild ID
     * @param {string} channelId - Channel ID
     * @param {number} minutes - Minutes to look back
     * @returns {Array} Recent deletions
     */
    async getRecentDeletions(guildId, channelId, minutes = 5) {
        try {
            const cutoffTime = Date.now() - (minutes * 60 * 1000);
            const date = new Date().toISOString().split('T')[0];
            const deletionLogPath = path.join(MESSAGES_DIR, guildId, 'deletions', `${date}.json`);
            
            if (!fs.existsSync(deletionLogPath)) {
                return [];
            }

            const deletions = JSON.parse(fs.readFileSync(deletionLogPath, 'utf8'));
            
            return deletions.filter(deletion => {
                const deletionTime = new Date(deletion.deletedAt).getTime();
                return deletion.channelId === channelId && deletionTime >= cutoffTime;
            });
        } catch (error) {
            console.error('Erreur lors de la récupération des suppressions récentes:', error);
            return [];
        }
    }

    /**
     * Get deletion statistics for a guild
     * @param {string} guildId - Guild ID
     * @param {number} days - Days to look back
     * @returns {Object} Deletion statistics
     */
    getDeletionStats(guildId, days = 7) {
        try {
            const stats = {
                totalDeletions: 0,
                bulkDeletions: 0,
                deletionsByChannel: {},
                deletionsByUser: {},
                deletionsByDay: {}
            };

            const deletionsDir = path.join(MESSAGES_DIR, guildId, 'deletions');
            const bulkDeletionsDir = path.join(MESSAGES_DIR, guildId, 'bulk_deletions');

            // Process regular deletions
            if (fs.existsSync(deletionsDir)) {
                const files = fs.readdirSync(deletionsDir).filter(file => file.endsWith('.json'));
                
                files.forEach(file => {
                    const filePath = path.join(deletionsDir, file);
                    const fileDate = file.replace('.json', '');
                    
                    // Check if file is within the specified days
                    const daysDiff = Math.floor((Date.now() - new Date(fileDate).getTime()) / (1000 * 60 * 60 * 24));
                    if (daysDiff <= days) {
                        try {
                            const deletions = JSON.parse(fs.readFileSync(filePath, 'utf8'));
                            
                            stats.totalDeletions += deletions.length;
                            stats.deletionsByDay[fileDate] = deletions.length;
                            
                            deletions.forEach(deletion => {
                                // Count by channel
                                if (!stats.deletionsByChannel[deletion.channelId]) {
                                    stats.deletionsByChannel[deletion.channelId] = 0;
                                }
                                stats.deletionsByChannel[deletion.channelId]++;
                                
                                // Count by user
                                const userId = deletion.author?.id || 'unknown';
                                if (!stats.deletionsByUser[userId]) {
                                    stats.deletionsByUser[userId] = 0;
                                }
                                stats.deletionsByUser[userId]++;
                            });
                        } catch (e) {
                            console.error(`Erreur lors de la lecture du fichier de suppressions ${filePath}:`, e);
                        }
                    }
                });
            }

            // Process bulk deletions
            if (fs.existsSync(bulkDeletionsDir)) {
                const files = fs.readdirSync(bulkDeletionsDir).filter(file => file.endsWith('.json'));
                
                files.forEach(file => {
                    const filePath = path.join(bulkDeletionsDir, file);
                    const fileDate = file.replace('.json', '');
                    
                    const daysDiff = Math.floor((Date.now() - new Date(fileDate).getTime()) / (1000 * 60 * 60 * 24));
                    if (daysDiff <= days) {
                        try {
                            const bulkDeletions = JSON.parse(fs.readFileSync(filePath, 'utf8'));
                            stats.bulkDeletions += bulkDeletions.length;
                        } catch (e) {
                            console.error(`Erreur lors de la lecture du fichier de suppressions en masse ${filePath}:`, e);
                        }
                    }
                });
            }

            return stats;
        } catch (error) {
            console.error('Erreur lors de la récupération des statistiques de suppression:', error);
            return {};
        }
    }

    /**
     * Sauvegarde un message dans le fichier JSON approprié
     * @param {Message} message - L'objet message de Discord.js
     */
    async saveMessage(message) {
        try {
            // Ignorer les messages des bots et sans serveur
            if (message.author.bot || !message.guild) return;

            const guildId = message.guild.id;
            const channelId = message.channel.id;
            const date = new Date();
            const dateStr = date.toISOString().split('T')[0]; // Format: YYYY-MM-DD
            
            // Créer le chemin du fichier: data/messages/GUILD_ID/CHANNEL_ID/YYYY-MM-DD.json
            const filePath = path.join(MESSAGES_DIR, guildId, channelId, `${dateStr}.json`);
            const dirPath = path.dirname(filePath);
            
            // Créer les dossiers si nécessaire
            if (!fs.existsSync(dirPath)) {
                fs.mkdirSync(dirPath, { recursive: true });
            }
            
            // Charger les messages existants ou initialiser un nouveau tableau
            let messages = [];
            if (fs.existsSync(filePath)) {
                try {
                    messages = JSON.parse(fs.readFileSync(filePath, 'utf8'));
                } catch (e) {
                    console.error(`Erreur lors de la lecture du fichier ${filePath}:`, e);
                    return;
                }
            }
            
            // Ajouter le nouveau message
            messages.push({
                id: message.id,
                author: {
                    id: message.author.id,
                    username: message.author.username,
                    discriminator: message.author.discriminator,
                    bot: message.author.bot
                },
                channelId: message.channel.id,
                channelName: message.channel.name,
                content: message.content,
                timestamp: message.createdTimestamp,
                attachments: message.attachments.map(a => ({
                    id: a.id,
                    name: a.name,
                    url: a.url,
                    contentType: a.contentType,
                    size: a.size
                })),
                embeds: message.embeds,
                mentions: {
                    users: message.mentions.users.map(u => u.id),
                    roles: message.mentions.roles.map(r => r.id),
                    channels: message.mentions.channels.map(c => c.id)
                }
            });
            
            // Sauvegarder dans le fichier
            fs.writeFileSync(filePath, JSON.stringify(messages, null, 2), 'utf8');
            
        } catch (error) {
            console.error('Erreur lors de la sauvegarde du message:', error);
        }
    }
    
    /**
     * Récupère les messages d'un salon pour une date donnée
     * @param {string} guildId - ID du serveur
     * @param {string} channelId - ID du salon
     * @param {Date} date - Date des messages à récupérer
     * @returns {Array} Tableau de messages
     */
    getMessages(guildId, channelId, date = new Date()) {
        try {
            const dateStr = date.toISOString().split('T')[0];
            const filePath = path.join(MESSAGES_DIR, guildId, channelId, `${dateStr}.json`);
            
            if (fs.existsSync(filePath)) {
                return JSON.parse(fs.readFileSync(filePath, 'utf8'));
            }
            return [];
        } catch (error) {
            console.error('Erreur lors de la récupération des messages:', error);
            return [];
        }
    }
    
    /**
     * Récupère la liste des fichiers de messages disponibles
     * @returns {Array} Liste des fichiers de messages
     */
    getAllMessageFiles() {
        try {
            const files = [];
            
            // Parcourir tous les dossiers de serveurs
            if (fs.existsSync(MESSAGES_DIR)) {
                const guildDirs = fs.readdirSync(MESSAGES_DIR, { withFileTypes: true })
                    .filter(dirent => dirent.isDirectory())
                    .map(dirent => dirent.name);
                
                for (const guildId of guildDirs) {
                    const guildPath = path.join(MESSAGES_DIR, guildId);
                    const channelDirs = fs.readdirSync(guildPath, { withFileTypes: true })
                        .filter(dirent => dirent.isDirectory())
                        .map(dirent => dirent.name);
                    
                    for (const channelId of channelDirs) {
                        const channelPath = path.join(guildPath, channelId);
                        const messageFiles = fs.readdirSync(channelPath)
                            .filter(file => file.endsWith('.json'))
                            .map(file => ({
                                guildId,
                                channelId,
                                date: file.replace('.json', ''),
                                path: path.join(channelPath, file)
                            }));
                        
                        files.push(...messageFiles);
                    }
                }
            }
            
            return files;
        } catch (error) {
            console.error('Erreur lors de la récupération des fichiers de messages:', error);
            return [];
        }
    }

    // Enhanced Logging Methods

    /**
     * Log a raid event with detailed information
     * @param {Object} raidEvent - Raid event data
     * @param {import('discord.js').Client} client - Discord client for reporting
     */
    async logRaidEvent(raidEvent, client = null) {
        try {
            const timestamp = new Date().toISOString();
            const logEntry = {
                ...raidEvent,
                timestamp,
                logType: 'raid_event'
            };

            // Save to file
            const filePath = path.join('data/raid_events', `${raidEvent.guildId}_${Date.now()}.json`);
            fs.writeFileSync(filePath, JSON.stringify(logEntry, null, 2));

            // Route critical raids through ReportManager
            if (this.reportManager && client && raidEvent.severity === 'critical') {
                await this.reportManager.sendSystemAlert(
                    client,
                    '🚨 Raid Critique Détecté',
                    `Un raid de niveau critique a été détecté sur le serveur.`,
                    [
                        { name: 'Serveur', value: raidEvent.guildId, inline: true },
                        { name: 'Sévérité', value: raidEvent.severity, inline: true },
                        { name: 'Utilisateurs affectés', value: raidEvent.affectedUsers?.length || 0, inline: true },
                        { name: 'Type', value: raidEvent.type, inline: true },
                        { name: 'Mesures appliquées', value: raidEvent.measures?.join(', ') || 'Aucune', inline: false }
                    ],
                    0xff0000
                );
            }

            console.log(`[RAID LOG] Raid event logged: ${raidEvent.type} in guild ${raidEvent.guildId}`);
        } catch (error) {
            console.error('Erreur lors de l\'enregistrement de l\'événement de raid:', error);
        }
    }

    /**
     * Log a dox detection event
     * @param {Object} doxEvent - Dox detection data
     * @param {import('discord.js').Client} client - Discord client for reporting
     */
    async logDoxDetection(doxEvent, client = null) {
        try {
            const timestamp = new Date().toISOString();
            const logEntry = {
                ...doxEvent,
                timestamp,
                logType: 'dox_detection',
                // Sanitize content for logging
                content: doxEvent.content ? '[REDACTED - Personal Information]' : null
            };

            // Save to file
            const filePath = path.join('data/dox_detections', `${doxEvent.guildId}_${Date.now()}.json`);
            fs.writeFileSync(filePath, JSON.stringify(logEntry, null, 2));

            // Always route dox detections through ReportManager (sensitive)
            if (this.reportManager && client) {
                await this.reportManager.sendSystemAlert(
                    client,
                    '🔒 Détection d\'Informations Personnelles',
                    `Des informations personnelles ont été détectées et supprimées.`,
                    [
                        { name: 'Serveur', value: doxEvent.guildId, inline: true },
                        { name: 'Utilisateur', value: `<@${doxEvent.userId}>`, inline: true },
                        { name: 'Type détecté', value: doxEvent.detectionType, inline: true },
                        { name: 'Action prise', value: doxEvent.action, inline: true },
                        { name: 'Canal', value: `<#${doxEvent.channelId}>`, inline: true }
                    ],
                    0xff6600
                );
            }

            console.log(`[DOX LOG] Dox detection logged: ${doxEvent.detectionType} from user ${doxEvent.userId}`);
        } catch (error) {
            console.error('Erreur lors de l\'enregistrement de la détection de dox:', error);
        }
    }

    /**
     * Log a watchlist incident
     * @param {Object} incident - Watchlist incident data
     * @param {import('discord.js').Client} client - Discord client for reporting
     */
    async logWatchlistIncident(incident, client = null) {
        try {
            const timestamp = new Date().toISOString();
            const logEntry = {
                ...incident,
                timestamp,
                logType: 'watchlist_incident'
            };

            // Save to file
            const filePath = path.join('data/watchlist_incidents', `${incident.guildId}_${Date.now()}.json`);
            fs.writeFileSync(filePath, JSON.stringify(logEntry, null, 2));

            // Route high-priority incidents through ReportManager
            if (this.reportManager && client && incident.priority === 'high') {
                await this.reportManager.sendSystemAlert(
                    client,
                    '👁️ Incident de Surveillance',
                    `Un utilisateur surveillé a déclenché une alerte.`,
                    [
                        { name: 'Serveur', value: incident.guildId, inline: true },
                        { name: 'Utilisateur', value: `<@${incident.userId}>`, inline: true },
                        { name: 'Type d\'incident', value: incident.type, inline: true },
                        { name: 'Description', value: incident.description, inline: false }
                    ],
                    0xffaa00
                );
            }

            console.log(`[WATCHLIST LOG] Incident logged: ${incident.type} for user ${incident.userId}`);
        } catch (error) {
            console.error('Erreur lors de l\'enregistrement de l\'incident de watchlist:', error);
        }
    }

    /**
     * Log system errors and critical events
     * @param {Object} errorEvent - Error event data
     * @param {import('discord.js').Client} client - Discord client for reporting
     */
    async logSystemError(errorEvent, client = null) {
        try {
            const timestamp = new Date().toISOString();
            const logEntry = {
                ...errorEvent,
                timestamp,
                logType: 'system_error'
            };

            // Save to file
            const filePath = path.join('data/error_logs', `error_${Date.now()}.json`);
            fs.writeFileSync(filePath, JSON.stringify(logEntry, null, 2));

            // Route critical errors through ReportManager
            if (this.reportManager && client && errorEvent.level === 'critical') {
                await this.reportManager.sendSystemAlert(
                    client,
                    '💥 Erreur Système Critique',
                    `Une erreur critique s'est produite dans le système.`,
                    [
                        { name: 'Composant', value: errorEvent.component, inline: true },
                        { name: 'Niveau', value: errorEvent.level, inline: true },
                        { name: 'Message', value: errorEvent.message.substring(0, 1000), inline: false },
                        { name: 'Stack Trace', value: errorEvent.stackTrace ? '```\n' + errorEvent.stackTrace.substring(0, 500) + '\n```' : 'Non disponible', inline: false }
                    ],
                    0xff0000
                );
            }

            console.log(`[SYSTEM ERROR] ${errorEvent.level.toUpperCase()}: ${errorEvent.message}`);
        } catch (error) {
            console.error('Erreur lors de l\'enregistrement de l\'erreur système:', error);
        }
    }

    /**
     * Log general system events
     * @param {Object} systemEvent - System event data
     * @param {import('discord.js').Client} client - Discord client for reporting
     */
    async logSystemEvent(systemEvent, client = null) {
        try {
            const timestamp = new Date().toISOString();
            const logEntry = {
                ...systemEvent,
                timestamp,
                logType: 'system_event'
            };

            // Save to file
            const filePath = path.join('data/system_logs', `${systemEvent.type}_${Date.now()}.json`);
            fs.writeFileSync(filePath, JSON.stringify(logEntry, null, 2));

            // Route important system events through ReportManager
            if (this.reportManager && client && systemEvent.reportToChannel) {
                await this.reportManager.sendSystemAlert(
                    client,
                    systemEvent.title || '📊 Événement Système',
                    systemEvent.description,
                    systemEvent.fields || [],
                    systemEvent.color || 0x00ff00
                );
            }

            console.log(`[SYSTEM EVENT] ${systemEvent.type}: ${systemEvent.description}`);
        } catch (error) {
            console.error('Erreur lors de l\'enregistrement de l\'événement système:', error);
        }
    }

    /**
     * Get enhanced log statistics
     * @returns {Object} Log statistics
     */
    getEnhancedLogStats() {
        try {
            const stats = {
                raidEvents: 0,
                doxDetections: 0,
                watchlistIncidents: 0,
                systemErrors: 0,
                systemEvents: 0,
                messageDeletions: 0,
                bulkDeletions: 0
            };

            // Count files in each directory
            const logDirs = [
                { dir: 'data/raid_events', key: 'raidEvents' },
                { dir: 'data/dox_detections', key: 'doxDetections' },
                { dir: 'data/watchlist_incidents', key: 'watchlistIncidents' },
                { dir: 'data/error_logs', key: 'systemErrors' },
                { dir: 'data/system_logs', key: 'systemEvents' }
            ];

            logDirs.forEach(({ dir, key }) => {
                if (fs.existsSync(dir)) {
                    stats[key] = fs.readdirSync(dir).filter(file => file.endsWith('.json')).length;
                }
            });

            // Count message deletions across all guilds
            if (fs.existsSync(MESSAGES_DIR)) {
                const guildDirs = fs.readdirSync(MESSAGES_DIR, { withFileTypes: true })
                    .filter(dirent => dirent.isDirectory())
                    .map(dirent => dirent.name);
                
                guildDirs.forEach(guildId => {
                    const deletionsDir = path.join(MESSAGES_DIR, guildId, 'deletions');
                    const bulkDeletionsDir = path.join(MESSAGES_DIR, guildId, 'bulk_deletions');
                    
                    if (fs.existsSync(deletionsDir)) {
                        const deletionFiles = fs.readdirSync(deletionsDir).filter(file => file.endsWith('.json'));
                        deletionFiles.forEach(file => {
                            try {
                                const deletions = JSON.parse(fs.readFileSync(path.join(deletionsDir, file), 'utf8'));
                                stats.messageDeletions += deletions.length;
                            } catch (e) {
                                // Ignore corrupted files
                            }
                        });
                    }
                    
                    if (fs.existsSync(bulkDeletionsDir)) {
                        const bulkFiles = fs.readdirSync(bulkDeletionsDir).filter(file => file.endsWith('.json'));
                        bulkFiles.forEach(file => {
                            try {
                                const bulkDeletions = JSON.parse(fs.readFileSync(path.join(bulkDeletionsDir, file), 'utf8'));
                                stats.bulkDeletions += bulkDeletions.length;
                            } catch (e) {
                                // Ignore corrupted files
                            }
                        });
                    }
                });
            }

            return stats;
        } catch (error) {
            console.error('Erreur lors de la récupération des statistiques de logs:', error);
            return {};
        }
    }

    /**
     * Clean old log files (older than specified days)
     * @param {number} daysToKeep - Number of days to keep logs
     */
    cleanOldLogs(daysToKeep = 30) {
        try {
            const cutoffTime = Date.now() - (daysToKeep * 24 * 60 * 60 * 1000);
            const logDirs = [
                'data/raid_events',
                'data/dox_detections',
                'data/watchlist_incidents',
                'data/error_logs',
                'data/system_logs'
            ];

            let deletedCount = 0;

            logDirs.forEach(dir => {
                if (fs.existsSync(dir)) {
                    const files = fs.readdirSync(dir);
                    files.forEach(file => {
                        const filePath = path.join(dir, file);
                        const stats = fs.statSync(filePath);
                        
                        if (stats.mtime.getTime() < cutoffTime) {
                            fs.unlinkSync(filePath);
                            deletedCount++;
                        }
                    });
                }
            });

            console.log(`[LOG CLEANUP] Deleted ${deletedCount} old log files (older than ${daysToKeep} days)`);
            return deletedCount;
        } catch (error) {
            console.error('Erreur lors du nettoyage des anciens logs:', error);
            return 0;
        }
    }
}

export default MessageLogger;
