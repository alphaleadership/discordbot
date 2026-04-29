import { Collection } from 'discord.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

export class CommandHandler {
    constructor(client, adminManager, warnManager, guildConfig, sharedConfig, backupToGitHub, reportManager, banlistManager, blockedWordsManager, watchlistManager, telegramIntegration, funCommandsManager, raidDetector, doxDetector, enhancedReloadSystem, permissionValidator, economyManager, forumReportManager, autoConfigManager,dmTicketManager) {
        this.client = client;
        this.client.commands = new Collection();
        this.adminManager = adminManager;
        this.warnManager = warnManager;
        this.guildConfig = guildConfig;
        this.sharedConfig = sharedConfig;
        this.backupToGitHub = backupToGitHub;
        this.reportManager = reportManager;
        this.banlistManager = banlistManager;
        this.blockedWordsManager = blockedWordsManager;
        this.watchlistManager = watchlistManager;
        this.telegramIntegration = telegramIntegration;
        this.funCommandsManager = funCommandsManager;
        this.raidDetector = raidDetector;
        this.doxDetector = doxDetector;
        this.enhancedReloadSystem = enhancedReloadSystem;
        this.permissionValidator = permissionValidator;
        this.economyManager = economyManager;
        this.forumReportManager = forumReportManager;
        this.autoConfigManager = autoConfigManager;
        this.dmTicketManager = dmTicketManager;
    }
    async loadCommands() {
        const __filename = fileURLToPath(import.meta.url);
        const __dirname = path.dirname(__filename);
        const commandsPath = path.join(__dirname, '..', 'commands');
        const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

        for (const file of commandFiles) {
            await this.loadCommandFile(commandsPath, file);
        }
    }

    async loadCommandFile(commandsPath, file) {
        try {
            const filePath = path.join(commandsPath, file);
            // Invalider le cache du module
            const modulePath = pathToFileURL(filePath).href;
            if (import.meta.url === modulePath) return; // Ne pas recharger le gestionnaire de commandes

            // Importer la commande
            const command = (await import(modulePath + '?t=' + Date.now())).default;
            console.log(command)
            if ('data' in command && 'execute' in command) {
                // Validate command data structure
                if (!command.data.name) {
                    console.log(`[WARNING] La commande dans ${filePath} n'a pas de nom défini.`);
                    return;
                }

                // Check for duplicate commands
                if (this.client.commands.has(command.data.name)) {
                    console.log(`[WARNING] Commande dupliquée détectée: ${command.data.name} (fichier: ${file})`);
                }

                this.client.commands.set(command.data.name, command);
                console.log(`[INFO] Commande chargée: ${command.data.name} (${file})`);

                // Log command type for debugging
                if (this.isModerationCommand(command.data.name)) {
                    console.log(`[INFO] Commande de modération enregistrée: ${command.data.name}`);
                }
                if (this.isWatchlistCommand(command.data.name)) {
                    console.log(`[INFO] Commande de surveillance enregistrée: ${command.data.name}`);
                }
            } else {
                console.log(`[WARNING] La commande dans ${filePath} manque une propriété "data" ou "execute" requise.`);
            }
        } catch (error) {
            console.error(`[ERREUR] Erreur lors du chargement de la commande ${file}:`, error);
            // Log more details about the error for debugging
            if (error.code === 'ERR_MODULE_NOT_FOUND') {
                console.error(`[ERREUR] Module non trouvé pour ${file}. Vérifiez les imports.`);
            } else if (error instanceof SyntaxError) {
                console.error(`[ERREUR] Erreur de syntaxe dans ${file}:`, error.message);
            }
        }
    }



    /**
     * Validate that all required commands are loaded
     * @returns {object} Validation result
     */
    validateRequiredCommands() {
        const requiredModerationCommands = ['ban', 'kick', 'timeout', 'clear', 'unban'];
        const requiredGlobalWatchlistCommands = [
            'global-watchlist-add', 'global-watchlist-remove',
            'global-watchlist-list', 'global-watchlist-info'
        ];
        const requiredWatchlistCommands = [
            'watchlist-add', 'watchlist-remove', 'watchlist-list',
            'watchlist-info', 'watchlist-note'
        ];
      

        const loadedCommands = Array.from(this.client.commands.keys());
        const missingModeration = requiredModerationCommands.filter(cmd => !loadedCommands.includes(cmd));
        const missingWatchlist = requiredWatchlistCommands.filter(cmd => !loadedCommands.includes(cmd));
        const missingGlobalWatchlist = requiredGlobalWatchlistCommands.filter(cmd => !loadedCommands.includes(cmd));

        const allMissing = [...missingModeration, ...missingWatchlist, ...missingGlobalWatchlist];

        return {
            success: allMissing.length === 0,
            missingCommands: allMissing,
            missingModeration,
            missingWatchlist,
            missingGlobalWatchlist,
            loadedCommands: loadedCommands.length,
            requiredCommands: requiredModerationCommands.length + requiredWatchlistCommands.length + requiredGlobalWatchlistCommands.length
        };
    }

    async registerCommands() {
        // Validate required commands before registration
        const validation = this.validateRequiredCommands();
        if (!validation.success) {
            console.warn(`[WARNING] Commandes manquantes détectées:`, validation.missingCommands);
            if (validation.missingModeration.length > 0) {
                console.warn(`[WARNING] Commandes de modération manquantes:`, validation.missingModeration);
            }
            if (validation.missingWatchlist.length > 0) {
                console.warn(`[WARNING] Commandes de surveillance manquantes:`, validation.missingWatchlist);
            }
            if (validation.missingGlobalWatchlist.length > 0) {
                console.warn(`[WARNING] Commandes de surveillance globale manquantes:`, validation.missingGlobalWatchlist);
            }
        }

        const commands = this.client.commands.map(cmd => cmd.data.toJSON());

        try {
            console.log(`[INFO] Début de l'actualisation des commandes (/) - ${commands.length} commandes à enregistrer.`);

            await this.client.application.commands.set(commands);

            console.log(`[INFO] Commandes (/) actualisées avec succès - ${commands.length} commandes enregistrées.`);

            // Display command statistics
            const stats = this.getCommandStats();
            console.log(`[INFO] Statistiques des commandes:`);
            console.log(`  - Total: ${stats.total}`);
            console.log(`  - Modération: ${stats.moderation} (${stats.moderationCommands.join(', ')})`);
            console.log(`  - Surveillance: ${stats.watchlist} (${stats.watchlistCommands.join(', ')})`);
            console.log(`  - Autres: ${stats.other}`);

            // Fetch and display registered commands
            const commandList = await this.client.application.commands.fetch();
            console.log(`[INFO] Commandes disponibles sur Discord (${commandList.size}):`);
            commandList.forEach(cmd => {
                const type = this.isModerationCommand(cmd.name) ? '[MOD]' :
                    this.isWatchlistCommand(cmd.name) ? '[WATCH]' : '[OTHER]';
                console.log(`  ${type} /${cmd.name} (ID: ${cmd.id})`);
            });

            return {
                success: true,
                registered: commands.length,
                validation
            };

        } catch (error) {
            console.error(`[ERREUR] Échec de l'enregistrement des commandes:`, error);

            // Log registration error
            if (this.reportManager && this.reportManager.moderationLogger) {
                await this.reportManager.moderationLogger.logError('command-registration', error, {
                    commandCount: commands.length,
                    validation
                });
            }

            return {
                success: false,
                error: error.message,
                validation
            };
        }
    }

    async reloadCommands() {
        console.log('[INFO] Rechargement des commandes et gestionnaires...');

        const previousCommands = new Set(this.client.commands.keys());
        const previousStats = this.getCommandStats();

        // Clear and reload commands
        this.client.commands.clear();
        await this.loadCommands();
        const registrationResult = await this.registerCommands();

        // Reload managers with error handling
        const managerReloadResults = {};

        try {
            this.adminManager.reload();
            managerReloadResults.adminManager = 'success';
        } catch (error) {
            console.error('[ERREUR] Échec du rechargement AdminManager:', error);
            managerReloadResults.adminManager = 'failed';
        }

        try {
            this.warnManager.reload();
            managerReloadResults.warnManager = 'success';
        } catch (error) {
            console.error('[ERREUR] Échec du rechargement WarnManager:', error);
            managerReloadResults.warnManager = 'failed';
        }

        try {
            this.guildConfig.reload();
            managerReloadResults.guildConfig = 'success';
        } catch (error) {
            console.error('[ERREUR] Échec du rechargement GuildConfig:', error);
            managerReloadResults.guildConfig = 'failed';
        }

        try {
            this.reportManager.reload();
            managerReloadResults.reportManager = 'success';
        } catch (error) {
            console.error('[ERREUR] Échec du rechargement ReportManager:', error);
            managerReloadResults.reportManager = 'failed';
        }

        try {
            this.banlistManager.reload();
            managerReloadResults.banlistManager = 'success';
        } catch (error) {
            console.error('[ERREUR] Échec du rechargement BanlistManager:', error);
            managerReloadResults.banlistManager = 'failed';
        }

        try {
            this.blockedWordsManager.reload();
            managerReloadResults.blockedWordsManager = 'success';
        } catch (error) {
            console.error('[ERREUR] Échec du rechargement BlockedWordsManager:', error);
            managerReloadResults.blockedWordsManager = 'failed';
        }

        if (this.watchlistManager) {
            try {
                this.watchlistManager.reload();
                managerReloadResults.watchlistManager = 'success';
            } catch (error) {
                console.error('[ERREUR] Échec du rechargement WatchlistManager:', error);
                managerReloadResults.watchlistManager = 'failed';
            }
        } else {
            managerReloadResults.watchlistManager = 'not_available';
        }

        if (this.funCommandsManager) {
            try {
                this.funCommandsManager.reload();
                managerReloadResults.funCommandsManager = 'success';
            } catch (error) {
                console.error('[ERREUR] Échec du rechargement FunCommandsManager:', error);
                managerReloadResults.funCommandsManager = 'failed';
            }
        } else {
            managerReloadResults.funCommandsManager = 'not_available';
        }

        if (this.raidDetector && this.raidDetector.reload) {
            try {
                this.raidDetector.reload();
                managerReloadResults.raidDetector = 'success';
            } catch (error) {
                console.error('[ERREUR] Échec du rechargement RaidDetector:', error);
                managerReloadResults.raidDetector = 'failed';
            }
        } else {
            managerReloadResults.raidDetector = 'not_available';
        }

        if (this.doxDetector && this.doxDetector.reload) {
            try {
                this.doxDetector.reload();
                managerReloadResults.doxDetector = 'success';
            } catch (error) {
                console.error('[ERREUR] Échec du rechargement DoxDetector:', error);
                managerReloadResults.doxDetector = 'failed';
            }
        } else {
            managerReloadResults.doxDetector = 'not_available';
        }

        if (this.enhancedReloadSystem && this.enhancedReloadSystem.reload) {
            try {
                this.enhancedReloadSystem.reload();
                managerReloadResults.enhancedReloadSystem = 'success';
            } catch (error) {
                console.error('[ERREUR] Échec du rechargement EnhancedReloadSystem:', error);
                managerReloadResults.enhancedReloadSystem = 'failed';
            }
        } else {
            managerReloadResults.enhancedReloadSystem = 'not_available';
        }

        // Calculate command changes
        const currentCommands = new Set(this.client.commands.keys());
        const added = [...currentCommands].filter(cmd => !previousCommands.has(cmd));
        const removed = [...previousCommands].filter(cmd => !currentCommands.has(cmd));
        const currentStats = this.getCommandStats();

        // Log reload summary
        console.log('[INFO] Rechargement terminé:');
        console.log(`  - Commandes ajoutées: ${added.length} (${added.join(', ') || 'aucune'})`);
        console.log(`  - Commandes supprimées: ${removed.length} (${removed.join(', ') || 'aucune'})`);
        console.log(`  - Total des commandes: ${currentCommands.size} (était ${previousCommands.size})`);
        console.log(`  - Modération: ${currentStats.moderation} (était ${previousStats.moderation})`);
        console.log(`  - Surveillance: ${currentStats.watchlist} (était ${previousStats.watchlist})`);

        // Log manager reload results
        const failedManagers = Object.entries(managerReloadResults)
            .filter(([_, status]) => status === 'failed')
            .map(([name, _]) => name);

        if (failedManagers.length > 0) {
            console.warn(`[WARNING] Gestionnaires ayant échoué au rechargement: ${failedManagers.join(', ')}`);
        }

        console.log('[INFO] Commandes et gestionnaires rechargés avec succès.');

        return {
            success: registrationResult.success,
            added,
            removed,
            total: currentCommands.size,
            previousTotal: previousCommands.size,
            stats: currentStats,
            previousStats,
            managerReloadResults,
            registrationResult,
            failedManagers
        };
    }

    /**
     * Check if a command is a moderation command
     * @param {string} commandName - The command name
     * @returns {boolean} True if it's a moderation command
     */
    isModerationCommand(commandName) {
        const moderationCommands = ['ban', 'kick', 'timeout', 'clear', 'unban', 'warn', 'clearwarns', 'admin'];
        return moderationCommands.includes(commandName);
    }

    /**
     * Check if a command is a watchlist command
     * @param {string} commandName - The command name
     * @returns {boolean} True if it's a watchlist command
     */
    isWatchlistCommand(commandName) {
        const watchlistCommands = [
            'watchlist-add', 'watchlist-remove', 'watchlist-list',
            'watchlist-info', 'watchlist-note', 'watchlist-status',
            'watchlist-validate',
            'global-watchlist-add', 'global-watchlist-remove',
            'global-watchlist-list', 'global-watchlist-info'
        ];
        return watchlistCommands.includes(commandName);
    }

    /**
     * Get command statistics
     * @returns {object} Command statistics
     */
    getCommandStats() {
        const commands = Array.from(this.client.commands.keys());
        const moderationCommands = commands.filter(cmd => this.isModerationCommand(cmd));
        const watchlistCommands = commands.filter(cmd => this.isWatchlistCommand(cmd));

        return {
            total: commands.length,
            moderation: moderationCommands.length,
            watchlist: watchlistCommands.length,
            other: commands.length - moderationCommands.length - watchlistCommands.length,
            moderationCommands,
            watchlistCommands
        };
    }

    async handleCommand(interaction) {
        if (!interaction.isCommand()) return;

        const command = this.client.commands.get(interaction.commandName);

        if (!command) {
            console.error(`[ERREUR] Aucune commande correspondant à ${interaction.commandName} n'a été trouvée.`);

            // Log missing command attempt
            if (this.reportManager && this.reportManager.moderationLogger) {
                await this.reportManager.moderationLogger.logError('command-not-found', new Error(`Command not found: ${interaction.commandName}`), {
                    userId: interaction.user.id,
                    userTag: interaction.user.tag,
                    guildId: interaction.guild?.id,
                    guildName: interaction.guild?.name,
                    commandName: interaction.commandName
                });
            }

            return;
        }

        try {
            // Log command execution for moderation and watchlist commands
            if (this.isModerationCommand(interaction.commandName) || this.isWatchlistCommand(interaction.commandName)) {
                console.log(`[INFO] Exécution de la commande ${interaction.commandName} par ${interaction.user.tag} (${interaction.user.id}) sur ${interaction.guild?.name || 'DM'}`);
            }

            // Validate required managers for specific command types
            if (this.isModerationCommand(interaction.commandName) && !this.permissionValidator) {
                throw new Error('PermissionValidator requis pour les commandes de modération');
            }

            if (this.isWatchlistCommand(interaction.commandName) && !this.watchlistManager) {
                throw new Error('WatchlistManager requis pour les commandes de surveillance');
            }

            await command.execute(
                interaction,
                this.adminManager,
                this.warnManager,
                this.guildConfig,
                this.sharedConfig,
                this.backupToGitHub,
                this.reportManager,
                this.banlistManager,
                this.blockedWordsManager,
                this.watchlistManager,
                this.telegramIntegration,
                this.funCommandsManager,
                this.raidDetector,
                this.doxDetector,
                this.enhancedReloadSystem,
                this.permissionValidator,
                this.economyManager,
                this.forumReportManager,
                this.autoConfigManager,
                this.dmTicketManager
            );

        } catch (error) {
            console.error(`[ERREUR] Erreur lors de l'exécution de la commande ${interaction.commandName}:`, error);

            // Log command execution error
            if (this.reportManager && this.reportManager.moderationLogger) {
                await this.reportManager.moderationLogger.logError(`command-execution-${interaction.commandName}`, error, {
                    userId: interaction.user.id,
                    userTag: interaction.user.tag,
                    guildId: interaction.guild?.id,
                    guildName: interaction.guild?.name,
                    commandName: interaction.commandName
                });
            }

            // Provide user-friendly error messages
            let errorMessage = 'Une erreur est survenue lors de l\'exécution de cette commande !';

            if (error.message.includes('PermissionValidator')) {
                errorMessage = '❌ Système de validation des permissions indisponible. Contactez un administrateur.';
            } else if (error.message.includes('WatchlistManager')) {
                errorMessage = '❌ Système de surveillance indisponible. Contactez un administrateur.';
            } else if (error.code === 50013) {
                errorMessage = '❌ Permissions insuffisantes pour exécuter cette commande.';
            } else if (error.code === 50001) {
                errorMessage = '❌ Accès manquant pour effectuer cette action.';
            }

            try {
                if (interaction.replied || interaction.deferred) {
                    await interaction.followUp({
                        content: errorMessage,
                        ephemeral: true
                    });
                } else {
                    await interaction.reply({
                        content: errorMessage,
                        ephemeral: true
                    });
                }
            } catch (replyError) {
                console.error(`[ERREUR] Impossible de répondre à l'interaction:`, replyError);
            }
        }
    }
}