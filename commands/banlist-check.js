import { SlashCommandBuilder, EmbedBuilder, PermissionsBitField } from 'discord.js';
import fs from 'fs';
import path from 'path';

export default {
    data: new SlashCommandBuilder()
        .setName('banlist-check')
        .setDescription('Vérifier si un utilisateur ou un identifiant est dans la banlist du bot')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.BanMembers)
        .addStringOption(option =>
            option.setName('id')
                .setDescription('L\'ID Discord de l\'utilisateur à vérifier')
                .setRequired(false)
        )
        .addUserOption(option =>
            option.setName('utilisateur')
                .setDescription('L\'utilisateur Discord à vérifier')
                .setRequired(false)
        ),
    async execute(interaction, adminManager, warnManager, guildConfig, sharedConfig, backupToGitHub, reportManager, banlistManager) {
        try {
            const inputId = interaction.options.getString('id')?.trim();
            const inputUser = interaction.options.getUser('utilisateur');

            let targetId = inputUser?.id || inputId;

            if (!targetId) {
                return interaction.reply({
                    content: '❌ Veuillez spécifier soit une mention d\'utilisateur soit un identifiant Discord.',
                    ephemeral: true
                });
            }

            if (!/^\d{17,20}$/.test(targetId)) {
                return interaction.reply({
                    content: '❌ L\'identifiant Discord fourni est invalide (doit contenir entre 17 et 20 chiffres).',
                    ephemeral: true
                });
            }

            await interaction.deferReply({ ephemeral: true });

            // Check whitelist status on this server
            const isWhitelisted = interaction.guild ? banlistManager.isWhitelisted(targetId, interaction.guild.id) : false;

            // Check banned status in banlist manager
            const { banned, reason } = await banlistManager.isBanned(targetId, interaction.guild?.id);

            // Fetch extra details from banlist.txt if exists
            let entryDetails = null;
            const banlistPath = path.join(process.cwd(), 'banlist.txt');
            if (fs.existsSync(banlistPath)) {
                const content = fs.readFileSync(banlistPath, 'utf-8');
                const line = content.split('\n').find(l => l.startsWith(`${targetId} -`));
                if (line) {
                    const reasonMatch = line.match(/ - (.*?)( \| Ajouté par:|$)/);
                    const authorMatch = line.match(/ \| Ajouté par:\s*(\d+)/i);
                    const dateMatch = line.match(/ \| Le:\s*(.*?)$/i);
                    entryDetails = {
                        reason: reasonMatch ? reasonMatch[1].trim() : 'Non spécifiée',
                        authorId: authorMatch ? authorMatch[1].trim() : 'Inconnu',
                        date: dateMatch ? dateMatch[1].trim() : 'Date inconnue'
                    };
                }
            }

            // Attempt to resolve target username from Discord API
            let resolvedTag = inputUser?.tag || `Utilisateur inconnu (${targetId})`;
            if (!inputUser) {
                try {
                    const fetchedUser = await interaction.client.users.fetch(targetId);
                    if (fetchedUser) resolvedTag = fetchedUser.tag;
                } catch (e) {
                    // Unknown user on Discord
                }
            }

            const embed = new EmbedBuilder()
                .setTitle(`🔎 Vérification Banlist: ${resolvedTag}`)
                .setTimestamp();

            if (banned) {
                embed.setColor('#FF0000')
                    .setDescription(`🚨 **Cet utilisateur est banni globalement du réseau du bot.**`)
                    .addFields(
                        { name: 'Identifiant', value: `\`${targetId}\``, inline: true },
                        { name: 'Statut', value: '🔴 Banni (Banlist active)', inline: true },
                        { name: 'Raison', value: entryDetails?.reason || reason || 'Raison non spécifiée', inline: false },
                        { name: 'Ajouté par', value: entryDetails?.authorId ? `<@${entryDetails.authorId}> (\`${entryDetails.authorId}\`)` : 'Inconnu', inline: true },
                        { name: 'Date d\'ajout', value: entryDetails?.date || 'Inconnue', inline: true },
                        { name: 'Liste blanche locale', value: isWhitelisted ? '✅ Oui (Ignoré sur ce serveur)' : '❌ Non', inline: true }
                    );
            } else if (isWhitelisted) {
                embed.setColor('#FFA500')
                    .setDescription(`⚠️ **Cet utilisateur est présent dans la banlist mais fait l'objet d'une exception (liste blanche) sur ce serveur.**`)
                    .addFields(
                        { name: 'Identifiant', value: `\`${targetId}\``, inline: true },
                        { name: 'Statut', value: '⚪ Banni globalement mais Whitelisté localement', inline: true },
                        { name: 'Raison originale', value: entryDetails?.reason || 'Non spécifiée', inline: false }
                    );
            } else {
                embed.setColor('#00FF00')
                    .setDescription(`✅ **Cet utilisateur n'est pas présent dans la banlist du bot.**`)
                    .addFields(
                        { name: 'Identifiant', value: `\`${targetId}\``, inline: true },
                        { name: 'Statut', value: '🟢 Non banni', inline: true }
                    );
            }

            return interaction.editReply({ embeds: [embed] });

        } catch (error) {
            console.error('Erreur lors de la vérification de la banlist:', error);
            const errorMsg = error.message || 'Une erreur inattendue est survenue.';
            if (interaction.deferred || interaction.replied) {
                await interaction.editReply({ content: `❌ Erreur: ${errorMsg}` });
            } else {
                await interaction.reply({ content: `❌ Erreur: ${errorMsg}`, ephemeral: true });
            }
        }
    }
};
