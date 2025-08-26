import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { EventEmitter } from 'events';

/**
 * Enhanced Reload System for hot reloading managers and commands
 * Extends existing CommandHandler reload functionality with state preservation,
 * configuration file watching, and component dependency tracking
 */
export class EnhancedReloadSystem extends EventEmitter {
    constructor(commandHandler, managers = {}, reportManager = null) {
        super();
        
        this.commandHandler = commandHandler;
        this.managers = managers;
        this.reportManager = reportManager;
        
        // State preservation
        this.preservedState = new Map();
        this.componentStates = new Map();
        
        // Configuration file watching
        this.configWatchers = new Map();
        this.watchedFiles = new Set();
        
        // Component dependency tracking
        this.dependencies = new Map();
        this.reloadOrder = [];
        
        // Reload history and monitoring
        this.reloadHistory = [];
        this.lastReloadTime = null;
        this.reloadInProgress = false;
        
        // Error handling and rollback
        this.rollbackStates = new Map();
        this.maxRollbackStates = 5;
        
        this.initializeDependencies();
        this.setupConfigWatching();
    }
    reload() {
        this.reloadOrder.forEach(component => {
            this.reloadComponent(component);
        });

    }
    /**
     * Initialize component dependencies for safe reload ordering
     */
    initializeDependencies() {
        // Define component dependencies (what depends on what)
        this.dependencies.set('adminManager', []);
        this.dependencies.set('guildConfig', []);
        this.dependencies.set('reportManager', []);
        this.dependencies.set('banlistManager', ['adminManager']);
        this.dependencies.set('blockedWordsManager', ['guildConfig']);
        this.dependencies.set('watchlistManager', ['reportManager']);
        this.dependencies.set('telegramIntegration', ['reportManager', 'guildConfig']);
        this.dependencies.set('funCommandsManager', ['guildConfig']);
        this.dependencies.set('commands', ['adminManager', 'guildConfig', 'reportManager']);
        
        // Calculate safe reload order using topological sort
        this.calculateReloadOrder();
    }

    /**
     * Calculate safe reload order using topological sort
     */
    calculateReloadOrder() {
        const visited = new Set();
        const visiting = new Set();
        const order = [];
        
        const visit = (component) => {
            if (visiting.has(component)) {
                throw new Error(`Circular dependency detected involving ${component}`);
            }
            if (visited.has(component)) {
                return;
            }
            
            visiting.add(component);
            const deps = this.dependencies.get(component) || [];
            
            for (const dep of deps) {
                visit(dep);
            }
            
            visiting.delete(component);
            visited.add(component);
            order.push(component);
        };
        
        for (const component of this.dependencies.keys()) {
            visit(component);
        }
        
        this.reloadOrder = order;
        console.log('[EnhancedReloadSystem] Calculated reload order:', this.reloadOrder);
    }

    /**
     * Setup configuration file watching with automatic reload triggers
     */
    setupConfigWatching() {
        const configFiles = [
            'guilds_config.json',
            'data/admins.json',
            'data/warnings.json',
            'data/blocked_words.json',
            'data/watchlist.json',
            '.env'
        ];
        
        for (const configFile of configFiles) {
            this.watchConfigFile(configFile);
        }
        
        // Watch commands directory
        this.watchDirectory('commands');
    }

    /**
     * Watch a configuration file for changes
     * @param {string} filePath - Path to the configuration file
     */
    watchConfigFile(filePath) {
        const fullPath = path.resolve(filePath);
        
        if (!fs.existsSync(fullPath)) {
            console.log(`[EnhancedReloadSystem] Config file not found, skipping watch: ${filePath}`);
            return;
        }
        
        if (this.watchedFiles.has(fullPath)) {
            return; // Already watching
        }
        
        try {
            const watcher = fs.watch(fullPath, { persistent: false }, (eventType, filename) => {
                if (eventType === 'change') {
                    console.log(`[EnhancedReloadSystem] Config file changed: ${filePath}`);
                    this.handleConfigChange(filePath);
                }
            });
            
            this.configWatchers.set(fullPath, watcher);
            this.watchedFiles.add(fullPath);
            console.log(`[EnhancedReloadSystem] Watching config file: ${filePath}`);
        } catch (error) {
            console.error(`[EnhancedReloadSystem] Failed to watch config file ${filePath}:`, error);
        }
    }

    /**
     * Watch a directory for changes
     * @param {string} dirPath - Path to the directory
     */
    watchDirectory(dirPath) {
        const fullPath = path.resolve(dirPath);
        
        if (!fs.existsSync(fullPath)) {
            console.log(`[EnhancedReloadSystem] Directory not found, skipping watch: ${dirPath}`);
            return;
        }
        
        try {
            const watcher = fs.watch(fullPath, { persistent: false, recursive: true }, (eventType, filename) => {
                if (filename && filename.endsWith('.js') && eventType === 'change') {
                    console.log(`[EnhancedReloadSystem] Command file changed: ${filename}`);
                    this.handleCommandChange(filename);
                }
            });
            
            this.configWatchers.set(fullPath, watcher);
            console.log(`[EnhancedReloadSystem] Watching directory: ${dirPath}`);
        } catch (error) {
            console.error(`[EnhancedReloadSystem] Failed to watch directory ${dirPath}:`, error);
        }
    }

    /**
     * Handle configuration file changes
     * @param {string} filePath - Path to the changed file
     */
    async handleConfigChange(filePath) {
        // Debounce rapid changes
        const debounceKey = `config_${filePath}`;
        if (this.debounceTimers && this.debounceTimers.has(debounceKey)) {
            clearTimeout(this.debounceTimers.get(debounceKey));
        }
        
        if (!this.debounceTimers) {
            this.debounceTimers = new Map();
        }
        
        this.debounceTimers.set(debounceKey, setTimeout(async () => {
            try {
                await this.reloadConfigFile(filePath);
            } catch (error) {
                console.error(`[EnhancedReloadSystem] Failed to reload config file ${filePath}:`, error);
                await this.reportError('Config Reload Failed', `Failed to reload ${filePath}: ${error.message}`);
            }
            this.debounceTimers.delete(debounceKey);
        }, 1000)); // 1 second debounce
    }

    /**
     * Handle command file changes
     * @param {string} filename - Name of the changed command file
     */
    async handleCommandChange(filename) {
        // Debounce rapid changes
        const debounceKey = `command_${filename}`;
        if (this.debounceTimers && this.debounceTimers.has(debounceKey)) {
            clearTimeout(this.debounceTimers.get(debounceKey));
        }
        
        if (!this.debounceTimers) {
            this.debounceTimers = new Map();
        }
        
        this.debounceTimers.set(debounceKey, setTimeout(async () => {
            try {
                await this.reloadCommand(filename);
            } catch (error) {
                console.error(`[EnhancedReloadSystem] Failed to reload command ${filename}:`, error);
                await this.reportError('Command Reload Failed', `Failed to reload ${filename}: ${error.message}`);
            }
            this.debounceTimers.delete(debounceKey);
        }, 1000)); // 1 second debounce
    }

    /**
     * Preserve active state before reload
     * @param {string} componentName - Name of the component
     * @param {Object} component - The component instance
     */
    preserveActiveState(componentName, component) {
        try {
            const state = {};
            
            // Preserve common state properties
            if (component.config) state.config = { ...component.config };
            if (component.data) state.data = { ...component.data };
            if (component.cache) state.cache = new Map(component.cache);
            if (component.timers) state.timers = new Map(component.timers);
            if (component.connections) state.connections = { ...component.connections };
            
            // Component-specific state preservation
            switch (componentName) {
                case 'telegramIntegration':
                    if (component.isConnected) state.isConnected = component.isConnected;
                    if (component.lastMessageId) state.lastMessageId = component.lastMessageId;
                    if (component.messageQueue) state.messageQueue = [...component.messageQueue];
                    break;
                    
                case 'funCommandsManager':
                    if (component.cooldowns) state.cooldowns = new Map(component.cooldowns);
                    if (component.scores) state.scores = { ...component.scores };
                    break;
                    
                case 'watchlistManager':
                    if (component.activeMonitoring) state.activeMonitoring = new Set(component.activeMonitoring);
                    break;
            }
            
            this.preservedState.set(componentName, state);
            console.log(`[EnhancedReloadSystem] Preserved state for ${componentName}`);
        } catch (error) {
            console.error(`[EnhancedReloadSystem] Failed to preserve state for ${componentName}:`, error);
        }
    }

    /**
     * Restore preserved state after reload
     * @param {string} componentName - Name of the component
     * @param {Object} component - The component instance
     */
    restorePreservedState(componentName, component) {
        try {
            const state = this.preservedState.get(componentName);
            if (!state) return;
            
            // Restore common state properties
            if (state.config && component.config !== undefined) {
                Object.assign(component.config, state.config);
            }
            if (state.data && component.data !== undefined) {
                Object.assign(component.data, state.data);
            }
            if (state.cache && component.cache instanceof Map) {
                component.cache = new Map(state.cache);
            }
            if (state.timers && component.timers instanceof Map) {
                component.timers = new Map(state.timers);
            }
            if (state.connections && component.connections !== undefined) {
                Object.assign(component.connections, state.connections);
            }
            
            // Component-specific state restoration
            switch (componentName) {
                case 'telegramIntegration':
                    if (state.isConnected !== undefined) component.isConnected = state.isConnected;
                    if (state.lastMessageId !== undefined) component.lastMessageId = state.lastMessageId;
                    if (state.messageQueue && component.messageQueue) {
                        component.messageQueue = [...state.messageQueue];
                    }
                    break;
                    
                case 'funCommandsManager':
                    if (state.cooldowns && component.cooldowns instanceof Map) {
                        component.cooldowns = new Map(state.cooldowns);
                    }
                    if (state.scores && component.scores) {
                        Object.assign(component.scores, state.scores);
                    }
                    break;
                    
                case 'watchlistManager':
                    if (state.activeMonitoring && component.activeMonitoring instanceof Set) {
                        component.activeMonitoring = new Set(state.activeMonitoring);
                    }
                    break;
            }
            
            console.log(`[EnhancedReloadSystem] Restored state for ${componentName}`);
            this.preservedState.delete(componentName);
        } catch (error) {
            console.error(`[EnhancedReloadSystem] Failed to restore state for ${componentName}:`, error);
        }
    }

    /**
     * Hot reload system for managers and commands with state preservation
     * @param {Array<string>} components - Components to reload (optional, defaults to all)
     * @returns {Promise<Object>} Reload result
     */
    async hotReload(components = null) {
        if (this.reloadInProgress) {
            throw new Error('Reload already in progress');
        }
        
        this.reloadInProgress = true;
        const startTime = Date.now();
        const result = {
            success: false,
            reloadedComponents: [],
            errors: [],
            duration: 0,
            timestamp: new Date().toISOString()
        };
        
        try {
            console.log('[EnhancedReloadSystem] Starting hot reload...');
            
            // Create rollback state
            await this.createRollbackState();
            
            // Determine which components to reload
            const componentsToReload = components || this.reloadOrder;
            
            // Preserve state for all components
            for (const componentName of componentsToReload) {
                const component = this.managers[componentName];
                if (component) {
                    this.preserveActiveState(componentName, component);
                }
            }
            
            // Reload components in dependency order
            for (const componentName of componentsToReload) {
                try {
                    await this.reloadComponent(componentName);
                    result.reloadedComponents.push(componentName);
                } catch (error) {
                    console.error(`[EnhancedReloadSystem] Failed to reload ${componentName}:`, error);
                    result.errors.push({
                        component: componentName,
                        error: error.message
                    });
                }
            }
            
            // Reload commands if requested or if no specific components specified
            if (!components || components.includes('commands')) {
                try {
                    const commandResult = await this.commandHandler.reloadCommands();
                    result.reloadedComponents.push('commands');
                    result.commandsAdded = commandResult.added;
                    result.commandsRemoved = commandResult.removed;
                    result.totalCommands = commandResult.total;
                } catch (error) {
                    console.error('[EnhancedReloadSystem] Failed to reload commands:', error);
                    result.errors.push({
                        component: 'commands',
                        error: error.message
                    });
                }
            }
            
            result.success = result.errors.length === 0;
            result.duration = Date.now() - startTime;
            
            // Record reload in history
            this.recordReload(result);
            
            // Emit reload event
            this.emit('reloadComplete', result);
            
            console.log(`[EnhancedReloadSystem] Hot reload completed in ${result.duration}ms`);
            
            // Report success
            if (result.success) {
                await this.reportSuccess('Hot Reload Successful', 
                    `Reloaded ${result.reloadedComponents.length} components in ${result.duration}ms`);
            }
            
            return result;
            
        } catch (error) {
            console.error('[EnhancedReloadSystem] Hot reload failed:', error);
            result.errors.push({
                component: 'system',
                error: error.message
            });
            result.duration = Date.now() - startTime;
            
            // Attempt rollback
            try {
                await this.rollback();
                await this.reportError('Hot Reload Failed (Rolled Back)', 
                    `Reload failed and was rolled back: ${error.message}`);
            } catch (rollbackError) {
                console.error('[EnhancedReloadSystem] Rollback failed:', rollbackError);
                await this.reportError('Hot Reload and Rollback Failed', 
                    `Both reload and rollback failed: ${error.message} | Rollback: ${rollbackError.message}`);
            }
            
            return result;
        } finally {
            this.reloadInProgress = false;
        }
    }

    /**
     * Reload a specific component
     * @param {string} componentName - Name of the component to reload
     */
    async reloadComponent(componentName) {
        const component = this.managers[componentName];
        if (!component) {
            console.log(`[EnhancedReloadSystem] Component ${componentName} not found, skipping`);
            return;
        }
        
        console.log(`[EnhancedReloadSystem] Reloading component: ${componentName}`);
        
        // Call component's reload method if it exists
        if (typeof component.reload === 'function') {
            await component.reload();
        } else {
            console.log(`[EnhancedReloadSystem] Component ${componentName} has no reload method`);
        }
        
        // Restore preserved state
        this.restorePreservedState(componentName, component);
    }

    /**
     * Reload a specific configuration file
     * @param {string} filePath - Path to the configuration file
     */
    async reloadConfigFile(filePath) {
        console.log(`[EnhancedReloadSystem] Reloading config file: ${filePath}`);
        
        // Determine which components need to be reloaded based on the config file
        const componentsToReload = this.getComponentsForConfigFile(filePath);
        
        if (componentsToReload.length > 0) {
            await this.hotReload(componentsToReload);
        }
    }

    /**
     * Reload a specific command
     * @param {string} filename - Name of the command file
     */
    async reloadCommand(filename) {
        const commandName = path.basename(filename, '.js');
        console.log(`[EnhancedReloadSystem] Reloading command: ${commandName}`);
        
        try {
            const commandsPath = path.resolve('commands');
            const filePath = path.join(commandsPath, filename);
            
            if (!fs.existsSync(filePath)) {
                console.log(`[EnhancedReloadSystem] Command file not found: ${filePath}`);
                return;
            }
            
            // Remove old command
            if (this.commandHandler.client.commands.has(commandName)) {
                this.commandHandler.client.commands.delete(commandName);
            }
            
            // Load new command
            await this.commandHandler.loadCommandFile(commandsPath, filename);
            
            // Update Discord commands
            await this.commandHandler.registerCommands();
            
            console.log(`[EnhancedReloadSystem] Successfully reloaded command: ${commandName}`);
        } catch (error) {
            console.error(`[EnhancedReloadSystem] Failed to reload command ${commandName}:`, error);
            throw error;
        }
    }

    /**
     * Get components that need to be reloaded for a specific config file
     * @param {string} filePath - Path to the configuration file
     * @returns {Array<string>} Components to reload
     */
    getComponentsForConfigFile(filePath) {
        const fileName = path.basename(filePath);
        const components = [];
        
        switch (fileName) {
            case 'guilds_config.json':
                components.push('guildConfig', 'blockedWordsManager', 'funCommandsManager', 'telegramIntegration');
                break;
            case 'admins.json':
                components.push('adminManager');
                break;
            case 'warnings.json':
                // WarnManager is not in managers, it's handled by CommandHandler
                break;
            case 'blocked_words.json':
                components.push('blockedWordsManager');
                break;
            case 'watchlist.json':
                components.push('watchlistManager');
                break;
            case '.env':
                // Environment changes might affect multiple components
                components.push('telegramIntegration');
                break;
        }
        
        return components;
    }

    /**
     * Create rollback state for error recovery
     */
    async createRollbackState() {
        const rollbackState = {
            timestamp: Date.now(),
            managers: new Map(),
            commands: new Map(this.commandHandler.client.commands)
        };
        
        // Save current manager states
        for (const [name, manager] of Object.entries(this.managers)) {
            if (manager && typeof manager.reload === 'function') {
                try {
                    // Create a shallow copy of the manager's important properties
                    const managerState = {};
                    if (manager.config) managerState.config = { ...manager.config };
                    if (manager.data) managerState.data = { ...manager.data };
                    rollbackState.managers.set(name, managerState);
                } catch (error) {
                    console.error(`[EnhancedReloadSystem] Failed to save rollback state for ${name}:`, error);
                }
            }
        }
        
        // Keep only the most recent rollback states
        this.rollbackStates.set(rollbackState.timestamp, rollbackState);
        
        // Clean up old rollback states
        const timestamps = Array.from(this.rollbackStates.keys()).sort((a, b) => b - a);
        if (timestamps.length > this.maxRollbackStates) {
            for (let i = this.maxRollbackStates; i < timestamps.length; i++) {
                this.rollbackStates.delete(timestamps[i]);
            }
        }
    }

    /**
     * Rollback to previous working state
     */
    async rollback() {
        const timestamps = Array.from(this.rollbackStates.keys()).sort((a, b) => b - a);
        if (timestamps.length === 0) {
            throw new Error('No rollback state available');
        }
        
        const latestTimestamp = timestamps[0];
        const rollbackState = this.rollbackStates.get(latestTimestamp);
        
        console.log(`[EnhancedReloadSystem] Rolling back to state from ${new Date(latestTimestamp).toISOString()}`);
        
        try {
            // Restore commands
            this.commandHandler.client.commands.clear();
            for (const [name, command] of rollbackState.commands) {
                this.commandHandler.client.commands.set(name, command);
            }
            
            // Restore manager states
            for (const [name, state] of rollbackState.managers) {
                const manager = this.managers[name];
                if (manager) {
                    if (state.config && manager.config) {
                        Object.assign(manager.config, state.config);
                    }
                    if (state.data && manager.data) {
                        Object.assign(manager.data, state.data);
                    }
                }
            }
            
            console.log('[EnhancedReloadSystem] Rollback completed successfully');
        } catch (error) {
            console.error('[EnhancedReloadSystem] Rollback failed:', error);
            throw error;
        }
    }

    /**
     * Record reload in history
     * @param {Object} result - Reload result
     */
    recordReload(result) {
        this.reloadHistory.push(result);
        this.lastReloadTime = result.timestamp;
        
        // Keep only the last 50 reload records
        if (this.reloadHistory.length > 50) {
            this.reloadHistory.shift();
        }
    }

    /**
     * Get reload status and history
     * @returns {Object} Status information
     */
    getStatus() {
        const lastReload = this.reloadHistory[this.reloadHistory.length - 1];
        
        return {
            lastReloadTime: this.lastReloadTime,
            reloadInProgress: this.reloadInProgress,
            totalReloads: this.reloadHistory.length,
            lastReload: lastReload ? {
                success: lastReload.success,
                duration: lastReload.duration,
                components: lastReload.reloadedComponents,
                errors: lastReload.errors
            } : null,
            watchedFiles: Array.from(this.watchedFiles),
            reloadOrder: this.reloadOrder,
            rollbackStatesAvailable: this.rollbackStates.size
        };
    }

    /**
     * Get reload history
     * @param {number} limit - Maximum number of records to return
     * @returns {Array} Reload history
     */
    getHistory(limit = 10) {
        return this.reloadHistory.slice(-limit);
    }

    /**
     * Report successful reload
     * @param {string} title - Success title
     * @param {string} description - Success description
     */
    async reportSuccess(title, description) {
        if (this.reportManager) {
            try {
                await this.reportManager.sendSystemAlert(
                    this.commandHandler.client,
                    `✅ ${title}`,
                    description,
                    [],
                    0x00ff00 // Green color
                );
            } catch (error) {
                console.error('[EnhancedReloadSystem] Failed to report success:', error);
            }
        }
    }

    /**
     * Report reload error
     * @param {string} title - Error title
     * @param {string} description - Error description
     */
    async reportError(title, description) {
        if (this.reportManager) {
            try {
                await this.reportManager.sendSystemAlert(
                    this.commandHandler.client,
                    `❌ ${title}`,
                    description,
                    [],
                    0xff0000 // Red color
                );
            } catch (error) {
                console.error('[EnhancedReloadSystem] Failed to report error:', error);
            }
        }
    }

    /**
     * Cleanup resources
     */
    cleanup() {
        // Close all file watchers
        for (const watcher of this.configWatchers.values()) {
            try {
                watcher.close();
            } catch (error) {
                console.error('[EnhancedReloadSystem] Error closing watcher:', error);
            }
        }
        
        this.configWatchers.clear();
        this.watchedFiles.clear();
        
        // Clear debounce timers
        if (this.debounceTimers) {
            for (const timer of this.debounceTimers.values()) {
                clearTimeout(timer);
            }
            this.debounceTimers.clear();
        }
        
        console.log('[EnhancedReloadSystem] Cleanup completed');
    }

    /**

     * Component isolation to prevent cascade failures
     * Wraps component methods with error boundaries
     * @param {Object} component - Component to isolate
     * @param {string} componentName - Name of the component
     * @returns {Object} Isolated component
     */
    isolateComponent(component, componentName) {
        if (!component || typeof component !== 'object') {
            return component;
        }

        const isolatedComponent = { ...component };
        const methodNames = Object.getOwnPropertyNames(Object.getPrototypeOf(component))
            .filter(name => typeof component[name] === 'function' && name !== 'constructor');

        for (const methodName of methodNames) {
            const originalMethod = component[methodName];
            
            isolatedComponent[methodName] = async (...args) => {
                try {
                    return await originalMethod.apply(component, args);
                } catch (error) {
                    console.error(`[EnhancedReloadSystem] Error in ${componentName}.${methodName}:`, error);
                    
                    // Report component error
                    await this.reportComponentError(componentName, methodName, error);
                    
                    // Return safe fallback or rethrow based on method criticality
                    if (this.isCriticalMethod(componentName, methodName)) {
                        throw error;
                    } else {
                        return this.getSafeMethodFallback(componentName, methodName);
                    }
                }
            };
        }

        return isolatedComponent;
    }

    /**
     * Check if a method is critical for component operation
     * @param {string} componentName - Name of the component
     * @param {string} methodName - Name of the method
     * @returns {boolean} True if method is critical
     */
    isCriticalMethod(componentName, methodName) {
        const criticalMethods = {
            'adminManager': ['isAdmin', 'loadAdmins'],
            'guildConfig': ['loadConfig', 'saveConfig'],
            'reportManager': ['report', 'sendSystemAlert'],
            'telegramIntegration': ['sendNotification'],
            'watchlistManager': ['isOnWatchlist', 'handleUserJoin']
        };

        const componentCriticalMethods = criticalMethods[componentName] || [];
        return componentCriticalMethods.includes(methodName);
    }

    /**
     * Get safe fallback value for non-critical methods
     * @param {string} componentName - Name of the component
     * @param {string} methodName - Name of the method
     * @returns {*} Safe fallback value
     */
    getSafeMethodFallback(componentName, methodName) {
        // Return appropriate fallback based on method type
        if (methodName.startsWith('is') || methodName.startsWith('has')) {
            return false; // Boolean methods default to false
        }
        if (methodName.startsWith('get') || methodName.startsWith('load')) {
            return null; // Getter methods default to null
        }
        if (methodName.startsWith('add') || methodName.startsWith('remove') || methodName.startsWith('save')) {
            return { success: false, message: 'Component temporarily unavailable' };
        }
        return undefined;
    }

    /**
     * Report component-specific errors
     * @param {string} componentName - Name of the component
     * @param {string} methodName - Name of the method
     * @param {Error} error - The error that occurred
     */
    async reportComponentError(componentName, methodName, error) {
        const errorInfo = {
            component: componentName,
            method: methodName,
            error: error.message,
            stack: error.stack,
            timestamp: new Date().toISOString()
        };

        // Log locally
        console.error(`[EnhancedReloadSystem] Component Error:`, errorInfo);

        // Report to Discord if available
        if (this.reportManager) {
            try {
                await this.reportManager.sendSystemAlert(
                    this.commandHandler.client,
                    `⚠️ Component Error: ${componentName}`,
                    `Method \`${methodName}\` failed with error: ${error.message}`,
                    [
                        { name: 'Component', value: componentName, inline: true },
                        { name: 'Method', value: methodName, inline: true },
                        { name: 'Error Type', value: error.constructor.name, inline: true }
                    ],
                    0xffa500 // Orange color for warnings
                );
            } catch (reportError) {
                console.error('[EnhancedReloadSystem] Failed to report component error:', reportError);
            }
        }
    }

    /**
     * Enhanced state preservation with validation
     * @param {string} componentName - Name of the component
     * @param {Object} component - The component instance
     */
    preserveActiveStateEnhanced(componentName, component) {
        try {
            const state = this.preserveActiveState(componentName, component);
            
            // Validate preserved state
            if (!this.validatePreservedState(componentName, state)) {
                console.warn(`[EnhancedReloadSystem] Invalid state preserved for ${componentName}, using defaults`);
                this.preservedState.set(componentName, this.getDefaultState(componentName));
            }
            
        } catch (error) {
            console.error(`[EnhancedReloadSystem] Enhanced state preservation failed for ${componentName}:`, error);
            
            // Set safe default state
            this.preservedState.set(componentName, this.getDefaultState(componentName));
        }
    }

    /**
     * Validate preserved state integrity
     * @param {string} componentName - Name of the component
     * @param {Object} state - The preserved state
     * @returns {boolean} True if state is valid
     */
    validatePreservedState(componentName, state) {
        if (!state || typeof state !== 'object') {
            return false;
        }

        // Component-specific validation
        switch (componentName) {
            case 'telegramIntegration':
                return typeof state.isConnected === 'boolean' || state.isConnected === undefined;
                
            case 'funCommandsManager':
                return !state.cooldowns || state.cooldowns instanceof Map;
                
            case 'watchlistManager':
                return !state.activeMonitoring || state.activeMonitoring instanceof Set;
                
            default:
                return true; // Basic validation passed
        }
    }

    /**
     * Get default state for a component
     * @param {string} componentName - Name of the component
     * @returns {Object} Default state
     */
    getDefaultState(componentName) {
        const defaultStates = {
            'telegramIntegration': {
                isConnected: false,
                messageQueue: []
            },
            'funCommandsManager': {
                cooldowns: new Map(),
                scores: {}
            },
            'watchlistManager': {
                activeMonitoring: new Set()
            }
        };

        return defaultStates[componentName] || {};
    }

    /**
     * Advanced rollback with selective component restoration
     * @param {Array<string>} componentsToRollback - Specific components to rollback (optional)
     */
    async selectiveRollback(componentsToRollback = null) {
        const timestamps = Array.from(this.rollbackStates.keys()).sort((a, b) => b - a);
        if (timestamps.length === 0) {
            throw new Error('No rollback state available');
        }

        const latestTimestamp = timestamps[0];
        const rollbackState = this.rollbackStates.get(latestTimestamp);
        
        console.log(`[EnhancedReloadSystem] Performing selective rollback to state from ${new Date(latestTimestamp).toISOString()}`);

        try {
            // Rollback commands if requested or if no specific components specified
            if (!componentsToRollback || componentsToRollback.includes('commands')) {
                this.commandHandler.client.commands.clear();
                for (const [name, command] of rollbackState.commands) {
                    this.commandHandler.client.commands.set(name, command);
                }
                console.log('[EnhancedReloadSystem] Commands rolled back');
            }

            // Rollback specific managers
            const managersToRollback = componentsToRollback || Array.from(rollbackState.managers.keys());
            
            for (const managerName of managersToRollback) {
                const state = rollbackState.managers.get(managerName);
                const manager = this.managers[managerName];
                
                if (state && manager) {
                    try {
                        if (state.config && manager.config) {
                            Object.assign(manager.config, state.config);
                        }
                        if (state.data && manager.data) {
                            Object.assign(manager.data, state.data);
                        }
                        console.log(`[EnhancedReloadSystem] Manager ${managerName} rolled back`);
                    } catch (error) {
                        console.error(`[EnhancedReloadSystem] Failed to rollback manager ${managerName}:`, error);
                        throw error;
                    }
                }
            }

            console.log('[EnhancedReloadSystem] Selective rollback completed successfully');
            
            // Report rollback success
            await this.reportSuccess('Selective Rollback Successful', 
                `Rolled back components: ${managersToRollback.join(', ')}`);
                
        } catch (error) {
            console.error('[EnhancedReloadSystem] Selective rollback failed:', error);
            await this.reportError('Selective Rollback Failed', error.message);
            throw error;
        }
    }

    /**
     * Health check for all components
     * @returns {Object} Health status of all components
     */
    async performHealthCheck() {
        const healthStatus = {
            overall: 'healthy',
            components: {},
            timestamp: new Date().toISOString(),
            issues: []
        };

        for (const [componentName, component] of Object.entries(this.managers)) {
            try {
                const componentHealth = await this.checkComponentHealth(componentName, component);
                healthStatus.components[componentName] = componentHealth;
                
                if (componentHealth.status !== 'healthy') {
                    healthStatus.overall = 'degraded';
                    healthStatus.issues.push({
                        component: componentName,
                        issue: componentHealth.issue
                    });
                }
            } catch (error) {
                healthStatus.components[componentName] = {
                    status: 'error',
                    issue: error.message
                };
                healthStatus.overall = 'unhealthy';
                healthStatus.issues.push({
                    component: componentName,
                    issue: error.message
                });
            }
        }

        // Check command handler health
        try {
            const commandsHealth = this.commandHandler.client.commands.size > 0 ? 'healthy' : 'warning';
            healthStatus.components.commands = {
                status: commandsHealth,
                commandCount: this.commandHandler.client.commands.size
            };
            
            if (commandsHealth === 'warning') {
                healthStatus.overall = 'degraded';
                healthStatus.issues.push({
                    component: 'commands',
                    issue: 'No commands loaded'
                });
            }
        } catch (error) {
            healthStatus.components.commands = {
                status: 'error',
                issue: error.message
            };
            healthStatus.overall = 'unhealthy';
        }

        return healthStatus;
    }

    /**
     * Check health of a specific component
     * @param {string} componentName - Name of the component
     * @param {Object} component - The component instance
     * @returns {Object} Component health status
     */
    async checkComponentHealth(componentName, component) {
        const health = {
            status: 'healthy',
            lastReload: null,
            issue: null
        };

        if (!component) {
            health.status = 'error';
            health.issue = 'Component not found';
            return health;
        }

        // Component-specific health checks
        switch (componentName) {
            case 'telegramIntegration':
                if (component.isConnected === false) {
                    health.status = 'warning';
                    health.issue = 'Telegram not connected';
                }
                break;
                
            case 'guildConfig':
                if (!component.config || Object.keys(component.config).length === 0) {
                    health.status = 'warning';
                    health.issue = 'No guild configurations loaded';
                }
                break;
                
            case 'adminManager':
                if (!component.admins || component.admins.length === 0) {
                    health.status = 'error';
                    health.issue = 'No administrators configured';
                }
                break;
        }

        return health;
    }

    /**
     * Emergency recovery mode - attempt to restore system to working state
     */
    async emergencyRecovery() {
        console.log('[EnhancedReloadSystem] Initiating emergency recovery...');
        
        try {
            // Stop all file watchers to prevent further issues
            this.cleanup();
            
            // Attempt rollback to last known good state
            await this.rollback();
            
            // Reinitialize critical components
            await this.reinitializeCriticalComponents();
            
            // Restart file watching
            this.setupConfigWatching();
            
            console.log('[EnhancedReloadSystem] Emergency recovery completed');
            await this.reportSuccess('Emergency Recovery Successful', 
                'System has been restored to a working state');
                
        } catch (error) {
            console.error('[EnhancedReloadSystem] Emergency recovery failed:', error);
            await this.reportError('Emergency Recovery Failed', 
                `Critical system failure: ${error.message}`);
            throw error;
        }
    }

    /**
     * Reinitialize critical components
     */
    async reinitializeCriticalComponents() {
        const criticalComponents = ['adminManager', 'guildConfig', 'reportManager'];
        
        for (const componentName of criticalComponents) {
            const component = this.managers[componentName];
            if (component && typeof component.reload === 'function') {
                try {
                    await component.reload();
                    console.log(`[EnhancedReloadSystem] Reinitialized critical component: ${componentName}`);
                } catch (error) {
                    console.error(`[EnhancedReloadSystem] Failed to reinitialize ${componentName}:`, error);
                    throw error;
                }
            }
        }
    }
}