import { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } from 'discord.js';
import fs from 'fs/promises';
import path from 'path';

export default {
    data: new SlashCommandBuilder()
        .setName('viewbanlist')
        .setDescription('Affiche la liste des utilisateurs bannis du serveur')
        .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers)
        .setDMPermission(false)
        .addIntegerOption(option =>
            option.setName('page')
                .setDescription('Numéro de la page à afficher (10 entrées par page)')
                .setMinValue(1)
                .setRequired(false)
        ),
    
    async execute(interaction) {
        try {
            await interaction.deferReply({ ephemeral: true });
            
            const banlistPath = path.join(process.cwd(), 'banlist.txt');
            let banlistContent;
            try {
                banlistContent = await fs.readFile(banlistPath, 'utf8');
            } catch (error) {
                if (error.code === 'ENOENT') {
                    return interaction.editReply({
                        content: 'ℹ️ Le fichier `banlist.txt` n\'existe pas ou est vide.',
                        ephemeral: true
                    });
                }
                console.error('Erreur lors de la lecture de banlist.txt:', error);
                return interaction.editReply({
                    content: '❌ Une erreur est survenue lors de la lecture de la banlist.',
                    ephemeral: true
                });
            }
            
                        const bannedEntries = banlistContent.split(/\r?\n/)
                .filter(line => line.trim() !== '')
                .map(line => {
                    const match = line.match(/^(\d+) - (.*?)(?: \| Ajouté par: (\d+))?(?: \| Le: (.*))?$/);
                    if (match) {
                        return {
                            userId: match[1],
                            reason: match[2] || 'Raison non spécifiée',
                            authorId: match[3] || 'Inconnu' // Capture authorId
                        };
                    }
                    return null; // Or handle invalid lines differently
                })
                .filter(entry => entry !== null); // Filter out null entries
            const totalBans = bannedEntries.length;
            
            if (totalBans === 0) {
                return interaction.editReply({
                    content: 'ℹ️ Le fichier `banlist.txt` est vide.',
                    ephemeral: true
                });
            }
            
            const page = interaction.options.getInteger('page') || 1;
            const itemsPerPage = 10;
            const skip = (page - 1) * itemsPerPage;
            const totalPages = Math.ceil(totalBans / itemsPerPage);
            
            if (page < 1 || (totalPages > 0 && page > totalPages)) {
                return interaction.editReply({
                    content: `❌ Numéro de page invalide. Veuillez choisir une page entre 1 et ${totalPages || 1}.`,
                    ephemeral: true
                });
            }
            
            const pageEntries = bannedEntries.slice(skip, skip + itemsPerPage);
            const embed = new EmbedBuilder()
                .setColor('#2F3136')
                .setTitle(`🔨 Liste des bannis (fichier banlist.txt - ${totalBans} au total)`)
                .setFooter({
                    text: `Page ${page}/${totalPages || 1} • ${interaction.guild.name}`,
                    iconURL: interaction.guild.iconURL()
                })
                .setTimestamp();
            
            for (const entry of pageEntries) {
                let authorTag = 'Inconnu';
                if (entry.authorId && entry.authorId !== 'Inconnu') {
                    try {
                        const authorUser = await interaction.client.users.fetch(entry.authorId);
                        authorTag = authorUser.tag;
                    } catch (authorFetchError) {
                        console.error(`Impossible de récupérer l'auteur ${entry.authorId}:`, authorFetchError);
                    }
                }

                try {
                    const user = await interaction.client.users.fetch(entry.userId);
                    embed.addFields({
                        name: `👤 ${user.tag} (${user.id})`,
                        value: `📝 **Raison:** ${entry.reason}\n👮 **Banni par:** ${authorTag}`,
                        inline: false
                    });
                } catch (fetchError) {
                    console.error(`Impossible de récupérer l'utilisateur ${entry.userId}:`, fetchError);
                    embed.addFields({
                        name: `👤 Utilisateur inconnu (${entry.userId})`,
                        value: `📝 **Raison:** ${entry.reason} - Utilisateur introuvable\n👮 **Banni par:** ${authorTag}`,
                        inline: false
                    });
                }
            }
            
            if (totalPages > 1) {
                embed.setDescription(`Utilisez l'option \`page\` pour naviguer entre les pages.\nExemple: \\\`/viewbanlist page:${page < totalPages ? page + 1 : page}\\\``);
            }
            
            await interaction.editReply({ embeds: [embed], ephemeral: true });
            
        } catch (error) {
            console.error('Erreur lors de la récupération de la liste des bannis:', error);
            
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({
                    content: '❌ Une erreur est survenue lors de la récupération de la liste des bannis.',
                    ephemeral: true
                });
            } else {
                await interaction.editReply({
                    content: '❌ Une erreur est survenue lors de la récupération de la liste des bannis.',
                    ephemeral: true
                });
            }
        }
    }
};
