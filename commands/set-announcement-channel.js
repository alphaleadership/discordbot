import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';

export default {
    data: new SlashCommandBuilder()
        .setName('set-announcement-channel')
        .setDescription('Définit le salon dédié aux annonces pour ce serveur')
        .addChannelOption(option =>
            option.setName('salon')
                .setDescription('Le salon où les annonces seront transférées')
                .setRequired(true)
        ),

    async execute(interaction, adminManager, warnManager, guildConfig, sharedConfig, backupToGitHub, reportManager, banlistManager, blockedWordsManager, watchlistManager) {
        try {
            // Restriction aux administrateurs du bot uniquement
            const isAdmin = adminManager.isAdmin(interaction.user.id);
            if (!isAdmin) {
                return interaction.reply({
                    content: '❌ Seuls les administrateurs du bot peuvent configurer le salon d\'annonce.',
                    ephemeral: true
                });
            }

            const channel = interaction.options.getChannel('salon');
            const guildId = interaction.guild.id;

            // Utiliser guildConfig pour sauvegarder le salon d'annonce
            guildConfig.setAnnouncementChannelId(guildId, channel.id);
            
            await interaction.reply({
                content: `✅ Le salon d'annonce a été défini sur ${channel}`,
                ephemeral: true
            });

            // Déclencher une sauvegarde si nécessaire
            if (backupToGitHub) {
                await backupToGitHub();
            }
        } catch (error) {
            console.error('Erreur dans la commande set-announcement-channel:', error);
            await interaction.reply({
                content: '❌ Une erreur est survenue lors de la configuration du salon d\'annonce.',
                ephemeral: true
            });
        }
    }
};
