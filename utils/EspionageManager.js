import { EmbedBuilder, ChannelType, PermissionsBitField } from 'discord.js';
import fs from 'fs';
import path from 'path';

const ESPIONAGE_GUILD_ID = '1475239703853928523';

/**
 * EspionageManager - Système de Dossiers d'Espionnage pour Micronation
 * Permet de centraliser et de remplir automatiquement des dossiers de renseignement sur les membres.
 *
 * Depuis cette version, un dossier peut être créé/consulté même si la personne
 * n'est plus (ou pas) membre du serveur : on travaille avant tout avec un userId,
 * et on résout un objet User (toujours disponible via l'API Discord) ainsi
 * qu'un éventuel GuildMember (facultatif, uniquement si la personne est encore là).
 */
export class EspionageManager {
    constructor(client, guildConfig, warnManager = null, banlistManager = null) {
        this.client = client;
        this.guildConfig = guildConfig;
        this.warnManager = warnManager;
        this.banlistManager = banlistManager;
        this.filePath = path.join(process.cwd(), 'espionage_dossiers.json');
        this.dossiersData = this.loadDossiers();
        this.ensureFileExists();
    }

    ensureFileExists() {
        try {
            const dir = path.dirname(this.filePath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            if (!fs.existsSync(this.filePath)) {
                const defaultData = {
                    guilds: {}, // guildId -> { forumChannelId: null, targets: { userId: { threadId: null, messageCount: 0, threatLevel: 'Low', notes: [] } } }
                    metadata: {
                        version: '1.0',
                        created: new Date().toISOString(),
                        lastModified: new Date().toISOString()
                    }
                };
                fs.writeFileSync(this.filePath, JSON.stringify(defaultData, null, 2));
            }
        } catch (error) {
            console.error('Error ensuring espionage dossiers file exists:', error);
        }
    }

    loadDossiers() {
        try {
            if (fs.existsSync(this.filePath)) {
                const data = fs.readFileSync(this.filePath, 'utf-8');
                return JSON.parse(data);
            }
        } catch (error) {
            console.error('Error loading espionage dossiers:', error);
        }
        return { guilds: {}, metadata: { version: '1.0' } };
    }

    saveDossiers() {
        try {
            this.dossiersData.metadata = this.dossiersData.metadata || {};
            this.dossiersData.metadata.lastModified = new Date().toISOString();
            fs.writeFileSync(this.filePath, JSON.stringify(this.dossiersData, null, 2));
        } catch (error) {
            console.error('Error saving espionage dossiers:', error);
        }
    }

    /**
     * Obtenir ou créer la configuration d'espionnage pour une guilde
     */
    getGuildConfig(guildId) {
        if (!this.dossiersData.guilds[guildId]) {
            this.dossiersData.guilds[guildId] = {
                forumChannelId: null,
                targets: {}
            };
            this.saveDossiers();
        }
        return this.dossiersData.guilds[guildId];
    }

    /**
     * Résout la guilde d'espionnage principale (avec repli sur une guilde fournie).
     */
    async getEspionageGuild(fallbackGuild = null) {
        let guild = this.client.guilds.cache.get(ESPIONAGE_GUILD_ID) || fallbackGuild || null;
        try {
            if (!guild || guild.id !== ESPIONAGE_GUILD_ID) {
                const fetchedGuild = await this.client.guilds.fetch(ESPIONAGE_GUILD_ID).catch(() => null);
                if (fetchedGuild) guild = fetchedGuild;
            }
        } catch (e) {}
        return guild;
    }

    /**
     * Résout un User (toujours disponible) et, si possible, le GuildMember correspondant.
     * `target` peut être : un userId (string), un objet User, ou un objet GuildMember.
     * `fallbackGuild` est utilisé si la guilde d'espionnage n'est pas accessible en cache.
     */
    async resolveTarget(target, fallbackGuild = null) {
        let userId;
        let providedUser = null;
        let providedMember = null;

        if (typeof target === 'string') {
            userId = target;
        } else if (target?.user && target?.guild) {
            // Ressemble à un GuildMember
            providedMember = target;
            providedUser = target.user;
            userId = target.id;
        } else if (target?.id) {
            // Ressemble à un User brut
            providedUser = target;
            userId = target.id;
        } else {
            throw new Error('resolveTarget: cible invalide');
        }

        const guild = await this.getEspionageGuild(fallbackGuild || providedMember?.guild);

        const user = providedUser || await this.client.users.fetch(userId).catch(() => null);

        let member = providedMember;
        if (!member && guild) {
            member = await guild.members.fetch(userId).catch(() => null);
        }

        return { user, member, guild, userId };
    }

    /**
     * Recherche ou crée automatiquement le salon forum dédié aux dossiers d'espionnage
     */
    async getOrCreateForumChannel(guild) {
        const guildData = this.getGuildConfig(ESPIONAGE_GUILD_ID);

        // Tenter de retrouver le salon configuré
        if (guildData.forumChannelId) {
            const channel = guild.channels.cache.get(guildData.forumChannelId);
            if (channel) return channel;
        }

        // Sinon, chercher un salon nommé "📁︙dossiers-espionnage" ou similaire
        let channel = guild.channels.cache.find(ch =>
            (ch.name.includes('dossiers-espionnage') || ch.name.includes('dossiers-cibles')) &&
            ch.type === ChannelType.GuildForum
        );

        // Si introuvable, le créer
        if (!channel) {
            try {
                console.log(`Création du salon forum dossiers-espionnage dans ${guild.name}`);
                channel = await guild.channels.create({
                    name: '📁︙dossiers-espionnage',
                    type: ChannelType.GuildForum,
                    topic: 'Dossiers de renseignement confidentiels sur les cibles et membres du serveur.',
                    reason: 'Création automatique du système de dossiers d\'espionnage.'
                });

                // Configurer pour que seul le staff puisse voir ou poster si possible (mod-only par défaut)
                const everyone = guild.roles.everyone;
                const staffRoles = guild.roles.cache.filter(role =>
                    role.permissions.has(PermissionsBitField.Flags.ManageMessages) ||
                    role.name.toLowerCase().includes('moderator') ||
                    role.name.toLowerCase().includes('mod') ||
                    role.name.toLowerCase().includes('admin') ||
                    role.name.toLowerCase().includes('agent')
                );

                await channel.permissionOverwrites.create(everyone, {
                    ViewChannel: false,
                    SendMessages: false
                });

                for (const [_, role] of staffRoles) {
                    await channel.permissionOverwrites.create(role, {
                        ViewChannel: true,
                        SendMessages: true,
                        CreatePublicThreads: true,
                        ManageThreads: true
                    });
                }

            } catch (err) {
                console.error('Failed to create espionage forum channel:', err);
                return null;
            }
        }

        guildData.forumChannelId = channel.id;
        this.saveDossiers();
        return channel;
    }

    /**
     * Récupère ou génère le post forum (dossier) pour une cible.
     * `target` peut être un userId, un User, ou un GuildMember.
     */
    async getOrCreateMemberDossier(target, fallbackGuild = null) {
        const { user, member, guild, userId } = await this.resolveTarget(target, fallbackGuild);
        if (!user || !guild) return null;

        const guildData = this.getGuildConfig(ESPIONAGE_GUILD_ID);

        const forumChannel = await this.getOrCreateForumChannel(guild);
        if (!forumChannel) return null;

        // Si le dossier existe déjà
        if (guildData.targets[userId] && guildData.targets[userId].threadId) {
            console.log(`[DEBUG] Dossier existant trouvé pour ${userId} avec threadId ${guildData.targets[userId].threadId}. Résolution...`);
            const existingThread = await this.resolveThread(guild, guildData.targets[userId].threadId);
            if (existingThread) {
                console.log(`[DEBUG] Thread résolu avec succès pour ${userId}. Mise à jour du dossier...`);
                // Mettre à jour les informations du dossier (dont la banlist) si déjà ouvert
                await this.updateDossier(target, fallbackGuild);
                return existingThread;
            } else {
                console.log(`[DEBUG] Impossible de résoudre le thread existant ${guildData.targets[userId].threadId} pour ${userId}. Recréation...`);
            }
        }

        // Sinon, créer un nouveau post forum (dossier)
        try {
            const threatEmoji = this.getThreatEmoji('Low');
            const threadName = `${threatEmoji} dossiers-${user.username}-${userId.slice(-6)}`;

            const embed = await this.buildDossierEmbed(user, member, 'Low', 0, []);

            const thread = await forumChannel.threads.create({
                name: threadName,
                message: {
                    embeds: [embed]
                }
            });

            guildData.targets[userId] = {
                threadId: thread.id,
                messageCount: 0,
                threatLevel: 'Low',
                notes: []
            };
            this.saveDossiers();

            console.log(`Dossier créé automatiquement pour ${user.username} (ID: ${userId})${!member ? ' [membre absent du serveur]' : ''}`);
            return thread;

        } catch (err) {
            console.error(`Failed to create member dossier for ${user.username}:`, err);
            return null;
        }
    }

    async resolveThread(guild, threadId) {
        if (!guild || !threadId) return null;

        try {
            if (guild.channels?.cache?.get) {
                const cachedThread = guild.channels.cache.get(threadId);
                if (cachedThread) return cachedThread;
            }

            if (guild.channels?.fetch) {
                try {
                    const fetchedChannel = await guild.channels.fetch(threadId);
                    if (fetchedChannel?.isThread?.()) return fetchedChannel;
                } catch (e) {}
            }

            if (guild.channels?.activeThreads?.fetch) {
                try {
                    const activeThread = await guild.channels.activeThreads.fetch(threadId);
                    if (activeThread) return activeThread;
                } catch (e) {}
            }

            if (this.client?.channels?.fetch) {
                try {
                    const fetchedChannel = await this.client.channels.fetch(threadId);
                    if (fetchedChannel?.isThread?.()) return fetchedChannel;
                } catch (e) {}
            }
        } catch (err) {
            console.error('Error resolving espionage thread:', err);
        }

        return null;
    }

    /**
     * Met à jour le contenu du dossier (embed principal du post)
     */
    async updateDossier(target, fallbackGuild = null) {
        const { user, member, guild, userId } = await this.resolveTarget(target, fallbackGuild);
        if (!user || !guild) return;

        const guildData = this.getGuildConfig(ESPIONAGE_GUILD_ID);
        const targetData = guildData.targets[userId];
        if (!targetData || !targetData.threadId) return;

        try {
            const thread = await this.resolveThread(guild, targetData.threadId);
            if (!thread) return;

            // Recalculer le niveau de menace
            const threatLevel = this.calculateThreatLevel(userId, targetData);
            targetData.threatLevel = threatLevel;
            this.saveDossiers();

            // Mettre à jour le nom du thread avec l'emoji de menace approprié
            const threatEmoji = this.getThreatEmoji(threatLevel);
            const expectedName = `${threatEmoji} dossiers-${user.username}-${userId.slice(-6)}`;
            if (thread.name !== expectedName) {
                await thread.setName(expectedName).catch(() => null);
            }

            const embed = await this.buildDossierEmbed(user, member, threatLevel, targetData.messageCount, targetData.notes);

            const firstMessage = await thread.fetchStarterMessage().catch(() => null) || await thread.messages.fetch(thread.id).catch(() => null);
            if (firstMessage && firstMessage.author.id === this.client.user.id) {
                await firstMessage.edit({ embeds: [embed] });
            }

        } catch (err) {
            console.error(`Error updating dossier for ${user.username}:`, err);
        }
    }

    /**
     * Incrémente le compteur de messages de l'utilisateur et met à jour son dossier
     */
    async recordMessage(message) {
        if (!message.guild || message.author.bot) return;

        const guildId = ESPIONAGE_GUILD_ID;
        const userId = message.author.id;
        const guildData = this.getGuildConfig(guildId);

        // N'enregistrer que pour les dossiers déjà existants ou si on veut suivre tout le monde de façon passive
        // Dans une micronation, on suit en priorité ceux qui écrivent
        if (!guildData.targets[userId]) {
            guildData.targets[userId] = {
                threadId: null,
                messageCount: 0,
                threatLevel: 'Low',
                notes: []
            };
        }

        guildData.targets[userId].messageCount++;
        this.saveDossiers();

        // Mettre à jour périodiquement ou à chaque message s'il a déjà un dossier actif
        if (guildData.targets[userId].threadId) {
            // Pour éviter le spam d'API Discord, on ne met à jour l'embed principal que tous les 10 messages
            if (guildData.targets[userId].messageCount % 10 === 0) {
                await this.updateDossier(userId, message.guild);
            }
        }
    }

    /**
     * Ajoute une note manuelle (ou automatique) au dossier de la cible.
     * `target` peut être un userId, un User, ou un GuildMember (membre présent ou non).
     */
    async addNote(target, noteContent, authorId = 'system', fallbackGuild = null) {
        const { user, member, guild, userId } = await this.resolveTarget(target, fallbackGuild);
        if (!user || !guild) return false;

        const guildData = this.getGuildConfig(ESPIONAGE_GUILD_ID);

        // S'assurer que le dossier existe
        const thread = await this.getOrCreateMemberDossier(target, fallbackGuild);
        if (!thread) return false;

        const targetData = guildData.targets[userId];
        const noteEntry = {
            id: Date.now().toString(),
            content: noteContent,
            author: authorId,
            timestamp: new Date().toISOString()
        };

        targetData.notes.push(noteEntry);
        this.saveDossiers();

        // Envoyer la note comme message dans le post forum (thread)
        try {
            // Rechercher et supprimer les messages obsolètes ou doublons de cette note dans le thread
            const recentMessages = await thread.messages.fetch({ limit: 30 }).catch(() => null);
            if (recentMessages) {
                for (const msg of recentMessages.values()) {
                    if (msg.author.id === this.client.user.id && msg.embeds && msg.embeds.length > 0) {
                        const description = msg.embeds[0].description;
                        // Si le message a la même description (doublon) ou contient un rapport obsolète sur la même action
                        if (description === noteContent) {
                            await msg.delete().catch(() => null);
                        }
                    }
                }
            }

            const authorText = authorId === 'system' ? '💻 Système' : `<@${authorId}>`;
            const noteEmbed = new EmbedBuilder()
                .setColor('#2b2d31')
                .setAuthor({ name: 'Rapport d\'Agent / Note de Dossier' })
                .setDescription(noteContent)
                .addFields({ name: 'Agent', value: authorText, inline: true })
                .setTimestamp(new Date(noteEntry.timestamp));

            await thread.send({ embeds: [noteEmbed] });
        } catch (err) {
            console.error('Error sending note to thread:', err);
        }

        // Mettre à jour l'embed principal
        await this.updateDossier(userId, guild);
        return true;
    }

    /**
     * Calcule le niveau de menace en fonction des avertissements et du comportement.
     * Ne dépend que de l'userId : fonctionne donc même si la personne n'est plus membre.
     */
    calculateThreatLevel(userId, targetData) {
        let score = 0;

        // Warnings
        if (this.warnManager) {
            const warns = this.warnManager.getWarns(userId);
            score += warns.length * 3; // 3 points par warn
        }

        // Activité suspecte dans les notes
        const suspectNotes = targetData.notes.filter(n =>
            n.content.toLowerCase().includes('dox') ||
            n.content.toLowerCase().includes('raid') ||
            n.content.toLowerCase().includes('suspect') ||
            n.content.toLowerCase().includes('ban')
        );
        score += suspectNotes.length * 2;

        if (score >= 10) return 'Critical';
        if (score >= 6) return 'High';
        if (score >= 3) return 'Medium';
        return 'Low';
    }

    getThreatEmoji(level) {
        switch (level) {
            case 'Critical': return '🔴';
            case 'High': return '🟠';
            case 'Medium': return '🟡';
            case 'Low':
            default:
                return '🟢';
        }
    }

    getThreatColor(level) {
        switch (level) {
            case 'Critical': return 0xff0000;
            case 'High': return 0xffa500;
            case 'Medium': return 0xffff00;
            case 'Low':
            default:
                return 0x00ff00;
        }
    }

    /**
     * Construit l'embed du dossier.
     * `member` est facultatif : si null, on affiche que la cible n'est pas/plus sur le serveur
     * et on n'affiche pas les infos propres au membre (rôles, date d'arrivée).
     */
    async buildDossierEmbed(user, member, threatLevel, messageCount, notes) {
        const threatEmoji = this.getThreatEmoji(threatLevel);
        const threatColor = this.getThreatColor(threatLevel);

        const createdDate = `<t:${Math.floor(user.createdTimestamp / 1000)}:R>`;
        const joinedDate = member?.joinedTimestamp
            ? `<t:${Math.floor(member.joinedTimestamp / 1000)}:R>`
            : '⚠️ Non membre du serveur actuellement';

        let warnsText = 'Aucun avertissement actif.';
        if (this.warnManager) {
            const warns = this.warnManager.getWarns(user.id);
            if (warns.length > 0) {
                warnsText = warns.map((w, index) => `${index + 1}. **${w.reason}** (par <@${w.moderator}> le <t:${Math.floor(new Date(w.date).getTime() / 1000)}:d>)`).join('\n');
            }
        }

        const recentNotes = notes.slice(-5).map(n => {
            const author = n.author === 'system' ? '💻 Système' : `<@${n.author}>`;
            return `• *le <t:${Math.floor(new Date(n.timestamp).getTime() / 1000)}:d>* : ${n.content} (par ${author})`;
        }).join('\n') || 'Aucune note rédigée pour le moment.';

        let banStatusText = 'Non présent dans la banlist';
        if (this.banlistManager) {
            const banGuildId = member?.guild?.id || ESPIONAGE_GUILD_ID;
            const banCheck = await this.banlistManager.isBanned(user.id, banGuildId);
            if (banCheck.banned) {
                banStatusText = `🔴 **BANNI (Banlist Interne)**\n**Raison :** ${banCheck.reason}`;
            } else if (member?.guild) {
                // Tenter de récupérer le ban directement depuis Discord pour voir s'il y a un ban actif et sa raison
                try {
                    const discordBan = await member.guild.bans.fetch(user.id).catch(() => null);
                    if (discordBan) {
                        banStatusText = `🔴 **BANNI (Discord)**\n**Raison :** ${discordBan.reason || 'Aucune raison spécifiée dans l\'audit log'}`;
                    }
                } catch (e) {
                    // Ignorer les erreurs de permission si le bot ne peut pas lister les bans
                }
            }
        }

        const rolesText = member
            ? (member.roles.cache.filter(r => r.id !== member.guild.roles.everyone.id).map(r => `<@&${r.id}>`).join(', ') || 'Aucun rôle')
            : '⚠️ Non membre du serveur actuellement';

        const avatarUrl = typeof user?.displayAvatarURL === 'function'
            ? user.displayAvatarURL({ dynamic: true })
            : null;

        const embed = new EmbedBuilder()
            .setColor(threatColor)
            .setTitle(`📂 DOSSIER CLASSÉ : ${user.username}`)
            .setDescription(`Fiche de renseignement confidentielle concernant le citoyen/sujet <@${user.id}>.${!member ? '\n⚠️ *Cette personne n\'est pas (ou plus) membre du serveur.*' : ''}`)
            .addFields(
                { name: '👤 Identité', value: `**Username:** ${user.username}\n**ID:** \`${user.id}\``, inline: true },
                { name: '⚠️ Niveau de Menace', value: `${threatEmoji} **${threatLevel.toUpperCase()}**`, inline: true },
                { name: '📅 Registre Temporel', value: `**Création compte:** ${createdDate}\n**Arrivée serveur:** ${joinedDate}`, inline: false },
                { name: '📊 Activité', value: `**Messages détectés:** \`${messageCount}\``, inline: true },
                { name: '🛑 Statut Banlist', value: banStatusText, inline: true },
                { name: '🛡️ Rôles Actuels', value: rolesText, inline: false },
                { name: '🚨 Historique des Infractions', value: warnsText, inline: false },
                { name: '🕵️ Derniers rapports d\'agents', value: recentNotes, inline: false }
            )
            .setFooter({ text: 'Service de Renseignement de Monteloria - Confidentiel Défense' })
            .setTimestamp();

        if (avatarUrl) {
            embed.setThumbnail(avatarUrl);
        }

        return embed;
    }

    /**
     * Supprime tous les threads de dossiers d'espionnage existants sur le serveur d'espionnage principal.
     */
    async clearAllDossiers(interactionGuild) {
        const guild = await this.getEspionageGuild(interactionGuild);
        if (!guild) return 0;

        const forumChannel = await this.getOrCreateForumChannel(guild);
        if (!forumChannel) return 0;

        let deleteCount = 0;

        // Fetch active threads
        const active = await forumChannel.threads.fetchActive().catch(() => ({ threads: new Map() }));
        for (const [_, thread] of active.threads) {
            if (thread.name.includes('dossiers-')) {
                await thread.delete('Nettoyage général des dossiers d\'espionnage.').catch(() => null);
                deleteCount++;
            }
        }

        // Fetch archived threads
        const archived = await forumChannel.threads.fetchArchived().catch(() => ({ threads: new Map() }));
        for (const [_, thread] of archived.threads) {
            if (thread.name.includes('dossiers-')) {
                await thread.delete('Nettoyage général des dossiers d\'espionnage.').catch(() => null);
                deleteCount++;
            }
        }

        // Reset local JSON config data for this guild targets
        const guildData = this.getGuildConfig(guild.id);
        guildData.targets = {};
        this.saveDossiers();

        return deleteCount;
    }

    /**
     * Régénère entièrement tous les dossiers d'espionnage sur Discord à partir des données locales JSON.
     */
    async regenerateAllDossiers(interactionGuild) {
        const guild = await this.getEspionageGuild(interactionGuild);
        if (!guild) return { success: false, message: "Serveur d'espionnage introuvable." };

        const forumChannel = await this.getOrCreateForumChannel(guild);
        if (!forumChannel) return { success: false, message: "Salon forum d'espionnage introuvable." };

        // 1. Supprimer les threads Discord existants
        const active = await forumChannel.threads.fetchActive().catch(() => ({ threads: new Map() }));
        for (const [_, thread] of active.threads) {
            if (thread.name.includes('dossiers-')) {
                await thread.delete('Régénération globale : suppression de l\'ancien fil.').catch(() => null);
            }
        }
        const archived = await forumChannel.threads.fetchArchived().catch(() => ({ threads: new Map() }));
        for (const [_, thread] of archived.threads) {
            if (thread.name.includes('dossiers-')) {
                await thread.delete('Régénération globale : suppression de l\'ancien fil.').catch(() => null);
            }
        }

        const guildData = this.getGuildConfig(guild.id);
        const targetIds = Object.keys(guildData.targets);
        let recreatedCount = 0;

        // 2. Recréer chaque dossier un par un
        for (const targetId of targetIds) {
            const targetData = guildData.targets[targetId];
            
            // Résoudre la cible (User/Member)
            const resolved = await this.resolveTarget(targetId, guild).catch(() => null);
            if (!resolved || !resolved.user) continue;

            const { user, member } = resolved;
            const threatEmoji = this.getThreatEmoji(targetData.threatLevel || 'Low');
            const threadName = `${threatEmoji} dossiers-${user.username}-${targetId.slice(-6)}`;

            const embed = await this.buildDossierEmbed(user, member, targetData.threatLevel || 'Low', targetData.messageCount || 0, targetData.notes || []);

            try {
                // Créer le nouveau thread forum
                const thread = await forumChannel.threads.create({
                    name: threadName,
                    message: {
                        embeds: [embed]
                    }
                });

                // Mettre à jour l'ID du thread dans la configuration locale
                targetData.threadId = thread.id;
                recreatedCount++;

                // Reposter toutes les notes existantes
                if (targetData.notes && targetData.notes.length > 0) {
                    for (const note of targetData.notes) {
                        const authorText = note.author === 'system' ? '💻 Système' : `<@${note.author}>`;
                        const noteEmbed = new EmbedBuilder()
                            .setColor('#2b2d31')
                            .setAuthor({ name: 'Rapport d\'Agent / Note de Dossier' })
                            .setDescription(note.content)
                            .addFields({ name: 'Agent', value: authorText, inline: true })
                            .setTimestamp(new Date(note.timestamp));

                        await thread.send({ embeds: [noteEmbed] }).catch(() => null);
                    }
                }
            } catch (err) {
                console.error(`Erreur lors de la régénération du dossier pour ${user.username}:`, err);
            }
        }

        this.saveDossiers();
        return { success: true, count: recreatedCount };
    }

    /**
     * Supprime le dossier d'un membre spécifique (suppression du thread Discord + reset des notes locales)
     */
    async clearMemberDossier(target, fallbackGuild = null) {
        const { user, guild, userId } = await this.resolveTarget(target, fallbackGuild);
        if (!user || !guild) return { success: false, message: "Cible ou serveur d'espionnage introuvable." };

        const guildData = this.getGuildConfig(guild.id);
        const targetData = guildData.targets[userId];

        if (targetData) {
            // 1. Supprimer le thread Discord s'il existe
            if (targetData.threadId) {
                const thread = await this.resolveThread(guild, targetData.threadId);
                if (thread) {
                    await thread.delete('Dossier effacé par commande administrative.').catch(() => null);
                }
            }
            
            // 2. Supprimer ou réinitialiser les données locales
            delete guildData.targets[userId];
            this.saveDossiers();
            return { success: true, username: user.username };
        }

        return { success: false, message: "Aucun dossier enregistré pour ce membre." };
    }
}