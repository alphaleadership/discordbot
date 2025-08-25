import { SlashCommandBuilder } from 'discord.js';

export default {
    data: new SlashCommandBuilder()
        .setName('invite')
        .setDescription('Génère un lien d\'invitation à usage unique pour le serveur de support'),
    async execute(interaction) {
        try {
            const supportGuild = interaction.client.guilds.cache.get('1254376882888114176');
            if (!supportGuild) {
                return interaction.reply({
                    content: '❌ Le bot n\'est pas sur le serveur de support.',
                    ephemeral: true
                });
            }

            const invite = await supportGuild.invites.create(
                supportGuild.rulesChannel || supportGuild.systemChannel || supportGuild.channels.cache.first(),
                {
                    maxUses: 1,
                    unique: true,
                    reason: `Invitation générée par ${interaction.user.tag} (${interaction.user.id})`
                }
            );

            await interaction.user.send(`Voici votre lien d'invitation à usage unique pour le serveur de support : ${invite.url}`);
            
            return interaction.reply({
                content: '✅ Un lien d\'invitation à usage unique vous a été envoyé en message privé.',
                ephemeral: true
            });
            
        } catch (error) {
            console.error('Erreur lors de la création de l\'invitation:', error);
            return interaction.reply({
                content: '❌ Une erreur est survenue lors de la création de l\'invitation. Veuillez réessayer plus tard.',
                ephemeral: true
            });
        }
    },
};