import { SlashCommandBuilder, EmbedBuilder, PermissionsBitField } from 'discord.js';

export default {
    data: new SlashCommandBuilder()
        .setName('roleinfo')
        .setDescription('Affiche des informations détaillées sur un rôle')
        .addRoleOption(option =>
            option.setName('role')
                .setDescription('Le rôle à analyser')
                .setRequired(true)
        ),
    
    async execute(interaction, adminManager) {
        try {
            const role = interaction.options.getRole('role');
            if (!role) {
                return await interaction.reply({
                    content: '❌ Rôle introuvable.',
                    ephemeral: true
                });
            }

            const guild = interaction.guild;
            
            // Calculer le nombre de membres ayant ce rôle
            let memberCount = 0;
            try {
                const allMembers = await guild.members.fetch();
                memberCount = allMembers.filter(m => m.roles.cache.has(role.id)).size;
            } catch (err) {
                memberCount = role.members.size;
            }

            // Récupérer les permissions clés du rôle
            const keyPermissions = [];
            const permMap = {
                Administrator: 'Administrateur',
                ManageGuild: 'Gérer le serveur',
                ManageRoles: 'Gérer les rôles',
                ManageChannels: 'Gérer les salons',
                KickMembers: 'Expulser des membres',
                BanMembers: 'Bannir des membres',
                ModerateMembers: 'Exclure temporairement (Timeout)',
                ManageMessages: 'Gérer les messages',
                MentionEveryone: 'Mentionner everyone/here',
                ViewAuditLog: 'Voir les logs d\'audit'
            };

            for (const [permFlag, permName] of Object.entries(permMap)) {
                if (role.permissions.has(PermissionsBitField.Flags[permFlag])) {
                    keyPermissions.push(`• ${permName}`);
                }
            }

            const permListText = keyPermissions.length > 0 ? keyPermissions.join('\n') : 'Aucune permission administrative/clé';

            // Infos de base
            const creationDate = `<t:${Math.floor(role.createdTimestamp / 1000)}:F> (<t:${Math.floor(role.createdTimestamp / 1000)}:R>)`;
            const colorHex = role.color === 0 ? '#None' : role.hexColor.toUpperCase();

            const embed = new EmbedBuilder()
                .setColor(role.color || '#3498db')
                .setTitle(`🎭 Informations sur le rôle : ${role.name}`)
                .setDescription(`Détails complets du rôle <@&${role.id}> dans **${guild.name}**`)
                .setThumbnail(guild.iconURL({ dynamic: true }))
                .addFields(
                    { name: '📝 Nom du rôle', value: role.name, inline: true },
                    { name: '🆔 ID du rôle', value: `\`${role.id}\``, inline: true },
                    { name: '🎨 Couleur', value: `Hex: \`${colorHex}\` (Decimal: \`${role.color}\`)`, inline: true },
                    { name: '👥 Membres possédant ce rôle', value: `**${memberCount}** membre(s)`, inline: true },
                    { name: '📊 Position dans la hiérarchie', value: `Position: \`${role.position}\` (Total rôles: \`${guild.roles.cache.size}\`)`, inline: true },
                    { name: '🔔 Mentionnable', value: role.mentionable ? '✅ Oui' : '❌ Non', inline: true },
                    { name: '👁️ Affiché séparément (Hoist)', value: role.hoist ? '✅ Oui' : '❌ Non', inline: true },
                    { name: '📅 Date de création', value: creationDate, inline: false },
                    { name: '🛡️ Permissions clés', value: permListText, inline: false }
                )
                .setFooter({ text: `Demandé par ${interaction.user.tag}` })
                .setTimestamp();

            await interaction.reply({ embeds: [embed] });

        } catch (error) {
            console.error('Erreur dans la commande roleinfo:', error);
            await interaction.reply({
                content: '❌ Une erreur est survenue lors de l\'exécution de la commande.',
                ephemeral: true
            });
        }
    }
};
