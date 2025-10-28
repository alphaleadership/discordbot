import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { PermissionFlagsBits, ChannelType } from 'discord.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * AutoConfigManager handles automatic server configuration when the bot joins new servers
 * Provides template-based setup with size-appropriate configurations
 */
class AutoConfigManager {
    constructor(client, guildConfig) {
        this.client = client;
        this.guildConfig = guildConfig;
        this.templatesPath = path.join(process.cwd(), 'data', 'auto_config_templates.json');
        this.templates = this.loadTemplates();
    }

    /**
     * Load configuration templates from JSON file
     * @returns {Object} Templates object
     */
    loadTemplates() {
        try {
            if (fs.existsSync(this.templatesPath)) {
                const data = fs.readFileSync(this.templatesPath, 'utf8');
                return JSON.parse(data).templates;
            }
        } catch (error) {
            console.error('Error loading auto-config templates:', error);
        }
        return {};
    }

    /**
     * Detect appropriate template based on server size
     * @param {Guild} guild - Discord guild object
     * @returns {string} Template name (small, medium, large)
     */
    detectServerSize(guild) {
        const memberCount = guild.memberCount;
        
        if (memberCount <= 100) {
            return 'small';
        } else if (memberCount <= 1000) {
            return 'medium';
        } else {
            return 'large';
        }
    }

    /**
     * Get configuration template by name
     * @param {string} templateName - Name of the template
     * @returns {Object|null} Template configuration or null if not found
     */
    getConfigTemplate(templateName) {
        return this.templates[templateName] || null;
    }

    /**
     * Get appropriate template for a guild based on its size
     * @param {Guild} guild - Discord guild object
     * @returns {Object|null} Template configuration or null if not found
     */
    getTemplateForGuild(guild) {
        const templateName = this.detectServerSize(guild);
        return this.getConfigTemplate(templateName);
    }

    /**
     * Validate if a template is suitable for the guild
     * @param {Guild} guild - Discord guild object
     * @param {Object} template - Template configuration
     * @returns {Object} Validation result with isValid boolean and issues array
     */
    validateTemplate(guild, template) {
        const issues = [];
        const isValid = true;

        // Check if guild size matches template expectations
        if (template.maxMembers && guild.memberCount > template.maxMembers) {
            issues.push(`Guild has ${guild.memberCount} members, but template is designed for up to ${template.maxMembers}`);
        }

        // Check bot permissions for channel creation
        const botMember = guild.members.cache.get(this.client.user.id);
        if (!botMember) {
            issues.push('Bot member not found in guild');
            return { isValid: false, issues };
        }

        const requiredPermissions = [
            PermissionFlagsBits.ManageChannels,
            PermissionFlagsBits.ManageRoles,
            PermissionFlagsBits.ViewChannel,
            PermissionFlagsBits.SendMessages
        ];

        const missingPermissions = requiredPermissions.filter(permission => 
            !botMember.permissions.has(permission)
        );

        if (missingPermissions.length > 0) {
            issues.push(`Bot missing required permissions: ${missingPermissions.join(', ')}`);
        }

        return {
            isValid: issues.length === 0,
            issues
        };
    }

    /**
     * Check if a channel name already exists in the guild
     * @param {Guild} guild - Discord guild object
     * @param {string} channelName - Name to check
     * @returns {boolean} True if channel exists
     */
    channelExists(guild, channelName) {
        return guild.channels.cache.some(channel => 
            channel.name.toLowerCase() === channelName.toLowerCase()
        );
    }

    /**
     * Check if a role name already exists in the guild
     * @param {Guild} guild - Discord guild object
     * @param {string} roleName - Name to check
     * @returns {boolean} True if role exists
     */
    roleExists(guild, roleName) {
        return guild.roles.cache.some(role => 
            role.name.toLowerCase() === roleName.toLowerCase()
        );
    }

    /**
     * Convert permission strings to Discord.js permission flags
     * @param {Array<string>} permissionStrings - Array of permission names
     * @returns {Array<bigint>} Array of permission flags
     */
    convertPermissions(permissionStrings) {
        const permissionMap = {
            'Administrator': PermissionFlagsBits.Administrator,
            'ManageGuild': PermissionFlagsBits.ManageGuild,
            'ManageRoles': PermissionFlagsBits.ManageRoles,
            'ManageChannels': PermissionFlagsBits.ManageChannels,
            'KickMembers': PermissionFlagsBits.KickMembers,
            'BanMembers': PermissionFlagsBits.BanMembers,
            'ManageMessages': PermissionFlagsBits.ManageMessages,
            'ModerateMembers': PermissionFlagsBits.ModerateMembers,
            'ViewAuditLog': PermissionFlagsBits.ViewAuditLog,
            'ManageNicknames': PermissionFlagsBits.ManageNicknames,
            'SendMessages': PermissionFlagsBits.SendMessages,
            'EmbedLinks': PermissionFlagsBits.EmbedLinks,
            'AttachFiles': PermissionFlagsBits.AttachFiles,
            'ViewChannel': PermissionFlagsBits.ViewChannel
        };

        return permissionStrings
            .map(perm => permissionMap[perm])
            .filter(perm => perm !== undefined);
    }

    /**
     * Generate a summary of what will be configured
     * @param {Guild} guild - Discord guild object
     * @param {Object} template - Template configuration
     * @returns {Object} Configuration summary
     */
    generateConfigSummary(guild, template) {
        const summary = {
            templateName: this.detectServerSize(guild),
            description: template.description,
            channelsToCreate: [],
            rolesToCreate: [],
            configChanges: Object.keys(template.config || {}),
            conflicts: {
                existingChannels: [],
                existingRoles: []
            }
        };

        // Check channels
        if (template.channels) {
            Object.keys(template.channels).forEach(channelName => {
                if (this.channelExists(guild, channelName)) {
                    summary.conflicts.existingChannels.push(channelName);
                } else {
                    summary.channelsToCreate.push(channelName);
                }
            });
        }

        // Check roles
        if (template.roles) {
            Object.keys(template.roles).forEach(roleName => {
                if (this.roleExists(guild, roleName)) {
                    summary.conflicts.existingRoles.push(roleName);
                } else {
                    summary.rolesToCreate.push(roleName);
                }
            });
        }

        return summary;
    }

    /**
     * Apply bot configuration settings to guild config
     * @param {string} guildId - Guild ID
     * @param {Object} configSettings - Configuration settings from template
     */
    applyBotConfiguration(guildId, configSettings) {
        // Initialize guild configuration if it doesn't exist
        this.guildConfig.initializeGuild(guildId);

        // Apply each configuration setting
        Object.keys(configSettings).forEach(configKey => {
            if (!this.guildConfig.config[guildId]) {
                this.guildConfig.config[guildId] = {};
            }
            
            // Merge configuration settings
            if (typeof configSettings[configKey] === 'object' && configSettings[configKey] !== null) {
                this.guildConfig.config[guildId][configKey] = {
                    ...this.guildConfig.config[guildId][configKey],
                    ...configSettings[configKey]
                };
            } else {
                this.guildConfig.config[guildId][configKey] = configSettings[configKey];
            }
        });

        this.guildConfig.saveConfig();
    }

    /**
     * Create channels based on template configuration
     * @param {Guild} guild - Discord guild object
     * @param {Object} channelConfig - Channel configuration from template
     * @returns {Promise<Array>} Array of created channels
     */
    async createChannels(guild, channelConfig) {
        const createdChannels = [];
        const errors = [];

        for (const [channelName, config] of Object.entries(channelConfig)) {
            try {
                // Skip if channel already exists
                if (this.channelExists(guild, channelName)) {
                    console.log(`Channel ${channelName} already exists, skipping creation`);
                    continue;
                }

                // Determine channel type
                const channelType = config.type === 'GUILD_TEXT' ? ChannelType.GuildText : ChannelType.GuildText;

                // Create the channel
                const channel = await guild.channels.create({
                    name: channelName,
                    type: channelType,
                    topic: config.description || `Auto-created ${channelName} channel`,
                    reason: 'Auto-configuration by bot'
                });

                // Set permissions based on configuration
                await this.setChannelPermissions(channel, config.permissions, guild);

                createdChannels.push({
                    name: channelName,
                    id: channel.id,
                    type: config.type
                });

                console.log(`Created channel: ${channelName} (${channel.id})`);

            } catch (error) {
                console.error(`Failed to create channel ${channelName}:`, error);
                errors.push({
                    channelName,
                    error: error.message
                });
            }
        }

        return {
            created: createdChannels,
            errors
        };
    }

    /**
     * Create roles based on template configuration
     * @param {Guild} guild - Discord guild object
     * @param {Object} roleConfig - Role configuration from template
     * @returns {Promise<Array>} Array of created roles
     */
    async createRoles(guild, roleConfig) {
        const createdRoles = [];
        const errors = [];

        for (const [roleName, config] of Object.entries(roleConfig)) {
            try {
                // Skip if role already exists
                if (this.roleExists(guild, roleName)) {
                    console.log(`Role ${roleName} already exists, skipping creation`);
                    continue;
                }

                // Convert permissions
                const permissions = this.convertPermissions(config.permissions || []);

                // Create the role
                const role = await guild.roles.create({
                    name: roleName,
                    color: config.color || '#99aab5',
                    hoist: config.hoist || false,
                    mentionable: config.mentionable || false,
                    permissions: permissions,
                    reason: 'Auto-configuration by bot'
                });

                createdRoles.push({
                    name: roleName,
                    id: role.id,
                    permissions: config.permissions
                });

                console.log(`Created role: ${roleName} (${role.id})`);

            } catch (error) {
                console.error(`Failed to create role ${roleName}:`, error);
                errors.push({
                    roleName,
                    error: error.message
                });
            }
        }

        return {
            created: createdRoles,
            errors
        };
    }

    /**
     * Set channel permissions based on configuration
     * @param {Channel} channel - Discord channel object
     * @param {string} permissionType - Permission type (mod-only, admin-only, public)
     * @param {Guild} guild - Discord guild object
     */
    async setChannelPermissions(channel, permissionType, guild) {
        try {
            const everyone = guild.roles.everyone;

            switch (permissionType) {
                case 'mod-only':
                    // Deny @everyone, allow moderators
                    await channel.permissionOverwrites.create(everyone, {
                        ViewChannel: false,
                        SendMessages: false
                    });

                    // Find moderator role and grant access
                    const modRole = guild.roles.cache.find(role => 
                        role.name.toLowerCase().includes('moderator') || 
                        role.name.toLowerCase().includes('mod')
                    );
                    if (modRole) {
                        await channel.permissionOverwrites.create(modRole, {
                            ViewChannel: true,
                            SendMessages: true,
                            ManageMessages: true
                        });
                    }
                    break;

                case 'admin-only':
                    // Deny @everyone, allow administrators
                    await channel.permissionOverwrites.create(everyone, {
                        ViewChannel: false,
                        SendMessages: false
                    });

                    // Find admin role and grant access
                    const adminRole = guild.roles.cache.find(role => 
                        role.name.toLowerCase().includes('administrator') || 
                        role.name.toLowerCase().includes('admin')
                    );
                    if (adminRole) {
                        await channel.permissionOverwrites.create(adminRole, {
                            ViewChannel: true,
                            SendMessages: true,
                            ManageMessages: true,
                            ManageChannels: true
                        });
                    }
                    break;

                case 'public':
                default:
                    // Allow @everyone to view and send messages
                    await channel.permissionOverwrites.create(everyone, {
                        ViewChannel: true,
                        SendMessages: true
                    });
                    break;
            }
        } catch (error) {
            console.error(`Failed to set permissions for channel ${channel.name}:`, error);
        }
    }

    /**
     * Configure a new guild with automatic setup
     * @param {Guild} guild - Discord guild object
     * @param {string} templateName - Optional template name, auto-detected if not provided
     * @returns {Promise<Object>} Configuration result
     */
    async configureNewGuild(guild, templateName = null) {
        try {
            // Get appropriate template
            const template = templateName ? 
                this.getConfigTemplate(templateName) : 
                this.getTemplateForGuild(guild);

            if (!template) {
                throw new Error(`Template not found: ${templateName || 'auto-detected'}`);
            }

            // Validate template
            const validation = this.validateTemplate(guild, template);
            if (!validation.isValid) {
                return {
                    success: false,
                    error: 'Template validation failed',
                    issues: validation.issues
                };
            }

            const results = {
                success: true,
                templateUsed: templateName || this.detectServerSize(guild),
                channels: { created: [], errors: [] },
                roles: { created: [], errors: [] },
                configApplied: true
            };

            // Create roles first (channels may need role permissions)
            if (template.roles) {
                const roleResults = await this.createRoles(guild, template.roles);
                results.roles = roleResults;
            }

            // Create channels
            if (template.channels) {
                const channelResults = await this.createChannels(guild, template.channels);
                results.channels = channelResults;
            }

            // Apply bot configuration
            if (template.config) {
                this.applyBotConfiguration(guild.id, template.config);
            }

            return results;

        } catch (error) {
            console.error(`Failed to configure guild ${guild.id}:`, error);
            return {
                success: false,
                error: error.message,
                templateUsed: templateName || 'unknown'
            };
        }
    }

    /**
     * Validate bot permissions for server setup operations
     * @param {Guild} guild - Discord guild object
     * @returns {Object} Permission validation result
     */
    validateSetupPermissions(guild) {
        const botMember = guild.members.cache.get(this.client.user.id);
        if (!botMember) {
            return {
                valid: false,
                missing: ['Bot not found in guild']
            };
        }

        const requiredPermissions = [
            { flag: PermissionFlagsBits.ManageChannels, name: 'Manage Channels' },
            { flag: PermissionFlagsBits.ManageRoles, name: 'Manage Roles' },
            { flag: PermissionFlagsBits.ViewChannel, name: 'View Channels' },
            { flag: PermissionFlagsBits.SendMessages, name: 'Send Messages' }
        ];

        const missing = requiredPermissions
            .filter(perm => !botMember.permissions.has(perm.flag))
            .map(perm => perm.name);

        return {
            valid: missing.length === 0,
            missing
        };
    }

    /**
     * Validate existing guild configuration to prevent conflicts
     * @param {Guild} guild - Discord guild object
     * @param {Object} template - Template configuration
     * @returns {Object} Configuration validation result
     */
    validateExistingConfiguration(guild, template) {
        const conflicts = {
            channels: [],
            roles: [],
            permissions: []
        };
        const warnings = [];
        const recommendations = [];

        // Check for channel conflicts
        if (template.channels) {
            Object.keys(template.channels).forEach(channelName => {
                const existingChannel = guild.channels.cache.find(ch => 
                    ch.name.toLowerCase() === channelName.toLowerCase()
                );
                if (existingChannel) {
                    conflicts.channels.push({
                        name: channelName,
                        id: existingChannel.id,
                        type: existingChannel.type,
                        reason: 'Channel with same name already exists'
                    });
                }
            });
        }

        // Check for role conflicts
        if (template.roles) {
            Object.keys(template.roles).forEach(roleName => {
                const existingRole = guild.roles.cache.find(role => 
                    role.name.toLowerCase() === roleName.toLowerCase()
                );
                if (existingRole) {
                    conflicts.roles.push({
                        name: roleName,
                        id: existingRole.id,
                        permissions: existingRole.permissions.toArray(),
                        reason: 'Role with same name already exists'
                    });
                }
            });
        }

        // Check for permission hierarchy issues
        const botMember = guild.members.cache.get(this.client.user.id);
        if (botMember && template.roles) {
            Object.entries(template.roles).forEach(([roleName, roleConfig]) => {
                const requiredPerms = this.convertPermissions(roleConfig.permissions || []);
                const hasHigherPerms = requiredPerms.some(perm => 
                    !botMember.permissions.has(perm)
                );
                
                if (hasHigherPerms) {
                    conflicts.permissions.push({
                        roleName,
                        issue: 'Bot cannot assign permissions it does not have',
                        missingPermissions: requiredPerms.filter(perm => 
                            !botMember.permissions.has(perm)
                        )
                    });
                }
            });
        }

        // Generate warnings and recommendations
        if (conflicts.channels.length > 0) {
            warnings.push(`${conflicts.channels.length} channel(s) already exist with conflicting names`);
            recommendations.push('Consider renaming existing channels or using different template');
        }

        if (conflicts.roles.length > 0) {
            warnings.push(`${conflicts.roles.length} role(s) already exist with conflicting names`);
            recommendations.push('Existing roles will be skipped during setup');
        }

        if (conflicts.permissions.length > 0) {
            warnings.push('Bot lacks permissions to create some roles');
            recommendations.push('Grant bot higher permissions or modify template');
        }

        return {
            isValid: conflicts.permissions.length === 0,
            conflicts,
            warnings,
            recommendations,
            canProceed: true // Can proceed even with channel/role conflicts
        };
    }

    /**
     * Generate a comprehensive welcome message with setup summary
     * @param {Guild} guild - Discord guild object
     * @param {Object} configResult - Configuration result from configureNewGuild
     * @returns {Object} Welcome message data
     */
    generateWelcomeMessage(guild, configResult) {
        const template = this.getConfigTemplate(configResult.templateUsed);
        
        const embed = {
            title: '🎉 Auto-Configuration Complete!',
            description: `Welcome to **${guild.name}**! I've automatically configured your server based on the **${configResult.templateUsed}** template.`,
            color: 0x00ff00, // Green color for success
            fields: [],
            footer: {
                text: 'You can customize these settings anytime using the configuration commands',
                icon_url: this.client.user.displayAvatarURL()
            },
            timestamp: new Date().toISOString()
        };

        // Add template description
        if (template && template.description) {
            embed.fields.push({
                name: '📋 Template Used',
                value: template.description,
                inline: false
            });
        }

        // Add created channels
        if (configResult.channels.created.length > 0) {
            const channelList = configResult.channels.created
                .map(ch => `• <#${ch.id}> (${ch.name})`)
                .join('\n');
            embed.fields.push({
                name: '📺 Channels Created',
                value: channelList,
                inline: true
            });
        }

        // Add created roles
        if (configResult.roles.created.length > 0) {
            const roleList = configResult.roles.created
                .map(role => `• <@&${role.id}> (${role.name})`)
                .join('\n');
            embed.fields.push({
                name: '👥 Roles Created',
                value: roleList,
                inline: true
            });
        }

        // Add configuration features
        if (configResult.configApplied && template && template.config) {
            const features = [];
            if (template.config.antiInvite?.enabled) features.push('Anti-Invite Protection');
            if (template.config.raidDetection?.enabled) features.push('Raid Detection');
            if (template.config.doxDetection?.enabled) features.push('DOX Detection');
            if (template.config.funCommands?.enabled) features.push('Fun Commands');
            if (template.config.watchlist?.enabled) features.push('Watchlist System');

            if (features.length > 0) {
                embed.fields.push({
                    name: '⚙️ Features Enabled',
                    value: features.map(f => `• ${f}`).join('\n'),
                    inline: false
                });
            }
        }

        // Add errors if any
        const totalErrors = (configResult.channels.errors?.length || 0) + (configResult.roles.errors?.length || 0);
        if (totalErrors > 0) {
            embed.color = 0xffaa00; // Orange color for partial success
            embed.fields.push({
                name: '⚠️ Issues Encountered',
                value: `${totalErrors} item(s) could not be created due to permission or configuration issues. Check logs for details.`,
                inline: false
            });
        }

        // Add next steps
        const nextSteps = [
            'Review and customize channel permissions',
            'Assign moderator roles to trusted members',
            'Configure additional bot settings as needed',
            'Test moderation features in a safe environment'
        ];

        embed.fields.push({
            name: '🚀 Next Steps',
            value: nextSteps.map((step, i) => `${i + 1}. ${step}`).join('\n'),
            inline: false
        });

        return {
            embeds: [embed],
            content: `<@${guild.ownerId}> Your server has been automatically configured!`
        };
    }

    /**
     * Send welcome message to appropriate channel
     * @param {Guild} guild - Discord guild object
     * @param {Object} welcomeData - Welcome message data
     * @returns {Promise<Message|null>} Sent message or null if failed
     */
    async sendWelcomeMessage(guild, welcomeData) {
        try {
            // Try to find a suitable channel to send the welcome message
            let targetChannel = null;

            // Priority order: system channel, general, first text channel bot can send to
            const channels = [
                guild.systemChannel,
                guild.channels.cache.find(ch => 
                    ch.name.toLowerCase().includes('general') && 
                    ch.isTextBased() &&
                    ch.permissionsFor(this.client.user).has(PermissionFlagsBits.SendMessages)
                ),
                guild.channels.cache.find(ch => 
                    ch.isTextBased() &&
                    ch.permissionsFor(this.client.user).has(PermissionFlagsBits.SendMessages)
                )
            ].filter(Boolean);

            targetChannel = channels[0];

            if (!targetChannel) {
                console.warn(`No suitable channel found to send welcome message in guild ${guild.id}`);
                return null;
            }

            const message = await targetChannel.send(welcomeData);
            console.log(`Welcome message sent to ${targetChannel.name} in guild ${guild.name}`);
            return message;

        } catch (error) {
            console.error(`Failed to send welcome message in guild ${guild.id}:`, error);
            return null;
        }
    }

    /**
     * Perform a dry run of configuration to preview changes
     * @param {Guild} guild - Discord guild object
     * @param {string} templateName - Optional template name
     * @returns {Object} Preview of configuration changes
     */
    async previewConfiguration(guild, templateName = null) {
        const template = templateName ? 
            this.getConfigTemplate(templateName) : 
            this.getTemplateForGuild(guild);

        if (!template) {
            return {
                success: false,
                error: `Template not found: ${templateName || 'auto-detected'}`
            };
        }

        const validation = this.validateExistingConfiguration(guild, template);
        const summary = this.generateConfigSummary(guild, template);
        const permissionCheck = this.validateSetupPermissions(guild);

        return {
            success: true,
            templateName: templateName || this.detectServerSize(guild),
            template: {
                name: templateName || this.detectServerSize(guild),
                description: template.description,
                maxMembers: template.maxMembers
            },
            preview: {
                channelsToCreate: summary.channelsToCreate,
                rolesToCreate: summary.rolesToCreate,
                configChanges: summary.configChanges,
                conflicts: summary.conflicts
            },
            validation: {
                permissions: permissionCheck,
                configuration: validation
            },
            canProceed: permissionCheck.valid && validation.canProceed,
            recommendations: validation.recommendations
        };
    }

    /**
     * Complete auto-configuration with validation and welcome message
     * @param {Guild} guild - Discord guild object
     * @param {string} templateName - Optional template name
     * @param {boolean} sendWelcome - Whether to send welcome message
     * @returns {Promise<Object>} Complete configuration result
     */
    async completeAutoConfiguration(guild, templateName = null, sendWelcome = true) {
        try {
            // Perform pre-configuration validation
            const preview = await this.previewConfiguration(guild, templateName);
            if (!preview.success) {
                return preview;
            }

            if (!preview.canProceed) {
                return {
                    success: false,
                    error: 'Configuration cannot proceed due to validation issues',
                    validation: preview.validation,
                    recommendations: preview.recommendations
                };
            }

            // Perform the actual configuration
            const configResult = await this.configureNewGuild(guild, templateName);
            if (!configResult.success) {
                return configResult;
            }

            // Send welcome message if requested
            let welcomeMessage = null;
            if (sendWelcome) {
                const welcomeData = this.generateWelcomeMessage(guild, configResult);
                welcomeMessage = await this.sendWelcomeMessage(guild, welcomeData);
            }

            return {
                ...configResult,
                validation: preview.validation,
                welcomeMessageSent: welcomeMessage !== null,
                welcomeChannelId: welcomeMessage?.channel?.id || null
            };

        } catch (error) {
            console.error(`Failed to complete auto-configuration for guild ${guild.id}:`, error);
            return {
                success: false,
                error: error.message,
                templateUsed: templateName || 'unknown'
            };
        }
    }
}

export default AutoConfigManager;
export { AutoConfigManager };