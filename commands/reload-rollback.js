import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';

export default {
    data: new SlashCommandBuilder()
        .setName('reload-rollback')
        .setDescription('Effectuer un rollback du système (Admin uniquement)')
        .addBooleanOption(option =>
            option.setName('confirm')
                .setDescription('Confirmer l\'opération de rollback')
                .setRequired(true)
        )
        .addStringOption(option =>
            option.setName('components')
                .setDescription('Composants spécifiques à restaurer (séparés par des virgules)')
                .setRequired(false)
        )
        .addBooleanOption(option =>
            option.setName('emergency')
                .setDescription('Mode de récupération d\'urgence')
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

        const componentsStr = interaction.options.getString('components');
        const emergency = interaction.options.getBoolean('emergency') || false;
        const confirm = interaction.options.getBoolean('confirm');

        if (!confirm) {
            return interaction.reply({
                content: '❌ Vous devez confirmer l\'opération de rollback en définissant le paramètre `confirm` sur `true`.',
                ephemeral: true
            });
        }

        if (!enhancedReloadSystem) {
            return interaction.reply({
                content: '❌ Le système de rechargement amélioré n\'est pas disponible.',
                ephemeral: true
            });
        }

        try {
            await interaction.deferReply({ ephemeral: true });

            let result;
            const startTime = Date.now();

            if (emergency) {
                // Emergency recovery mode
                const embed = new EmbedBuilder()
                    .setColor('#ff0000')
                    .setTitle('🚨 Mode de récupération d\'urgence')
                    .setDescription('Démarrage de la récupération d\'urgence du système...')
                    .setTimestamp();

                await interaction.editReply({ embeds: [embed] });

                await enhancedReloadSystem.emergencyRecovery();
                
                result = {
                    success: true,
                    type: 'emergency',
                    duration: Date.now() - startTime
                };

            } else if (componentsStr) {
                // Selective rollback
                const components = componentsStr.split(',').map(c => c.trim()).filter(c => c.length > 0);
                
                const embed = new EmbedBuilder()
                    .setColor('#ffa500')
                    .setTitle('🔄 Rollback sélectif')
                    .setDescription(`Rollback des composants: ${components.join(', ')}`)
                    .setTimestamp();

                await interaction.editReply({ embeds: [embed] });

                await enhancedReloadSystem.selectiveRollback(components);
                
                result = {
                    success: true,
                    type: 'selective',
                    components: components,
                    duration: Date.now() - startTime
                };

            } else {
                // Full rollback
                const embed = new EmbedBuilder()
                    .setColor('#ffa500')
                    .setTitle('🔄 Rollback complet')
                    .setDescription('Rollback de tous les composants vers le dernier état stable...')
                    .setTimestamp();

                await interaction.editReply({ embeds: [embed] });

                await enhancedReloadSystem.rollback();
                
                result = {
                    success: true,
                    type: 'full',
                    duration: Date.now() - startTime
                };
            }

            // Success response
            const successEmbed = new EmbedBuilder()
                .setColor('#2ecc71')
                .setTitle('✅ Rollback réussi')
                .setDescription('Le système a été restauré avec succès.')
                .addFields(
                    { name: 'Type de rollback', value: result.type === 'emergency' ? 'Récupération d\'urgence' : 
                                                      result.type === 'selective' ? 'Rollback sélectif' : 
                                                      'Rollback complet', inline: true },
                    { name: 'Durée', value: `${result.duration}ms`, inline: true }
                );

            if (result.components) {
                successEmbed.addFields(
                    { name: 'Composants restaurés', value: result.components.join(', '), inline: false }
                );
            }

            successEmbed.addFields(
                { name: 'Recommandations', value: 
                    '• Vérifiez le statut avec `/reload-status`\n' +
                    '• Testez les fonctionnalités critiques\n' +
                    '• Surveillez les logs pour d\'éventuelles erreurs', inline: false }
            );

            successEmbed.setTimestamp();
            await interaction.editReply({ embeds: [successEmbed] });

        } catch (error) {
            console.error('Erreur lors du rollback:', error);
            
            const errorEmbed = new EmbedBuilder()
                .setColor('#e74c3c')
                .setTitle('❌ Échec du rollback')
                .setDescription('Une erreur est survenue lors du rollback.')
                .addFields(
                    { name: 'Détails de l\'erreur', value: `\`\`\`${error.message.substring(0, 1000)}\`\`\`` },
                    { name: '⚠️ Actions recommandées', value: 
                        '• Essayez un rollback d\'urgence avec `emergency: true`\n' +
                        '• Contactez l\'administrateur système\n' +
                        '• Vérifiez les logs du serveur', inline: false }
                )
                .setTimestamp();

            await interaction.editReply({ embeds: [errorEmbed] });
        }
    },
};