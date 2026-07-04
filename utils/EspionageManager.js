import { EmbedBuilder, ChannelType, PermissionsBitField } from 'discord.js';
import fs from 'fs';
import path from 'path';

/**
 * EspionageManager - Système de Dossiers d'Espionnage pour Micronation
 * Permet de centraliser et de remplir automatiquement des dossiers de renseignement sur les membres.
 */
export class EspionageManager {
    constructor(client, guildConfig, warnManager = null) {
        this.client = client;
        this.guildConfig = guildConfig;
        this.warnManager = warnManager;
        this.filePath = path.join(process.cwd(), 'data/espionage_dossiers.json');
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
     * Recherche ou crée automatiquement le salon forum dédié aux dossiers d'espionnage
     */
    async getOrCreateForumChannel(guild) {
        const guildData = this.getGuildConfig(guild.id);
        
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
     * Récupère ou génère le post forum (dossier) pour un membre spécifique
     */
    async getOrCreateMemberDossier(member) {
        const guild = member.guild;
        const guildData = this.getGuildConfig(guild.id);
        const userId = member.id;

        const forumChannel = await this.getOrCreateForumChannel(guild);
        if (!forumChannel) return null;

        // Si le dossier existe déjà
        if (guildData.targets[userId] && guildData.targets[userId].threadId) {
            const thread = guild.channels.cache.get(guildData.targets[userId].threadId) || 
                           await guild.channels.activeThreads.fetch(guildData.targets[userId].threadId).catch(() => null);
            if (thread) return thread;
        }

        // Sinon, créer un nouveau post forum (dossier)
        try {
            const threatEmoji = this.getThreatEmoji('Low');
            const threadName = `${threatEmoji} dossiers-${member.user.username}-${userId.slice(-6)}`;
            
            const embed = this.buildDossierEmbed(member, 'Low', 0, []);

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

            console.log(`Dossier créé automatiquement pour ${member.user.username} (ID: ${userId})`);
            return thread;

        } catch (err) {
            console.error(`Failed to create member dossier for ${member.user.username}:`, err);
            return null;
        }
    }

    /**
     * Met à jour le contenu du dossier (embed principal du post)
     */
    async updateDossier(member) {
        const guildData = this.getGuildConfig(member.guild.id);
        const userId = member.id;
        const targetData = guildData.targets[userId];
        if (!targetData || !targetData.threadId) return;

        try {
            const thread = member.guild.channels.cache.get(targetData.threadId) || 
                           await member.guild.channels.activeThreads.fetch(targetData.threadId).catch(() => null);
            if (!thread) return;

            // Recalculer le niveau de menace
            const threatLevel = this.calculateThreatLevel(member, targetData);
            targetData.threatLevel = threatLevel;
            this.saveDossiers();

            // Mettre à jour le nom du thread avec l'emoji de menace approprié
            const threatEmoji = this.getThreatEmoji(threatLevel);
            const expectedName = `${threatEmoji} dossiers-${member.user.username}-${userId.slice(-6)}`;
            if (thread.name !== expectedName) {
                await thread.setName(expectedName).catch(() => null);
            }

            const embed = this.buildDossierEmbed(member, threatLevel, targetData.messageCount, targetData.notes);

            const messages = await thread.messages.fetch({ limit: 100 });
            const firstMessage = messages.find(m => m.author.id === this.client.user.id && m.embeds.length > 0);
            if (firstMessage) {
                await firstMessage.edit({ embeds: [embed] });
            }

        } catch (err) {
            console.error(`Error updating dossier for ${member.user.username}:`, err);
        }
    }

    /**
     * Incrémente le compteur de messages de l'utilisateur et met à jour son dossier
     */
    async recordMessage(message) {
        if (!message.guild || message.author.bot) return;

        const guildId = message.guild.id;
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
                const member = await message.guild.members.fetch(userId).catch(() => null);
                if (member) {
                    await this.updateDossier(member);
                }
            }
        }
    }

    /**
     * Ajoute une note manuelle (ou automatique) au dossier de la cible
     */
    async addNote(member, noteContent, authorId = 'system') {
        const guildData = this.getGuildConfig(member.guild.id);
        const userId = member.id;

        // S'assurer que le dossier existe
        const thread = await this.getOrCreateMemberDossier(member);
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
        await this.updateDossier(member);
        return true;
    }

    /**
     * Calcule le niveau de menace en fonction des avertissements et du comportement
     */
    calculateThreatLevel(member, targetData) {
        let score = 0;

        // Warnings
        if (this.warnManager) {
            const warns = this.warnManager.getWarns(member.id);
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

    buildDossierEmbed(member, threatLevel, messageCount, notes) {
        const threatEmoji = this.getThreatEmoji(threatLevel);
        const threatColor = this.getThreatColor(threatLevel);

        const createdDate = `<t:${Math.floor(member.user.createdTimestamp / 1000)}:R>`;
        const joinedDate = `<t:${Math.floor(member.joinedTimestamp / 1000)}:R>`;

        let warnsText = 'Aucun avertissement actif.';
        if (this.warnManager) {
            const warns = this.warnManager.getWarns(member.id);
            if (warns.length > 0) {
                warnsText = warns.map((w, index) => `${index + 1}. **${w.reason}** (par <@${w.moderator}> le <t:${Math.floor(new Date(w.date).getTime() / 1000)}:d>)`).join('\n');
            }
        }

        const recentNotes = notes.slice(-5).map(n => {
            const author = n.author === 'system' ? '💻 Système' : `<@${n.author}>`;
            return `• *le <t:${Math.floor(new Date(n.timestamp).getTime() / 1000)}:d>* : ${n.content} (par ${author})`;
        }).join('\n') || 'Aucune note rédigée pour le moment.';

        return new EmbedBuilder()
            .setColor(threatColor)
            .setTitle(`📂 DOSSIER CLASSÉ : ${member.user.username}`)
            .setDescription(`Fiche de renseignement confidentielle concernant le citoyen/sujet <@${member.id}>.`)
            .setThumbnail(member.user.displayAvatarURL({ dynamic: true }))
            .addFields(
                { name: '👤 Identité', value: `**Username:** ${member.user.username}\n**ID:** \`${member.id}\``, inline: true },
                { name: '⚠️ Niveau de Menace', value: `${threatEmoji} **${threatLevel.toUpperCase()}**`, inline: true },
                { name: '📅 Registre Temporel', value: `**Création compte:** ${createdDate}\n**Arrivée serveur:** ${joinedDate}`, inline: false },
                { name: '📊 Activité', value: `**Messages détectés:** \`${messageCount}\``, inline: true },
                { name: '🛡️ Rôles Actuels', value: member.roles.cache.filter(r => r.id !== member.guild.roles.everyone.id).map(r => `<@&${r.id}>`).join(', ') || 'Aucun rôle', inline: false },
                { name: '🚨 Historique des Infractions', value: warnsText, inline: false },
                { name: '🕵️ Derniers rapports d\'agents', value: recentNotes, inline: false }
            )
            .setFooter({ text: 'Service de Renseignement de Monteloria - Confidentiel Défense' })
            .setTimestamp();
    }
}
