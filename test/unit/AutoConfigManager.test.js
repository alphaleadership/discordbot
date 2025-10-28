import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { AutoConfigManager } from '../../utils/AutoConfigManager.js';
import { PermissionFlagsBits } from 'discord.js';

// Mock fs module
vi.mock('fs');

describe('AutoConfigManager', () => {
    let autoConfigManager;
    let mockClient;
    let mockGuildConfig;
    let mockGuild;
    let mockBotMember;

    beforeEach(() => {
        // Reset all mocks
        vi.clearAllMocks();

        // Mock client
        mockClient = {
            user: { 
                id: 'bot-user-id',
                displayAvatarURL: vi.fn().mockReturnValue('https://example.com/avatar.png')
            }
        };

        // Mock guild config
        mockGuildConfig = {
            config: {},
            initializeGuild: vi.fn(),
            saveConfig: vi.fn()
        };

        // Mock bot member with permissions
        mockBotMember = {
            permissions: {
                has: vi.fn().mockReturnValue(true)
            }
        };

        // Mock guild
        mockGuild = {
            id: 'test-guild-id',
            memberCount: 50,
            members: {
                cache: {
                    get: vi.fn().mockReturnValue(mockBotMember)
                }
            },
            channels: {
                cache: []
            },
            roles: {
                cache: []
            }
        };

        // Mock template data
        const mockTemplates = {
            templates: {
                small: {
                    maxMembers: 100,
                    description: 'Basic setup for small communities',
                    channels: {
                        'moderation-log': {
                            type: 'GUILD_TEXT',
                            permissions: 'mod-only'
                        }
                    },
                    roles: {
                        'Moderator': {
                            permissions: ['ManageMessages', 'ModerateMembers'],
                            color: '#3498db'
                        }
                    },
                    config: {
                        antiInvite: { enabled: true },
                        charLimit: 2000
                    }
                },
                medium: {
                    maxMembers: 1000,
                    description: 'Enhanced setup for growing communities'
                },
                large: {
                    maxMembers: 10000,
                    description: 'Comprehensive setup for large communities'
                }
            }
        };

        // Mock fs.existsSync and fs.readFileSync
        fs.existsSync.mockReturnValue(true);
        fs.readFileSync.mockReturnValue(JSON.stringify(mockTemplates));

        autoConfigManager = new AutoConfigManager(mockClient, mockGuildConfig);
    });

    afterEach(() => {
        vi.restoreAllMocks();
    });

    describe('loadTemplates', () => {
        it('should load templates from JSON file', () => {
            expect(fs.existsSync).toHaveBeenCalled();
            expect(fs.readFileSync).toHaveBeenCalled();
            expect(autoConfigManager.templates).toBeDefined();
            expect(autoConfigManager.templates.small).toBeDefined();
        });

        it('should handle missing template file gracefully', () => {
            fs.existsSync.mockReturnValue(false);
            const manager = new AutoConfigManager(mockClient, mockGuildConfig);
            expect(manager.templates).toEqual({});
        });

        it('should handle JSON parse errors gracefully', () => {
            fs.readFileSync.mockReturnValue('invalid json');
            const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
            
            const manager = new AutoConfigManager(mockClient, mockGuildConfig);
            expect(manager.templates).toEqual({});
            expect(consoleSpy).toHaveBeenCalled();
            
            consoleSpy.mockRestore();
        });
    });

    describe('detectServerSize', () => {
        it('should detect small server (≤100 members)', () => {
            mockGuild.memberCount = 50;
            const size = autoConfigManager.detectServerSize(mockGuild);
            expect(size).toBe('small');
        });

        it('should detect medium server (≤1000 members)', () => {
            mockGuild.memberCount = 500;
            const size = autoConfigManager.detectServerSize(mockGuild);
            expect(size).toBe('medium');
        });

        it('should detect large server (>1000 members)', () => {
            mockGuild.memberCount = 5000;
            const size = autoConfigManager.detectServerSize(mockGuild);
            expect(size).toBe('large');
        });

        it('should handle edge cases correctly', () => {
            mockGuild.memberCount = 100;
            expect(autoConfigManager.detectServerSize(mockGuild)).toBe('small');
            
            mockGuild.memberCount = 101;
            expect(autoConfigManager.detectServerSize(mockGuild)).toBe('medium');
            
            mockGuild.memberCount = 1000;
            expect(autoConfigManager.detectServerSize(mockGuild)).toBe('medium');
            
            mockGuild.memberCount = 1001;
            expect(autoConfigManager.detectServerSize(mockGuild)).toBe('large');
        });
    });

    describe('getConfigTemplate', () => {
        it('should return template by name', () => {
            const template = autoConfigManager.getConfigTemplate('small');
            expect(template).toBeDefined();
            expect(template.maxMembers).toBe(100);
        });

        it('should return null for non-existent template', () => {
            const template = autoConfigManager.getConfigTemplate('nonexistent');
            expect(template).toBeNull();
        });
    });

    describe('getTemplateForGuild', () => {
        it('should return appropriate template based on guild size', () => {
            mockGuild.memberCount = 50;
            const template = autoConfigManager.getTemplateForGuild(mockGuild);
            expect(template).toBeDefined();
            expect(template.maxMembers).toBe(100);
        });
    });

    describe('validateTemplate', () => {
        it('should validate template successfully with proper permissions', () => {
            const template = autoConfigManager.getConfigTemplate('small');
            const result = autoConfigManager.validateTemplate(mockGuild, template);
            
            expect(result.isValid).toBe(true);
            expect(result.issues).toHaveLength(0);
        });

        it('should detect missing bot permissions', () => {
            mockBotMember.permissions.has.mockReturnValue(false);
            const template = autoConfigManager.getConfigTemplate('small');
            const result = autoConfigManager.validateTemplate(mockGuild, template);
            
            expect(result.isValid).toBe(false);
            expect(result.issues.length).toBeGreaterThan(0);
            expect(result.issues[0]).toContain('missing required permissions');
        });

        it('should detect guild size mismatch', () => {
            mockGuild.memberCount = 200;
            const template = autoConfigManager.getConfigTemplate('small');
            const result = autoConfigManager.validateTemplate(mockGuild, template);
            
            expect(result.isValid).toBe(false);
            expect(result.issues.length).toBeGreaterThan(0);
            expect(result.issues[0]).toContain('200 members');
        });

        it('should handle missing bot member', () => {
            mockGuild.members.cache.get.mockReturnValue(null);
            const template = autoConfigManager.getConfigTemplate('small');
            const result = autoConfigManager.validateTemplate(mockGuild, template);
            
            expect(result.isValid).toBe(false);
            expect(result.issues).toContain('Bot member not found in guild');
        });
    });

    describe('channelExists', () => {
        it('should detect existing channel', () => {
            mockGuild.channels.cache = [
                { name: 'moderation-log' },
                { name: 'general' }
            ];
            mockGuild.channels.cache.some = vi.fn().mockReturnValue(true);
            
            const exists = autoConfigManager.channelExists(mockGuild, 'moderation-log');
            expect(exists).toBe(true);
        });

        it('should detect non-existing channel', () => {
            mockGuild.channels.cache = [];
            mockGuild.channels.cache.some = vi.fn().mockReturnValue(false);
            
            const exists = autoConfigManager.channelExists(mockGuild, 'new-channel');
            expect(exists).toBe(false);
        });
    });

    describe('roleExists', () => {
        it('should detect existing role', () => {
            mockGuild.roles.cache = [
                { name: 'Moderator' },
                { name: '@everyone' }
            ];
            mockGuild.roles.cache.some = vi.fn().mockReturnValue(true);
            
            const exists = autoConfigManager.roleExists(mockGuild, 'Moderator');
            expect(exists).toBe(true);
        });

        it('should detect non-existing role', () => {
            mockGuild.roles.cache = [];
            mockGuild.roles.cache.some = vi.fn().mockReturnValue(false);
            
            const exists = autoConfigManager.roleExists(mockGuild, 'NewRole');
            expect(exists).toBe(false);
        });
    });

    describe('convertPermissions', () => {
        it('should convert permission strings to Discord flags', () => {
            const permissions = ['ManageMessages', 'ModerateMembers', 'Administrator'];
            const converted = autoConfigManager.convertPermissions(permissions);
            
            expect(converted).toContain(PermissionFlagsBits.ManageMessages);
            expect(converted).toContain(PermissionFlagsBits.ModerateMembers);
            expect(converted).toContain(PermissionFlagsBits.Administrator);
        });

        it('should filter out invalid permissions', () => {
            const permissions = ['ManageMessages', 'InvalidPermission', 'ModerateMembers'];
            const converted = autoConfigManager.convertPermissions(permissions);
            
            expect(converted).toHaveLength(2);
            expect(converted).toContain(PermissionFlagsBits.ManageMessages);
            expect(converted).toContain(PermissionFlagsBits.ModerateMembers);
        });

        it('should handle empty permission array', () => {
            const converted = autoConfigManager.convertPermissions([]);
            expect(converted).toHaveLength(0);
        });
    });

    describe('generateConfigSummary', () => {
        it('should generate comprehensive configuration summary', () => {
            const template = autoConfigManager.getConfigTemplate('small');
            mockGuild.channels.cache.some = vi.fn().mockReturnValue(false);
            mockGuild.roles.cache.some = vi.fn().mockReturnValue(false);
            
            const summary = autoConfigManager.generateConfigSummary(mockGuild, template);
            
            expect(summary.templateName).toBe('small');
            expect(summary.description).toBe('Basic setup for small communities');
            expect(summary.channelsToCreate).toContain('moderation-log');
            expect(summary.rolesToCreate).toContain('Moderator');
            expect(summary.configChanges).toContain('antiInvite');
            expect(summary.configChanges).toContain('charLimit');
        });

        it('should detect conflicts with existing channels and roles', () => {
            const template = autoConfigManager.getConfigTemplate('small');
            mockGuild.channels.cache.some = vi.fn().mockReturnValue(true);
            mockGuild.roles.cache.some = vi.fn().mockReturnValue(true);
            
            const summary = autoConfigManager.generateConfigSummary(mockGuild, template);
            
            expect(summary.conflicts.existingChannels).toContain('moderation-log');
            expect(summary.conflicts.existingRoles).toContain('Moderator');
            expect(summary.channelsToCreate).toHaveLength(0);
            expect(summary.rolesToCreate).toHaveLength(0);
        });
    });

    describe('applyBotConfiguration', () => {
        it('should apply configuration settings to guild config', () => {
            const configSettings = {
                antiInvite: { enabled: true },
                charLimit: 2000,
                raidDetection: { enabled: true }
            };
            
            autoConfigManager.applyBotConfiguration('test-guild-id', configSettings);
            
            expect(mockGuildConfig.initializeGuild).toHaveBeenCalledWith('test-guild-id');
            expect(mockGuildConfig.saveConfig).toHaveBeenCalled();
        });

        it('should merge nested configuration objects', () => {
            mockGuildConfig.config['test-guild-id'] = {
                antiInvite: { whitelistedChannels: ['channel1'] }
            };
            
            const configSettings = {
                antiInvite: { enabled: true }
            };
            
            autoConfigManager.applyBotConfiguration('test-guild-id', configSettings);
            
            expect(mockGuildConfig.saveConfig).toHaveBeenCalled();
        });

        it('should handle guild config initialization', () => {
            mockGuildConfig.config = {};
            
            const configSettings = {
                antiInvite: { enabled: true }
            };
            
            autoConfigManager.applyBotConfiguration('test-guild-id', configSettings);
            
            expect(mockGuildConfig.initializeGuild).toHaveBeenCalledWith('test-guild-id');
        });
    });

    describe('createChannels', () => {
        let mockChannel;

        beforeEach(() => {
            mockChannel = {
                id: 'channel-id-123',
                name: 'moderation-log',
                permissionOverwrites: {
                    create: vi.fn().mockResolvedValue({})
                }
            };

            mockGuild.channels = {
                create: vi.fn().mockResolvedValue(mockChannel),
                cache: []
            };
            mockGuild.channels.cache.some = vi.fn().mockReturnValue(false);
            mockGuild.roles = {
                everyone: { id: 'everyone-role-id' },
                cache: {
                    find: vi.fn().mockReturnValue({ id: 'mod-role-id' })
                }
            };
        });

        it('should create channels successfully', async () => {
            const channelConfig = {
                'moderation-log': {
                    type: 'GUILD_TEXT',
                    permissions: 'mod-only',
                    description: 'Moderation logs'
                }
            };

            const result = await autoConfigManager.createChannels(mockGuild, channelConfig);

            expect(mockGuild.channels.create).toHaveBeenCalledWith({
                name: 'moderation-log',
                type: 0, // ChannelType.GuildText
                topic: 'Moderation logs',
                reason: 'Auto-configuration by bot'
            });
            expect(result.created).toHaveLength(1);
            expect(result.created[0].name).toBe('moderation-log');
            expect(result.errors).toHaveLength(0);
        });

        it('should skip existing channels', async () => {
            mockGuild.channels.cache.some = vi.fn().mockReturnValue(true);
            
            const channelConfig = {
                'existing-channel': {
                    type: 'GUILD_TEXT',
                    permissions: 'public'
                }
            };

            const result = await autoConfigManager.createChannels(mockGuild, channelConfig);

            expect(mockGuild.channels.create).not.toHaveBeenCalled();
            expect(result.created).toHaveLength(0);
        });

        it('should handle channel creation errors', async () => {
            mockGuild.channels.create.mockRejectedValue(new Error('Permission denied'));
            
            const channelConfig = {
                'test-channel': {
                    type: 'GUILD_TEXT',
                    permissions: 'public'
                }
            };

            const result = await autoConfigManager.createChannels(mockGuild, channelConfig);

            expect(result.created).toHaveLength(0);
            expect(result.errors).toHaveLength(1);
            expect(result.errors[0].channelName).toBe('test-channel');
            expect(result.errors[0].error).toBe('Permission denied');
        });
    });

    describe('createRoles', () => {
        let mockRole;

        beforeEach(() => {
            mockRole = {
                id: 'role-id-123',
                name: 'Moderator'
            };

            mockGuild.roles = {
                create: vi.fn().mockResolvedValue(mockRole),
                cache: []
            };
            mockGuild.roles.cache.some = vi.fn().mockReturnValue(false);
        });

        it('should create roles successfully', async () => {
            const roleConfig = {
                'Moderator': {
                    permissions: ['ManageMessages', 'ModerateMembers'],
                    color: '#3498db',
                    hoist: true,
                    mentionable: false
                }
            };

            const result = await autoConfigManager.createRoles(mockGuild, roleConfig);

            expect(mockGuild.roles.create).toHaveBeenCalledWith({
                name: 'Moderator',
                color: '#3498db',
                hoist: true,
                mentionable: false,
                permissions: expect.any(Array),
                reason: 'Auto-configuration by bot'
            });
            expect(result.created).toHaveLength(1);
            expect(result.created[0].name).toBe('Moderator');
            expect(result.errors).toHaveLength(0);
        });

        it('should skip existing roles', async () => {
            mockGuild.roles.cache.some = vi.fn().mockReturnValue(true);
            
            const roleConfig = {
                'ExistingRole': {
                    permissions: ['SendMessages']
                }
            };

            const result = await autoConfigManager.createRoles(mockGuild, roleConfig);

            expect(mockGuild.roles.create).not.toHaveBeenCalled();
            expect(result.created).toHaveLength(0);
        });

        it('should handle role creation errors', async () => {
            mockGuild.roles.create.mockRejectedValue(new Error('Insufficient permissions'));
            
            const roleConfig = {
                'TestRole': {
                    permissions: ['Administrator']
                }
            };

            const result = await autoConfigManager.createRoles(mockGuild, roleConfig);

            expect(result.created).toHaveLength(0);
            expect(result.errors).toHaveLength(1);
            expect(result.errors[0].roleName).toBe('TestRole');
            expect(result.errors[0].error).toBe('Insufficient permissions');
        });

        it('should use default values for missing role properties', async () => {
            const roleConfig = {
                'SimpleRole': {
                    permissions: ['SendMessages']
                }
            };

            await autoConfigManager.createRoles(mockGuild, roleConfig);

            expect(mockGuild.roles.create).toHaveBeenCalledWith({
                name: 'SimpleRole',
                color: '#99aab5',
                hoist: false,
                mentionable: false,
                permissions: expect.any(Array),
                reason: 'Auto-configuration by bot'
            });
        });
    });

    describe('setChannelPermissions', () => {
        let mockChannel;

        beforeEach(() => {
            mockChannel = {
                name: 'test-channel',
                permissionOverwrites: {
                    create: vi.fn().mockResolvedValue({})
                }
            };

            mockGuild.roles = {
                everyone: { id: 'everyone-role-id' },
                cache: {
                    find: vi.fn()
                }
            };
        });

        it('should set mod-only permissions correctly', async () => {
            const mockModRole = { id: 'mod-role-id', name: 'Moderator' };
            mockGuild.roles.cache.find.mockReturnValue(mockModRole);

            await autoConfigManager.setChannelPermissions(mockChannel, 'mod-only', mockGuild);

            expect(mockChannel.permissionOverwrites.create).toHaveBeenCalledWith(
                mockGuild.roles.everyone,
                { ViewChannel: false, SendMessages: false }
            );
            expect(mockChannel.permissionOverwrites.create).toHaveBeenCalledWith(
                mockModRole,
                { ViewChannel: true, SendMessages: true, ManageMessages: true }
            );
        });

        it('should set admin-only permissions correctly', async () => {
            const mockAdminRole = { id: 'admin-role-id', name: 'Administrator' };
            mockGuild.roles.cache.find.mockReturnValue(mockAdminRole);

            await autoConfigManager.setChannelPermissions(mockChannel, 'admin-only', mockGuild);

            expect(mockChannel.permissionOverwrites.create).toHaveBeenCalledWith(
                mockGuild.roles.everyone,
                { ViewChannel: false, SendMessages: false }
            );
            expect(mockChannel.permissionOverwrites.create).toHaveBeenCalledWith(
                mockAdminRole,
                { ViewChannel: true, SendMessages: true, ManageMessages: true, ManageChannels: true }
            );
        });

        it('should set public permissions correctly', async () => {
            await autoConfigManager.setChannelPermissions(mockChannel, 'public', mockGuild);

            expect(mockChannel.permissionOverwrites.create).toHaveBeenCalledWith(
                mockGuild.roles.everyone,
                { ViewChannel: true, SendMessages: true }
            );
        });

        it('should handle permission setting errors gracefully', async () => {
            mockChannel.permissionOverwrites.create.mockRejectedValue(new Error('Permission error'));
            const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

            await autoConfigManager.setChannelPermissions(mockChannel, 'mod-only', mockGuild);

            expect(consoleSpy).toHaveBeenCalled();
            consoleSpy.mockRestore();
        });
    });

    describe('configureNewGuild', () => {
        beforeEach(() => {
            // Mock successful channel and role creation
            mockGuild.channels = {
                create: vi.fn().mockResolvedValue({
                    id: 'channel-id',
                    name: 'test-channel',
                    permissionOverwrites: { create: vi.fn().mockResolvedValue({}) }
                }),
                cache: []
            };
            mockGuild.channels.cache.some = vi.fn().mockReturnValue(false);
            
            mockGuild.roles = {
                create: vi.fn().mockResolvedValue({
                    id: 'role-id',
                    name: 'test-role'
                }),
                cache: [],
                everyone: { id: 'everyone-id' }
            };
            mockGuild.roles.cache.some = vi.fn().mockReturnValue(false);
            mockGuild.roles.cache.find = vi.fn().mockReturnValue(null);
        });

        it('should configure guild successfully with auto-detected template', async () => {
            mockGuild.memberCount = 50; // Should use 'small' template
            
            const result = await autoConfigManager.configureNewGuild(mockGuild);

            expect(result.success).toBe(true);
            expect(result.templateUsed).toBe('small');
            expect(result.configApplied).toBe(true);
            expect(mockGuildConfig.initializeGuild).toHaveBeenCalledWith(mockGuild.id);
        });

        it('should configure guild with specified template', async () => {
            const result = await autoConfigManager.configureNewGuild(mockGuild, 'medium');

            expect(result.success).toBe(true);
            expect(result.templateUsed).toBe('medium');
        });

        it('should handle template not found error', async () => {
            const result = await autoConfigManager.configureNewGuild(mockGuild, 'nonexistent');

            expect(result.success).toBe(false);
            expect(result.error).toContain('Template not found');
        });

        it('should handle validation failures', async () => {
            mockBotMember.permissions.has.mockReturnValue(false);
            
            const result = await autoConfigManager.configureNewGuild(mockGuild);

            expect(result.success).toBe(false);
            expect(result.error).toBe('Template validation failed');
            expect(result.issues).toBeDefined();
        });

        it('should handle configuration errors gracefully', async () => {
            mockGuild.channels.create.mockRejectedValue(new Error('Channel creation failed'));
            
            const result = await autoConfigManager.configureNewGuild(mockGuild);

            expect(result.success).toBe(true); // Should still succeed overall
            expect(result.channels.errors).toHaveLength(1);
        });
    });

    describe('validateSetupPermissions', () => {
        it('should validate permissions successfully', () => {
            const result = autoConfigManager.validateSetupPermissions(mockGuild);

            expect(result.valid).toBe(true);
            expect(result.missing).toHaveLength(0);
        });

        it('should detect missing permissions', () => {
            mockBotMember.permissions.has.mockReturnValue(false);
            
            const result = autoConfigManager.validateSetupPermissions(mockGuild);

            expect(result.valid).toBe(false);
            expect(result.missing.length).toBeGreaterThan(0);
            expect(result.missing).toContain('Manage Channels');
        });

        it('should handle missing bot member', () => {
            mockGuild.members.cache.get.mockReturnValue(null);
            
            const result = autoConfigManager.validateSetupPermissions(mockGuild);

            expect(result.valid).toBe(false);
            expect(result.missing).toContain('Bot not found in guild');
        });
    });

    describe('validateExistingConfiguration', () => {
        let template;

        beforeEach(() => {
            template = {
                channels: {
                    'moderation-log': { type: 'GUILD_TEXT' },
                    'reports': { type: 'GUILD_TEXT' }
                },
                roles: {
                    'Moderator': { permissions: ['ManageMessages'] },
                    'Helper': { permissions: ['ViewChannel'] }
                }
            };

            mockGuild.channels.cache.find = vi.fn();
            mockGuild.roles.cache.find = vi.fn();
        });

        it('should validate configuration with no conflicts', () => {
            mockGuild.channels.cache.find.mockReturnValue(null);
            mockGuild.roles.cache.find.mockReturnValue(null);

            const result = autoConfigManager.validateExistingConfiguration(mockGuild, template);

            expect(result.isValid).toBe(true);
            expect(result.canProceed).toBe(true);
            expect(result.conflicts.channels).toHaveLength(0);
            expect(result.conflicts.roles).toHaveLength(0);
        });

        it('should detect channel conflicts', () => {
            const existingChannel = { id: 'existing-channel-id', name: 'moderation-log', type: 0 };
            mockGuild.channels.cache.find.mockReturnValue(existingChannel);
            mockGuild.roles.cache.find.mockReturnValue(null);

            const result = autoConfigManager.validateExistingConfiguration(mockGuild, template);

            expect(result.conflicts.channels).toHaveLength(2); // Both channels conflict
            expect(result.conflicts.channels[0].name).toBe('moderation-log');
            expect(result.warnings.length).toBeGreaterThan(0);
        });

        it('should detect role conflicts', () => {
            const existingRole = { 
                id: 'existing-role-id', 
                name: 'Moderator', 
                permissions: { toArray: () => ['SEND_MESSAGES'] }
            };
            mockGuild.channels.cache.find.mockReturnValue(null);
            mockGuild.roles.cache.find.mockReturnValue(existingRole);

            const result = autoConfigManager.validateExistingConfiguration(mockGuild, template);

            expect(result.conflicts.roles).toHaveLength(2); // Both roles conflict
            expect(result.conflicts.roles[0].name).toBe('Moderator');
            expect(result.warnings.length).toBeGreaterThan(0);
        });

        it('should detect permission conflicts', () => {
            mockBotMember.permissions.has.mockReturnValue(false);
            mockGuild.channels.cache.find.mockReturnValue(null);
            mockGuild.roles.cache.find.mockReturnValue(null);

            const result = autoConfigManager.validateExistingConfiguration(mockGuild, template);

            expect(result.isValid).toBe(false);
            expect(result.conflicts.permissions.length).toBeGreaterThan(0);
            expect(result.recommendations.length).toBeGreaterThan(0);
        });
    });

    describe('generateWelcomeMessage', () => {
        let configResult;

        beforeEach(() => {
            configResult = {
                success: true,
                templateUsed: 'small',
                channels: {
                    created: [
                        { id: 'channel-1', name: 'moderation-log' },
                        { id: 'channel-2', name: 'reports' }
                    ],
                    errors: []
                },
                roles: {
                    created: [
                        { id: 'role-1', name: 'Moderator' }
                    ],
                    errors: []
                },
                configApplied: true
            };

            mockGuild.name = 'Test Guild';
            mockGuild.ownerId = 'owner-id-123';
        });

        it('should generate comprehensive welcome message', () => {
            const welcomeData = autoConfigManager.generateWelcomeMessage(mockGuild, configResult);

            expect(welcomeData.embeds).toHaveLength(1);
            expect(welcomeData.embeds[0].title).toContain('Auto-Configuration Complete');
            expect(welcomeData.embeds[0].description).toContain('Test Guild');
            expect(welcomeData.embeds[0].fields.length).toBeGreaterThan(0);
            expect(welcomeData.content).toContain('owner-id-123');
        });

        it('should include created channels in message', () => {
            const welcomeData = autoConfigManager.generateWelcomeMessage(mockGuild, configResult);
            const channelField = welcomeData.embeds[0].fields.find(f => f.name.includes('Channels Created'));

            expect(channelField).toBeDefined();
            expect(channelField.value).toContain('moderation-log');
            expect(channelField.value).toContain('channel-1');
        });

        it('should include created roles in message', () => {
            const welcomeData = autoConfigManager.generateWelcomeMessage(mockGuild, configResult);
            const roleField = welcomeData.embeds[0].fields.find(f => f.name.includes('Roles Created'));

            expect(roleField).toBeDefined();
            expect(roleField.value).toContain('Moderator');
            expect(roleField.value).toContain('role-1');
        });

        it('should handle configuration with errors', () => {
            configResult.channels.errors = [{ channelName: 'failed-channel', error: 'Permission denied' }];
            configResult.roles.errors = [{ roleName: 'failed-role', error: 'Invalid permissions' }];

            const welcomeData = autoConfigManager.generateWelcomeMessage(mockGuild, configResult);

            expect(welcomeData.embeds[0].color).toBe(0xffaa00); // Orange for partial success
            const issueField = welcomeData.embeds[0].fields.find(f => f.name.includes('Issues Encountered'));
            expect(issueField).toBeDefined();
        });

        it('should include enabled features', () => {
            const welcomeData = autoConfigManager.generateWelcomeMessage(mockGuild, configResult);
            const featuresField = welcomeData.embeds[0].fields.find(f => f.name.includes('Features Enabled'));

            expect(featuresField).toBeDefined();
            expect(featuresField.value).toContain('Anti-Invite Protection');
        });
    });

    describe('sendWelcomeMessage', () => {
        let mockChannel;
        let welcomeData;

        beforeEach(() => {
            mockChannel = {
                id: 'channel-id',
                name: 'general',
                isTextBased: () => true,
                permissionsFor: vi.fn().mockReturnValue({
                    has: vi.fn().mockReturnValue(true)
                }),
                send: vi.fn().mockResolvedValue({ id: 'message-id', channel: { id: 'channel-id' } })
            };

            welcomeData = {
                embeds: [{ title: 'Welcome' }],
                content: 'Welcome message'
            };

            mockGuild.systemChannel = mockChannel;
            mockGuild.channels.cache.find = vi.fn().mockReturnValue(mockChannel);
        });

        it('should send welcome message to system channel', async () => {
            const result = await autoConfigManager.sendWelcomeMessage(mockGuild, welcomeData);

            expect(mockChannel.send).toHaveBeenCalledWith(welcomeData);
            expect(result).toBeDefined();
            expect(result.id).toBe('message-id');
        });

        it('should fallback to general channel if no system channel', async () => {
            mockGuild.systemChannel = null;

            const result = await autoConfigManager.sendWelcomeMessage(mockGuild, welcomeData);

            expect(mockChannel.send).toHaveBeenCalledWith(welcomeData);
            expect(result).toBeDefined();
        });

        it('should handle no suitable channel found', async () => {
            mockGuild.systemChannel = null;
            mockGuild.channels.cache.find = vi.fn().mockReturnValue(null);

            const result = await autoConfigManager.sendWelcomeMessage(mockGuild, welcomeData);

            expect(result).toBeNull();
        });

        it('should handle send message errors', async () => {
            mockChannel.send.mockRejectedValue(new Error('Send failed'));
            const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

            const result = await autoConfigManager.sendWelcomeMessage(mockGuild, welcomeData);

            expect(result).toBeNull();
            expect(consoleSpy).toHaveBeenCalled();
            consoleSpy.mockRestore();
        });
    });

    describe('previewConfiguration', () => {
        beforeEach(() => {
            mockGuild.channels.cache.find = vi.fn().mockReturnValue(null);
            mockGuild.roles.cache.find = vi.fn().mockReturnValue(null);
            mockGuild.channels.cache.some = vi.fn().mockReturnValue(false);
            mockGuild.roles.cache.some = vi.fn().mockReturnValue(false);
        });

        it('should generate configuration preview successfully', async () => {
            const result = await autoConfigManager.previewConfiguration(mockGuild);

            expect(result.success).toBe(true);
            expect(result.templateName).toBe('small');
            expect(result.template).toBeDefined();
            expect(result.preview).toBeDefined();
            expect(result.validation).toBeDefined();
            expect(result.canProceed).toBe(true);
        });

        it('should handle invalid template', async () => {
            const result = await autoConfigManager.previewConfiguration(mockGuild, 'nonexistent');

            expect(result.success).toBe(false);
            expect(result.error).toContain('Template not found');
        });

        it('should detect when configuration cannot proceed', async () => {
            mockBotMember.permissions.has.mockReturnValue(false);

            const result = await autoConfigManager.previewConfiguration(mockGuild);

            expect(result.canProceed).toBe(false);
            expect(result.validation.permissions.valid).toBe(false);
        });
    });

    describe('completeAutoConfiguration', () => {
        beforeEach(() => {
            // Mock successful configuration
            mockGuild.channels = {
                create: vi.fn().mockResolvedValue({
                    id: 'channel-id',
                    name: 'test-channel',
                    permissionOverwrites: { create: vi.fn().mockResolvedValue({}) }
                }),
                cache: []
            };
            mockGuild.channels.cache.some = vi.fn().mockReturnValue(false);
            mockGuild.channels.cache.find = vi.fn().mockReturnValue({
                id: 'general-id',
                name: 'general',
                isTextBased: () => true,
                permissionsFor: () => ({ has: () => true }),
                send: vi.fn().mockResolvedValue({ id: 'msg-id', channel: { id: 'general-id' } })
            });
            
            mockGuild.roles = {
                create: vi.fn().mockResolvedValue({
                    id: 'role-id',
                    name: 'test-role'
                }),
                cache: [],
                everyone: { id: 'everyone-id' }
            };
            mockGuild.roles.cache.some = vi.fn().mockReturnValue(false);
            mockGuild.roles.cache.find = vi.fn().mockReturnValue(null);

            mockGuild.systemChannel = null;
            mockGuild.name = 'Test Guild';
            mockGuild.ownerId = 'owner-id';
        });

        it('should complete auto-configuration successfully', async () => {
            const result = await autoConfigManager.completeAutoConfiguration(mockGuild);

            expect(result.success).toBe(true);
            expect(result.templateUsed).toBe('small');
            expect(result.welcomeMessageSent).toBe(true);
            expect(result.welcomeChannelId).toBe('general-id');
            expect(result.validation).toBeDefined();
        });

        it('should complete configuration without welcome message', async () => {
            const result = await autoConfigManager.completeAutoConfiguration(mockGuild, null, false);

            expect(result.success).toBe(true);
            expect(result.welcomeMessageSent).toBe(false);
            expect(result.welcomeChannelId).toBeNull();
        });

        it('should handle validation failures', async () => {
            mockBotMember.permissions.has.mockReturnValue(false);

            const result = await autoConfigManager.completeAutoConfiguration(mockGuild);

            expect(result.success).toBe(false);
            expect(result.error).toContain('validation issues');
            expect(result.validation).toBeDefined();
        });

        it('should handle configuration errors', async () => {
            mockGuild.channels.create.mockRejectedValue(new Error('Configuration failed'));

            const result = await autoConfigManager.completeAutoConfiguration(mockGuild);

            expect(result.success).toBe(true); // Should still succeed overall
            expect(result.channels.errors).toHaveLength(1);
        });

        it('should handle welcome message send failure gracefully', async () => {
            mockGuild.channels.cache.find = vi.fn().mockReturnValue({
                id: 'general-id',
                name: 'general',
                isTextBased: () => true,
                permissionsFor: () => ({ has: () => true }),
                send: vi.fn().mockRejectedValue(new Error('Send failed'))
            });

            const result = await autoConfigManager.completeAutoConfiguration(mockGuild);

            expect(result.success).toBe(true);
            expect(result.welcomeMessageSent).toBe(false);
        });
    });
});