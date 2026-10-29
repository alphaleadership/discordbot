import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';

// In-memory active guessing games: key `${guildId}_${userId}` -> { secret, attempts, maxAttempts }
const activeGames = new Map();

export default {
    data: new SlashCommandBuilder()
        .setName('guess-number')
        .setDescription('Mini-jeu : devinez le nombre secret entre 1 et 100 pour gagner des coins !')
        .addIntegerOption(option =>
            option.setName('nombre')
                .setDescription('Votre proposition de nombre (entre 1 et 100)')
                .setRequired(true)
                .setMinValue(1)
                .setMaxValue(100)
        ),
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

            const guess = interaction.options.getInteger('nombre');
            const userId = interaction.user.id;
            const guildId = interaction.guild.id;
            const gameKey = `${guildId}_${userId}`;

            let game = activeGames.get(gameKey);

            if (!game) {
                // Initialize a new game
                const secret = Math.floor(Math.random() * 100) + 1; // 1 to 100
                game = {
                    secret,
                    attempts: 1,
                    maxAttempts: 6,
                    startedAt: Date.now()
                };
                activeGames.set(gameKey, game);
            } else {
                game.attempts++;
            }

            const remaining = game.maxAttempts - game.attempts;

            if (guess === game.secret) {
                // VICTORY!
                activeGames.delete(gameKey);
                const reward = Math.max(50, 150 - (game.attempts - 1) * 20); // Faster guess = more coins
                let newBalance = 'N/A';

                if (ecoManager) {
                    await ecoManager.addCurrency(userId, guildId, reward, 'Victoire Mini-jeu Guess Number');
                    newBalance = await ecoManager.getBalance(userId, guildId);
                }

                const embed = new EmbedBuilder()
                    .setColor('#00FF00')
                    .setTitle('🎯 VICTOIRE ! Nombre secret trouvé !')
                    .setDescription(
                        `Félicitations ! Vous avez deviné le nombre secret **${game.secret}** en **${game.attempts}** tentative(s) !\n\n` +
                        `💰 **Récompense gagnée** : \`+${reward}\` coins\n` +
                        `💵 **Nouveau solde** : \`${newBalance.toLocaleString()}\` coins`
                    )
                    .setFooter({ text: `Partie terminée pour ${interaction.user.tag}` })
                    .setTimestamp();

                return interaction.reply({ embeds: [embed] });
            }

            if (remaining <= 0) {
                // DEFEAT (ran out of attempts)
                const secret = game.secret;
                activeGames.delete(gameKey);

                const embed = new EmbedBuilder()
                    .setColor('#FF0000')
                    .setTitle('💥 GAME OVER !')
                    .setDescription(
                        `Vous avez épuisé vos ${game.maxAttempts} tentatives !\n\n` +
                        `Le nombre secret était : **${secret}**.\n\n` +
                        `Retentez votre chance avec \`/guess-number\` pour lancer une nouvelle partie !`
                    )
                    .setFooter({ text: `Partie terminée pour ${interaction.user.tag}` })
                    .setTimestamp();

                return interaction.reply({ embeds: [embed] });
            }

            // GAME IN PROGRESS (clue)
            const isHigher = game.secret > guess;
            const clue = isHigher ? '📈 **C\'est PLUS GRAND !**' : '📉 **C\'est PLUS PETIT !**';

            const embed = new EmbedBuilder()
                .setColor('#3498DB')
                .setTitle(`🔢 Devine le nombre (${game.attempts}/${game.maxAttempts})`)
                .setDescription(
                    `Votre proposition : **${guess}**\n\n` +
                    `${clue}\n\n` +
                    `Il vous reste **${remaining}** tentative(s) ! Utilisez \`/guess-number [nombre]\` pour continuer.`
                )
                .setFooter({ text: 'Intervalle : entre 1 et 100' })
                .setTimestamp();

            return interaction.reply({ embeds: [embed] });

        } catch (error) {
            console.error('Erreur lors du jeu guess-number:', error);
            const errorMsg = error.message || 'Une erreur inattendue est survenue.';
            if (interaction.deferred || interaction.replied) {
                await interaction.editReply({ content: `❌ Erreur: ${errorMsg}` });
            } else {
                await interaction.reply({ content: `❌ Erreur: ${errorMsg}`, ephemeral: true });
            }
        }
    }
};
