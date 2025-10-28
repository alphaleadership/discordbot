import { SlashCommandBuilder, EmbedBuilder } from 'discord.js';

export default {
    data: new SlashCommandBuilder()
        .setName('shop')
        .setDescription('Browse and purchase items from the economy shop')
        .addSubcommand(subcommand =>
            subcommand
                .setName('list')
                .setDescription('View available items in the shop'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('buy')
                .setDescription('Purchase an item from the shop')
                .addStringOption(option =>
                    option.setName('item')
                        .setDescription('The item to purchase')
                        .setRequired(true)
                        .addChoices(
                            { name: 'VIP Role (7 days)', value: 'vip_7d' },
                            { name: 'Custom Color Role', value: 'custom_color' },
                            { name: 'Server Boost', value: 'server_boost' },
                            { name: 'Priority Support', value: 'priority_support' },
                            { name: 'Custom Emoji Slot', value: 'custom_emoji' }
                        ))
                .addIntegerOption(option =>
                    option.setName('quantity')
                        .setDescription('Quantity to purchase (default: 1)')
                        .setRequired(false)
                        .setMinValue(1)
                        .setMaxValue(10))),
    
    async execute(interaction, adminManager, warnManager, guildConfig, sharedConfig, backupToGitHub, reportManager, banlistManager, blockedWordsManager, watchlistManager, telegramIntegration, funCommandsManager, raidDetector, doxDetector, enhancedReloadSystem, permissionValidator, dmTicketManager, economyManager) {
        try {
            if (!economyManager) {
                return await interaction.reply({
                    content: '❌ Le système économique n\'est pas disponible.',
                    ephemeral: true
                });
            }

            const subcommand = interaction.options.getSubcommand();
            const guildId = interaction.guild.id;

            if (subcommand === 'list') {
                await this.handleShopList(interaction, economyManager, guildId);
            } else if (subcommand === 'buy') {
                await this.handleShopBuy(interaction, economyManager, guildId);
            }

        } catch (error) {
            console.error('Error in shop command:', error);
            await interaction.reply({
                content: '❌ Une erreur est survenue lors de l\'accès au magasin.',
                ephemeral: true
            });
        }
    },

    async handleShopList(interaction, economyManager, guildId) {
        // Get current market value for price calculations
        const marketValue = await economyManager.calculateMarketValue(guildId);
        
        // Define shop items with dynamic pricing
        const shopItems = [
            {
                id: 'vip_7d',
                name: 'VIP Role (7 days)',
                description: 'Get VIP status for 7 days with special perks',
                basePrice: 500,
                emoji: '👑',
                category: 'Roles'
            },
            {
                id: 'custom_color',
                name: 'Custom Color Role',
                description: 'Create a custom colored role for yourself',
                basePrice: 1000,
                emoji: '🎨',
                category: 'Roles'
            },
            {
                id: 'server_boost',
                name: 'Server Boost',
                description: 'Boost the server for enhanced features',
                basePrice: 2000,
                emoji: '🚀',
                category: 'Server'
            },
            {
                id: 'priority_support',
                name: 'Priority Support',
                description: 'Get priority in support tickets for 30 days',
                basePrice: 750,
                emoji: '⚡',
                category: 'Support'
            },
            {
                id: 'custom_emoji',
                name: 'Custom Emoji Slot',
                description: 'Add a custom emoji to the server',
                basePrice: 1500,
                emoji: '😀',
                category: 'Server'
            }
        ];

        const embed = new EmbedBuilder()
            .setColor('#0099ff')
            .setTitle('🛒 Magasin Économique')
            .setDescription(`Valeur actuelle du marché: **${marketValue.toFixed(2)}**x\n*Les prix fluctuent selon l'économie du serveur*`)
            .setFooter({ text: 'Utilisez /shop buy <item> pour acheter un article' })
            .setTimestamp();

        // Group items by category
        const categories = {};
        shopItems.forEach(item => {
            if (!categories[item.category]) {
                categories[item.category] = [];
            }
            categories[item.category].push(item);
        });

        // Add fields for each category
        Object.entries(categories).forEach(([category, items]) => {
            const itemList = items.map(item => {
                const currentPrice = Math.round(item.basePrice * marketValue);
                return `${item.emoji} **${item.name}**\n${item.description}\n💰 Prix: **${currentPrice.toLocaleString()}** coins`;
            }).join('\n\n');

            embed.addFields({
                name: `📂 ${category}`,
                value: itemList,
                inline: false
            });
        });

        await interaction.reply({ embeds: [embed] });
    },

    async handleShopBuy(interaction, economyManager, guildId) {
        const itemId = interaction.options.getString('item');
        const quantity = interaction.options.getInteger('quantity') || 1;
        const userId = interaction.user.id;

        // Define shop items (same as in list)
        const shopItems = {
            'vip_7d': { name: 'VIP Role (7 days)', basePrice: 500, emoji: '👑' },
            'custom_color': { name: 'Custom Color Role', basePrice: 1000, emoji: '🎨' },
            'server_boost': { name: 'Server Boost', basePrice: 2000, emoji: '🚀' },
            'priority_support': { name: 'Priority Support', basePrice: 750, emoji: '⚡' },
            'custom_emoji': { name: 'Custom Emoji Slot', basePrice: 1500, emoji: '😀' }
        };

        const item = shopItems[itemId];
        if (!item) {
            return await interaction.reply({
                content: '❌ Article non trouvé.',
                ephemeral: true
            });
        }

        // Calculate current price based on market value
        const marketValue = await economyManager.calculateMarketValue(guildId);
        const currentPrice = Math.round(item.basePrice * marketValue);
        const totalCost = currentPrice * quantity;

        // Check user balance
        const userBalance = await economyManager.getBalance(userId, guildId);
        if (userBalance < totalCost) {
            return await interaction.reply({
                content: `❌ Balance insuffisante. Vous avez **${userBalance.toLocaleString()}** coins mais l'achat coûte **${totalCost.toLocaleString()}** coins.`,
                ephemeral: true
            });
        }

        // Process the purchase
        const result = await economyManager.removeCurrency(
            userId,
            guildId,
            totalCost,
            `Shop purchase: ${item.name} x${quantity}`
        );

        if (result.success) {
            const embed = new EmbedBuilder()
                .setColor('#00ff00')
                .setTitle('✅ Achat Réussi!')
                .setDescription(`Vous avez acheté **${quantity}x ${item.emoji} ${item.name}**`)
                .addFields(
                    { name: '💰 Coût Total', value: `${totalCost.toLocaleString()} coins`, inline: true },
                    { name: '💵 Nouvelle Balance', value: `${result.newBalance.toLocaleString()} coins`, inline: true },
                    { name: '📊 Prix Unitaire', value: `${currentPrice.toLocaleString()} coins`, inline: true }
                )
                .setFooter({ text: 'Merci pour votre achat! Contactez un administrateur pour activer votre article.' })
                .setTimestamp();

            await interaction.reply({ embeds: [embed] });

            // Log the purchase for administrators
            try {
                const logChannel = interaction.guild.channels.cache.find(
                    channel => channel.name.includes('log') || channel.name.includes('admin')
                );
                
                if (logChannel) {
                    const logEmbed = new EmbedBuilder()
                        .setColor('#ffa500')
                        .setTitle('🛒 Nouvel Achat dans le Magasin')
                        .setDescription(`${interaction.user.tag} a acheté ${quantity}x ${item.name}`)
                        .addFields(
                            { name: 'Utilisateur', value: `<@${userId}>`, inline: true },
                            { name: 'Article', value: `${item.emoji} ${item.name}`, inline: true },
                            { name: 'Quantité', value: quantity.toString(), inline: true },
                            { name: 'Coût Total', value: `${totalCost.toLocaleString()} coins`, inline: true },
                            { name: 'Prix Unitaire', value: `${currentPrice.toLocaleString()} coins`, inline: true },
                            { name: 'Balance Restante', value: `${result.newBalance.toLocaleString()} coins`, inline: true }
                        )
                        .setTimestamp();

                    await logChannel.send({ embeds: [logEmbed] });
                }
            } catch (logError) {
                console.log('Could not send purchase log:', logError.message);
            }

        } else {
            await interaction.reply({
                content: `❌ Échec de l'achat: ${result.message}`,
                ephemeral: true
            });
        }
    }
};