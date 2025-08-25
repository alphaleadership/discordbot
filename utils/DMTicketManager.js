import { EmbedBuilder, TextChannel } from 'discord.js';
import { TicketStorage } from './TicketStorage.js';

export class DMTicketManager {
    constructor(client) {
        this.client = client;
        this.ticketCooldown = new Map(); // userID -> timestamp
        this.COOLDOWN_TIME = 60000; // 1 minute cooldown between ticket creations
        this.storage = new TicketStorage();
    }

    /**
     * Trouve un ticket existant pour un utilisateur
     * @param {string} userId - L'ID de l'utilisateur
     * @returns {Promise<import('discord.js').ThreadChannel|null>}
     */
    async findExistingTicket(userId) {
        try {
            // Vérifier d'abord dans le stockage
            const ticket = await this.storage.getTicket(userId);
            if (!ticket) return null;
            
            // Vérifier si le thread existe toujours
            const reportChannel = await this.client.channels.fetch(ticket.channelId);
            if (!reportChannel) {
                await this.storage.deleteTicket(userId);
                return null;
            }
            
            try {
                const thread = await reportChannel.threads.fetch(ticket.threadId);
                if (!thread) {
                    await this.storage.deleteTicket(userId);
                    return null;
                }
                return thread;
            } catch (error) {
                await this.storage.deleteTicket(userId);
                return null;
            }

            // Si on arrive ici, le thread n'existe plus mais était dans le stockage
            // On a déjà nettoyé le stockage, on peut retourner null
            
            // Vérifier les threads archivés
            const existingArchivedThread = [...archivedThreads.threads.values()]
                .find(thread => thread.topic === userId);
                
            if (existingArchivedThread) {
                // Réactiver le thread archivé
                await existingArchivedThread.setArchived(false);
                return existingArchivedThread;
            }
            
            return null;
        } catch (error) {
            console.error('Error finding existing ticket:', error);
            return null;
        }
    }

    /**
     * Crée un nouveau ticket pour l'utilisateur
     * @param {import('discord.js').Message} message - Le message de l'utilisateur
     * @returns {Promise<void>}
     */
    async createNewTicket(message) {
        // Le code existant de création de ticket...
        const reportManager = new (require('./ReportManager.js')).ReportManager();
        const reportChannel = await this.client.channels.fetch(reportManager.REPORT_CHANNEL_ID);
        
        if (!reportChannel) {
            console.error('Report channel not found');
            return message.channel.send(
                'Désolé, le salon de rapport est actuellement indisponible. Veuillez réessayer plus tard.'
            );
        }

        try {
            const thread = await reportChannel.threads.create({
                name: `ticket-${message.author.username}-${Date.now().toString().slice(-4)}`,
                autoArchiveDuration: 60,
                reason: `Ticket créé par ${message.author.tag}`,
                type: 'GUILD_PUBLIC_THREAD',
                invitable: true
            });
            
            await thread.send({
                content: ` Nouveau ticket de ${message.author.tag} (${message.author.id})`
            });
            
            // Enregistrer le ticket dans le stockage
            await this.storage.createTicket(
                message.author.id,
                thread.id,
                reportChannel.id
            );
            
            await thread.setTopic(message.author.id);
            
            // Envoyer le message initial dans le ticket
            await this.forwardMessageToThread(message, thread);
            
            // Envoyer la confirmation à l'utilisateur
            await message.channel.send({
                embeds: [
                    new EmbedBuilder()
                        .setColor('#2ecc71')
                        .setTitle('✅ Ticket Créé')
                        .setDescription(`Votre ticket a été créé avec succès !\n\n**Message:** ${message.content}`)
                        .setFooter({ text: 'Un membre de l\'équipe vous répondra bientôt.' })
                ]
            });
            
            return thread;
        } catch (error) {
            console.error('Error creating ticket:', error);
            return message.channel.send(
                'Une erreur est survenue lors de la création de votre ticket. Veuillez réessayer plus tard.'
            );
        }
    }

    /**
     * Transfère un message vers un thread de ticket
     * @param {import('discord.js').Message} message - Le message à transférer
     * @param {import('discord.js').ThreadChannel} thread - Le thread de destination
     */
    async forwardMessageToThread(message, thread) {
        try {
            const embed = new EmbedBuilder()
                .setColor('#3498db')
                .setAuthor({
                    name: message.author.tag,
                    iconURL: message.author.displayAvatarURL()
                })
                .setDescription(message.content)
                .setFooter({ text: `Message reçu le ${new Date().toLocaleString('fr-FR')}` });
            
            // Ajouter les pièces jointes s'il y en a
            if (message.attachments.size > 0) {
                const attachments = message.attachments.map(a => a.url);
                embed.addFields({
                    name: 'Pièces jointes',
                    value: attachments.join('\n')
                });
            }
            
            await thread.send({ embeds: [embed] });
        } catch (error) {
            console.error('Error forwarding message to thread:', error);
        }
    }

    async handleDM(message) {
        if (message.channel.type !== 1) return; // Only handle DMs
        if (message.author.bot) return;

        // Vérifier le cooldown
        const now = Date.now();
        const cooldown = this.ticketCooldown.get(message.author.id) || 0;
        if (now - cooldown < this.COOLDOWN_TIME) {
            const timeLeft = Math.ceil((this.COOLDOWN_TIME - (now - cooldown)) / 1000);
            return message.channel.send(
                `Veuillez patienter ${timeLeft} secondes avant de créer un nouveau ticket.`
            );
        }

        // Vérifier si l'utilisateur a déjà un ticket
        const existingTicket = await this.findExistingTicket(message.author.id);
        
        if (existingTicket) {
            // Transférer le message vers le ticket existant
            await this.forwardMessageToThread(message, existingTicket);
            
            // Répondre à l'utilisateur
            await message.channel.send({
                embeds: [
                    new EmbedBuilder()
                        .setColor('#3498db')
                        .setDescription('✅ Votre message a été transféré à votre ticket existant.')
                ]
            });
            return;
        }
        
        // Si pas de ticket existant, créer un nouveau ticket
        await this.createNewTicket(message);
        
        // Mettre à jour le cooldown
        this.ticketCooldown.set(message.author.id, now);
        const reportManager = new (require('./ReportManager.js')).ReportManager();
        const reportChannel = await this.client.channels.fetch(reportManager.REPORT_CHANNEL_ID);
        
        if (!reportChannel) {
            console.error('Report channel not found');
            return message.channel.send(
                'Désolé, le salon de rapport est actuellement indisponible. Veuillez réessayer plus tard.'
            );
        }

        // Create a thread for the ticket
        let thread;
        try {
            thread = await reportChannel.threads.create({
                name: `ticket-${message.author.username}-${Date.now().toString().slice(-4)}`,
                autoArchiveDuration: 60,
                reason: `Ticket créé par ${message.author.tag}`,
                type: 'GUILD_PUBLIC_THREAD',
                invitable: true // Permet à tout le monde de rejoindre le thread
            });
            
            // Autoriser tout le monde à envoyer des messages dans le thread
            await thread.send({
                content: ` - Nouveau ticket de ${message.author.tag} (${message.author.id})`
            });
            // Set the thread's topic to the user's ID for reference
            await thread.setTopic(message.author.id);
        } catch (error) {
            console.error('Error creating ticket thread:', error);
            return message.channel.send(
                'Une erreur est survenue lors de la création du ticket. Veuillez réessayer plus tard.'
            );
        }

        try {
            // Create ticket embed
            const ticketEmbed = new EmbedBuilder()
                .setColor('#3498db')
                .setTitle('🎫 Nouveau Ticket de Support')
                .setDescription(`**De:** ${message.author.tag} (${message.author.id})`)
                .addFields(
                    { name: 'Message', value: message.content || 'Aucun message fourni' },
                    { name: 'Compte créé le', value: message.author.createdAt.toLocaleString('fr-FR') }
                )
                .setThumbnail(message.author.displayAvatarURL())
                .setTimestamp();

            // Send the ticket message in the thread
            const ticketMessage = await thread.send({
                content: `<@&${process.env.SUPPORT_ROLE_ID || ''}>`,
                embeds: [ticketEmbed],
                components: [
                    {
                        type: 1,
                        components: [
                            {
                                type: 2,
                                style: 3,
                                customId: `close_ticket`,
                                label: 'Fermer le ticket',
                                emoji: '🔒'
                            }
                        ]
                    }
                ]
            });

            // Send confirmation to user
            await message.channel.send({
                embeds: [
                    new EmbedBuilder()
                        .setColor('#2ecc71')
                        .setTitle('✅ Ticket Créé')
                        .setDescription(`Votre ticket a été créé avec succès sur le serveur de support !\n\n**Message:** ${message.content}`)
                        .setFooter({ text: 'Un membre de l\'équipe vous répondra bientôt.' })
                ]
            });

            // Set cooldown
            this.ticketCooldown.set(message.author.id, now);

            // Log ticket creation
            console.log(`New ticket created by ${message.author.tag} (${message.author.id})`);

            return ticketMessage;
        } catch (error) {
            console.error('Error creating ticket:', error);
            return message.channel.send(
                'Une erreur est survenue lors de la création de votre ticket. Veuillez réessayer plus tard.'
            );
        }
    }

    async handleTicketClose(interaction) {
        if (!interaction.isButton() || interaction.customId !== 'close_ticket') return;

        // Vérifier les permissions d'abord
        if (!interaction.member.permissions.has('ManageMessages')) {
            return interaction.reply({
                content: '❌ Vous n\'avez pas la permission de fermer ce ticket.',
                ephemeral: true
            });
        }

        // Récupérer l'utilisateur depuis le topic du thread
        const userId = interaction.channel.topic;
        if (!userId) {
            return interaction.reply({
                content: '❌ Impossible de trouver l\'utilisateur associé à ce ticket.',
                ephemeral: true
            });
        }
        
        // Mettre à jour le statut du ticket
        await this.storage.closeTicket(userId);
        
        try {
            // Get the ticket message and remove components
            const messages = await interaction.channel.messages.fetch();
            for (const [_, msg] of messages) {
                if (msg.components && msg.components.length > 0) {
                    await msg.edit({ components: [] });
                }
            }

            // Send closing message and archive the thread
            await interaction.reply({
                embeds: [
                    new EmbedBuilder()
                        .setColor('#e74c3c')
                        .setDescription(`✅ Ticket fermé par ${interaction.user}`)
                ]
            });

            // Archive the thread
            await interaction.channel.setArchived(true);

            // Try to notify the user who created the ticket
            try {
                const user = await this.client.users.fetch(userId);
                await user.send({
                    embeds: [
                        new EmbedBuilder()
                            .setColor('#e74c3c')
                            .setTitle('🔒 Ticket Fermé')
                            .setDescription('Votre ticket sur le serveur de support a été fermé.')
                            .addFields(
                                { name: 'Fermé par', value: interaction.user.tag },
                                { name: 'Date', value: new Date().toLocaleString('fr-FR') }
                            )
                    ]
                });
            } catch (dmError) {
                console.error('Could not DM user about ticket closure:', dmError);
            }

        } catch (error) {
            console.error('Error closing ticket:', error);
            if (!interaction.replied) {
                await interaction.reply({
                    content: 'Une erreur est survenue lors de la fermeture du ticket.',
                    ephemeral: true
                });
            }
        }
    }
}
