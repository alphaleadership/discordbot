import { EmbedBuilder, PermissionsBitField, ChannelType } from 'discord.js';

export class CustomsManager {
    /**
     * @param {import('discord.js').Client} client - The Discord Client
     * @param {Object} guildConfig - The Enhanced Guild Config instance
     * @param {Object} reportManager - The Report Manager instance
     */
    constructor(client, guildConfig, reportManager) {
        this.client = client;
        this.guildConfig = guildConfig;
        this.reportManager = reportManager;
    }

    /**
     * Validates a user on the partner guild and generates an invite to the target guild (where customs is enabled)
     * This is run from the partner guild to let valid members join the customs-enabled guild.
     * @param {string} targetGuildId - The guild they want to join (customs enabled)
     * @param {import('discord.js').User} user - The user requesting validation
     * @returns {Promise<Object>} Verification results including invite link if successful
     */
    async verifyMemberPassport(targetGuildId, user) {
        const targetGuild = this.client.guilds.cache.get(targetGuildId);
        if (!targetGuild) {
            return { success: false, reason: 'Le serveur de destination est introuvable ou inaccessible par le bot.' };
        }

        const customsConfig = this.guildConfig.getCustomsConfig(targetGuildId);
        if (!customsConfig || !customsConfig.enabled) {
            return { success: false, reason: 'Le système de douane n\'est pas activé sur le serveur de destination.' };
        }

        const partnerGuildId = customsConfig.partnerGuildId;
        if (partnerGuildId !== this.client.guilds.cache.find(g => g.members.cache.has(user.id))?.id && !this.client.guilds.cache.get(partnerGuildId)?.members.cache.has(user.id)) {
            // We need to fetch the partner guild and user
            const partnerGuild = this.client.guilds.cache.get(partnerGuildId);
            if (!partnerGuild) {
                return { success: false, reason: 'Le serveur partenaire source est actuellement inaccessible.' };
            }
            
            const partnerMember = await partnerGuild.members.fetch(user.id).catch(() => null);
            if (!partnerMember) {
                return { success: false, reason: `Vous devez être membre de **${partnerGuild.name}** pour pouvoir passer la douane.` };
            }
        }

        const partnerGuild = this.client.guilds.cache.get(partnerGuildId);
        const partnerMember = await partnerGuild.members.fetch(user.id).catch(() => null);

        if (!partnerMember) {
            return { success: false, reason: `Vous devez être membre de **${partnerGuild?.name || 'serveur partenaire'}** pour pouvoir passer la douane.` };
        }

        // Run validation rules
        // 1. Required role
        if (customsConfig.requiredRoleId) {
            const hasRequiredRole = partnerMember.roles.cache.has(customsConfig.requiredRoleId) ||
                partnerMember.roles.cache.some(r => r.name.toLowerCase() === customsConfig.requiredRoleId.toLowerCase());
            if (!hasRequiredRole) {
                return { success: false, reason: `Vous ne possédez pas le rôle requis sur le serveur partenaire (${customsConfig.requiredRoleId}).` };
            }
        }

        // 2. Account age
        if (customsConfig.minAccountAgeDays > 0) {
            const accountAgeDays = (Date.now() - user.createdTimestamp) / (1000 * 60 * 60 * 24);
            if (accountAgeDays < customsConfig.minAccountAgeDays) {
                return { success: false, reason: `Votre compte Discord est trop récent (${Math.floor(accountAgeDays)} jours, requis: ${customsConfig.minAccountAgeDays} jours).` };
            }
        }

        // 3. Guild join age
        if (customsConfig.minGuildJoinDays > 0 && partnerMember.joinedTimestamp) {
            const joinAgeDays = (Date.now() - partnerMember.joinedTimestamp) / (1000 * 60 * 60 * 24);
            if (joinAgeDays < customsConfig.minGuildJoinDays) {
                return { success: false, reason: `Votre présence sur le serveur partenaire est trop récente (${Math.floor(joinAgeDays)} jours, requis: ${customsConfig.minGuildJoinDays} jours).` };
            }
        }

        // 4. Warnings
        if (customsConfig.maxWarnings > 0 && this.client.warnManager) {
            const warns = this.client.warnManager.getWarns(user.id);
            if (warns && warns.length > customsConfig.maxWarnings) {
                return { success: false, reason: `Vous avez trop d'avertissements sur ce serveur (${warns.length}/${customsConfig.maxWarnings}).` };
            }
        }

        // Generate Invite
        try {
            // Find a system channel or first text channel where bot can create invite
            const channel = targetGuild.rulesChannel || targetGuild.systemChannel || targetGuild.channels.cache.find(c => c.type === ChannelType.GuildText && c.permissionsFor(targetGuild.members.me).has(PermissionsBitField.Flags.CreateInstantInvite));
            
            if (!channel) {
                return { success: false, reason: 'Impossible de générer une invitation (droits ou salons textuels manquants).' };
            }

            const invite = await channel.createInvite({
                maxAge: 3600, // 1 hour
                maxUses: 1,    // 1 use
                unique: true,
                reason: `Passeport douanier validé pour ${user.tag}`
            });

            await this.logCustomsAction(targetGuild, customsConfig, {
                title: '🛂 Passeport Douane Délivré',
                description: `L'utilisateur **${user.tag}** (${user.id}) a validé son passeport depuis **${partnerGuild.name}** et a reçu une invitation à usage unique.`,
                color: '#00ffff'
            });

            return { success: true, inviteUrl: invite.url };

        } catch (inviteError) {
            console.error('Failed to create passport invite:', inviteError);
            return { success: false, reason: `Erreur lors de la génération de l'invitation: ${inviteError.message}` };
        }
    }

    /**
     * Performs cross-server passport check on a newly joined member
     * @param {import('discord.js').GuildMember} member - The member who joined
     * @returns {Promise<Object>} Verification results
     */
    async verifyMemberJoin(member) {
        const guild = member.guild;
        const customsConfig = this.guildConfig.getCustomsConfig(guild.id);

        // If customs system is disabled, do nothing
        if (!customsConfig || !customsConfig.enabled) {
            return { skipped: true, reason: 'Customs disabled' };
        }

        const partnerGuildId = customsConfig.partnerGuildId;
        if (!partnerGuildId) {
            await this.logCustomsAction(guild, customsConfig, {
                title: '⚠️ Erreur Douane : Aucun serveur partenaire configuré',
                description: `Le système de douane est activé sur **${guild.name}** mais aucun serveur partenaire n'est configuré.`,
                color: '#ffaa00'
            });
            return { error: true, reason: 'Partner guild not configured' };
        }

        // Fetch partner guild
        const partnerGuild = this.client.guilds.cache.get(partnerGuildId);
        if (!partnerGuild) {
            await this.logCustomsAction(guild, customsConfig, {
                title: '❌ Erreur Douane : Serveur partenaire inaccessible',
                description: `Le bot ne fait pas partie du serveur partenaire (ID: \`${partnerGuildId}\`) ou ce dernier est inaccessible.`,
                color: '#ff0000'
            });
            return { error: true, reason: 'Partner guild inaccessible' };
        }

        // Bypass roles check (if user already has a bypass role in target guild, which is unlikely but possible on re-join)
        const hasBypassRole = member.roles.cache.some(role => customsConfig.bypassRoles.includes(role.id));
        if (hasBypassRole) {
            return { success: true, bypassed: true, reason: 'Bypass role present' };
        }

        try {
            // Check member on partner guild
            const partnerMember = await partnerGuild.members.fetch(member.id).catch(() => null);

            // 1. Check if present on partner guild
            if (!partnerMember) {
                return await this.handleFailedCustoms(member, customsConfig, 'Non présent sur le serveur partenaire.');
            }

            // 2. Check required role on partner guild
            if (customsConfig.requiredRoleId) {
                const hasRequiredRole = partnerMember.roles.cache.has(customsConfig.requiredRoleId);
                if (!hasRequiredRole) {
                    return await this.handleFailedCustoms(
                        member, 
                        customsConfig, 
                        `Ne possède pas le rôle requis sur le serveur partenaire (\`${customsConfig.requiredRoleId}\`).`
                    );
                }
            }

            // 3. Check min account age days
            if (customsConfig.minAccountAgeDays > 0) {
                const accountAgeDays = (Date.now() - member.user.createdTimestamp) / (1000 * 60 * 60 * 24);
                if (accountAgeDays < customsConfig.minAccountAgeDays) {
                    return await this.handleFailedCustoms(
                        member,
                        customsConfig,
                        `Compte trop récent: ${Math.floor(accountAgeDays)}j (requis: ${customsConfig.minAccountAgeDays}j).`
                    );
                }
            }

            // 4. Check min guild join days on partner guild
            if (customsConfig.minGuildJoinDays > 0 && partnerMember.joinedTimestamp) {
                const joinAgeDays = (Date.now() - partnerMember.joinedTimestamp) / (1000 * 60 * 60 * 24);
                if (joinAgeDays < customsConfig.minGuildJoinDays) {
                    return await this.handleFailedCustoms(
                        member,
                        customsConfig,
                        `Présence sur le serveur partenaire trop récente: ${Math.floor(joinAgeDays)}j (requis: ${customsConfig.minGuildJoinDays}j).`
                    );
                }
            }

            // 5. Check warnings count (if warnManager is accessible)
            if (customsConfig.maxWarnings > 0 && this.client.warnManager) {
                const warns = this.client.warnManager.getWarns(member.id);
                if (warns && warns.length > customsConfig.maxWarnings) {
                    return await this.handleFailedCustoms(
                        member,
                        customsConfig,
                        `Nombre maximum d'avertissements dépassé: ${warns.length} avertissements (max autorisé: ${customsConfig.maxWarnings}).`
                    );
                }
            }

            // Passed customs!
            await this.logCustomsAction(guild, customsConfig, {
                title: '🛂 Douane : Accès Autorisé',
                description: `L'utilisateur **${member.user.tag}** (${member.id}) a passé la douane avec succès depuis **${partnerGuild.name}**.`,
                color: '#00ff00',
                fields: [
                    { name: 'Création de compte', value: `<t:${Math.floor(member.user.createdTimestamp / 1000)}:R>`, inline: true },
                    { name: 'Arrivée partenaire', value: partnerMember.joinedTimestamp ? `<t:${Math.floor(partnerMember.joinedTimestamp / 1000)}:R>` : 'Inconnue', inline: true }
                ]
            });

            return { success: true };

        } catch (error) {
            console.error('Error during customs check:', error);
            return { error: true, reason: error.message };
        }
    }

    /**
     * Handles member when verification fails
     * @param {import('discord.js').GuildMember} member - The member
     * @param {Object} config - The customs config
     * @param {string} reason - The failure reason
     */
    async handleFailedCustoms(member, config, reason) {
        const guild = member.guild;
        const action = config.actionOnFail || 'quarantine';

        let actionTaken = '';
        let success = false;

        // Try to notify the user via DM
        const dmEmbed = new EmbedBuilder()
            .setColor('#FF0000')
            .setTitle(`🛂 Accès refusé - ${guild.name}`)
            .setDescription(`Votre accès au serveur **${guild.name}** a été refusé par le système de douane automatique.\n\n**Raison :** ${reason}`)
            .setTimestamp();

        if (action === 'quarantine') {
            dmEmbed.addFields({ name: 'Action', value: 'Vous avez été placé en quarantaine sur le serveur. Un administrateur va évaluer votre situation.' });
        } else if (action === 'kick') {
            dmEmbed.addFields({ name: 'Action', value: 'Vous avez été expulsé du serveur. Vous pourrez essayer de le rejoindre à nouveau une fois les critères remplis.' });
        } else if (action === 'ban') {
            dmEmbed.addFields({ name: 'Action', value: 'Vous avez été banni du serveur.' });
        }

        await member.send({ embeds: [dmEmbed] }).catch(() => {});

        // Apply action
        if (action === 'quarantine') {
            let quarantineRoleId = config.quarantineRoleId;
            
            // Auto setup role if not configured
            if (!quarantineRoleId) {
                const quarantineSettings = this.guildConfig.getQuarantineSettings(guild.id);
                if (quarantineSettings && quarantineSettings.roleId) {
                    quarantineRoleId = quarantineSettings.roleId;
                } else {
                    // Try to find a role named quarantine
                    const role = guild.roles.cache.find(r => r.name.toLowerCase() === 'quarantaine' || r.name.toLowerCase() === 'quarantine');
                    if (role) {
                        quarantineRoleId = role.id;
                    }
                }
            }

            if (quarantineRoleId) {
                try {
                    await member.roles.add(quarantineRoleId, `Douane : Échec de la vérification. Raison : ${reason}`);
                    actionTaken = 'Mis en quarantaine';
                    success = true;
                } catch (err) {
                    console.error('Failed to apply quarantine role:', err);
                    actionTaken = `Échec de mise en quarantaine (Erreur: ${err.message})`;
                }
            } else {
                actionTaken = 'Échec de mise en quarantaine (Rôle de quarantaine non trouvé/configuré)';
            }
        } else if (action === 'kick') {
            try {
                await member.kick(`Douane : Échec de la vérification. Raison : ${reason}`);
                actionTaken = 'Expulsé';
                success = true;
            } catch (err) {
                console.error('Failed to kick member:', err);
                actionTaken = `Échec de l'expulsion (Erreur: ${err.message})`;
            }
        } else if (action === 'ban') {
            try {
                await member.ban({ reason: `Douane : Échec de la vérification. Raison : ${reason}` });
                actionTaken = 'Banni';
                success = true;
            } catch (err) {
                console.error('Failed to ban member:', err);
                actionTaken = `Échec du bannissement (Erreur: ${err.message})`;
            }
        }

        // Log the action
        await this.logCustomsAction(guild, config, {
            title: `🚨 Douane : Accès Refusé (${actionTaken})`,
            description: `L'utilisateur **${member.user.tag}** (${member.id}) n'a pas été admis sur le serveur.`,
            color: '#ff0000',
            fields: [
                { name: 'Raison du refus', value: reason, inline: false },
                { name: 'Action configurée', value: action.toUpperCase(), inline: true },
                { name: 'Statut action', value: success ? '✅ Appliquée' : '❌ Échouée', inline: true }
            ]
        });

        return { success: false, reason, actionTaken };
    }

    /**
     * Logs customs action in the configured channel
     * @param {import('discord.js').Guild} guild - The guild
     * @param {Object} config - The customs config
     * @param {Object} embedData - Data for log embed
     */
    async logCustomsAction(guild, config, embedData) {
        // Try customs log channel, fallback to general log channel
        let channelId = config.logChannelId;
        if (!channelId) {
            const guildConfigData = this.guildConfig.loadConfig()[guild.id] || {};
            channelId = guildConfigData.logChannelId;
        }

        if (!channelId) return;

        const channel = guild.channels.cache.get(channelId);
        if (!channel) return;

        const embed = new EmbedBuilder()
            .setTitle(embedData.title)
            .setDescription(embedData.description)
            .setColor(embedData.color || '#0099ff')
            .setTimestamp();

        if (embedData.fields) {
            embed.addFields(embedData.fields);
        }

        try {
            await channel.send({ embeds: [embed] });
        } catch (err) {
            console.error('Failed to send customs log message:', err);
        }
    }
}
