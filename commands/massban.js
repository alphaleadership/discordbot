
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

        let bansToExecute = [];
        try {
            if (fs.existsSync('banlist.txt')) {
                const fileContent = fs.readFileSync('banlist.txt', 'utf-8');
                const uniqueIds = new Set();
                
                fileContent.split(/\r?\n/).forEach(line => {
                    const cleanLine = line.trim();
                    if (!cleanLine) return;

                    // Séparer l'ID et la raison au premier caractère pipe "|"
                    const parts = cleanLine.split('|');
                    const firstPart = parts[0].trim();
                    
                    // Extraire l'ID (première partie avant tout espace, tiret, virgule, point-virgule ou dièse)
                    const id = firstPart.split(/[\s\-;,#]+/)[0].trim();
                    
                    if (/^\d{17,20}$/.test(id) && !uniqueIds.has(id)) {
                        uniqueIds.add(id);
                        
                        // Récupérer la raison après le premier pipe "|"
                        let inlineReason = parts.slice(1).join('|').trim();
                        bansToExecute.push({ id, inlineReason: inlineReason || null });
                    }
                });
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

        if (bansToExecute.length === 0) {
            return interaction.editReply({
                content: 'ℹ️ Aucun utilisateur trouvé dans banlist.txt',
                ephemeral: true
            });
        }

        const defaultReason = interaction.options.getString('raison') || 'Bannissement en masse via commande';
        let successCount = 0;
        const failedBans = [];
        
        for (const banInfo of bansToExecute) {
            try {
                const banReason = banInfo.inlineReason ? banInfo.inlineReason : defaultReason;
                await interaction.guild.members.ban(banInfo.id, { reason: `Massban: ${banReason}` });
                console.log(`Utilisateur ${banInfo.id} banni avec succès via massban avec raison : ${banReason}`);
                successCount++;
            } catch (error) {
                console.error(`Erreur lors du bannissement de ${banInfo.id}:`, error);
                failedBans.push(banInfo.id);
            }
        }
        
        let replyMessage = `✅ ${successCount} utilisateur(s) banni(s) avec succès.`;
        
        if (failedBans.length > 0) {
            replyMessage += `\n❌ Échec du bannissement pour les IDs: ${failedBans.join(', ')}`;
        }
        
        await interaction.editReply({ content: replyMessage });
    },
};
