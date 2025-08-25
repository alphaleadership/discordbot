import fs from 'fs';
import path from 'path';
import { promisify } from 'util';

const fsReadFile = promisify(fs.readFile);
const fsWriteFile = promisify(fs.writeFile);
const fsAccess = promisify(fs.access);
const fsMkdir = promisify(fs.mkdir);

export class WatchlistManager {
    constructor(filePath = 'data/watchlist.json', reportManager = null) {
        this.filePath = path.join(process.cwd(), filePath);
        this.reportManager = reportManager;
        this.watchlist = {};
        this.isLoading = false;
        this.isSaving = false;
        this.lockFile = `${this.filePath}.lock`;
        this.maxRetries = 3;
        this.retryDelay = 1000; // 1 second
        this.backupInterval = 5 * 60 * 1000; // 5 minutes
        this.lastBackup = 0;
        
        // Rate limiting for notifications to prevent spam
        this.notificationRateLimit = {
            // Track last notification time per user per guild
            lastNotifications: new Map(), // key: `${userId}_${guildId}`, value: timestamp
            cooldownPeriod: 5 * 60 * 1000, // 5 minutes cooldown between notifications for same user
            maxNotificationsPerHour: 10, // Maximum notifications per user per hour
            hourlyNotifications: new Map() // key: `${userId}_${guildId}`, value: array of timestamps
        };
        
        // Initialize watchlist with error handling
        this.initializeWatchlist();
    }

    /**
     * Initializes the watchlist with comprehensive error handling
     */
    async initializeWatchlist() {
        try {
            this.watchlist = await this.loadWatchlistWithRetry();
            console.log('WatchlistManager initialized successfully');
        } catch (error) {
            console.error('Failed to initialize WatchlistManager:', error);
            this.watchlist = this.getDefaultWatchlistData();
        }
    }

    /**
     * Gets default watchlist data structure
     * @returns {Object} Default watchlist data
     */
    getDefaultWatchlistData() {
        return {
            _metadata: {
                version: '2.0',
                created: new Date().toISOString(),
                lastModified: new Date().toISOString()
            },
            _settings: {}
        };
    }

    /**
     * Ensures the watchlist file and directory exist with comprehensive error handling
     */
    async ensureFileExists() {
        try {
            const dir = path.dirname(this.filePath);
            
            // Check if directory exists, create if not
            try {
                await fsAccess(dir);
            } catch (error) {
                if (error.code === 'ENOENT') {
                    await fsMkdir(dir, { recursive: true });
                    console.log(`Created directory: ${dir}`);
                } else {
                    throw error;
                }
            }
            
            // Check if file exists, create if not
            try {
                await fsAccess(this.filePath);
            } catch (error) {
                if (error.code === 'ENOENT') {
                    const defaultData = this.getDefaultWatchlistData();
                    await fsWriteFile(this.filePath, JSON.stringify(defaultData, null, 2), 'utf-8');
                    console.log(`Created watchlist file: ${this.filePath}`);
                } else {
                    throw error;
                }
            }
            
        } catch (error) {
            console.error('Error ensuring file exists:', error);
            throw new Error(`Failed to ensure watchlist file exists: ${error.message}`);
        }
    }

    /**
     * Loads the watchlist from file with retry logic and error recovery
     * @returns {Promise<Object>} The watchlist data
     */
    async loadWatchlistWithRetry() {
        if (this.isLoading) {
            // Wait for current loading operation to complete
            await this.waitForOperation('loading');
        }
        
        this.isLoading = true;
        
        try {
            await this.ensureFileExists();
            
            for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
                try {
                    // Check for file lock
                    await this.waitForFileLock();
                    
                    const data = await fsReadFile(this.filePath, 'utf-8');
                    const parsedData = this.parseWatchlistData(data);
                    
                    // Validate and migrate data if necessary
                    const validatedData = this.validateAndMigrateData(parsedData);
                    
                    this.isLoading = false;
                    return validatedData;
                    
                } catch (error) {
                    console.error(`Load attempt ${attempt} failed:`, error);
                    
                    if (attempt === this.maxRetries) {
                        // Try to recover from backup
                        const recoveredData = await this.recoverFromBackup();
                        if (recoveredData) {
                            this.isLoading = false;
                            return recoveredData;
                        }
                        throw error;
                    }
                    
                    // Wait before retry
                    await this.delay(this.retryDelay * attempt);
                }
            }
            
        } catch (error) {
            console.error('Failed to load watchlist after all retries:', error);
            this.isLoading = false;
            
            // Return safe default data
            const defaultData = this.getDefaultWatchlistData();
            console.log('Using default watchlist data due to load failure');
            return defaultData;
        }
    }

    /**
     * Legacy synchronous load method for backward compatibility
     * @returns {Object} The watchlist data
     */
    loadWatchlist() {
        try {
            // If async loading is in progress, return current data
            if (this.isLoading) {
                return this.watchlist || this.getDefaultWatchlistData();
            }
            
            // Synchronous fallback
            this.ensureFileExistsSync();
            const data = fs.readFileSync(this.filePath, 'utf-8');
            return this.parseWatchlistData(data);
        } catch (error) {
            console.error('Error loading watchlist synchronously:', error);
            return this.getDefaultWatchlistData();
        }
    }

    /**
     * Synchronous version of ensureFileExists for backward compatibility
     */
    ensureFileExistsSync() {
        try {
            const dir = path.dirname(this.filePath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            if (!fs.existsSync(this.filePath)) {
                const defaultData = this.getDefaultWatchlistData();
                fs.writeFileSync(this.filePath, JSON.stringify(defaultData, null, 2), 'utf-8');
            }
        } catch (error) {
            console.error('Error ensuring file exists synchronously:', error);
            throw error;
        }
    }

    /**
     * Parses watchlist data with error recovery
     * @param {string} data - Raw file data
     * @returns {Object} Parsed watchlist data
     */
    parseWatchlistData(data) {
        try {
            if (!data || data.trim() === '') {
                console.warn('Empty watchlist file, using default data');
                return this.getDefaultWatchlistData();
            }
            
            const parsed = JSON.parse(data);
            
            // Basic structure validation
            if (typeof parsed !== 'object' || parsed === null) {
                throw new Error('Invalid watchlist data structure');
            }
            
            return parsed;
            
        } catch (error) {
            console.error('Error parsing watchlist data:', error);
            
            // Try to recover partial data
            const recoveredData = this.attemptDataRecovery(data);
            if (recoveredData) {
                console.log('Recovered partial watchlist data');
                return recoveredData;
            }
            
            // Return default data as last resort
            console.warn('Using default data due to parse failure');
            return this.getDefaultWatchlistData();
        }
    }

    /**
     * Attempts to recover data from corrupted JSON
     * @param {string} data - Corrupted data
     * @returns {Object|null} Recovered data or null
     */
    attemptDataRecovery(data) {
        try {
            // Try to find valid JSON objects in the data
            const jsonMatches = data.match(/\{[^{}]*\}/g);
            if (jsonMatches && jsonMatches.length > 0) {
                const recovered = this.getDefaultWatchlistData();
                let recoveredCount = 0;
                
                for (const match of jsonMatches) {
                    try {
                        const obj = JSON.parse(match);
                        if (obj.userId && obj.guildId) {
                            const key = obj.guildId === 'GLOBAL' ? `GLOBAL_${obj.userId}` : `${obj.guildId}_${obj.userId}`;
                            recovered[key] = obj;
                            recoveredCount++;
                        }
                    } catch (e) {
                        // Skip invalid objects
                    }
                }
                
                if (recoveredCount > 0) {
                    console.log(`Recovered ${recoveredCount} watchlist entries`);
                    return recovered;
                }
            }
            
            return null;
        } catch (error) {
            console.error('Data recovery failed:', error);
            return null;
        }
    }

    /**
     * Validates and migrates data to current format
     * @param {Object} data - Data to validate
     * @returns {Object} Validated and migrated data
     */
    validateAndMigrateData(data) {
        try {
            // Add metadata if missing
            if (!data._metadata) {
                data._metadata = {
                    version: '2.0',
                    created: new Date().toISOString(),
                    lastModified: new Date().toISOString(),
                    migrated: true
                };
            }
            
            // Add settings if missing
            if (!data._settings) {
                data._settings = {};
            }
            
            // Validate and fix entries
            const validatedData = { ...data };
            let fixedEntries = 0;
            
            for (const [key, entry] of Object.entries(data)) {
                if (key.startsWith('_')) continue; // Skip metadata
                
                if (this.isValidWatchlistEntry(entry)) {
                    // Ensure required fields exist
                    if (!entry.notes) entry.notes = [];
                    if (!entry.incidents) entry.incidents = [];
                    if (entry.active === undefined) entry.active = true;
                    if (!entry.addedAt) entry.addedAt = new Date().toISOString();
                } else {
                    console.warn(`Removing invalid watchlist entry: ${key}`);
                    delete validatedData[key];
                    fixedEntries++;
                }
            }
            
            if (fixedEntries > 0) {
                console.log(`Fixed ${fixedEntries} invalid watchlist entries`);
                validatedData._metadata.lastModified = new Date().toISOString();
            }
            
            return validatedData;
            
        } catch (error) {
            console.error('Error validating data:', error);
            return data; // Return original data if validation fails
        }
    }

    /**
     * Checks if a watchlist entry is valid
     * @param {Object} entry - Entry to validate
     * @returns {boolean} True if valid
     */
    isValidWatchlistEntry(entry) {
        return entry &&
               typeof entry === 'object' &&
               typeof entry.userId === 'string' &&
               typeof entry.guildId === 'string' &&
               typeof entry.reason === 'string' &&
               typeof entry.addedBy === 'string';
    }

    /**
     * Waits for file lock to be released
     * @returns {Promise<void>}
     */
    async waitForFileLock() {
        const maxWait = 10000; // 10 seconds
        const checkInterval = 100; // 100ms
        let waited = 0;
        
        while (waited < maxWait) {
            try {
                await fsAccess(this.lockFile);
                // Lock file exists, wait
                await this.delay(checkInterval);
                waited += checkInterval;
            } catch (error) {
                if (error.code === 'ENOENT') {
                    // Lock file doesn't exist, we can proceed
                    return;
                }
                throw error;
            }
        }
        
        // Force remove stale lock file
        try {
            fs.unlinkSync(this.lockFile);
            console.warn('Removed stale lock file');
        } catch (error) {
            console.error('Failed to remove stale lock file:', error);
        }
    }

    /**
     * Creates a file lock
     * @returns {Promise<void>}
     */
    async createFileLock() {
        try {
            await fsWriteFile(this.lockFile, process.pid.toString(), 'utf-8');
        } catch (error) {
            console.error('Failed to create file lock:', error);
            throw error;
        }
    }

    /**
     * Removes the file lock
     */
    async removeFileLock() {
        try {
            if (fs.existsSync(this.lockFile)) {
                fs.unlinkSync(this.lockFile);
            }
        } catch (error) {
            console.error('Failed to remove file lock:', error);
        }
    }

    /**
     * Waits for an operation to complete
     * @param {string} operationType - Type of operation to wait for
     * @returns {Promise<void>}
     */
    async waitForOperation(operationType) {
        const maxWait = 30000; // 30 seconds
        const checkInterval = 100; // 100ms
        let waited = 0;
        
        while (waited < maxWait) {
            if (operationType === 'loading' && !this.isLoading) return;
            if (operationType === 'saving' && !this.isSaving) return;
            
            await this.delay(checkInterval);
            waited += checkInterval;
        }
        
        console.warn(`Operation ${operationType} timed out after ${maxWait}ms`);
    }

    /**
     * Delays execution for specified milliseconds
     * @param {number} ms - Milliseconds to delay
     * @returns {Promise<void>}
     */
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Attempts to recover data from backup
     * @returns {Promise<Object|null>} Recovered data or null
     */
    async recoverFromBackup() {
        try {
            const backupPath = `${this.filePath}.backup`;
            
            try {
                await fsAccess(backupPath);
                const backupData = await fsReadFile(backupPath, 'utf-8');
                const parsed = this.parseWatchlistData(backupData);
                
                console.log('Successfully recovered data from backup');
                return parsed;
            } catch (error) {
                if (error.code !== 'ENOENT') {
                    console.error('Error reading backup file:', error);
                }
                return null;
            }
            
        } catch (error) {
            console.error('Backup recovery failed:', error);
            return null;
        }
    }

    /**
     * Creates a backup of the current watchlist
     * @returns {Promise<boolean>} Success status
     */
    async createBackup() {
        try {
            const backupPath = `${this.filePath}.backup`;
            const currentData = JSON.stringify(this.watchlist, null, 2);
            
            await fsWriteFile(backupPath, currentData, 'utf-8');
            this.lastBackup = Date.now();
            
            return true;
        } catch (error) {
            console.error('Failed to create backup:', error);
            return false;
        }
    }

    /**
     * Reloads the watchlist from file with enhanced error handling
     */
    async reload() {
        try {
            console.log('Reloading WatchlistManager...');
            this.watchlist = await this.loadWatchlistWithRetry();
            console.log('WatchlistManager rechargé avec succès.');
        } catch (error) {
            console.error('Failed to reload WatchlistManager:', error);
            throw error;
        }
    }

    /**
     * Saves the watchlist to file with comprehensive error handling and retry logic
     * @returns {Promise<boolean>} Success status
     */
    async saveWatchlistWithRetry() {
        if (this.isSaving) {
            // Wait for current save operation to complete
            await this.waitForOperation('saving');
            return true;
        }
        
        this.isSaving = true;
        
        try {
            // Update metadata
            if (!this.watchlist._metadata) {
                this.watchlist._metadata = this.getDefaultWatchlistData()._metadata;
            }
            this.watchlist._metadata.lastModified = new Date().toISOString();
            
            // Create backup if enough time has passed
            if (Date.now() - this.lastBackup > this.backupInterval) {
                await this.createBackup();
            }
            
            for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
                try {
                    // Wait for file lock and create our own
                    await this.waitForFileLock();
                    await this.createFileLock();
                    
                    // Validate data before saving
                    const validationResult = this.validateWatchlistData(this.watchlist);
                    if (!validationResult.isValid) {
                        console.error('Watchlist data validation failed:', validationResult.errors);
                        // Try to fix common issues
                        this.watchlist = this.fixWatchlistData(this.watchlist);
                    }
                    
                    // Write to temporary file first
                    const tempPath = `${this.filePath}.tmp`;
                    const dataToSave = JSON.stringify(this.watchlist, null, 2);
                    
                    await fsWriteFile(tempPath, dataToSave, 'utf-8');
                    
                    // Verify the written data
                    const writtenData = await fsReadFile(tempPath, 'utf-8');
                    const parsedWritten = JSON.parse(writtenData);
                    
                    if (JSON.stringify(parsedWritten) !== JSON.stringify(this.watchlist)) {
                        throw new Error('Data verification failed after write');
                    }
                    
                    // Atomic move from temp to actual file
                    if (fs.existsSync(this.filePath)) {
                        fs.unlinkSync(this.filePath);
                    }
                    fs.renameSync(tempPath, this.filePath);
                    
                    await this.removeFileLock();
                    this.isSaving = false;
                    
                    return true;
                    
                } catch (error) {
                    await this.removeFileLock();
                    console.error(`Save attempt ${attempt} failed:`, error);
                    
                    if (attempt === this.maxRetries) {
                        throw error;
                    }
                    
                    // Wait before retry
                    await this.delay(this.retryDelay * attempt);
                }
            }
            
        } catch (error) {
            console.error('Failed to save watchlist after all retries:', error);
            this.isSaving = false;
            throw error;
        }
    }

    /**
     * Legacy synchronous save method for backward compatibility
     */
    saveWatchlist() {
        try {
            // Update metadata
            if (!this.watchlist._metadata) {
                this.watchlist._metadata = this.getDefaultWatchlistData()._metadata;
            }
            this.watchlist._metadata.lastModified = new Date().toISOString();
            
            // Validate data before saving
            const validationResult = this.validateWatchlistData(this.watchlist);
            if (!validationResult.isValid) {
                console.error('Watchlist data validation failed:', validationResult.errors);
                this.watchlist = this.fixWatchlistData(this.watchlist);
            }
            
            fs.writeFileSync(this.filePath, JSON.stringify(this.watchlist, null, 2), 'utf-8');
        } catch (error) {
            console.error('Error saving watchlist synchronously:', error);
            throw error;
        }
    }

    /**
     * Validates the entire watchlist data structure
     * @param {Object} data - Watchlist data to validate
     * @returns {Object} Validation result
     */
    validateWatchlistData(data) {
        const errors = [];
        
        try {
            if (!data || typeof data !== 'object') {
                errors.push('Watchlist data must be an object');
                return { isValid: false, errors };
            }
            
            // Check metadata
            if (!data._metadata) {
                errors.push('Missing metadata');
            } else if (typeof data._metadata !== 'object') {
                errors.push('Invalid metadata structure');
            }
            
            // Check settings
            if (!data._settings) {
                errors.push('Missing settings');
            } else if (typeof data._settings !== 'object') {
                errors.push('Invalid settings structure');
            }
            
            // Validate entries
            let entryCount = 0;
            for (const [key, entry] of Object.entries(data)) {
                if (key.startsWith('_')) continue; // Skip metadata
                
                entryCount++;
                if (!this.isValidWatchlistEntry(entry)) {
                    errors.push(`Invalid entry: ${key}`);
                }
            }
            
            console.log(`Validated ${entryCount} watchlist entries`);
            
        } catch (error) {
            errors.push(`Validation error: ${error.message}`);
        }
        
        return {
            isValid: errors.length === 0,
            errors
        };
    }

    /**
     * Attempts to fix common issues in watchlist data
     * @param {Object} data - Data to fix
     * @returns {Object} Fixed data
     */
    fixWatchlistData(data) {
        try {
            const fixed = { ...data };
            
            // Ensure metadata exists
            if (!fixed._metadata) {
                fixed._metadata = this.getDefaultWatchlistData()._metadata;
            }
            
            // Ensure settings exist
            if (!fixed._settings) {
                fixed._settings = {};
            }
            
            // Fix entries
            for (const [key, entry] of Object.entries(fixed)) {
                if (key.startsWith('_')) continue;
                
                if (entry && typeof entry === 'object') {
                    // Ensure required arrays exist
                    if (!Array.isArray(entry.notes)) entry.notes = [];
                    if (!Array.isArray(entry.incidents)) entry.incidents = [];
                    
                    // Ensure boolean fields
                    if (entry.active === undefined) entry.active = true;
                    
                    // Ensure timestamps
                    if (!entry.addedAt) entry.addedAt = new Date().toISOString();
                }
            }
            
            console.log('Applied automatic fixes to watchlist data');
            return fixed;
            
        } catch (error) {
            console.error('Error fixing watchlist data:', error);
            return data; // Return original if fixing fails
        }
    }

    /**
     * Validates watchlist entry data with comprehensive checks
     * @param {Object} entryData - The entry data to validate
     * @returns {Object} Validation result with isValid and errors
     */
    validateEntryData(entryData) {
        const errors = [];
        const warnings = [];
        
        try {
            // Check if entryData exists and is an object
            if (!entryData || typeof entryData !== 'object') {
                errors.push('entryData must be a valid object');
                return { isValid: false, errors, warnings };
            }
            
            // Validate userId
            if (!entryData.userId) {
                errors.push('userId is required');
            } else if (typeof entryData.userId !== 'string') {
                errors.push('userId must be a string');
            } else if (!/^\d{17,19}$/.test(entryData.userId)) {
                warnings.push('userId does not match Discord ID format (17-19 digits)');
            }
            
            // Validate reason
            if (!entryData.reason) {
                errors.push('reason is required');
            } else if (typeof entryData.reason !== 'string') {
                errors.push('reason must be a string');
            } else {
                const trimmedReason = entryData.reason.trim();
                if (trimmedReason.length === 0) {
                    errors.push('reason cannot be empty');
                } else if (trimmedReason.length < 3) {
                    warnings.push('reason is very short (less than 3 characters)');
                } else if (trimmedReason.length > 500) {
                    errors.push('reason is too long (maximum 500 characters)');
                }
            }
            
            // Validate addedBy
            if (!entryData.addedBy) {
                errors.push('addedBy is required');
            } else if (typeof entryData.addedBy !== 'string') {
                errors.push('addedBy must be a string');
            } else if (!/^\d{17,19}$/.test(entryData.addedBy)) {
                warnings.push('addedBy does not match Discord ID format');
            }
            
            // Validate guildId
            if (!entryData.guildId) {
                errors.push('guildId is required');
            } else if (typeof entryData.guildId !== 'string') {
                errors.push('guildId must be a string');
            } else if (entryData.guildId !== 'GLOBAL' && !/^\d{17,19}$/.test(entryData.guildId)) {
                warnings.push('guildId does not match Discord ID format (unless GLOBAL)');
            }
            
            // Validate watchLevel
            const validWatchLevels = ['observe', 'alert', 'action'];
            if (entryData.watchLevel) {
                if (!validWatchLevels.includes(entryData.watchLevel)) {
                    errors.push(`watchLevel must be one of: ${validWatchLevels.join(', ')}`);
                }
            }
            
            // Validate optional fields
            if (entryData.username !== undefined) {
                if (typeof entryData.username !== 'string') {
                    errors.push('username must be a string');
                } else if (entryData.username.length > 32) {
                    errors.push('username is too long (maximum 32 characters)');
                }
            }
            
            if (entryData.discriminator !== undefined) {
                if (typeof entryData.discriminator !== 'string') {
                    errors.push('discriminator must be a string');
                } else if (!/^\d{4}$/.test(entryData.discriminator) && entryData.discriminator !== '0') {
                    warnings.push('discriminator should be 4 digits or "0" for new username system');
                }
            }
            
            // Validate arrays if present
            if (entryData.notes !== undefined) {
                if (!Array.isArray(entryData.notes)) {
                    errors.push('notes must be an array');
                } else {
                    entryData.notes.forEach((note, index) => {
                        if (!note || typeof note !== 'object') {
                            errors.push(`notes[${index}] must be an object`);
                        } else {
                            if (!note.moderatorId || typeof note.moderatorId !== 'string') {
                                errors.push(`notes[${index}].moderatorId is required and must be a string`);
                            }
                            if (!note.note || typeof note.note !== 'string') {
                                errors.push(`notes[${index}].note is required and must be a string`);
                            }
                            if (!note.timestamp || typeof note.timestamp !== 'string') {
                                errors.push(`notes[${index}].timestamp is required and must be a string`);
                            }
                        }
                    });
                }
            }
            
            if (entryData.incidents !== undefined) {
                if (!Array.isArray(entryData.incidents)) {
                    errors.push('incidents must be an array');
                } else {
                    entryData.incidents.forEach((incident, index) => {
                        if (!incident || typeof incident !== 'object') {
                            errors.push(`incidents[${index}] must be an object`);
                        } else {
                            if (!incident.type || typeof incident.type !== 'string') {
                                errors.push(`incidents[${index}].type is required and must be a string`);
                            }
                            if (!incident.description || typeof incident.description !== 'string') {
                                errors.push(`incidents[${index}].description is required and must be a string`);
                            }
                            if (!incident.timestamp || typeof incident.timestamp !== 'string') {
                                errors.push(`incidents[${index}].timestamp is required and must be a string`);
                            }
                        }
                    });
                }
            }
            
            // Validate boolean fields
            if (entryData.active !== undefined && typeof entryData.active !== 'boolean') {
                errors.push('active must be a boolean');
            }
            
            // Validate timestamp fields
            const timestampFields = ['addedAt', 'lastSeen', 'removedAt'];
            timestampFields.forEach(field => {
                if (entryData[field] !== undefined) {
                    if (typeof entryData[field] !== 'string') {
                        errors.push(`${field} must be a string`);
                    } else {
                        const date = new Date(entryData[field]);
                        if (isNaN(date.getTime())) {
                            errors.push(`${field} must be a valid ISO timestamp`);
                        }
                    }
                }
            });
            
        } catch (error) {
            errors.push(`Validation error: ${error.message}`);
        }
        
        return {
            isValid: errors.length === 0,
            errors,
            warnings
        };
    }

    /**
     * Sanitizes and normalizes entry data
     * @param {Object} entryData - Raw entry data
     * @returns {Object} Sanitized entry data
     */
    sanitizeEntryData(entryData) {
        try {
            const sanitized = { ...entryData };
            
            // Trim string fields
            if (sanitized.reason) {
                sanitized.reason = sanitized.reason.trim();
            }
            if (sanitized.username) {
                sanitized.username = sanitized.username.trim();
            }
            
            // Normalize watchLevel
            if (sanitized.watchLevel) {
                sanitized.watchLevel = sanitized.watchLevel.toLowerCase();
            }
            
            // Ensure arrays exist
            if (!sanitized.notes) sanitized.notes = [];
            if (!sanitized.incidents) sanitized.incidents = [];
            
            // Set default values
            if (sanitized.active === undefined) sanitized.active = true;
            if (!sanitized.addedAt) sanitized.addedAt = new Date().toISOString();
            
            return sanitized;
            
        } catch (error) {
            console.error('Error sanitizing entry data:', error);
            return entryData;
        }
    }

    /**
     * Adds a user to the global watchlist with enhanced error handling
     * @param {string} userId - Discord user ID
     * @param {string} reason - Reason for adding to global watchlist
     * @param {string} moderatorId - ID of the moderator adding the user
     * @param {Object} options - Additional options
     * @returns {Promise<Object>} Result with success status and entry data or error
     */
    async addToGlobalWatchlist(userId, reason, moderatorId, options = {}) {
        try {
            // Input validation
            if (!userId || !reason || !moderatorId) {
                return {
                    success: false,
                    error: 'userId, reason, and moderatorId are required'
                };
            }
            
            // Sanitize and validate input data
            const entryData = this.sanitizeEntryData({
                userId: userId.toString(),
                reason: reason.toString(),
                addedBy: moderatorId.toString(),
                guildId: 'GLOBAL',
                watchLevel: options.watchLevel || 'alert',
                username: options.username || 'Unknown',
                discriminator: options.discriminator || '0'
            });
            
            const validation = this.validateEntryData(entryData);
            if (!validation.isValid) {
                return {
                    success: false,
                    error: `Invalid data: ${validation.errors.join(', ')}`,
                    warnings: validation.warnings
                };
            }
            
            // Check if user is already on global watchlist
            const existingEntry = this.getGlobalWatchlistEntry(userId);
            if (existingEntry) {
                return {
                    success: false,
                    error: 'User is already on the global watchlist',
                    existingEntry
                };
            }
            
            // Create global watchlist entry
            const watchlistKey = `GLOBAL_${userId}`;
            const entry = {
                userId: entryData.userId,
                username: entryData.username,
                discriminator: entryData.discriminator,
                reason: entryData.reason,
                addedBy: entryData.addedBy,
                addedAt: new Date().toISOString(),
                lastSeen: null,
                guildId: 'GLOBAL',
                watchLevel: entryData.watchLevel,
                notes: [],
                incidents: [],
                active: true,
                isGlobal: true
            };
            
            // Add to watchlist and save
            this.watchlist[watchlistKey] = entry;
            
            try {
                await this.saveWatchlistWithRetry();
            } catch (saveError) {
                // Rollback the addition if save fails
                delete this.watchlist[watchlistKey];
                throw saveError;
            }
            
            console.log(`User ${userId} added to global watchlist with level ${entry.watchLevel}`);
            
            return {
                success: true,
                entry,
                warnings: validation.warnings
            };
            
        } catch (error) {
            console.error('Error adding to global watchlist:', error);
            return {
                success: false,
                error: `Internal error: ${error.message}`
            };
        }
    }

    /**
     * Adds a user to the watchlist with enhanced error handling
     * @param {string} userId - Discord user ID
     * @param {string} reason - Reason for adding to watchlist
     * @param {string} moderatorId - ID of the moderator adding the user
     * @param {string} guildId - Guild ID where the user is being watched
     * @param {Object} options - Additional options
     * @returns {Promise<Object>} Result with success status and entry data or error
     */
    async addToWatchlist(userId, reason, moderatorId, guildId, options = {}) {
        try {
            // Input validation
            if (!userId || !reason || !moderatorId || !guildId) {
                return {
                    success: false,
                    error: 'userId, reason, moderatorId, and guildId are required'
                };
            }
            
            // Sanitize and validate input data
            const entryData = this.sanitizeEntryData({
                userId: userId.toString(),
                reason: reason.toString(),
                addedBy: moderatorId.toString(),
                guildId: guildId.toString(),
                watchLevel: options.watchLevel || 'observe',
                username: options.username || 'Unknown',
                discriminator: options.discriminator || '0'
            });
            
            const validation = this.validateEntryData(entryData);
            if (!validation.isValid) {
                return {
                    success: false,
                    error: `Invalid data: ${validation.errors.join(', ')}`,
                    warnings: validation.warnings
                };
            }
            
            // Check if user is already on watchlist for this guild
            const existingKey = this.getWatchlistKey(userId, guildId);
            if (existingKey && this.watchlist[existingKey] && this.watchlist[existingKey].active) {
                return {
                    success: false,
                    error: 'User is already on the watchlist for this server',
                    existingEntry: this.watchlist[existingKey]
                };
            }
            
            // Create watchlist entry
            const watchlistKey = `${guildId}_${userId}`;
            const entry = {
                userId: entryData.userId,
                username: entryData.username,
                discriminator: entryData.discriminator,
                reason: entryData.reason,
                addedBy: entryData.addedBy,
                addedAt: new Date().toISOString(),
                lastSeen: null,
                guildId: entryData.guildId,
                watchLevel: entryData.watchLevel,
                notes: [],
                incidents: [],
                active: true
            };
            
            // Add to watchlist and save
            this.watchlist[watchlistKey] = entry;
            
            try {
                await this.saveWatchlistWithRetry();
            } catch (saveError) {
                // Rollback the addition if save fails
                delete this.watchlist[watchlistKey];
                throw saveError;
            }
            
            console.log(`User ${userId} added to watchlist for server ${guildId} with level ${entry.watchLevel}`);
            
            return {
                success: true,
                entry,
                warnings: validation.warnings
            };
            
        } catch (error) {
            console.error('Error adding to watchlist:', error);
            return {
                success: false,
                error: `Internal error: ${error.message}`
            };
        }
    }

    /**
     * Removes a user from the global watchlist with enhanced error handling
     * @param {string} userId - Discord user ID
     * @returns {Promise<Object>} Result with success status and message
     */
    async removeFromGlobalWatchlist(userId) {
        try {
            // Input validation
            if (!userId || typeof userId !== 'string') {
                return {
                    success: false,
                    error: 'userId is required and must be a string'
                };
            }
            
            const globalKey = `GLOBAL_${userId}`;
            
            if (!this.watchlist[globalKey]) {
                return {
                    success: false,
                    error: 'User not found in global watchlist'
                };
            }
            
            if (!this.watchlist[globalKey].active) {
                return {
                    success: false,
                    error: 'User is already removed from global watchlist'
                };
            }
            
            // Store original state for rollback
            const originalEntry = { ...this.watchlist[globalKey] };
            
            // Mark as inactive instead of deleting to preserve history
            this.watchlist[globalKey].active = false;
            this.watchlist[globalKey].removedAt = new Date().toISOString();
            
            try {
                await this.saveWatchlistWithRetry();
            } catch (saveError) {
                // Rollback the removal if save fails
                this.watchlist[globalKey] = originalEntry;
                throw saveError;
            }
            
            console.log(`User ${userId} removed from global watchlist`);
            
            return {
                success: true,
                message: 'User removed from global watchlist',
                removedEntry: this.watchlist[globalKey]
            };
            
        } catch (error) {
            console.error('Error removing from global watchlist:', error);
            return {
                success: false,
                error: `Internal error: ${error.message}`
            };
        }
    }

    /**
     * Removes a user from the watchlist with enhanced error handling
     * @param {string} userId - Discord user ID
     * @param {string} guildId - Guild ID
     * @returns {Promise<Object>} Result with success status and message
     */
    async removeFromWatchlist(userId, guildId) {
        try {
            // Input validation
            if (!userId || typeof userId !== 'string') {
                return {
                    success: false,
                    error: 'userId is required and must be a string'
                };
            }
            
            if (!guildId || typeof guildId !== 'string') {
                return {
                    success: false,
                    error: 'guildId is required and must be a string'
                };
            }
            
            const watchlistKey = this.getWatchlistKey(userId, guildId);
            
            if (!watchlistKey || !this.watchlist[watchlistKey]) {
                return {
                    success: false,
                    error: 'User not found in watchlist'
                };
            }
            
            if (!this.watchlist[watchlistKey].active) {
                return {
                    success: false,
                    error: 'User is already removed from watchlist'
                };
            }
            
            // Store original state for rollback
            const originalEntry = { ...this.watchlist[watchlistKey] };
            
            // Mark as inactive instead of deleting to preserve history
            this.watchlist[watchlistKey].active = false;
            this.watchlist[watchlistKey].removedAt = new Date().toISOString();
            
            try {
                await this.saveWatchlistWithRetry();
            } catch (saveError) {
                // Rollback the removal if save fails
                this.watchlist[watchlistKey] = originalEntry;
                throw saveError;
            }
            
            console.log(`User ${userId} removed from watchlist for server ${guildId}`);
            
            return {
                success: true,
                message: 'User removed from watchlist',
                removedEntry: this.watchlist[watchlistKey]
            };
            
        } catch (error) {
            console.error('Error removing from watchlist:', error);
            return {
                success: false,
                error: `Internal error: ${error.message}`
            };
        }
    }

    /**
     * Checks if a user is on the global watchlist
     * @param {string} userId - Discord user ID
     * @returns {boolean} True if user is on active global watchlist
     */
    isOnGlobalWatchlist(userId) {
        try {
            if (!userId) {
                return false;
            }
            
            const globalEntry = this.getGlobalWatchlistEntry(userId);
            return globalEntry !== null;
                   
        } catch (error) {
            console.error('Erreur lors de la vérification de la watchlist globale:', error);
            return false;
        }
    }

    /**
     * Checks if a user is on the watchlist
     * @param {string} userId - Discord user ID
     * @param {string} guildId - Guild ID
     * @returns {boolean} True if user is on active watchlist
     */
    isOnWatchlist(userId, guildId) {
        try {
            if (!userId || !guildId) {
                return false;
            }
            
            const watchlistKey = this.getWatchlistKey(userId, guildId);
            return watchlistKey && 
                   this.watchlist[watchlistKey] && 
                   this.watchlist[watchlistKey].active === true;
                   
        } catch (error) {
            console.error('Erreur lors de la vérification de la watchlist:', error);
            return false;
        }
    }

    /**
     * Gets a watchlist entry for a user
     * @param {string} userId - Discord user ID
     * @param {string} guildId - Guild ID
     * @returns {Object|null} Watchlist entry or null if not found
     */
    getWatchlistEntry(userId, guildId) {
        try {
            if (!userId || !guildId) {
                return null;
            }
            
            const watchlistKey = this.getWatchlistKey(userId, guildId);
            
            if (!watchlistKey || !this.watchlist[watchlistKey]) {
                return null;
            }
            
            return this.watchlist[watchlistKey];
            
        } catch (error) {
            console.error('Erreur lors de la récupération de l\'entrée watchlist:', error);
            return null;
        }
    }

    /**
     * Gets a global watchlist entry for a user
     * @param {string} userId - Discord user ID
     * @returns {Object|null} Global watchlist entry or null if not found
     */
    getGlobalWatchlistEntry(userId) {
        try {
            if (!userId) {
                return null;
            }
            
            const globalKey = `GLOBAL_${userId}`;
            
            if (this.watchlist[globalKey] && this.watchlist[globalKey].active) {
                return this.watchlist[globalKey];
            }
            
            return null;
            
        } catch (error) {
            console.error('Erreur lors de la récupération de l\'entrée watchlist globale:', error);
            return null;
        }
    }

    /**
     * Gets all active watchlist entries for a guild
     * @param {string} guildId - Guild ID
     * @returns {Array} Array of active watchlist entries
     */
    getGuildWatchlist(guildId) {
        try {
            if (!guildId) {
                return [];
            }
            
            return Object.values(this.watchlist)
                .filter(entry => entry.guildId === guildId && entry.active === true);
                
        } catch (error) {
            console.error('Erreur lors de la récupération de la watchlist du serveur:', error);
            return [];
        }
    }

    /**
     * Gets all active global watchlist entries
     * @returns {Array} Array of active global watchlist entries
     */
    getGlobalWatchlist() {
        try {
            return Object.entries(this.watchlist)
                .filter(([key, entry]) => key.startsWith('GLOBAL_') && entry.active !== false)
                .map(([_, entry]) => entry);
        } catch (error) {
            console.error('Error retrieving global watchlist:', error);
            return [];
        }
    }

    /**
     * Gets comprehensive user history across all guilds
     * @param {string} userId - Discord user ID
     * @returns {Object} User history summary
     */
    getUserHistory(userId) {
        try {
            if (!userId) {
                return {
                    totalEntries: 0,
                    guilds: [],
                    totalIncidents: 0,
                    totalNotes: 0,
                    watchLevels: {},
                    oldestEntry: null,
                    newestEntry: null
                };
            }

            const userEntries = Object.values(this.watchlist)
                .filter(entry => entry.userId === userId && entry.active);

            if (userEntries.length === 0) {
                return {
                    totalEntries: 0,
                    guilds: [],
                    totalIncidents: 0,
                    totalNotes: 0,
                    watchLevels: {},
                    oldestEntry: null,
                    newestEntry: null
                };
            }

            const guilds = [];
            let totalIncidents = 0;
            let totalNotes = 0;
            const watchLevels = {};
            let oldestEntry = null;
            let newestEntry = null;

            for (const entry of userEntries) {
                // Collect guild information
                guilds.push({
                    guildId: entry.guildId,
                    reason: entry.reason,
                    watchLevel: entry.watchLevel,
                    addedAt: entry.addedAt,
                    addedBy: entry.addedBy,
                    incidentCount: entry.incidents?.length || 0,
                    noteCount: entry.notes?.length || 0
                });

                // Count incidents and notes
                totalIncidents += entry.incidents?.length || 0;
                totalNotes += entry.notes?.length || 0;

                // Track watch levels
                if (watchLevels[entry.watchLevel]) {
                    watchLevels[entry.watchLevel]++;
                } else {
                    watchLevels[entry.watchLevel] = 1;
                }

                // Find oldest and newest entries
                const entryDate = new Date(entry.addedAt);
                if (!oldestEntry || entryDate < new Date(oldestEntry.addedAt)) {
                    oldestEntry = entry;
                }
                if (!newestEntry || entryDate > new Date(newestEntry.addedAt)) {
                    newestEntry = entry;
                }
            }

            return {
                totalEntries: userEntries.length,
                guilds,
                totalIncidents,
                totalNotes,
                watchLevels,
                oldestEntry: oldestEntry ? {
                    guildId: oldestEntry.guildId,
                    addedAt: oldestEntry.addedAt,
                    reason: oldestEntry.reason
                } : null,
                newestEntry: newestEntry ? {
                    guildId: newestEntry.guildId,
                    addedAt: newestEntry.addedAt,
                    reason: newestEntry.reason
                } : null
            };

        } catch (error) {
            console.error('Error getting user history:', error);
            return {
                totalEntries: 0,
                guilds: [],
                totalIncidents: 0,
                totalNotes: 0,
                watchLevels: {},
                oldestEntry: null,
                newestEntry: null,
                error: error.message
            };
        }
    }

    /**
     * Adds a note to a watchlist entry with enhanced error handling
     * @param {string} userId - Discord user ID
     * @param {string} guildId - Guild ID
     * @param {string} note - Note to add
     * @param {string} moderatorId - ID of the moderator adding the note
     * @returns {Promise<Object>} Result with success status
     */
    async addNote(userId, guildId, note, moderatorId) {
        try {
            // Input validation
            if (!userId || typeof userId !== 'string') {
                return {
                    success: false,
                    error: 'userId is required and must be a string'
                };
            }
            
            if (!guildId || typeof guildId !== 'string') {
                return {
                    success: false,
                    error: 'guildId is required and must be a string'
                };
            }
            
            if (!note || typeof note !== 'string') {
                return {
                    success: false,
                    error: 'note is required and must be a string'
                };
            }
            
            if (!moderatorId || typeof moderatorId !== 'string') {
                return {
                    success: false,
                    error: 'moderatorId is required and must be a string'
                };
            }
            
            const trimmedNote = note.trim();
            if (trimmedNote.length === 0) {
                return {
                    success: false,
                    error: 'Note cannot be empty'
                };
            }
            
            if (trimmedNote.length > 1000) {
                return {
                    success: false,
                    error: 'Note is too long (maximum 1000 characters)'
                };
            }
            
            const entry = this.getWatchlistEntry(userId, guildId);
            
            if (!entry) {
                return {
                    success: false,
                    error: 'User not found in watchlist'
                };
            }
            
            if (!entry.active) {
                return {
                    success: false,
                    error: 'Cannot add note to inactive watchlist entry'
                };
            }
            
            // Create note entry
            const noteEntry = {
                id: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                moderatorId,
                note: trimmedNote,
                timestamp: new Date().toISOString()
            };
            
            // Store original state for rollback
            const originalNotes = [...entry.notes];
            
            // Add note
            entry.notes.push(noteEntry);
            
            try {
                await this.saveWatchlistWithRetry();
            } catch (saveError) {
                // Rollback the note addition if save fails
                entry.notes = originalNotes;
                throw saveError;
            }
            
            console.log(`Note added to watchlist entry for user ${userId} in guild ${guildId}`);
            
            return {
                success: true,
                note: noteEntry
            };
            
        } catch (error) {
            console.error('Error adding note:', error);
            return {
                success: false,
                error: `Internal error: ${error.message}`
            };
        }
    }

    /**
     * Adds an incident to a watchlist entry with enhanced error handling
     * @param {string} userId - Discord user ID
     * @param {string} guildId - Guild ID
     * @param {Object} incidentData - Incident data
     * @returns {Promise<Object>} Result with success status
     */
    async addIncident(userId, guildId, incidentData) {
        try {
            // Input validation
            if (!userId || typeof userId !== 'string') {
                return {
                    success: false,
                    error: 'userId is required and must be a string'
                };
            }
            
            if (!guildId || typeof guildId !== 'string') {
                return {
                    success: false,
                    error: 'guildId is required and must be a string'
                };
            }
            
            if (!incidentData || typeof incidentData !== 'object') {
                return {
                    success: false,
                    error: 'incidentData is required and must be an object'
                };
            }
            
            if (!incidentData.type || typeof incidentData.type !== 'string') {
                return {
                    success: false,
                    error: 'incidentData.type is required and must be a string'
                };
            }
            
            if (!incidentData.description || typeof incidentData.description !== 'string') {
                return {
                    success: false,
                    error: 'incidentData.description is required and must be a string'
                };
            }
            
            const trimmedDescription = incidentData.description.trim();
            if (trimmedDescription.length === 0) {
                return {
                    success: false,
                    error: 'Incident description cannot be empty'
                };
            }
            
            if (trimmedDescription.length > 2000) {
                return {
                    success: false,
                    error: 'Incident description is too long (maximum 2000 characters)'
                };
            }
            
            // Get watchlist entry (handle both guild and global)
            let entry;
            if (guildId === 'GLOBAL') {
                entry = this.getGlobalWatchlistEntry(userId);
            } else {
                entry = this.getWatchlistEntry(userId, guildId);
            }
            
            if (!entry) {
                return {
                    success: false,
                    error: 'User not found in watchlist'
                };
            }
            
            if (!entry.active) {
                return {
                    success: false,
                    error: 'Cannot add incident to inactive watchlist entry'
                };
            }
            
            // Create incident entry
            const incident = {
                id: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                type: incidentData.type.trim(),
                description: trimmedDescription,
                timestamp: new Date().toISOString(),
                channelId: incidentData.channelId || null,
                messageId: incidentData.messageId || null,
                severity: incidentData.severity || 'medium',
                metadata: incidentData.metadata || {}
            };
            
            // Store original state for rollback
            const originalIncidents = [...entry.incidents];
            const originalLastSeen = entry.lastSeen;
            
            // Add incident and update last seen
            entry.incidents.push(incident);
            entry.lastSeen = new Date().toISOString();
            
            try {
                await this.saveWatchlistWithRetry();
            } catch (saveError) {
                // Rollback the incident addition if save fails
                entry.incidents = originalIncidents;
                entry.lastSeen = originalLastSeen;
                throw saveError;
            }
            
            console.log(`Incident added to watchlist entry for user ${userId} in guild ${guildId}: ${incident.type}`);
            
            return {
                success: true,
                incident
            };
            
        } catch (error) {
            console.error('Error adding incident:', error);
            return {
                success: false,
                error: `Internal error: ${error.message}`
            };
        }
    }

    /**
     * Gets the watchlist key for a user in a guild
     * @param {string} userId - Discord user ID
     * @param {string} guildId - Guild ID
     * @returns {string|null} Watchlist key or null if not found
     */
    getWatchlistKey(userId, guildId) {
        const directKey = `${guildId}_${userId}`;
        
        if (this.watchlist[directKey]) {
            return directKey;
        }
        
        // Fallback: search through all entries
        for (const key in this.watchlist) {
            const entry = this.watchlist[key];
            if (entry.userId === userId && entry.guildId === guildId) {
                return key;
            }
        }
        
        return null;
    }

    /**
     * Updates user information in watchlist entries
     * @param {string} userId - Discord user ID
     * @param {Object} userInfo - Updated user information
     */
    updateUserInfo(userId, userInfo) {
        try {
            let updated = false;
            
            for (const key in this.watchlist) {
                const entry = this.watchlist[key];
                if (entry.userId === userId) {
                    if (userInfo.username && entry.username !== userInfo.username) {
                        entry.username = userInfo.username;
                        updated = true;
                    }
                    if (userInfo.discriminator && entry.discriminator !== userInfo.discriminator) {
                        entry.discriminator = userInfo.discriminator;
                        updated = true;
                    }
                }
            }
            
            if (updated) {
                this.saveWatchlist();
                console.log(`Informations utilisateur mises à jour pour ${userId}`);
            }
            
        } catch (error) {
            console.error('Erreur lors de la mise à jour des informations utilisateur:', error);
        }
    }

    /**
     * Gets statistics about the watchlist
     * @param {string} guildId - Guild ID (optional)
     * @returns {Object} Watchlist statistics
     */
    getStats(guildId = null) {
        try {
            let entries = Object.values(this.watchlist);
            
            if (guildId) {
                entries = entries.filter(entry => entry.guildId === guildId);
            }
            
            const activeEntries = entries.filter(entry => entry.active === true);
            const inactiveEntries = entries.filter(entry => entry.active === false);
            
            const watchLevels = {
                observe: activeEntries.filter(entry => entry.watchLevel === 'observe').length,
                alert: activeEntries.filter(entry => entry.watchLevel === 'alert').length,
                action: activeEntries.filter(entry => entry.watchLevel === 'action').length
            };
            
            return {
                total: entries.length,
                active: activeEntries.length,
                inactive: inactiveEntries.length,
                watchLevels,
                totalIncidents: entries.reduce((sum, entry) => sum + (entry.incidents?.length || 0), 0),
                totalNotes: entries.reduce((sum, entry) => sum + (entry.notes?.length || 0), 0)
            };
            
        } catch (error) {
            console.error('Erreur lors du calcul des statistiques:', error);
            return {
                total: 0,
                active: 0,
                inactive: 0,
                watchLevels: { observe: 0, alert: 0, action: 0 },
                totalIncidents: 0,
                totalNotes: 0
            };
        }
    }

    /**
     * Handles user join events to detect watched users with enhanced error handling and notifications
     * @param {import('discord.js').GuildMember} member - The member who joined
     * @returns {Promise<Object>} Result with detection status and actions taken
     */
    async handleUserJoin(member) {
        const startTime = Date.now();
        let operationId = null;
        
        try {
            // Generate unique operation ID for tracking
            operationId = `join_${member?.id || 'unknown'}_${Date.now()}`;
            
            // Enhanced input validation
            if (!member) {
                console.error(`[${operationId}] Invalid member object provided`);
                return {
                    success: false,
                    error: 'Membre invalide fourni',
                    operationId
                };
            }

            if (!member.guild) {
                console.error(`[${operationId}] Member has no guild association`);
                return {
                    success: false,
                    error: 'Membre sans serveur associé',
                    operationId
                };
            }

            if (!member.user) {
                console.error(`[${operationId}] Member has no user object`);
                return {
                    success: false,
                    error: 'Objet utilisateur manquant',
                    operationId
                };
            }

            const userId = member.id;
            const guildId = member.guild.id;
            
            console.log(`[${operationId}] Processing user join: ${member.user.tag} (${userId}) in ${member.guild.name} (${guildId})`);
            
            // Check both guild and global watchlists with error handling
            let watchlistEntry = null;
            let isGlobalWatch = false;
            
            try {
                // Check guild watchlist first
                watchlistEntry = this.getWatchlistEntry(userId, guildId);
                
                // If not on guild watchlist, check global watchlist
                if (!watchlistEntry) {
                    watchlistEntry = this.getWatchlistEntry(userId, 'GLOBAL');
                    isGlobalWatch = !!watchlistEntry;
                }
            } catch (error) {
                console.error(`[${operationId}] Error checking watchlist entries:`, error);
                // Continue with null watchlistEntry to avoid blocking
            }
            
            if (!watchlistEntry) {
                console.log(`[${operationId}] User not on watchlist, no action needed`);
                return {
                    success: true,
                    watched: false,
                    message: 'Utilisateur non surveillé',
                    operationId,
                    processingTime: Date.now() - startTime
                };
            }

            console.log(`[${operationId}] User found on ${isGlobalWatch ? 'global' : 'guild'} watchlist with level: ${watchlistEntry.watchLevel}`);

            // Update user info in watchlist with error handling
            try {
                const updateResult =await this.updateUserInfo(userId, {
                    username: member.user.username,
                    discriminator: member.user.discriminator,
                    lastSeen: new Date().toISOString()
                });
                
                if (!updateResult.success) {
                    console.warn(`[${operationId}] Failed to update user info:`, updateResult.error);
                }
            } catch (error) {
                console.error(`[${operationId}] Error updating user info:`, error);
                // Continue processing despite update failure
            }

            // Create detailed incident record
            const incidentData = {
                type: 'join',
                description: `Utilisateur surveillé a rejoint le serveur ${member.guild.name}`,
                channelId: null,
                messageId: null,
                metadata: {
                    accountAge: Date.now() - member.user.createdTimestamp,
                    joinedAt: member.joinedAt?.toISOString() || new Date().toISOString(),
                    isGlobalWatch,
                    memberCount: member.guild.memberCount,
                    operationId
                }
            };

            // Add join incident with error handling
            let incident = null;
            try {
                const incidentResult = this.addIncident(userId, isGlobalWatch ? 'GLOBAL' : guildId, incidentData);
                
                if (incidentResult.success) {
                    incident = incidentResult.incident;
                    console.log(`[${operationId}] Join incident recorded: ${incident.id}`);
                } else {
                    console.error(`[${operationId}] Failed to record join incident:`, incidentResult.error);
                }
            } catch (error) {
                console.error(`[${operationId}] Error adding join incident:`, error);
                // Continue processing despite incident failure
            }

            // Enhanced notification with comprehensive user history
            try {
                const notificationData = {
                    member,
                    watchlistEntry,
                    incident,
                    isGlobalWatch,
                    userHistory: this.getUserHistory(userId),
                    operationId
                };

                await this.notifyModerators(guildId, userId, 'join', notificationData);
                console.log(`[${operationId}] Moderator notification sent successfully`);
            } catch (error) {
                console.error(`[${operationId}] Error sending moderator notification:`, error);
                // Don't fail the entire operation due to notification failure
            }

            // Send admin notification for global watchlist users
            if (isGlobalWatch && this.reportManager) {
                try {
                    await this.reportManager.sendSystemAlert(
                        member.client,
                        '🌐 Global Watchlist User Joined',
                        `A globally watched user has joined a server`,
                        [
                            { name: 'User', value: `${member.user.tag} (${userId})`, inline: true },
                            { name: 'Server', value: `${member.guild.name} (${guildId})`, inline: true },
                            { name: 'Watch Level', value: watchlistEntry.watchLevel, inline: true },
                            { name: 'Reason', value: watchlistEntry.reason, inline: false }
                        ],
                        0xe74c3c // Red color for global alerts
                    );
                } catch (error) {
                    console.error(`[${operationId}] Error sending admin notification:`, error);
                }
            }

            const processingTime = Date.now() - startTime;
            console.log(`[${operationId}] User join processing completed in ${processingTime}ms`);

            return {
                success: true,
                watched: true,
                watchLevel: watchlistEntry.watchLevel,
                entry: watchlistEntry,
                incident,
                isGlobalWatch,
                operationId,
                processingTime
            };

        } catch (error) {
            const processingTime = Date.now() - startTime;
            console.error(`[${operationId || 'unknown'}] Critical error in handleUserJoin:`, error);
            
            // Attempt to send error notification to admins
            if (this.reportManager && member?.client) {
                try {
                    await this.reportManager.sendSystemAlert(
                        member.client,
                        '❌ Watchlist System Error',
                        `Error processing user join event`,
                        [
                            { name: 'User', value: member?.user?.tag || 'Unknown', inline: true },
                            { name: 'Server', value: member?.guild?.name || 'Unknown', inline: true },
                            { name: 'Error', value: error.message.substring(0, 1000), inline: false },
                            { name: 'Operation ID', value: operationId || 'N/A', inline: true }
                        ],
                        0xff0000 // Red color for errors
                    );
                } catch (notificationError) {
                    console.error(`[${operationId}] Failed to send error notification:`, notificationError);
                }
            }
            
            return {
                success: false,
                error: 'Erreur critique lors de la gestion de la jointure',
                details: error.message,
                operationId,
                processingTime
            };
        }
    }

    /**
     * Handles user message events to monitor watched users
     * @param {import('discord.js').Message} message - The message from the watched user
     * @returns {Promise<Object>} Result with monitoring status
     */
    async handleUserMessage(message) {
        const startTime = Date.now();
        let operationId = null;
        
        try {
            // Generate unique operation ID for tracking
            operationId = `msg_${message?.author?.id || 'unknown'}_${Date.now()}`;
            
            // Enhanced input validation
            if (!message) {
                console.error(`[${operationId}] Invalid message object provided`);
                return {
                    success: false,
                    error: 'Objet message invalide',
                    operationId
                };
            }

            if (!message.guild) {
                return {
                    success: true,
                    watched: false,
                    message: 'Message non surveillé (pas dans un serveur)',
                    operationId
                };
            }

            if (!message.author || message.author.bot) {
                return {
                    success: true,
                    watched: false,
                    message: 'Message non surveillé (bot ou auteur invalide)',
                    operationId
                };
            }

            const userId = message.author.id;
            const guildId = message.guild.id;
            
            console.log(`[${operationId}] Processing message from ${message.author.tag} (${userId}) in ${message.guild.name}`);
            
            // Check both guild and global watchlists with error handling
            let watchlistEntry = null;
            let isGlobalWatch = false;
            
            try {
                // Check guild watchlist first
                watchlistEntry = this.getWatchlistEntry(userId, guildId);
                
                // If not on guild watchlist, check global watchlist
                if (!watchlistEntry) {
                    watchlistEntry = this.getWatchlistEntry(userId, 'GLOBAL');
                    isGlobalWatch = !!watchlistEntry;
                }
            } catch (error) {
                console.error(`[${operationId}] Error checking watchlist entries:`, error);
                // Continue with null watchlistEntry to avoid blocking
            }
            
            if (!watchlistEntry) {
                return {
                    success: true,
                    watched: false,
                    message: 'Utilisateur non surveillé',
                    operationId,
                    processingTime: Date.now() - startTime
                };
            }

            console.log(`[${operationId}] User found on ${isGlobalWatch ? 'global' : 'guild'} watchlist with level: ${watchlistEntry.watchLevel}`);

            // Update user info with last seen
            try {
                const updateResult = this.updateUserInfo(userId, {
                    username: message.author.username,
                    discriminator: message.author.discriminator,
                    lastSeen: new Date().toISOString()
                });
                
                if (!updateResult.success) {
                    console.warn(`[${operationId}] Failed to update user info:`, updateResult.error);
                }
            } catch (error) {
                console.error(`[${operationId}] Error updating user info:`, error);
            }

            // Determine if we should log this message based on watch level
            const shouldLogMessage = watchlistEntry.watchLevel !== 'observe';
            const shouldNotify = this.shouldNotifyForMessage(userId, guildId, watchlistEntry.watchLevel);
            
            let incident = null;
            
            // Create incident record for alert and action levels
            if (shouldLogMessage) {
                try {
                    const messageContent = message.content || '*Message sans contenu texte*';
                    const contentPreview = messageContent.length > 200 
                        ? messageContent.substring(0, 200) + '...' 
                        : messageContent;
                    
                    const incidentData = {
                        type: 'message',
                        description: `Message dans #${message.channel.name}: ${contentPreview}`,
                        channelId: message.channel.id,
                        messageId: message.id,
                        metadata: {
                            messageLength: messageContent.length,
                            hasAttachments: message.attachments.size > 0,
                            attachmentCount: message.attachments.size,
                            channelType: message.channel.type,
                            isGlobalWatch,
                            operationId,
                            messageUrl: message.url
                        }
                    };

                    const incidentResult = await this.addIncident(userId, isGlobalWatch ? 'GLOBAL' : guildId, incidentData);
                    console.log(incidentResult)
                    if (incidentResult.success) {
                        incident = incidentResult.incident;
                        console.log(`[${operationId}] Message incident recorded: ${incident.id}`);
                    } else {
                        console.error(`[${operationId}] Failed to record message incident:`, incidentResult.error);
                    }
                } catch (error) {
                    console.error(`[${operationId}] Error adding message incident:`, error);
                }
            }

            // Send notification if appropriate and not rate limited
            if (shouldNotify) {
                try {
                    const notificationData = {
                        message,
                        watchlistEntry,
                        incident,
                        isGlobalWatch,
                        userHistory: this.getUserHistory(userId),
                        operationId
                    };

                    await this.notifyModerators(guildId, userId, 'message', notificationData);
                    console.log(`[${operationId}] Moderator notification sent successfully`);
                    
                    // Update rate limiting tracking
                    this.updateNotificationTracking(userId, guildId);
                    
                } catch (error) {
                    console.error(`[${operationId}] Error sending moderator notification:`, error);
                }
            } else if (watchlistEntry.watchLevel !== 'observe') {
                console.log(`[${operationId}] Notification skipped due to rate limiting`);
            }

            const processingTime = Date.now() - startTime;
            console.log(`[${operationId}] Message processing completed in ${processingTime}ms`);

            return {
                success: true,
                watched: true,
                watchLevel: watchlistEntry.watchLevel,
                entry: watchlistEntry,
                incident,
                isGlobalWatch,
                notificationSent: shouldNotify,
                operationId,
                processingTime
            };

        } catch (error) {
            const processingTime = Date.now() - startTime;
            console.error(`[${operationId || 'unknown'}] Critical error in handleUserMessage:`, error);
            
            // Attempt to send error notification to admins
            if (this.reportManager && message?.client) {
                try {
                    await this.reportManager.sendSystemAlert(
                        message.client,
                        '❌ Message Monitoring Error',
                        `Error processing watched user message`,
                        [
                            { name: 'User', value: message?.author?.tag || 'Unknown', inline: true },
                            { name: 'Server', value: message?.guild?.name || 'Unknown', inline: true },
                            { name: 'Channel', value: message?.channel?.name || 'Unknown', inline: true },
                            { name: 'Error', value: error.message.substring(0, 1000), inline: false },
                            { name: 'Operation ID', value: operationId || 'N/A', inline: true }
                        ],
                        0xff0000 // Red color for errors
                    );
                } catch (notificationError) {
                    console.error(`[${operationId}] Failed to send error notification:`, notificationError);
                }
            }
            
            return {
                success: false,
                error: 'Erreur critique lors de la surveillance du message',
                details: error.message,
                operationId,
                processingTime
            };
        }
    }

    /**
     * Handles general user actions to monitor watched users
     * @param {string} userId - User ID
     * @param {string} guildId - Guild ID
     * @param {string} action - Action type
     * @param {Object} actionData - Additional action data
     * @returns {Promise<Object>} Result with monitoring status
     */
    async handleUserAction(userId, guildId, action, actionData = {}) {
        const startTime = Date.now();
        let operationId = null;
        
        try {
            // Generate unique operation ID for tracking
            operationId = `action_${userId}_${action}_${Date.now()}`;
            
            // Enhanced input validation
            if (!userId || typeof userId !== 'string') {
                console.error(`[${operationId}] Invalid userId provided:`, userId);
                return {
                    success: false,
                    error: 'ID utilisateur invalide',
                    operationId
                };
            }

            if (!guildId || typeof guildId !== 'string') {
                console.error(`[${operationId}] Invalid guildId provided:`, guildId);
                return {
                    success: false,
                    error: 'ID serveur invalide',
                    operationId
                };
            }

            if (!action || typeof action !== 'string') {
                console.error(`[${operationId}] Invalid action provided:`, action);
                return {
                    success: false,
                    error: 'Action invalide',
                    operationId
                };
            }

            console.log(`[${operationId}] Processing user action: ${action} for user ${userId} in guild ${guildId}`);
            
            // Check both guild and global watchlists with error handling
            let watchlistEntry = null;
            let isGlobalWatch = false;
            
            try {
                // Check guild watchlist first
                watchlistEntry = this.getWatchlistEntry(userId, guildId);
                
                // If not on guild watchlist, check global watchlist
                if (!watchlistEntry) {
                    watchlistEntry = this.getWatchlistEntry(userId, 'GLOBAL');
                    isGlobalWatch = !!watchlistEntry;
                }
            } catch (error) {
                console.error(`[${operationId}] Error checking watchlist entries:`, error);
                // Continue with null watchlistEntry to avoid blocking
            }
            
            if (!watchlistEntry) {
                return {
                    success: true,
                    watched: false,
                    message: 'Utilisateur non surveillé',
                    operationId,
                    processingTime: Date.now() - startTime
                };
            }

            console.log(`[${operationId}] User found on ${isGlobalWatch ? 'global' : 'guild'} watchlist with level: ${watchlistEntry.watchLevel}`);

            // Determine action severity and notification requirements
            const actionSeverity = this.getActionSeverity(action);
            const shouldNotify = this.shouldNotifyForAction(watchlistEntry.watchLevel, action, actionSeverity);
            
            // Create comprehensive incident record
            const incidentData = {
                type: action,
                description: actionData.description || `Action: ${action}`,
                channelId: actionData.channelId || null,
                messageId: actionData.messageId || null,
                metadata: {
                    severity: actionSeverity,
                    moderatorId: actionData.moderatorId || null,
                    reason: actionData.reason || null,
                    duration: actionData.duration || null,
                    isGlobalWatch,
                    operationId,
                    timestamp: new Date().toISOString(),
                    additionalData: actionData.additionalData || {}
                }
            };

            // Add action incident with error handling
            let incident = null;
            try {
                const incidentResult = this.addIncident(userId, isGlobalWatch ? 'GLOBAL' : guildId, incidentData);
                
                if (incidentResult.success) {
                    incident = incidentResult.incident;
                    console.log(`[${operationId}] Action incident recorded: ${incident.id}`);
                } else {
                    console.error(`[${operationId}] Failed to record action incident:`, incidentResult.error);
                }
            } catch (error) {
                console.error(`[${operationId}] Error adding action incident:`, error);
                // Continue processing despite incident failure
            }

            // Send notification if appropriate
            if (shouldNotify) {
                try {
                    const notificationData = {
                        actionData: {
                            ...actionData,
                            severity: actionSeverity
                        },
                        watchlistEntry,
                        incident,
                        isGlobalWatch,
                        userHistory: this.getUserHistory(userId),
                        operationId
                    };

                    await this.notifyModerators(guildId, userId, action, notificationData);
                    console.log(`[${operationId}] Moderator notification sent successfully`);
                } catch (error) {
                    console.error(`[${operationId}] Error sending moderator notification:`, error);
                }
            } else {
                console.log(`[${operationId}] Notification skipped based on watch level and action severity`);
            }

            // Send admin notification for high-severity actions on global watchlist
            if (isGlobalWatch && actionSeverity >= 3 && this.reportManager) {
                try {
                    await this.reportManager.sendSystemAlert(
                        actionData.client || null,
                        '🚨 High-Severity Action on Global Watchlist',
                        `A globally watched user performed a high-severity action`,
                        [
                            { name: 'User ID', value: userId, inline: true },
                            { name: 'Action', value: action, inline: true },
                            { name: 'Severity', value: `${actionSeverity}/5`, inline: true },
                            { name: 'Guild ID', value: guildId, inline: true },
                            { name: 'Watch Level', value: watchlistEntry.watchLevel, inline: true },
                            { name: 'Description', value: incidentData.description, inline: false }
                        ],
                        0xff0000 // Red color for high severity
                    );
                } catch (error) {
                    console.error(`[${operationId}] Error sending admin notification:`, error);
                }
            }

            const processingTime = Date.now() - startTime;
            console.log(`[${operationId}] User action processing completed in ${processingTime}ms`);

            return {
                success: true,
                watched: true,
                watchLevel: watchlistEntry.watchLevel,
                entry: watchlistEntry,
                incident,
                isGlobalWatch,
                actionSeverity,
                notificationSent: shouldNotify,
                operationId,
                processingTime
            };

        } catch (error) {
            const processingTime = Date.now() - startTime;
            console.error(`[${operationId || 'unknown'}] Critical error in handleUserAction:`, error);
            
            // Attempt to send error notification to admins
            if (this.reportManager && actionData.client) {
                try {
                    await this.reportManager.sendSystemAlert(
                        actionData.client,
                        '❌ Action Monitoring Error',
                        `Error processing watched user action`,
                        [
                            { name: 'User ID', value: userId || 'Unknown', inline: true },
                            { name: 'Guild ID', value: guildId || 'Unknown', inline: true },
                            { name: 'Action', value: action || 'Unknown', inline: true },
                            { name: 'Error', value: error.message.substring(0, 1000), inline: false },
                            { name: 'Operation ID', value: operationId || 'N/A', inline: true }
                        ],
                        0xff0000 // Red color for errors
                    );
                } catch (notificationError) {
                    console.error(`[${operationId}] Failed to send error notification:`, notificationError);
                }
            }
            
            return {
                success: false,
                error: 'Erreur critique lors de la surveillance de l\'action',
                details: error.message,
                operationId,
                processingTime
            };
        }
    }

    /**
     * Notifies moderators about watched user activities
     * @param {string} guildId - Guild ID
     * @param {string} userId - User ID
     * @param {string} eventType - Type of event (join, message, action)
     * @param {Object} eventData - Event data
     * @returns {Promise<void>}
     */
    async notifyModerators(guildId, userId, eventType, eventData = {}) {
        const notificationId = `notify_${userId}_${Date.now()}`;
        
        try {
            console.log(`[${notificationId}] Starting moderator notification for ${eventType} event`);
            
            if (!this.reportManager) {
                console.warn(`[${notificationId}] ReportManager non disponible pour les notifications de watchlist`);
                return;
            }

            const { watchlistEntry, member, message, actionData, incident, isGlobalWatch, userHistory, operationId } = eventData;
            
            if (!watchlistEntry) {
                console.error(`[${notificationId}] Entrée de watchlist manquante pour la notification`);
                return;
            }

            // Get user information with enhanced error handling
            let userTag = `${watchlistEntry.username || 'Unknown'}#${watchlistEntry.discriminator || '0000'}`;
            let userAvatarUrl = null;
            
            try {
                if (member && member.user) {
                    userTag = member.user.tag;
                    userAvatarUrl = member.user.displayAvatarURL({ dynamic: true });
                } else if (message && message.author) {
                    userTag = message.author.tag;
                    userAvatarUrl = message.author.displayAvatarURL({ dynamic: true });
                }
            } catch (error) {
                console.warn(`[${notificationId}] Error getting user display info:`, error);
            }

            // Create enhanced notification embed
            const { EmbedBuilder } = await import('discord.js');
            
            const watchLevelEmoji = this.getWatchLevelEmoji(watchlistEntry.watchLevel);
            const globalIndicator = isGlobalWatch ? '🌐 ' : '';
            
            let embed = new EmbedBuilder()
                .setColor(this.getWatchLevelColor(watchlistEntry.watchLevel))
                .setTitle(`🔍 ${globalIndicator}Activité Utilisateur Surveillé - ${watchLevelEmoji} ${watchlistEntry.watchLevel.toUpperCase()}`)
                .addFields(
                    { name: 'Utilisateur', value: `${userTag} (${userId})`, inline: true },
                    { name: 'Niveau de surveillance', value: `${watchLevelEmoji} ${watchlistEntry.watchLevel}`, inline: true },
                    { name: 'Type de surveillance', value: isGlobalWatch ? '🌐 Globale' : '🏠 Locale', inline: true }
                )
                .setTimestamp();

            if (userAvatarUrl) {
                embed.setThumbnail(userAvatarUrl);
            }

            // Add event-specific information with enhanced details
            switch (eventType) {
                case 'join':
                    const accountAge = member ? Date.now() - member.user.createdTimestamp : 0;
                    const accountAgeText = accountAge > 0 ? this.formatDuration(accountAge) : 'Inconnu';
                    
                    embed.setDescription('🚪 Un utilisateur surveillé a rejoint le serveur')
                        .addFields(
                            { name: 'Événement', value: 'Jointure du serveur', inline: true },
                            { name: 'Âge du compte', value: accountAgeText, inline: true },
                            { name: 'Membres actuels', value: member?.guild?.memberCount?.toString() || 'Inconnu', inline: true }
                        );
                    
                    if (member?.user?.createdAt) {
                        embed.addFields({ 
                            name: 'Compte créé le', 
                            value: member.user.createdAt.toLocaleString('fr-FR'), 
                            inline: true 
                        });
                    }
                    break;

                case 'message':
                    embed.setDescription('💬 Un utilisateur surveillé a envoyé un message')
                        .addFields(
                            { name: 'Canal', value: message ? `<#${message.channel.id}>` : 'Inconnu', inline: true },
                            { name: 'Type de canal', value: message?.channel?.type || 'Inconnu', inline: true }
                        );
                    
                    if (message) {
                        const messagePreview = message.content.length > 0 
                            ? message.content.substring(0, 300) + (message.content.length > 300 ? '...' : '')
                            : '*Message sans contenu texte*';
                        
                        embed.addFields(
                            { name: 'Contenu du message', value: `\`\`\`${messagePreview}\`\`\``, inline: false },
                            { name: 'Lien du message', value: `[Aller au message](${message.url})`, inline: true }
                        );
                        
                        if (message.attachments.size > 0) {
                            embed.addFields({ 
                                name: 'Pièces jointes', 
                                value: `${message.attachments.size} fichier(s)`, 
                                inline: true 
                            });
                        }
                    }
                    break;

                default:
                    embed.setDescription(`⚡ Un utilisateur surveillé a effectué une action: ${eventType}`)
                        .addFields(
                            { name: 'Action', value: eventType, inline: true },
                            { name: 'Détails', value: actionData?.description || 'Aucun détail disponible', inline: false }
                        );
                    break;
            }

            // Add comprehensive user history if available
            if (userHistory && userHistory.totalEntries > 0) {
                const historyText = [
                    `📊 **Surveillance totale:** ${userHistory.totalEntries} serveur(s)`,
                    `📝 **Incidents:** ${userHistory.totalIncidents} total`,
                    `📋 **Notes:** ${userHistory.totalNotes} total`
                ].join('\n');
                
                embed.addFields({ name: 'Historique utilisateur', value: historyText, inline: false });
                
                // Add watch level distribution
                if (Object.keys(userHistory.watchLevels).length > 0) {
                    const watchLevelText = Object.entries(userHistory.watchLevels)
                        .map(([level, count]) => `${this.getWatchLevelEmoji(level)} ${level}: ${count}`)
                        .join(' • ');
                    embed.addFields({ name: 'Niveaux de surveillance', value: watchLevelText, inline: false });
                }
            }

            // Add incident information with enhanced details
            if (incident) {
                embed.addFields(
                    { name: 'ID Incident', value: `\`${incident.id}\``, inline: true },
                    { name: 'Heure de l\'incident', value: new Date(incident.timestamp).toLocaleString('fr-FR'), inline: true }
                );
                
                if (incident.metadata) {
                    const metadataText = Object.entries(incident.metadata)
                        .filter(([key, value]) => key !== 'operationId' && value !== null && value !== undefined)
                        .map(([key, value]) => `**${key}:** ${value}`)
                        .join('\n');
                    
                    if (metadataText) {
                        embed.addFields({ name: 'Métadonnées', value: metadataText, inline: false });
                    }
                }
            }

            // Add current watchlist entry statistics
            const totalIncidents = watchlistEntry.incidents?.length || 0;
            const recentIncidents = watchlistEntry.incidents?.filter(inc => 
                new Date(inc.timestamp) > new Date(Date.now() - 24 * 60 * 60 * 1000)
            ).length || 0;
            const totalNotes = watchlistEntry.notes?.length || 0;

            embed.addFields(
                { name: 'Incidents (Total)', value: totalIncidents.toString(), inline: true },
                { name: 'Incidents (24h)', value: recentIncidents.toString(), inline: true },
                { name: 'Notes', value: totalNotes.toString(), inline: true }
            );

            // Add surveillance details
            embed.addFields(
                { name: 'Raison de surveillance', value: watchlistEntry.reason, inline: false },
                { name: 'Ajouté par', value: `<@${watchlistEntry.addedBy}>`, inline: true },
                { name: 'Date d\'ajout', value: new Date(watchlistEntry.addedAt).toLocaleDateString('fr-FR'), inline: true }
            );

            // Add operation tracking if available
            if (operationId) {
                embed.setFooter({ 
                    text: `Watchlist Manager • Op: ${operationId}` 
                });
            } else {
                embed.setFooter({ 
                    text: `Watchlist Manager • ${new Date().toLocaleString('fr-FR')}` 
                });
            }

            // Send notification through ReportManager with error handling
            const client = member?.client || message?.client;
            if (client) {
                const result = await this.reportManager.sendWatchlistAlert(client, guildId, embed);
                if (result.success) {
                    console.log(`[${notificationId}] Notification sent successfully`);
                } else {
                    console.error(`[${notificationId}] Failed to send notification:`, result.message);
                }
            } else {
                console.warn(`[${notificationId}] No Discord client available for notification`);
            }

        } catch (error) {
            console.error(`[${notificationId}] Erreur lors de l'envoi de la notification de watchlist:`, error);
            
            // Attempt to send a simplified error notification
            if (this.reportManager && (member?.client || message?.client)) {
                try {
                    const client = member?.client || message?.client;
                    await this.reportManager.sendSystemAlert(
                        client,
                        '⚠️ Notification Error',
                        `Failed to send watchlist notification for user ${userId}`,
                        [
                            { name: 'Event Type', value: eventType, inline: true },
                            { name: 'Guild ID', value: guildId, inline: true },
                            { name: 'Error', value: error.message.substring(0, 1000), inline: false }
                        ],
                        0xff9900 // Orange color for warnings
                    );
                } catch (fallbackError) {
                    console.error(`[${notificationId}] Failed to send fallback notification:`, fallbackError);
                }
            }
        }
    }

    /**
     * Gets the color for a watch level
     * @param {string} watchLevel - Watch level
     * @returns {number} Color code
     */
    getWatchLevelColor(watchLevel) {
        switch (watchLevel) {
            case 'observe': return 0x3498db; // Blue
            case 'alert': return 0xf39c12;   // Orange
            case 'action': return 0xe74c3c;  // Red
            default: return 0x95a5a6;        // Gray
        }
    }

    /**
     * Gets the emoji for a watch level
     * @param {string} watchLevel - Watch level
     * @returns {string} Emoji
     */
    getWatchLevelEmoji(watchLevel) {
        switch (watchLevel) {
            case 'observe': return '👁️';
            case 'alert': return '⚠️';
            case 'action': return '🚨';
            default: return '❓';
        }
    }

    /**
     * Formats a duration in milliseconds to a human-readable string
     * @param {number} milliseconds - Duration in milliseconds
     * @returns {string} Formatted duration
     */
    formatDuration(milliseconds) {
        try {
            if (!milliseconds || milliseconds < 0) {
                return 'Inconnu';
            }

            const seconds = Math.floor(milliseconds / 1000);
            const minutes = Math.floor(seconds / 60);
            const hours = Math.floor(minutes / 60);
            const days = Math.floor(hours / 24);
            const months = Math.floor(days / 30);
            const years = Math.floor(days / 365);

            if (years > 0) {
                return `${years} an${years > 1 ? 's' : ''}`;
            } else if (months > 0) {
                return `${months} mois`;
            } else if (days > 0) {
                return `${days} jour${days > 1 ? 's' : ''}`;
            } else if (hours > 0) {
                return `${hours} heure${hours > 1 ? 's' : ''}`;
            } else if (minutes > 0) {
                return `${minutes} minute${minutes > 1 ? 's' : ''}`;
            } else {
                return `${seconds} seconde${seconds > 1 ? 's' : ''}`;
            }
        } catch (error) {
            console.error('Error formatting duration:', error);
            return 'Inconnu';
        }
    }

    /**
     * Determines if a notification should be sent for a message based on rate limiting
     * @param {string} userId - User ID
     * @param {string} guildId - Guild ID
     * @param {string} watchLevel - Watch level
     * @returns {boolean} Whether to send notification
     */
    shouldNotifyForMessage(userId, guildId, watchLevel) {
        try {
            // Always skip notifications for 'observe' level
            if (watchLevel === 'observe') {
                return false;
            }

            const now = Date.now();
            const userKey = `${userId}_${guildId}`;
            
            // Check cooldown period
            const lastNotification = this.notificationRateLimit.lastNotifications.get(userKey);
            if (lastNotification && (now - lastNotification) < this.notificationRateLimit.cooldownPeriod) {
                return false;
            }
            
            // Check hourly limit
            const hourlyNotifications = this.notificationRateLimit.hourlyNotifications.get(userKey) || [];
            const oneHourAgo = now - (60 * 60 * 1000);
            
            // Clean old notifications
            const recentNotifications = hourlyNotifications.filter(timestamp => timestamp > oneHourAgo);
            this.notificationRateLimit.hourlyNotifications.set(userKey, recentNotifications);
            
            // Check if we've exceeded the hourly limit
            if (recentNotifications.length >= this.notificationRateLimit.maxNotificationsPerHour) {
                return false;
            }
            
            return true;
            
        } catch (error) {
            console.error('Error checking notification rate limit:', error);
            // Default to allowing notification on error
            return true;
        }
    }

    /**
     * Updates notification tracking after sending a notification
     * @param {string} userId - User ID
     * @param {string} guildId - Guild ID
     */
    updateNotificationTracking(userId, guildId) {
        try {
            const now = Date.now();
            const userKey = `${userId}_${guildId}`;
            
            // Update last notification time
            this.notificationRateLimit.lastNotifications.set(userKey, now);
            
            // Add to hourly tracking
            const hourlyNotifications = this.notificationRateLimit.hourlyNotifications.get(userKey) || [];
            hourlyNotifications.push(now);
            this.notificationRateLimit.hourlyNotifications.set(userKey, hourlyNotifications);
            
        } catch (error) {
            console.error('Error updating notification tracking:', error);
        }
    }

    /**
     * Cleans up old rate limiting data to prevent memory leaks
     */
    cleanupRateLimitData() {
        try {
            const now = Date.now();
            const oneHourAgo = now - (60 * 60 * 1000);
            const oneDayAgo = now - (24 * 60 * 60 * 1000);
            
            // Clean up hourly notifications older than 1 hour
            for (const [userKey, notifications] of this.notificationRateLimit.hourlyNotifications.entries()) {
                const recentNotifications = notifications.filter(timestamp => timestamp > oneHourAgo);
                if (recentNotifications.length === 0) {
                    this.notificationRateLimit.hourlyNotifications.delete(userKey);
                } else {
                    this.notificationRateLimit.hourlyNotifications.set(userKey, recentNotifications);
                }
            }
            
            // Clean up last notifications older than 1 day
            for (const [userKey, timestamp] of this.notificationRateLimit.lastNotifications.entries()) {
                if (timestamp < oneDayAgo) {
                    this.notificationRateLimit.lastNotifications.delete(userKey);
                }
            }
            
        } catch (error) {
            console.error('Error cleaning up rate limit data:', error);
        }
    }

    /**
     * Determines the severity level of an action (1-5 scale)
     * @param {string} action - Action type
     * @returns {number} Severity level (1 = low, 5 = critical)
     */
    getActionSeverity(action) {
        try {
            const severityMap = {
                // Critical actions (5)
                'ban': 5,
                'kick': 5,
                'permanent_ban': 5,
                
                // High severity actions (4)
                'timeout': 4,
                'mute': 4,
                'warning': 4,
                'role_remove': 4,
                
                // Medium severity actions (3)
                'message_delete': 3,
                'nickname_change': 3,
                'role_add': 3,
                'channel_restriction': 3,
                
                // Low severity actions (2)
                'voice_disconnect': 2,
                'voice_move': 2,
                'reaction_remove': 2,
                
                // Informational actions (1)
                'join': 1,
                'leave': 1,
                'message': 1,
                'voice_join': 1,
                'voice_leave': 1
            };
            
            return severityMap[action.toLowerCase()] || 2; // Default to low-medium severity
            
        } catch (error) {
            console.error('Error determining action severity:', error);
            return 2; // Default to low-medium severity on error
        }
    }

    /**
     * Determines if a notification should be sent for an action based on watch level and severity
     * @param {string} watchLevel - Watch level (observe, alert, action)
     * @param {string} action - Action type
     * @param {number} severity - Action severity (1-5)
     * @returns {boolean} Whether to send notification
     */
    shouldNotifyForAction(watchLevel, action, severity) {
        try {
            console.log(watchLevel)
            switch (watchLevel) {
                case 'observe':
                    // Never notify for observe level
                    return false;
                    
                case 'alert':
                    // Notify for medium to high severity actions (3+)
                    return severity >= 3;
                    
                case 'action':
                    // Notify for all actions except the lowest severity
                    return severity >= 2;
                    
                default:
                    // Default to not notifying for unknown watch levels
                    return false;
            }
            
        } catch (error) {
            console.error('Error determining notification requirement:', error);
            return false; // Default to not notifying on error
        }
    }

    /**
     * Gets a human-readable description of action severity
     * @param {number} severity - Severity level (1-5)
     * @returns {string} Severity description
     */
    getSeverityDescription(severity) {
        const descriptions = {
            1: '🟢 Faible',
            2: '🟡 Modérée',
            3: '🟠 Moyenne',
            4: '🔴 Élevée',
            5: '🚨 Critique'
        };
        
        return descriptions[severity] || '❓ Inconnue';
    }

    /**
     * Checks if a user is on any watchlist (guild or global)
     * @param {string} userId - Discord user ID
     * @param {string} guildId - Guild ID
     * @returns {Object} Watch status with details
     */
    getWatchStatus(userId, guildId) {
        try {
            const guildEntry = this.getWatchlistEntry(userId, guildId);
            const globalEntry = this.getGlobalWatchlistEntry(userId);
            
            const onGuildWatchlist = guildEntry !== null;
            const onGlobalWatchlist = globalEntry !== null;
            
            // Determine highest watch level
            let highestWatchLevel = 'none';
            if (onGlobalWatchlist && globalEntry.watchLevel === 'action') {
                highestWatchLevel = 'action';
            } else if (onGuildWatchlist && guildEntry.watchLevel === 'action') {
                highestWatchLevel = 'action';
            } else if ((onGlobalWatchlist && globalEntry.watchLevel === 'alert') || 
                       (onGuildWatchlist && guildEntry.watchLevel === 'alert')) {
                highestWatchLevel = 'alert';
            } else if (onGlobalWatchlist || onGuildWatchlist) {
                highestWatchLevel = 'observe';
            }
            
            return {
                onGuildWatchlist,
                onGlobalWatchlist,
                onAnyWatchlist: onGuildWatchlist || onGlobalWatchlist,
                guildEntry,
                globalEntry,
                highestWatchLevel
            };
            
        } catch (error) {
            console.error('Erreur lors de la vérification du statut de surveillance:', error);
            return {
                onGuildWatchlist: false,
                onGlobalWatchlist: false,
                onAnyWatchlist: false,
                guildEntry: null,
                globalEntry: null,
                highestWatchLevel: 'none'
            };
        }
    }

    /**
     * Enhanced user join handler that checks both guild and global watchlists
     * @param {import('discord.js').GuildMember} member - The member who joined
     * @returns {Promise<Object>} Result with detection status and actions taken
     */
    async handleUserJoinEnhanced(member) {
        try {
            if (!member || !member.guild) {
                return {
                    success: false,
                    error: 'Membre ou serveur invalide'
                };
            }

            const userId = member.id;
            const guildId = member.guild.id;
            
            // Check watch status (both guild and global)
            const watchStatus = this.getWatchStatus(userId, guildId);
            
            if (!watchStatus.onAnyWatchlist) {
                return {
                    success: true,
                    watched: false,
                    message: 'Utilisateur non surveillé'
                };
            }

            // Update user info in all relevant watchlist entries
            this.updateUserInfo(userId, {
                username: member.user.username,
                discriminator: member.user.discriminator
            });

            const results = [];

            // Handle guild watchlist if present
            if (watchStatus.onGuildWatchlist) {
                const guildResult = await this.handleUserJoin(member);
                results.push({ type: 'guild', result: guildResult });
            }

            // Handle global watchlist if present
            if (watchStatus.onGlobalWatchlist) {
                const incidentResult = this.addIncident(userId, 'GLOBAL', {
                    type: 'join',
                    description: `Utilisateur surveillé globalement a rejoint le serveur ${member.guild.name}`,
                    channelId: null,
                    messageId: null
                });

                if (incidentResult.success) {
                    // Send global watchlist notification
                    await this.notifyModeratorsGlobal(guildId, userId, 'join', {
                        member,
                        watchlistEntry: watchStatus.globalEntry,
                        incident: incidentResult.incident
                    });
                }

                results.push({ 
                    type: 'global', 
                    result: { 
                        success: true, 
                        watched: true, 
                        watchLevel: watchStatus.globalEntry.watchLevel,
                        entry: watchStatus.globalEntry,
                        incident: incidentResult.incident 
                    } 
                });
            }

            console.log(`Utilisateur surveillé détecté: ${member.user.tag} (${userId}) a rejoint ${member.guild.name} - Global: ${watchStatus.onGlobalWatchlist}, Guild: ${watchStatus.onGuildWatchlist}`);

            return {
                success: true,
                watched: true,
                watchStatus,
                results,
                highestWatchLevel: watchStatus.highestWatchLevel
            };

        } catch (error) {
            console.error('Erreur lors de la gestion de la jointure avec watchlist globale:', error);
            return {
                success: false,
                error: 'Erreur interne lors de la gestion de la jointure'
            };
        }
    }

    /**
     * Gets the emoji for a watch level
     * @param {string} watchLevel - Watch level
     * @returns {string} Emoji
     */
    getWatchLevelEmoji(watchLevel) {
        switch (watchLevel) {
            case 'observe':
                return '👁️';
            case 'alert':
                return '⚠️';
            case 'action':
                return '🚨';
            default:
                return '❓';
        }
    }

    /**
     * Generates a watchlist report for moderators
     * @param {string} guildId - Guild ID
     * @returns {Promise<Object>} Report data
     */
    async generateWatchlistReport(guildId) {
        try {
            const guildWatchlist = this.getGuildWatchlist(guildId);
            const stats = this.getStats(guildId);
            
            const now = new Date();
            const last24Hours = new Date(now.getTime() - 24 * 60 * 60 * 1000);
            const lastWeek = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

            // Calculate recent activity
            let recentIncidents = 0;
            let activeUsers = 0;
            
            guildWatchlist.forEach(entry => {
                const recentActivity = entry.incidents?.filter(incident => 
                    new Date(incident.timestamp) > last24Hours
                ).length || 0;
                
                recentIncidents += recentActivity;
                
                if (entry.lastSeen && new Date(entry.lastSeen) > lastWeek) {
                    activeUsers++;
                }
            });

            const report = {
                guildId,
                generatedAt: now.toISOString(),
                summary: {
                    totalWatched: stats.active,
                    watchLevels: stats.watchLevels,
                    recentIncidents24h: recentIncidents,
                    activeUsersWeek: activeUsers
                },
                entries: guildWatchlist.map(entry => ({
                    userId: entry.userId,
                    username: entry.username,
                    watchLevel: entry.watchLevel,
                    reason: entry.reason,
                    addedAt: entry.addedAt,
                    lastSeen: entry.lastSeen,
                    incidentCount: entry.incidents?.length || 0,
                    recentIncidents: entry.incidents?.filter(incident => 
                        new Date(incident.timestamp) > last24Hours
                    ).length || 0
                }))
            };

            return {
                success: true,
                report
            };

        } catch (error) {
            console.error('Erreur lors de la génération du rapport de watchlist:', error);
            return {
                success: false,
                error: 'Erreur interne lors de la génération du rapport'
            };
        }
    }

    /**
     * Sets watchlist settings for a guild
     * @param {string} guildId - Guild ID
     * @param {Object} settings - Settings to update
     * @returns {Object} Result with success status
     */
    setWatchlistSettings(guildId, settings) {
        try {
            // This method would integrate with EnhancedGuildConfig
            // For now, we'll store basic settings in the watchlist data
            
            if (!this.watchlist._settings) {
                this.watchlist._settings = {};
            }
            
            if (!this.watchlist._settings[guildId]) {
                this.watchlist._settings[guildId] = {
                    enabled: true,
                    defaultWatchLevel: 'observe',
                    autoNotifications: true,
                    reportIntervalHours: 24
                };
            }
            
            Object.assign(this.watchlist._settings[guildId], settings);
            this.saveWatchlist();
            
            return {
                success: true,
                settings: this.watchlist._settings[guildId]
            };
            
        } catch (error) {
            console.error('Erreur lors de la mise à jour des paramètres de watchlist:', error);
            return {
                success: false,
                error: 'Erreur interne lors de la mise à jour des paramètres'
            };
        }
    }
}
