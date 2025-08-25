import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MESSAGES_DIR =  'messages';

class MessageLogger {
    constructor() {
        // S'assurer que le dossier des messages existe
        if (!fs.existsSync(MESSAGES_DIR)) {
            fs.mkdirSync(MESSAGES_DIR, { recursive: true });
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
}

export default MessageLogger;
