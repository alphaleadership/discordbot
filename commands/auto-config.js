import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';

export default {
    data: new SlashCommandBuilder()
        .setName('auto-config')
        .setDescription('Automatically configure the server with appropriate settings')
        .addSubcommand(subcommand =>
            subcommand
                .setName('preview')
                .setDescription('Preview what will be configured without making changes')
                .addStringOption(option =>
                    option.setName('template')
                        .setDescription('Specific template to use (auto-detected if not specified)')
                        .setRequired(false)
                        .addChoices(
                            { name: 'Small Server (≤100 members)', value: 'small' },
                            { name: 'Medium Server (≤1000 members)', value: 'medium' },
                            { name: 'Large Server (>1000 members)', value: 'large' }
                        )))
        .addSubcommand(subcommand =>
            subcommand
                .setName('apply')
                .setDescription('Apply automatic configuration to the server')
                .addStringOption(option =>
                    option.setName('template')
                        .setDescription('Specific template to use (auto-detected if not specified)')
                        .setRequired(false)
                        .addChoices(
                            { name: 'Small Server (≤100 members)', value: 'small' },
                            { name: 'Medium Server (≤1000 members)', value: 'medium' },
                            { name: 'Large Server (>1000 members)', value: 'large' }
                        )))
        .addSubcommand(subcommand =>
            subcommand
                .setName('validate')
                .setDescription('Check if the bot has required permissions for auto-configuration')),
    
    async execute(interaction, adminManager, warnManager, guildConfig, sharedConfig, backupToGitHub, reportManager, banlistManager, blockedWordsManager, watchlistManager, telegramIntegration, funCommandsManager, raidDetector, doxDetector, enhancedReloadSystem, permissionValidator, dmTicketManager, economyManager, forumReportManager, autoConfigManager) {
        try {
            // Check if user is an admin
            if (!adminManager.isAdmin(interaction.user.id)) {
                return await interaction.reply({
                    content: '❌ Vous devez être administrateur pour utiliser cette commande.',
                    ephemeral: true
                });
            }

            if (!autoConfigManager) {
                return await interaction.reply({
                    content: '❌ Le système de configuration automatique n\'est pas disponible.',
                    ephemeral: true
                });
            }

            const subcommand = interaction.options.getSubcommand();
            const templateName = interaction.options.getString('template');

            switch (subcommand) {
                case 'preview':
                    await this.handlePreview(interaction, autoConfigManager, templateName);
                    break;
                case 'apply':
                    await this.handleApply(interaction, autoConfigManager, templateName);
                    break;
                case 'validate':
                    await this.handleValidate(interaction, autoConfigManager);
                    break;
            }

        } catch (error) {
            console.error('Error in auto-config command:', error);
            await interaction.reply({
                content: '❌ Une erreur est survenue lors de la configuration automatique.',
                ephemeral: true
            });
        }
    },

    async handlePreview(interaction, autoConfigManager, templateName) {
        const guild = interaction.guild;
        
        // Get preview of configuration changes
        const preview = await autoConfigManager.previewConfiguration(guild, templateName);
        
        if (!preview.success) {
            return await interaction.reply({
                content: `❌ Erreur lors de la prévisualisation: ${preview.error}`,
                ephemeral: true
            });
        }

        const embed = new EmbedBuilder()
            .setColor('#0099ff')
            .setTitle('🔍 Aperçu de la Configuration Automatique')
            .setDescription(`Prévisualisation pour **${guild.name}** avec le template **${preview.template.name}**`)
            .addFields(
                {
                    name: '📋 Template Sélectionné',
                    value: [
                        `**Nom:** ${preview.template.name}`,
                        `**Description:** ${preview.template.description}`,
                        `**Membres Max:** ${preview.template.maxMembers || 'Illimité'}`
                    ].join('\n'),
                    inline: false
                }
            );

        // Add channels to create
        if (preview.preview.channelsToCreate.length > 0) {
            embed.addFields({
                name: '📺 Canaux à Créer',
                value: preview.preview.channelsToCreate.map(ch => `• ${ch}`).join('\n'),
                inline: true
            });
        }

        // Add roles to create
        if (preview.preview.rolesToCreate.length > 0) {
            embed.addFields({
                name: '👥 Rôles à Créer',
                value: preview.preview.rolesToCreate.map(role => `• ${role}`).join('\n'),
                inline: true
            });
        }

        // Add configuration changes
        if (preview.preview.configChanges.length > 0) {
            embed.addFields({
                name: '⚙️ Paramètres à Configurer',
                value: preview.preview.configChanges.map(config => `• ${config}`).join('\n'),
                inline: false
            });
        }

        // Add conflicts if any
        const totalConflicts = (preview.preview.conflicts.existingChannels?.length || 0) + 
                              (preview.preview.conflicts.existingRoles?.length || 0);
        
        if (totalConflicts > 0) {
            const conflictText = [];
            if (preview.preview.conflicts.existingChannels?.length > 0) {
                conflictText.push(`**Canaux existants:** ${preview.preview.conflicts.existingChannels.join(', ')}`);
            }
            if (preview.preview.conflicts.existingRoles?.length > 0) {
                conflictText.push(`**Rôles existants:** ${preview.preview.conflicts.existingRoles.join(', ')}`);
            }
            
            embed.addFields({
                name: '⚠️ Conflits Détectés',
                value: conflictText.join('\n') + '\n\n*Les éléments existants seront ignorés*',
                inline: false
            });
        }

        // Add validation results
        if (preview.validation) {
            const validationText = preview.validation.isValid ? 
                '✅ Toutes les validations sont passées' : 
                `❌ Problèmes détectés:\n${preview.validation.warnings.join('\n')}`;
            
            embed.addFields({
                name: '🔍 Validation',
                value: validationText,
                inline: false
            });

            if (preview.validation.recommendations?.length > 0) {
                embed.addFields({
                    name: '💡 Recommandations',
                    value: preview.validation.recommendations.join('\n'),
                    inline: false
                });
            }
        }

        embed.setFooter({ 
            text: 'Utilisez /auto-config apply pour appliquer ces changements' 
        });

        await interaction.reply({ embeds: [embed] });
    },

    async handleApply(interaction, autoConfigManager, templateName) {
        const guild = interaction.guild;
        
        // Defer reply as configuration might take some time
        await interaction.deferReply();

        // Apply configuration
        const result = await autoConfigManager.configureNewGuild(guild, templateName);
        
        if (!result.success) {
            return await interaction.editReply({
                content: `❌ Erreur lors de la configuration: ${result.error}\n\n**Problèmes:**\n${result.issues?.join('\n') || 'Aucun détail disponible'}`
            });
        }

        // Generate and send welcome message
        const welcomeData = autoConfigManager.generateWelcomeMessage(guild, result);
        
        // Send the welcome message to the interaction
        await interaction.editReply(welcomeData);

        // Also try to send to a general channel if different from interaction channel
        if (interaction.channel.name !== 'general') {
            await autoConfigManager.sendWelcomeMessage(guild, welcomeData);
        }
    },

    async handleValidate(interaction, autoConfigManager) {
        const guild = interaction.guild;
        
        // Check bot permissions
        const permissionCheck = autoConfigManager.validateSetupPermissions(guild);
        
        const embed = new EmbedBuilder()
            .setColor(permissionCheck.valid ? '#00ff00' : '#ff0000')
            .setTitle('🔍 Validation des Permissions')
            .setDescription(`Vérification des permissions pour **${guild.name}**`);

        if (permissionCheck.valid) {
            embed.addFields({
                name: '✅ Permissions Validées',
                value: 'Le bot possède toutes les permissions nécessaires pour la configuration automatique.',
                inline: false
            });

            // Show what permissions are available
            embed.addFields({
                name: '🔑 Permissions Disponibles',
                value: [
                    '• Gérer les canaux',
                    '• Gérer les rôles', 
                    '• Voir les canaux',
                    '• Envoyer des messages'
                ].join('\n'),
                inline: false
            });
        } else {
            embed.addFields({
                name: '❌ Permissions Manquantes',
                value: permissionCheck.missing.map(perm => `• ${perm}`).join('\n'),
                inline: false
            });

            embed.addFields({
                name: '💡 Comment Résoudre',
                value: [
                    '1. Allez dans les paramètres du serveur',
                    '2. Sélectionnez "Rôles" dans le menu',
                    '3. Trouvez le rôle du bot',
                    '4. Activez les permissions manquantes',
                    '5. Relancez cette commande pour vérifier'
                ].join('\n'),
                inline: false
            });
        }

        // Add server information
        const detectedTemplate = autoConfigManager.detectServerSize(guild);
        embed.addFields({
            name: '📊 Informations du Serveur',
            value: [
                `**Membres:** ${guild.memberCount}`,
                `**Template Recommandé:** ${detectedTemplate}`,
                `**Propriétaire:** <@${guild.ownerId}>`
            ].join('\n'),
            inline: false
        });

        await interaction.reply({ embeds: [embed] });
    }
};