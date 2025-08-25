
import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

export default {
    data: new SlashCommandBuilder()
        .setName('reload')
        .setDescription('Recharger les commandes et composants (Admin uniquement)')
        .addStringOption(option =>
            option.setName('component')
                .setDescription('Composant spécifique à recharger')
                .setRequired(false)
                .addChoices(
                    { name: 'Toutes les commandes', value: 'commands' },
                    { name: 'Gestionnaire d\'admins', value: 'adminManager' },
                    { name: 'Configuration des serveurs', value: 'guildConfig' },
                    { name: 'Gestionnaire de rapports', value: 'reportManager' },
                    { name: 'Gestionnaire de banlist', value: 'banlistManager' },
                    { name: 'Gestionnaire de mots bloqués', value: 'blockedWordsManager' },
                    { name: 'Gestionnaire de watchlist', value: 'watchlistManager' },
                    { name: 'Intégration Telegram', value: 'telegramIntegration' },
                    { name: 'Commandes amusantes', value: 'funCommandsManager' },
                    { name: 'Tout recharger', value: 'all' }
                )
        )
        .addStringOption(option =>
            option.setName('commande')
                .setDescription('Nom de la commande spécifique à recharger (optionnel)')
                .setRequired(false)
        ),
    async execute(interaction, adminManager, warnManager, guildConfig, sharedConfig, backupToGitHub, reportManager, banlistManager, blockedWordsManager, watchlistManager, telegramIntegration, funCommandsManager, enhancedReloadSystem) {
        // Vérifier les permissions administrateur
        if (!adminManager.isAdmin(interaction.user.id)) {
            return interaction.reply({
                content: '❌ Seuls les administrateurs peuvent utiliser cette commande.',
                ephemeral: true
            });
        }

        const component = interaction.options.getString('component');
        const commandName = interaction.options.getString('commande');
        
        try {
            let result;
            
            // Use enhanced reload system if available
            if (enhancedReloadSystem) {
                await interaction.deferReply({ ephemeral: true });
                
                if (commandName) {
                    // Reload specific command using enhanced system
                    await enhancedReloadSystem.reloadCommand(`${commandName}.js`);
                    result = {
                        success: true,
                        reloadedComponents: [commandName],
                        duration: 0,
                        errors: []
                    };
                } else if (component) {
                    // Reload specific component or all
                    const componentsToReload = component === 'all' ? null : [component];
                    result = await enhancedReloadSystem.hotReload(componentsToReload);
                } else {
                    // Default: reload all
                    result = await enhancedReloadSystem.hotReload();
                }
                
                // Create enhanced response embed
                const embed = new EmbedBuilder()
                    .setColor(result.success ? '#2ecc71' : '#e74c3c')
                    .setTitle(result.success ? '✅ Rechargement réussi' : '❌ Rechargement échoué')
                    .setDescription(result.success ? 
                        'Les composants ont été rechargés avec succès !' : 
                        'Certains composants n\'ont pas pu être rechargés.')
                    .addFields(
                        { name: 'Composants rechargés', value: result.reloadedComponents.length > 0 ? result.reloadedComponents.join(', ') : 'Aucun', inline: true },
                        { name: 'Durée', value: `${result.duration}ms`, inline: true },
                        { name: 'Erreurs', value: result.errors.length.toString(), inline: true }
                    );
                
                if (result.totalCommands !== undefined) {
                    embed.addFields(
                        { name: 'Commandes chargées', value: result.totalCommands.toString(), inline: true }
                    );
                }
                
                if (result.errors.length > 0) {
                    const errorDetails = result.errors.slice(0, 3).map(err => 
                        `**${err.component}**: ${err.error}`
                    ).join('\n');
                    embed.addFields(
                        { name: 'Détails des erreurs', value: errorDetails }
                    );
                }
                
                embed.setTimestamp();
                await interaction.editReply({ embeds: [embed] });
                
            } else {
                // Fallback to legacy reload system
                if (commandName) {
                    // Recharger une commande spécifique
                    const __filename = fileURLToPath(import.meta.url);
                    const __dirname = path.dirname(__filename);
                    const commandsPath = path.join(__dirname, '..', 'commands');
                    const filePath = path.join(commandsPath, `${commandName}.js`);
                    
                    if (!fs.existsSync(filePath)) {
                        return interaction.reply({
                            content: `❌ Aucune commande nommée "${commandName}" n'a été trouvée.`,
                            ephemeral: true
                        });
                    }
                    
                    // Get command handler from interaction context
                    const commandHandler = interaction.client.commandHandler;
                    
                    // Supprimer l'ancienne commande si elle existe
                    if (commandHandler.client.commands.has(commandName)) {
                        commandHandler.client.commands.delete(commandName);
                    }
                    
                    // Charger la nouvelle version
                    await commandHandler.loadCommandFile(commandsPath, `${commandName}.js`);
                    
                    // Mettre à jour les commandes Discord
                    await commandHandler.registerCommands();
                    
                    result = {
                        success: true,
                        added: commandHandler.client.commands.has(commandName) ? [commandName] : [],
                        removed: [],
                        total: commandHandler.client.commands.size
                    };
                } else {
                    // Recharger toutes les commandes
                    const commandHandler = interaction.client.commandHandler;
                    result = await commandHandler.reloadCommands();
                }
                
                // Créer un embed pour la réponse
                const embed = new EmbedBuilder()
                    .setColor('#2ecc71')
                    .setTitle('🔁 Rechargement des commandes')
                    .setDescription('Les commandes ont été rechargées avec succès !')
                    .addFields(
                        { name: 'Commandes chargées', value: result.total.toString(), inline: true },
                        { name: 'Nouvelles commandes', value: result.added.length > 0 ? result.added.join(', ') : 'Aucune', inline: true },
                        { name: 'Commandes supprimées', value: result.removed.length > 0 ? result.removed.join(', ') : 'Aucune', inline: true }
                    )
                    .setTimestamp();
                    
                await interaction.reply({ embeds: [embed], ephemeral: true });
            }
            
        } catch (error) {
            console.error('Erreur lors du rechargement:', error);
            
            const errorEmbed = new EmbedBuilder()
                .setColor('#e74c3c')
                .setTitle('❌ Erreur de rechargement')
                .setDescription('Une erreur est survenue lors du rechargement.')
                .addFields(
                    { name: 'Détails', value: `\`\`\`${error.message.substring(0, 1000)}\`\`\`` }
                )
                .setTimestamp();
            
            if (interaction.deferred) {
                await interaction.editReply({ embeds: [errorEmbed] });
            } else {
                await interaction.reply({ embeds: [errorEmbed], ephemeral: true });
            }
        }
    },
};

// Helper pour obtenir le chemin du fichier

