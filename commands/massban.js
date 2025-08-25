
import { SlashCommandBuilder } from 'discord.js';
import fs from 'fs';

export default {
    data: new SlashCommandBuilder()
        .setName('massban')
        .setDescription('Bannir tous les utilisateurs listés dans banlist.txt')
        .addStringOption(option =>
            option.setName('raison')
                .setDescription('Raison du bannissement (optionnel)')
                .setRequired(false)
        ),
    async execute(interaction, adminManager) {
        const isAdmin = adminManager.isAdmin(interaction.user.id);
        if (!isAdmin) {
            return interaction.reply({
                content: '❌ Seuls les administrateurs peuvent utiliser cette commande.',
                ephemeral: true
            });
        }

        if (!interaction.guild) {
            return interaction.reply({
                content: '❌ Cette commande ne peut être utilisée que dans un serveur.',
                ephemeral: true
            });
        }

        await interaction.deferReply({ ephemeral: true });

        let userIds = [];
        try {
            if (fs.existsSync('banlist.txt')) {
                const fileContent = fs.readFileSync('banlist.txt', 'utf-8');
                userIds = fileContent
                    .split('\n')
                    .filter(line => line.trim() !== '')
                    .map(line => line.split(' - ')[0].trim())
                    .filter((id, index, self) => self.indexOf(id) === index);
            } else {
                return interaction.editReply({
                    content: '❌ Le fichier banlist.txt est introuvable.',
                    ephemeral: true
                });
            }
        } catch (error) {
            console.error('Erreur lors de la lecture de banlist.txt:', error);
            return interaction.editReply({
                content: '❌ Erreur lors de la lecture du fichier banlist.txt',
                ephemeral: true
            });
        }

        if (userIds.length === 0) {
            return interaction.editReply({
                content: 'ℹ️ Aucun utilisateur trouvé dans banlist.txt',
                ephemeral: true
            });
        }

        const reason = interaction.options.getString('raison') || 'Bannissement en masse via commande';
        let successCount = 0;
        const failedBans = [];
        
        for (const userId of userIds) {
            try {
                await interaction.guild.members.ban(userId, { reason: `Massban: ${reason}` });
                console.log(`Utilisateur ${userId} banni avec succès via massban`);
                successCount++;
            } catch (error) {
                console.error(`Erreur lors du bannissement de ${userId}:`, error);
                failedBans.push(userId);
            }
        }
        
        let replyMessage = `✅ ${successCount} utilisateur(s) banni(s) avec succès.`;
        
        if (failedBans.length > 0) {
            replyMessage += `\n❌ Échec du bannissement pour les IDs: ${failedBans.join(', ')}`;
        }
        
        await interaction.editReply({ content: replyMessage });
    },
};
