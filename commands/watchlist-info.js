import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';

export default {
    data: new SlashCommandBuilder()
        .setName('watchlist-info')
        .setDescription('Afficher les informations détaillées d\'un utilisateur surveillé')
        .addUserOption(option =>
            option.setName('utilisateur')
                .setDescription('L\'utilisateur dont afficher les informations')
                .setRequired(true)
        ),
    async execute(interaction, adminManager, permissionValidator, watchlistManager) {
        try {
            const targetUser = interaction.options.getUser('utilisateur');

            // Validate permissions using PermissionValidator
            const permissionResult = permissionValidator.validateWatchlistPermission(interaction.member);

            if (!permissionResult.success) {
                return interaction.reply({
                    content: permissionResult.message,
                    ephemeral: true
                });
            }

            // Get watchlist entry
            const entry = watchlistManager.getWatchlistEntry(targetUser.id, interaction.guild.id);
            
            if (!entry || !entry.active) {
                return interaction.reply({
                    content: `❌ L'utilisateur ${targetUser.tag} n'est pas sur la liste de surveillance de ce serveur.`,
                    ephemeral: true
                });
            }

            // Try to get current member info
            let currentMemberInfo = null;
            try {
                const member = await interaction.guild.members.fetch(targetUser.id);
                currentMemberInfo = {
                    isInGuild: true,
                    joinedAt: member.joinedAt,
                    roles: member.roles.cache.filter(role => role.id !== interaction.guild.id).map(role => role.name),
                    nickname: member.nickname
                };
            } catch (error) {
                currentMemberInfo = { isInGuild: false };
            }

            // Create detailed info embed
            const infoEmbed = new EmbedBuilder()
                .setColor('#FFA500')
                .setTitle(`👁️ Informations de surveillance - ${targetUser.tag}`)
                .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
                .addFields(
                    { name: 'ID Utilisateur', value: targetUser.id, inline: true },
                    { name: 'Nom d\'utilisateur', value: targetUser.tag, inline: true },
                    { name: 'Statut sur le serveur', value: currentMemberInfo.isInGuild ? '✅ Présent' : '❌ Absent', inline: true }
                );

            // Add current member info if in guild
            if (currentMemberInfo.isInGuild) {
                if (currentMemberInfo.nickname) {
                    infoEmbed.addFields({ name: 'Surnom', value: currentMemberInfo.nickname, inline: true });
                }
                
                if (currentMemberInfo.joinedAt) {
                    infoEmbed.addFields({ 
                        name: 'Rejoint le serveur', 
                        value: currentMemberInfo.joinedAt.toLocaleString('fr-FR'), 
                        inline: true 
                    });
                }

                if (currentMemberInfo.roles.length > 0) {
                    const rolesText = currentMemberInfo.roles.slice(0, 10).join(', ');
                    const moreRoles = currentMemberInfo.roles.length > 10 ? ` (+${currentMemberInfo.roles.length - 10} autres)` : '';
                    infoEmbed.addFields({ 
                        name: `Rôles (${currentMemberInfo.roles.length})`, 
                        value: rolesText + moreRoles, 
                        inline: false 
                    });
                }
            }

            // Add surveillance info
            const watchLevelDisplay = this.getWatchLevelDisplay(entry.watchLevel);
            infoEmbed.addFields(
                { name: 'Niveau de surveillance', value: watchLevelDisplay, inline: true },
                { name: 'Raison de surveillance', value: entry.reason, inline: false },
                { name: 'Ajouté par', value: `<@${entry.addedBy}>`, inline: true },
                { name: 'Ajouté le', value: new Date(entry.addedAt).toLocaleString('fr-FR'), inline: true }
            );

            if (entry.lastSeen) {
                infoEmbed.addFields({ 
                    name: 'Dernière activité', 
                    value: new Date(entry.lastSeen).toLocaleString('fr-FR'), 
                    inline: true 
                });
            }

            // Add notes section
            if (entry.notes && entry.notes.length > 0) {
                const recentNotes = entry.notes
                    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
                    .slice(0, 5); // Show last 5 notes

                let notesText = '';
                for (const note of recentNotes) {
                    const noteDate = new Date(note.timestamp).toLocaleDateString('fr-FR');
                    const notePreview = note.note.length > 100 ? note.note.substring(0, 97) + '...' : note.note;
                    notesText += `**${noteDate}** - <@${note.moderatorId}>: ${notePreview}\n`;
                }

                if (entry.notes.length > 5) {
                    notesText += `\n*... et ${entry.notes.length - 5} autre(s) note(s)*`;
                }

                infoEmbed.addFields({
                    name: `📝 Notes (${entry.notes.length})`,
                    value: notesText,
                    inline: false
                });
            } else {
                infoEmbed.addFields({
                    name: '📝 Notes',
                    value: 'Aucune note enregistrée',
                    inline: false
                });
            }

            // Add incidents section
            if (entry.incidents && entry.incidents.length > 0) {
                const recentIncidents = entry.incidents
                    .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
                    .slice(0, 3); // Show last 3 incidents

                let incidentsText = '';
                for (const incident of recentIncidents) {
                    const incidentDate = new Date(incident.timestamp).toLocaleDateString('fr-FR');
                    const incidentPreview = incident.description.length > 80 ? incident.description.substring(0, 77) + '...' : incident.description;
                    incidentsText += `**${incidentDate}** - ${incident.type}: ${incidentPreview}\n`;
                }

                if (entry.incidents.length > 3) {
                    incidentsText += `\n*... et ${entry.incidents.length - 3} autre(s) incident(s)*`;
                }

                infoEmbed.addFields({
                    name: `🚨 Incidents récents (${entry.incidents.length})`,
                    value: incidentsText,
                    inline: false
                });
            } else {
                infoEmbed.addFields({
                    name: '🚨 Incidents',
                    value: 'Aucun incident enregistré',
                    inline: false
                });
            }

            // Add footer with helpful commands
            infoEmbed.setFooter({ 
                text: 'Utilisez /watchlist-note pour ajouter une note | /watchlist-remove pour retirer de la surveillance' 
            });

            await interaction.reply({ embeds: [infoEmbed], ephemeral: true });

            // Log the action
            console.log(`[WATCHLIST-INFO] Informations consultées pour ${targetUser.tag} (${targetUser.id}) par ${interaction.user.tag} (${interaction.user.id}) - Serveur: ${interaction.guild.name}`);

        } catch (error) {
            console.error('Erreur dans la commande watchlist-info:', error);
            
            const errorMessage = '❌ Une erreur inattendue est survenue lors de l\'affichage des informations de surveillance.';
            
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp({
                    content: errorMessage,
                    ephemeral: true
                });
            } else {
                await interaction.reply({
                    content: errorMessage,
                    ephemeral: true
                });
            }
        }
    },

    /**
     * Gets display text for watch level
     * @param {string} watchLevel - The watch level
     * @returns {string} Display text
     */
    getWatchLevelDisplay(watchLevel) {
        const levels = {
            'observe': '🔍 Observer - Enregistrement des activités',
            'alert': '🚨 Alerte - Notifications aux modérateurs',
            'action': '⚡ Action - Alerte + actions automatiques'
        };
        return levels[watchLevel] || watchLevel;
    }
};