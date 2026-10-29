import { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionsBitField } from 'discord.js';

export default {
    data: new SlashCommandBuilder()
        .setName('invite')
        .setDescription('Obtenir le lien d\'invitation pour ajouter le bot à votre serveur')
        .addStringOption(option =>
            option.setName('permissions')
                .setDescription('Type de permissions pour le lien d\'invitation')
                .setRequired(false)
                .addChoices(
                    { name: '⭐ Recommandé (Modération, Économie, Giveaways, Tickets)', value: 'recommended' },
                    { name: '🛡️ Administrateur (Accès complet)', value: 'admin' },
                    { name: '🔒 Basique (Lecture et Envoi de messages)', value: 'basic' }
                )
        ),
    async execute(interaction) {
        try {
            const clientUser = interaction.client.user;
            const clientId = clientUser?.id || '123456789012345678';
            const botName = clientUser?.username || 'GitBot';
            const botAvatar = typeof clientUser?.displayAvatarURL === 'function' ? clientUser.displayAvatarURL() : null;

            // Permissions bits
            const adminPerms = '8';
            // Recommandé: ManageRoles, ManageChannels, Kick, Ban, ManageMessages, EmbedLinks, AttachFiles, ReadHistory, ModerateMembers, AddReactions
            const recommendedPerms = '1099511627775';
            // Basique: ViewChannel, SendMessages, EmbedLinks, AttachFiles, ReadMessageHistory
            const basicPerms = '274878220288';

            const adminInviteUrl = `https://discord.com/oauth2/authorize?client_id=${clientId}&permissions=${adminPerms}&scope=bot%20applications.commands`;
            const recommendedInviteUrl = `https://discord.com/oauth2/authorize?client_id=${clientId}&permissions=${recommendedPerms}&scope=bot%20applications.commands`;
            const basicInviteUrl = `https://discord.com/oauth2/authorize?client_id=${clientId}&permissions=${basicPerms}&scope=bot%20applications.commands`;

            const chosenType = interaction.options.getString('permissions') || 'recommended';
            let primaryUrl = recommendedInviteUrl;
            let primaryLabel = 'Inviter le Bot (Recommandé)';

            if (chosenType === 'admin') {
                primaryUrl = adminInviteUrl;
                primaryLabel = 'Inviter le Bot (Admin)';
            } else if (chosenType === 'basic') {
                primaryUrl = basicInviteUrl;
                primaryLabel = 'Inviter le Bot (Basique)';
            }

            const embed = new EmbedBuilder()
                .setColor('#5865F2')
                .setTitle(`🤖 Inviter ${botName} sur votre serveur`)
                .setDescription(
                    `Souhaitez-vous ajouter **${botName}** à votre serveur Discord ?\n` +
                    `Cliquez sur l'un des boutons ci-dessous pour l'inviter avec les permissions appropriées.`
                )
                .addFields(
                    {
                        name: '⭐ Invitation Recommandée',
                        value: `[Cliquez ici pour inviter le bot](${recommendedInviteUrl})\n*Comprend la modération, la surveillance, l'économie, les giveaways et les tickets.*`,
                        inline: false
                    },
                    {
                        name: '🛡️ Invitation Administrateur',
                        value: `[Lien d'invitation Administrateur](${adminInviteUrl})\n*Donne tous les accès pour un fonctionnement fluide sans configuration de rôles préalable.*`,
                        inline: false
                    },
                    {
                        name: '🔒 Invitation Minimale',
                        value: `[Lien d'invitation Basique](${basicInviteUrl})\n*Permissions restreintes de base (envoi et lecture de messages).*`,
                        inline: false
                    }
                )
                .setFooter({ text: `${botName} • Développé pour la gestion et la sécurité Discord` })
                .setTimestamp();

            if (botAvatar) {
                embed.setThumbnail(botAvatar);
            }

            // Boutons d'action cliquables directs
            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setLabel('🤖 Inviter (Recommandé)')
                    .setStyle(ButtonStyle.Link)
                    .setURL(recommendedInviteUrl),
                new ButtonBuilder()
                    .setLabel('🛡️ Inviter (Admin)')
                    .setStyle(ButtonStyle.Link)
                    .setURL(adminInviteUrl)
            );

            // Lien serveur de support si disponible
            const supportGuild = interaction.client.guilds?.cache?.get('1254376882888114176');
            if (supportGuild && typeof supportGuild.invites?.create === 'function') {
                try {
                    const supportChannel = supportGuild.rulesChannel || supportGuild.systemChannel || supportGuild.channels?.cache?.first();
                    if (supportChannel) {
                        const supportInvite = await supportGuild.invites.create(supportChannel, { maxAge: 0, maxUses: 0 }).catch(() => null);
                        if (supportInvite?.url) {
                            row.addComponents(
                                new ButtonBuilder()
                                    .setLabel('💬 Serveur de Support')
                                    .setStyle(ButtonStyle.Link)
                                    .setURL(supportInvite.url)
                            );
                        }
                    }
                } catch (e) {
                    // Ignore support invite creation errors
                }
            }

            return interaction.reply({
                embeds: [embed],
                components: [row]
            });

        } catch (error) {
            console.error('Erreur lors de la commande invite:', error);
            const errorMsg = error.message || 'Une erreur inattendue est survenue.';
            if (interaction.deferred || interaction.replied) {
                await interaction.editReply({ content: `❌ Erreur: ${errorMsg}` });
            } else {
                await interaction.reply({ content: `❌ Erreur: ${errorMsg}`, ephemeral: true });
            }
        }
    },
};
