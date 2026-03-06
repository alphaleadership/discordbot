import { SlashCommandBuilder, EmbedBuilder, PermissionsBitField } from 'discord.js';

export default {
    data: new SlashCommandBuilder()
        .setName('raid')
        .setDescription('Gérer le système anti-raid et le mode panique')
        .addSubcommand(subcommand =>
            subcommand
                .setName('panic-on')
                .setDescription('Activer le mode panique (mesures de protection critiques immédiates)')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('panic-off')
                .setDescription('Désactiver le mode panique et lever les restrictions')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('status')
                .setDescription('Afficher le statut actuel de la détection de raid')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('config')
                .setDescription('Configurer les paramètres anti-raid')
                .addBooleanOption(option =>
                    option.setName('activé')
                        .setDescription('Activer ou désactiver la détection automatique')
                )
                .addIntegerOption(option =>
                    option.setName('seuil')
                        .setDescription('Nombre de jointures rapides pour déclencher une alerte')
                )
                .addIntegerOption(option =>
                    option.setName('fenêtre')
                        .setDescription('Fenêtre de temps en secondes pour le seuil')
                )
        ),
    async execute(interaction, adminManager, warnManager, guildConfig, sharedConfig, backupToGitHub, reportManager, banlistManager, blockedWordsManager, watchlistManager, telegramIntegration, funCommandsManager, raidDetector, doxDetector, enhancedReloadSystem, permissionValidator) {
        try {
            // Vérifier les permissions (Administrateur ou Gérer le serveur requis)
            if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator) && 
                !interaction.member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
                return interaction.reply({
                    content: '❌ Vous devez être administrateur ou avoir la permission "Gérer le serveur" pour utiliser cette commande.',
                    ephemeral: true
                });
            }

            const subcommand = interaction.options.getSubcommand();

            if (subcommand === 'panic-on') {
                await interaction.deferReply();
                const result = await raidDetector.enablePanicMode(interaction.guild, interaction.user.id);
                
                if (result.success) {
                    const embed = new EmbedBuilder()
                        .setColor('#FF0000')
                        .setTitle('🚨 MODE PANIQUE ACTIVÉ')
                        .setDescription("Le mode panique a été activé manuellement. Des mesures de protection critiques ont été appliquées à l'ensemble du serveur.")
                        .addFields(
                            { name: 'Modérateur', value: interaction.user.tag, inline: true },
                            { name: 'Statut', value: '🔴 CRITIQUE', inline: true }
                        )
                        .setTimestamp();
                    
                    await interaction.editReply({ embeds: [embed] });
                } else {
                    await interaction.editReply({ content: `❌ ${result.message}` });
                }
            } 
            else if (subcommand === 'panic-off') {
                await interaction.deferReply();
                const result = await raidDetector.disablePanicMode(interaction.guild, interaction.user.id);
                
                if (result.success) {
                    const embed = new EmbedBuilder()
                        .setColor('#00FF00')
                        .setTitle('✅ MODE PANIQUE DÉSACTIVÉ')
                        .setDescription('Le mode panique a été désactivé. Les mesures de protection sont en cours de retrait.')
                        .addFields(
                            { name: 'Modérateur', value: interaction.user.tag, inline: true },
                            { name: 'Statut', value: '🟢 NORMAL', inline: true }
                        )
                        .setTimestamp();
                    
                    await interaction.editReply({ embeds: [embed] });
                } else {
                    await interaction.editReply({ content: `❌ ${result.message}` });
                }
            }
            else if (subcommand === 'status') {
                const config = guildConfig.getRaidDetectionConfig(interaction.guild.id);
                const stats = raidDetector.getJoinStats(interaction.guild.id);
                const isPanic = (raidDetector.panicMode && raidDetector.panicMode.get(interaction.guild.id)) || false;

                const embed = new EmbedBuilder()
                    .setColor(isPanic ? '#FF0000' : '#0099FF')
                    .setTitle(`Statut Anti-Raid - ${interaction.guild.name}`)
                    .addFields(
                        { name: 'État du système', value: config.enabled ? '✅ Activé' : '❌ Désactivé', inline: true },
                        { name: 'Mode Panique', value: isPanic ? '🚨 ACTIF' : '🟢 Inactif', inline: true },
                        { name: '\u200B', value: '\u200B', inline: true },
                        { name: 'Seuil de détection', value: `${config.rapidJoinThreshold} jointures`, inline: true },
                        { name: 'Fenêtre de temps', value: `${config.timeWindowMs / 1000}s`, inline: true },
                        { name: 'Jointures récentes', value: `${stats.recentJoins}`, inline: true }
                    )
                    .setTimestamp();

                await interaction.reply({ embeds: [embed] });
            }
            else if (subcommand === 'config') {
                const enabled = interaction.options.getBoolean('activé');
                const threshold = interaction.options.getInteger('seuil');
                const window = interaction.options.getInteger('fenêtre');

                const settings = {};
                if (enabled !== null) settings.enabled = enabled;
                if (threshold !== null) settings.rapidJoinThreshold = threshold;
                if (window !== null) settings.timeWindowMs = window * 1000;

                if (Object.keys(settings).length === 0) {
                    return interaction.reply({ content: '❓ Veuillez spécifier au moins un paramètre à modifier.', ephemeral: true });
                }

                guildConfig.updateRaidDetectionConfig(interaction.guild.id, settings);

                const embed = new EmbedBuilder()
                    .setColor('#00FF00')
                    .setTitle('⚙️ Configuration Anti-Raid mise à jour')
                    .setDescription('Les paramètres ont été enregistrés avec succès.')
                    .setTimestamp();

                if (enabled !== null) embed.addFields({ name: 'Système', value: enabled ? '✅ Activé' : '❌ Désactivé', inline: true });
                if (threshold !== null) embed.addFields({ name: 'Seuil', value: `${threshold} jointures`, inline: true });
                if (window !== null) embed.addFields({ name: 'Fenêtre', value: `${window}s`, inline: true });

                await interaction.reply({ embeds: [embed] });
            }

        } catch (error) {
            console.error('Erreur dans la commande raid:', error);
            await interaction.reply({ content: "❌ Une erreur est survenue lors de l'exécution de cette commande.", ephemeral: true });
        }
    },
};