import { SlashCommandBuilder, EmbedBuilder, PermissionsBitField } from 'discord.js';
import fs from 'fs';
import path from 'path';

export default {
    data: new SlashCommandBuilder()
        .setName('system')
        .setDescription('Gérer les paramètres globaux du bot')
        .addSubcommand(subcommand =>
            subcommand
                .setName('config')
                .setDescription('Modifier la configuration globale')
                .addBooleanOption(option =>
                    option.setName('nettoyage-demarrage')
                        .setDescription('Activer/désactiver le nettoyage auto du stockage messages au démarrage')
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('status')
                .setDescription('Afficher l\'état du système et du stockage')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('clean-storage')
                .setDescription('Nettoyer manuellement le stockage des messages maintenant')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('cleanup')
                .setDescription('Nettoyer la banlist et watchlist des comptes supprimés par Discord')
        ),
    async execute(interaction, adminManager, warnManager, guildConfig, sharedConfig, backupToGitHub, reportManager, banlistManager, blockedWordsManager, watchlistManager, telegramIntegration, funCommandsManager, raidDetector, doxDetector, enhancedReloadSystem, permissionValidator) {
        try {
            // Seul l'owner du bot ou un admin peut gérer le système global
            const isBotAdmin = await adminManager.isAdmin(interaction.user.id);
            if (!isBotAdmin && !interaction.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
                return interaction.reply({
                    content: '❌ Cette commande est réservée aux administrateurs du bot.',
                    ephemeral: true
                });
            }

            const subcommand = interaction.options.getSubcommand();

            if (subcommand === 'cleanup') {
                await interaction.deferReply({ ephemeral: true });
                
                const banResults = await banlistManager.cleanupDeletedUsers(interaction.client);
                const watchResults = await watchlistManager.cleanupDeletedUsers(interaction.client);
                
                const embed = new EmbedBuilder()
                    .setColor('#00FF00')
                    .setTitle('🧹 Nettoyage des comptes supprimés terminé')
                    .addFields(
                        { name: 'Banlist', value: `Vérifiés: ${banResults.checked}\nSupprimés: ${banResults.removed}`, inline: true },
                        { name: 'Watchlist', value: `Vérifiés: ${watchResults.checked}\nSupprimés: ${watchResults.removed}`, inline: true }
                    )
                    .setTimestamp();
                    
                return interaction.editReply({ embeds: [embed] });
            }

            if (subcommand === 'config') {
                const cleanStartup = interaction.options.getBoolean('nettoyage-demarrage');
                
                const settings = {};
                if (cleanStartup !== null) settings.cleanMessagesOnStartup = cleanStartup;

                if (Object.keys(settings).length === 0) {
                    return interaction.reply({ content: '❓ Veuillez spécifier un paramètre à modifier.', ephemeral: true });
                }

                guildConfig.updateGlobalConfig(settings);

                const embed = new EmbedBuilder()
                    .setColor('#00FF00')
                    .setTitle('⚙️ Configuration Système mise à jour')
                    .addFields(
                        { name: 'Nettoyage au démarrage', value: settings.cleanMessagesOnStartup ? '✅ Activé' : '❌ Désactivé' }
                    )
                    .setTimestamp();

                await interaction.reply({ embeds: [embed] });
            }
            else if (subcommand === 'status') {
                const globalConfig = guildConfig.getGlobalConfig();
                
                let fileCount = 0;
                const messagesDir = 'messages';
                
                if (fs.existsSync(messagesDir)) {
                    const getFileCount = (dir) => {
                        let count = 0;
                        const files = fs.readdirSync(dir, { withFileTypes: true });
                        for (const file of files) {
                            if (file.isDirectory()) {
                                count += getFileCount(path.join(dir, file.name));
                            } else {
                                count++;
                            }
                        }
                        return count;
                    };
                    fileCount = getFileCount(messagesDir);
                }

                const embed = new EmbedBuilder()
                    .setColor('#0099FF')
                    .setTitle('Statut Système Bot')
                    .addFields(
                        { name: 'Nettoyage au démarrage', value: globalConfig.cleanMessagesOnStartup ? '✅ Activé' : '❌ Désactivé', inline: true },
                        { name: 'Fichiers messages', value: `${fileCount}`, inline: true },
                        { name: 'Version Config', value: guildConfig.getConfigVersion() || '1.0.0', inline: true }
                    )
                    .setTimestamp();

                await interaction.reply({ embeds: [embed] });
            }
            else if (subcommand === 'clean-storage') {
                const messagesDir = 'messages';
                
                try {
                    if (fs.existsSync(messagesDir)) {
                        fs.rmSync(messagesDir, { recursive: true, force: true });
                        fs.mkdirSync(messagesDir);
                        await interaction.reply({ content: '✅ Le dossier de stockage des messages a été nettoyé avec succès.', ephemeral: true });
                    } else {
                        await interaction.reply({ content: 'ℹ️ Le dossier de stockage est déjà vide ou n\'existe pas.', ephemeral: true });
                    }
                } catch (error) {
                    console.error('Erreur nettoyage manuel:', error);
                    await interaction.reply({ content: '❌ Erreur lors du nettoyage du stockage.', ephemeral: true });
                }
            }

        } catch (error) {
            console.error('Erreur dans la commande system:', error);
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({ content: '❌ Une erreur est survenue.', ephemeral: true });
            }
        }
    },
};