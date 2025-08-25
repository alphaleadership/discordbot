import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';

export default {
    data: new SlashCommandBuilder()
        .setName('fun-config')
        .setDescription('Configure les paramètres des commandes amusantes')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageGuild)
        .addSubcommand(subcommand =>
            subcommand
                .setName('enable')
                .setDescription('Active ou désactive les commandes amusantes')
                .addBooleanOption(option =>
                    option.setName('enabled')
                        .setDescription('Activer les commandes amusantes')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('cooldown')
                .setDescription('Configure le délai d\'attente entre les commandes')
                .addIntegerOption(option =>
                    option.setName('seconds')
                        .setDescription('Délai en secondes (minimum 1, maximum 300)')
                        .setRequired(true)
                        .setMinValue(1)
                        .setMaxValue(300)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('command')
                .setDescription('Active ou désactive une commande spécifique')
                .addStringOption(option =>
                    option.setName('name')
                        .setDescription('Nom de la commande')
                        .setRequired(true)
                        .addChoices(
                            { name: 'Joke', value: 'joke' },
                            { name: '8Ball', value: '8ball' },
                            { name: 'Meme', value: 'meme' },
                            { name: 'Trivia', value: 'trivia' }
                        ))
                .addBooleanOption(option =>
                    option.setName('enabled')
                        .setDescription('Activer cette commande')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('channel')
                .setDescription('Active ou désactive les commandes amusantes dans un salon')
                .addChannelOption(option =>
                    option.setName('channel')
                        .setDescription('Le salon à configurer')
                        .setRequired(true))
                .addBooleanOption(option =>
                    option.setName('enabled')
                        .setDescription('Autoriser les commandes amusantes dans ce salon')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('leaderboard')
                .setDescription('Active ou désactive le système de classement')
                .addBooleanOption(option =>
                    option.setName('enabled')
                        .setDescription('Activer le classement')
                        .setRequired(true)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('status')
                .setDescription('Affiche la configuration actuelle des commandes amusantes')),
    async execute(interaction, adminManager, warnManager, guildConfig, sharedConfig, backupToGitHub, reportManager, banlistManager, blockedWordsManager, watchlistManager, telegramIntegration, funCommandsManager, raidDetector, doxDetector, enhancedReloadSystem, permissionValidator) {
        try {
            // Check if user is admin
            const isAdmin = await adminManager.isAdmin(interaction.user.id);
            if (!isAdmin) {
                await interaction.reply({ 
                    content: 'Vous devez être administrateur pour utiliser cette commande.', 
                    ephemeral: true 
                });
                return;
            }

            if (!funCommandsManager) {
                await interaction.reply({ 
                    content: 'Le gestionnaire de commandes amusantes n\'est pas disponible.', 
                    ephemeral: true 
                });
                return;
            }

            const subcommand = interaction.options.getSubcommand();
            const guildId = interaction.guild.id;

            switch (subcommand) {
                case 'enable':
                    const enabled = interaction.options.getBoolean('enabled');
                    guildConfig.setFunCommandsEnabled(guildId, enabled);
                    await interaction.reply(`✅ Commandes amusantes ${enabled ? 'activées' : 'désactivées'} pour ce serveur.`);
                    break;

                case 'cooldown':
                    const seconds = interaction.options.getInteger('seconds');
                    const cooldownMs = seconds * 1000;
                    guildConfig.updateFunCommandsConfig(guildId, { cooldownMs });
                    await interaction.reply(`✅ Délai d'attente configuré à ${seconds} secondes.`);
                    break;

                case 'command':
                    const commandName = interaction.options.getString('name');
                    const commandEnabled = interaction.options.getBoolean('enabled');
                    const config = guildConfig.getFunCommandsConfig(guildId);
                    
                    if (commandEnabled && !config.enabledCommands.includes(commandName)) {
                        config.enabledCommands.push(commandName);
                    } else if (!commandEnabled && config.enabledCommands.includes(commandName)) {
                        config.enabledCommands = config.enabledCommands.filter(cmd => cmd !== commandName);
                    }
                    
                    guildConfig.updateFunCommandsConfig(guildId, config);
                    await interaction.reply(`✅ Commande ${commandName} ${commandEnabled ? 'activée' : 'désactivée'}.`);
                    break;

                case 'channel':
                    const channel = interaction.options.getChannel('channel');
                    const channelEnabled = interaction.options.getBoolean('enabled');
                    const channelConfig = guildConfig.getFunCommandsConfig(guildId);
                    
                    if (!channelEnabled && !channelConfig.disabledChannels.includes(channel.id)) {
                        channelConfig.disabledChannels.push(channel.id);
                    } else if (channelEnabled && channelConfig.disabledChannels.includes(channel.id)) {
                        channelConfig.disabledChannels = channelConfig.disabledChannels.filter(id => id !== channel.id);
                    }
                    
                    guildConfig.updateFunCommandsConfig(guildId, channelConfig);
                    await interaction.reply(`✅ Commandes amusantes ${channelEnabled ? 'autorisées' : 'interdites'} dans ${channel}.`);
                    break;

                case 'leaderboard':
                    const leaderboardEnabled = interaction.options.getBoolean('enabled');
                    guildConfig.updateFunCommandsConfig(guildId, { leaderboardEnabled });
                    await interaction.reply(`✅ Système de classement ${leaderboardEnabled ? 'activé' : 'désactivé'}.`);
                    break;

                case 'status':
                    const currentConfig = guildConfig.getFunCommandsConfig(guildId);
                    const statusMessage = `📊 **Configuration des Commandes Amusantes**\n\n` +
                        `**État général :** ${currentConfig.enabled ? '✅ Activé' : '❌ Désactivé'}\n` +
                        `**Délai d'attente :** ${currentConfig.cooldownMs / 1000} secondes\n` +
                        `**Classement :** ${currentConfig.leaderboardEnabled ? '✅ Activé' : '❌ Désactivé'}\n\n` +
                        `**Commandes activées :**\n${currentConfig.enabledCommands.map(cmd => `• ${cmd}`).join('\n') || 'Aucune'}\n\n` +
                        `**Salons désactivés :**\n${currentConfig.disabledChannels.map(id => `• <#${id}>`).join('\n') || 'Aucun'}`;
                    
                    await interaction.reply(statusMessage);
                    break;

                default:
                    await interaction.reply({ 
                        content: 'Sous-commande non reconnue.', 
                        ephemeral: true 
                    });
            }
        } catch (error) {
            console.error('Error executing fun-config command:', error);
            await interaction.reply({ 
                content: 'Une erreur est survenue lors de l\'exécution de la commande.', 
                ephemeral: true 
            });
        }
    },
};