import { Collection } from 'discord.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

export class CommandHandler {
    constructor(client, adminManager, warnManager, guildConfig, sharedConfig, backupToGitHub, reportManager, banlistManager, blockedWordsManager, watchlistManager, telegramIntegration, funCommandsManager, raidDetector, doxDetector, enhancedReloadSystem, permissionValidator) {
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
            
            if ('data' in command && 'execute' in command) {
                this.client.commands.set(command.data.name, command);
                console.log(`[INFO] Commande chargée: ${command.data.name}`);
            } else {
                console.log(`[WARNING] La commande dans ${filePath} manque une propriété "data" ou "execute" requise.`);
            }
        } catch (error) {
            console.error(`[ERREUR] Erreur lors du chargement de la commande ${file}:`, error);
        }
    }

    

    async registerCommands() {
        const commands = this.client.commands.map(cmd => cmd.data.toJSON());

        try {
            console.log('Started refreshing application (/) commands.');
            await this.client.application.commands.set(commands);
            console.log('Successfully reloaded application (/) commands.');
            // Afficher les commandes enregistrées
            const commandList = await this.client.application.commands.fetch();
            console.log('Commandes disponibles sur le serveur Discord:');
            commandList.forEach(cmd => {
                console.log(`- /${cmd.name} (ID: ${cmd.id})`);
            });
        } catch (error) {
            console.error(error);
        }
    }

    async reloadCommands() {
        console.log('Reloading commands and managers...');
        const previousCommands = new Set(this.client.commands.keys());
        this.client.commands.clear();
        await this.loadCommands();
        await this.registerCommands();

        // Reload managers
        this.adminManager.reload();
        this.warnManager.reload();
        this.guildConfig.reload();
        this.reportManager.reload();
        this.banlistManager.reload();
        this.blockedWordsManager.reload();
        if (this.watchlistManager) {
            this.watchlistManager.reload();
        }
        if (this.funCommandsManager) {
            this.funCommandsManager.reload();
        }
        if (this.raidDetector && this.raidDetector.reload) {
            this.raidDetector.reload();
        }
        if (this.doxDetector && this.doxDetector.reload) {
            this.doxDetector.reload();
        }
        if (this.enhancedReloadSystem && this.enhancedReloadSystem.reload) {
            this.enhancedReloadSystem.reload();
        }

        // Calculer les commandes ajoutées et supprimées
        const currentCommands = new Set(this.client.commands.keys());
        const added = [...currentCommands].filter(cmd => !previousCommands.has(cmd));
        const removed = [...previousCommands].filter(cmd => !currentCommands.has(cmd));

        console.log('Commands and managers reloaded successfully.');
        
        return {
            success: true,
            added,
            removed,
            total: currentCommands.size
        };
    }

    async handleCommand(interaction) {
        if (!interaction.isCommand()) return;

        const command = this.client.commands.get(interaction.commandName);

        if (!command) {
            console.error(`No command matching ${interaction.commandName} was found.`);
            return;
        }

        try {
            await command.execute(interaction, this.adminManager, this.warnManager, this.guildConfig, this.sharedConfig, this.backupToGitHub, this.reportManager, this.banlistManager, this.blockedWordsManager, this.watchlistManager, this.telegramIntegration, this.funCommandsManager, this.raidDetector, this.doxDetector, this.enhancedReloadSystem, this.permissionValidator);
        } catch (error) {
            console.error(error);
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp({ content: 'There was an error while executing this command!', ephemeral: true });
            } else {
                await interaction.reply({ content: 'There was an error while executing this command!', ephemeral: true });
            }
        }
    }
}