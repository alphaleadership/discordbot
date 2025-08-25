import { SlashCommandBuilder } from 'discord.js';

export default {
    data: new SlashCommandBuilder()
        .setName('reserver')
        .setDescription('Gérer les sauvegardes')
        .addStringOption(option =>
            option.setName('action')
                .setDescription('Action à effectuer')
                .setRequired(true)
                .addChoices(
                    { name: 'Voir le statut', value: 'status' },
                    { name: 'Forcer une sauvegarde', value: 'save' }
                )
        ),
    async execute(interaction, adminManager, warnManager, guildConfig, sharedConfig, backupToGitHub) {
        const isAdmin = adminManager.isAdmin(interaction.user.id);
        if (!isAdmin) {
            return interaction.reply({
                content: '❌ Seuls les administrateurs peuvent utiliser cette commande.',
                ephemeral: true
            });
        }

        const action = interaction.options.getString('action');
        
        if (action === 'save') {
            await interaction.deferReply({ ephemeral: true });
            await backupToGitHub();
            interaction.editReply('✅ Sauvegarde effectuée avec succès!');
        } else if (action === 'status') {
            const status = sharedConfig.lastBackupTime 
                ? `Dernière sauvegarde: ${new Date(sharedConfig.lastBackupTime).toLocaleString()}`
                : 'Aucune sauvegarde effectuée pour le moment';
            interaction.reply({
                content: `📊 **Statut de la sauvegarde**\n${status}`,
                ephemeral: true
            });
        }
    },
};