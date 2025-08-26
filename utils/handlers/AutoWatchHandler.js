import fs from 'fs/promises';
import path from 'path';
import { EmbedBuilder } from 'discord.js';

export default class AutoWatchHandler {
    constructor() {
        this.keywordsFile = path.join(process.cwd(), 'data', 'watchlist_keywords.txt');
        this.keywords = new Set();
        this.loadKeywords();
    }

    async loadKeywords() {
        try {
            await fs.mkdir(path.dirname(this.keywordsFile), { recursive: true });
            
            try {
                const content = await fs.readFile(this.keywordsFile, 'utf-8');
                const keywords = content.split('\n')
                    .map(k => k.trim().toLowerCase())
                    .filter(k => k !== '');
                
                this.keywords = new Set(keywords);
            } catch (error) {
                if (error.code !== 'ENOENT') {
                    console.error('Error loading watch keywords:', error);
                }
            }
        } catch (error) {
            console.error('Error initializing AutoWatchHandler:', error);
        }
    }

    async reloadKeywords() {
        await this.loadKeywords();
    }

    hasKeyword(message) {
        if (this.keywords.size === 0) return false;
        
        // Vérifier le contenu du message
        const content = message.content.toLowerCase();
        
        // Vérifier le pseudo et le nom d'utilisateur
        const username = message.author.username.toLowerCase();
        const nickname = message.member?.nickname?.toLowerCase() || '';
        
        for (const keyword of this.keywords) {
            const keywordLower = keyword.toLowerCase();
            if (content.includes(keywordLower) || 
                username.includes(keywordLower) || 
                nickname.includes(keywordLower)) {
                return true;
            }
        }
        return false;
    }

    async handleMessage(message, watchlistManager, client) {
        try {
            // Skip if the message is from a bot or doesn't contain any keywords
            if (message.author.bot || !this.hasKeyword(message)) {
                return false;
            }

            // Vérifier si l'utilisateur est déjà dans la watchlist globale
            const isOnGlobalWatchlist = await watchlistManager.isUserOnGlobalWatchlist(message.author.id);
            if (isOnGlobalWatchlist) {
                return false; // Déjà dans la watchlist globale
            }

            // Déterminer où le mot-clé a été trouvé
            const keywordFound = [];
            const content = message.content.toLowerCase();
            const username = message.author.username.toLowerCase();
            const nickname = message.member?.nickname?.toLowerCase() || '';
            
            for (const keyword of this.keywords) {
                const keywordLower = keyword.toLowerCase();
                if (content.includes(keywordLower)) keywordFound.push(`dans le message`);
                if (username.includes(keywordLower)) keywordFound.push(`dans le nom d'utilisateur (${message.author.username})`);
                if (nickname.includes(keywordLower)) keywordFound.push(`dans le pseudonyme (${message.member.nickname})`);
            }
            
            // Ajouter à la watchlist globale avec une raison détaillée
            await watchlistManager.addToGlobalWatchlist({
                userId: message.author.id,
                reason: `[AUTO] Mot-clé interdit détecté ${keywordFound.join(', ')}`,
                level: 'observe',
                moderatorId: client.user.id,
                moderatorName: client.user.username,
                guildId: message.guild?.id,
                evidence: {
                    messageContent: message.content,
                    username: message.author.username,
                    nickname: message.member?.nickname || 'Aucun',
                    detectedIn: keywordFound
                }
            });

            // Envoyer un message au canal de logs si configuré
            if (message.guild) {
                const guildConfig = message.client.guildConfig?.get(message.guild.id);
                if (guildConfig?.logChannelId) {
                    const logChannel = message.guild.channels.cache.get(guildConfig.logChannelId);
                    if (logChannel) {
                        // Créer la description avec les détails de détection
                        const detectionDetails = keywordFound.map(detail => {
                            if (detail.includes('nom d\'utilisateur')) {
                                return `• ${detail}: ${message.author.username}`;
                            } else if (detail.includes('pseudonyme')) {
                                return `• ${detail}: ${message.member.nickname}`;
                            } else {
                                const keyword = this.keywords.find(k => 
                                    message.content.toLowerCase().includes(k.toLowerCase()) ||
                                    message.author.username.toLowerCase().includes(k.toLowerCase()) ||
                                    (message.member?.nickname?.toLowerCase() || '').includes(k.toLowerCase())
                                );
                                return `• ${detail}: "${keyword}"`;
                            }
                        }).join('\n');

                        const embed = new EmbedBuilder()
                            .setColor('#FFA500')
                            .setTitle('👀 Ajout automatique à la Watchlist Globale')
                            .setDescription(`L'utilisateur ${message.author} a été ajouté à la watchlist globale.`)
                            .addFields(
                                { name: 'Utilisateur', value: `${message.author.tag} (${message.author.id})`, inline: true },
                                { name: 'Niveau', value: 'Observation', inline: true },
                                { name: 'Détection', value: detectionDetails || 'Non spécifié', inline: false },
                                { name: 'Message', value: message.content.length > 0 ? 
                                    (message.content.length > 100 ? message.content.substring(0, 100) + '...' : message.content) :
                                    '*Aucun contenu de message*', inline: false }
                            )
                            .setTimestamp()
                            .setFooter({ text: `ID: ${message.author.id}` });
                        
                        await logChannel.send({ embeds: [embed] }).catch(console.error);
                    }
                }
            }

            // Journaliser l'action
            console.log(`[AutoWatch] ${message.author.tag} (${message.author.id}) ajouté à la watchlist globale pour l'utilisation d'un mot-clé surveillé`);
            
            return true;
        } catch (error) {
            console.error('Error in AutoWatchHandler:', error);
            return false;
        }
    }
}
