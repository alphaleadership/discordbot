/**
 * Example integration of WatchlistManager with Discord bot
 * This shows how to integrate the watchlist monitoring system with existing bot event handlers
 */

import { WatchlistManager } from './utils/WatchlistManager.js';
import { ReportManager } from './utils/ReportManager.js';

// Example of how to integrate WatchlistManager into the main bot file

// Initialize managers (this would be done in your main bot file)
const reportManager = new ReportManager();
const watchlistManager = new WatchlistManager('data/watchlist.json', reportManager);

/**
 * Integration with guildMemberAdd event
 * Add this to your existing guildMemberAdd event handler
 */
function integrateWithGuildMemberAdd() {
    // This code should be added to your existing guildMemberAdd event handler
    // AFTER the existing banlist check

    const exampleGuildMemberAddHandler = async (member) => {
        try {
            // ... existing banlist check code ...

            // ADD THIS: Watchlist monitoring
            const watchlistResult = await watchlistManager.handleUserJoin(member);

            if (watchlistResult.success && watchlistResult.watched) {
                console.log(`[WATCHLIST] Utilisateur surveillé détecté: ${member.user.tag} (niveau: ${watchlistResult.watchLevel})`);

                // Optional: Log to console for debugging
                if (watchlistResult.watchLevel === 'action') {
                    console.log(`[WATCHLIST] ATTENTION: Utilisateur de niveau ACTION a rejoint: ${member.user.tag}`);
                }
            }

        } catch (error) {
            console.error('Erreur lors de la surveillance de watchlist (jointure):', error);
        }
    };

    return exampleGuildMemberAddHandler;
}

/**
 * Integration with messageCreate event
 * Add this to your existing messageCreate event handler
 */
function integrateWithMessageCreate() {
    // This code should be added to your existing messageCreate event handler
    // BEFORE or AFTER the existing spam/blocked words checks

    const exampleMessageCreateHandler = async (message) => {
        // Skip bot messages
        if (message.author.bot) return;

        try {
            // ... existing message processing code ...

            // ADD THIS: Watchlist monitoring
            const watchlistResult = await watchlistManager.handleUserMessage(message);

            if (watchlistResult.success && watchlistResult.watched) {
                // Optional: Add additional logging or actions based on watch level
                if (watchlistResult.watchLevel === 'action') {
                    console.log(`[WATCHLIST] Message d'un utilisateur ACTION surveillé: ${message.author.tag} dans #${message.channel.name}`);
                }
            }

        } catch (error) {
            console.error('Erreur lors de la surveillance de watchlist (message):', error);
        }
    };

    return exampleMessageCreateHandler;
}

/**
 * Integration with warning/moderation actions
 * Call this when issuing warnings or taking moderation actions
 */
async function integrateWithModerationActions(userId, guildId, actionType, actionData) {
    try {
        const watchlistResult = await watchlistManager.handleUserAction(userId, guildId, actionType, actionData);

        if (watchlistResult.success && watchlistResult.watched) {
            console.log(`[WATCHLIST] Action de modération sur utilisateur surveillé: ${userId} (${actionType})`);
        }

        return watchlistResult;
    } catch (error) {
        console.error('Erreur lors de la surveillance de watchlist (action):', error);
        return { success: false, error: error.message };
    }
}

/**
 * Example of how to modify existing warning system to integrate with watchlist
 */
function integrateWithWarnManager(warnManager) {
    // Store original addWarn method
    const originalAddWarn = warnManager.addWarn.bind(warnManager);

    // Override addWarn to include watchlist monitoring
    warnManager.addWarn = function (userId, reason, moderatorId = 'système') {
        // Call original method
        const result = originalAddWarn(userId, reason, moderatorId);

        // Add watchlist monitoring
        // Note: You'll need to get guildId from context
        const guildId = this.currentGuildId; // You'll need to set this appropriately

        if (guildId) {
            integrateWithModerationActions(userId, guildId, 'warning', {
                description: `Avertissement: ${reason}`,
                moderatorId: moderatorId
            }).catch(console.error);
        }

        return result;
    };
}

/**
 * Example command to manually check watchlist status
 */
function createWatchlistStatusCommand() {
    return {
        name: 'watchlist-status',
        description: 'Vérifie le statut de surveillance d\'un utilisateur',
        options: [
            {
                name: 'user',
                description: 'Utilisateur à vérifier',
                type: 6, // USER type
                required: true
            }
        ],
        async execute(interaction) {
            try {
                const user = interaction.options.getUser('user');
                const guildId = interaction.guild.id;

                const entry = watchlistManager.getWatchlistEntry(user.id, guildId);

                if (!entry) {
                    await interaction.reply({
                        content: `${user.tag} n'est pas sur la liste de surveillance.`,
                        ephemeral: true
                    });
                    return;
                }

                const { EmbedBuilder } = await import('discord.js');
                const embed = new EmbedBuilder()
                    .setColor(watchlistManager.getWatchLevelColor(entry.watchLevel))
                    .setTitle(`${watchlistManager.getWatchLevelEmoji(entry.watchLevel)} Statut de surveillance`)
                    .setDescription(`Informations sur ${user.tag}`)
                    .addFields(
                        { name: 'Niveau de surveillance', value: entry.watchLevel, inline: true },
                        { name: 'Raison', value: entry.reason, inline: false },
                        { name: 'Ajouté le', value: new Date(entry.addedAt).toLocaleString('fr-FR'), inline: true },
                        { name: 'Incidents', value: (entry.incidents?.length || 0).toString(), inline: true },
                        { name: 'Notes', value: (entry.notes?.length || 0).toString(), inline: true }
                    )
                    .setThumbnail(user.displayAvatarURL({ dynamic: true }))
                    .setTimestamp();

                if (entry.lastSeen) {
                    embed.addFields({
                        name: 'Dernière activité',
                        value: new Date(entry.lastSeen).toLocaleString('fr-FR'),
                        inline: true
                    });
                }

                await interaction.reply({ embeds: [embed], ephemeral: true });

            } catch (error) {
                console.error('Erreur lors de la vérification du statut de watchlist:', error);
                await interaction.reply({
                    content: 'Une erreur est survenue lors de la vérification du statut.',
                    ephemeral: true
                });
            }
        }
    };
}

/**
 * Example of how to add watchlist monitoring to CommandHandler
 */
function integrateWithCommandHandler(commandHandler) {
    // Add the watchlist status command
    const watchlistStatusCommand = createWatchlistStatusCommand();
    commandHandler.commands.set(watchlistStatusCommand.name, watchlistStatusCommand);

    console.log('Commande watchlist-status ajoutée au CommandHandler');
}

// Export integration functions
export {
    integrateWithGuildMemberAdd,
    integrateWithMessageCreate,
    integrateWithModerationActions,
    integrateWithWarnManager,
    integrateWithCommandHandler,
    createWatchlistStatusCommand
};

// Example usage in main bot file:
/*
// In your main bot file (index.js), after initializing managers:

import { 
    integrateWithGuildMemberAdd, 
    integrateWithMessageCreate,
    integrateWithCommandHandler 
} from './watchlist-integration-example.js';

// Initialize watchlist manager
const watchlistManager = new WatchlistManager('data/watchlist.json', reportManager);

// Modify existing guildMemberAdd event handler
client.on('guildMemberAdd', async member => {
    try {
        // ... existing banlist check code ...
        
        // Add watchlist monitoring
        const watchlistResult = await watchlistManager.handleUserJoin(member);
        if (watchlistResult.success && watchlistResult.watched) {
            console.log(`[WATCHLIST] Utilisateur surveillé détecté: ${member.user.tag}`);
        }
        
    } catch (error) {
        console.error('Erreur lors de la vérification de la banlist/watchlist:', error);
    }
});

// Modify existing messageCreate event handler
client.on('messageCreate', async message => {
    if (message.author.bot) return;
    
    // ... existing message processing code ...
    
    // Add watchlist monitoring
    try {
        const watchlistResult = await watchlistManager.handleUserMessage(message);
        if (watchlistResult.success && watchlistResult.watched && watchlistResult.watchLevel === 'action') {
            console.log(`[WATCHLIST] Message d'un utilisateur ACTION: ${message.author.tag}`);
        }
    } catch (error) {
        console.error('Erreur lors de la surveillance de watchlist:', error);
    }
    
    // ... rest of existing message processing ...
});

// Add watchlist commands to command handler
integrateWithCommandHandler(commandHandler);
*/

console.log('📋 Watchlist integration examples loaded');
console.log('💡 See comments in this file for integration instructions');