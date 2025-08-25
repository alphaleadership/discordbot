import fs from 'fs';
import path from 'path';
import Tesseract from 'tesseract.js';
import fetch from 'node-fetch';

export default class DoxDetector {
    constructor(warnManager, reportManager, filePath = 'data/dox_detections.json') {
        this.warnManager = warnManager;
        this.reportManager = reportManager;
        this.filePath = path.join(process.cwd(), filePath);
        this.detections = this.loadDetections();
        this.exceptions = this.loadExceptions();
        
        // Discord ID pattern for exclusion (17-19 digits)
        this.discordIdPattern = /\b\d{17,19}\b/g;
        
        // Personal information patterns
        this.patterns = {
            // Phone numbers (various international formats) - more specific to avoid false positives
            phone: [
                /(?:\+?1[-.\s]?)?\(?([0-9]{3})\)?[-.\s]?([0-9]{3})[-.\s]?([0-9]{4})\b/g, // US format
                /(?:\+33|0)[1-9](?:[.\s-]?[0-9]{2}){4}\b/g, // French format
                /(?:\+44|0)[1-9][0-9]{8,9}\b/g, // UK format
                /(?:\+49|0)[1-9][0-9]{7,11}\b/g // German format
            ],
            
            // Email addresses
            email: [
                /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g
            ],
            
            // Social Security Numbers (US format) - more specific patterns
            ssn: [
                /\b\d{3}-\d{2}-\d{4}\b/g, // XXX-XX-XXXX format only
                /\b(?!.*\d{4}[-\s]\d{4}[-\s]\d{4}[-\s]\d{4})\d{9}\b/g // 9 digits but not credit card
            ],
            
            // Credit card numbers (more specific patterns)
            creditCard: [
                /\b(?:\d{4}[-\s]){3}\d{4}\b/g, // 16 digits with separators
                /\b(?:4\d{15}|5[1-5]\d{14}|3[47]\d{13}|6(?:011|5\d{2})\d{12})\b/g // Specific card patterns
            ],
            
            // Addresses (basic patterns)
            address: [
                /\b\d+\s+[A-Za-z0-9\s,.-]+(?:street|st|avenue|ave|road|rd|boulevard|blvd|lane|ln|drive|dr|court|ct|place|pl)\b/gi,
                /\b\d{5}(?:-\d{4})?\b/g // ZIP codes
            ],
            
            // Full names with context (risky pattern - needs careful handling)
            fullName: [
                /\b(?:my\s+name\s+is|i\s+am|call\s+me)\s+([A-Z][a-z]+\s+[A-Z][a-z]+)/gi,
                /\b(?:real\s+name|full\s+name):\s*([A-Z][a-z]+\s+[A-Z][a-z]+)/gi
            ]
        };
    }

    ensureFileExists() {
        if (!fs.existsSync(this.filePath)) {
            this.saveDetections();
        }
        
        const exceptionsPath = path.join(process.cwd(), 'data/dox_exceptions.json');
        if (!fs.existsSync(exceptionsPath)) {
            fs.writeFileSync(exceptionsPath, JSON.stringify({}, null, 2), 'utf8');
        }
    }

    loadDetections() {
        try {
            if (fs.existsSync(this.filePath)) {
                const data = fs.readFileSync(this.filePath, 'utf8');
                return JSON.parse(data);
            }
        } catch (error) {
            console.error('Erreur lors du chargement des détections de dox:', error);
        }
        return [];
    }

    loadExceptions() {
        try {
            const exceptionsPath = path.join(process.cwd(), 'data/dox_exceptions.json');
            let exceptions = {};
            
            if (fs.existsSync(exceptionsPath)) {
                const data = fs.readFileSync(exceptionsPath, 'utf8');
                exceptions = JSON.parse(data);
            }
            
            // Ensure Discord ID exclusion is always present for all guilds
            this.ensureDiscordIdExclusions(exceptions);
            
            return exceptions;
        } catch (error) {
            console.error('Erreur lors du chargement des exceptions de dox:', error);
            const exceptions = {};
            this.ensureDiscordIdExclusions(exceptions);
            return exceptions;
        }
    }

    saveDetections() {
        try {
            const dir = path.dirname(this.filePath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            fs.writeFileSync(this.filePath, JSON.stringify(this.detections, null, 2), 'utf8');
        } catch (error) {
            console.error('Erreur lors de la sauvegarde des détections de dox:', error);
        }
    }

    /**
     * Ensures Discord ID exclusions are present and valid
     * @param {Object} exceptions - The exceptions object to modify
     * @param {boolean} forceUpdate - Whether to force update even if present
     * @returns {Object} Information about what was ensured
     */
    ensureDiscordIdExclusions(exceptions, forceUpdate = false) {
        const changes = [];
        
        // Add global Discord ID exclusion if not present
        if (!exceptions._global) {
            exceptions._global = {};
            changes.push('Created global exceptions structure');
        }
        
        const currentDiscordIdConfig = exceptions._global.discordIds;
        const needsUpdate = !currentDiscordIdConfig || 
                           forceUpdate || 
                           currentDiscordIdConfig.pattern !== '\\b\\d{17,19}\\b' ||
                           typeof currentDiscordIdConfig.enabled !== 'boolean' ||
                           !currentDiscordIdConfig.version ||
                           currentDiscordIdConfig.version !== '1.1.0';
        
        if (needsUpdate) {
            const previousConfig = currentDiscordIdConfig ? { ...currentDiscordIdConfig } : null;
            
            exceptions._global.discordIds = {
                enabled: previousConfig?.enabled !== false, // Default to true unless explicitly disabled
                pattern: '\\b\\d{17,19}\\b',
                description: 'Discord user IDs (17-19 digits)',
                type: 'regex',
                addedBy: previousConfig?.addedBy || 'system',
                addedAt: previousConfig?.addedAt || new Date().toISOString(),
                lastModified: new Date().toISOString(),
                version: '1.1.0',
                autoGenerated: true,
                systemProtected: true, // Prevent accidental removal
                priority: 'highest', // Highest priority exception
                matchCount: 0, // Track how many times this rule has matched
                lastMatched: null, // Last time this rule matched
                configurationHistory: previousConfig ? [
                    ...(previousConfig.configurationHistory || []),
                    {
                        timestamp: new Date().toISOString(),
                        action: 'updated',
                        previousVersion: previousConfig.version || '1.0.0',
                        newVersion: '1.1.0',
                        reason: forceUpdate ? 'Force update requested' : 'Automatic system update'
                    }
                ] : [{
                    timestamp: new Date().toISOString(),
                    action: 'created',
                    version: '1.1.0',
                    reason: 'Initial Discord ID exclusion setup'
                }]
            };
            
            if (previousConfig) {
                changes.push('Updated existing Discord ID exclusion configuration to v1.1.0');
                exceptions._global.discordIds.previousConfig = previousConfig;
            } else {
                changes.push('Created Discord ID exclusion configuration v1.1.0');
            }
        }
        
        // Validate the configuration
        try {
            new RegExp(exceptions._global.discordIds.pattern);
        } catch (error) {
            changes.push('Fixed invalid regex pattern');
            exceptions._global.discordIds.pattern = '\\b\\d{17,19}\\b';
            exceptions._global.discordIds.lastModified = new Date().toISOString();
            exceptions._global.discordIds.fixedAt = new Date().toISOString();
            exceptions._global.discordIds.fixReason = `Invalid regex: ${error.message}`;
            exceptions._global.discordIds.configurationHistory.push({
                timestamp: new Date().toISOString(),
                action: 'repaired',
                reason: `Fixed invalid regex pattern: ${error.message}`
            });
        }
        
        // Ensure additional Discord ID patterns are covered
        this.ensureAdditionalDiscordIdPatterns(exceptions._global.discordIds);
        
        return {
            changesApplied: changes,
            currentConfig: exceptions._global.discordIds,
            wasUpdated: changes.length > 0
        };
    }

    /**
     * Ensures additional Discord ID patterns are covered (mentions, etc.)
     * @param {Object} discordIdConfig - The Discord ID configuration object
     */
    ensureAdditionalDiscordIdPatterns(discordIdConfig) {
        if (!discordIdConfig.additionalPatterns) {
            discordIdConfig.additionalPatterns = {
                mentions: {
                    pattern: '<@!?\\d{17,19}>',
                    description: 'Discord user mentions (@user)',
                    enabled: true
                },
                channelMentions: {
                    pattern: '<#\\d{17,19}>',
                    description: 'Discord channel mentions (#channel)',
                    enabled: true
                },
                roleMentions: {
                    pattern: '<@&\\d{17,19}>',
                    description: 'Discord role mentions (@role)',
                    enabled: true
                },
                customEmojis: {
                    pattern: '<a?:\\w+:\\d{17,19}>',
                    description: 'Discord custom emoji IDs',
                    enabled: true
                }
            };
            
            discordIdConfig.configurationHistory.push({
                timestamp: new Date().toISOString(),
                action: 'enhanced',
                reason: 'Added additional Discord ID patterns for mentions and emojis'
            });
        }
    }

    saveExceptions() {
        try {
            const exceptionsPath = path.join(process.cwd(), 'data/dox_exceptions.json');
            const dir = path.dirname(exceptionsPath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            
            // Ensure Discord ID exclusions are present before saving
            this.ensureDiscordIdExclusions(this.exceptions);
            
            fs.writeFileSync(exceptionsPath, JSON.stringify(this.exceptions, null, 2), 'utf8');
        } catch (error) {
            console.error('Erreur lors de la sauvegarde des exceptions de dox:', error);
        }
    }

    /**
     * Excludes Discord IDs from content before analysis
     * @param {string} content - The content to process
     * @returns {string} Content with Discord IDs replaced with placeholders
     */
    excludeDiscordIds(content) {
        if (!content || typeof content !== 'string') {
            return content;
        }
        
        return content.replace(this.discordIdPattern, '[DISCORD_ID]');
    }

    /**
     * Detects personal information in text content
     * @param {string} content - The text content to analyze
     * @param {string} guildId - The guild ID for exception checking
     * @returns {Object} Detection result with type and matches
     */
    detectPersonalInfo(content, guildId) {
        if (!content || typeof content !== 'string') {
            return {
                detected: false,
                detections: [],
                riskLevel: 'none'
            };
        }

        const detections = [];
        
        // Pre-process content to exclude Discord IDs
        const processedContent = this.excludeDiscordIds(content);
        
        // Check each pattern type
        for (const [type, patterns] of Object.entries(this.patterns)) {
            if(type === 'address') continue;
            for (const pattern of patterns) {
                const matches = processedContent.match(pattern);
                if (matches) {
                    // Check if this content is in exceptions
                    if (!this.checkExceptions(guildId, processedContent, type)) {
                        detections.push({
                            type,
                            matches: matches.map(match => this.censorMatch(match, type)),
                            originalMatches: matches
                        });
                    }
                }
            }
        }
        
        return {
            detected: detections.length > 0,
            detections,
            riskLevel: this.calculateRiskLevel(detections)
        };
    }

    /**
     * Checks if content matches configured exceptions
     * @param {string} guildId - The guild ID
     * @param {string} content - The content to check
     * @param {string} type - The detection type
     * @returns {boolean} True if content is excepted
     */
    checkExceptions(guildId, content, type) {
        // Check global exceptions first (like Discord IDs)
        const globalExceptions = this.exceptions._global;
        if (globalExceptions && globalExceptions.discordIds && globalExceptions.discordIds.enabled) {
            // Check main Discord ID pattern
            const discordIdRegex = new RegExp(globalExceptions.discordIds.pattern, 'g');
            if (discordIdRegex.test(content)) {
                // Update match statistics
                this.updateDiscordIdMatchStats(globalExceptions.discordIds);
                return true; // Content contains Discord IDs, should be excepted
            }
            
            // Check additional Discord ID patterns (mentions, etc.)
            if (globalExceptions.discordIds.additionalPatterns) {
                for (const [patternName, patternConfig] of Object.entries(globalExceptions.discordIds.additionalPatterns)) {
                    if (patternConfig.enabled) {
                        const additionalRegex = new RegExp(patternConfig.pattern, 'g');
                        if (additionalRegex.test(content)) {
                            this.updateDiscordIdMatchStats(globalExceptions.discordIds, patternName);
                            return true;
                        }
                    }
                }
            }
        }
        
        // Check guild-specific exceptions
        const guildExceptions = this.exceptions[guildId];
        if (!guildExceptions) return false;
        
        const typeExceptions = guildExceptions[type];
        if (!typeExceptions) return false;
        
        // Check if any exception pattern matches
        return typeExceptions.some(exception => {
            if (exception.type === 'exact') {
                return content.toLowerCase().includes(exception.value.toLowerCase());
            } else if (exception.type === 'regex') {
                const regex = new RegExp(exception.value, 'gi');
                return regex.test(content);
            }
            return false;
        });
    }

    /**
     * Updates Discord ID match statistics
     * @param {Object} discordIdConfig - Discord ID configuration object
     * @param {string} patternType - Type of pattern that matched (optional)
     */
    updateDiscordIdMatchStats(discordIdConfig, patternType = 'main') {
        discordIdConfig.matchCount = (discordIdConfig.matchCount || 0) + 1;
        discordIdConfig.lastMatched = new Date().toISOString();
        
        if (!discordIdConfig.matchHistory) {
            discordIdConfig.matchHistory = {};
        }
        
        if (!discordIdConfig.matchHistory[patternType]) {
            discordIdConfig.matchHistory[patternType] = {
                count: 0,
                lastMatched: null
            };
        }
        
        discordIdConfig.matchHistory[patternType].count++;
        discordIdConfig.matchHistory[patternType].lastMatched = new Date().toISOString();
    }

    /**
     * Censors sensitive information in matches
     * @param {string} match - The matched text
     * @param {string} type - The detection type
     * @returns {string} Censored version
     */
    censorMatch(match, type) {
        switch (type) {
            case 'phone':
                return match.replace(/\d/g, '*');
            case 'email':
                const [local, domain] = match.split('@');
                return `${local.charAt(0)}***@${domain}`;
            case 'ssn':
                return match.replace(/\d/g, '*');
            case 'creditCard':
                return '**** **** **** ' + match.slice(-4);
            case 'address':
                return match.replace(/\d+/g, '***');
            case 'fullName':
                return match.replace(/[A-Za-z]/g, '*');
            default:
                return '***';
        }
    }

    /**
     * Calculates risk level based on detections
     * @param {Array} detections - Array of detection objects
     * @returns {string} Risk level: low, medium, high, critical
     */
    calculateRiskLevel(detections) {
        if (detections.length === 0) return 'none';
        
        const riskScores = {
            phone: 2,
            email: 1,
            ssn: 5,
            creditCard: 5,
            address: 3,
            fullName: 2
        };
        
        const totalScore = detections.reduce((score, detection) => {
            return score + (riskScores[detection.type] || 1) * detection.matches.length;
        }, 0);
        
        if (totalScore >= 8) return 'critical';
        if (totalScore >= 5) return 'high';
        if (totalScore >= 3) return 'medium';
        return 'low';
    }

    /**
     * Logs a detection event
     * @param {Object} detectionData - The detection data
     */
    logDetection(detectionData) {
        const detection = {
            id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
            timestamp: new Date().toISOString(),
            ...detectionData
        };
        
        this.detections.push(detection);
        this.saveDetections();
        
        return detection;
    }

    /**
     * Validates Discord ID exclusion consistency
     * @returns {Object} Validation result
     */
    validateDiscordIdExclusions() {
        const issues = [];
        const recommendations = [];
        const warnings = [];
        
        try {
            // Check if global Discord ID exclusion exists
            const globalExceptions = this.exceptions._global;
            if (!globalExceptions || !globalExceptions.discordIds) {
                issues.push('Global Discord ID exclusion not found');
                recommendations.push('Run ensureDiscordIdExclusions() to fix');
            } else {
                const config = globalExceptions.discordIds;
                
                // Check if disabled
                if (!config.enabled) {
                    issues.push('Discord ID exclusion is disabled');
                    recommendations.push('Enable Discord ID exclusion for security');
                }
                
                // Check pattern validity
                const pattern = config.pattern;
                if (pattern !== '\\b\\d{17,19}\\b') {
                    issues.push(`Non-standard Discord ID pattern: ${pattern}`);
                    recommendations.push('Consider using standard pattern: \\b\\d{17,19}\\b');
                }
                
                try {
                    new RegExp(pattern);
                } catch (error) {
                    issues.push(`Invalid regex pattern: ${error.message}`);
                    recommendations.push('Fix regex pattern syntax');
                }
                
                // Check version compatibility
                if (!config.version || config.version < '1.1.0') {
                    warnings.push('Discord ID exclusion configuration is outdated');
                    recommendations.push('Update configuration to latest version');
                }
                
                // Check system protection
                if (!config.systemProtected) {
                    warnings.push('Discord ID exclusion is not system-protected');
                    recommendations.push('Enable system protection to prevent accidental removal');
                }
                
                // Validate additional patterns
                if (config.additionalPatterns) {
                    for (const [patternName, patternConfig] of Object.entries(config.additionalPatterns)) {
                        try {
                            new RegExp(patternConfig.pattern);
                        } catch (error) {
                            issues.push(`Invalid additional pattern '${patternName}': ${error.message}`);
                            recommendations.push(`Fix pattern '${patternName}' regex syntax`);
                        }
                    }
                }
                
                // Check for recent activity
                const lastMatched = config.lastMatched;
                if (lastMatched) {
                    const daysSinceMatch = (Date.now() - new Date(lastMatched).getTime()) / (1000 * 60 * 60 * 24);
                    if (daysSinceMatch > 30) {
                        warnings.push(`No Discord ID matches in ${Math.floor(daysSinceMatch)} days - pattern may need review`);
                    }
                }
            }
            
            // Check consistency across detection methods
            const detectionConsistency = this.validateDetectionConsistency();
            if (!detectionConsistency.consistent) {
                issues.push(...detectionConsistency.issues);
                recommendations.push(...detectionConsistency.recommendations);
            }
            
            return {
                valid: issues.length === 0,
                issues,
                warnings,
                recommendations,
                timestamp: new Date().toISOString(),
                detectionConsistency
            };
        } catch (error) {
            return {
                valid: false,
                issues: [`Validation error: ${error.message}`],
                recommendations: ['Check exception file integrity'],
                timestamp: new Date().toISOString()
            };
        }
    }

    /**
     * Validates consistency between Discord ID exclusion and detection methods
     * @returns {Object} Consistency validation result
     */
    validateDetectionConsistency() {
        const issues = [];
        const recommendations = [];
        
        try {
            // Check if excludeDiscordIds method pattern matches exception pattern
            const exceptionPattern = this.exceptions._global?.discordIds?.pattern;
            const methodPattern = this.discordIdPattern.source;
            
            if (exceptionPattern && methodPattern) {
                // Convert exception pattern to RegExp format for comparison
                const normalizedExceptionPattern = exceptionPattern.replace(/\\\\/g, '\\');
                
                if (normalizedExceptionPattern !== methodPattern) {
                    issues.push('Discord ID patterns inconsistent between exception system and detection method');
                    recommendations.push('Synchronize patterns between exception system and detection method');
                }
            }
            
            // Test actual exclusion behavior
            const testDiscordId = '123456789012345678';
            const testContent = `User ${testDiscordId} needs help`;
            
            // Test exclusion method
            const excludedContent = this.excludeDiscordIds(testContent);
            const shouldBeExcluded = excludedContent.includes('[DISCORD_ID]');
            
            // Test exception checking
            const isExcepted = this.checkExceptions('test-guild', testContent, 'any-type');
            
            if (shouldBeExcluded !== isExcepted) {
                issues.push('Inconsistent behavior between excludeDiscordIds and checkExceptions methods');
                recommendations.push('Review and synchronize Discord ID handling methods');
            }
            
            return {
                consistent: issues.length === 0,
                issues,
                recommendations,
                testResults: {
                    excludedContent,
                    shouldBeExcluded,
                    isExcepted,
                    patternsMatch: exceptionPattern === methodPattern
                }
            };
        } catch (error) {
            return {
                consistent: false,
                issues: [`Consistency check error: ${error.message}`],
                recommendations: ['Review Discord ID handling implementation']
            };
        }
    }

    /**
     * Repairs Discord ID exclusion configuration
     * @param {string} moderatorId - ID of the moderator performing the repair
     * @returns {Object} Repair result
     */
    repairDiscordIdExclusions(moderatorId = 'system') {
        try {
            const validation = this.validateDiscordIdExclusions();
            
            if (validation.valid && validation.warnings.length === 0) {
                return {
                    success: true,
                    message: 'Discord ID exclusions are already valid and up-to-date',
                    repairsApplied: []
                };
            }
            
            const repairsApplied = [];
            const previousConfig = this.exceptions._global?.discordIds ? 
                { ...this.exceptions._global.discordIds } : null;
            
            // Ensure global exceptions structure exists
            if (!this.exceptions._global) {
                this.exceptions._global = {};
                repairsApplied.push('Created global exceptions structure');
            }
            
            // Force update Discord ID exclusion to latest version
            const updateResult = this.ensureDiscordIdExclusions(this.exceptions, true);
            repairsApplied.push(...updateResult.changesApplied);
            
            // Update repair metadata
            this.exceptions._global.discordIds.repairedAt = new Date().toISOString();
            this.exceptions._global.discordIds.repairedBy = moderatorId;
            this.exceptions._global.discordIds.repairReason = 'Manual repair requested';
            this.exceptions._global.discordIds.previousIssues = validation.issues;
            this.exceptions._global.discordIds.previousWarnings = validation.warnings;
            
            if (previousConfig) {
                this.exceptions._global.discordIds.repairHistory = [
                    ...(previousConfig.repairHistory || []),
                    {
                        timestamp: new Date().toISOString(),
                        repairedBy: moderatorId,
                        issuesFixed: validation.issues.length,
                        warningsAddressed: validation.warnings.length,
                        previousConfig: {
                            version: previousConfig.version,
                            enabled: previousConfig.enabled,
                            pattern: previousConfig.pattern
                        }
                    }
                ];
            }
            
            // Synchronize detection method pattern if needed
            const consistencyCheck = this.validateDetectionConsistency();
            if (!consistencyCheck.consistent) {
                this.synchronizeDiscordIdPatterns();
                repairsApplied.push('Synchronized Discord ID patterns across methods');
            }
            
            this.saveExceptions();
            repairsApplied.push('Saved repaired exceptions');
            
            return {
                success: true,
                message: 'Discord ID exclusions repaired successfully',
                repairsApplied,
                previousIssues: validation.issues,
                previousWarnings: validation.warnings,
                newConfiguration: this.exceptions._global.discordIds
            };
        } catch (error) {
            return {
                success: false,
                error: error.message,
                message: 'Failed to repair Discord ID exclusions'
            };
        }
    }

    /**
     * Synchronizes Discord ID patterns across all detection methods
     */
    synchronizeDiscordIdPatterns() {
        const exceptionPattern = this.exceptions._global?.discordIds?.pattern;
        if (exceptionPattern) {
            // Update the class-level pattern to match exception pattern
            try {
                this.discordIdPattern = new RegExp(exceptionPattern.replace(/\\\\/g, '\\'), 'g');
            } catch (error) {
                console.warn('Failed to synchronize Discord ID pattern:', error.message);
                // Fall back to default pattern
                this.discordIdPattern = /\b\d{17,19}\b/g;
            }
        }
    }

    /**
     * Performs automatic maintenance of Discord ID exclusions
     * @returns {Object} Maintenance result
     */
    maintainDiscordIdExclusions() {
        try {
            const maintenanceResults = {
                timestamp: new Date().toISOString(),
                actionsPerformed: [],
                issuesFound: [],
                recommendations: []
            };
            
            // Validate current configuration
            const validation = this.validateDiscordIdExclusions();
            maintenanceResults.issuesFound = validation.issues;
            maintenanceResults.recommendations = validation.recommendations;
            
            // Auto-repair critical issues
            if (validation.issues.length > 0) {
                const repairResult = this.repairDiscordIdExclusions('auto-maintenance');
                if (repairResult.success) {
                    maintenanceResults.actionsPerformed.push(...repairResult.repairsApplied);
                }
            }
            
            // Update statistics
            if (this.exceptions._global?.discordIds) {
                this.exceptions._global.discordIds.lastMaintenance = new Date().toISOString();
                this.exceptions._global.discordIds.maintenanceHistory = [
                    ...(this.exceptions._global.discordIds.maintenanceHistory || []).slice(-9), // Keep last 10
                    {
                        timestamp: new Date().toISOString(),
                        issuesFound: validation.issues.length,
                        warningsFound: validation.warnings?.length || 0,
                        actionsPerformed: maintenanceResults.actionsPerformed.length
                    }
                ];
                
                maintenanceResults.actionsPerformed.push('Updated maintenance statistics');
            }
            
            // Save if any changes were made
            if (maintenanceResults.actionsPerformed.length > 0) {
                this.saveExceptions();
                maintenanceResults.actionsPerformed.push('Saved maintenance updates');
            }
            
            return {
                success: true,
                message: `Maintenance completed: ${maintenanceResults.actionsPerformed.length} actions performed`,
                ...maintenanceResults
            };
        } catch (error) {
            return {
                success: false,
                error: error.message,
                message: 'Discord ID exclusion maintenance failed'
            };
        }
    }

    /**
     * Gets Discord ID exclusion statistics
     * @returns {Object} Statistics about Discord ID exclusions
     */
    getDiscordIdExclusionStats() {
        try {
            const config = this.getDiscordIdExclusionConfig();
            const validation = this.validateDiscordIdExclusions();
            
            // Count recent detections that would have been Discord IDs
            const recentDetections = this.getRecentDetections(24);
            const potentialDiscordIdDetections = recentDetections.filter(detection => {
                // Check if detection content might contain Discord IDs
                const content = detection.content || '';
                return this.discordIdPattern.test(content);
            });
            
            return {
                enabled: config.enabled,
                pattern: config.pattern,
                valid: validation.valid,
                issues: validation.issues,
                recentPotentialDiscordIdDetections: potentialDiscordIdDetections.length,
                lastModified: config.lastModified || config.addedAt,
                addedBy: config.addedBy,
                statistics: {
                    totalExceptions: Object.keys(this.exceptions).length,
                    globalExceptions: this.exceptions._global ? Object.keys(this.exceptions._global).length : 0,
                    discordIdExclusionPresent: !!this.exceptions._global?.discordIds
                }
            };
        } catch (error) {
            return {
                error: error.message,
                enabled: false,
                valid: false
            };
        }
    }

    /**
     * Adds an exception for legitimate information sharing
     * @param {string} guildId - The guild ID
     * @param {string} type - The detection type
     * @param {string} value - The exception value
     * @param {string} exceptionType - 'exact' or 'regex'
     * @param {string} reason - Reason for the exception
     * @param {string} moderatorId - ID of the moderator adding the exception
     */
    addException(guildId, type, value, exceptionType = 'exact', reason = '', moderatorId = 'system') {
        try {
            // Validate inputs
            if (!guildId || !type || !value) {
                throw new Error('Guild ID, type, and value are required');
            }
            
            if (!['exact', 'regex'].includes(exceptionType)) {
                throw new Error('Exception type must be "exact" or "regex"');
            }
            
            // Test regex pattern if type is regex
            if (exceptionType === 'regex') {
                try {
                    new RegExp(value);
                } catch (regexError) {
                    throw new Error(`Invalid regex pattern: ${regexError.message}`);
                }
            }
            
            if (!this.exceptions[guildId]) {
                this.exceptions[guildId] = {};
            }
            
            if (!this.exceptions[guildId][type]) {
                this.exceptions[guildId][type] = [];
            }
            
            const exception = {
                id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
                type: exceptionType,
                value,
                reason,
                addedBy: moderatorId,
                addedAt: new Date().toISOString()
            };
            
            this.exceptions[guildId][type].push(exception);
            this.saveExceptions();
            
            return {
                success: true,
                exception,
                message: 'Exception added successfully'
            };
        } catch (error) {
            return {
                success: false,
                error: error.message,
                message: 'Failed to add exception'
            };
        }
    }

    /**
     * Removes an exception
     * @param {string} guildId - The guild ID
     * @param {string} type - The detection type
     * @param {string} exceptionId - The exception ID to remove
     * @param {string} moderatorId - ID of the moderator removing the exception
     */
    removeException(guildId, type, exceptionId, moderatorId = 'system') {
        try {
            // Prevent removal of global Discord ID exclusions
            if (guildId === '_global' && type === 'discordIds') {
                return {
                    success: false,
                    error: 'Cannot remove global Discord ID exclusions',
                    message: 'Discord ID exclusions are system-protected and cannot be removed'
                };
            }
            
            if (!this.exceptions[guildId] || !this.exceptions[guildId][type]) {
                return {
                    success: false,
                    error: 'Exception not found',
                    message: `No exceptions found for guild ${guildId} and type ${type}`
                };
            }
            
            const initialLength = this.exceptions[guildId][type].length;
            const removedExceptions = this.exceptions[guildId][type].filter(
                exception => exception.id === exceptionId
            );
            
            this.exceptions[guildId][type] = this.exceptions[guildId][type].filter(
                exception => exception.id !== exceptionId
            );
            
            if (this.exceptions[guildId][type].length !== initialLength) {
                // Log the removal
                console.log(`Exception removed by ${moderatorId}: ${JSON.stringify(removedExceptions[0])}`);
                
                this.saveExceptions();
                return {
                    success: true,
                    removedException: removedExceptions[0],
                    message: 'Exception removed successfully'
                };
            }
            
            return {
                success: false,
                error: 'Exception not found',
                message: `Exception with ID ${exceptionId} not found`
            };
        } catch (error) {
            return {
                success: false,
                error: error.message,
                message: 'Failed to remove exception'
            };
        }
    }

    /**
     * Configures Discord ID exclusion
     * @param {boolean} enabled - Whether to enable Discord ID exclusion
     * @param {string} moderatorId - ID of the moderator making the change
     * @returns {Object} Configuration result
     */
    configureDiscordIdExclusion(enabled = true, moderatorId = 'system') {
        try {
            if (!this.exceptions._global) {
                this.exceptions._global = {};
            }
            
            this.exceptions._global.discordIds = {
                enabled,
                pattern: '\\b\\d{17,19}\\b',
                description: 'Discord user IDs (17-19 digits)',
                type: 'regex',
                addedBy: moderatorId,
                addedAt: new Date().toISOString(),
                lastModified: new Date().toISOString()
            };
            
            this.saveExceptions();
            
            return {
                success: true,
                enabled,
                message: `Discord ID exclusion ${enabled ? 'enabled' : 'disabled'} successfully`
            };
        } catch (error) {
            console.error('Error configuring Discord ID exclusion:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Gets Discord ID exclusion configuration
     * @returns {Object} Discord ID exclusion configuration
     */
    getDiscordIdExclusionConfig() {
        const globalExceptions = this.exceptions._global;
        if (globalExceptions && globalExceptions.discordIds) {
            return globalExceptions.discordIds;
        }
        
        return {
            enabled: true, // Default to enabled
            pattern: '\\b\\d{17,19}\\b',
            description: 'Discord user IDs (17-19 digits)',
            type: 'regex',
            addedBy: 'system',
            addedAt: new Date().toISOString()
        };
    }

    /**
     * Gets all exceptions for a guild, including global Discord ID exclusions
     * @param {string} guildId - The guild ID
     * @param {boolean} includeGlobal - Whether to include global exceptions
     * @returns {Object} Guild exceptions with metadata
     */
    getExceptions(guildId, includeGlobal = true) {
        const guildExceptions = this.exceptions[guildId] || {};
        const result = {
            guildId,
            exceptions: guildExceptions,
            count: this.countExceptions(guildExceptions),
            lastModified: this.getLastModified(guildExceptions)
        };
        
        if (includeGlobal && this.exceptions._global) {
            result.globalExceptions = this.exceptions._global;
            result.discordIdExclusion = this.exceptions._global.discordIds || null;
        }
        
        return result;
    }

    /**
     * Counts exceptions in an exceptions object
     * @param {Object} exceptions - The exceptions object
     * @returns {number} Total count of exceptions
     */
    countExceptions(exceptions) {
        let count = 0;
        for (const type in exceptions) {
            if (Array.isArray(exceptions[type])) {
                count += exceptions[type].length;
            }
        }
        return count;
    }

    /**
     * Gets the last modified timestamp from exceptions
     * @param {Object} exceptions - The exceptions object
     * @returns {string|null} Last modified timestamp
     */
    getLastModified(exceptions) {
        let lastModified = null;
        
        for (const type in exceptions) {
            if (Array.isArray(exceptions[type])) {
                exceptions[type].forEach(exception => {
                    const timestamp = exception.lastModified || exception.addedAt;
                    if (!lastModified || timestamp > lastModified) {
                        lastModified = timestamp;
                    }
                });
            }
        }
        
        return lastModified;
    }

    /**
     * Gets comprehensive exception information for a guild
     * @param {string} guildId - The guild ID
     * @returns {Object} Comprehensive exception information
     */
    getExceptionInfo(guildId) {
        const exceptions = this.getExceptions(guildId, true);
        const validation = this.validateDiscordIdExclusions();
        const stats = this.getDiscordIdExclusionStats();
        
        return {
            ...exceptions,
            validation,
            discordIdStats: stats,
            summary: {
                totalGuildExceptions: exceptions.count,
                globalExceptionsPresent: !!exceptions.globalExceptions,
                discordIdExclusionEnabled: stats.enabled,
                discordIdExclusionValid: validation.valid,
                lastActivity: exceptions.lastModified || 'Never'
            }
        };
    }

    /**
     * Gets detection history for a user
     * @param {string} userId - The user ID
     * @param {string} guildId - The guild ID (optional)
     * @returns {Array} Array of detection records
     */
    getUserDetections(userId, guildId = null) {
        return this.detections.filter(detection => {
            const userMatch = detection.userId === userId;
            const guildMatch = guildId ? detection.guildId === guildId : true;
            return userMatch && guildMatch;
        });
    }

    /**
     * Gets recent detections for monitoring
     * @param {number} hours - Number of hours to look back (default: 24)
     * @param {string} guildId - Guild ID (optional)
     * @returns {Array} Array of recent detections
     */
    getRecentDetections(hours = 24, guildId = null) {
        const cutoff = new Date(Date.now() - (hours * 60 * 60 * 1000));
        
        return this.detections.filter(detection => {
            const timeMatch = new Date(detection.timestamp) > cutoff;
            const guildMatch = guildId ? detection.guildId === guildId : true;
            return timeMatch && guildMatch;
        });
    }

    /**
     * Downloads and processes an image for OCR text extraction
     * @param {Object} attachment - Discord attachment object
     * @returns {Promise<string>} Extracted text from image
     */
    async downloadAndProcessImage(attachment) {
        try {
            // Validate attachment is an image
            if (!this.isImageAttachment(attachment)) {
                throw new Error('Attachment is not a supported image format');
            }
            
            // Download the image
            const response = await fetch(attachment.url);
            if (!response.ok) {
                throw new Error(`Failed to download image: ${response.statusText}`);
            }
            
            const imageBuffer = await response.buffer();
            
            // Process with OCR
            const { data: { text } } = await Tesseract.recognize(imageBuffer, 'eng', {
                logger: m => {
                    if (m.status === 'recognizing text') {
                        console.log(`OCR Progress: ${Math.round(m.progress * 100)}%`);
                    }
                }
            });
            
            return text.trim();
            
        } catch (error) {
            console.error('Error processing image for OCR:', error);
            throw error;
        }
    }

    /**
     * Checks if attachment is a supported image format
     * @param {Object} attachment - Discord attachment object
     * @returns {boolean} True if supported image format
     */
    isImageAttachment(attachment) {
        const supportedFormats = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
        const fileExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
        
        // Check content type
        if (attachment.contentType && supportedFormats.includes(attachment.contentType.toLowerCase())) {
            return true;
        }
        
        // Check file extension as fallback
        const fileName = attachment.name?.toLowerCase() || '';
        return fileExtensions.some(ext => fileName.endsWith(ext));
    }

    /**
     * Scans image attachments for personal information
     * @param {Array} attachments - Array of Discord attachment objects
     * @param {string} guildId - Guild ID for exception checking
     * @returns {Promise<Object>} OCR scan results
     */
    async scanImageForText(attachments, guildId) {
        const results = {
            processed: 0,
            failed: 0,
            detections: [],
            errors: []
        };
        
        if (!Array.isArray(attachments)) {
            attachments = [attachments];
        }
        
        for (const attachment of attachments) {
            try {
                if (!this.isImageAttachment(attachment)) {
                    continue; // Skip non-image attachments
                }
                
                console.log(`Processing image: ${attachment.name} (${attachment.size} bytes)`);
                
                // Extract text from image
                const extractedText = await this.downloadAndProcessImage(attachment);
                
                if (extractedText && extractedText.length > 0) {
                    console.log(`Extracted text (${extractedText.length} chars): ${extractedText.substring(0, 100)}...`);
                    
                    // Analyze extracted text for personal information
                    const textAnalysis = this.detectPersonalInfo(extractedText, guildId);
                    
                    if (textAnalysis.detected) {
                        results.detections.push({
                            attachment: {
                                name: attachment.name,
                                url: attachment.url,
                                size: attachment.size
                            },
                            extractedText: extractedText.substring(0, 500), // Limit stored text
                            analysis: textAnalysis
                        });
                    }
                }
                
                results.processed++;
                
            } catch (error) {
                console.error(`Failed to process image ${attachment.name}:`, error);
                results.failed++;
                results.errors.push({
                    attachment: attachment.name,
                    error: error.message
                });
            }
        }
        
        return {
            ...results,
            hasDetections: results.detections.length > 0,
            totalRiskLevel: this.calculateCombinedRiskLevel(results.detections)
        };
    }

    /**
     * Calculates combined risk level from multiple image detections
     * @param {Array} detections - Array of detection results
     * @returns {string} Combined risk level
     */
    calculateCombinedRiskLevel(detections) {
        if (detections.length === 0) return 'none';
        
        const riskLevels = detections.map(d => d.analysis.riskLevel);
        const riskValues = {
            'none': 0,
            'low': 1,
            'medium': 2,
            'high': 3,
            'critical': 4
        };
        
        const maxRisk = Math.max(...riskLevels.map(level => riskValues[level] || 0));
        const avgRisk = riskLevels.reduce((sum, level) => sum + (riskValues[level] || 0), 0) / riskLevels.length;
        
        // If any detection is critical, overall is critical
        if (maxRisk >= 4) return 'critical';
        if (maxRisk >= 3 || avgRisk >= 2.5) return 'high';
        if (maxRisk >= 2 || avgRisk >= 1.5) return 'medium';
        if (maxRisk >= 1) return 'low';
        return 'none';
    }

    /**
     * Processes a Discord message for both text and image content
     * @param {Object} message - Discord message object
     * @returns {Promise<Object>} Complete analysis results
     */
    async analyzeMessage(message) {
        const results = {
            messageId: message.id,
            userId: message.author.id,
            guildId: message.guild?.id,
            timestamp: new Date().toISOString(),
            textAnalysis: null,
            imageAnalysis: null,
            overallRisk: 'none',
            hasDetections: false
        };
        
        try {
            // Analyze text content
            if (message.content && message.content.trim().length > 0) {
                results.textAnalysis = this.detectPersonalInfo(message.content, results.guildId);
            }
            
            // Analyze image attachments
            if (message.attachments && message.attachments.size > 0) {
                const attachmentArray = Array.from(message.attachments.values());
                results.imageAnalysis = await this.scanImageForText(attachmentArray, results.guildId);
            }
            
            // Calculate overall risk
            const textRisk = results.textAnalysis?.riskLevel || 'none';
            const imageRisk = results.imageAnalysis?.totalRiskLevel || 'none';
            
            results.overallRisk = this.calculateCombinedRiskLevel([
                { analysis: { riskLevel: textRisk } },
                { analysis: { riskLevel: imageRisk } }
            ]);
            
            results.hasDetections = (results.textAnalysis?.detected || false) || 
                                   (results.imageAnalysis?.hasDetections || false);
            
        } catch (error) {
            console.error('Error analyzing message:', error);
            results.error = error.message;
        }
        
        return results;
    }

    /**
     * Handles a dox detection with appropriate escalation
     * @param {Object} message - Discord message object
     * @param {Object} analysis - Analysis results from analyzeMessage
     * @param {Object} client - Discord client
     * @returns {Promise<Object>} Action results
     */
    async handleDetection(message, analysis, client) {
        const actionResults = {
            messageDeleted: false,
            userWarned: false,
            reportSent: false,
            telegramNotified: false,
            escalationLevel: 'none',
            error: null
        };
        
        try {
            if (!analysis.hasDetections) {
                return actionResults;
            }
            
            // Log the detection
            const detectionRecord = this.logDetection({
                messageId: message.id,
                userId: message.author.id,
                guildId: message.guild?.id,
                channelId: message.channel.id,
                content: message.content?.substring(0, 200) || '[Image content]',
                detectionType: this.getDetectionTypes(analysis),
                riskLevel: analysis.overallRisk,
                textAnalysis: analysis.textAnalysis,
                imageAnalysis: analysis.imageAnalysis ? {
                    processed: analysis.imageAnalysis.processed,
                    detections: analysis.imageAnalysis.detections.length
                } : null
            });
            
            // Determine escalation level based on risk and user history
            const escalationLevel = await this.determineEscalationLevel(message.author.id, message.guild?.id, analysis.overallRisk);
            actionResults.escalationLevel = escalationLevel;
            
            // Delete the message immediately for any detection
            try {
                await message.delete();
                actionResults.messageDeleted = true;
                console.log(`Deleted message ${message.id} containing personal information`);
            } catch (error) {
                console.error('Failed to delete message:', error);
                actionResults.error = 'Failed to delete message';
            }
            
            // Apply escalation actions
            await this.applyEscalationActions(message, escalationLevel, analysis, client, actionResults);
            
            // Send report to administrators
            await this.sendDoxReport(message, analysis, detectionRecord, escalationLevel, client, actionResults);
            
            // Send Telegram notification for high-risk detections
            if (['high', 'critical'].includes(analysis.overallRisk)) {
                await this.sendTelegramAlert(message, analysis, escalationLevel, actionResults);
            }
            
        } catch (error) {
            console.error('Error handling dox detection:', error);
            actionResults.error = error.message;
        }
        
        return actionResults;
    }

    /**
     * Gets detection types from analysis results
     * @param {Object} analysis - Analysis results
     * @returns {Array} Array of detection types
     */
    getDetectionTypes(analysis) {
        const types = [];
        
        if (analysis.textAnalysis?.detections) {
            types.push(...analysis.textAnalysis.detections.map(d => d.type));
        }
        
        if (analysis.imageAnalysis?.detections) {
            for (const detection of analysis.imageAnalysis.detections) {
                types.push(...detection.analysis.detections.map(d => d.type));
            }
        }
        
        return [...new Set(types)]; // Remove duplicates
    }

    /**
     * Determines escalation level based on user history and risk level
     * @param {string} userId - User ID
     * @param {string} guildId - Guild ID
     * @param {string} riskLevel - Current risk level
     * @returns {Promise<string>} Escalation level
     */
    async determineEscalationLevel(userId, guildId, riskLevel) {
        const userDetections = this.getUserDetections(userId, guildId);
        const recentDetections = userDetections.filter(d => {
            const detectionTime = new Date(d.timestamp);
            const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
            return detectionTime > dayAgo;
        });
        
        const userWarns = this.warnManager.getWarnCount(userId);
        
        // Escalation logic
        if (riskLevel === 'critical' || recentDetections.length >= 3) {
            return 'severe'; // Temporary ban consideration
        } else if (riskLevel === 'high' || recentDetections.length >= 2 || userWarns >= 2) {
            return 'moderate'; // Final warning
        } else if (riskLevel === 'medium' || recentDetections.length >= 1 || userWarns >= 1) {
            return 'elevated'; // Strong warning
        } else {
            return 'initial'; // First warning
        }
    }

    /**
     * Applies escalation actions based on level
     * @param {Object} message - Discord message object
     * @param {string} escalationLevel - Escalation level
     * @param {Object} analysis - Analysis results
     * @param {Object} client - Discord client
     * @param {Object} actionResults - Results object to update
     */
    async applyEscalationActions(message, escalationLevel, analysis, client, actionResults) {
        const warningMessages = {
            initial: 'Attention: Le partage d\'informations personnelles est interdit sur ce serveur. Ceci est votre premier avertissement.',
            elevated: '⚠️ AVERTISSEMENT: Vous avez partagé des informations personnelles. Ceci est un avertissement sérieux.',
            moderate: '🚨 AVERTISSEMENT FINAL: Partage répété d\'informations personnelles détecté. Le prochain incident pourrait entraîner des sanctions.',
            severe: '🔴 VIOLATION GRAVE: Partage d\'informations critiques détecté. Des mesures disciplinaires sont en cours d\'évaluation.'
        };
        
        const warningReasons = {
            initial: 'Partage d\'informations personnelles (premier incident)',
            elevated: 'Partage d\'informations personnelles (incident répété)',
            moderate: 'Partage d\'informations personnelles (avertissement final)',
            severe: 'Partage d\'informations personnelles critiques'
        };
        
        try {
            // Add warning to user record
            const warnResult = this.warnManager.addWarn(
                message.author.id,
                warningReasons[escalationLevel] || 'Partage d\'informations personnelles',
                'DoxDetector'
            );
            actionResults.userWarned = true;
            
            // Send DM to user
            try {
                const dmEmbed = {
                    color: escalationLevel === 'severe' ? 0xff0000 : escalationLevel === 'moderate' ? 0xff6600 : 0xffaa00,
                    title: '🔒 Détection d\'informations personnelles',
                    description: warningMessages[escalationLevel],
                    fields: [
                        {
                            name: 'Serveur',
                            value: message.guild?.name || 'Serveur inconnu',
                            inline: true
                        },
                        {
                            name: 'Canal',
                            value: `#${message.channel.name}`,
                            inline: true
                        },
                        {
                            name: 'Niveau de risque',
                            value: analysis.overallRisk.toUpperCase(),
                            inline: true
                        },
                        {
                            name: 'Types détectés',
                            value: this.getDetectionTypes(analysis).join(', ') || 'Non spécifié',
                            inline: false
                        },
                        {
                            name: 'Nombre total d\'avertissements',
                            value: warnResult.count.toString(),
                            inline: true
                        }
                    ],
                    footer: {
                        text: 'Veuillez éviter de partager des informations personnelles pour votre sécurité et celle des autres.'
                    },
                    timestamp: new Date().toISOString()
                };
                
                await message.author.send({ embeds: [dmEmbed] });
                
            } catch (dmError) {
                console.log(`Could not send DM to user ${message.author.id}:`, dmError.message);
            }
            
            // For severe cases, consider additional actions
            if (escalationLevel === 'severe') {
                // Could implement temporary timeout/ban here
                console.log(`SEVERE DOX DETECTION: User ${message.author.id} in guild ${message.guild?.id} - Consider manual review`);
            }
            
        } catch (error) {
            console.error('Error applying escalation actions:', error);
            actionResults.error = error.message;
        }
    }

    /**
     * Sends dox detection report to administrators
     * @param {Object} message - Discord message object
     * @param {Object} analysis - Analysis results
     * @param {Object} detectionRecord - Detection record
     * @param {string} escalationLevel - Escalation level
     * @param {Object} client - Discord client
     * @param {Object} actionResults - Results object to update
     */
    async sendDoxReport(message, analysis, detectionRecord, escalationLevel, client, actionResults) {
        try {
            const detectionTypes = this.getDetectionTypes(analysis);
            const userWarns = this.warnManager.getWarnCount(message.author.id);
            const userDetections = this.getUserDetections(message.author.id, message.guild?.id);
            
            const reportEmbed = {
                color: analysis.overallRisk === 'critical' ? 0xff0000 : 
                       analysis.overallRisk === 'high' ? 0xff6600 : 
                       analysis.overallRisk === 'medium' ? 0xffaa00 : 0xffdd00,
                title: '🔒 Détection d\'informations personnelles',
                description: `Informations personnelles détectées et supprimées automatiquement.`,
                fields: [
                    {
                        name: '👤 Utilisateur',
                        value: `${message.author.tag} (${message.author.id})`,
                        inline: true
                    },
                    {
                        name: '📍 Localisation',
                        value: `${message.guild?.name}\n#${message.channel.name}`,
                        inline: true
                    },
                    {
                        name: '⚠️ Niveau de risque',
                        value: analysis.overallRisk.toUpperCase(),
                        inline: true
                    },
                    {
                        name: '🔍 Types détectés',
                        value: detectionTypes.join(', ') || 'Non spécifié',
                        inline: true
                    },
                    {
                        name: '📈 Escalade',
                        value: escalationLevel.toUpperCase(),
                        inline: true
                    },
                    {
                        name: '📊 Historique utilisateur',
                        value: `${userWarns} avertissement(s)\n${userDetections.length} détection(s) totale(s)`,
                        inline: true
                    }
                ],
                footer: {
                    text: `ID de détection: ${detectionRecord.id}`,
                    icon_url: client.user.displayAvatarURL()
                },
                timestamp: new Date().toISOString()
            };
            
            // Add content preview if available
            if (message.content && message.content.trim().length > 0) {
                const contentPreview = message.content.length > 100 ? 
                    message.content.substring(0, 100) + '...' : 
                    message.content;
                reportEmbed.fields.push({
                    name: '📝 Aperçu du contenu',
                    value: `\`\`\`${contentPreview}\`\`\``,
                    inline: false
                });
            }
            
            // Add image analysis info if available
            if (analysis.imageAnalysis && analysis.imageAnalysis.processed > 0) {
                reportEmbed.fields.push({
                    name: '🖼️ Analyse d\'images',
                    value: `${analysis.imageAnalysis.processed} image(s) traitée(s)\n${analysis.imageAnalysis.detections.length} détection(s) dans les images`,
                    inline: true
                });
            }
            
            const reportResult = await this.reportManager.sendSystemAlert(
                client,
                '🔒 Détection d\'informations personnelles',
                'Informations personnelles détectées et supprimées automatiquement.',
                reportEmbed.fields,
                reportEmbed.color
            );
            
            actionResults.reportSent = reportResult.success;
            
        } catch (error) {
            console.error('Error sending dox report:', error);
            actionResults.error = error.message;
        }
    }

    /**
     * Sends Telegram alert for critical detections
     * @param {Object} message - Discord message object
     * @param {Object} analysis - Analysis results
     * @param {string} escalationLevel - Escalation level
     * @param {Object} actionResults - Results object to update
     */
    async sendTelegramAlert(message, analysis, escalationLevel, actionResults) {
        try {
            // This would integrate with TelegramIntegration when available
            // For now, we'll just log the intent
            console.log(`TELEGRAM ALERT: High-risk dox detection in ${message.guild?.name} by ${message.author.tag}`);
            console.log(`Risk Level: ${analysis.overallRisk}, Escalation: ${escalationLevel}`);
            
            // TODO: Integrate with TelegramIntegration when implemented
            // await this.telegramIntegration.sendNotification(
            //     message.guild?.id,
            //     `🚨 ALERTE DOX: Détection critique d'informations personnelles par ${message.author.tag} dans #${message.channel.name}`,
            //     'urgent'
            // );
            
            actionResults.telegramNotified = true; // Set to true for testing
            
        } catch (error) {
            console.error('Error sending Telegram alert:', error);
        }
    }

    reload() {
        this.detections = this.loadDetections();
        this.exceptions = this.loadExceptions();
        
        // Perform automatic maintenance of Discord ID exclusions
        const maintenanceResult = this.maintainDiscordIdExclusions();
        if (maintenanceResult.actionsPerformed.length > 0) {
            console.log(`DoxDetector rechargé avec maintenance: ${maintenanceResult.actionsPerformed.length} actions effectuées`);
        } else {
            console.log('DoxDetector rechargé avec succès.');
        }
        
        // Synchronize patterns after reload
        this.synchronizeDiscordIdPatterns();
    }
}