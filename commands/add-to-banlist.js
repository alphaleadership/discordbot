import { SlashCommandBuilder } from 'discord.js';

export default {
    data: new SlashCommandBuilder()
        .setName('add-to-banlist')
        .setDescription('Ajouter un utilisateur à la banlist')
        .addUserOption(option =>
            option.setName('utilisateur')
                .setDescription('L\'utilisateur à ajouter à la banlist')
                .setRequired(true)
        )
        .addStringOption(option =>
            option.setName('raison')
                .setDescription('La raison de l\'ajout à la banlist')
                .setRequired(true)
        ),
    async execute(interaction, adminManager, warnManager, guildConfig, sharedConfig, backupToGitHub, reportManager, banlistManager, blockedWordsManager, watchlistManager, telegramIntegration, funCommandsManager, raidDetector, doxDetector, enhancedReloadSystem, permissionValidator) {
        const isBotAdmin = adminManager.isAdmin(interaction.user.id);
        const isAgent = adminManager.isAgent(interaction.user.id);

        if (!isAgent) {
            return interaction.reply({
                content: '❌ Vous n\'avez pas les permissions nécessaires pour utiliser cette commande.',
                ephemeral: true
            });
        }

        const targetUser = interaction.options.getUser('utilisateur');
        const reason = interaction.options.getString('raison');

        if (isBotAdmin) {
            const result = await banlistManager.addToBanlist(
                targetUser.id,
                reason,
                interaction.user.id
            );

            return interaction.reply({
                content: result.success ? `✅ ${targetUser.tag} a été ajouté à la banlist.` : `❌ ${result.message}`,
                ephemeral: true
            });
        } else {
            // It's an agent
            const pendingResult = await banlistManager.addPendingRequest({
                userId: targetUser.id,
                username: targetUser.tag,
                reason: reason,
                moderatorId: interaction.user.id,
                moderatorTag: interaction.user.tag,
                guildId: interaction.guild.id,
                guildName: interaction.guild.name
            });

            if (!pendingResult.success) {
                return interaction.reply({
                    content: `❌ Erreur lors de la création de la demande: ${pendingResult.error}`,
                    ephemeral: true
                });
            }

            return interaction.reply({
                content: `⏳ Votre demande d'ajout à la banlist pour **${targetUser.tag}** a été soumise à la validation d'un administrateur (ID: ${pendingResult.request.id}).`,
                ephemeral: true
            });
        }
    },
};