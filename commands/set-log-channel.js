import { SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';
import fs from 'fs/promises';
import path from 'path';

export default {
    data: new SlashCommandBuilder()
        .setName('set-log-channel')
        .setDescription('Définit le canal de logs pour les alertes de surveillance')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
        .addChannelOption(option =>
            option.setName('canal')
                .setDescription('Le canal où envoyer les logs de surveillance')
                .setRequired(false)
        ),

    async execute(interaction, adminManager, warnManager, guildConfig, sharedConfig, backupToGitHub, reportManager, banlistManager, blockedWordsManager, watchlistManager) {
        try {
            const channel = interaction.options.getChannel('canal');
            const configPath = path.join(process.cwd(), 'data', 'guilds_config.json');
            
            // Charger la configuration existante
            let config = {};
            try {
                const data = await fs.readFile(configPath, 'utf-8');
                config = JSON.parse(data);
            } catch (error) {
                if (error.code !== 'ENOENT') throw error;
            }
            
            // Mettre à jour la configuration
            const guildId = interaction.guild.id;
            if (!config[guildId]) {
                config[guildId] = {};
            }
            
            if (channel) {
                config[guildId].logChannelId = channel.id;
                await fs.mkdir(path.dirname(configPath), { recursive: true });
                await fs.writeFile(configPath, JSON.stringify(config, null, 2));
                
                await interaction.reply({
                    content: `✅ Le canal de logs a été défini sur ${channel}`,
                    ephemeral: true
                });
            } else {
                // Si aucun canal n'est spécifié, utiliser le canal de rapport global
                const reportChannel = interaction.guild.systemChannel || interaction.guild.publicUpdatesChannel;
                if (reportChannel) {
                    config[guildId].logChannelId = reportChannel.id;
                    await fs.mkdir(path.dirname(configPath), { recursive: true });
                    await fs.writeFile(configPath, JSON.stringify(config, null, 2));
                    
                    await interaction.reply({
                        content: `✅ Le canal de logs a été défini sur le canal de rapport global (${reportChannel})`,
                        ephemeral: true
                    });
                } else {
                    await interaction.reply({
                        content: '❌ Aucun canal de rapport global trouvé. Veuillez spécifier un canal manuellement.',
                        ephemeral: true
                    });
                }
            }
        } catch (error) {
            console.error('Erreur dans la commande set-log-channel:', error);
            await interaction.reply({
                content: '❌ Une erreur est survenue lors de la configuration du canal de logs.',
                ephemeral: true
            });
        }
    }
};
