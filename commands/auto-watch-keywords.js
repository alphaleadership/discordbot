import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import fs from 'fs/promises';
import path from 'path';

export default {
    data: new SlashCommandBuilder()
        .setName('auto-watch-keywords')
        .setDescription('Gérer les mots-clés pour la surveillance automatique')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addSubcommand(subcommand =>
            subcommand
                .setName('add')
                .setDescription('Ajouter un mot-clé à surveiller')
                .addStringOption(option =>
                    option.setName('mot')
                        .setDescription('Le mot-clé à ajouter')
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('remove')
                .setDescription('Supprimer un mot-clé de la surveillance')
                .addStringOption(option =>
                    option.setName('mot')
                        .setDescription('Le mot-clé à supprimer')
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('list')
                .setDescription('Afficher la liste des mots-clés surveillés')
        ),

    async execute(interaction) {
        const keywordsFile = path.join(process.cwd(), 'data', 'watchlist_keywords.txt');
        
        // Ensure the data directory exists
        await fs.mkdir(path.dirname(keywordsFile), { recursive: true });

        try {
            // Read existing keywords
            let keywords = [];
            try {
                const content = await fs.readFile(keywordsFile, 'utf-8');
                keywords = content.split('\n').filter(k => k.trim() !== '');
            } catch (error) {
                if (error.code !== 'ENOENT') throw error;
            }

            const subcommand = interaction.options.getSubcommand();
            
            switch (subcommand) {
                case 'add': {
                    const word = interaction.options.getString('mot').toLowerCase();
                    
                    if (keywords.includes(word)) {
                        return interaction.reply({
                            content: `Le mot-clé "${word}" est déjà dans la liste de surveillance.`,
                            ephemeral: true
                        });
                    }
                    
                    keywords.push(word);
                    await fs.writeFile(keywordsFile, keywords.join('\n'));
                    
                    return interaction.reply({
                        content: `Le mot-clé "${word}" a été ajouté à la liste de surveillance.`,
                        ephemeral: true
                    });
                }
                
                case 'remove': {
                    const word = interaction.options.getString('mot').toLowerCase();
                    
                    if (!keywords.includes(word)) {
                        return interaction.reply({
                            content: `Le mot-clé "${word}" n'est pas dans la liste de surveillance.`,
                            ephemeral: true
                        });
                    }
                    
                    const updatedKeywords = keywords.filter(k => k !== word);
                    await fs.writeFile(keywordsFile, updatedKeywords.join('\n'));
                    
                    return interaction.reply({
                        content: `Le mot-clé "${word}" a été retiré de la liste de surveillance.`,
                        ephemeral: true
                    });
                }
                
                case 'list': {
                    if (keywords.length === 0) {
                        return interaction.reply({
                            content: 'Aucun mot-clé n\'est actuellement surveillé.',
                            ephemeral: true
                        });
                    }
                    
                    return interaction.reply({
                        content: `**Mots-clés surveillés (${keywords.length})**:\n${keywords.map(k => `• ${k}`).join('\n')}`,
                        ephemeral: true
                    });
                }
            }
        } catch (error) {
            console.error('Erreur dans la commande auto-watch-keywords:', error);
            return interaction.reply({
                content: 'Une erreur est survenue lors de l\'exécution de la commande.',
                ephemeral: true
            });
        }
    }
};
