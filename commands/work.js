import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';

export default {
    data: new SlashCommandBuilder()
        .setName('work')
        .setDescription('Travailler pour gagner des coins d\'économie'),
    async execute(interaction, adminManager, warnManager, guildConfig, sharedConfig, backupToGitHub, reportManager, banlistManager, blockedWordsManager, watchlistManager, telegramIntegration, funCommandsManager, raidDetector, doxDetector, enhancedReloadSystem, permissionValidator, economyManager) {
        try {
            if (!interaction.inGuild()) {
                return interaction.reply({
                    content: '❌ Cette commande ne peut être utilisée que dans un serveur.',
                    ephemeral: true
                });
            }

            const ecoManager = (economyManager && typeof economyManager.getBalance === 'function')
                ? economyManager
                : [arguments[16], arguments[17], arguments[18], arguments[19]].find(arg => arg && typeof arg.getBalance === 'function') || economyManager;

            if (!ecoManager) {
                return interaction.reply({
                    content: '❌ Le système d\'économie n\'est pas disponible actuellement.',
                    ephemeral: true
                });
            }

            const userId = interaction.user.id;
            const guildId = interaction.guild.id;

            // Execute work with 30-minute cooldown
            const result = await ecoManager.executeWork(userId, guildId, 30);

            if (!result.success) {
                if (result.cooldown) {
                    return interaction.reply({
                        content: `⏳ ${result.message}`,
                        ephemeral: true
                    });
                }
                return interaction.reply({
                    content: `❌ ${result.message || 'Impossible d\'effectuer votre travail.'}`,
                    ephemeral: true
                });
            }

            // Flavorful random jobs
            const jobs = [
                { title: '💻 Développeur Backend', desc: 'Vous avez corrigé 4 bugs critiques dans le code du bot.' },
                { title: '🕵️ Agent Secret', desc: 'Vous avez surveillé discrètement les allées et venues du salon général.' },
                { title: '🍕 Livreur de Pizza', desc: 'Vous avez livré 12 pizzas quatre fromages aux modérateurs affamés.' },
                { title: '⛏️ Mineur Cybernétique', desc: 'Vous avez extrait des fragments de données précieuses sur le réseau.' },
                { title: '🧑‍🍳 Chef Cuisinier', desc: 'Vous avez préparé un banquet digne des plus grands pour le serveur.' },
                { title: '🛡️ Gardien de Nuit', desc: 'Vous avez monté la garde pour repousser les tentatives de raid.' },
                { title: '☕ Barista Virtuel', desc: 'Vous avez servi des cappuccinos bien chauds à toute la communauté.' },
                { title: '📈 Trader de Wall Street', desc: 'Vous avez acheté au creux et vendu au sommet sur le marché boursier.' },
                { title: '🎨 Graphiste Freelance', desc: 'Vous avez conçu le logo de la prochaine mise à jour du bot.' },
                { title: '🚀 Astronaute', desc: 'Vous êtes revenu d\'une mission de reconnaissance dans la nébuleuse Discord.' }
            ];

            const job = jobs[Math.floor(Math.random() * jobs.length)];

            const embed = new EmbedBuilder()
                .setColor('#2ECC71')
                .setTitle(`💼 Journée de travail accomplie !`)
                .setDescription(
                    `**Métier du jour :** ${job.title}\n` +
                    `*${job.desc}*\n\n` +
                    `💰 **Salaire perçu** : \`+${result.amount.toLocaleString()}\` coins\n` +
                    `💵 **Nouveau solde** : \`${result.newBalance.toLocaleString()}\` coins`
                )
                .setFooter({ text: 'Vous pourrez retravailler dans 30 minutes.' })
                .setTimestamp();

            return interaction.reply({ embeds: [embed] });

        } catch (error) {
            console.error('Erreur lors de la commande work:', error);
            const errorMsg = error.message || 'Une erreur inattendue est survenue.';
            if (interaction.deferred || interaction.replied) {
                await interaction.editReply({ content: `❌ Erreur: ${errorMsg}` });
            } else {
                await interaction.reply({ content: `❌ Erreur: ${errorMsg}`, ephemeral: true });
            }
        }
    }
};
