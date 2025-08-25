import { SlashCommandBuilder } from 'discord.js';

export default {
    data: new SlashCommandBuilder()
        .setName('mass-add-to-banlist')
        .setDescription('Ajoute tous les membres non-bots et non-admins à la banlist.')
        .addStringOption(option =>
            option.setName('raison')
                .setDescription('Raison de l\'ajout (optionnel)')
                .setRequired(false)
        )
        .addStringOption(option =>
            option.setName('guildid')
                .setDescription('ID du serveur cible (optionnel, par défaut le serveur actuel)')
                .setRequired(false)
        ),
    async execute(interaction, adminManager, warnManager, guildConfig, sharedConfig, backupToGitHub, reportManager, banlistManager) {
        const isAdmin = adminManager.isAdmin(interaction.user.id);
        if (!isAdmin) {
            return interaction.reply({
                content: '❌ Seuls les administrateurs peuvent utiliser cette commande.',
                ephemeral: true
            });
        }

        await interaction.deferReply({ ephemeral: true });

        const guildId = interaction.options.getString('guildid') || interaction.guildId;
        const reason = interaction.options.getString('raison') || 'Ajout en masse via commande';
        
        if (!guildId) {
            return interaction.editReply({
                content: '❌ ID de serveur non spécifié et commande exécutée en dehors d\'un serveur.',
                ephemeral: true
            });
        }

        const guild = interaction.client.guilds.cache.get(guildId);
        if (!guild) {
            return interaction.editReply({
                content: `❌ Le bot n'est pas membre du serveur avec l'ID ${guildId} ou l'ID est invalide.`, 
                ephemeral: true
            });
        }

        let successCount = 0;
        const failedAdds = [];

        try {
            // On récupère tous les membres du serveur directement depuis l'API de Discord
            // pour s'assurer d'avoir la liste la plus à jour.
            const members = await guild.members.fetch();

            for (const member of members.values()) {
                if (member.user.bot || adminManager.isAdmin(member.id)) {
                    continue;
                }

                const result = await banlistManager.addToBanlist(
                    member.id,
                    reason,
                    interaction.user.id
                );

                if (result.success) {
                    successCount++;
                } else {
                    failedAdds.push(`${member.user.tag} (${result.message})`);
                }
            }

            let replyMessage = `✅ ${successCount} membre(s) du serveur ${guild.name} ajouté(s) à la banlist.`;
            if (failedAdds.length > 0) {
                replyMessage += `\n❌ Échec de l'ajout pour : ${failedAdds.join(', ')}`;
            }
            await interaction.editReply({ content: replyMessage });

        } catch (error) {
            console.error(`Erreur lors de l'ajout en masse à la banlist pour le serveur ${guild.name}:`, error);
            await interaction.editReply({ content: `❌ Une erreur est survenue lors de la récupération des membres du serveur ${guild.name}.` });
        }
    },
};