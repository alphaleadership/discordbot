import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';

export default {
    data: new SlashCommandBuilder()
        .setName('watchlist-note')
        .setDescription('Ajouter une note à un utilisateur surveillé')
        .addUserOption(option =>
            option.setName('utilisateur')
                .setDescription('L\'utilisateur auquel ajouter une note')
                .setRequired(true)
        )
        .addStringOption(option =>
            option.setName('note')
                .setDescription('La note à ajouter')
                .setRequired(true)
        ),
    async execute(interaction, adminManager, permissionValidator, watchlistManager) {
        try {
            const targetUser = interaction.options.getUser('utilisateur');
            const noteText = interaction.options.getString('note');

            // Validate permissions using PermissionValidator
            const permissionResult = permissionValidator.validateWatchlistPermission(interaction.member);

            if (!permissionResult.success) {
                return interaction.reply({
                    content: permissionResult.message,
                    ephemeral: true
                });
            }

            // Validate note content
            if (noteText.trim().length < 3) {
                return interaction.reply({
                    content: '❌ La note doit contenir au moins 3 caractères.',
                    ephemeral: true
                });
            }

            if (noteText.length > 1000) {
                return interaction.reply({
                    content: '❌ La note ne peut pas dépasser 1000 caractères.',
                    ephemeral: true
                });
            }

            // Check if user is on watchlist
            const entry = watchlistManager.getWatchlistEntry(targetUser.id, interaction.guild.id);
            
            if (!entry || !entry.active) {
                return interaction.reply({
                    content: `❌ L'utilisateur ${targetUser.tag} n'est pas sur la liste de surveillance de ce serveur. Utilisez \`/watchlist-add\` pour l'ajouter d'abord.`,
                    ephemeral: true
                });
            }

            // Add note to watchlist entry
            const result = await watchlistManager.addNote(
                targetUser.id,
                interaction.guild.id,
                noteText.trim(),
                interaction.user.id
            );

            if (!result.success) {
                return interaction.reply({
                    content: `❌ ${result.error}`,
                    ephemeral: true
                });
            }

            // Create success embed
            const successEmbed = new EmbedBuilder()
                .setColor('#00FF00')
                .setTitle('📝 Note ajoutée avec succès')
                .addFields(
                    { name: 'Utilisateur surveillé', value: `${targetUser.tag} (${targetUser.id})` },
                    { name: 'Note ajoutée', value: noteText },
                    { name: 'Modérateur', value: interaction.user.tag },
                    { name: 'Date', value: new Date().toLocaleString('fr-FR') }
                );

            // Add context about the surveillance
            const watchLevelDisplay = this.getWatchLevelDisplay(entry.watchLevel);
            successEmbed.addFields(
                { name: 'Niveau de surveillance', value: watchLevelDisplay, inline: true },
                { name: 'Total des notes', value: `${(entry.notes?.length || 0) + 1}`, inline: true }
            );

            // Add surveillance reason for context
            if (entry.reason) {
                let displayReason = entry.reason;
                if (displayReason.length > 200) {
                    displayReason = displayReason.substring(0, 197) + '...';
                }
                successEmbed.addFields({
                    name: 'Raison de surveillance',
                    value: displayReason,
                    inline: false
                });
            }

            await interaction.reply({ embeds: [successEmbed] });

            // Log the action
            console.log(`[WATCHLIST-NOTE] Note ajoutée pour ${targetUser.tag} (${targetUser.id}) par ${interaction.user.tag} (${interaction.user.id}) - Serveur: ${interaction.guild.name} - Note: ${noteText.substring(0, 100)}${noteText.length > 100 ? '...' : ''}`);

        } catch (error) {
            console.error('Erreur dans la commande watchlist-note:', error);
            
            const errorMessage = '❌ Une erreur inattendue est survenue lors de l\'ajout de la note.';
            
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
            'observe': '🔍 Observer',
            'alert': '🚨 Alerte',
            'action': '⚡ Action'
        };
        return levels[watchLevel] || watchLevel;
    }
};