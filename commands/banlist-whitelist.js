import { SlashCommandBuilder, PermissionsBitField } from 'discord.js';

export default {
    data: new SlashCommandBuilder()
        .setName('banlist-whitelist')
        .setDescription('Gérer la liste blanche (whitelist) de la banlist')
        .addSubcommand(subcommand =>
            subcommand
                .setName('add')
                .setDescription('Ajouter un utilisateur à la whitelist')
                .addUserOption(option =>
                    option.setName('utilisateur')
                        .setDescription('L\'utilisateur à ajouter')
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('remove')
                .setDescription('Retirer un utilisateur de la whitelist')
                .addUserOption(option =>
                    option.setName('utilisateur')
                        .setDescription('L\'utilisateur à retirer')
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('list')
                .setDescription('Afficher la liste des utilisateurs whitelistés')
        ),
    async execute(interaction, adminManager, warnManager, guildConfig, sharedConfig, backupToGitHub, reportManager, banlistManager) {
        const isBotAdmin = adminManager.isAdmin(interaction.user.id);
        const isAgent = adminManager.isAgent(interaction.user.id);
        const isServerAdmin = interaction.member.permissions.has(PermissionsBitField.Flags.Administrator) || 
                              interaction.member.permissions.has(PermissionsBitField.Flags.ManageGuild);

        if (!isAgent && !isBotAdmin && !isServerAdmin) {
            return interaction.reply({
                content: '❌ Vous devez être administrateur ou modérateur (agent/admin bot, ou administrateur/gestionnaire du serveur) pour utiliser cette commande.',
                ephemeral: true
            });
        }

        const subcommand = interaction.options.getSubcommand();

        if (subcommand === 'add') {
            const targetUser = interaction.options.getUser('utilisateur');
            const success = banlistManager.addToWhitelist(targetUser.id, interaction.guildId);
            
            return interaction.reply({
                content: success 
                    ? `✅ **${targetUser.tag}** (${targetUser.id}) a été ajouté à la whitelist de la banlist sur ce serveur.`
                    : `ℹ️ **${targetUser.tag}** est déjà dans la whitelist de ce serveur.`,
                ephemeral: true
            });
        }
        else if (subcommand === 'remove') {
            const targetUser = interaction.options.getUser('utilisateur');
            const success = banlistManager.removeFromWhitelist(targetUser.id, interaction.guildId);
            
            return interaction.reply({
                content: success 
                    ? `✅ **${targetUser.tag}** (${targetUser.id}) a été retiré de la whitelist de la banlist de ce serveur.`
                    : `❌ **${targetUser.tag}** n'est pas dans la whitelist de ce serveur.`,
                ephemeral: true
            });
        }
        else if (subcommand === 'list') {
            const whitelist = banlistManager.whitelist[interaction.guildId] || [];
            if (whitelist.length === 0) {
                return interaction.reply({
                    content: 'ℹ️ La whitelist est actuellement vide pour ce serveur.',
                    ephemeral: true
                });
            }

            const formattedList = [];
            for (const userId of whitelist) {
                const user = await interaction.client.users.fetch(userId).catch(() => null);
                formattedList.push(user ? `• **${user.tag}** (${userId})` : `• ID: **${userId}** (Inconnu)`);
            }

            return interaction.reply({
                content: `📋 **Membres dans la whitelist de la banlist de ce serveur :**\n\n${formattedList.join('\n')}`,
                ephemeral: true
            });
        }
    }
};
