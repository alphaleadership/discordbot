import TelegramBot from 'node-telegram-bot-api';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { EmbedBuilder } from 'discord.js';
import fetch from 'node-fetch';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * TelegramIntegration - Handles bidirectional communication between Discord and Telegram
 * Supports Discord to Telegram notifications and Telegram to Discord message forwarding
 */
export class TelegramIntegration {
    constructor(botToken, discordClient) {
        this.botToken = botToken;
        this.discordClient = discordClient;
        this.bot = null;
        this.isConnected = false;
        this.messageQueue = [];
        this.retryAttempts = new Map();
        this.maxRetries = 3;
        this.retryDelay = 5000; // 5 seconds
        
        // Configuration file paths
        this.configPath = path.join(process.cwd(), 'data', 'telegram_notifications.json');
        this.messagesPath = path.join(process.cwd(), 'data', 'telegram_messages.json');
        
        // Rate limiting
        this.rateLimiter = {
            messages: [],
            maxMessages: 30, // Telegram limit is 30 messages per second
            timeWindow: 1000 // 1 second
        };
        
        // Connection monitoring
        this.connectionMonitor = {
            lastHeartbeat: Date.now(),
            heartbeatInterval: null,
            reconnectAttempts: 0,
            maxReconnectAttempts: 5,
            reconnectDelay: 5000, // Start with 5 seconds
            maxReconnectDelay: 300000, // Max 5 minutes
            isReconnecting: false
        };
        
        // Error tracking
        this.errorStats = {
            totalErrors: 0,
            rateLimitErrors: 0,
            networkErrors: 0,
            authErrors: 0,
            lastError: null,
            errorHistory: []
        };
        
        this.initializeBot();
        this.ensureDataFiles();
    }

    /**
     * Initialize the Telegram bot with error handling
     */
    async initializeBot() {
        if (!this.botToken || this.botToken === 'your_telegram_bot_token') {
            console.warn('⚠️ Telegram bot token not configured. Telegram integration disabled.');
            return;
        }

        try {
            this.bot = new TelegramBot(this.botToken, { 
                polling: false // We'll start polling later
            });
            
            // Test the bot token
            const botInfo = await this.bot.getMe();
            console.log(`✅ Telegram bot initialized: @${botInfo.username}`);
            this.isConnected = true;
            
            // Start message processing
            this.startMessageProcessor();
            
            // Start Telegram message listener
            this.startTelegramListener();
            
            // Start connection monitoring
            this.startConnectionMonitoring();
            
        } catch (error) {
            console.error('❌ Failed to initialize Telegram bot:', error.message);
            this.trackError(error, 'initialization');
            this.isConnected = false;
            
            // Schedule reconnection attempt
            this.scheduleReconnection();
        }
    }

    /**
     * Ensure data files exist
     */
    ensureDataFiles() {
        const dataDir = path.join(process.cwd(), 'data');
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
        }

        // Initialize notification config file
        if (!fs.existsSync(this.configPath)) {
            const defaultConfig = {
                guilds: {},
                lastUpdated: new Date().toISOString()
            };
            fs.writeFileSync(this.configPath, JSON.stringify(defaultConfig, null, 2));
        }

        // Initialize messages log file
        if (!fs.existsSync(this.messagesPath)) {
            const defaultMessages = {
                messages: [],
                lastUpdated: new Date().toISOString()
            };
            fs.writeFileSync(this.messagesPath, JSON.stringify(defaultMessages, null, 2));
        }
    }

    /**
     * Load configuration from file
     */
    loadConfig() {
        try {
            const data = fs.readFileSync(this.configPath, 'utf8');
            return JSON.parse(data);
        } catch (error) {
            console.error('Error loading Telegram config:', error);
            return { guilds: {}, lastUpdated: new Date().toISOString() };
        }
    }

    /**
     * Save configuration to file
     */
    saveConfig(config) {
        try {
            config.lastUpdated = new Date().toISOString();
            fs.writeFileSync(this.configPath, JSON.stringify(config, null, 2));
            return true;
        } catch (error) {
            console.error('Error saving Telegram config:', error);
            return false;
        }
    }

    /**
     * Configure Telegram channel for a Discord guild
     */
    configureGuildChannel(guildId, telegramChannelId, discordChannelId = null) {
        const config = this.loadConfig();
        
        if (!config.guilds[guildId]) {
            config.guilds[guildId] = {};
        }
        
        config.guilds[guildId] = {
            telegramChannelId: telegramChannelId,
            discordChannelId: discordChannelId,
            enabled: true,
            notificationTypes: {
                moderation: true,
                raids: true,
                dox: true,
                status: true,
                stats: false
            },
            bridgeEnabled: !!discordChannelId,
            lastConfigured: new Date().toISOString()
        };
        
        return this.saveConfig(config);
    }

    /**
     * Send notification from Discord to Telegram
     */
    async sendNotification(guildId, message, priority = 'normal', eventType = 'moderation') {
        if (!this.isConnected || !this.bot) {
            console.warn('Telegram bot not connected, queuing message');
            this.queueMessage(guildId, message, priority, eventType);
            return false;
        }

        const config = this.loadConfig();
        const guildConfig = config.guilds[guildId];
        
        if (!guildConfig || !guildConfig.enabled || !guildConfig.telegramChannelId) {
            console.log(`No Telegram configuration for guild ${guildId}`);
            return false;
        }

        // Check if this notification type is enabled
        if (!guildConfig.notificationTypes[eventType]) {
            console.log(`Notification type ${eventType} disabled for guild ${guildId}`);
            return false;
        }

        // Rate limiting check
        if (!this.checkRateLimit()) {
            console.warn('Rate limit exceeded, queuing message');
            this.queueMessage(guildId, message, priority, eventType);
            return false;
        }

        try {
            const formattedMessage = this.formatDiscordEvent(eventType, message, priority);
            
            await this.bot.sendMessage(guildConfig.telegramChannelId, formattedMessage, {
                parse_mode: 'HTML',
                disable_web_page_preview: true
            });
            
            console.log(`✅ Telegram notification sent to guild ${guildId}`);
            return true;
            
        } catch (error) {
            this.trackError(error, 'send_notification');
            
            // Handle specific error types
            if (error.response?.statusCode === 429) {
                // Rate limited - queue with longer delay
                console.warn('Rate limited by Telegram, queuing message');
                this.queueMessage(guildId, message, priority, eventType);
            } else if (error.response?.statusCode === 403) {
                // Bot was blocked or removed from channel
                console.error(`Bot blocked or removed from Telegram channel ${guildConfig.telegramChannelId}`);
                await this.handleChannelAccessError(guildId, guildConfig.telegramChannelId);
            } else if (error.response?.statusCode === 400) {
                // Bad request - don't retry
                console.error('Bad request to Telegram API:', error.message);
            } else if (this.isRetryableError(error)) {
                // Queue for retry if it's a temporary error
                this.queueMessage(guildId, message, priority, eventType);
            }
            
            return false;
        }
    }

    /**
     * Format Discord events for Telegram
     */
    formatDiscordEvent(eventType, data, priority = 'normal') {
        const timestamp = new Date().toLocaleString('fr-FR');
        const priorityEmoji = this.getPriorityEmoji(priority);
        
        let message = `${priorityEmoji} <b>Discord Bot Alert</b>\n`;
        message += `📅 ${timestamp}\n`;
        message += `🏷️ Type: ${eventType.toUpperCase()}\n\n`;
        
        switch (eventType) {
            case 'moderation':
                message += this.formatModerationEvent(data);
                break;
            case 'raid':
                message += this.formatRaidEvent(data);
                break;
            case 'dox':
                message += this.formatDoxEvent(data);
                break;
            case 'status':
                message += this.formatStatusEvent(data);
                break;
            case 'stats':
                message += this.formatStatsEvent(data);
                break;
            default:
                message += `📝 ${data.toString()}`;
        }
        
        return message;
    }

    /**
     * Format moderation events
     */
    formatModerationEvent(data) {
        let message = `🛡️ <b>Moderation Action</b>\n`;
        
        if (data.action) message += `⚡ Action: ${data.action}\n`;
        if (data.user) message += `👤 User: ${data.user}\n`;
        if (data.moderator) message += `👮 Moderator: ${data.moderator}\n`;
        if (data.reason) message += `📋 Reason: ${data.reason}\n`;
        if (data.guild) message += `🏠 Server: ${data.guild}\n`;
        
        return message;
    }

    /**
     * Format raid detection events
     */
    formatRaidEvent(data) {
        let message = `🚨 <b>Raid Detection</b>\n`;
        
        if (data.type) message += `🔍 Type: ${data.type}\n`;
        if (data.severity) message += `⚠️ Severity: ${data.severity.toUpperCase()}\n`;
        if (data.affectedUsers) message += `👥 Users: ${data.affectedUsers.length}\n`;
        if (data.measures) message += `🛡️ Measures: ${data.measures.join(', ')}\n`;
        if (data.guild) message += `🏠 Server: ${data.guild}\n`;
        
        return message;
    }

    /**
     * Format dox detection events
     */
    formatDoxEvent(data) {
        let message = `🔒 <b>Personal Info Detection</b>\n`;
        
        if (data.type) message += `🔍 Type: ${data.type}\n`;
        if (data.user) message += `👤 User: ${data.user}\n`;
        if (data.action) message += `⚡ Action: ${data.action}\n`;
        if (data.channel) message += `📺 Channel: ${data.channel}\n`;
        if (data.guild) message += `🏠 Server: ${data.guild}\n`;
        
        return message;
    }

    /**
     * Format status events
     */
    formatStatusEvent(data) {
        let message = `ℹ️ <b>Bot Status</b>\n`;
        
        if (data.status) message += `📊 Status: ${data.status}\n`;
        if (data.uptime) message += `⏱️ Uptime: ${data.uptime}\n`;
        if (data.guilds) message += `🏠 Servers: ${data.guilds}\n`;
        if (data.message) message += `📝 Message: ${data.message}\n`;
        
        return message;
    }

    /**
     * Format statistics events
     */
    formatStatsEvent(data) {
        let message = `📊 <b>Bot Statistics</b>\n`;
        
        if (data.period) message += `📅 Period: ${data.period}\n`;
        if (data.messages) message += `💬 Messages: ${data.messages}\n`;
        if (data.moderations) message += `🛡️ Moderations: ${data.moderations}\n`;
        if (data.warnings) message += `⚠️ Warnings: ${data.warnings}\n`;
        if (data.bans) message += `🔨 Bans: ${data.bans}\n`;
        
        return message;
    }

    /**
     * Get priority emoji
     */
    getPriorityEmoji(priority) {
        switch (priority) {
            case 'urgent': return '🚨';
            case 'high': return '⚠️';
            case 'normal': return 'ℹ️';
            case 'low': return '💡';
            default: return 'ℹ️';
        }
    }

    /**
     * Queue message for retry
     */
    queueMessage(guildId, message, priority, eventType) {
        const queueItem = {
            id: Date.now() + Math.random(),
            guildId,
            message,
            priority,
            eventType,
            timestamp: new Date().toISOString(),
            retries: 0
        };
        
        this.messageQueue.push(queueItem);
        console.log(`Message queued for guild ${guildId}, queue size: ${this.messageQueue.length}`);
    }

    /**
     * Start message processor for queued messages
     */
    startMessageProcessor() {
        setInterval(async () => {
            if (this.messageQueue.length === 0 || !this.isConnected) {
                return;
            }
            
            const message = this.messageQueue.shift();
            const success = await this.sendNotification(
                message.guildId, 
                message.message, 
                message.priority, 
                message.eventType
            );
            
            if (!success && message.retries < this.maxRetries) {
                message.retries++;
                this.messageQueue.push(message);
                console.log(`Retrying message for guild ${message.guildId}, attempt ${message.retries}/${this.maxRetries}`);
            } else if (!success) {
                console.error(`Failed to send message after ${this.maxRetries} attempts, dropping message`);
            }
            
        }, this.retryDelay);
    }

    /**
     * Check rate limiting
     */
    checkRateLimit() {
        const now = Date.now();
        
        // Remove old messages outside the time window
        this.rateLimiter.messages = this.rateLimiter.messages.filter(
            timestamp => now - timestamp < this.rateLimiter.timeWindow
        );
        
        // Check if we're under the limit
        if (this.rateLimiter.messages.length >= this.rateLimiter.maxMessages) {
            return false;
        }
        
        // Add current message timestamp
        this.rateLimiter.messages.push(now);
        return true;
    }

    /**
     * Check if error is retryable
     */
    isRetryableError(error) {
        const retryableCodes = [429, 500, 502, 503, 504]; // Rate limit, server errors
        return retryableCodes.includes(error.response?.statusCode) || 
               error.code === 'ETELEGRAM' ||
               error.message.includes('network') ||
               error.message.includes('timeout');
    }

    /**
     * Handle channel access errors (bot blocked/removed)
     */
    async handleChannelAccessError(guildId, telegramChannelId) {
        try {
            // Disable notifications for this guild temporarily
            const config = this.loadConfig();
            if (config.guilds[guildId]) {
                config.guilds[guildId].enabled = false;
                config.guilds[guildId].lastError = {
                    type: 'access_denied',
                    message: 'Bot blocked or removed from Telegram channel',
                    timestamp: new Date().toISOString()
                };
                this.saveConfig(config);
            }

            // Try to notify via Discord
            if (this.discordClient) {
                const guild = this.discordClient.guilds.cache.get(guildId);
                if (guild && config.guilds[guildId]?.discordChannelId) {
                    const channel = guild.channels.cache.get(config.guilds[guildId].discordChannelId);
                    if (channel) {
                        const embed = new EmbedBuilder()
                            .setColor('#ff0000')
                            .setTitle('🚫 Telegram Access Error')
                            .setDescription('The bot has been blocked or removed from the Telegram channel.')
                            .addFields(
                                { name: 'Telegram Channel', value: telegramChannelId, inline: true },
                                { name: 'Status', value: 'Notifications Disabled', inline: true },
                                { name: 'Action Required', value: 'Re-add bot to Telegram channel and reconfigure', inline: false }
                            )
                            .setTimestamp();

                        await channel.send({ embeds: [embed] });
                    }
                }
            }

        } catch (error) {
            console.error('Failed to handle channel access error:', error.message);
        }
    }

    /**
     * Get comprehensive connection status
     */
    getStatus() {
        const now = Date.now();
        const lastHeartbeatAge = now - this.connectionMonitor.lastHeartbeat;
        
        return {
            connected: this.isConnected,
            queueSize: this.messageQueue.length,
            rateLimitRemaining: this.rateLimiter.maxMessages - this.rateLimiter.messages.length,
            botInfo: this.bot ? 'Connected' : 'Disconnected',
            lastHeartbeat: new Date(this.connectionMonitor.lastHeartbeat).toISOString(),
            heartbeatAge: Math.floor(lastHeartbeatAge / 1000), // seconds
            reconnectAttempts: this.connectionMonitor.reconnectAttempts,
            isReconnecting: this.connectionMonitor.isReconnecting,
            errorStats: {
                total: this.errorStats.totalErrors,
                rateLimits: this.errorStats.rateLimitErrors,
                network: this.errorStats.networkErrors,
                auth: this.errorStats.authErrors,
                lastError: this.errorStats.lastError
            }
        };
    }

    /**
     * Test message delivery
     */
    async testMessage(guildId, testMessage = 'Test message from Discord bot') {
        const testData = {
            status: 'Test',
            message: testMessage,
            timestamp: new Date().toISOString()
        };
        
        return await this.sendNotification(guildId, testData, 'normal', 'status');
    }

    /**
     * Reconnect to Telegram
     */
    async reconnect() {
        console.log('Attempting to reconnect to Telegram...');
        this.isConnected = false;
        
        if (this.bot) {
            try {
                await this.bot.stopPolling();
            } catch (error) {
                // Ignore errors when stopping
            }
        }
        
        await this.initializeBot();
        return this.isConnected;
    }

    /**
     * Start Telegram message listener for bidirectional communication
     */
    async startTelegramListener() {
        if (!this.bot || !this.isConnected) {
            console.warn('Cannot start Telegram listener: bot not connected');
            return;
        }

        try {
            // Start polling for messages
            await this.bot.startPolling();
            console.log('✅ Telegram message listener started');

            // Handle incoming messages
            this.bot.on('message', async (msg) => {
                await this.handleTelegramMessage(msg);
            });

            // Handle polling errors
            this.bot.on('polling_error', (error) => {
                this.trackError(error, 'polling');
                
                // Only trigger reconnection for serious errors
                if (this.isRetryableError(error)) {
                    this.handleConnectionFailure();
                } else {
                    console.error('Non-retryable polling error:', error.message);
                }
            });

            // Handle webhook errors
            this.bot.on('webhook_error', (error) => {
                this.trackError(error, 'webhook');
                console.error('Telegram webhook error:', error.message);
            });

        } catch (error) {
            console.error('Failed to start Telegram listener:', error.message);
            this.isConnected = false;
        }
    }

    /**
     * Handle incoming Telegram messages and forward to Discord
     */
    async handleTelegramMessage(message) {
        try {
            // Skip if message is from a bot or system
            if (message.from.is_bot) {
                return;
            }

            // Skip if message is too old (more than 5 minutes)
            const messageAge = Date.now() / 1000 - message.date;
            if (messageAge > 300) {
                return;
            }

            // Find which Discord guild this Telegram channel is configured for
            const config = this.loadConfig();
            const guildId = this.findGuildByTelegramChannel(message.chat.id.toString(), config);
            
            if (!guildId) {
                console.log(`No Discord guild configured for Telegram channel ${message.chat.id}`);
                return;
            }

            const guildConfig = config.guilds[guildId];
            if (!guildConfig.bridgeEnabled || !guildConfig.discordChannelId) {
                console.log(`Bridge not enabled for guild ${guildId}`);
                return;
            }

            // Validate message before forwarding
            if (!this.shouldForwardMessage(message, guildConfig)) {
                return;
            }

            // Forward message to Discord
            await this.forwardToDiscord(message, guildId, guildConfig.discordChannelId);

            // Log the message
            this.logTelegramMessage(message, guildId);

        } catch (error) {
            console.error('Error handling Telegram message:', error.message);
        }
    }

    /**
     * Find Discord guild ID by Telegram channel ID
     */
    findGuildByTelegramChannel(telegramChannelId, config) {
        for (const [guildId, guildConfig] of Object.entries(config.guilds)) {
            if (guildConfig.telegramChannelId === telegramChannelId) {
                return guildId;
            }
        }
        return null;
    }

    /**
     * Check if message should be forwarded to Discord
     */
    shouldForwardMessage(message, guildConfig) {
        // Skip empty messages
        if (!message.text && !message.photo && !message.document && !message.video && !message.audio) {
            return false;
        }

        // Skip system messages
        if (message.new_chat_members || message.left_chat_member || message.new_chat_title) {
            return false;
        }

        // Skip messages from the bot itself
        if (message.from.is_bot) {
            return false;
        }

        // Skip forwarded messages from other bots (optional)
        if (message.forward_from && message.forward_from.is_bot) {
            return false;
        }

        return true;
    }

    /**
     * Forward Telegram message to Discord channel
     */
    async forwardToDiscord(telegramMessage, guildId, discordChannelId) {
        try {
            const guild = this.discordClient.guilds.cache.get(guildId);
            if (!guild) {
                console.error(`Discord guild ${guildId} not found`);
                return false;
            }

            const channel = guild.channels.cache.get(discordChannelId);
            if (!channel) {
                console.error(`Discord channel ${discordChannelId} not found in guild ${guildId}`);
                return false;
            }

            // Format the message for Discord
            const formattedMessage = await this.formatTelegramMessage(telegramMessage);
            
            // Handle different message types
            if (telegramMessage.photo) {
                await this.forwardPhotoToDiscord(telegramMessage, channel, formattedMessage);
            } else if (telegramMessage.document) {
                await this.forwardDocumentToDiscord(telegramMessage, channel, formattedMessage);
            } else if (telegramMessage.video) {
                await this.forwardVideoToDiscord(telegramMessage, channel, formattedMessage);
            } else if (telegramMessage.audio || telegramMessage.voice) {
                await this.forwardAudioToDiscord(telegramMessage, channel, formattedMessage);
            } else {
                // Text message
                await channel.send(formattedMessage.content);
            }

            console.log(`✅ Forwarded Telegram message to Discord channel ${discordChannelId}`);
            return true;

        } catch (error) {
            console.error('Error forwarding message to Discord:', error.message);
            return false;
        }
    }

    /**
     * Format Telegram message for Discord
     */
    async formatTelegramMessage(telegramMessage) {
        const user = telegramMessage.from;
        const displayName = user.first_name + (user.last_name ? ` ${user.last_name}` : '');
        const username = user.username ? `@${user.username}` : '';
        const userInfo = username ? `${displayName} (${username})` : displayName;

        let content = `📱 **${userInfo}** via Telegram:\n`;
        
        if (telegramMessage.text) {
            content += telegramMessage.text;
        }

        // Handle reply to message
        if (telegramMessage.reply_to_message) {
            const replyTo = telegramMessage.reply_to_message.from;
            const replyDisplayName = replyTo.first_name + (replyTo.last_name ? ` ${replyTo.last_name}` : '');
            content += `\n\n↪️ *Replying to ${replyDisplayName}*`;
        }

        // Handle forwarded message
        if (telegramMessage.forward_from) {
            const forwardFrom = telegramMessage.forward_from;
            const forwardDisplayName = forwardFrom.first_name + (forwardFrom.last_name ? ` ${forwardFrom.last_name}` : '');
            content += `\n\n🔄 *Forwarded from ${forwardDisplayName}*`;
        }

        return {
            content: content,
            embeds: [],
            files: []
        };
    }

    /**
     * Forward photo from Telegram to Discord
     */
    async forwardPhotoToDiscord(telegramMessage, discordChannel, formattedMessage) {
        try {
            // Get the highest resolution photo
            const photo = telegramMessage.photo[telegramMessage.photo.length - 1];
            const fileLink = await this.bot.getFileLink(photo.file_id);
            
            // Download the image
            const response = await fetch(fileLink);
            const buffer = await response.buffer();
            
            // Send to Discord
            await discordChannel.send({
                content: formattedMessage.content,
                files: [{
                    attachment: buffer,
                    name: `telegram_photo_${Date.now()}.jpg`
                }]
            });

        } catch (error) {
            console.error('Error forwarding photo:', error.message);
            // Fallback to text message
            await discordChannel.send(formattedMessage.content + '\n📷 *[Photo - failed to download]*');
        }
    }

    /**
     * Forward document from Telegram to Discord
     */
    async forwardDocumentToDiscord(telegramMessage, discordChannel, formattedMessage) {
        try {
            const document = telegramMessage.document;
            
            // Check file size (Discord limit is 8MB for regular users)
            if (document.file_size > 8 * 1024 * 1024) {
                await discordChannel.send(formattedMessage.content + 
                    `\n📄 *[Document: ${document.file_name} - too large to forward (${Math.round(document.file_size / 1024 / 1024)}MB)]*`);
                return;
            }

            const fileLink = await this.bot.getFileLink(document.file_id);
            const response = await fetch(fileLink);
            const buffer = await response.buffer();
            
            await discordChannel.send({
                content: formattedMessage.content,
                files: [{
                    attachment: buffer,
                    name: document.file_name || `telegram_document_${Date.now()}`
                }]
            });

        } catch (error) {
            console.error('Error forwarding document:', error.message);
            await discordChannel.send(formattedMessage.content + 
                `\n📄 *[Document: ${telegramMessage.document.file_name} - failed to download]*`);
        }
    }

    /**
     * Forward video from Telegram to Discord
     */
    async forwardVideoToDiscord(telegramMessage, discordChannel, formattedMessage) {
        try {
            const video = telegramMessage.video;
            
            // Check file size
            if (video.file_size > 8 * 1024 * 1024) {
                await discordChannel.send(formattedMessage.content + 
                    `\n🎥 *[Video - too large to forward (${Math.round(video.file_size / 1024 / 1024)}MB)]*`);
                return;
            }

            const fileLink = await this.bot.getFileLink(video.file_id);
            const response = await fetch(fileLink);
            const buffer = await response.buffer();
            
            await discordChannel.send({
                content: formattedMessage.content,
                files: [{
                    attachment: buffer,
                    name: `telegram_video_${Date.now()}.mp4`
                }]
            });

        } catch (error) {
            console.error('Error forwarding video:', error.message);
            await discordChannel.send(formattedMessage.content + '\n🎥 *[Video - failed to download]*');
        }
    }

    /**
     * Forward audio from Telegram to Discord
     */
    async forwardAudioToDiscord(telegramMessage, discordChannel, formattedMessage) {
        try {
            const audio = telegramMessage.audio || telegramMessage.voice;
            
            // Check file size
            if (audio.file_size > 8 * 1024 * 1024) {
                await discordChannel.send(formattedMessage.content + 
                    `\n🎵 *[Audio - too large to forward (${Math.round(audio.file_size / 1024 / 1024)}MB)]*`);
                return;
            }

            const fileLink = await this.bot.getFileLink(audio.file_id);
            const response = await fetch(fileLink);
            const buffer = await response.buffer();
            
            const fileName = telegramMessage.voice ? 
                `telegram_voice_${Date.now()}.ogg` : 
                `telegram_audio_${Date.now()}.mp3`;
            
            await discordChannel.send({
                content: formattedMessage.content,
                files: [{
                    attachment: buffer,
                    name: fileName
                }]
            });

        } catch (error) {
            console.error('Error forwarding audio:', error.message);
            await discordChannel.send(formattedMessage.content + '\n🎵 *[Audio - failed to download]*');
        }
    }

    /**
     * Log Telegram message to file
     */
    logTelegramMessage(message, guildId) {
        try {
            const logData = {
                id: message.message_id,
                telegramChannelId: message.chat.id.toString(),
                guildId: guildId,
                author: {
                    telegramUserId: message.from.id,
                    username: message.from.username || null,
                    firstName: message.from.first_name,
                    lastName: message.from.last_name || null
                },
                content: message.text || '[Media]',
                timestamp: new Date(message.date * 1000).toISOString(),
                forwarded: true
            };

            // Load existing messages
            let messagesData = { messages: [] };
            if (fs.existsSync(this.messagesPath)) {
                const data = fs.readFileSync(this.messagesPath, 'utf8');
                messagesData = JSON.parse(data);
            }

            // Add new message
            messagesData.messages.push(logData);
            messagesData.lastUpdated = new Date().toISOString();

            // Keep only last 1000 messages to prevent file from growing too large
            if (messagesData.messages.length > 1000) {
                messagesData.messages = messagesData.messages.slice(-1000);
            }

            // Save to file
            fs.writeFileSync(this.messagesPath, JSON.stringify(messagesData, null, 2));

        } catch (error) {
            console.error('Error logging Telegram message:', error.message);
        }
    }

    /**
     * Start connection monitoring with heartbeat
     */
    startConnectionMonitoring() {
        // Clear existing interval
        if (this.connectionMonitor.heartbeatInterval) {
            clearInterval(this.connectionMonitor.heartbeatInterval);
        }

        // Start heartbeat monitoring
        this.connectionMonitor.heartbeatInterval = setInterval(async () => {
            await this.performHealthCheck();
        }, 60000); // Check every minute

        console.log('✅ Connection monitoring started');
    }

    /**
     * Perform health check on Telegram connection
     */
    async performHealthCheck() {
        if (!this.bot || !this.isConnected) {
            return;
        }

        try {
            // Simple API call to check if bot is responsive
            await this.bot.getMe();
            this.connectionMonitor.lastHeartbeat = Date.now();
            
            // Reset reconnection attempts on successful heartbeat
            if (this.connectionMonitor.reconnectAttempts > 0) {
                console.log('✅ Telegram connection restored');
                this.connectionMonitor.reconnectAttempts = 0;
                this.connectionMonitor.reconnectDelay = 5000; // Reset delay
            }
            
        } catch (error) {
            console.warn('Telegram heartbeat failed:', error.message);
            this.trackError(error, 'heartbeat');
            await this.handleConnectionFailure();
        }
    }

    /**
     * Track errors for monitoring and debugging
     */
    trackError(error, context = 'unknown') {
        this.errorStats.totalErrors++;
        this.errorStats.lastError = {
            message: error.message,
            context: context,
            timestamp: new Date().toISOString(),
            code: error.code || null,
            statusCode: error.response?.statusCode || null
        };

        // Categorize errors
        if (error.response?.statusCode === 429) {
            this.errorStats.rateLimitErrors++;
        } else if (error.code === 'ETELEGRAM' || error.message.includes('network')) {
            this.errorStats.networkErrors++;
        } else if (error.response?.statusCode === 401 || error.response?.statusCode === 403) {
            this.errorStats.authErrors++;
        }

        // Keep error history (last 50 errors)
        this.errorStats.errorHistory.push(this.errorStats.lastError);
        if (this.errorStats.errorHistory.length > 50) {
            this.errorStats.errorHistory.shift();
        }

        console.error(`Telegram error [${context}]:`, error.message);
    }

    /**
     * Handle connection failures with exponential backoff
     */
    async handleConnectionFailure() {
        if (this.connectionMonitor.isReconnecting) {
            return; // Already attempting reconnection
        }

        console.warn('Telegram connection failed, scheduling reconnection...');
        this.isConnected = false;
        this.scheduleReconnection();
    }

    /**
     * Schedule reconnection with exponential backoff
     */
    scheduleReconnection() {
        if (this.connectionMonitor.isReconnecting) {
            return;
        }

        if (this.connectionMonitor.reconnectAttempts >= this.connectionMonitor.maxReconnectAttempts) {
            console.error('Max reconnection attempts reached. Manual intervention required.');
            this.notifyReconnectionFailure();
            return;
        }

        this.connectionMonitor.isReconnecting = true;
        this.connectionMonitor.reconnectAttempts++;

        const delay = Math.min(
            this.connectionMonitor.reconnectDelay * Math.pow(2, this.connectionMonitor.reconnectAttempts - 1),
            this.connectionMonitor.maxReconnectDelay
        );

        console.log(`Scheduling reconnection attempt ${this.connectionMonitor.reconnectAttempts}/${this.connectionMonitor.maxReconnectAttempts} in ${delay / 1000} seconds`);

        setTimeout(async () => {
            await this.attemptReconnection();
        }, delay);
    }

    /**
     * Attempt to reconnect to Telegram
     */
    async attemptReconnection() {
        try {
            console.log(`Attempting Telegram reconnection (${this.connectionMonitor.reconnectAttempts}/${this.connectionMonitor.maxReconnectAttempts})...`);
            
            // Stop existing bot if running
            if (this.bot) {
                try {
                    await this.bot.stopPolling();
                } catch (error) {
                    // Ignore errors when stopping
                }
            }

            // Reinitialize the bot
            await this.initializeBot();

            if (this.isConnected) {
                console.log('✅ Telegram reconnection successful');
                this.connectionMonitor.isReconnecting = false;
                this.connectionMonitor.reconnectAttempts = 0;
                this.connectionMonitor.reconnectDelay = 5000; // Reset delay
                
                // Notify about successful reconnection
                await this.notifyReconnectionSuccess();
            } else {
                throw new Error('Reconnection failed - bot not connected');
            }

        } catch (error) {
            console.error(`Reconnection attempt ${this.connectionMonitor.reconnectAttempts} failed:`, error.message);
            this.trackError(error, 'reconnection');
            this.connectionMonitor.isReconnecting = false;
            
            // Schedule next attempt
            this.scheduleReconnection();
        }
    }

    /**
     * Notify about successful reconnection
     */
    async notifyReconnectionSuccess() {
        // Send notification to all configured guilds
        const config = this.loadConfig();
        for (const [guildId, guildConfig] of Object.entries(config.guilds)) {
            if (guildConfig.enabled && guildConfig.notificationTypes?.status) {
                await this.sendNotification(guildId, {
                    status: 'Reconnected',
                    message: 'Telegram connection restored successfully',
                    attempts: this.connectionMonitor.reconnectAttempts,
                    downtime: this.calculateDowntime()
                }, 'normal', 'status');
            }
        }
    }

    /**
     * Notify about reconnection failure
     */
    async notifyReconnectionFailure() {
        // Try to send notifications through Discord directly if possible
        if (this.discordClient) {
            const config = this.loadConfig();
            for (const [guildId, guildConfig] of Object.entries(config.guilds)) {
                if (guildConfig.enabled && guildConfig.discordChannelId) {
                    try {
                        const guild = this.discordClient.guilds.cache.get(guildId);
                        const channel = guild?.channels.cache.get(guildConfig.discordChannelId);
                        
                        if (channel) {
                            const embed = new EmbedBuilder()
                                .setColor('#ff0000')
                                .setTitle('🚨 Telegram Connection Failed')
                                .setDescription('Unable to reconnect to Telegram after multiple attempts.')
                                .addFields(
                                    { name: 'Attempts', value: `${this.connectionMonitor.maxReconnectAttempts}`, inline: true },
                                    { name: 'Last Error', value: this.errorStats.lastError?.message || 'Unknown', inline: true },
                                    { name: 'Action Required', value: 'Manual intervention needed', inline: true }
                                )
                                .setTimestamp();

                            await channel.send({ embeds: [embed] });
                        }
                    } catch (error) {
                        console.error('Failed to send reconnection failure notification:', error.message);
                    }
                }
            }
        }
    }

    /**
     * Calculate downtime duration
     */
    calculateDowntime() {
        const now = Date.now();
        const downtime = now - this.connectionMonitor.lastHeartbeat;
        const minutes = Math.floor(downtime / 60000);
        const seconds = Math.floor((downtime % 60000) / 1000);
        return `${minutes}m ${seconds}s`;
    }

    /**
     * Enhanced message queue processing with retry logic
     */
    startMessageProcessor() {
        setInterval(async () => {
            if (this.messageQueue.length === 0 || !this.isConnected) {
                return;
            }
            
            const message = this.messageQueue.shift();
            
            try {
                const success = await this.sendNotification(
                    message.guildId, 
                    message.message, 
                    message.priority, 
                    message.eventType
                );
                
                if (!success && message.retries < this.maxRetries) {
                    message.retries++;
                    
                    // Add exponential backoff for retries
                    const delay = Math.min(1000 * Math.pow(2, message.retries), 30000);
                    setTimeout(() => {
                        this.messageQueue.push(message);
                    }, delay);
                    
                    console.log(`Retrying message for guild ${message.guildId}, attempt ${message.retries}/${this.maxRetries} (delay: ${delay}ms)`);
                } else if (!success) {
                    console.error(`Failed to send message after ${this.maxRetries} attempts, dropping message`);
                    this.logFailedMessage(message);
                }
                
            } catch (error) {
                this.trackError(error, 'message_processing');
                
                if (message.retries < this.maxRetries) {
                    message.retries++;
                    this.messageQueue.push(message);
                } else {
                    this.logFailedMessage(message);
                }
            }
            
        }, this.retryDelay);
    }

    /**
     * Log failed messages for debugging
     */
    logFailedMessage(message) {
        try {
            const failedMessagesPath = path.join(process.cwd(), 'data', 'telegram_failed_messages.json');
            let failedMessages = { messages: [] };
            
            if (fs.existsSync(failedMessagesPath)) {
                const data = fs.readFileSync(failedMessagesPath, 'utf8');
                failedMessages = JSON.parse(data);
            }
            
            failedMessages.messages.push({
                ...message,
                failedAt: new Date().toISOString(),
                lastError: this.errorStats.lastError
            });
            
            // Keep only last 100 failed messages
            if (failedMessages.messages.length > 100) {
                failedMessages.messages = failedMessages.messages.slice(-100);
            }
            
            fs.writeFileSync(failedMessagesPath, JSON.stringify(failedMessages, null, 2));
            
        } catch (error) {
            console.error('Failed to log failed message:', error.message);
        }
    }

    /**
     * Enhanced rate limiting with burst handling
     */
    checkRateLimit() {
        const now = Date.now();
        
        // Remove old messages outside the time window
        this.rateLimiter.messages = this.rateLimiter.messages.filter(
            timestamp => now - timestamp < this.rateLimiter.timeWindow
        );
        
        // Check if we're under the limit
        if (this.rateLimiter.messages.length >= this.rateLimiter.maxMessages) {
            console.warn('Telegram rate limit reached, queuing message');
            return false;
        }
        
        // Add current message timestamp
        this.rateLimiter.messages.push(now);
        return true;
    }

    /**
     * Enhanced error checking for retryable errors
     */
    isRetryableError(error) {
        const retryableCodes = [429, 500, 502, 503, 504]; // Rate limit, server errors
        const retryableMessages = ['network', 'timeout', 'ECONNRESET', 'ENOTFOUND', 'ETIMEDOUT'];
        
        // Check status codes
        if (retryableCodes.includes(error.response?.statusCode)) {
            return true;
        }
        
        // Check error codes and messages
        if (error.code === 'ETELEGRAM' || 
            retryableMessages.some(msg => error.message.toLowerCase().includes(msg))) {
            return true;
        }
        
        // Don't retry authentication errors
        if (error.response?.statusCode === 401 || error.response?.statusCode === 403) {
            return false;
        }
        
        return false;
    }

    /**
     * Shutdown the integration
     */
    async shutdown() {
        console.log('Shutting down Telegram integration...');
        this.isConnected = false;
        this.connectionMonitor.isReconnecting = false;
        
        // Stop connection monitoring
        if (this.connectionMonitor.heartbeatInterval) {
            clearInterval(this.connectionMonitor.heartbeatInterval);
            this.connectionMonitor.heartbeatInterval = null;
        }
        
        // Stop Telegram bot
        if (this.bot) {
            try {
                await this.bot.stopPolling();
            } catch (error) {
                console.error('Error stopping Telegram bot:', error);
            }
        }
        
        // Save any remaining queued messages
        if (this.messageQueue.length > 0) {
            console.log(`Saving ${this.messageQueue.length} queued messages...`);
            try {
                const queuePath = path.join(process.cwd(), 'data', 'telegram_message_queue.json');
                fs.writeFileSync(queuePath, JSON.stringify({
                    messages: this.messageQueue,
                    savedAt: new Date().toISOString()
                }, null, 2));
                console.log('Message queue saved to disk');
            } catch (error) {
                console.error('Failed to save message queue:', error.message);
            }
        }
        
        console.log('Telegram integration shutdown complete');
    }
}

export default TelegramIntegration;