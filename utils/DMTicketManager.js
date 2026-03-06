import fs from 'fs';
import path from 'path';
import { EmbedBuilder, ChannelType, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';

export class DMTicketManager {
    constructor(client, guildConfig) {
        this.client = client;
        this.guildConfig = guildConfig;
        this.filePath = path.join(process.cwd(), 'data/tickets.json');
        this.tickets = this.loadTickets();
        this.activeQuestions = new Map(); // Track ongoing questionnaires
        this.processedMessages = new Set(); // Prevent duplicate processing of the same message
        this.supportServerId = null;
        
        // Question flow configuration
        this.questionFlow = {
            category: {
                question: "What type of issue are you experiencing?",
                options: {
                    "1": "Technical Issue",
                    "2": "Moderation Issue", 
                    "3": "General Support",
                    "4": "Report User/Content"
                }
            },
            priority: {
                question: "How urgent is this issue?",
                options: {
                    "1": "Low - Can wait a few days",
                    "2": "Medium - Should be addressed within 24 hours",
                    "3": "High - Needs attention within a few hours", 
                    "4": "Urgent - Immediate attention required"
                }
            },
            description: {
                question: "Please provide a detailed description of your issue:"
            },
            serverContext: {
                question: "Which server is this related to? (Please provide server name or ID, or type 'none' if not server-specific)"
            },
            previousAttempts: {
                question: "Have you tried to resolve this issue before? If yes, please describe what you tried:"
            }
        };
        
        this.ensureFileExists();
    }

    /**
     * Ensures the tickets file exists
     */
    ensureFileExists() {
        try {
            const dir = path.dirname(this.filePath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            if (!fs.existsSync(this.filePath)) {
                const defaultData = this.getDefaultTicketData();
                fs.writeFileSync(this.filePath, JSON.stringify(defaultData, null, 2), 'utf-8');
                console.log(`Created tickets file: ${this.filePath}`);
            }
        } catch (error) {
            console.error('Error ensuring tickets file exists:', error);
            throw new Error(`Failed to ensure tickets file exists: ${error.message}`);
        }
    }

    /**
     * Gets default ticket data structure
     */
    getDefaultTicketData() {
        return {
            _metadata: {
                version: '1.0',
                created: new Date().toISOString(),
                lastModified: new Date().toISOString()
            },
            _settings: {
                supportServerId: null,
                ticketCounter: 0
            },
            tickets: {},
            userTickets: {}
        };
    }

    /**
     * Loads tickets from file
     */
    loadTickets() {
        try {
            if (fs.existsSync(this.filePath)) {
                const data = fs.readFileSync(this.filePath, 'utf-8');
                const parsed = JSON.parse(data);
                
                // Migrate old format if needed
                if (!parsed._metadata) {
                    return this.migrateTicketData(parsed);
                }
                
                return parsed;
            }
        } catch (error) {
            console.error('Error loading tickets:', error);
        }
        return this.getDefaultTicketData();
    }

    /**
     * Migrates old ticket data format to new format
     */
    migrateTicketData(oldData) {
        const newData = this.getDefaultTicketData();
        
        // If old data has tickets, migrate them
        if (oldData.tickets) {
            newData.tickets = oldData.tickets;
        }
        if (oldData.userTickets) {
            newData.userTickets = oldData.userTickets;
        }
        
        console.log('Migrated ticket data to new format');
        this.saveTickets(newData);
        return newData;
    }

    /**
     * Saves tickets to file
     */
    saveTickets(data = this.tickets) {
        try {
            if (!data._metadata) {
                data._metadata = this.getDefaultTicketData()._metadata;
            }
            data._metadata.lastModified = new Date().toISOString();
            
            fs.writeFileSync(this.filePath, JSON.stringify(data, null, 2), 'utf-8');
            this.tickets = data;
        } catch (error) {
            console.error('Error saving tickets:', error);
            throw error;
        }
    }

    /**
     * Sets the support server ID
     */
    setSupportServer(guildId) {
        this.supportServerId = guildId;
        this.tickets._settings.supportServerId = guildId;
        this.saveTickets();
        console.log(`Support server set to: ${guildId}`);
    }

    /**
     * Gets the support server ID
     */
    getSupportServer() {
        return this.supportServerId || this.tickets._settings?.supportServerId;
    }

    /**
     * Generates a unique ticket ID
     */
    generateTicketId() {
        this.tickets._settings.ticketCounter = (this.tickets._settings.ticketCounter || 0) + 1;
        return `ticket-${this.tickets._settings.ticketCounter.toString().padStart(6, '0')}`;
    }

    /**
     * Starts the interactive ticket creation process with enhanced error handling
     */
    async createTicket(user, initialMessage = null) {
        try {
            // Check if user DMs are disabled
            const dmCheckResult = await this.checkUserDMAvailability(user);
            if (!dmCheckResult.available) {
                return await this.handleDisabledDMs(user, initialMessage, dmCheckResult.reason);
            }

            // Check if user already has an active ticket
            const existingTicket = this.getActiveTickets(user.id);
            if (existingTicket.length > 0) {
                const ticket = existingTicket[0];
                const embed = new EmbedBuilder()
                    .setColor('#FFA500')
                    .setTitle('🎫 Existing Ticket Found')
                    .setDescription(`You already have an active ticket: **${ticket.id}**`)
                    .addFields(
                        { name: 'Created', value: new Date(ticket.createdAt).toLocaleString(), inline: true },
                        { name: 'Status', value: ticket.status, inline: true }
                    )
                    .setFooter({ text: 'Your message will be added to the existing ticket.' });

                await this.sendMessageWithRetry(user, { embeds: [embed] });
                
                // Add message to existing ticket if provided
                if (initialMessage) {
                    await this.relayMessage('user', ticket, initialMessage, user);
                }
                
                return { success: true, ticketId: ticket.id, isNew: false };
            }

            // Check support server availability
            const supportServerCheck = await this.checkSupportServerAvailability();
            if (!supportServerCheck.available) {
                return await this.queueTicketForLater(user, initialMessage, supportServerCheck.reason);
            }

            // Start interactive questionnaire
            const questionnaire = {
                userId: user.id,
                ticketId: null,
                currentStep: 'category',
                responses: {},
                startedAt: new Date().toISOString(),
                retryCount: 0
            };

            if (initialMessage) {
                questionnaire.responses.initialMessage = initialMessage;
            }

            this.activeQuestions.set(user.id, questionnaire);

            // Send welcome message and first question
            const welcomeEmbed = new EmbedBuilder()
                .setColor('#0099ff')
                .setTitle('🎫 Support Ticket Creation')
                .setDescription('Welcome! I\'ll help you create a support ticket. Please answer a few questions to ensure your issue gets proper attention.')
                .setFooter({ text: 'You can type "cancel" at any time to stop the process.' });

            await this.sendMessageWithRetry(user, { embeds: [welcomeEmbed] });
            await this.askQuestion(user, 'category');

            return { success: true, ticketId: null, isNew: true, inProgress: true };

        } catch (error) {
            console.error('Error creating ticket:', error);
            await this.logTicketError('createTicket', error, { userId: user.id, initialMessage });
            
            return await this.handleTicketCreationError(user, error);
        }
    }

    /**
     * Asks a question in the questionnaire flow
     */
    async askQuestion(user, step) {
        const questionConfig = this.questionFlow[step];
        if (!questionConfig) {
            console.error(`Unknown question step: ${step}`);
            return;
        }

        const embed = new EmbedBuilder()
            .setColor('#0099ff')
            .setTitle(`Question ${this.getStepNumber(step)} of 5`)
            .setDescription(questionConfig.question);

        // Add options if they exist
        if (questionConfig.options) {
            const optionsText = Object.entries(questionConfig.options)
                .map(([key, value]) => `**${key}.** ${value}`)
                .join('\n');
            embed.addFields({ name: 'Options', value: optionsText });
        }

        embed.setFooter({ text: 'Type your response below, or "cancel" to stop.' });

        await user.send({ embeds: [embed] });
    }

    /**
     * Gets the step number for display
     */
    getStepNumber(step) {
        const steps = ['category', 'priority', 'description', 'serverContext', 'previousAttempts'];
        return steps.indexOf(step) + 1;
    }

    /**
     * Processes a user's response to the questionnaire
     */
    async processQuestionnaireResponse(user, message) {
        const questionnaire = this.activeQuestions.get(user.id);
        if (!questionnaire) {
            return false; // No active questionnaire
        }

        const content = message.content.trim();

        // Handle cancellation
        if (content.toLowerCase() === 'cancel') {
            this.activeQuestions.delete(user.id);
            
            const cancelEmbed = new EmbedBuilder()
                .setColor('#ff9900')
                .setTitle('🚫 Ticket Creation Cancelled')
                .setDescription('Your ticket creation has been cancelled. You can start a new ticket anytime by sending me a message.');

            await user.send({ embeds: [cancelEmbed] });
            return true;
        }

        // Process the response based on current step
        const currentStep = questionnaire.currentStep;
        const questionConfig = this.questionFlow[currentStep];

        // Validate response
        const validation = this.validateResponse(currentStep, content, questionConfig);
        if (!validation.isValid) {
            const errorEmbed = new EmbedBuilder()
                .setColor('#ff0000')
                .setTitle('❌ Invalid Response')
                .setDescription(validation.error)
                .setFooter({ text: 'Please try again.' });

            await user.send({ embeds: [errorEmbed] });
            return true;
        }

        // Store the response
        questionnaire.responses[currentStep] = validation.value;

        // Move to next step
        const nextStep = this.getNextStep(currentStep);
        if (nextStep) {
            questionnaire.currentStep = nextStep;
            await this.askQuestion(user, nextStep);
        } else {
            // All questions answered, create the ticket
            await this.finalizeTicket(user, questionnaire);
        }

        return true;
    }

    /**
     * Validates a user's response
     */
    validateResponse(step, content, questionConfig) {
        if (!content || content.length === 0) {
            return { isValid: false, error: 'Response cannot be empty.' };
        }

        switch (step) {
            case 'category':
            case 'priority':
                if (questionConfig.options) {
                    if (!questionConfig.options[content]) {
                        const validOptions = Object.keys(questionConfig.options).join(', ');
                        return { 
                            isValid: false, 
                            error: `Please choose a valid option: ${validOptions}` 
                        };
                    }
                    return { 
                        isValid: true, 
                        value: {
                            key: content,
                            label: questionConfig.options[content]
                        }
                    };
                }
                break;

            case 'description':
                if (content.length < 10) {
                    return { 
                        isValid: false, 
                        error: 'Please provide a more detailed description (at least 10 characters).' 
                    };
                }
                if (content.length > 2000) {
                    return { 
                        isValid: false, 
                        error: 'Description is too long (maximum 2000 characters).' 
                    };
                }
                return { isValid: true, value: content };

            case 'serverContext':
            case 'previousAttempts':
                if (content.length > 1000) {
                    return { 
                        isValid: false, 
                        error: 'Response is too long (maximum 1000 characters).' 
                    };
                }
                return { isValid: true, value: content };

            default:
                return { isValid: true, value: content };
        }
    }

    /**
     * Gets the next step in the questionnaire
     */
    getNextStep(currentStep) {
        const steps = ['category', 'priority', 'description', 'serverContext', 'previousAttempts'];
        const currentIndex = steps.indexOf(currentStep);
        return currentIndex < steps.length - 1 ? steps[currentIndex + 1] : null;
    }

    /**
     * Finalizes the ticket creation after all questions are answered
     */
    async finalizeTicket(user, questionnaire) {
        try {
            const ticketId = this.generateTicketId();
            const supportServerId = this.getSupportServer();

            if (!supportServerId) {
                throw new Error('No support server configured');
            }

            // Try to determine source guild from user's mutual guilds
            let sourceGuild = null;
            const mutualGuilds = this.client.guilds.cache.filter(guild => 
                guild.members.cache.has(user.id) && guild.id !== supportServerId
            );
            
            if (mutualGuilds.size === 1) {
                sourceGuild = mutualGuilds.first().id;
            } else if (mutualGuilds.size > 1) {
                // If multiple guilds, try to use the one from server context response
                const serverContext = questionnaire.responses.serverContext;
                if (serverContext && serverContext !== 'none') {
                    const matchingGuild = mutualGuilds.find(guild => 
                        guild.name.toLowerCase().includes(serverContext.toLowerCase()) ||
                        guild.id === serverContext
                    );
                    if (matchingGuild) {
                        sourceGuild = matchingGuild.id;
                    }
                }
            }

            // Create ticket data
            const ticketData = {
                id: ticketId,
                userId: user.id,
                username: user.username,
                discriminator: user.discriminator || '0',
                supportChannelId: null,
                status: 'open',
                createdAt: new Date().toISOString(),
                closedAt: null,
                closedBy: null,
                closeReason: null,
                messageCount: 0,
                sourceGuild: sourceGuild,
                responses: questionnaire.responses
            };

            // Create support channel
            const supportChannel = await this.createSupportChannel(ticketId, user, ticketData);
            if (supportChannel) {
                ticketData.supportChannelId = supportChannel.id;
            }

            // Save ticket
            this.tickets.tickets[ticketId] = ticketData;
            
            if (!this.tickets.userTickets[user.id]) {
                this.tickets.userTickets[user.id] = [];
            }
            this.tickets.userTickets[user.id].push(ticketId);
            
            this.saveTickets();

            // Clean up questionnaire
            this.activeQuestions.delete(user.id);

            // Send confirmation to user
            const confirmEmbed = new EmbedBuilder()
                .setColor('#00ff00')
                .setTitle('✅ Ticket Created Successfully')
                .setDescription(`Your support ticket **${ticketId}** has been created!`)
                .addFields(
                    { name: 'Issue Type', value: ticketData.responses.category.label, inline: true },
                    { name: 'Priority', value: ticketData.responses.priority.label, inline: true },
                    { name: 'Status', value: 'Open', inline: true }
                )
                .setFooter({ text: 'Our support team will respond as soon as possible.' });

            await user.send({ embeds: [confirmEmbed] });

            // Send initial message to support channel if there was one
            if (questionnaire.responses.initialMessage && supportChannel) {
                await this.relayMessage('user', ticketData, questionnaire.responses.initialMessage, user);
            }

            console.log(`Ticket ${ticketId} created for user ${user.tag} (${user.id})`);
            return { success: true, ticketId, ticket: ticketData };

        } catch (error) {
            console.error('Error finalizing ticket:', error);
            
            // Clean up questionnaire on error
            this.activeQuestions.delete(user.id);
            
            const errorEmbed = new EmbedBuilder()
                .setColor('#ff0000')
                .setTitle('❌ Error Creating Ticket')
                .setDescription('Sorry, there was an error creating your ticket. Please try again later.')
                .setFooter({ text: 'Error: ' + error.message });

            await user.send({ embeds: [errorEmbed] });
            return { success: false, error: error.message };
        }
    }

    /**
     * Creates a support channel for the ticket with retry logic
     */
    async createSupportChannel(ticketId, user, ticketData, retryCount = 0) {
        const maxRetries = 3;
        const retryDelay = 1000 * (retryCount + 1); // Exponential backoff

        try {
            const supportServerId = this.getSupportServer();
            if (!supportServerId) {
                throw new Error('No support server configured');
            }

            const supportGuild = this.client.guilds.cache.get(supportServerId);
            if (!supportGuild) {
                throw new Error(`Support server not found: ${supportServerId}`);
            }

            // Check bot permissions in support guild
            const botMember = supportGuild.members.cache.get(this.client.user.id);
            if (!botMember) {
                throw new Error('Bot is not a member of the support server');
            }

            const requiredPermissions = [
                PermissionFlagsBits.ManageChannels,
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.SendMessages
            ];

            const missingPermissions = requiredPermissions.filter(
                perm => !botMember.permissions.has(perm)
            );

            if (missingPermissions.length > 0) {
                throw new Error(`Bot missing required permissions in support server: ${missingPermissions.join(', ')}`);
            }

            // Find or create 'Tickets' category
            let ticketCategory = supportGuild.channels.cache.find(c => c.type === ChannelType.GuildCategory && (c.name.toLowerCase() === 'tickets' || c.name.toLowerCase() === 'support'));
            
            if (!ticketCategory) {
                ticketCategory = await supportGuild.channels.create({
                    name: 'Tickets',
                    type: ChannelType.GuildCategory,
                    permissionOverwrites: [
                        {
                            id: supportGuild.roles.everyone.id,
                            deny: [PermissionFlagsBits.ViewChannel]
                        }
                    ]
                });
            }

            // Create the channel with enhanced permissions
            const channel = await supportGuild.channels.create({
                name: `ticket-${ticketId}`,
                type: ChannelType.GuildText,
                parent: ticketCategory.id,
                topic: `Support ticket for ${user.tag} (${user.id}) | Source: ${ticketData.sourceGuild || 'Unknown'}`,
                permissionOverwrites: [
                    {
                        id: supportGuild.roles.everyone.id,
                        deny: [PermissionFlagsBits.ViewChannel]
                    },
                    {
                        id: this.client.user.id,
                        allow: [
                            PermissionFlagsBits.ViewChannel,
                            PermissionFlagsBits.SendMessages,
                            PermissionFlagsBits.ManageMessages,
                            PermissionFlagsBits.EmbedLinks,
                            PermissionFlagsBits.AttachFiles
                        ]
                    }
                ]
            });

            // Add moderator roles if they exist
            const moderatorRoles = ['Moderator', 'Admin', 'Support'];
            for (const roleName of moderatorRoles) {
                const role = supportGuild.roles.cache.find(r => r.name === roleName);
                if (role) {
                    await channel.permissionOverwrites.create(role, {
                        ViewChannel: true,
                        SendMessages: true,
                        ReadMessageHistory: true
                    });
                }
            }

            // Send ticket information to the support channel
            const ticketEmbed = new EmbedBuilder()
                .setColor('#0099ff')
                .setTitle(`🎫 New Support Ticket: ${ticketId}`)
                .setDescription(`Ticket created by ${user.tag} (${user.id})`)
                .addFields(
                    { name: 'Issue Category', value: ticketData.responses.category.label, inline: true },
                    { name: 'Priority', value: ticketData.responses.priority.label, inline: true },
                    { name: 'Created', value: new Date(ticketData.createdAt).toLocaleString(), inline: true },
                    { name: 'Source Server', value: ticketData.sourceGuild || 'Unknown', inline: true },
                    { name: 'Server Context', value: ticketData.responses.serverContext || 'None specified', inline: false },
                    { name: 'Description', value: ticketData.responses.description, inline: false },
                    { name: 'Previous Attempts', value: ticketData.responses.previousAttempts || 'None specified', inline: false }
                )
                .setThumbnail(user.displayAvatarURL({ dynamic: true }))
                .setFooter({ text: `Respond in this channel to reply to the user | Close with /close-ticket ${ticketId}` })
                .setTimestamp();

            await channel.send({ embeds: [ticketEmbed] });

            console.log(`Support channel created: ${channel.name} (${channel.id}) for ticket ${ticketId}`);
            return channel;

        } catch (error) {
            console.error(`Error creating support channel (attempt ${retryCount + 1}):`, error);
            
            if (retryCount < maxRetries) {
                console.log(`Retrying support channel creation in ${retryDelay}ms...`);
                await new Promise(resolve => setTimeout(resolve, retryDelay));
                return this.createSupportChannel(ticketId, user, ticketData, retryCount + 1);
            }
            
            throw error;
        }
    }

    /**
     * Gets active tickets for a user
     */
    getActiveTickets(userId) {
        const userTicketIds = this.tickets.userTickets[userId] || [];
        return userTicketIds
            .map(ticketId => this.tickets.tickets[ticketId])
            .filter(ticket => ticket && ticket.status === 'open');
    }

    /**
     * Gets ticket history for a user with enhanced filtering
     */
    getTicketHistory(userId, options = {}) {
        const userTicketIds = this.tickets.userTickets[userId] || [];
        let tickets = userTicketIds
            .map(ticketId => this.tickets.tickets[ticketId])
            .filter(ticket => ticket);

        // Apply filters
        if (options.status) {
            tickets = tickets.filter(ticket => ticket.status === options.status);
        }

        if (options.includeArchived && this.tickets._archive) {
            const archivedTickets = userTicketIds
                .map(ticketId => this.tickets._archive[ticketId])
                .filter(ticket => ticket);
            tickets = tickets.concat(archivedTickets);
        }

        if (options.category) {
            tickets = tickets.filter(ticket => 
                ticket.responses && 
                ticket.responses.category && 
                ticket.responses.category.key === options.category
            );
        }

        if (options.priority) {
            tickets = tickets.filter(ticket => 
                ticket.responses && 
                ticket.responses.priority && 
                ticket.responses.priority.key === options.priority
            );
        }

        if (options.dateFrom) {
            const fromDate = new Date(options.dateFrom);
            tickets = tickets.filter(ticket => new Date(ticket.createdAt) >= fromDate);
        }

        if (options.dateTo) {
            const toDate = new Date(options.dateTo);
            tickets = tickets.filter(ticket => new Date(ticket.createdAt) <= toDate);
        }

        // Sort by creation date (newest first)
        return tickets.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    }

    /**
     * Updates ticket status with state tracking
     */
    async updateTicketStatus(ticketId, newStatus, moderator = null, reason = null) {
        try {
            const ticket = this.tickets.tickets[ticketId];
            if (!ticket) {
                throw new Error(`Ticket ${ticketId} not found`);
            }

            const oldStatus = ticket.status;
            
            // Initialize status history if it doesn't exist
            if (!ticket.statusHistory) {
                ticket.statusHistory = [{
                    status: 'open',
                    timestamp: ticket.createdAt,
                    moderator: null,
                    reason: 'Ticket created'
                }];
            }

            // Add status change to history
            ticket.statusHistory.push({
                status: newStatus,
                timestamp: new Date().toISOString(),
                moderator: moderator ? {
                    id: moderator.id,
                    username: moderator.username,
                    tag: moderator.tag
                } : null,
                reason: reason || `Status changed from ${oldStatus} to ${newStatus}`
            });

            // Update current status
            ticket.status = newStatus;
            ticket.lastModified = new Date().toISOString();

            // Handle specific status changes
            switch (newStatus) {
                case 'closed':
                    ticket.closedAt = new Date().toISOString();
                    ticket.closedBy = moderator?.id || null;
                    ticket.closeReason = reason;
                    break;
                
                case 'reopened':
                    ticket.closedAt = null;
                    ticket.closedBy = null;
                    ticket.closeReason = null;
                    break;
                
                case 'escalated':
                    ticket.escalatedAt = new Date().toISOString();
                    ticket.escalatedBy = moderator?.id || null;
                    break;
            }

            this.saveTickets();
            console.log(`Ticket ${ticketId} status updated from ${oldStatus} to ${newStatus}`);
            
            return { success: true, oldStatus, newStatus, ticket };

        } catch (error) {
            console.error(`Error updating ticket status for ${ticketId}:`, error);
            throw error;
        }
    }

    /**
     * Searches tickets with advanced filtering and text search
     */
    searchTickets(searchOptions = {}) {
        try {
            let allTickets = Object.values(this.tickets.tickets);
            
            // Include archived tickets if requested
            if (searchOptions.includeArchived && this.tickets._archive) {
                allTickets = allTickets.concat(Object.values(this.tickets._archive));
            }

            let results = [...allTickets];

            // Filter by user ID
            if (searchOptions.userId) {
                results = results.filter(ticket => ticket.userId === searchOptions.userId);
            }

            // Filter by status
            if (searchOptions.status) {
                results = results.filter(ticket => ticket.status === searchOptions.status);
            }

            // Filter by category from questionnaire responses
            if (searchOptions.category) {
                results = results.filter(ticket => 
                    ticket.responses && 
                    ticket.responses.category && 
                    ticket.responses.category.key === searchOptions.category
                );
            }

            // Filter by priority from questionnaire responses
            if (searchOptions.priority) {
                results = results.filter(ticket => 
                    ticket.responses && 
                    ticket.responses.priority && 
                    ticket.responses.priority.key === searchOptions.priority
                );
            }

            // Filter by source guild
            if (searchOptions.sourceGuild) {
                results = results.filter(ticket => ticket.sourceGuild === searchOptions.sourceGuild);
            }

            // Filter by moderator who closed/handled ticket
            if (searchOptions.moderatorId) {
                results = results.filter(ticket => 
                    ticket.closedBy === searchOptions.moderatorId ||
                    (ticket.statusHistory && ticket.statusHistory.some(entry => 
                        entry.moderator && entry.moderator.id === searchOptions.moderatorId
                    ))
                );
            }

            // Date range filtering
            if (searchOptions.dateFrom) {
                const fromDate = new Date(searchOptions.dateFrom);
                results = results.filter(ticket => new Date(ticket.createdAt) >= fromDate);
            }

            if (searchOptions.dateTo) {
                const toDate = new Date(searchOptions.dateTo);
                results = results.filter(ticket => new Date(ticket.createdAt) <= toDate);
            }

            // Text search in questionnaire responses and ticket content
            if (searchOptions.searchText) {
                const searchTerm = searchOptions.searchText.toLowerCase();
                results = results.filter(ticket => {
                    // Search in questionnaire responses
                    if (ticket.responses) {
                        const responseText = Object.values(ticket.responses)
                            .map(response => {
                                if (typeof response === 'string') return response;
                                if (response && response.label) return response.label;
                                return '';
                            })
                            .join(' ')
                            .toLowerCase();
                        
                        if (responseText.includes(searchTerm)) return true;
                    }

                    // Search in ticket ID, username, close reason
                    const searchableFields = [
                        ticket.id,
                        ticket.username,
                        ticket.closeReason
                    ].filter(field => field).join(' ').toLowerCase();

                    return searchableFields.includes(searchTerm);
                });
            }

            // Sort results
            const sortBy = searchOptions.sortBy || 'createdAt';
            const sortOrder = searchOptions.sortOrder || 'desc';
            
            results.sort((a, b) => {
                let aValue = a[sortBy];
                let bValue = b[sortBy];
                
                // Handle date fields
                if (sortBy.includes('At') || sortBy === 'createdAt') {
                    aValue = new Date(aValue || 0);
                    bValue = new Date(bValue || 0);
                }
                
                if (sortOrder === 'desc') {
                    return bValue > aValue ? 1 : -1;
                } else {
                    return aValue > bValue ? 1 : -1;
                }
            });

            // Apply pagination if specified
            if (searchOptions.limit) {
                const offset = searchOptions.offset || 0;
                results = results.slice(offset, offset + searchOptions.limit);
            }

            return {
                success: true,
                results,
                total: results.length,
                searchOptions
            };

        } catch (error) {
            console.error('Error searching tickets:', error);
            return {
                success: false,
                error: error.message,
                results: [],
                total: 0
            };
        }
    }

    /**
     * Gets comprehensive ticket statistics
     */
    getTicketStatistics(options = {}) {
        try {
            let tickets = Object.values(this.tickets.tickets);
            
            if (options.includeArchived && this.tickets._archive) {
                tickets = tickets.concat(Object.values(this.tickets._archive));
            }

            // Apply date filtering if specified
            if (options.dateFrom || options.dateTo) {
                const fromDate = options.dateFrom ? new Date(options.dateFrom) : new Date(0);
                const toDate = options.dateTo ? new Date(options.dateTo) : new Date();
                
                tickets = tickets.filter(ticket => {
                    const ticketDate = new Date(ticket.createdAt);
                    return ticketDate >= fromDate && ticketDate <= toDate;
                });
            }

            const stats = {
                total: tickets.length,
                byStatus: {},
                byCategory: {},
                byPriority: {},
                bySourceGuild: {},
                averageResponseTime: 0,
                averageDuration: 0,
                totalMessages: 0
            };

            let totalResponseTime = 0;
            let totalDuration = 0;
            let responseTimeCount = 0;
            let durationCount = 0;

            tickets.forEach(ticket => {
                // Count by status
                stats.byStatus[ticket.status] = (stats.byStatus[ticket.status] || 0) + 1;

                // Count by category from questionnaire
                if (ticket.responses && ticket.responses.category) {
                    const category = ticket.responses.category.label || ticket.responses.category.key;
                    stats.byCategory[category] = (stats.byCategory[category] || 0) + 1;
                }

                // Count by priority from questionnaire
                if (ticket.responses && ticket.responses.priority) {
                    const priority = ticket.responses.priority.label || ticket.responses.priority.key;
                    stats.byPriority[priority] = (stats.byPriority[priority] || 0) + 1;
                }

                // Count by source guild
                if (ticket.sourceGuild) {
                    stats.bySourceGuild[ticket.sourceGuild] = (stats.bySourceGuild[ticket.sourceGuild] || 0) + 1;
                }

                // Accumulate response time and duration
                if (ticket.statistics) {
                    if (ticket.statistics.responseTime > 0) {
                        totalResponseTime += ticket.statistics.responseTime;
                        responseTimeCount++;
                    }
                    if (ticket.statistics.duration > 0) {
                        totalDuration += ticket.statistics.duration;
                        durationCount++;
                    }
                }

                // Count messages
                stats.totalMessages += ticket.messageCount || 0;
            });

            // Calculate averages
            stats.averageResponseTime = responseTimeCount > 0 ? 
                Math.round(totalResponseTime / responseTimeCount) : 0;
            stats.averageDuration = durationCount > 0 ? 
                Math.round(totalDuration / durationCount) : 0;

            return {
                success: true,
                statistics: stats,
                generatedAt: new Date().toISOString()
            };

        } catch (error) {
            console.error('Error generating ticket statistics:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Relays a message between user DM and support channel with enhanced error handling
     */
    async relayMessage(source, ticket, content, user = null, moderator = null, retryCount = 0) {
        const maxRetries = 3;
        const retryDelay = 1000 * (retryCount + 1);

        try {
            if (source === 'user') {
                // Message from user to support channel
                const supportChannel = this.client.channels.cache.get(ticket.supportChannelId);
                if (!supportChannel) {
                    // Try to recreate the support channel if it doesn't exist
                    console.warn(`Support channel ${ticket.supportChannelId} not found for ticket ${ticket.id}, attempting to recreate`);
                    const newChannel = await this.recreateSupportChannel(ticket, user);
                    if (newChannel) {
                        ticket.supportChannelId = newChannel.id;
                        this.saveTickets();
                    } else {
                        throw new Error(`Support channel not found and could not be recreated: ${ticket.supportChannelId}`);
                    }
                }

                const embed = new EmbedBuilder()
                    .setColor('#0099ff')
                    .setAuthor({ 
                        name: `${user.tag} (User)`, 
                        iconURL: user.displayAvatarURL({ dynamic: true }) 
                    })
                    .setDescription(content)
                    .addFields(
                        { name: 'Source Server', value: ticket.sourceGuild || 'Unknown', inline: true },
                        { name: 'Ticket ID', value: ticket.id, inline: true }
                    )
                    .setTimestamp();

                const finalChannel = this.client.channels.cache.get(ticket.supportChannelId);
                await this.sendMessageWithRetry(finalChannel, { embeds: [embed] });
                ticket.messageCount++;
                this.saveTickets();
                
                console.log(`Message relayed from user ${user.tag} to support channel ${finalChannel.name}`);
                
            } else if (source === 'support') {
                // Message from support channel to user DM
                const targetUser = this.client.users.cache.get(ticket.userId);
                if (!targetUser) {
                    // Try to fetch the user if not in cache
                    try {
                        const fetchedUser = await this.client.users.fetch(ticket.userId);
                        if (!fetchedUser) {
                            throw new Error(`Target user not found: ${ticket.userId}`);
                        }
                    } catch (fetchError) {
                        throw new Error(`Target user not found and could not be fetched: ${ticket.userId}`);
                    }
                }

                const embed = new EmbedBuilder()
                    .setColor('#00ff00')
                    .setTitle(`🎫 Support Response - ${ticket.id}`)
                    .setDescription(content);
                
                if (moderator) {
                    embed.setAuthor({
                        name: `${moderator.tag} (Support Team)`,
                        iconURL: moderator.displayAvatarURL({ dynamic: true })
                    });
                }
                
                embed.setTimestamp();

                const finalUser = this.client.users.cache.get(ticket.userId);
                await this.sendMessageWithRetry(finalUser, { embeds: [embed] });
                ticket.messageCount++;
                this.saveTickets();
                
                console.log(`Message relayed from support to user ${finalUser.tag} for ticket ${ticket.id}`);
            }

        } catch (error) {
            console.error(`Error relaying message (attempt ${retryCount + 1}):`, error);
            
            // Store failed message for manual review
            await this.logFailedMessage(source, ticket, content, error.message, user, moderator);
            
            // Retry logic for transient errors
            if (retryCount < maxRetries && this.isRetryableError(error)) {
                console.log(`Retrying message relay in ${retryDelay}ms...`);
                await new Promise(resolve => setTimeout(resolve, retryDelay));
                return this.relayMessage(source, ticket, content, user, moderator, retryCount + 1);
            }
            
            throw error;
        }
    }

    /**
     * Closes a ticket
     */
    async closeTicket(ticketId, reason, moderator) {
        try {
            const ticket = this.tickets.tickets[ticketId];
            if (!ticket) {
                throw new Error('Ticket not found');
            }

            if (ticket.status === 'closed') {
                throw new Error('Ticket is already closed');
            }

            // Update ticket status
            ticket.status = 'closed';
            ticket.closedAt = new Date().toISOString();
            ticket.closedBy = moderator.id;
            ticket.closeReason = reason;

            // Archive the ticket (move to closed section)
            await this.archiveTicket(ticketId);

            // Notify user
            const user = this.client.users.cache.get(ticket.userId);
            if (user) {
                const closeEmbed = new EmbedBuilder()
                    .setColor('#ff9900')
                    .setTitle(`🎫 Ticket Closed - ${ticketId}`)
                    .setDescription('Your support ticket has been closed.')
                    .addFields(
                        { name: 'Closed by', value: moderator.tag, inline: true },
                        { name: 'Reason', value: reason || 'No reason provided', inline: true },
                        { name: 'Messages exchanged', value: ticket.messageCount.toString(), inline: true }
                    )
                    .setFooter({ text: 'Thank you for using our support system!' })
                    .setTimestamp();

                const row = new ActionRowBuilder()
                    .addComponents(
                        new ButtonBuilder()
                            .setCustomId(`reopen_ticket_${ticketId}`)
                            .setLabel('Réouvrir le ticket')
                            .setStyle(ButtonStyle.Primary)
                            .setEmoji('🔓')
                    );

                try {
                    await user.send({ embeds: [closeEmbed], components: [row] });
                } catch (dmError) {
                    console.error(`Could not send closure DM to user ${ticket.userId} for ticket ${ticketId}:`, dmError);
                }
            }

            // Save ticket state first
            this.saveTickets();
            console.log(`Ticket ${ticketId} closed by ${moderator.tag}`);

            // Delete support channel
            const supportChannel = this.client.channels.cache.get(ticket.supportChannelId);
            if (supportChannel) {
                try {
                    await supportChannel.delete('Ticket closed');
                } catch (delError) {
                    console.error(`Error deleting support channel for ticket ${ticketId}:`, delError);
                }
            }

            return { success: true, ticket };

        } catch (error) {
            console.error('Error closing ticket:', error);
            throw error;
        }
    }

    /**
     * Archives a ticket with comprehensive conversation logging
     */
    async archiveTicket(ticketId) {
        try {
            const ticket = this.tickets.tickets[ticketId];
            if (!ticket) {
                throw new Error(`Ticket ${ticketId} not found`);
            }

            // Create archive entry with full conversation history
            const archiveEntry = {
                ...ticket,
                archived: true,
                archivedAt: new Date().toISOString(),
                conversationLog: await this.getTicketConversationLog(ticketId),
                questionnaire: ticket.responses || {},
                statistics: {
                    totalMessages: ticket.messageCount || 0,
                    duration: this.calculateTicketDuration(ticket),
                    responseTime: await this.calculateAverageResponseTime(ticketId)
                }
            };

            // Initialize archive structure if it doesn't exist
            if (!this.tickets._archive) {
                this.tickets._archive = {};
            }

            // Move ticket to archive
            this.tickets._archive[ticketId] = archiveEntry;
            
            // Keep ticket in main tickets for backward compatibility but mark as archived
            ticket.archived = true;
            ticket.archivedAt = new Date().toISOString();

            console.log(`Ticket ${ticketId} archived with conversation history`);
            return archiveEntry;

        } catch (error) {
            console.error(`Error archiving ticket ${ticketId}:`, error);
            throw error;
        }
    }

    /**
     * Gets conversation log for a ticket from support channel
     */
    async getTicketConversationLog(ticketId) {
        try {
            const ticket = this.tickets.tickets[ticketId];
            if (!ticket || !ticket.supportChannelId) {
                return [];
            }

            const supportChannel = this.client.channels.cache.get(ticket.supportChannelId);
            if (!supportChannel) {
                console.warn(`Support channel ${ticket.supportChannelId} not found for ticket ${ticketId}`);
                return [];
            }

            // Fetch all messages from the support channel
            const messages = [];
            let lastMessageId = null;
            
            while (true) {
                const fetchOptions = { limit: 100 };
                if (lastMessageId) {
                    fetchOptions.before = lastMessageId;
                }

                const batch = await supportChannel.messages.fetch(fetchOptions);
                if (batch.size === 0) break;

                batch.forEach(message => {
                    // Skip the initial ticket creation embed
                    if (message.author.id === this.client.user.id && message.embeds.length > 0) {
                        const embed = message.embeds[0];
                        if (embed.title && embed.title.includes('New Support Ticket')) {
                            return;
                        }
                    }

                    messages.push({
                        id: message.id,
                        author: {
                            id: message.author.id,
                            username: message.author.username,
                            tag: message.author.tag,
                            isBot: message.author.bot
                        },
                        content: message.content,
                        embeds: message.embeds.map(embed => ({
                            title: embed.title,
                            description: embed.description,
                            author: embed.author ? {
                                name: embed.author.name,
                                iconURL: embed.author.iconURL
                            } : null
                        })),
                        timestamp: message.createdAt.toISOString(),
                        attachments: message.attachments.map(att => ({
                            name: att.name,
                            url: att.url,
                            size: att.size
                        }))
                    });
                });

                lastMessageId = batch.last().id;
            }

            // Sort messages chronologically (oldest first)
            return messages.reverse();

        } catch (error) {
            console.error(`Error getting conversation log for ticket ${ticketId}:`, error);
            return [];
        }
    }

    /**
     * Calculates ticket duration in minutes
     */
    calculateTicketDuration(ticket) {
        if (!ticket.createdAt) return 0;
        
        const startTime = new Date(ticket.createdAt);
        const endTime = ticket.closedAt ? new Date(ticket.closedAt) : new Date();
        
        return Math.round((endTime - startTime) / (1000 * 60)); // Duration in minutes
    }

    /**
     * Calculates average response time for a ticket
     */
    async calculateAverageResponseTime(ticketId) {
        try {
            const conversationLog = await this.getTicketConversationLog(ticketId);
            if (conversationLog.length < 2) return 0;

            const responseTimes = [];
            let lastUserMessage = null;

            for (const message of conversationLog) {
                // Check if this is a user message (from embed author or direct user message)
                const isUserMessage = message.embeds && message.embeds.some(embed => 
                    embed.author && embed.author.name && embed.author.name.includes('(User)')
                );
                
                // Check if this is a support message (from embed author or direct moderator message)
                const isSupportMessage = (message.embeds && message.embeds.some(embed => 
                    embed.author && embed.author.name && embed.author.name.includes('(Support Team)')
                )) || (!message.author.isBot && !isUserMessage);

                if (isUserMessage) {
                    lastUserMessage = new Date(message.timestamp);
                } else if (isSupportMessage && lastUserMessage) {
                    const responseTime = new Date(message.timestamp) - lastUserMessage;
                    responseTimes.push(responseTime / (1000 * 60)); // Convert to minutes
                    lastUserMessage = null;
                }
            }

            if (responseTimes.length === 0) return 0;
            
            const averageMinutes = responseTimes.reduce((sum, time) => sum + time, 0) / responseTimes.length;
            return Math.round(averageMinutes);

        } catch (error) {
            console.error(`Error calculating response time for ticket ${ticketId}:`, error);
            return 0;
        }
    }

    /**
     * Logs failed message relay attempts for manual review
     */
    async logFailedMessage(source, ticket, content, errorMessage, user = null, moderator = null) {
        try {
            const failedMessage = {
                ticketId: ticket.id,
                source,
                content,
                error: errorMessage,
                timestamp: new Date().toISOString(),
                userId: user?.id || ticket.userId,
                moderatorId: moderator?.id || null,
                retryCount: 0
            };

            // Initialize failed messages array if it doesn't exist
            if (!this.tickets._failedMessages) {
                this.tickets._failedMessages = [];
            }

            this.tickets._failedMessages.push(failedMessage);
            this.saveTickets();

            console.log(`Failed message logged for ticket ${ticket.id}: ${errorMessage}`);
        } catch (error) {
            console.error('Error logging failed message:', error);
        }
    }

    /**
     * Handles messages from support channels
     */
    async handleSupportChannelMessage(message) {
        if (!message || !message.id) return false;

        // Prevent duplicate processing
        if (this.processedMessages.has(message.id)) {
            return false;
        }
        this.processedMessages.add(message.id);
        
        // Clean up old message IDs
        setTimeout(() => this.processedMessages.delete(message.id), 60000); // 1 minute

        try {
            // Retrieve ticket by channel ID
            const ticket = this.getTicketByChannelId(message.channel.id);

            if (!ticket) {
                // Not a ticket channel or ticket not found
                return false;
            }

            const ticketId = ticket.id;

            if (ticket.status !== 'open') {
                console.warn(`Ticket ${ticketId} is not open, ignoring support message`);
                return false;
            }

            // Ignore bot messages
            if (message.author.bot) {
                return false;
            }

            // Relay message to user
            await this.relayMessage('support', ticket, message.content, null, message.author);
            return true;

        } catch (error) {
            console.error('Error handling support channel message:', error);
            return false;
        }
    }

    /**
     * Gets ticket by support channel ID
     */
    getTicketByChannelId(channelId) {
        return Object.values(this.tickets.tickets).find(
            ticket => ticket.supportChannelId === channelId
        );
    }

    /**
     * Retries failed message delivery
     */
    async retryFailedMessages() {
        if (!this.tickets._failedMessages || this.tickets._failedMessages.length === 0) {
            return { success: true, retriedCount: 0 };
        }

        let retriedCount = 0;
        const maxRetries = 3;
        const failedMessages = [...this.tickets._failedMessages];

        for (let i = failedMessages.length - 1; i >= 0; i--) {
            const failedMsg = failedMessages[i];
            
            if (failedMsg.retryCount >= maxRetries) {
                continue; // Skip messages that have exceeded retry limit
            }

            try {
                const ticket = this.tickets.tickets[failedMsg.ticketId];
                if (!ticket) {
                    // Remove failed message for non-existent ticket
                    this.tickets._failedMessages.splice(i, 1);
                    continue;
                }

                const user = failedMsg.userId ? this.client.users.cache.get(failedMsg.userId) : null;
                const moderator = failedMsg.moderatorId ? this.client.users.cache.get(failedMsg.moderatorId) : null;

                await this.relayMessage(failedMsg.source, ticket, failedMsg.content, user, moderator);
                
                // Remove successful retry from failed messages
                this.tickets._failedMessages.splice(i, 1);
                retriedCount++;
                
            } catch (error) {
                // Increment retry count
                failedMsg.retryCount++;
                failedMsg.lastRetryAt = new Date().toISOString();
                console.log(`Retry ${failedMsg.retryCount} failed for message in ticket ${failedMsg.ticketId}: ${error.message}`);
            }
        }

        if (retriedCount > 0) {
            this.saveTickets();
        }

        return { success: true, retriedCount };
    }

    /**
     * Handles ticket reopening from a button click in user DM
     */
    async handleTicketReopen(interaction) {
        try {
            const ticketId = interaction.customId.replace('reopen_ticket_', '');
            const ticket = this.tickets.tickets[ticketId];
            
            if (!ticket) {
                return await interaction.reply({ content: '❌ Ce ticket est introuvable.', ephemeral: true });
            }

            if (ticket.status === 'open') {
                return await interaction.reply({ content: '❌ Ce ticket est déjà ouvert.', ephemeral: true });
            }

            // Disable the button immediately
            const components = [...interaction.message.components];
            if (components.length > 0 && components[0].components.length > 0) {
                components[0].components[0].data.disabled = true;
                await interaction.update({ components });
            }

            // Update ticket status
            ticket.status = 'open';
            ticket.archived = false;
            // Clear closed info
            ticket.closedAt = null;
            ticket.closedBy = null;
            ticket.closeReason = null;

            // Delete from archive just in case
            if (this.tickets._archive && this.tickets._archive[ticketId]) {
                delete this.tickets._archive[ticketId];
            }

            // Fetch user and recreate support channel
            const user = await this.client.users.fetch(ticket.userId);
            const channel = await this.createSupportChannel(ticketId, user, ticket);
            if (channel) {
                ticket.supportChannelId = channel.id;
            }

            this.saveTickets();

            // Notify user
            const openEmbed = new EmbedBuilder()
                .setColor('#00ff00')
                .setTitle(`🔓 Ticket Réouvert - ${ticketId}`)
                .setDescription('Votre ticket a été réouvert. Un membre de notre équipe vous répondra sous peu.')
                .setTimestamp();

            await user.send({ embeds: [openEmbed] });

            // Notify staff
            if (channel) {
                await channel.send({ content: `ℹ️ L'utilisateur <@${user.id}> a réouvert ce ticket.` });
            }

        } catch (error) {
            console.error('Error reopening ticket:', error);
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({ content: '❌ Une erreur est survenue lors de la réouverture du ticket.', ephemeral: true });
            }
        }
    }

    /**
     * Handles incoming DM messages for ticket system
     */
    async handleDMMessage(message) {
        if (!message || !message.id) return false;

        // Prevent duplicate processing
        if (this.processedMessages.has(message.id)) {
            return false;
        }
        this.processedMessages.add(message.id);
        
        // Clean up old message IDs from memory to prevent memory leaks
        setTimeout(() => this.processedMessages.delete(message.id), 60000); // 1 minute

        const user = message.author;
        
        // Check if user has an active questionnaire
        if (this.activeQuestions.has(user.id)) {
            return await this.processQuestionnaireResponse(user, message);
        }

        // Check if user has an active ticket
        const activeTickets = this.getActiveTickets(user.id);
        if (activeTickets.length > 0) {
            const ticket = activeTickets[0];
            await this.relayMessage('user', ticket, message.content, user);
            return true;
        }

        // No active ticket or questionnaire, start new ticket creation
        await this.createTicket(user, message.content);
        return true;
    }

    /**
     * Performs data retention cleanup based on configured policies
     */
    async performDataRetention(retentionPolicies = {}) {
        try {
            const defaultPolicies = {
                archiveAfterDays: 90,        // Archive closed tickets after 90 days
                deleteAfterDays: 365,       // Delete archived tickets after 1 year
                maxTicketsPerUser: 100,     // Keep max 100 tickets per user
                cleanupFailedMessages: true  // Clean up old failed messages
            };

            const policies = { ...defaultPolicies, ...retentionPolicies };
            const now = new Date();
            let cleanupStats = {
                archivedTickets: 0,
                deletedTickets: 0,
                cleanedFailedMessages: 0,
                errors: []
            };

            // Archive old closed tickets
            const archiveDate = new Date(now.getTime() - (policies.archiveAfterDays * 24 * 60 * 60 * 1000));
            const ticketsToArchive = Object.values(this.tickets.tickets).filter(ticket => 
                ticket.status === 'closed' && 
                !ticket.archived &&
                ticket.closedAt &&
                new Date(ticket.closedAt) < archiveDate
            );

            for (const ticket of ticketsToArchive) {
                try {
                    await this.archiveTicket(ticket.id);
                    cleanupStats.archivedTickets++;
                } catch (error) {
                    cleanupStats.errors.push(`Failed to archive ticket ${ticket.id}: ${error.message}`);
                }
            }

            // Delete very old archived tickets
            if (this.tickets._archive) {
                const deleteDate = new Date(now.getTime() - (policies.deleteAfterDays * 24 * 60 * 60 * 1000));
                const ticketsToDelete = Object.keys(this.tickets._archive).filter(ticketId => {
                    const ticket = this.tickets._archive[ticketId];
                    return ticket.archivedAt && new Date(ticket.archivedAt) < deleteDate;
                });

                for (const ticketId of ticketsToDelete) {
                    try {
                        delete this.tickets._archive[ticketId];
                        // Also remove from main tickets if it exists
                        if (this.tickets.tickets[ticketId]) {
                            delete this.tickets.tickets[ticketId];
                        }
                        // Remove from user tickets list
                        const ticket = this.tickets._archive[ticketId];
                        if (ticket && this.tickets.userTickets[ticket.userId]) {
                            this.tickets.userTickets[ticket.userId] = 
                                this.tickets.userTickets[ticket.userId].filter(id => id !== ticketId);
                        }
                        cleanupStats.deletedTickets++;
                    } catch (error) {
                        cleanupStats.errors.push(`Failed to delete ticket ${ticketId}: ${error.message}`);
                    }
                }
            }

            // Limit tickets per user (keep most recent)
            for (const [userId, ticketIds] of Object.entries(this.tickets.userTickets)) {
                if (ticketIds.length > policies.maxTicketsPerUser) {
                    // Get all tickets for this user and sort by creation date
                    const userTickets = ticketIds
                        .map(id => ({ id, ticket: this.tickets.tickets[id] || this.tickets._archive?.[id] }))
                        .filter(item => item.ticket)
                        .sort((a, b) => new Date(b.ticket.createdAt) - new Date(a.ticket.createdAt));

                    // Remove oldest tickets beyond the limit
                    const ticketsToRemove = userTickets.slice(policies.maxTicketsPerUser);
                    for (const { id } of ticketsToRemove) {
                        try {
                            if (this.tickets.tickets[id]) delete this.tickets.tickets[id];
                            if (this.tickets._archive?.[id]) delete this.tickets._archive[id];
                            cleanupStats.deletedTickets++;
                        } catch (error) {
                            cleanupStats.errors.push(`Failed to remove excess ticket ${id}: ${error.message}`);
                        }
                    }

                    // Update user tickets list
                    this.tickets.userTickets[userId] = userTickets
                        .slice(0, policies.maxTicketsPerUser)
                        .map(item => item.id);
                }
            }

            // Clean up old failed messages
            if (policies.cleanupFailedMessages && this.tickets._failedMessages) {
                const failedMessageCutoff = new Date(now.getTime() - (7 * 24 * 60 * 60 * 1000)); // 7 days
                const initialCount = this.tickets._failedMessages.length;
                
                this.tickets._failedMessages = this.tickets._failedMessages.filter(msg => 
                    new Date(msg.timestamp) > failedMessageCutoff
                );
                
                cleanupStats.cleanedFailedMessages = initialCount - this.tickets._failedMessages.length;
            }

            // Save changes
            this.saveTickets();

            console.log('Data retention cleanup completed:', cleanupStats);
            return {
                success: true,
                stats: cleanupStats
            };

        } catch (error) {
            console.error('Error during data retention cleanup:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Exports ticket data for backup or analysis
     */
    exportTicketData(options = {}) {
        try {
            const exportData = {
                metadata: {
                    exportedAt: new Date().toISOString(),
                    version: this.tickets._metadata?.version || '1.0',
                    totalTickets: Object.keys(this.tickets.tickets).length,
                    totalArchived: this.tickets._archive ? Object.keys(this.tickets._archive).length : 0
                },
                tickets: {},
                archive: {},
                userTickets: {},
                settings: this.tickets._settings || {}
            };

            // Export active tickets
            if (options.includeActive !== false) {
                exportData.tickets = { ...this.tickets.tickets };
            }

            // Export archived tickets
            if (options.includeArchived && this.tickets._archive) {
                exportData.archive = { ...this.tickets._archive };
            }

            // Export user ticket mappings
            if (options.includeUserMappings !== false) {
                exportData.userTickets = { ...this.tickets.userTickets };
            }

            // Filter by date range if specified
            if (options.dateFrom || options.dateTo) {
                const fromDate = options.dateFrom ? new Date(options.dateFrom) : new Date(0);
                const toDate = options.dateTo ? new Date(options.dateTo) : new Date();

                // Filter active tickets
                exportData.tickets = Object.fromEntries(
                    Object.entries(exportData.tickets).filter(([_, ticket]) => {
                        const ticketDate = new Date(ticket.createdAt);
                        return ticketDate >= fromDate && ticketDate <= toDate;
                    })
                );

                // Filter archived tickets
                exportData.archive = Object.fromEntries(
                    Object.entries(exportData.archive).filter(([_, ticket]) => {
                        const ticketDate = new Date(ticket.createdAt);
                        return ticketDate >= fromDate && ticketDate <= toDate;
                    })
                );
            }

            // Remove sensitive data if requested
            if (options.anonymize) {
                const anonymizeTicket = (ticket) => ({
                    ...ticket,
                    userId: 'anonymized',
                    username: 'anonymized',
                    discriminator: '0000',
                    responses: ticket.responses ? {
                        ...ticket.responses,
                        description: '[REDACTED]',
                        serverContext: '[REDACTED]',
                        previousAttempts: '[REDACTED]'
                    } : undefined
                });

                exportData.tickets = Object.fromEntries(
                    Object.entries(exportData.tickets).map(([id, ticket]) => [id, anonymizeTicket(ticket)])
                );

                exportData.archive = Object.fromEntries(
                    Object.entries(exportData.archive).map(([id, ticket]) => [id, anonymizeTicket(ticket)])
                );

                exportData.userTickets = {};
            }

            return {
                success: true,
                data: exportData
            };

        } catch (error) {
            console.error('Error exporting ticket data:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Imports ticket data from backup
     */
    importTicketData(importData, options = {}) {
        try {
            if (!importData || typeof importData !== 'object') {
                throw new Error('Invalid import data format');
            }

            const backupPath = options.createBackup ? 
                `${this.filePath}.backup.${Date.now()}` : null;

            // Create backup if requested
            if (backupPath) {
                fs.writeFileSync(backupPath, JSON.stringify(this.tickets, null, 2));
                console.log(`Backup created at: ${backupPath}`);
            }

            let importStats = {
                importedTickets: 0,
                importedArchived: 0,
                skippedDuplicates: 0,
                errors: []
            };

            // Import active tickets
            if (importData.tickets) {
                for (const [ticketId, ticket] of Object.entries(importData.tickets)) {
                    try {
                        if (options.skipDuplicates && this.tickets.tickets[ticketId]) {
                            importStats.skippedDuplicates++;
                            continue;
                        }

                        this.tickets.tickets[ticketId] = ticket;
                        
                        // Update user tickets mapping
                        if (ticket.userId) {
                            if (!this.tickets.userTickets[ticket.userId]) {
                                this.tickets.userTickets[ticket.userId] = [];
                            }
                            if (!this.tickets.userTickets[ticket.userId].includes(ticketId)) {
                                this.tickets.userTickets[ticket.userId].push(ticketId);
                            }
                        }

                        importStats.importedTickets++;
                    } catch (error) {
                        importStats.errors.push(`Failed to import ticket ${ticketId}: ${error.message}`);
                    }
                }
            }

            // Import archived tickets
            if (importData.archive) {
                if (!this.tickets._archive) {
                    this.tickets._archive = {};
                }

                for (const [ticketId, ticket] of Object.entries(importData.archive)) {
                    try {
                        if (options.skipDuplicates && this.tickets._archive[ticketId]) {
                            importStats.skippedDuplicates++;
                            continue;
                        }

                        this.tickets._archive[ticketId] = ticket;
                        importStats.importedArchived++;
                    } catch (error) {
                        importStats.errors.push(`Failed to import archived ticket ${ticketId}: ${error.message}`);
                    }
                }
            }

            // Update metadata
            if (importData.metadata) {
                this.tickets._metadata = {
                    ...this.tickets._metadata,
                    lastImport: new Date().toISOString(),
                    importSource: importData.metadata
                };
            }

            // Save imported data
            this.saveTickets();

            console.log('Ticket data import completed:', importStats);
            return {
                success: true,
                stats: importStats,
                backupPath
            };

        } catch (error) {
            console.error('Error importing ticket data:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }


    // ===== ENHANCED ERROR HANDLING METHODS =====

    /**
     * Checks if user's DMs are available for ticket creation
     */
    async checkUserDMAvailability(user) {
        try {
            // Try to send a test message to check if DMs are open
            const testEmbed = new EmbedBuilder()
                .setColor('#0099ff')
                .setTitle('🔍 Checking DM Availability')
                .setDescription('Testing if we can send you messages...')
                .setFooter({ text: 'This message will be deleted shortly.' });

            const testMessage = await user.send({ embeds: [testEmbed] });
            
            // If we got here, DMs are available - delete the test message
            setTimeout(async () => {
                try {
                    await testMessage.delete();
                } catch (error) {
                    // Ignore deletion errors
                }
            }, 2000);

            return { 
                available: true, 
                reason: null 
            };

        } catch (error) {
            console.log(`User ${user.tag} has DMs disabled or blocked the bot: ${error.message}`);
            
            let reason = 'unknown';
            if (error.code === 50007) {
                reason = 'dms_disabled';
            } else if (error.code === 50013) {
                reason = 'bot_blocked';
            } else if (error.message.includes('Cannot send messages to this user')) {
                reason = 'dms_disabled';
            }

            return { 
                available: false, 
                reason: reason,
                error: error.message 
            };
        }
    }

    /**
     * Handles ticket creation when user has disabled DMs
     */
    async handleDisabledDMs(user, initialMessage, reason) {
        try {
            console.log(`Handling disabled DMs for user ${user.tag}, reason: ${reason}`);
            
            // Try to find a mutual guild where we can create a temporary channel
            const mutualGuilds = this.client.guilds.cache.filter(guild => 
                guild.members.cache.has(user.id) && 
                guild.members.cache.get(this.client.user.id)?.permissions.has([
                    PermissionFlagsBits.ManageChannels,
                    PermissionFlagsBits.SendMessages
                ])
            );

            if (mutualGuilds.size === 0) {
                // No suitable guild found, queue the ticket
                return await this.queueTicketForLater(user, initialMessage, 'no_suitable_guild');
            }

            // Use the first suitable guild (or the support server if it's in the list)
            const supportServerId = this.getSupportServer();
            let targetGuild = mutualGuilds.first();
            
            if (supportServerId && mutualGuilds.has(supportServerId)) {
                targetGuild = mutualGuilds.get(supportServerId);
            }

            // Create a temporary private channel for the user
            const tempChannel = await targetGuild.channels.create({
                name: `temp-ticket-${user.username}`,
                type: ChannelType.GuildText,
                topic: `Temporary ticket channel for ${user.tag} (DMs disabled)`,
                permissionOverwrites: [
                    {
                        id: targetGuild.roles.everyone.id,
                        deny: [PermissionFlagsBits.ViewChannel]
                    },
                    {
                        id: user.id,
                        allow: [
                            PermissionFlagsBits.ViewChannel,
                            PermissionFlagsBits.SendMessages,
                            PermissionFlagsBits.ReadMessageHistory
                        ]
                    },
                    {
                        id: this.client.user.id,
                        allow: [
                            PermissionFlagsBits.ViewChannel,
                            PermissionFlagsBits.SendMessages,
                            PermissionFlagsBits.ManageMessages
                        ]
                    }
                ]
            });

            // Send explanation and start ticket process in the temporary channel
            const explanationEmbed = new EmbedBuilder()
                .setColor('#FFA500')
                .setTitle('🎫 Ticket Creation - DMs Unavailable')
                .setDescription(`Hello ${user}! I noticed your DMs are disabled, so I've created this temporary channel for your support ticket.`)
                .addFields(
                    { name: 'Why this happened', value: reason === 'dms_disabled' ? 'Your DMs are disabled' : 'You may have blocked the bot', inline: false },
                    { name: 'What happens next', value: 'I\'ll ask you a few questions here, then move your ticket to our support team.', inline: false },
                    { name: 'Privacy', value: 'This channel is private - only you and the bot can see it initially.', inline: false }
                )
                .setFooter({ text: 'This channel will be deleted after your ticket is created.' });

            await tempChannel.send({ embeds: [explanationEmbed] });

            // Store the temporary channel info and start questionnaire
            const questionnaire = {
                userId: user.id,
                ticketId: null,
                currentStep: 'category',
                responses: {},
                startedAt: new Date().toISOString(),
                retryCount: 0,
                tempChannelId: tempChannel.id,
                tempGuildId: targetGuild.id,
                dmsFailed: true,
                failureReason: reason
            };

            if (initialMessage) {
                questionnaire.responses.initialMessage = initialMessage;
            }

            this.activeQuestions.set(user.id, questionnaire);
            await this.askQuestionInChannel(tempChannel, user, 'category');

            return { 
                success: true, 
                ticketId: null, 
                isNew: true, 
                inProgress: true,
                tempChannel: tempChannel.id,
                method: 'temp_channel'
            };

        } catch (error) {
            console.error('Error handling disabled DMs:', error);
            return await this.queueTicketForLater(user, initialMessage, `dm_fallback_failed: ${error.message}`);
        }
    }

    /**
     * Asks a question in a temporary channel (for users with disabled DMs)
     */
    async askQuestionInChannel(channel, user, step) {
        const questionConfig = this.questionFlow[step];
        if (!questionConfig) {
            console.error(`Unknown question step: ${step}`);
            return;
        }

        const embed = new EmbedBuilder()
            .setColor('#0099ff')
            .setTitle(`Question ${this.getStepNumber(step)} of 5`)
            .setDescription(questionConfig.question);

        // Add options if they exist
        if (questionConfig.options) {
            const optionsText = Object.entries(questionConfig.options)
                .map(([key, value]) => `**${key}.** ${value}`)
                .join('\n');
            embed.addFields({ name: 'Options', value: optionsText });
        }

        embed.setFooter({ text: `${user.tag}, please type your response below, or "cancel" to stop.` });

        await channel.send({ embeds: [embed] });
    }

    /**
     * Checks if the support server is available and accessible
     */
    async checkSupportServerAvailability() {
        try {
            const supportServerId = this.getSupportServer();
            
            if (!supportServerId) {
                return {
                    available: false,
                    reason: 'no_support_server_configured',
                    error: 'No support server has been configured'
                };
            }

            // Check if bot is in the support server
            const supportGuild = this.client.guilds.cache.get(supportServerId);
            if (!supportGuild) {
                return {
                    available: false,
                    reason: 'support_server_not_found',
                    error: `Support server ${supportServerId} not found or bot not in server`
                };
            }

            // Check if support server is available (not in outage)
            if (!supportGuild.available) {
                return {
                    available: false,
                    reason: 'support_server_outage',
                    error: 'Support server is currently experiencing an outage'
                };
            }

            // Check bot permissions in support server
            const botMember = supportGuild.members.cache.get(this.client.user.id);
            if (!botMember) {
                return {
                    available: false,
                    reason: 'bot_not_member',
                    error: 'Bot is not a member of the support server'
                };
            }

            const requiredPermissions = [
                PermissionFlagsBits.ManageChannels,
                PermissionFlagsBits.ViewChannel,
                PermissionFlagsBits.SendMessages,
                PermissionFlagsBits.EmbedLinks
            ];

            const missingPermissions = requiredPermissions.filter(
                perm => !botMember.permissions.has(perm)
            );

            if (missingPermissions.length > 0) {
                return {
                    available: false,
                    reason: 'insufficient_permissions',
                    error: `Bot missing required permissions: ${missingPermissions.join(', ')}`,
                    missingPermissions
                };
            }

            // Check if we can create channels (rate limit check)
            const channelCount = supportGuild.channels.cache.size;
            if (channelCount >= 500) { // Discord's channel limit
                return {
                    available: false,
                    reason: 'channel_limit_reached',
                    error: 'Support server has reached the maximum number of channels'
                };
            }

            return {
                available: true,
                reason: null,
                guild: {
                    id: supportGuild.id,
                    name: supportGuild.name,
                    channelCount: channelCount
                }
            };

        } catch (error) {
            console.error('Error checking support server availability:', error);
            return {
                available: false,
                reason: 'check_failed',
                error: error.message
            };
        }
    }

    /**
     * Queues a ticket for later processing when support server is unavailable
     */
    async queueTicketForLater(user, initialMessage, reason) {
        try {
            console.log(`Queueing ticket for user ${user.tag}, reason: ${reason}`);

            // Initialize queue if it doesn't exist
            if (!this.tickets._queue) {
                this.tickets._queue = [];
            }

            const queuedTicket = {
                id: `queued-${Date.now()}-${user.id}`,
                userId: user.id,
                username: user.username,
                discriminator: user.discriminator || '0',
                initialMessage: initialMessage,
                queuedAt: new Date().toISOString(),
                reason: reason,
                retryCount: 0,
                status: 'queued'
            };

            this.tickets._queue.push(queuedTicket);
            this.saveTickets();

            // Try to notify user about queueing
            try {
                const queueEmbed = new EmbedBuilder()
                    .setColor('#FFA500')
                    .setTitle('🕐 Ticket Queued')
                    .setDescription('Your support request has been queued due to a temporary issue.')
                    .addFields(
                        { name: 'Queue ID', value: queuedTicket.id, inline: true },
                        { name: 'Reason', value: this.getQueueReasonDescription(reason), inline: false },
                        { name: 'What happens next', value: 'We\'ll process your ticket as soon as the issue is resolved and notify you.', inline: false }
                    )
                    .setFooter({ text: 'Thank you for your patience!' })
                    .setTimestamp();

                await this.sendMessageWithRetry(user, { embeds: [queueEmbed] });
            } catch (dmError) {
                console.log(`Could not notify user ${user.tag} about queued ticket: ${dmError.message}`);
                // Store notification failure for later retry
                queuedTicket.notificationFailed = true;
                queuedTicket.notificationError = dmError.message;
            }

            // Schedule automatic retry
            setTimeout(() => {
                this.processQueuedTickets();
            }, 5 * 60 * 1000); // Retry in 5 minutes

            return {
                success: true,
                ticketId: queuedTicket.id,
                isNew: true,
                queued: true,
                reason: reason
            };

        } catch (error) {
            console.error('Error queueing ticket:', error);
            
            // Last resort: log the ticket request for manual processing
            await this.logTicketError('queueTicketForLater', error, {
                userId: user.id,
                initialMessage,
                reason
            });

            return {
                success: false,
                error: error.message,
                fallback: 'logged_for_manual_processing'
            };
        }
    }

    /**
     * Gets a human-readable description for queue reasons
     */
    getQueueReasonDescription(reason) {
        const descriptions = {
            'no_support_server_configured': 'Support server not configured',
            'support_server_not_found': 'Support server temporarily unavailable',
            'support_server_outage': 'Support server experiencing an outage',
            'bot_not_member': 'Bot configuration issue',
            'insufficient_permissions': 'Permission configuration issue',
            'channel_limit_reached': 'Support server at capacity',
            'no_suitable_guild': 'No available servers for ticket creation',
            'dm_fallback_failed': 'Unable to create alternative communication channel'
        };

        return descriptions[reason] || `Technical issue: ${reason}`;
    }

    /**
     * Processes queued tickets when support server becomes available
     */
    async processQueuedTickets() {
        if (!this.tickets._queue || this.tickets._queue.length === 0) {
            return { success: true, processedCount: 0 };
        }

        console.log(`Processing ${this.tickets._queue.length} queued tickets...`);
        
        // Check if support server is now available
        const serverCheck = await this.checkSupportServerAvailability();
        if (!serverCheck.available) {
            console.log('Support server still unavailable, will retry later');
            return { success: false, reason: serverCheck.reason };
        }

        let processedCount = 0;
        const maxRetries = 3;
        const queuedTickets = [...this.tickets._queue];

        for (let i = queuedTickets.length - 1; i >= 0; i--) {
            const queuedTicket = queuedTickets[i];
            
            if (queuedTicket.retryCount >= maxRetries) {
                console.log(`Queued ticket ${queuedTicket.id} exceeded max retries, moving to failed queue`);
                await this.moveToFailedQueue(queuedTicket);
                this.tickets._queue.splice(i, 1);
                continue;
            }

            try {
                const user = this.client.users.cache.get(queuedTicket.userId);
                if (!user) {
                    // Try to fetch user
                    try {
                        await this.client.users.fetch(queuedTicket.userId);
                    } catch (fetchError) {
                        console.log(`User ${queuedTicket.userId} not found, removing from queue`);
                        this.tickets._queue.splice(i, 1);
                        continue;
                    }
                }

                // Attempt to create the ticket
                const result = await this.createTicket(user, queuedTicket.initialMessage);
                
                if (result.success) {
                    // Notify user that their queued ticket is now being processed
                    try {
                        const processedEmbed = new EmbedBuilder()
                            .setColor('#00ff00')
                            .setTitle('✅ Queued Ticket Now Processing')
                            .setDescription(`Your queued support request (${queuedTicket.id}) is now being processed!`)
                            .addFields(
                                { name: 'New Ticket ID', value: result.ticketId || 'In progress', inline: true },
                                { name: 'Queued for', value: this.formatDuration(Date.now() - new Date(queuedTicket.queuedAt).getTime()), inline: true }
                            )
                            .setFooter({ text: 'Thank you for your patience!' })
                            .setTimestamp();

                        await this.sendMessageWithRetry(user, { embeds: [processedEmbed] });
                    } catch (notifyError) {
                        console.log(`Could not notify user about processed ticket: ${notifyError.message}`);
                    }

                    // Remove from queue
                    this.tickets._queue.splice(i, 1);
                    processedCount++;
                    
                } else {
                    // Increment retry count and try again later
                    queuedTicket.retryCount++;
                    queuedTicket.lastRetryAt = new Date().toISOString();
                    queuedTicket.lastError = result.error;
                }

            } catch (error) {
                console.error(`Error processing queued ticket ${queuedTicket.id}:`, error);
                queuedTicket.retryCount++;
                queuedTicket.lastRetryAt = new Date().toISOString();
                queuedTicket.lastError = error.message;
            }
        }

        if (processedCount > 0 || this.tickets._queue.length !== queuedTickets.length) {
            this.saveTickets();
        }

        console.log(`Processed ${processedCount} queued tickets`);
        return { success: true, processedCount };
    }

    /**
     * Moves a failed queued ticket to the failed queue for manual review
     */
    async moveToFailedQueue(queuedTicket) {
        if (!this.tickets._failedQueue) {
            this.tickets._failedQueue = [];
        }

        const failedTicket = {
            ...queuedTicket,
            failedAt: new Date().toISOString(),
            status: 'failed'
        };

        this.tickets._failedQueue.push(failedTicket);
        console.log(`Moved ticket ${queuedTicket.id} to failed queue for manual review`);
    }

    /**
     * Sends a message with retry logic for transient failures
     */
    async sendMessageWithRetry(target, messageOptions, retryCount = 0) {
        const maxRetries = 3;
        const retryDelay = 1000 * (retryCount + 1); // Exponential backoff

        try {
            return await target.send(messageOptions);
        } catch (error) {
            console.error(`Error sending message (attempt ${retryCount + 1}):`, error);
            
            if (retryCount < maxRetries && this.isRetryableError(error)) {
                console.log(`Retrying message send in ${retryDelay}ms...`);
                await new Promise(resolve => setTimeout(resolve, retryDelay));
                return this.sendMessageWithRetry(target, messageOptions, retryCount + 1);
            }
            
            throw error;
        }
    }

    /**
     * Determines if an error is retryable (transient) or permanent
     */
    isRetryableError(error) {
        // Discord API error codes that are typically retryable
        const retryableCodes = [
            429,    // Rate limited
            500,    // Internal Server Error
            502,    // Bad Gateway
            503,    // Service Unavailable
            504,    // Gateway Timeout
            520,    // Unknown Error
            521,    // Web Server Is Down
            522,    // Connection Timed Out
            523,    // Origin Is Unreachable
            524     // A Timeout Occurred
        ];

        // Discord.js error codes that are retryable
        const retryableDiscordCodes = [
            50013,  // Missing Permissions (might be temporary)
            50001   // Missing Access (might be temporary)
        ];

        if (error.code && retryableCodes.includes(error.code)) {
            return true;
        }

        if (error.code && retryableDiscordCodes.includes(error.code)) {
            return true;
        }

        // Network-related errors
        if (error.message) {
            const retryableMessages = [
                'network error',
                'timeout',
                'connection reset',
                'socket hang up',
                'enotfound',
                'econnreset',
                'econnrefused'
            ];

            const message = error.message.toLowerCase();
            return retryableMessages.some(msg => message.includes(msg));
        }

        return false;
    }

    /**
     * Recreates a support channel if it was deleted or is inaccessible
     */
    async recreateSupportChannel(ticket, user) {
        try {
            console.log(`Attempting to recreate support channel for ticket ${ticket.id}`);
            
            const supportServerId = this.getSupportServer();
            if (!supportServerId) {
                throw new Error('No support server configured');
            }

            const supportGuild = this.client.guilds.cache.get(supportServerId);
            if (!supportGuild) {
                throw new Error(`Support server not found: ${supportServerId}`);
            }

            // Create new channel with recovery indicator
            const channel = await supportGuild.channels.create({
                name: `ticket-${ticket.id}-recovered`,
                type: ChannelType.GuildText,
                topic: `RECOVERED: Support ticket for ${user.tag} (${user.id}) | Original: ${ticket.supportChannelId}`,
                permissionOverwrites: [
                    {
                        id: supportGuild.roles.everyone.id,
                        deny: [PermissionFlagsBits.ViewChannel]
                    },
                    {
                        id: this.client.user.id,
                        allow: [
                            PermissionFlagsBits.ViewChannel,
                            PermissionFlagsBits.SendMessages,
                            PermissionFlagsBits.ManageMessages,
                            PermissionFlagsBits.EmbedLinks,
                            PermissionFlagsBits.AttachFiles
                        ]
                    }
                ]
            });

            // Add moderator roles
            const moderatorRoles = ['Moderator', 'Admin', 'Support'];
            for (const roleName of moderatorRoles) {
                const role = supportGuild.roles.cache.find(r => r.name === roleName);
                if (role) {
                    await channel.permissionOverwrites.create(role, {
                        ViewChannel: true,
                        SendMessages: true,
                        ReadMessageHistory: true
                    });
                }
            }

            // Send recovery notification
            const recoveryEmbed = new EmbedBuilder()
                .setColor('#FFA500')
                .setTitle(`🔄 Recovered Support Channel: ${ticket.id}`)
                .setDescription(`This channel was recreated because the original was inaccessible.`)
                .addFields(
                    { name: 'User', value: `${user.tag} (${user.id})`, inline: true },
                    { name: 'Original Channel', value: ticket.supportChannelId || 'Unknown', inline: true },
                    { name: 'Ticket Created', value: new Date(ticket.createdAt).toLocaleString(), inline: true },
                    { name: 'Recovery Reason', value: 'Original channel not found or inaccessible', inline: false }
                )
                .setFooter({ text: 'Previous conversation history may be lost' })
                .setTimestamp();

            if (ticket.responses) {
                recoveryEmbed.addFields(
                    { name: 'Issue Category', value: ticket.responses.category?.label || 'Unknown', inline: true },
                    { name: 'Priority', value: ticket.responses.priority?.label || 'Unknown', inline: true },
                    { name: 'Description', value: ticket.responses.description || 'No description available', inline: false }
                );
            }

            await channel.send({ embeds: [recoveryEmbed] });

            console.log(`Support channel recreated: ${channel.name} (${channel.id}) for ticket ${ticket.id}`);
            return channel;

        } catch (error) {
            console.error(`Error recreating support channel for ticket ${ticket.id}:`, error);
            throw error;
        }
    }

    /**
     * Logs ticket-related errors for debugging and monitoring
     */
    async logTicketError(operation, error, context = {}) {
        try {
            const errorLog = {
                operation,
                error: {
                    message: error.message,
                    code: error.code,
                    stack: error.stack
                },
                context,
                timestamp: new Date().toISOString(),
                botId: this.client.user?.id,
                supportServer: this.getSupportServer()
            };

            // Initialize error log array if it doesn't exist
            if (!this.tickets._errorLogs) {
                this.tickets._errorLogs = [];
            }

            this.tickets._errorLogs.push(errorLog);

            // Keep only the last 100 error logs to prevent file bloat
            if (this.tickets._errorLogs.length > 100) {
                this.tickets._errorLogs = this.tickets._errorLogs.slice(-100);
            }

            this.saveTickets();
            console.error(`Ticket error logged for operation ${operation}:`, error.message);

        } catch (logError) {
            console.error('Error logging ticket error:', logError);
        }
    }

    /**
     * Handles ticket creation errors with appropriate user feedback
     */
    async handleTicketCreationError(user, error) {
        try {
            let userMessage = 'Sorry, there was an error creating your support ticket. ';
            let shouldRetry = false;

            // Provide specific error messages based on error type
            if (error.code === 50013) {
                userMessage += 'The bot is missing required permissions. Please contact an administrator.';
            } else if (error.code === 50001) {
                userMessage += 'The bot cannot access the support server. Please try again later.';
                shouldRetry = true;
            } else if (error.message.includes('support server')) {
                userMessage += 'There\'s an issue with the support server configuration. Please contact an administrator.';
            } else if (this.isRetryableError(error)) {
                userMessage += 'This appears to be a temporary issue. Please try again in a few minutes.';
                shouldRetry = true;
            } else {
                userMessage += 'Please try again later or contact an administrator if the problem persists.';
            }

            const errorEmbed = new EmbedBuilder()
                .setColor('#ff0000')
                .setTitle('❌ Ticket Creation Failed')
                .setDescription(userMessage)
                .addFields(
                    { name: 'Error Code', value: error.code?.toString() || 'Unknown', inline: true },
                    { name: 'Can Retry?', value: shouldRetry ? 'Yes' : 'Contact Admin', inline: true }
                )
                .setFooter({ text: 'Error ID: ' + Date.now().toString(36) })
                .setTimestamp();

            await this.sendMessageWithRetry(user, { embeds: [errorEmbed] });

            return {
                success: false,
                error: error.message,
                userNotified: true,
                canRetry: shouldRetry
            };

        } catch (notificationError) {
            console.error('Error handling ticket creation error:', notificationError);
            return {
                success: false,
                error: error.message,
                userNotified: false,
                notificationError: notificationError.message
            };
        }
    }

    /**
     * Formats duration in milliseconds to human-readable string
     */
    formatDuration(milliseconds) {
        const seconds = Math.floor(milliseconds / 1000);
        const minutes = Math.floor(seconds / 60);
        const hours = Math.floor(minutes / 60);
        const days = Math.floor(hours / 24);

        if (days > 0) {
            return `${days} day${days !== 1 ? 's' : ''}, ${hours % 24} hour${hours % 24 !== 1 ? 's' : ''}`;
        } else if (hours > 0) {
            return `${hours} hour${hours !== 1 ? 's' : ''}, ${minutes % 60} minute${minutes % 60 !== 1 ? 's' : ''}`;
        } else if (minutes > 0) {
            return `${minutes} minute${minutes !== 1 ? 's' : ''}, ${seconds % 60} second${seconds % 60 !== 1 ? 's' : ''}`;
        } else {
            return `${seconds} second${seconds !== 1 ? 's' : ''}`;
        }
    }

    /**
     * Gets comprehensive error statistics for monitoring
     */
    getErrorStatistics(options = {}) {
        try {
            const errorLogs = this.tickets._errorLogs || [];
            const queuedTickets = this.tickets._queue || [];
            const failedQueue = this.tickets._failedQueue || [];
            const failedMessages = this.tickets._failedMessages || [];

            // Apply date filtering if specified
            let filteredErrors = errorLogs;
            if (options.dateFrom || options.dateTo) {
                const fromDate = options.dateFrom ? new Date(options.dateFrom) : new Date(0);
                const toDate = options.dateTo ? new Date(options.dateTo) : new Date();
                
                filteredErrors = errorLogs.filter(log => {
                    const logDate = new Date(log.timestamp);
                    return logDate >= fromDate && logDate <= toDate;
                });
            }

            const stats = {
                errorLogs: {
                    total: filteredErrors.length,
                    byOperation: {},
                    byErrorCode: {},
                    recent: filteredErrors.slice(-10)
                },
                queue: {
                    pending: queuedTickets.length,
                    failed: failedQueue.length,
                    oldestQueued: queuedTickets.length > 0 ? 
                        Math.floor((Date.now() - new Date(queuedTickets[0].queuedAt).getTime()) / 1000 / 60) : 0
                },
                failedMessages: {
                    total: failedMessages.length,
                    needingRetry: failedMessages.filter(msg => msg.retryCount < 3).length
                },
                systemHealth: {
                    supportServerConfigured: !!this.getSupportServer(),
                    lastErrorAt: errorLogs.length > 0 ? errorLogs[errorLogs.length - 1].timestamp : null
                }
            };

            // Count errors by operation
            filteredErrors.forEach(log => {
                stats.errorLogs.byOperation[log.operation] = 
                    (stats.errorLogs.byOperation[log.operation] || 0) + 1;
                
                if (log.error.code) {
                    stats.errorLogs.byErrorCode[log.error.code] = 
                        (stats.errorLogs.byErrorCode[log.error.code] || 0) + 1;
                }
            });

            return {
                success: true,
                statistics: stats,
                generatedAt: new Date().toISOString()
            };

        } catch (error) {
            console.error('Error generating error statistics:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }
}