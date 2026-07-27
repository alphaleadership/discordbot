import { SlashCommandBuilder, EmbedBuilder, PermissionsBitField } from 'discord.js';

export default {
    data: new SlashCommandBuilder()
        .setName('admin')
        .setDescription('Gérer les administrateurs et agents du bot')
        .addSubcommand(subcommand =>
            subcommand
                .setName('add')
                .setDescription('Ajouter un utilisateur comme admin ou agent')
                .addUserOption(option =>
                    option.setName('utilisateur')
                        .setDescription('L\'utilisateur à ajouter')
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option.setName('role')
                        .setDescription('Le rôle à attribuer')
                        .setRequired(true)
                        .addChoices(
                            { name: 'Administrateur', value: 'admin' },
                            { name: 'Agent', value: 'agent' }
                        )
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('remove')
                .setDescription('Retirer un utilisateur des admins ou agents')
                .addUserOption(option =>
                    option.setName('utilisateur')
                        .setDescription('L\'utilisateur à retirer')
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('list')
                .setDescription('Lister les admins et agents')
        ),
    async execute(interaction, adminManager, warnManager, guildConfig, sharedConfig, backupToGitHub, reportManager, banlistManager, blockedWordsManager, watchlistManager, telegramIntegration, funCommandsManager, raidDetector, doxDetector, enhancedReloadSystem, permissionValidator) {
        try {
            // Seuls les admins actuels peuvent gérer les permissions
            if (!adminManager.isAdmin(interaction.user.id)) {
                return interaction.reply({
                    content: '❌ Cette commande est réservée aux administrateurs du bot.',
                    ephemeral: true
                });
            }

            const subcommand = interaction.options.getSubcommand();

            if (subcommand === 'add') {
                const targetUser = interaction.options.getUser('utilisateur');
                const role = interaction.options.getString('role');

                if (role === 'admin') {
                    if (adminManager.isAdmin(targetUser.id)) {
                        return interaction.reply({ content: 'ℹ️ Cet utilisateur est déjà administrateur.', ephemeral: true });
                    }
                    adminManager.addAdmin(targetUser.id);
                    return interaction.reply({ content: `✅ **${targetUser.tag}** a été ajouté comme administrateur du bot.`, ephemeral: true });
                } else {
                    if (adminManager.agents.includes(targetUser.id)) {
                        return interaction.reply({ content: 'ℹ️ Cet utilisateur est déjà agent.', ephemeral: true });
                    }
                    adminManager.addAgent(targetUser.id);
                    
                    let dmStatus = '';
                    try {
                        const welcomeEmbed = new EmbedBuilder()
                            .setColor('#0099FF')
                            .setTitle('👮 Bienvenue dans l\'équipe des Agents !')
                            .setDescription('Vous venez d\'être ajouté en tant qu\'**Agent** du bot. Voici votre briefing de sécurité et les commandes disponibles pour votre rôle :')
                            .addFields(
                                { name: '📥 Gestion de la Banlist', value: '• `/add-to-banlist <utilisateur> <raison>` : Soumet une demande d\'ajout à la banlist globale (met aussi l\'utilisateur en quarantaine).\n• `/remove-from-banlist <utilisateur-id> <raison>` : Soumet une demande de retrait de la banlist.' },
                                { name: '🔍 Gestion de la Watchlist', value: '• `/watchlist-add` : Met un utilisateur sous surveillance locale (avec niveau Observe, Alerte ou Action).\n• `/watchlist-remove` : Enlève un utilisateur de la liste locale.\n• `/watchlist-note` : Ajoute une note à l\'historique d\'un utilisateur surveillé.\n• `/watchlist-info` : Affiche l\'historique complet (incidents, notes) d\'un utilisateur.\n• `/watchlist-list` : Liste les utilisateurs surveillés sur le serveur.' },
                                { name: '⏳ Processus de validation', value: 'En tant qu\'agent, vos actions sur la banlist globale requièrent la validation finale d\'un administrateur du bot. Elles restent en attente jusqu\'à approbation.' }
                            )
                            .setTimestamp()
                            .setFooter({ text: 'Système de modération gitbot' });

                        await targetUser.send({ embeds: [welcomeEmbed] });
                        dmStatus = ' Un message privé de briefing lui a été envoyé.';
                    } catch (dmError) {
                        console.error(`Impossible d'envoyer le MP à l'agent ${targetUser.tag}:`, dmError);
                        dmStatus = ' (Impossible de lui envoyer le MP de briefing, ses DMs sont probablement fermés).';
                    }

                    return interaction.reply({ content: `✅ **${targetUser.tag}** a été ajouté comme agent du bot.${dmStatus}`, ephemeral: true });
                }
            }

            if (subcommand === 'remove') {
                const targetUser = interaction.options.getUser('utilisateur');
                let removed = false;

                if (adminManager.isAdmin(targetUser.id)) {
                    // Empêcher de s'enlever soi-même si c'est le seul admin ? 
                    // Pour l'instant on fait simple
                    adminManager.removeAdmin(targetUser.id);
                    removed = true;
                }

                if (adminManager.agents.includes(targetUser.id)) {
                    adminManager.removeAgent(targetUser.id);
                    removed = true;
                }

                if (removed) {
                    return interaction.reply({ content: `✅ **${targetUser.tag}** a été retiré des accès privilégiés du bot.`, ephemeral: true });
                } else {
                    return interaction.reply({ content: '❌ Cet utilisateur n\'a aucun accès spécial.', ephemeral: true });
                }
            }

            if (subcommand === 'list') {
                const embed = new EmbedBuilder()
                    .setColor('#0099FF')
                    .setTitle('👥 Liste des accès privilégiés')
                    .addFields(
                        { name: '👑 Administrateurs', value: adminManager.admins.length > 0 ? adminManager.admins.map(id => `<@${id}>`).join('\n') : 'Aucun', inline: true },
                        { name: '👮 Agents', value: adminManager.agents.length > 0 ? adminManager.agents.map(id => `<@${id}>`).join('\n') : 'Aucun', inline: true }
                    )
                    .setTimestamp();

                return interaction.reply({ embeds: [embed], ephemeral: true });
            }

        } catch (error) {
            console.error('Erreur dans la commande admin:', error);
            return interaction.reply({ content: '❌ Une erreur est survenue.', ephemeral: true });
        }
    },
};