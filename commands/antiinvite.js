import { SlashCommandBuilder, PermissionsBitField } from 'discord.js';

export default {
    data: new SlashCommandBuilder()
        .setName('antiinvite')
        .setDescription('Gérer la protection contre les invitations')
        .addStringOption(option =>
            option.setName('action')
                .setDescription('Action à effectuer')
                .setRequired(true)
                .addChoices(
                    { name: 'Activer', value: 'enable' },
                    { name: 'Désactiver', value: 'disable' },
                    { name: 'Désactiver dans ce salon', value: 'disable_here' },
                    { name: 'Réactiver dans ce salon', value: 'enable_here' },
                    { name: 'Statut', value: 'status' }
                )
        ),
    async execute(interaction, adminManager, warnManager, guildConfig) {
        if (!interaction.memberPermissions?.has(PermissionsBitField.Flags.ManageGuild)) {
            return interaction.reply({
                content: '❌ Vous devez avoir la permission de gérer le serveur pour utiliser cette commande.',
                ephemeral: true
            });
        }

        const action = interaction.options.getString('action');
        const channelId = interaction.channelId;
        const guildId = interaction.guildId;

        try {
            let response = '';
            
            switch (action) {
                case 'enable':
                    guildConfig.setAntiInvite(guildId, true);
                    response = '✅ La protection contre les invitations a été activée sur tout le serveur.';
                    break;
                    
                case 'disable':
                    guildConfig.setAntiInvite(guildId, false);
                    response = '❌ La protection contre les invitations a été désactivée sur tout le serveur.';
                    break;
                    
                case 'disable_here':
                    guildConfig.setAntiInvite(guildId, true, channelId);
                    response = `🔇 La protection contre les invitations a été désacée dans ce salon.`;
                    break;
                    
                case 'enable_here':
                    guildConfig.setAntiInvite(guildId, false, channelId);
                    response = `🔊 La protection contre les invitations a été réactivée dans ce salon.`;
                    break;
                    
                case 'status':
                    const isEnabled = guildConfig.isAntiInviteEnabled(guildId, channelId);
                    response = isEnabled 
                        ? '🛡️ La protection contre les invitations est **activée** dans ce salon.' 
                        : '⚠️ La protection contre les invitations est **désactivée** dans ce salon.';
                    break;
            }
            
            interaction.reply({
                content: response,
                ephemeral: true
            });
            
        } catch (error) {
            console.error('Erreur lors de la gestion de l\'anti-invite:', error);
            interaction.reply({
                content: '❌ Une erreur est survenue lors de la gestion de l\'anti-invite.',
                ephemeral: true
            });
        }
    },
};