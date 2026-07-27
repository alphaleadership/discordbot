import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';

export default {
    data: new SlashCommandBuilder()
        .setName('daily-bonus')
        .setDescription('Claim your daily currency bonus'),
    
    async execute(interaction, adminManager, warnManager, guildConfig, sharedConfig, backupToGitHub, reportManager, banlistManager, blockedWordsManager, watchlistManager, telegramIntegration, funCommandsManager, raidDetector, doxDetector, enhancedReloadSystem, permissionValidator, dmTicketManager, economyManager) {
        try {
            if (!economyManager) {
                return await interaction.reply({
                    content: '❌ Le système économique n\'est pas disponible.',
                    ephemeral: true
                });
            }

            const userId = interaction.user.id;
            const guildId = interaction.guild.id;

            // Claim daily bonus
            const result = await economyManager.claimDailyBonus(userId, guildId);

            if (!result.success) {
                let message = '❌ Une erreur est survenue lors de la réclamation.';
                if (result.message === 'Daily bonus already claimed today') {
                    message = '❌ Vous avez déjà réclamé votre bonus quotidien aujourd\'hui. Revenez demain !';
                }
                return await interaction.reply({
                    content: message,
                    ephemeral: true
                });
            }

            const embed = new EmbedBuilder()
                .setColor('#00ff00')
                .setTitle('🎁 Bonus Quotidien Réclamé !')
                .setDescription(`Félicitations **${interaction.user.username}** ! Vous avez reçu votre bonus de **${result.amountClaimed.toLocaleString()}** coins.`)
                .addFields(
                    { name: '💵 Nouveau Solde', value: `**${result.newBalance.toLocaleString()}** coins`, inline: true },
                    { name: '📈 Valeur Marchande', value: `**${result.currentValue.toFixed(2)}**x`, inline: true }
                )
                .setTimestamp();

            await interaction.reply({ embeds: [embed] });

        } catch (error) {
            console.error('Error in daily-bonus command:', error);
            await interaction.reply({
                content: '❌ Une erreur est survenue lors de la réclamation de votre bonus quotidien.',
                ephemeral: true
            });
        }
    }
};
