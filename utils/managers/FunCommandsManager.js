import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * FunCommandsManager handles fun commands with cooldown tracking,
 * content filtering, and guild-specific configuration
 */
export default class FunCommandsManager {
    constructor(guildConfig, dataPath = 'data/fun_command_usage.json') {
        this.guildConfig = guildConfig;
        this.dataPath = path.join(process.cwd(), dataPath);
        this.cooldowns = new Map(); // In-memory cooldown tracking
        this.usageData = this.loadUsageData();
        
        // Content databases
        this.jokes = [
            "Pourquoi les plongeurs plongent-ils toujours en arrière et jamais en avant ? Parce que sinon, ils tombent dans le bateau !",
            "Que dit un escargot quand il croise une limace ? 'Regarde, un nudiste !'",
            "Comment appelle-t-on un chat tombé dans un pot de peinture le jour de Noël ? Un chat-mallow !",
            "Qu'est-ce qui est jaune et qui attend ? Jonathan !",
            "Que dit un informaticien quand il se noie ? F1 ! F1 !",
            "Pourquoi les poissons n'aiment pas jouer au tennis ? Parce qu'ils ont peur du filet !",
            "Comment appelle-t-on un boomerang qui ne revient pas ? Un bâton !",
            "Qu'est-ce qui est transparent et qui sent la carotte ? Un pet de lapin !",
            "Pourquoi les plongeurs plongent toujours en arrière ? Parce qu'en avant, c'est la plage !",
            "Que dit un pingouin quand il a froid ? Brrr... je suis un pingouin !"
        ];
        
        this.eightBallResponses = [
            "C'est certain.",
            "Sans aucun doute.",
            "Oui, définitivement.",
            "Tu peux compter dessus.",
            "Comme je le vois, oui.",
            "Très probablement.",
            "Les perspectives sont bonnes.",
            "Oui.",
            "Les signes pointent vers oui.",
            "Réponse floue, essaie encore.",
            "Redemande plus tard.",
            "Mieux vaut ne pas te le dire maintenant.",
            "Impossible de prédire maintenant.",
            "Concentre-toi et redemande.",
            "N'y compte pas.",
            "Ma réponse est non.",
            "Mes sources disent non.",
            "Les perspectives ne sont pas si bonnes.",
            "Très douteux."
        ];
        
        this.memes = [
            "🐕 This is fine 🔥",
            "📈 Stonks 📈",
            "🤔 Big brain time 🧠",
            "😎 Cool story bro 😎",
            "🚀 To the moon! 🌙",
            "💎 Diamond hands 💎",
            "🦍 Apes together strong 🦍",
            "📱 But wait, there's more! 📱",
            "🎯 Task failed successfully ✅",
            "🤖 I am inevitable 🤖"
        ];
        
        this.triviaQuestions = [
            {
                question: "Quelle est la capitale de la France ?",
                options: ["Paris", "Lyon", "Marseille", "Toulouse"],
                correct: 0,
                points: 10
            },
            {
                question: "Combien de continents y a-t-il sur Terre ?",
                options: ["5", "6", "7", "8"],
                correct: 2,
                points: 10
            },
            {
                question: "Quel est le plus grand océan du monde ?",
                options: ["Atlantique", "Indien", "Arctique", "Pacifique"],
                correct: 3,
                points: 15
            },
            {
                question: "En quelle année a eu lieu la première mission sur la Lune ?",
                options: ["1967", "1969", "1971", "1973"],
                correct: 1,
                points: 20
            },
            {
                question: "Quel est l'élément chimique avec le symbole 'O' ?",
                options: ["Or", "Oxygène", "Osmium", "Olivier"],
                correct: 1,
                points: 10
            },
            {
                question: "Qui a peint la Joconde ?",
                options: ["Picasso", "Van Gogh", "Leonardo da Vinci", "Monet"],
                correct: 2,
                points: 15
            },
            {
                question: "Combien de côtés a un hexagone ?",
                options: ["5", "6", "7", "8"],
                correct: 1,
                points: 10
            },
            {
                question: "Quelle est la vitesse de la lumière dans le vide ?",
                options: ["300 000 km/s", "150 000 km/s", "450 000 km/s", "600 000 km/s"],
                correct: 0,
                points: 25
            },
            {
                question: "Quel est le plus petit pays du monde ?",
                options: ["Monaco", "Vatican", "Nauru", "Saint-Marin"],
                correct: 1,
                points: 20
            },
            {
                question: "En informatique, que signifie 'CPU' ?",
                options: ["Computer Processing Unit", "Central Processing Unit", "Core Processing Unit", "Central Program Unit"],
                correct: 1,
                points: 15
            }
        ];
    }

    /**
     * Load usage data from file
     * @returns {Object} Usage data
     */
    loadUsageData() {
        try {
            if (fs.existsSync(this.dataPath)) {
                const data = fs.readFileSync(this.dataPath, 'utf8');
                return JSON.parse(data);
            }
        } catch (error) {
            console.error('Error loading fun command usage data:', error);
        }
        return {};
    }

    /**
     * Save usage data to file
     */
    saveUsageData() {
        try {
            const dir = path.dirname(this.dataPath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            fs.writeFileSync(this.dataPath, JSON.stringify(this.usageData, null, 2), 'utf8');
        } catch (error) {
            console.error('Error saving fun command usage data:', error);
        }
    }

    /**
     * Check if a user is on cooldown for a specific command
     * @param {string} userId - User ID
     * @param {string} guildId - Guild ID
     * @param {string} commandName - Command name
     * @returns {Object} Cooldown status and remaining time
     */
    checkCooldown(userId, guildId, commandName) {
        const config = this.guildConfig.getFunCommandsConfig(guildId);
        const cooldownKey = `${guildId}-${userId}-${commandName}`;
        const lastUsed = this.cooldowns.get(cooldownKey);
        
        if (!lastUsed) {
            return { onCooldown: false, remainingTime: 0 };
        }
        
        const timePassed = Date.now() - lastUsed;
        const cooldownTime = config.cooldownMs || 5000;
        
        if (timePassed < cooldownTime) {
            return {
                onCooldown: true,
                remainingTime: Math.ceil((cooldownTime - timePassed) / 1000)
            };
        }
        
        return { onCooldown: false, remainingTime: 0 };
    }

    /**
     * Set cooldown for a user and command
     * @param {string} userId - User ID
     * @param {string} guildId - Guild ID
     * @param {string} commandName - Command name
     */
    setCooldown(userId, guildId, commandName) {
        const cooldownKey = `${guildId}-${userId}-${commandName}`;
        this.cooldowns.set(cooldownKey, Date.now());
        
        // Update usage statistics
        const userKey = `${guildId}-${userId}`;
        if (!this.usageData[userKey]) {
            this.usageData[userKey] = {
                userId,
                guildId,
                commands: {},
                totalUsage: 0
            };
        }
        
        if (!this.usageData[userKey].commands[commandName]) {
            this.usageData[userKey].commands[commandName] = {
                count: 0,
                lastUsed: null
            };
        }
        
        this.usageData[userKey].commands[commandName].count++;
        this.usageData[userKey].commands[commandName].lastUsed = new Date().toISOString();
        this.usageData[userKey].totalUsage++;
        
        this.saveUsageData();
    }

    /**
     * Check if fun commands are enabled for a guild and channel
     * @param {string} guildId - Guild ID
     * @param {string} channelId - Channel ID
     * @returns {boolean} Whether fun commands are enabled
     */
    areFunCommandsEnabled(guildId, channelId) {
        const config = this.guildConfig.getFunCommandsConfig(guildId);
        
        if (!config.enabled) {
            return false;
        }
        
        if (config.disabledChannels && config.disabledChannels.includes(channelId)) {
            return false;
        }
        
        return true;
    }

    /**
     * Check if a specific command is enabled
     * @param {string} guildId - Guild ID
     * @param {string} commandName - Command name
     * @returns {boolean} Whether the command is enabled
     */
    isCommandEnabled(guildId, commandName) {
        const config = this.guildConfig.getFunCommandsConfig(guildId);
        return config.enabledCommands && config.enabledCommands.includes(commandName);
    }

    /**
     * Filter content to ensure appropriateness
     * @param {string} content - Content to filter
     * @param {string} guildId - Guild ID
     * @returns {string} Filtered content
     */
    filterContent(content, guildId) {
        // Basic content filtering - can be extended based on guild settings
        const inappropriateWords = ['spam', 'scam', 'hack', 'virus'];
        let filteredContent = content;
        
        inappropriateWords.forEach(word => {
            const regex = new RegExp(word, 'gi');
            filteredContent = filteredContent.replace(regex, '*'.repeat(word.length));
        });
        
        return filteredContent;
    }

    /**
     * Execute joke command
     * @param {Object} interaction - Discord interaction
     * @param {Object} warnManager - Warn manager for abuse detection
     * @returns {string} Joke response
     */
    async executeJoke(interaction, warnManager = null) {
        const guildId = interaction.guild.id;
        const channelId = interaction.channel.id;
        const userId = interaction.user.id;
        
        // Check if fun commands are enabled
        if (!this.areFunCommandsEnabled(guildId, channelId)) {
            return "Les commandes amusantes sont désactivées dans ce serveur ou ce salon.";
        }
        
        // Check if joke command is enabled
        if (!this.isCommandEnabled(guildId, 'joke')) {
            return "La commande joke est désactivée dans ce serveur.";
        }
        
        // Check cooldown (includes abuse detection)
        const cooldownStatus = this.checkCooldown(userId, guildId, 'joke');
        if (cooldownStatus.onCooldown) {
            if (cooldownStatus.reason === 'abuse') {
                return cooldownStatus.message;
            }
            return `Tu dois attendre encore ${cooldownStatus.remainingTime} secondes avant d'utiliser cette commande.`;
        }
        
        // Check for abuse patterns
        if (warnManager) {
            const abuseCheck = this.checkForAbuse(userId, guildId);
            if (abuseCheck.hasAbuse) {
                const moderationResult = this.applyModerationAction(userId, guildId, warnManager, abuseCheck.reasons.join(', '));
                if (moderationResult.success) {
                    return `⚠️ **Abus détecté !** ${moderationResult.message}`;
                }
            }
        }
        
        // Get random joke
        const joke = this.jokes[Math.floor(Math.random() * this.jokes.length)];
        const filteredJoke = this.filterContent(joke, guildId);
        
        // Set cooldown
        this.setCooldown(userId, guildId, 'joke');
        
        return `🎭 **Blague du jour :**\n${filteredJoke}`;
    }

    /**
     * Execute 8ball command
     * @param {Object} interaction - Discord interaction
     * @param {Object} warnManager - Warn manager for abuse detection
     * @returns {string} 8ball response
     */
    async execute8Ball(interaction, warnManager = null) {
        const guildId = interaction.guild.id;
        const channelId = interaction.channel.id;
        const userId = interaction.user.id;
        const question = interaction.options.getString('question');
        
        // Check if fun commands are enabled
        if (!this.areFunCommandsEnabled(guildId, channelId)) {
            return "Les commandes amusantes sont désactivées dans ce serveur ou ce salon.";
        }
        
        // Check if 8ball command is enabled
        if (!this.isCommandEnabled(guildId, '8ball')) {
            return "La commande 8ball est désactivée dans ce serveur.";
        }
        
        // Check cooldown (includes abuse detection)
        const cooldownStatus = this.checkCooldown(userId, guildId, '8ball');
        if (cooldownStatus.onCooldown) {
            if (cooldownStatus.reason === 'abuse') {
                return cooldownStatus.message;
            }
            return `Tu dois attendre encore ${cooldownStatus.remainingTime} secondes avant d'utiliser cette commande.`;
        }
        
        if (!question) {
            return "Tu dois poser une question à la boule magique !";
        }
        
        // Check for abuse patterns
        if (warnManager) {
            const abuseCheck = this.checkForAbuse(userId, guildId);
            if (abuseCheck.hasAbuse) {
                const moderationResult = this.applyModerationAction(userId, guildId, warnManager, abuseCheck.reasons.join(', '));
                if (moderationResult.success) {
                    return `⚠️ **Abus détecté !** ${moderationResult.message}`;
                }
            }
        }
        
        // Get random response
        const response = this.eightBallResponses[Math.floor(Math.random() * this.eightBallResponses.length)];
        const filteredResponse = this.filterContent(response, guildId);
        
        // Set cooldown
        this.setCooldown(userId, guildId, '8ball');
        
        return `🎱 **Question :** ${question}\n**Réponse :** ${filteredResponse}`;
    }

    /**
     * Execute meme command
     * @param {Object} interaction - Discord interaction
     * @param {Object} warnManager - Warn manager for abuse detection
     * @returns {string} Meme response
     */
    async executeMeme(interaction, warnManager = null) {
        const guildId = interaction.guild.id;
        const channelId = interaction.channel.id;
        const userId = interaction.user.id;
        
        // Check if fun commands are enabled
        if (!this.areFunCommandsEnabled(guildId, channelId)) {
            return "Les commandes amusantes sont désactivées dans ce serveur ou ce salon.";
        }
        
        // Check if meme command is enabled
        if (!this.isCommandEnabled(guildId, 'meme')) {
            return "La commande meme est désactivée dans ce serveur.";
        }
        
        // Check cooldown (includes abuse detection)
        const cooldownStatus = this.checkCooldown(userId, guildId, 'meme');
        if (cooldownStatus.onCooldown) {
            if (cooldownStatus.reason === 'abuse') {
                return cooldownStatus.message;
            }
            return `Tu dois attendre encore ${cooldownStatus.remainingTime} secondes avant d'utiliser cette commande.`;
        }
        
        // Check for abuse patterns
        if (warnManager) {
            const abuseCheck = this.checkForAbuse(userId, guildId);
            if (abuseCheck.hasAbuse) {
                const moderationResult = this.applyModerationAction(userId, guildId, warnManager, abuseCheck.reasons.join(', '));
                if (moderationResult.success) {
                    return `⚠️ **Abus détecté !** ${moderationResult.message}`;
                }
            }
        }
        
        // Get random meme
        const meme = this.memes[Math.floor(Math.random() * this.memes.length)];
        const filteredMeme = this.filterContent(meme, guildId);
        
        // Set cooldown
        this.setCooldown(userId, guildId, 'meme');
        
        return `😂 **Meme du moment :**\n${filteredMeme}`;
    }

    /**
     * Get usage statistics for a user
     * @param {string} userId - User ID
     * @param {string} guildId - Guild ID
     * @returns {Object} Usage statistics
     */
    getUserStats(userId, guildId) {
        const userKey = `${guildId}-${userId}`;
        return this.usageData[userKey] || null;
    }

    /**
     * Execute trivia command
     * @param {Object} interaction - Discord interaction
     * @param {Object} warnManager - Warn manager for abuse detection
     * @returns {string} Trivia response
     */
    async executeTrivia(interaction, warnManager = null) {
        const guildId = interaction.guild.id;
        const channelId = interaction.channel.id;
        const userId = interaction.user.id;
        
        // Check if fun commands are enabled
        if (!this.areFunCommandsEnabled(guildId, channelId)) {
            return "Les commandes amusantes sont désactivées dans ce serveur ou ce salon.";
        }
        
        // Check if trivia command is enabled
        if (!this.isCommandEnabled(guildId, 'trivia')) {
            return "La commande trivia est désactivée dans ce serveur.";
        }
        
        // Check cooldown (includes abuse detection)
        const cooldownStatus = this.checkCooldown(userId, guildId, 'trivia');
        if (cooldownStatus.onCooldown) {
            if (cooldownStatus.reason === 'abuse') {
                return cooldownStatus.message;
            }
            return `Tu dois attendre encore ${cooldownStatus.remainingTime} secondes avant d'utiliser cette commande.`;
        }
        
        // Check for abuse patterns
        if (warnManager) {
            const abuseCheck = this.checkForAbuse(userId, guildId);
            if (abuseCheck.hasAbuse) {
                const moderationResult = this.applyModerationAction(userId, guildId, warnManager, abuseCheck.reasons.join(', '));
                if (moderationResult.success) {
                    return `⚠️ **Abus détecté !** ${moderationResult.message}`;
                }
            }
        }
        
        // Get random trivia question
        const question = this.triviaQuestions[Math.floor(Math.random() * this.triviaQuestions.length)];
        
        // Set cooldown
        this.setCooldown(userId, guildId, 'trivia');
        
        // Format options
        const optionsText = question.options
            .map((option, index) => `${index + 1}. ${option}`)
            .join('\n');
        
        return `🧠 **Question Trivia** (${question.points} points)\n\n**${question.question}**\n\n${optionsText}\n\n*Réponds avec le numéro de ta réponse (1-4)*`;
    }

    /**
     * Process trivia answer
     * @param {string} userId - User ID
     * @param {string} guildId - Guild ID
     * @param {number} questionIndex - Index of the question
     * @param {number} userAnswer - User's answer (0-3)
     * @returns {Object} Result of the answer
     */
    processTriviaAnswer(userId, guildId, questionIndex, userAnswer) {
        const question = this.triviaQuestions[questionIndex];
        if (!question) {
            return { success: false, message: "Question invalide." };
        }
        
        const isCorrect = userAnswer === question.correct;
        const points = isCorrect ? question.points : 0;
        
        // Update user score
        this.updateScore(userId, guildId, 'trivia', points);
        
        const correctAnswer = question.options[question.correct];
        const userAnswerText = question.options[userAnswer] || "Réponse invalide";
        
        if (isCorrect) {
            return {
                success: true,
                correct: true,
                message: `🎉 **Correct !** Tu as gagné ${points} points !\n\n**Réponse :** ${correctAnswer}`,
                points
            };
        } else {
            return {
                success: true,
                correct: false,
                message: `❌ **Incorrect !** La bonne réponse était : **${correctAnswer}**\n\nTa réponse : ${userAnswerText}`,
                points: 0
            };
        }
    }

    /**
     * Update user score for a specific game
     * @param {string} userId - User ID
     * @param {string} guildId - Guild ID
     * @param {string} gameType - Type of game (trivia, etc.)
     * @param {number} points - Points to add
     */
    updateScore(userId, guildId, gameType, points) {
        const userKey = `${guildId}-${userId}`;
        
        if (!this.usageData[userKey]) {
            this.usageData[userKey] = {
                userId,
                guildId,
                commands: {},
                totalUsage: 0,
                scores: {}
            };
        }
        
        if (!this.usageData[userKey].scores) {
            this.usageData[userKey].scores = {};
        }
        
        if (!this.usageData[userKey].scores[gameType]) {
            this.usageData[userKey].scores[gameType] = {
                totalPoints: 0,
                gamesPlayed: 0,
                correctAnswers: 0
            };
        }
        
        this.usageData[userKey].scores[gameType].totalPoints += points;
        this.usageData[userKey].scores[gameType].gamesPlayed++;
        
        if (points > 0) {
            this.usageData[userKey].scores[gameType].correctAnswers++;
        }
        
        this.saveUsageData();
    }

    /**
     * Execute leaderboard command
     * @param {Object} interaction - Discord interaction
     * @returns {string} Leaderboard response
     */
    async executeLeaderboard(interaction) {
        const guildId = interaction.guild.id;
        const channelId = interaction.channel.id;
        const gameType = interaction.options?.getString('game') || 'trivia';
        
        // Check if fun commands are enabled
        if (!this.areFunCommandsEnabled(guildId, channelId)) {
            return "Les commandes amusantes sont désactivées dans ce serveur ou ce salon.";
        }
        
        // Check if leaderboard is enabled
        const config = this.guildConfig.getFunCommandsConfig(guildId);
        if (!config.leaderboardEnabled) {
            return "Le classement est désactivé dans ce serveur.";
        }
        
        // Get top players for the specified game
        const topPlayers = this.getTopPlayersByGame(guildId, gameType, 10);
        
        if (topPlayers.length === 0) {
            return `📊 **Classement ${gameType.toUpperCase()}**\n\nAucun joueur n'a encore participé à ce jeu !`;
        }
        
        let leaderboardText = `📊 **Classement ${gameType.toUpperCase()}**\n\n`;
        
        topPlayers.forEach((player, index) => {
            const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : `${index + 1}.`;
            const accuracy = player.scores[gameType].gamesPlayed > 0 
                ? Math.round((player.scores[gameType].correctAnswers / player.scores[gameType].gamesPlayed) * 100)
                : 0;
            
            leaderboardText += `${medal} <@${player.userId}> - **${player.scores[gameType].totalPoints}** points\n`;
            leaderboardText += `   └ ${player.scores[gameType].gamesPlayed} parties, ${accuracy}% de réussite\n\n`;
        });
        
        return leaderboardText;
    }

    /**
     * Get top players by game type
     * @param {string} guildId - Guild ID
     * @param {string} gameType - Game type
     * @param {number} limit - Number of top players to return
     * @returns {Array} Top players
     */
    getTopPlayersByGame(guildId, gameType, limit = 10) {
        const guildUsers = Object.values(this.usageData)
            .filter(user => user.guildId === guildId && user.scores && user.scores[gameType])
            .sort((a, b) => b.scores[gameType].totalPoints - a.scores[gameType].totalPoints)
            .slice(0, limit);
        
        return guildUsers;
    }

    /**
     * Get top users by usage in a guild
     * @param {string} guildId - Guild ID
     * @param {number} limit - Number of top users to return
     * @returns {Array} Top users
     */
    getTopUsers(guildId, limit = 10) {
        const guildUsers = Object.values(this.usageData)
            .filter(user => user.guildId === guildId)
            .sort((a, b) => b.totalUsage - a.totalUsage)
            .slice(0, limit);
        
        return guildUsers;
    }

    /**
     * Get user's game statistics
     * @param {string} userId - User ID
     * @param {string} guildId - Guild ID
     * @param {string} gameType - Game type
     * @returns {Object} User's game stats
     */
    getUserGameStats(userId, guildId, gameType) {
        const userKey = `${guildId}-${userId}`;
        const userData = this.usageData[userKey];
        
        if (!userData || !userData.scores || !userData.scores[gameType]) {
            return null;
        }
        
        return userData.scores[gameType];
    }

    /**
     * Get usage statistics for a guild
     * @param {string} guildId - Guild ID
     * @returns {Object} Usage statistics
     */
    getGuildUsageStats(guildId) {
        const guildUsers = Object.values(this.usageData)
            .filter(user => user.guildId === guildId);
        
        const stats = {
            totalUsers: guildUsers.length,
            totalUsage: guildUsers.reduce((sum, user) => sum + user.totalUsage, 0),
            commandStats: {},
            gameStats: {}
        };
        
        // Calculate command usage statistics
        guildUsers.forEach(user => {
            Object.entries(user.commands || {}).forEach(([command, data]) => {
                if (!stats.commandStats[command]) {
                    stats.commandStats[command] = {
                        totalUses: 0,
                        uniqueUsers: 0,
                        lastUsed: null
                    };
                }
                stats.commandStats[command].totalUses += data.count;
                stats.commandStats[command].uniqueUsers++;
                
                if (!stats.commandStats[command].lastUsed || 
                    new Date(data.lastUsed) > new Date(stats.commandStats[command].lastUsed)) {
                    stats.commandStats[command].lastUsed = data.lastUsed;
                }
            });
            
            // Calculate game statistics
            Object.entries(user.scores || {}).forEach(([game, data]) => {
                if (!stats.gameStats[game]) {
                    stats.gameStats[game] = {
                        totalPlayers: 0,
                        totalGames: 0,
                        totalPoints: 0,
                        averageAccuracy: 0
                    };
                }
                stats.gameStats[game].totalPlayers++;
                stats.gameStats[game].totalGames += data.gamesPlayed;
                stats.gameStats[game].totalPoints += data.totalPoints;
            });
        });
        
        // Calculate average accuracy for games
        Object.keys(stats.gameStats).forEach(game => {
            const gameUsers = guildUsers.filter(user => user.scores && user.scores[game]);
            const totalAccuracy = gameUsers.reduce((sum, user) => {
                const gameData = user.scores[game];
                const accuracy = gameData.gamesPlayed > 0 
                    ? (gameData.correctAnswers / gameData.gamesPlayed) * 100 
                    : 0;
                return sum + accuracy;
            }, 0);
            
            stats.gameStats[game].averageAccuracy = gameUsers.length > 0 
                ? Math.round(totalAccuracy / gameUsers.length) 
                : 0;
        });
        
        return stats;
    }

    /**
     * Check for potential abuse patterns
     * @param {string} userId - User ID
     * @param {string} guildId - Guild ID
     * @returns {Object} Abuse detection result
     */
    checkForAbuse(userId, guildId) {
        const userKey = `${guildId}-${userId}`;
        const userData = this.usageData[userKey];
        
        if (!userData) {
            return { hasAbuse: false, reasons: [] };
        }
        
        const reasons = [];
        const now = Date.now();
        const oneHour = 60 * 60 * 1000;
        
        // Check for excessive usage
        if (userData.totalUsage > 100) {
            reasons.push(`Usage excessif: ${userData.totalUsage} commandes utilisées`);
        }
        
        // Check for rapid usage patterns
        const recentCommands = Object.values(userData.commands || {})
            .filter(cmd => cmd.lastUsed && (now - new Date(cmd.lastUsed).getTime()) < oneHour);
        
        if (recentCommands.length > 20) {
            reasons.push(`Usage rapide: ${recentCommands.length} commandes dans la dernière heure`);
        }
        
        // Check for spam patterns (same command used many times)
        Object.entries(userData.commands || {}).forEach(([command, data]) => {
            if (data.count > 50) {
                reasons.push(`Spam potentiel: commande ${command} utilisée ${data.count} fois`);
            }
        });
        
        return {
            hasAbuse: reasons.length > 0,
            reasons,
            userData
        };
    }

    /**
     * Apply moderation action for fun command abuse
     * @param {string} userId - User ID
     * @param {string} guildId - Guild ID
     * @param {Object} warnManager - Warn manager instance
     * @param {string} reason - Reason for moderation
     * @returns {Object} Moderation result
     */
    applyModerationAction(userId, guildId, warnManager, reason) {
        try {
            // Add warning for fun command abuse
            const warning = warnManager.addWarn(
                userId,
                `Abus des commandes amusantes: ${reason}`,
                'FunCommandsManager'
            );
            
            // Temporarily disable fun commands for this user (cooldown extension)
            const cooldownKey = `${guildId}-${userId}-abuse`;
            this.cooldowns.set(cooldownKey, Date.now() + (30 * 60 * 1000)); // 30 minutes
            
            return {
                success: true,
                warning,
                message: `Avertissement donné pour abus des commandes amusantes. Cooldown étendu à 30 minutes.`
            };
        } catch (error) {
            console.error('Error applying moderation action:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Check if user is temporarily banned from fun commands
     * @param {string} userId - User ID
     * @param {string} guildId - Guild ID
     * @returns {boolean} Whether user is banned
     */
    isUserTemporarilyBanned(userId, guildId) {
        const cooldownKey = `${guildId}-${userId}-abuse`;
        const banTime = this.cooldowns.get(cooldownKey);
        
        if (!banTime) {
            return false;
        }
        
        if (Date.now() > banTime) {
            this.cooldowns.delete(cooldownKey);
            return false;
        }
        
        return true;
    }

    /**
     * Get remaining ban time for user
     * @param {string} userId - User ID
     * @param {string} guildId - Guild ID
     * @returns {number} Remaining time in seconds
     */
    getRemainingBanTime(userId, guildId) {
        const cooldownKey = `${guildId}-${userId}-abuse`;
        const banTime = this.cooldowns.get(cooldownKey);
        
        if (!banTime) {
            return 0;
        }
        
        const remaining = Math.max(0, banTime - Date.now());
        return Math.ceil(remaining / 1000);
    }

    /**
     * Override cooldown check to include abuse detection
     * @param {string} userId - User ID
     * @param {string} guildId - Guild ID
     * @param {string} commandName - Command name
     * @returns {Object} Enhanced cooldown status
     */
    checkCooldown(userId, guildId, commandName) {
        // Check for temporary ban first
        if (this.isUserTemporarilyBanned(userId, guildId)) {
            const remainingTime = this.getRemainingBanTime(userId, guildId);
            return {
                onCooldown: true,
                remainingTime: Math.ceil(remainingTime / 60), // Convert to minutes
                reason: 'abuse',
                message: `Tu es temporairement suspendu des commandes amusantes pour abus. Temps restant: ${Math.ceil(remainingTime / 60)} minutes.`
            };
        }
        
        // Regular cooldown check
        const config = this.guildConfig.getFunCommandsConfig(guildId);
        const cooldownKey = `${guildId}-${userId}-${commandName}`;
        const lastUsed = this.cooldowns.get(cooldownKey);
        
        if (!lastUsed) {
            return { onCooldown: false, remainingTime: 0 };
        }
        
        const timePassed = Date.now() - lastUsed;
        const cooldownTime = config.cooldownMs || 5000;
        
        if (timePassed < cooldownTime) {
            return {
                onCooldown: true,
                remainingTime: Math.ceil((cooldownTime - timePassed) / 1000),
                reason: 'normal'
            };
        }
        
        return { onCooldown: false, remainingTime: 0 };
    }

    /**
     * Check prerequisites for a fun command
     */
    async checkPrerequisites(interaction, warnManager, commandName) {
        const guildId = interaction.guild.id;
        const channelId = interaction.channel.id;
        const userId = interaction.user.id;
        
        if (!this.areFunCommandsEnabled(guildId, channelId)) return { allowed: false, msg: "Les commandes amusantes sont désactivées dans ce serveur ou ce salon." };
        if (!this.isCommandEnabled(guildId, commandName)) return { allowed: false, msg: `La commande ${commandName} est désactivée dans ce serveur.` };
        
        const cooldownStatus = this.checkCooldown(userId, guildId, commandName);
        if (cooldownStatus.onCooldown) {
            if (cooldownStatus.reason === 'abuse') return { allowed: false, msg: cooldownStatus.message };
            return { allowed: false, msg: `Tu dois attendre encore ${cooldownStatus.remainingTime} secondes avant d'utiliser cette commande.` };
        }
        
        if (warnManager) {
            const abuseCheck = this.checkForAbuse(userId, guildId);
            if (abuseCheck.hasAbuse) {
                const moderationResult = this.applyModerationAction(userId, guildId, warnManager, abuseCheck.reasons.join(', '));
                if (moderationResult.success) return { allowed: false, msg: `⚠️ **Abus détecté !** ${moderationResult.message}` };
            }
        }
        
        return { allowed: true };
    }

    async executeCoinflip(interaction, warnManager = null) {
        const pre = await this.checkPrerequisites(interaction, warnManager, 'coinflip');
        if (!pre.allowed) return pre.msg;
        this.setCooldown(interaction.user.id, interaction.guild.id, 'coinflip');
        return Math.random() < 0.5 ? "🪙 Pile !" : "🪙 Face !";
    }

    async executeRoll(interaction, warnManager = null) {
        const pre = await this.checkPrerequisites(interaction, warnManager, 'roll');
        if (!pre.allowed) return pre.msg;
        this.setCooldown(interaction.user.id, interaction.guild.id, 'roll');
        return `🎲 Tu as lancé un dé et obtenu : ${Math.floor(Math.random() * 6) + 1} !`;
    }

    async executeRps(interaction, warnManager = null) {
        const pre = await this.checkPrerequisites(interaction, warnManager, 'rps');
        if (!pre.allowed) return pre.msg;
        this.setCooldown(interaction.user.id, interaction.guild.id, 'rps');
        
        const userChoice = interaction.options.getString('choix');
        const choices = ['pierre', 'feuille', 'ciseaux'];
        const botChoice = choices[Math.floor(Math.random() * choices.length)];
        
        let result = "";
        if (userChoice === botChoice) result = "C'est une égalité !";
        else if (
            (userChoice === 'pierre' && botChoice === 'ciseaux') ||
            (userChoice === 'feuille' && botChoice === 'pierre') ||
            (userChoice === 'ciseaux' && botChoice === 'feuille')
        ) result = "Tu as gagné ! 🎉";
        else result = "J'ai gagné ! 🤖";
        
        return `Tu as choisi **${userChoice}**, j'ai choisi **${botChoice}**.\n${result}`;
    }

    async executeLovecalc(interaction, warnManager = null) {
        const pre = await this.checkPrerequisites(interaction, warnManager, 'lovecalc');
        if (!pre.allowed) return pre.msg;
        this.setCooldown(interaction.user.id, interaction.guild.id, 'lovecalc');
        
        const user1 = interaction.options.getUser('personne1');
        const user2 = interaction.options.getUser('personne2') || interaction.user;
        const score = Math.floor(Math.random() * 101);
        
        let message = "";
        if (score >= 90) message = "L'amour fou ! ❤️‍🔥";
        else if (score >= 70) message = "Il y a de l'étincelle ! ✨";
        else if (score >= 40) message = "Peut-être dans une autre vie... 😅";
        else message = "C'est mort. 💀";
        
        return `💘 Le pourcentage d'amour entre **${user1.username}** et **${user2.username}** est de **${score}%** !\n${message}`;
    }

    async executeHug(interaction, warnManager = null) {
        const pre = await this.checkPrerequisites(interaction, warnManager, 'hug');
        if (!pre.allowed) return pre.msg;
        this.setCooldown(interaction.user.id, interaction.guild.id, 'hug');
        
        const target = interaction.options.getUser('utilisateur');
        return `🫂 **${interaction.user.username}** fait un gros câlin à **${target.username}** !`;
    }

    async executeSlap(interaction, warnManager = null) {
        const pre = await this.checkPrerequisites(interaction, warnManager, 'slap');
        if (!pre.allowed) return pre.msg;
        this.setCooldown(interaction.user.id, interaction.guild.id, 'slap');
        
        const target = interaction.options.getUser('utilisateur');
        return `👋 **${interaction.user.username}** a donné une gifle à **${target.username}** ! Ça fait mal !`;
    }

    /**

     * Reload the manager (for hot reload functionality)
     */
    reload() {
        this.usageData = this.loadUsageData();
        console.log('FunCommandsManager reloaded');
    }
}