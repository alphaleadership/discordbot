import { SlashCommandBuilder, EmbedBuilder, PermissionsBitField } from 'discord.js';

export default {
    data: new SlashCommandBuilder()
        .setName('unban')
        .setDescription('Débannir un utilisateur du serveur')
        .addStringOption(option =>
            option.setName('utilisateur-id')
                .setDescription('L\'ID de l\'utilisateur à débannir')
                .setRequired(true)
        )
        .addStringOption(option =>
            option.setName('raison')
                .setDescription('La raison du débannissement')
                .setRequired(false)
        ),
    async execute(interaction, adminManager, permissionValidator, moderationLogger) {
        try {
            const userId = interaction.options.getString('utilisateur-id');
            const reason = interaction.options.getString('raison') || 'Aucune raison spécifiée';
            
            // Validate user ID format (Discord IDs are 17-19 digits)
            if (!/^\d{17,19}$/.test(userId)) {
                return interaction.reply({
                    content: '❌ Format d\'ID utilisateur invalide. Les IDs Discord contiennent 17-19 chiffres.',
                    ephemeral: true
                });
            }

            // Check if moderator has ban permissions (required for unban)
            const permissionResult = permissionValidator.validateBanPermission(
                interaction.member,
                { id: userId } // Pass a minimal user object for validation
            );

            if (!permissionResult.success) {
                return interaction.reply({
                    content: permissionResult.message,
                    ephemeral: true
                });
            }

            // Check if user is actually banned
            let bannedUser = null;
            try {
                const bans = await interaction.guild.bans.fetch();
                bannedUser = bans.get(userId);
                
                if (!bannedUser) {
                    return interaction.reply({
                        content: '❌ Cet utilisateur n\'est pas banni sur ce serveur.',
                        ephemeral: true
                    });
                }
            } catch (error) {
                console.error('Erreur lors de la récupération des bannissements:', error);
                return interaction.reply({
                    content: '❌ Impossible de vérifier les bannissements du serveur.',
                    ephemeral: true
                });
            }

            // Execute unban
            try {
                await interaction.guild.members.unban(userId, reason);
                
                // Try to get user info for better display
                let userInfo = `ID: ${userId}`;
                if (bannedUser.user) {
                    userInfo = `${bannedUser.user.tag} (${userId})`;
                }
                
                // Create success embed
                const successEmbed = new EmbedBuilder()
                    .setColor('#00FF00')
                    .setTitle('✅ Débannissement réussi')
                    .addFields(
                        { name: 'Utilisateur', value: userInfo },
                        { name: 'Raison du débannissement', value: reason },
                        { name: 'Raison du bannissement original', value: bannedUser.reason || 'Aucune raison enregistrée' },
                        { name: 'Modérateur', value: interaction.user.tag },
                        { name: 'Date', value: new Date().toLocaleString('fr-FR') }
                    );

                await interaction.reply({ embeds: [successEmbed] });

                // Try to send DM to unbanned user
                try {
                    const user = await interaction.client.users.fetch(userId);
                    
                    const unbanEmbed = new EmbedBuilder()
                        .setColor('#00FF00')
                        .setTitle('✅ Débannissement')
                        .setDescription(`Vous avez été débanni de **${interaction.guild.name}**.`)
                        .addFields(
                            { name: 'Raison du débannissement', value: reason },
                            { name: 'Modérateur', value: interaction.user.tag },
                            { name: 'Date', value: new Date().toLocaleString('fr-FR') }
                        )
                        .setFooter({ text: 'Vous pouvez maintenant rejoindre le serveur avec une nouvelle invitation.' });

                    await user.send({ embeds: [unbanEmbed] });
                    
                    await interaction.followUp({
                        content: '📨 Un message privé a été envoyé à l\'utilisateur pour l\'informer du débannissement.',
                        ephemeral: true
                    });
                } catch (error) {
                    console.log(`Impossible d'envoyer un MP à l'utilisateur ${userId} après le débannissement`);
                }

                // Log the action with ModerationLogger
                if (moderationLogger) {
                    await moderationLogger.logModerationAction({
                        type: 'unban',
                        moderatorId: interaction.user.id,
                        moderatorTag: interaction.user.tag,
                        targetId: userId,
                        targetTag: bannedUser.user ? bannedUser.user.tag : `Unknown (${userId})`,
                        guildId: interaction.guild.id,
                        guildName: interaction.guild.name,
                        reason: reason,
                        success: true,
                        channelId: interaction.channel.id,
                        details: {
                            originalBanReason: bannedUser.reason,
                            dmSent: false // Will be updated below if DM is sent
                        }
                    });
                }
                
                // Legacy console logging
                console.log(`[UNBAN] ${userInfo} débanni par ${interaction.user.tag} (${interaction.user.id}) - Raison: ${reason}`);

            } catch (error) {
                console.error('Erreur lors du débannissement:', error);
                
                // Log failed action with ModerationLogger
                if (moderationLogger) {
                    await moderationLogger.logModerationAction({
                        type: 'unban',
                        moderatorId: interaction.user.id,
                        moderatorTag: interaction.user.tag,
                        targetId: userId,
                        targetTag: bannedUser?.user ? bannedUser.user.tag : `Unknown (${userId})`,
                        guildId: interaction.guild.id,
                        guildName: interaction.guild.name,
                        reason: reason,
                        success: false,
                        channelId: interaction.channel.id,
                        details: {
                            errorCode: error.code,
                            errorMessage: error.message
                        }
                    });
                }
                
                let errorMessage = '❌ Une erreur est survenue lors du débannissement.';
                
                if (error.code === 50013) {
                    errorMessage = '❌ Je n\'ai pas les permissions nécessaires pour débannir cet utilisateur.';
                } else if (error.code === 10007) {
                    errorMessage = '❌ Utilisateur non trouvé ou non banni.';
                } else if (error.code === 50001) {
                    errorMessage = '❌ Accès manquant pour effectuer cette action.';
                }

                return interaction.reply({
                    content: errorMessage,
                    ephemeral: true
                });
            }

        } catch (error) {
            console.error('Erreur dans la commande unban:', error);
            
            const errorMessage = '❌ Une erreur inattendue est survenue lors de l\'exécution de la commande.';
            
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
};