/**
 * Configuration Validator for Enhanced Discord Bot
 * Validates configuration objects against expected schemas
 */

class ConfigValidator {
    /**
     * Validate raid detection configuration
     * @param {Object} config - Raid detection config to validate
     * @returns {Object} Validation result with isValid and errors
     */
    static validateRaidDetectionConfig(config) {
        const errors = [];
        
        if (typeof config.enabled !== 'boolean') {
            errors.push('raidDetection.enabled must be a boolean');
        }
        
        if (typeof config.rapidJoinThreshold !== 'number' || config.rapidJoinThreshold < 1) {
            errors.push('raidDetection.rapidJoinThreshold must be a positive number');
        }
        
        if (typeof config.timeWindowMs !== 'number' || config.timeWindowMs < 1000) {
            errors.push('raidDetection.timeWindowMs must be at least 1000ms');
        }
        
        if (!Array.isArray(config.whitelistedEvents)) {
            errors.push('raidDetection.whitelistedEvents must be an array');
        }
        
        const validProtectionLevels = ['low', 'medium', 'high'];
        if (!validProtectionLevels.includes(config.protectionLevel)) {
            errors.push('raidDetection.protectionLevel must be one of: low, medium, high');
        }
        
        if (typeof config.autoSlowMode !== 'boolean') {
            errors.push('raidDetection.autoSlowMode must be a boolean');
        }
        
        if (typeof config.autoJoinRestrictions !== 'boolean') {
            errors.push('raidDetection.autoJoinRestrictions must be a boolean');
        }
        
        return {
            isValid: errors.length === 0,
            errors
        };
    }

    /**
     * Validate dox detection configuration
     * @param {Object} config - Dox detection config to validate
     * @returns {Object} Validation result with isValid and errors
     */
    static validateDoxDetectionConfig(config) {
        const errors = [];
        
        if (typeof config.enabled !== 'boolean') {
            errors.push('doxDetection.enabled must be a boolean');
        }
        
        const patternArrays = ['phonePatterns', 'emailPatterns', 'addressPatterns', 'ssnPatterns', 'exceptions'];
        patternArrays.forEach(arrayName => {
            if (!Array.isArray(config[arrayName])) {
                errors.push(`doxDetection.${arrayName} must be an array`);
            } else {
                config[arrayName].forEach((pattern, index) => {
                    if (typeof pattern !== 'string') {
                        errors.push(`doxDetection.${arrayName}[${index}] must be a string`);
                    } else {
                        try {
                            new RegExp(pattern);
                        } catch (e) {
                            errors.push(`doxDetection.${arrayName}[${index}] is not a valid regex pattern`);
                        }
                    }
                });
            }
        });
        
        if (typeof config.ocrEnabled !== 'boolean') {
            errors.push('doxDetection.ocrEnabled must be a boolean');
        }
        
        if (typeof config.autoDelete !== 'boolean') {
            errors.push('doxDetection.autoDelete must be a boolean');
        }
        
        return {
            isValid: errors.length === 0,
            errors
        };
    }

    /**
     * Validate telegram configuration
     * @param {Object} config - Telegram config to validate
     * @returns {Object} Validation result with isValid and errors
     */
    static validateTelegramConfig(config) {
        const errors = [];
        
        if (typeof config.botToken !== 'string') {
            errors.push('telegram.botToken must be a string');
        }
        
        if (typeof config.channelId !== 'string') {
            errors.push('telegram.channelId must be a string');
        }
        
        if (typeof config.bridgeChannelId !== 'string') {
            errors.push('telegram.bridgeChannelId must be a string');
        }
        
        if (typeof config.notificationsEnabled !== 'boolean') {
            errors.push('telegram.notificationsEnabled must be a boolean');
        }
        
        if (typeof config.bridgeEnabled !== 'boolean') {
            errors.push('telegram.bridgeEnabled must be a boolean');
        }
        
        if (!Array.isArray(config.allowedEventTypes)) {
            errors.push('telegram.allowedEventTypes must be an array');
        } else {
            const validEventTypes = ['moderation', 'raid', 'dox', 'status', 'stats'];
            config.allowedEventTypes.forEach((eventType, index) => {
                if (!validEventTypes.includes(eventType)) {
                    errors.push(`telegram.allowedEventTypes[${index}] must be one of: ${validEventTypes.join(', ')}`);
                }
            });
        }
        
        return {
            isValid: errors.length === 0,
            errors
        };
    }

    /**
     * Validate fun commands configuration
     * @param {Object} config - Fun commands config to validate
     * @returns {Object} Validation result with isValid and errors
     */
    static validateFunCommandsConfig(config) {
        const errors = [];
        
        if (typeof config.enabled !== 'boolean') {
            errors.push('funCommands.enabled must be a boolean');
        }
        
        if (typeof config.cooldownMs !== 'number' || config.cooldownMs < 0) {
            errors.push('funCommands.cooldownMs must be a non-negative number');
        }
        
        if (!Array.isArray(config.enabledCommands)) {
            errors.push('funCommands.enabledCommands must be an array');
        } else {
            config.enabledCommands.forEach((command, index) => {
                if (typeof command !== 'string') {
                    errors.push(`funCommands.enabledCommands[${index}] must be a string`);
                }
            });
        }
        
        if (!Array.isArray(config.disabledChannels)) {
            errors.push('funCommands.disabledChannels must be an array');
        } else {
            config.disabledChannels.forEach((channelId, index) => {
                if (typeof channelId !== 'string') {
                    errors.push(`funCommands.disabledChannels[${index}] must be a string`);
                }
            });
        }
        
        if (typeof config.leaderboardEnabled !== 'boolean') {
            errors.push('funCommands.leaderboardEnabled must be a boolean');
        }
        
        return {
            isValid: errors.length === 0,
            errors
        };
    }

    /**
     * Validate watchlist configuration
     * @param {Object} config - Watchlist config to validate
     * @returns {Object} Validation result with isValid and errors
     */
    static validateWatchlistConfig(config) {
        const errors = [];
        
        if (typeof config.enabled !== 'boolean') {
            errors.push('watchlist.enabled must be a boolean');
        }
        
        const validWatchLevels = ['observe', 'alert', 'action'];
        if (!validWatchLevels.includes(config.defaultWatchLevel)) {
            errors.push('watchlist.defaultWatchLevel must be one of: observe, alert, action');
        }
        
        if (typeof config.autoNotifications !== 'boolean') {
            errors.push('watchlist.autoNotifications must be a boolean');
        }
        
        if (typeof config.reportIntervalHours !== 'number' || config.reportIntervalHours < 1) {
            errors.push('watchlist.reportIntervalHours must be a positive number');
        }
        
        return {
            isValid: errors.length === 0,
            errors
        };
    }

    /**
     * Validate a complete enhanced guild configuration
     * @param {Object} guildConfig - Complete guild config to validate
     * @returns {Object} Validation result with isValid and errors
     */
    static validateEnhancedGuildConfig(guildConfig) {
        const allErrors = [];
        
        // Validate each enhanced configuration section
        if (guildConfig.raidDetection) {
            const raidResult = this.validateRaidDetectionConfig(guildConfig.raidDetection);
            allErrors.push(...raidResult.errors);
        }
        
        if (guildConfig.doxDetection) {
            const doxResult = this.validateDoxDetectionConfig(guildConfig.doxDetection);
            allErrors.push(...doxResult.errors);
        }
        
        if (guildConfig.telegram) {
            const telegramResult = this.validateTelegramConfig(guildConfig.telegram);
            allErrors.push(...telegramResult.errors);
        }
        
        if (guildConfig.funCommands) {
            const funResult = this.validateFunCommandsConfig(guildConfig.funCommands);
            allErrors.push(...funResult.errors);
        }
        
        if (guildConfig.watchlist) {
            const watchlistResult = this.validateWatchlistConfig(guildConfig.watchlist);
            allErrors.push(...watchlistResult.errors);
        }
        
        return {
            isValid: allErrors.length === 0,
            errors: allErrors
        };
    }

    /**
     * Validate a watchlist entry
     * @param {Object} entry - Watchlist entry to validate
     * @returns {Object} Validation result with isValid and errors
     */
    static validateWatchlistEntry(entry) {
        const errors = [];
        
        if (typeof entry.userId !== 'string' || !entry.userId.trim()) {
            errors.push('userId is required and must be a non-empty string');
        }
        
        if (typeof entry.username !== 'string' || !entry.username.trim()) {
            errors.push('username is required and must be a non-empty string');
        }
        
        if (typeof entry.discriminator !== 'string') {
            errors.push('discriminator must be a string');
        }
        
        if (typeof entry.reason !== 'string' || !entry.reason.trim()) {
            errors.push('reason is required and must be a non-empty string');
        }
        
        if (typeof entry.addedBy !== 'string' || !entry.addedBy.trim()) {
            errors.push('addedBy is required and must be a non-empty string');
        }
        
        if (!(entry.addedAt instanceof Date) && typeof entry.addedAt !== 'string') {
            errors.push('addedAt must be a Date object or ISO string');
        }
        
        if (!(entry.lastSeen instanceof Date) && typeof entry.lastSeen !== 'string') {
            errors.push('lastSeen must be a Date object or ISO string');
        }
        
        if (typeof entry.guildId !== 'string' || !entry.guildId.trim()) {
            errors.push('guildId is required and must be a non-empty string');
        }
        
        const validWatchLevels = ['observe', 'alert', 'action'];
        if (!validWatchLevels.includes(entry.watchLevel)) {
            errors.push('watchLevel must be one of: observe, alert, action');
        }
        
        if (!Array.isArray(entry.notes)) {
            errors.push('notes must be an array');
        }
        
        if (!Array.isArray(entry.incidents)) {
            errors.push('incidents must be an array');
        }
        
        if (typeof entry.active !== 'boolean') {
            errors.push('active must be a boolean');
        }
        
        return {
            isValid: errors.length === 0,
            errors
        };
    }
}

export default ConfigValidator;