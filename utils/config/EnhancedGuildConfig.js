import { GuildConfig } from '../GuildConfig.js';
import fs from 'fs';
import path from 'path';

/**
 * Enhanced Guild Configuration that extends the base GuildConfig
 * with support for new features: raid detection, dox detection, 
 * telegram integration, watchlist, and fun commands
 */
class EnhancedGuildConfig extends GuildConfig {
    constructor(filePath = 'guilds_config.json') {
        super(filePath);
        this.initializeEnhancedDefaults();
    }

    /**
     * Initialize enhanced default configurations for all existing guilds
     */
    initializeEnhancedDefaults() {
        let configChanged = false;
        
        for (const guildId in this.config) {
            if (this.initializeEnhancedGuild(guildId)) {
                configChanged = true;
            }
        }
        
        if (configChanged) {
            this.saveConfig();
        }
    }

    /**
     * Initialize enhanced configuration for a specific guild
     * @param {string} guildId - The guild ID to initialize
     * @returns {boolean} - Whether the configuration was changed
     */
    initializeEnhancedGuild(guildId) {
        // Call parent initialization first
        super.initializeGuild(guildId);
        
        let changed = false;
        
        // Initialize raid detection config
        if (!this.config[guildId].raidDetection) {
            this.config[guildId].raidDetection = {
                enabled: false,
                rapidJoinThreshold: 5,
                timeWindowMs: 60000, // 1 minute
                whitelistedEvents: [],
                protectionLevel: 'medium',
                autoSlowMode: true,
                autoJoinRestrictions: true
            };
            changed = true;
        }

        // Initialize dox detection config
        if (!this.config[guildId].doxDetection) {
            this.config[guildId].doxDetection = {
                enabled: false,
                phonePatterns: [
                    '\\b\\d{3}[-.]?\\d{3}[-.]?\\d{4}\\b', // US phone format
                    '\\b\\+\\d{1,3}[-.]?\\d{1,14}\\b'     // International format
                ],
                emailPatterns: [
                    '\\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\\.[A-Z|a-z]{2,}\\b'
                ],
                addressPatterns: [
                    '\\b\\d+\\s+[A-Za-z0-9\\s,.-]+\\b' // Basic address pattern
                ],
                ssnPatterns: [
                    '\\b\\d{3}-\\d{2}-\\d{4}\\b',      // XXX-XX-XXXX format
                    '\\b\\d{9}\\b'                      // 9 consecutive digits
                ],
                exceptions: [],
                ocrEnabled: false,
                autoDelete: true
            };
            changed = true;
        }

        // Initialize telegram config
        if (!this.config[guildId].telegram) {
            this.config[guildId].telegram = {
                botToken: '',
                channelId: '',
                bridgeChannelId: '',
                notificationsEnabled: false,
                bridgeEnabled: false,
                allowedEventTypes: ['moderation', 'raid', 'dox']
            };
            changed = true;
        }

        // Initialize fun commands config
        if (!this.config[guildId].funCommands) {
            this.config[guildId].funCommands = {
                enabled: false,
                cooldownMs: 5000, // 5 seconds
                enabledCommands: ['joke', '8ball', 'meme', 'trivia'],
                disabledChannels: [],
                leaderboardEnabled: true
            };
            changed = true;
        }

        // Initialize watchlist config
        if (!this.config[guildId].watchlist) {
            this.config[guildId].watchlist = {
                enabled: false,
                defaultWatchLevel: 'observe',
                autoNotifications: true,
                reportIntervalHours: 24
            };
            changed = true;
        }

        return changed;
    }

    // Raid Detection Configuration Methods
    
    /**
     * Enable or disable raid detection for a guild
     * @param {string} guildId - Guild ID
     * @param {boolean} enabled - Whether to enable raid detection
     */
    setRaidDetectionEnabled(guildId, enabled) {
        this.initializeEnhancedGuild(guildId);
        this.config[guildId].raidDetection.enabled = enabled;
        this.saveConfig();
    }

    /**
     * Get raid detection configuration for a guild
     * @param {string} guildId - Guild ID
     * @returns {Object} Raid detection configuration
     */
    getRaidDetectionConfig(guildId) {
        this.initializeEnhancedGuild(guildId);
        return this.config[guildId].raidDetection;
    }

    /**
     * Update raid detection settings
     * @param {string} guildId - Guild ID
     * @param {Object} settings - Settings to update
     */
    updateRaidDetectionConfig(guildId, settings) {
        this.initializeEnhancedGuild(guildId);
        Object.assign(this.config[guildId].raidDetection, settings);
        this.saveConfig();
    }

    // Dox Detection Configuration Methods

    /**
     * Enable or disable dox detection for a guild
     * @param {string} guildId - Guild ID
     * @param {boolean} enabled - Whether to enable dox detection
     */
    setDoxDetectionEnabled(guildId, enabled) {
        this.initializeEnhancedGuild(guildId);
        this.config[guildId].doxDetection.enabled = enabled;
        this.saveConfig();
    }

    /**
     * Get dox detection configuration for a guild
     * @param {string} guildId - Guild ID
     * @returns {Object} Dox detection configuration
     */
    getDoxDetectionConfig(guildId) {
        this.initializeEnhancedGuild(guildId);
        return this.config[guildId].doxDetection;
    }

    /**
     * Update dox detection settings
     * @param {string} guildId - Guild ID
     * @param {Object} settings - Settings to update
     */
    updateDoxDetectionConfig(guildId, settings) {
        this.initializeEnhancedGuild(guildId);
        Object.assign(this.config[guildId].doxDetection, settings);
        this.saveConfig();
    }

    // Telegram Configuration Methods

    /**
     * Set Telegram configuration for a guild
     * @param {string} guildId - Guild ID
     * @param {Object} telegramConfig - Telegram configuration
     */
    setTelegramConfig(guildId, telegramConfig) {
        this.initializeEnhancedGuild(guildId);
        Object.assign(this.config[guildId].telegram, telegramConfig);
        this.saveConfig();
    }

    /**
     * Get Telegram configuration for a guild
     * @param {string} guildId - Guild ID
     * @returns {Object} Telegram configuration
     */
    getTelegramConfig(guildId) {
        this.initializeEnhancedGuild(guildId);
        return this.config[guildId].telegram;
    }

    /**
     * Enable or disable Telegram notifications for a guild
     * @param {string} guildId - Guild ID
     * @param {boolean} enabled - Whether to enable notifications
     */
    setTelegramNotificationsEnabled(guildId, enabled) {
        this.initializeEnhancedGuild(guildId);
        this.config[guildId].telegram.notificationsEnabled = enabled;
        this.saveConfig();
    }

    // Fun Commands Configuration Methods

    /**
     * Enable or disable fun commands for a guild
     * @param {string} guildId - Guild ID
     * @param {boolean} enabled - Whether to enable fun commands
     */
    setFunCommandsEnabled(guildId, enabled) {
        this.initializeEnhancedGuild(guildId);
        this.config[guildId].funCommands.enabled = enabled;
        this.saveConfig();
    }

    /**
     * Get fun commands configuration for a guild
     * @param {string} guildId - Guild ID
     * @returns {Object} Fun commands configuration
     */
    getFunCommandsConfig(guildId) {
        this.initializeEnhancedGuild(guildId);
        return this.config[guildId].funCommands;
    }

    /**
     * Update fun commands settings
     * @param {string} guildId - Guild ID
     * @param {Object} settings - Settings to update
     */
    updateFunCommandsConfig(guildId, settings) {
        this.initializeEnhancedGuild(guildId);
        Object.assign(this.config[guildId].funCommands, settings);
        this.saveConfig();
    }

    // Watchlist Configuration Methods

    /**
     * Enable or disable watchlist for a guild
     * @param {string} guildId - Guild ID
     * @param {boolean} enabled - Whether to enable watchlist
     */
    setWatchlistEnabled(guildId, enabled) {
        this.initializeEnhancedGuild(guildId);
        this.config[guildId].watchlist.enabled = enabled;
        this.saveConfig();
    }

    /**
     * Get watchlist configuration for a guild
     * @param {string} guildId - Guild ID
     * @returns {Object} Watchlist configuration
     */
    getWatchlistConfig(guildId) {
        this.initializeEnhancedGuild(guildId);
        return this.config[guildId].watchlist;
    }

    /**
     * Update watchlist settings
     * @param {string} guildId - Guild ID
     * @param {Object} settings - Settings to update
     */
    updateWatchlistConfig(guildId, settings) {
        this.initializeEnhancedGuild(guildId);
        Object.assign(this.config[guildId].watchlist, settings);
        this.saveConfig();
    }

    // Utility Methods

    /**
     * Get all enhanced configurations for a guild
     * @param {string} guildId - Guild ID
     * @returns {Object} Complete guild configuration
     */
    getEnhancedGuildConfig(guildId) {
        this.initializeEnhancedGuild(guildId);
        return this.config[guildId];
    }

    /**
     * Reset enhanced configurations to defaults for a guild
     * @param {string} guildId - Guild ID
     */
    resetEnhancedConfig(guildId) {
        if (this.config[guildId]) {
            // Remove enhanced configs while preserving base config
            delete this.config[guildId].raidDetection;
            delete this.config[guildId].doxDetection;
            delete this.config[guildId].telegram;
            delete this.config[guildId].funCommands;
            delete this.config[guildId].watchlist;
            
            // Reinitialize with defaults
            this.initializeEnhancedGuild(guildId);
            this.saveConfig();
        }
    }

    /**
     * Override parent reload method to include enhanced initialization
     */
    reload() {
        super.reload();
        this.initializeEnhancedDefaults();
    }

    // Migration System

    /**
     * Get current configuration version
     * @returns {string} Current version
     */
    getConfigVersion() {
        return this.config._version || '1.0.0';
    }

    /**
     * Set configuration version
     * @param {string} version - Version to set
     */
    setConfigVersion(version) {
        this.config._version = version;
        this.saveConfig();
    }

    /**
     * Migrate configuration from older versions
     * @param {string} fromVersion - Version to migrate from
     * @param {string} toVersion - Version to migrate to
     */
    migrateConfig(fromVersion, toVersion) {
        console.log(`Migrating configuration from ${fromVersion} to ${toVersion}`);
        
        // Create backup before migration
        this.createConfigBackup();
        
        // Apply migrations based on version
        if (fromVersion === '1.0.0' && toVersion === '1.1.0') {
            this.migrateFrom1_0_0To1_1_0();
        }
        
        // Update version
        this.setConfigVersion(toVersion);
        console.log('Configuration migration completed successfully');
    }

    /**
     * Example migration from 1.0.0 to 1.1.0
     */
    migrateFrom1_0_0To1_1_0() {
        // Add new configuration options that weren't present in 1.0.0
        for (const guildId in this.config) {
            if (guildId === '_version') continue;
            
            // Add new dox detection patterns if missing
            if (this.config[guildId].doxDetection && !this.config[guildId].doxDetection.creditCardPatterns) {
                this.config[guildId].doxDetection.creditCardPatterns = [
                    '\\b(?:\\d{4}[-\\s]){3}\\d{4}\\b',
                    '\\b(?:4\\d{15}|5[1-5]\\d{14}|3[47]\\d{13}|6(?:011|5\\d{2})\\d{12})\\b'
                ];
            }
            
            // Add new raid detection options if missing
            if (this.config[guildId].raidDetection && !this.config[guildId].raidDetection.suspiciousPatternDetection) {
                this.config[guildId].raidDetection.suspiciousPatternDetection = {
                    enabled: false,
                    similarNameThreshold: 0.8,
                    coordinatedBehaviorDetection: true
                };
            }
        }
    }

    // Configuration Backup and Restore

    /**
     * Create a backup of the current configuration
     * @returns {string} Backup file path
     */
    createConfigBackup() {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupPath = `data/config_backup_${timestamp}.json`;
        
        try {
            // Ensure backup directory exists
            const backupDir = path.dirname(backupPath);
            if (!fs.existsSync(backupDir)) {
                fs.mkdirSync(backupDir, { recursive: true });
            }
            
            // Write backup
            fs.writeFileSync(backupPath, JSON.stringify(this.config, null, 2));
            console.log(`Configuration backup created: ${backupPath}`);
            return backupPath;
        } catch (error) {
            console.error('Failed to create configuration backup:', error);
            throw error;
        }
    }

    /**
     * Restore configuration from backup
     * @param {string} backupPath - Path to backup file
     */
    restoreConfigFromBackup(backupPath) {
        try {
            if (!fs.existsSync(backupPath)) {
                throw new Error(`Backup file not found: ${backupPath}`);
            }
            
            const backupData = JSON.parse(fs.readFileSync(backupPath, 'utf8'));
            
            // Validate backup data
            if (!this.validateConfigStructure(backupData)) {
                throw new Error('Invalid backup data structure');
            }
            
            // Create current backup before restore
            this.createConfigBackup();
            
            // Restore configuration
            this.config = backupData;
            this.saveConfig();
            
            console.log(`Configuration restored from backup: ${backupPath}`);
        } catch (error) {
            console.error('Failed to restore configuration from backup:', error);
            throw error;
        }
    }

    // Configuration Validation

    /**
     * Validate configuration structure
     * @param {Object} config - Configuration to validate
     * @returns {boolean} Whether configuration is valid
     */
    validateConfigStructure(config) {
        if (!config || typeof config !== 'object') {
            return false;
        }

        // Check each guild configuration
        for (const guildId in config) {
            if (guildId === '_version') continue;
            
            const guildConfig = config[guildId];
            if (!this.validateGuildConfig(guildConfig)) {
                console.error(`Invalid configuration for guild ${guildId}`);
                return false;
            }
        }

        return true;
    }

    /**
     * Validate individual guild configuration
     * @param {Object} guildConfig - Guild configuration to validate
     * @returns {boolean} Whether guild configuration is valid
     */
    validateGuildConfig(guildConfig) {
        if (!guildConfig || typeof guildConfig !== 'object') {
            return false;
        }

        // Validate raid detection config
        if (guildConfig.raidDetection) {
            if (!this.validateRaidDetectionConfig(guildConfig.raidDetection)) {
                return false;
            }
        }

        // Validate dox detection config
        if (guildConfig.doxDetection) {
            if (!this.validateDoxDetectionConfig(guildConfig.doxDetection)) {
                return false;
            }
        }

        // Validate telegram config
        if (guildConfig.telegram) {
            if (!this.validateTelegramConfig(guildConfig.telegram)) {
                return false;
            }
        }

        // Validate fun commands config
        if (guildConfig.funCommands) {
            if (!this.validateFunCommandsConfig(guildConfig.funCommands)) {
                return false;
            }
        }

        // Validate watchlist config
        if (guildConfig.watchlist) {
            if (!this.validateWatchlistConfig(guildConfig.watchlist)) {
                return false;
            }
        }

        return true;
    }

    /**
     * Validate raid detection configuration
     * @param {Object} config - Raid detection config
     * @returns {boolean} Whether config is valid
     */
    validateRaidDetectionConfig(config) {
        return (
            typeof config.enabled === 'boolean' &&
            typeof config.rapidJoinThreshold === 'number' &&
            config.rapidJoinThreshold > 0 &&
            typeof config.timeWindowMs === 'number' &&
            config.timeWindowMs > 0 &&
            Array.isArray(config.whitelistedEvents) &&
            ['low', 'medium', 'high'].includes(config.protectionLevel)
        );
    }

    /**
     * Validate dox detection configuration
     * @param {Object} config - Dox detection config
     * @returns {boolean} Whether config is valid
     */
    validateDoxDetectionConfig(config) {
        return (
            typeof config.enabled === 'boolean' &&
            Array.isArray(config.phonePatterns) &&
            Array.isArray(config.emailPatterns) &&
            Array.isArray(config.addressPatterns) &&
            Array.isArray(config.ssnPatterns) &&
            Array.isArray(config.exceptions) &&
            typeof config.ocrEnabled === 'boolean' &&
            typeof config.autoDelete === 'boolean'
        );
    }

    /**
     * Validate telegram configuration
     * @param {Object} config - Telegram config
     * @returns {boolean} Whether config is valid
     */
    validateTelegramConfig(config) {
        return (
            typeof config.botToken === 'string' &&
            typeof config.channelId === 'string' &&
            typeof config.bridgeChannelId === 'string' &&
            typeof config.notificationsEnabled === 'boolean' &&
            typeof config.bridgeEnabled === 'boolean' &&
            Array.isArray(config.allowedEventTypes)
        );
    }

    /**
     * Validate fun commands configuration
     * @param {Object} config - Fun commands config
     * @returns {boolean} Whether config is valid
     */
    validateFunCommandsConfig(config) {
        return (
            typeof config.enabled === 'boolean' &&
            typeof config.cooldownMs === 'number' &&
            config.cooldownMs >= 0 &&
            Array.isArray(config.enabledCommands) &&
            Array.isArray(config.disabledChannels) &&
            typeof config.leaderboardEnabled === 'boolean'
        );
    }

    /**
     * Validate watchlist configuration
     * @param {Object} config - Watchlist config
     * @returns {boolean} Whether config is valid
     */
    validateWatchlistConfig(config) {
        return (
            typeof config.enabled === 'boolean' &&
            ['observe', 'alert', 'action'].includes(config.defaultWatchLevel) &&
            typeof config.autoNotifications === 'boolean' &&
            typeof config.reportIntervalHours === 'number' &&
            config.reportIntervalHours > 0
        );
    }

    /**
     * Apply default values for missing configuration options
     * @param {string} guildId - Guild ID
     * @param {Object} partialConfig - Partial configuration to fill
     */
    applyDefaults(guildId, partialConfig) {
        this.initializeEnhancedGuild(guildId);
        
        // Merge with defaults
        const defaults = this.config[guildId];
        const merged = this.deepMerge(defaults, partialConfig);
        
        this.config[guildId] = merged;
        this.saveConfig();
    }

    /**
     * Deep merge two objects
     * @param {Object} target - Target object
     * @param {Object} source - Source object
     * @returns {Object} Merged object
     */
    deepMerge(target, source) {
        const result = { ...target };
        
        for (const key in source) {
            if (source[key] && typeof source[key] === 'object' && !Array.isArray(source[key])) {
                result[key] = this.deepMerge(result[key] || {}, source[key]);
            } else {
                result[key] = source[key];
            }
        }
        
        return result;
    }
}

// Create and export singleton instance
const enhancedGuildConfig = new EnhancedGuildConfig();
export default enhancedGuildConfig;
export { EnhancedGuildConfig };