import { SlashCommandBuilder, EmbedBuilder, PermissionsBitField, ChannelType } from 'discord.js';

export default {
    data: new SlashCommandBuilder()
        .setName('setup-honeypot')
        .setDescription('Configurer le système de honeypot (autoban anti-raid)')
        .addSubcommand(subcommand =>
            subcommand
                .setName('status')
                .setDescription('Afficher le statut actuel du honeypot')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('enable')
                .setDescription('Activer le système de honeypot')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('disable')
                .setDescription('Désactiver le système de honeypot')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('set-channel')
                .setDescription('Définir un salon existant comme honeypot')
                .addChannelOption(option =>
                    option.setName('salon')
                        .setDescription('Le salon à utiliser comme honeypot')
                        .addChannelTypes(ChannelType.GuildText)
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('create')
                .setDescription('Créer automatiquement un salon honeypot caché')
                .addStringOption(option =>
                    option.setName('nom')
                        .setDescription('Le nom du salon (par défaut: honeypot-raid)')
                        .setRequired(false)
                )
        ),

    async execute(interaction, adminManager, warnManager, guildConfig, sharedConfig, backupToGitHub, reportManager, banlistManager) {
        try {
            // Vérifier les permissions
            if (!interaction.member.permissions.has(PermissionsBitField.Flags.Administrator) && 
                !interaction.member.permissions.has(PermissionsBitField.Flags.ManageGuild)) {
                return interaction.reply({
                    content: '❌ Vous devez être administrateur ou avoir la permission "Gérer le serveur" pour utiliser cette commande.',
                    ephemeral: true
                });
            }

            const subcommand = interaction.options.getSubcommand();
            const guildId = interaction.guild.id;

            if (subcommand === 'status') {
                const config = guildConfig.getHoneypotConfig(guildId);
                const channel = config.channelId ? interaction.guild.channels.cache.get(config.channelId) : null;

                const embed = new EmbedBuilder()
                    .setColor(config.enabled ? '#00FF00' : '#FF0000')
                    .setTitle('🛡️ Statut du Système Honeypot')
                    .addFields(
                        { name: 'État', value: config.enabled ? '✅ Activé' : '❌ Désactivé', inline: true },
                        { name: 'Salon', value: channel ? `${channel} (${channel.name})` : '⚠️ Non configuré', inline: true }
                    )
                    .setFooter({ text: 'Toute personne écrivant dans ce salon sera bannie instantanément.' })
                    .setTimestamp();

                return interaction.reply({ embeds: [embed] });
            }

            if (subcommand === 'enable') {
                const config = guildConfig.getHoneypotConfig(guildId);
                if (!config.channelId) {
                    return interaction.reply({
                        content: '⚠️ Vous devez d\'abord configurer un salon avec `/setup-honeypot set-channel` ou `/setup-honeypot create`.',
                        ephemeral: true
                    });
                }
                guildConfig.setHoneypotEnabled(guildId, true);
                return interaction.reply({ content: '✅ Système de honeypot **activé**.', ephemeral: true });
            }

            if (subcommand === 'disable') {
                guildConfig.setHoneypotEnabled(guildId, false);
                return interaction.reply({ content: '✅ Système de honeypot **désactivé**.', ephemeral: true });
            }

            if (subcommand === 'set-channel') {
                const channel = interaction.options.getChannel('salon');
                guildConfig.setHoneypotChannelId(guildId, channel.id);
                guildConfig.setHoneypotEnabled(guildId, true);

                const embed = new EmbedBuilder()
                    .setColor('#0099FF')
                    .setTitle('⚙️ Honeypot Configuré')
                    .setDescription(`Le salon ${channel} a été défini comme honeypot. Le système est maintenant **activé**.`)
                    .setFooter({ text: 'Attention : Toute personne écrivant dans ce salon (hors admins) sera bannie.' });

                return interaction.reply({ embeds: [embed] });
            }

            if (subcommand === 'create') {
                await interaction.deferReply({ ephemeral: true });

                const channelName = interaction.options.getString('nom') || 'honeypot-raid';
                
                try {
                    // Créer un salon visible par tout le monde
                    const channel = await interaction.guild.channels.create({
                        name: channelName,
                        type: ChannelType.GuildText,
                        permissionOverwrites: [
                            {
                                id: interaction.guild.id, // @everyone
                                allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages],
                            },
                            {
                                id: interaction.client.user.id, // Le bot lui-même
                                allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory, PermissionsBitField.Flags.ManageChannels],
                            }
                        ],
                        topic: '⚠️ NE PAS ÉCRIRE ICI - SYSTÈME DE PROTECTION ANTI-RAID ⚠️ Toute personne envoyant un message ici sera bannie.'
                    });

                    guildConfig.setHoneypotChannelId(guildId, channel.id);
                    guildConfig.setHoneypotEnabled(guildId, true);

                    const explantionEmbed = new EmbedBuilder()
                        .setColor('#FF0000')
                        .setTitle('🛡️ Système Honeypot Activé')
                        .setDescription('Ce salon sert de piège pour les robots de raid et les comptes compromis.\n\n⚠️ **ATTENTION** : Toute personne (hors administrateurs) qui envoie un message dans ce salon sera **immédiatement bannie** du serveur.')
                        .addFields(
                            { name: 'Pourquoi ce salon ?', value: 'Les outils de raid automatisés tentent souvent de poster dans tous les salons visibles. Ce salon permet de les détecter et de les éliminer instantanément.' },
                            { name: 'Sécurité', value: 'Ce salon est visible par tout le monde afin de piéger les comptes compromis. Ne postez jamais ici.' }
                        )
                        .setTimestamp();
                    
                    await channel.send({ embeds: [explantionEmbed] });

                    const embed = new EmbedBuilder()
                        .setColor('#00FF00')
                        .setTitle('✨ Honeypot Créé')
                        .setDescription(`Un nouveau salon ${channel} a été créé et configuré comme honeypot.`)
                        .addFields(
                            { name: 'Configuration', value: 'Le salon est visible par `@everyone` pour piéger les comptes compromis. Les membres normaux ne doivent pas y écrire sous peine de bannissement.' }
                        )
                        .setFooter({ text: 'Le système est maintenant activé.' });

                    return interaction.editReply({ embeds: [embed] });
                } catch (error) {
                    console.error('Erreur lors de la création du salon honeypot:', error);
                    return interaction.editReply({ content: '❌ Impossible de créer le salon. Vérifiez les permissions du bot.' });
                }
            }

        } catch (error) {
            console.error('Erreur dans la commande setup-honeypot:', error);
            await interaction.reply({ content: '❌ Une erreur est survenue.', ephemeral: true });
        }
    },
};
