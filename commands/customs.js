import { SlashCommandBuilder, EmbedBuilder, ChannelType, PermissionsBitField, ActionRowBuilder, StringSelectMenuBuilder, ComponentType } from 'discord.js';

export default {
    data: new SlashCommandBuilder()
        .setName('customs')
        .setDescription('Configure le système de douane entre deux serveurs')
        .addSubcommand(subcommand =>
            subcommand
                .setName('status')
                .setDescription('Affiche le statut actuel de la douane pour ce serveur'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('enable')
                .setDescription('Active la douane pour ce serveur')
                .addStringOption(option =>
                    option.setName('partner_guild_id')
                        .setDescription('L\'ID du serveur partenaire source')
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('action')
                        .setDescription('Action à effectuer en cas d\'échec de vérification')
                        .setRequired(true)
                        .addChoices(
                            { name: 'Mettre en quarantaine', value: 'quarantine' },
                            { name: 'Expulser (Kick)', value: 'kick' },
                            { name: 'Bannir (Ban)', value: 'ban' }
                        )))
        .addSubcommand(subcommand =>
            subcommand
                .setName('disable')
                .setDescription('Désactive la douane pour ce serveur'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('configure')
                .setDescription('Configure les règles et options de douane via menu ou options')
                .addRoleOption(option =>
                    option.setName('required_role')
                        .setDescription('Rôle requis sur le serveur partenaire')
                        .setRequired(false))
                .addIntegerOption(option =>
                    option.setName('min_account_age')
                        .setDescription('Ancienneté minimale du compte en jours')
                        .setRequired(false)
                        .setMinValue(0))
                .addIntegerOption(option =>
                    option.setName('min_join_age')
                        .setDescription('Ancienneté minimale sur le serveur partenaire en jours')
                        .setRequired(false)
                        .setMinValue(0))
                .addIntegerOption(option =>
                    option.setName('max_warnings')
                        .setDescription('Nombre maximum d\'avertissements tolérés')
                        .setRequired(false)
                        .setMinValue(0))
                .addChannelOption(option =>
                    option.setName('log_channel')
                        .setDescription('Salon pour les logs de douane')
                        .setRequired(false)
                        .addChannelTypes(ChannelType.GuildText))
                .addRoleOption(option =>
                    option.setName('quarantine_role')
                        .setDescription('Rôle de quarantaine local')
                        .setRequired(false)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('bypass')
                .setDescription('Gère les rôles exemptés de douane (Bypass)')
                .addStringOption(option =>
                    option.setName('action')
                        .setDescription('Ajouter ou retirer un rôle')
                        .setRequired(true)
                        .addChoices(
                            { name: 'Ajouter', value: 'add' },
                            { name: 'Retirer', value: 'remove' }
                        ))
                .addRoleOption(option =>
                    option.setName('role')
                        .setDescription('Rôle concerné')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('test')
                .setDescription('Simule une vérification douanière pour un utilisateur')
                .addUserOption(option =>
                    option.setName('user')
                        .setDescription('Utilisateur à tester')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('passport')
                .setDescription('Génère une invitation de douane pour un utilisateur éligible')
                .addUserOption(option =>
                    option.setName('user')
                        .setDescription('L\'utilisateur à valider')
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('target_guild_id')
                        .setDescription('L\'ID du serveur de destination (où la douane est activée)')
                        .setRequired(true))),

    async execute(interaction, adminManager, warnManager, guildConfig, sharedConfig, backupToGitHub, reportManager, banlistManager, blockedWordsManager, watchlistManager, telegramIntegration, funCommandsManager, raidDetector, doxDetector, enhancedReloadSystem, permissionValidator, economyManager, forumReportManager, autoConfigManager, dmTicketManager, customsManager) {
        try {
            if (!customsManager) {
                return await interaction.reply({
                    content: '❌ Le système de douane n\'est pas disponible.',
                    ephemeral: true
                });
            }

            const subcommand = interaction.options.getSubcommand();
            const guildId = interaction.guild.id;

            // Only admins or members with Manage Server permission can manage or execute customs commands
            const isBotAdmin = adminManager.isAdmin(interaction.user.id);
            const isGuildStaff = interaction.member && (
                interaction.member.permissions.has(PermissionsBitField.Flags.ManageGuild) ||
                interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)
            );

            if (!isBotAdmin && !isGuildStaff) {
                return await interaction.reply({
                    content: '❌ Vous devez être administrateur du bot ou avoir la permission de gérer le serveur pour utiliser cette commande.',
                    ephemeral: true
                });
            }

            switch (subcommand) {
                case 'status':
                    await this.handleStatus(interaction, customsManager, guildId);
                    break;
                case 'enable':
                    await this.handleEnable(interaction, customsManager, guildId);
                    break;
                case 'disable':
                    await this.handleDisable(interaction, customsManager, guildId);
                    break;
                case 'configure':
                    await this.handleConfigure(interaction, customsManager, guildId);
                    break;
                case 'bypass':
                    await this.handleBypass(interaction, customsManager, guildId);
                    break;
                case 'test':
                    await this.handleTest(interaction, customsManager);
                    break;
                case 'passport':
                    await this.handlePassport(interaction, customsManager);
                    break;
            }

        } catch (error) {
            console.error('Error in customs command:', error);
            await interaction.reply({
                content: '❌ Une erreur est survenue lors de l\'exécution de la commande.',
                ephemeral: true
            });
        }
    },

    async handleStatus(interaction, customsManager, guildId) {
        const config = customsManager.guildConfig.getCustomsConfig(guildId);
        
        const partnerGuildName = config.partnerGuildId ? 
            (interaction.client.guilds.cache.get(config.partnerGuildId)?.name || `ID: ${config.partnerGuildId} (Serveur Introuvable)`) : 
            'Aucun';

        const embed = new EmbedBuilder()
            .setColor(config.enabled ? '#00ff00' : '#ff0000')
            .setTitle('🛂 Statut du Système de Douane')
            .setDescription(`Configuration actuelle pour **${interaction.guild.name}**`)
            .addFields(
                { name: 'État', value: config.enabled ? '✅ Activé' : '❌ Désactivé', inline: true },
                { name: 'Serveur Partenaire', value: partnerGuildName, inline: true },
                { name: 'Action en cas d\'échec', value: config.actionOnFail.toUpperCase(), inline: true },
                { name: 'Rôle requis (partenaire)', value: config.requiredRoleId ? (/^\d+$/.test(config.requiredRoleId) ? `<@&${config.requiredRoleId}>` : `\`${config.requiredRoleId}\``) : 'Aucun', inline: true },
                { name: 'Âge compte requis', value: config.minAccountAgeDays ? `${config.minAccountAgeDays} jours` : 'Aucun', inline: true },
                { name: 'Ancienneté partenaire requise', value: config.minGuildJoinDays ? `${config.minGuildJoinDays} jours` : 'Aucun', inline: true },
                { name: 'Warnings max autorisés', value: `${config.maxWarnings}`, inline: true },
                { name: 'Salon de Logs', value: config.logChannelId ? `<#${config.logChannelId}>` : 'Canal par défaut', inline: true },
                { name: 'Rôle Quarantaine local', value: config.quarantineRoleId ? `<@&${config.quarantineRoleId}>` : 'Défaut / Auto-détecté', inline: true }
            );

        if (config.bypassRoles && config.bypassRoles.length > 0) {
            embed.addFields({
                name: '👥 Rôles bypass localement',
                value: config.bypassRoles.map(id => `<@&${id}>`).join(', '),
                inline: false
            });
        } else {
            embed.addFields({ name: '👥 Rôles bypass localement', value: 'Aucun', inline: false });
        }

        await interaction.reply({ embeds: [embed] });
    },

    async handleEnable(interaction, customsManager, guildId) {
        const partnerGuildId = interaction.options.getString('partner_guild_id');
        const action = interaction.options.getString('action');

        // Check if partner guild exists
        const partnerGuild = interaction.client.guilds.cache.get(partnerGuildId);
        const partnerGuildName = partnerGuild ? partnerGuild.name : `ID: ${partnerGuildId}`;

        customsManager.guildConfig.updateCustomsConfig(guildId, {
            enabled: true,
            partnerGuildId,
            actionOnFail: action
        });

        await interaction.reply({
            content: `✅ **Système de douane activé !**\nLes nouveaux membres devront désormais justifier d'une présence sur **${partnerGuildName}**.\nEn cas d'échec, l'action **${action}** sera appliquée.${!partnerGuild ? '\n⚠️ *Note : Le bot n\'a pas pu accéder directement à ce serveur partenaire (le bot n\'est peut-être pas dessus ou le serveur est inaccessible pour le moment).*' : ''}`,
            ephemeral: false
        });
    },

    async handleDisable(interaction, customsManager, guildId) {
        customsManager.guildConfig.updateCustomsConfig(guildId, {
            enabled: false
        });

        await interaction.reply({
            content: '❌ **Système de douane désactivé.** Les vérifications de frontière inter-serveurs ne sont plus actives.',
            ephemeral: false
        });
    },

    async handleConfigure(interaction, customsManager, guildId) {
        const requiredRole = interaction.options.getRole('required_role');
        const minAccountAge = interaction.options.getInteger('min_account_age');
        const minJoinAge = interaction.options.getInteger('min_join_age');
        const maxWarnings = interaction.options.getInteger('max_warnings');
        const logChannel = interaction.options.getChannel('log_channel');
        const quarantineRole = interaction.options.getRole('quarantine_role');

        const updates = {};
        if (requiredRole !== null) updates.requiredRoleId = requiredRole.id;
        if (minAccountAge !== null) updates.minAccountAgeDays = minAccountAge;
        if (minJoinAge !== null) updates.minGuildJoinDays = minJoinAge;
        if (maxWarnings !== null) updates.maxWarnings = maxWarnings;
        if (logChannel !== null) updates.logChannelId = logChannel.id;
        if (quarantineRole !== null) updates.quarantineRoleId = quarantineRole.id;

        // Si des options ont été spécifiées directement, on met à jour et on s'arrête là
        if (Object.keys(updates).length > 0) {
            customsManager.guildConfig.updateCustomsConfig(guildId, updates);
            return await interaction.reply({
                content: '✅ **Configuration de douane mise à jour avec succès !** Utilisez `/customs status` pour voir les détails.',
                ephemeral: true
            });
        }

        // Sinon, on présente le menu interactif pour configurer
        const selectMenu = new StringSelectMenuBuilder()
            .setCustomId('configure_customs_menu')
            .setPlaceholder('Sélectionnez une option de douane à configurer')
            .addOptions([
                {
                    label: 'Rôle requis (serveur partenaire)',
                    description: 'Définir l\'ID du rôle requis pour passer la douane',
                    value: 'requiredRoleId'
                },
                {
                    label: 'Ancienneté minimale du compte',
                    description: 'Définir l\'âge minimum du compte en jours',
                    value: 'minAccountAgeDays'
                },
                {
                    label: 'Ancienneté minimale partenaire',
                    description: 'Définir la présence minimale sur le serveur partenaire en jours',
                    value: 'minGuildJoinDays'
                },
                {
                    label: 'Avertissements maximum tolérés',
                    description: 'Définir le nombre d\'avertissements tolérés',
                    value: 'maxWarnings'
                },
                {
                    label: 'Salon de logs de douane',
                    description: 'Définir le salon pour consigner les passages de frontière',
                    value: 'logChannelId'
                },
                {
                    label: 'Rôle de quarantaine local',
                    description: 'Définir le rôle local de mise en quarantaine',
                    value: 'quarantineRoleId'
                }
            ]);

        const row = new ActionRowBuilder().addComponents(selectMenu);

        const response = await interaction.reply({
            content: '⚙️ **Configuration Interactive de la Douane**\nVeuillez choisir le paramètre que vous souhaitez configurer dans le menu déroulant :',
            components: [row],
            ephemeral: true
        });

        // Collecteur de sélection dans le menu
        const filter = i => i.customId === 'configure_customs_menu' && i.user.id === interaction.user.id;
        const collector = response.createMessageComponentCollector({
            componentType: ComponentType.StringSelect,
            filter,
            time: 60000
        });

        collector.on('collect', async i => {
            const selectedParam = i.values[0];
            const paramLabels = {
                requiredRoleId: 'Rôle requis (Entrez l\'ID du rôle requis ou "none" pour retirer)',
                minAccountAgeDays: 'Ancienneté minimale du compte (Entrez le nombre de jours)',
                minGuildJoinDays: 'Ancienneté minimale sur le partenaire (Entrez le nombre de jours)',
                maxWarnings: 'Warnings max tolérés (Entrez un nombre entier)',
                logChannelId: 'Salon de logs (Entrez l\'ID du salon ou "none")',
                quarantineRoleId: 'Rôle de quarantaine local (Entrez l\'ID du rôle ou "none")'
            };

            await i.update({
                content: `✍️ **Configuration :** ${paramLabels[selectedParam]}\nVeuillez envoyer votre nouvelle valeur dans ce salon dans les 30 secondes.`,
                components: []
            });

            // Collecteur de message pour récupérer la réponse
            const msgFilter = m => m.author.id === interaction.user.id;
            const msgCollector = interaction.channel.createMessageCollector({
                filter: msgFilter,
                max: 1,
                time: 30000
            });

            msgCollector.on('collect', async m => {
                let value = m.content.trim();
                const configUpdates = {};

                // Suppression automatique du message de l'utilisateur s'il a les droits pour garder le salon propre
                if (interaction.channel.permissionsFor(interaction.guild.members.me).has(PermissionsBitField.Flags.ManageMessages)) {
                    await m.delete().catch(() => null);
                }

                if (value.toLowerCase() === 'none') {
                    configUpdates[selectedParam] = null;
                } else if (['minAccountAgeDays', 'minGuildJoinDays', 'maxWarnings'].includes(selectedParam)) {
                    const intVal = parseInt(value, 10);
                    if (isNaN(intVal) || intVal < 0) {
                        return await interaction.followUp({
                            content: '❌ Valeur invalide. Veuillez entrer un nombre entier positif.',
                            ephemeral: true
                        });
                    }
                    configUpdates[selectedParam] = intVal;
                } else {
                    // Pour les mentions <@&ID> ou <#ID>, on extrait l'ID.
                    // Si c'est du texte brut pour requiredRoleId, on le laisse intact.
                    if (/^<@&?(\d+)>$/.test(value)) {
                        value = value.match(/^<@&?(\d+)>$/)[1];
                    } else if (/^<#(\d+)>$/.test(value)) {
                        value = value.match(/^<#(\d+)>$/)[1];
                    }
                    configUpdates[selectedParam] = value;
                }

                customsManager.guildConfig.updateCustomsConfig(guildId, configUpdates);

                await interaction.followUp({
                    content: `✅ Le paramètre **${selectedParam}** a été configuré sur : \`${value}\`.`,
                    ephemeral: true
                });
            });

            msgCollector.on('end', async (collected, reason) => {
                if (reason === 'time' && collected.size === 0) {
                    await interaction.followUp({
                        content: '⏱️ Temps écoulé. La configuration a été annulée.',
                        ephemeral: true
                    });
                }
            });
        });
    },

    async handleBypass(interaction, customsManager, guildId) {
        const action = interaction.options.getString('action');
        const role = interaction.options.getRole('role');
        
        const config = customsManager.guildConfig.getCustomsConfig(guildId);
        let bypassRoles = [...(config.bypassRoles || [])];

        if (action === 'add') {
            if (bypassRoles.includes(role.id)) {
                return await interaction.reply({
                    content: `❌ Le rôle ${role} est déjà dans la liste d'exemption.`,
                    ephemeral: true
                });
            }
            bypassRoles.push(role.id);
        } else {
            if (!bypassRoles.includes(role.id)) {
                return await interaction.reply({
                    content: `❌ Le rôle ${role} n'est pas dans la liste d'exemption.`,
                    ephemeral: true
                });
            }
            bypassRoles = bypassRoles.filter(id => id !== role.id);
        }

        customsManager.guildConfig.updateCustomsConfig(guildId, { bypassRoles });

        await interaction.reply({
            content: `✅ Le rôle ${role} a été ${action === 'add' ? 'ajouté aux' : 'retiré des'} rôles exemptés de douane.`,
            ephemeral: true
        });
    },

    async handleTest(interaction, customsManager) {
        const user = interaction.options.getUser('user');
        const guild = interaction.guild;
        const config = customsManager.guildConfig.getCustomsConfig(guild.id);

        if (!config.enabled) {
            return await interaction.reply({
                content: '❌ Le système de douane n\'est pas activé sur ce serveur.',
                ephemeral: true
            });
        }

        await interaction.deferReply();

        try {
            const partnerGuild = interaction.client.guilds.cache.get(config.partnerGuildId);
            if (!partnerGuild) {
                return await interaction.editReply({
                    content: '❌ Le serveur partenaire configuré est inaccessible ou introuvable pour le bot.'
                });
            }

            // Fetch member on current guild (if already here)
            const member = await guild.members.fetch(user.id).catch(() => null);
            if (!member) {
                return await interaction.editReply({
                    content: '❌ Cet utilisateur doit être présent sur ce serveur pour exécuter la simulation de douane.'
                });
            }

            const partnerMember = await partnerGuild.members.fetch(user.id).catch(() => null);

            const results = [];
            let pass = true;

            // 1. Presence
            if (!partnerMember) {
                results.push('❌ **Présence sur le serveur partenaire :** Absent');
                pass = false;
            } else {
                results.push(`✅ **Présence sur le serveur partenaire :** Présent sur *${partnerGuild.name}*`);

                // 2. Required role
                if (config.requiredRoleId) {
                    const hasRole = partnerMember.roles.cache.has(config.requiredRoleId) ||
                        partnerMember.roles.cache.some(r => r.name.toLowerCase() === config.requiredRoleId.toLowerCase());
                    if (hasRole) {
                        results.push(`✅ **Rôle requis :** Possède le rôle \`${config.requiredRoleId}\``);
                    } else {
                        results.push(`❌ **Rôle requis :** Rôle \`${config.requiredRoleId}\` manquant`);
                        pass = false;
                    }
                }

                // 3. Join date
                if (config.minGuildJoinDays > 0) {
                    const joinDays = (Date.now() - partnerMember.joinedTimestamp) / (1000 * 60 * 60 * 24);
                    if (joinDays >= config.minGuildJoinDays) {
                        results.push(`✅ **Ancienneté partenaire :** ${Math.floor(joinDays)} jours (requis: ${config.minGuildJoinDays}j)`);
                    } else {
                        results.push(`❌ **Ancienneté partenaire :** ${Math.floor(joinDays)} jours (requis: ${config.minGuildJoinDays}j)`);
                        pass = false;
                    }
                }
            }

            // 4. Account Age
            if (config.minAccountAgeDays > 0) {
                const accountAge = (Date.now() - user.createdTimestamp) / (1000 * 60 * 60 * 24);
                if (accountAge >= config.minAccountAgeDays) {
                    results.push(`✅ **Âge du compte :** ${Math.floor(accountAge)} jours (requis: ${config.minAccountAgeDays}j)`);
                } else {
                    results.push(`❌ **Âge du compte :** ${Math.floor(accountAge)} jours (requis: ${config.minAccountAgeDays}j)`);
                    pass = false;
                }
            }

            // 5. Warnings
            if (config.maxWarnings > 0 && interaction.client.warnManager) {
                const warns = interaction.client.warnManager.getWarns(user.id);
                if (warns.length <= config.maxWarnings) {
                    results.push(`✅ **Warnings :** ${warns.length} avertissements (max autorisé: ${config.maxWarnings})`);
                } else {
                    results.push(`❌ **Warnings :** ${warns.length} avertissements (max autorisé: ${config.maxWarnings})`);
                    pass = false;
                }
            }

            const embed = new EmbedBuilder()
                .setColor(pass ? '#00ff00' : '#ff0000')
                .setTitle(`🛂 Résultat de Test Douane - ${user.tag}`)
                .setDescription(`Simulation de vérification de frontière inter-serveurs.\n\n${results.join('\n')}`)
                .addFields({
                    name: 'Verdict final',
                    value: pass ? '🟢 **ACCÈS AUTORISÉ**' : `🔴 **ACCÈS REFUSÉ** (Action simulée: *${config.actionOnFail}*)`
                })
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error('Error in customs test:', error);
            await interaction.editReply({ content: '❌ Une erreur est survenue lors de l\'exécution du test.' });
        }
    },

    async handlePassport(interaction, customsManager) {
        const targetGuildId = interaction.options.getString('target_guild_id');
        const user = interaction.options.getUser('user');

        await interaction.deferReply({ ephemeral: true });

        try {
            const result = await customsManager.verifyMemberPassport(targetGuildId, user);

            if (result.success) {
                const targetGuild = interaction.client.guilds.cache.get(targetGuildId);
                
                const embed = new EmbedBuilder()
                    .setColor('#00ff00')
                    .setTitle('🛂 Passeport Douane Validé !')
                    .setDescription(`L'utilisateur **${user.tag}** remplit tous les critères d'éligibilité pour rejoindre **${targetGuild.name}** !`)
                    .addFields({
                        name: '🔗 Lien d\'invitation unique',
                        value: `Voici le lien d'accès généré pour cet utilisateur (valable 1 heure, 1 seule utilisation) :\n${result.inviteUrl}`
                    })
                    .setFooter({ text: 'Ce lien est à usage unique pour l\'utilisateur validé.' })
                    .setTimestamp();

                await interaction.editReply({ embeds: [embed] });
            } else {
                const embed = new EmbedBuilder()
                    .setColor('#ff0000')
                    .setTitle('❌ Passeport Douane Refusé')
                    .setDescription(`La demande d'accès pour **${user.tag}** a échoué.\n\n**Raison :** ${result.reason}`)
                    .setTimestamp();

                await interaction.editReply({ embeds: [embed] });
            }

        } catch (error) {
            console.error('Error in customs passport subcommand:', error);
            await interaction.editReply({ content: '❌ Une erreur est survenue lors de la génération du passeport.' });
        }
    }
};
