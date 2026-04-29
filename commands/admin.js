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
                    return interaction.reply({ content: `✅ **${targetUser.tag}** a été ajouté comme agent du bot.`, ephemeral: true });
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