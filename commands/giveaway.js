import { SlashCommandBuilder, EmbedBuilder, PermissionsBitField, ChannelType } from 'discord.js';

export default {
    data: new SlashCommandBuilder()
        .setName('giveaway')
        .setDescription('Système complet de tirages au sort et giveaways')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageGuild)
        .addSubcommand(subcommand =>
            subcommand
                .setName('start')
                .setDescription('Lancer un nouveau giveaway')
                .addStringOption(option =>
                    option.setName('lot')
                        .setDescription('Le lot / prix à remporter (ex: Nitro, 5000 Coins, Rôle VIP)')
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option.setName('duree')
                        .setDescription('Durée du giveaway (ex: 30s, 15m, 2h, 1d, 3j)')
                        .setRequired(true)
                )
                .addIntegerOption(option =>
                    option.setName('gagnants')
                        .setDescription('Nombre de gagnants (défaut : 1)')
                        .setRequired(false)
                        .setMinValue(1)
                        .setMaxValue(20)
                )
                .addChannelOption(option =>
                    option.setName('salon')
                        .setDescription('Salon où envoyer le giveaway (défaut : salon actuel)')
                        .setRequired(false)
                        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
                )
                .addIntegerOption(option =>
                    option.setName('recompense_coins')
                        .setDescription('Montant de coins crédité automatiquement à chaque gagnant')
                        .setRequired(false)
                        .setMinValue(1)
                )
                .addRoleOption(option =>
                    option.setName('role_requis')
                        .setDescription('Rôle Discord requis pour s\'inscrire')
                        .setRequired(false)
                )
                .addIntegerOption(option =>
                    option.setName('age_min_jours')
                        .setDescription('Ancienneté minimale du compte Discord (en jours)')
                        .setRequired(false)
                        .setMinValue(0)
                        .setMaxValue(365)
                )
                .addStringOption(option =>
                    option.setName('description')
                        .setDescription('Consignes ou détails supplémentaires')
                        .setRequired(false)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('end')
                .setDescription('Terminer immédiatement un giveaway en cours et tirer les gagnants')
                .addStringOption(option =>
                    option.setName('message_id')
                        .setDescription('ID du message du giveaway à clôturer')
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('reroll')
                .setDescription('Tirer de nouveaux gagnants pour un giveaway terminé')
                .addStringOption(option =>
                    option.setName('message_id')
                        .setDescription('ID du message du giveaway terminé')
                        .setRequired(true)
                )
                .addIntegerOption(option =>
                    option.setName('gagnants')
                        .setDescription('Nombre de nouveaux gagnants à tirer (défaut : 1)')
                        .setRequired(false)
                        .setMinValue(1)
                        .setMaxValue(20)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('cancel')
                .setDescription('Annuler un giveaway en cours')
                .addStringOption(option =>
                    option.setName('message_id')
                        .setDescription('ID du message du giveaway à annuler')
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option.setName('raison')
                        .setDescription('Raison de l\'annulation')
                        .setRequired(false)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('list')
                .setDescription('Afficher la liste des giveaways en cours sur ce serveur')
        ),

    async execute(interaction, adminManager, warnManager, guildConfig, sharedConfig, backupToGitHub, reportManager, banlistManager, blockedWordsManager, watchlistManager, telegramIntegration, funCommandsManager, raidDetector, doxDetector, enhancedReloadSystem, permissionValidator, economyManager) {
        try {
            if (!interaction.inGuild()) {
                return interaction.reply({
                    content: '❌ Cette commande ne peut être utilisée que sur un serveur.',
                    ephemeral: true
                });
            }

            // Vérification des permissions (Admin serveur, ManageGuild, ManageMessages ou Admin bot)
            const isBotAdmin = adminManager ? await adminManager.isAdmin(interaction.user.id) : false;
            const hasMemberPerms = interaction.member?.permissions?.has(PermissionsBitField.Flags.Administrator)
                || interaction.member?.permissions?.has(PermissionsBitField.Flags.ManageGuild)
                || interaction.member?.permissions?.has(PermissionsBitField.Flags.ManageMessages);

            if (!isBotAdmin && !hasMemberPerms) {
                return interaction.reply({
                    content: '❌ Vous devez disposer de la permission de gérer le serveur ou les messages pour utiliser cette commande.',
                    ephemeral: true
                });
            }

            // Résolution du GiveawayManager
            const giveawayManager = interaction.client?.giveawayManager
                || [arguments[16], arguments[17], arguments[18], arguments[19], arguments[20], arguments[21], arguments[22], arguments[23]].find(arg => arg && typeof arg.createGiveaway === 'function');

            if (!giveawayManager) {
                return interaction.reply({
                    content: '❌ Le système de giveaway n\'est pas initialisé actuellement.',
                    ephemeral: true
                });
            }

            const subcommand = interaction.options.getSubcommand();
            const guildId = interaction.guild.id;

            if (subcommand === 'start') {
                const prize = interaction.options.getString('lot');
                const durationStr = interaction.options.getString('duree');
                const winnerCount = interaction.options.getInteger('gagnants') || 1;
                const targetChannel = interaction.options.getChannel('salon') || interaction.channel;
                const coinsReward = interaction.options.getInteger('recompense_coins') || 0;
                const roleRequired = interaction.options.getRole ? interaction.options.getRole('role_requis') : null;
                const minAccountAgeDays = interaction.options.getInteger('age_min_jours') || 0;
                const description = interaction.options.getString('description') || null;

                const durationMs = giveawayManager.parseDuration(durationStr);
                if (!durationMs) {
                    return interaction.reply({
                        content: '❌ Format de durée invalide. Utilisez par exemple: `30s`, `15m`, `2h`, `1d`, `3j`, `1w`.',
                        ephemeral: true
                    });
                }

                if (durationMs < 10000) {
                    return interaction.reply({
                        content: '❌ La durée minimale d\'un giveaway est de **10 secondes**.',
                        ephemeral: true
                    });
                }

                if (durationMs > 30 * 24 * 60 * 60 * 1000) {
                    return interaction.reply({
                        content: '❌ La durée maximale d\'un giveaway est de **30 jours**.',
                        ephemeral: true
                    });
                }

                // Différer la réponse pour éviter le timeout Discord
                await interaction.deferReply({ ephemeral: true });

                const endsAt = Date.now() + durationMs;
                const tempGiveaway = {
                    id: 'temp',
                    prize,
                    winnerCount,
                    hostedById: interaction.user.id,
                    hostedBy: interaction.user.tag,
                    endsAt,
                    ended: false,
                    cancelled: false,
                    participants: [],
                    coinsReward,
                    roleRequiredId: roleRequired ? roleRequired.id : null,
                    minAccountAgeDays,
                    description
                };

                const embed = giveawayManager.buildEmbed(tempGiveaway);
                const row = giveawayManager.buildActionRow(tempGiveaway);

                let giveawayMessage;
                try {
                    giveawayMessage = await targetChannel.send({
                        embeds: [embed],
                        components: [row]
                    });
                } catch (sendErr) {
                    return interaction.editReply({
                        content: `❌ Impossible d'envoyer le message de giveaway dans ${targetChannel}. Vérifiez les permissions du bot.`
                    });
                }

                // Enregistrer le giveaway avec l'ID du message créé
                tempGiveaway.id = giveawayMessage.id;
                tempGiveaway.messageId = giveawayMessage.id;
                tempGiveaway.guildId = guildId;
                tempGiveaway.channelId = targetChannel.id;

                giveawayManager.createGiveaway(tempGiveaway);

                // Mettre à jour le message avec le vrai ID
                await giveawayMessage.edit({
                    embeds: [giveawayManager.buildEmbed(tempGiveaway)],
                    components: [giveawayManager.buildActionRow(tempGiveaway)]
                }).catch(console.error);

                return interaction.editReply({
                    content: `🎉 Giveaway pour **${prize}** créé et lancé avec succès dans ${targetChannel} !\nID du message : \`${giveawayMessage.id}\``
                });
            }

            if (subcommand === 'end') {
                const messageId = interaction.options.getString('message_id');
                const result = await giveawayManager.endGiveaway(messageId, interaction.client);

                if (!result.success) {
                    return interaction.reply({
                        content: `❌ Échec de la clôture du giveaway : ${result.message}`,
                        ephemeral: true
                    });
                }

                const winnersStr = result.winners && result.winners.length > 0
                    ? result.winners.map(id => `<@${id}>`).join(', ')
                    : 'Aucun gagnant (aucun participant valide)';

                return interaction.reply({
                    content: `✅ Le giveaway pour **${result.giveaway.prize}** a été clôturé avec succès !\n🏆 Gagnant(s) : ${winnersStr}`,
                    ephemeral: true
                });
            }

            if (subcommand === 'reroll') {
                const messageId = interaction.options.getString('message_id');
                const count = interaction.options.getInteger('gagnants') || 1;
                const result = await giveawayManager.rerollGiveaway(messageId, interaction.client, count);

                if (!result.success) {
                    return interaction.reply({
                        content: `❌ Impossible d'effectuer le reroll : ${result.message}`,
                        ephemeral: true
                    });
                }

                const winnersStr = result.newWinners.map(id => `<@${id}>`).join(', ');
                return interaction.reply({
                    content: `🎲 Reroll effectué avec succès !\n🏆 Nouveau(x) gagnant(s) : ${winnersStr}`,
                    ephemeral: true
                });
            }

            if (subcommand === 'cancel') {
                const messageId = interaction.options.getString('message_id');
                const reason = interaction.options.getString('raison') || `Annulé par ${interaction.user.tag}`;
                const result = await giveawayManager.cancelGiveaway(messageId, interaction.client, reason);

                if (!result.success) {
                    return interaction.reply({
                        content: `❌ Impossible d'annuler le giveaway : ${result.message}`,
                        ephemeral: true
                    });
                }

                return interaction.reply({
                    content: `❌ Le giveaway pour **${result.giveaway.prize}** a bien été annulé.`,
                    ephemeral: true
                });
            }

            if (subcommand === 'list') {
                const activeGiveaways = giveawayManager.getGuildGiveaways(guildId, true);

                if (activeGiveaways.length === 0) {
                    return interaction.reply({
                        content: 'ℹ️ Aucun giveaway actif n\'est en cours sur ce serveur.',
                        ephemeral: true
                    });
                }

                const embed = new EmbedBuilder()
                    .setColor('#5865F2')
                    .setTitle(`🎁 Giveaways actifs sur ${interaction.guild.name}`)
                    .setDescription(`Il y a actuellement **${activeGiveaways.length}** tirage(s) au sort en cours :`)
                    .setFooter({ text: `${activeGiveaways.length} giveaway(s) actif(s)` })
                    .setTimestamp();

                for (const gw of activeGiveaways) {
                    const timeRemaining = `<t:${Math.floor(gw.endsAt / 1000)}:R>`;
                    const channelMention = `<#${gw.channelId}>`;
                    const info = `• **Lot :** ${gw.prize}\n• **Salon :** ${channelMention}\n• **Fin :** ${timeRemaining}\n• **Gagnants :** ${gw.winnerCount} | **Participants :** \`${gw.participants.length}\`\n• **ID :** \`${gw.id}\``;
                    embed.addFields({ name: `🎉 ${gw.prize}`, value: info, inline: false });
                }

                return interaction.reply({ embeds: [embed], ephemeral: true });
            }

        } catch (error) {
            console.error('Erreur lors de la commande giveaway:', error);
            const errorMsg = error.message || 'Une erreur inattendue est survenue.';
            if (interaction.deferred || interaction.replied) {
                await interaction.editReply({ content: `❌ Erreur: ${errorMsg}` });
            } else {
                await interaction.reply({ content: `❌ Erreur: ${errorMsg}`, ephemeral: true });
            }
        }
    }
};
