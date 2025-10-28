import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';

export default {
    data: new SlashCommandBuilder()
        .setName('transfer')
        .setDescription('Transfer currency to another user')
        .addUserOption(option =>
            option.setName('recipient')
                .setDescription('The user to transfer currency to')
                .setRequired(true))
        .addIntegerOption(option =>
            option.setName('amount')
                .setDescription('Amount of currency to transfer')
                .setRequired(true)
                .setMinValue(1)
                .setMaxValue(1000000)),
    
    async execute(interaction, adminManager, warnManager, guildConfig, sharedConfig, backupToGitHub, reportManager, banlistManager, blockedWordsManager, watchlistManager, telegramIntegration, funCommandsManager, raidDetector, doxDetector, enhancedReloadSystem, permissionValidator, dmTicketManager, economyManager) {
        try {
            if (!economyManager) {
                return await interaction.reply({
                    content: '❌ Le système économique n\'est pas disponible.',
                    ephemeral: true
                });
            }

            const recipient = interaction.options.getUser('recipient');
            const amount = interaction.options.getInteger('amount');
            const guildId = interaction.guild.id;

            // Validate recipient
            if (recipient.bot) {
                return await interaction.reply({
                    content: '❌ Vous ne pouvez pas transférer de l\'argent à un bot.',
                    ephemeral: true
                });
            }

            if (recipient.id === interaction.user.id) {
                return await interaction.reply({
                    content: '❌ Vous ne pouvez pas vous transférer de l\'argent à vous-même.',
                    ephemeral: true
                });
            }

            // Check sender's balance first
            const senderBalance = await economyManager.getBalance(interaction.user.id, guildId);
            if (senderBalance < amount) {
                return await interaction.reply({
                    content: `❌ Balance insuffisante. Vous avez ${senderBalance.toLocaleString()} coins, mais vous essayez de transférer ${amount.toLocaleString()} coins.`,
                    ephemeral: true
                });
            }

            // Perform the transfer
            const result = await economyManager.transferCurrency(
                interaction.user.id,
                recipient.id,
                guildId,
                amount
            );

            if (result.success) {
                const embed = new EmbedBuilder()
                    .setColor('#00ff00')
                    .setTitle('💸 Transfert Réussi')
                    .setDescription(`**${amount.toLocaleString()}** coins ont été transférés avec succès!`)
                    .addFields(
                        { 
                            name: '👤 Expéditeur', 
                            value: `${interaction.user.username}\n💰 Nouvelle balance: **${result.fromBalance.toLocaleString()}** coins`, 
                            inline: true 
                        },
                        { 
                            name: '👤 Destinataire', 
                            value: `${recipient.username}\n💰 Nouvelle balance: **${result.toBalance.toLocaleString()}** coins`, 
                            inline: true 
                        },
                        { 
                            name: '📊 Détails du Transfert', 
                            value: `Montant: **${amount.toLocaleString()}** coins\nDate: ${new Date().toLocaleString()}`, 
                            inline: false 
                        }
                    )
                    .setFooter({ text: 'Transfert effectué avec succès' })
                    .setTimestamp();

                await interaction.reply({ embeds: [embed] });

                // Try to notify the recipient via DM
                try {
                    const recipientEmbed = new EmbedBuilder()
                        .setColor('#00ff00')
                        .setTitle('💰 Vous avez reçu des coins!')
                        .setDescription(`**${interaction.user.username}** vous a transféré **${amount.toLocaleString()}** coins!`)
                        .addFields(
                            { name: 'Serveur', value: interaction.guild.name, inline: true },
                            { name: 'Nouvelle Balance', value: `${result.toBalance.toLocaleString()} coins`, inline: true }
                        )
                        .setThumbnail(interaction.user.displayAvatarURL({ dynamic: true }))
                        .setTimestamp();

                    await recipient.send({ embeds: [recipientEmbed] });
                } catch (dmError) {
                    // Silently fail if DM can't be sent
                    console.log(`Could not send DM notification to ${recipient.tag}`);
                }

            } else {
                await interaction.reply({
                    content: `❌ Échec du transfert: ${result.message}`,
                    ephemeral: true
                });
            }

        } catch (error) {
            console.error('Error in transfer command:', error);
            await interaction.reply({
                content: '❌ Une erreur est survenue lors du transfert.',
                ephemeral: true
            });
        }
    },
};