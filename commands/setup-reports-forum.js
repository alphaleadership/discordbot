import { SlashCommandBuilder, EmbedBuilder, ChannelType } from 'discord.js';

export default {
    data: new SlashCommandBuilder()
        .setName('setup-reports-forum')
        .setDescription('Configure le salon forum pour la gestion centralisée des rapports')
        .addStringOption(option =>
            option.setName('support-server-id')
                .setDescription('ID du serveur de support où les rapports seront gérés')
                .setRequired(true))
        .addChannelOption(option =>
            option.setName('forum-channel')
                .setDescription('OBLIGATOIRE: Le salon forum spécifique où les rapports seront postés')
                .setRequired(true)
                .addChannelTypes(ChannelType.GuildForum)),
    
    async execute(interaction, adminManager, warnManager, guildConfig, sharedConfig, backupToGitHub, reportManager, banlistManager, blockedWordsManager, watchlistManager, telegramIntegration, funCommandsManager, raidDetector, doxDetector, enhancedReloadSystem, permissionValidator, dmTicketManager, economyManager, forumReportManager) {
        try {
            // Check if user is an admin
            if (!adminManager.isAdmin(interaction.user.id)) {
                return await interaction.reply({
                    content: '❌ Vous devez être administrateur pour utiliser cette commande.',
                    ephemeral: true
                });
            }

            if (!forumReportManager) {
                return await interaction.reply({
                    content: '❌ Le système de rapports par forum n\'est pas disponible.',
                    ephemeral: true
                });
            }

            // Message d'information sur l'importance de spécifier le salon
            await interaction.deferReply({ ephemeral: true });
            
            // Petit délai pour que l'utilisateur voie le message de chargement
            setTimeout(async () => {
                await interaction.followUp({
                    content: '🔄 **Configuration en cours...** Vérification du salon forum spécifié...',
                    ephemeral: true
                });
            }, 500);

            const supportServerId = interaction.options.getString('support-server-id');
            const forumChannel = interaction.options.getChannel('forum-channel');

            // Validation explicite que le salon forum est bien spécifié
            if (!forumChannel) {
                return await interaction.editReply({
                    content: '❌ **Vous devez obligatoirement spécifier un salon forum.** Utilisez l\'option `forum-channel` pour sélectionner le salon forum où les rapports seront postés.',
                });
            }

            // Validate that the support server exists and bot has access
            const supportGuild = interaction.client.guilds.cache.get(supportServerId);
            if (!supportGuild) {
                return await interaction.editReply({
                    content: '❌ Le serveur de support spécifié est introuvable ou le bot n\'y a pas accès. Vérifiez l\'ID du serveur.',
                });
            }

            // Validate that it's actually a forum channel
            if (forumChannel.type !== ChannelType.GuildForum) {
                return await interaction.editReply({
                    content: `❌ **Le salon spécifié doit être un salon forum.** Le salon <#${forumChannel.id}> est de type "${forumChannel.type}" mais doit être un salon forum (type ${ChannelType.GuildForum}). Créez un salon forum ou sélectionnez un salon forum existant.`,
                });
            }

            // Validate that the forum channel is in the support server
            if (forumChannel.guild.id !== supportServerId) {
                return await interaction.editReply({
                    content: `❌ **Le salon forum doit être dans le serveur de support spécifié.** Le salon <#${forumChannel.id}> est dans le serveur "${forumChannel.guild.name}" (${forumChannel.guild.id}) mais vous avez spécifié le serveur "${supportServerId}". Assurez-vous que le salon forum est dans le bon serveur.`,
                });
            }

            // Check bot permissions in the forum channel
            const botMember = supportGuild.members.cache.get(interaction.client.user.id);
            if (!botMember) {
                return await interaction.editReply({
                    content: '❌ Le bot n\'est pas membre du serveur de support spécifié.',
                });
            }

            const requiredPermissions = ['ViewChannel', 'SendMessages', 'CreatePublicThreads', 'ManageThreads', 'EmbedLinks'];
            const missingPermissions = requiredPermissions.filter(
                perm => !botMember.permissionsIn(forumChannel).has(perm)
            );

            if (missingPermissions.length > 0) {
                return await interaction.editReply({
                    content: `❌ Le bot manque des permissions requises dans le salon forum spécifié <#${forumChannel.id}>: **${missingPermissions.join(', ')}**\n\n**Le salon forum doit être accessible au bot** pour pouvoir créer et gérer les rapports.`,
                });
            }

            // Setup the reports forum
            const result = await forumReportManager.setupReportsForum(supportServerId, forumChannel.id);

            if (!result.success) {
                return await interaction.editReply({
                    content: `❌ **Erreur lors de la configuration du salon forum spécifié:** ${result.message}\n\nVérifiez que le salon forum <#${forumChannel.id}> est correctement configuré et accessible.`,
                });
            }

            // Get forum configuration for display
            const config = forumReportManager.getConfig();

            const embed = new EmbedBuilder()
                .setColor('#00ff00')
                .setTitle('✅ Configuration du Forum de Rapports Réussie')
                .setDescription('Le système de rapports par forum a été configuré avec succès! **Tous les rapports seront maintenant postés dans le salon forum spécifié.**')
                .addFields(
                    { 
                        name: '🏠 Serveur de Support Configuré', 
                        value: `**${supportGuild.name}**\nID: \`${supportServerId}\``, 
                        inline: true 
                    },
                    { 
                        name: '📋 Salon Forum Spécifié', 
                        value: `**<#${forumChannel.id}>**\nNom: \`${forumChannel.name}\`\n**Tous les rapports iront ici**`, 
                        inline: true 
                    },
                    { 
                        name: '⚠️ Important', 
                        value: 'Le salon forum spécifié est maintenant le **seul endroit** où les rapports seront créés. Assurez-vous que les modérateurs ont accès à ce salon.', 
                        inline: false 
                    },
                    { 
                        name: 'Catégories Disponibles', 
                        value: Object.values(config.categories)
                            .map(cat => `${cat.emoji} **${cat.name}** - ${cat.description}`)
                            .join('\n'), 
                        inline: false 
                    },
                    { 
                        name: 'Fonctionnalités', 
                        value: [
                            '• Création automatique de posts forum pour chaque rapport',
                            '• Catégorisation automatique des rapports',
                            '• Suivi du statut et résolution des rapports',
                            '• Liaison des rapports connexes',
                            '• Archivage automatique des rapports résolus'
                        ].join('\n'), 
                        inline: false 
                    }
                )
                .setFooter({ 
                    text: 'Les rapports de tous les serveurs seront maintenant centralisés dans ce forum' 
                })
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error('Error in setup-reports-forum command:', error);
            
            // Vérifier si l'interaction a déjà été répondue
            if (interaction.deferred) {
                await interaction.editReply({
                    content: '❌ Une erreur est survenue lors de la configuration du salon forum de rapports. Vérifiez que le salon forum spécifié est valide et accessible.',
                });
            } else {
                await interaction.reply({
                    content: '❌ Une erreur est survenue lors de la configuration du salon forum de rapports. Vérifiez que le salon forum spécifié est valide et accessible.',
                    ephemeral: true
                });
            }
        }
    },
};