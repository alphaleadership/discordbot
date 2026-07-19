import { SlashCommandBuilder, EmbedBuilder, PermissionsBitField, ChannelType } from 'discord.js';


export default {
    data: new SlashCommandBuilder()
        .setName('quarantine')
        .setDescription('Système de quarantaine pour isoler les utilisateurs suspects')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.ModerateMembers)
        .setDMPermission(false)
        .addSubcommand(subcommand =>
            subcommand
                .setName('setup')
                .setDescription('Configure le rôle et le salon de quarantaine'))
        .addSubcommand(subcommand =>
            subcommand
                .setName('add')
                .setDescription('Place un utilisateur en quarantaine')
                .addUserOption(option => 
                    option.setName('utilisateur')
                        .setDescription("L'utilisateur à mettre en quarantaine")
                        .setRequired(true))
                .addStringOption(option =>
                    option.setName('raison')
                        .setDescription('La raison de la quarantaine')
                        .setRequired(false)))
        .addSubcommand(subcommand =>
            subcommand
                .setName('remove')
                .setDescription('Retire un utilisateur de la quarantaine')
                .addUserOption(option => 
                    option.setName('utilisateur')
                        .setDescription("L'utilisateur à retirer de la quarantaine")
                        .setRequired(true))),
    
    async execute(interaction, adminManager, warnManager, guildConfig) {
        const subcommand = interaction.options.getSubcommand();
        const guildId = interaction.guild.id;

        if (subcommand === 'setup') {
            await interaction.deferReply({ ephemeral: true });

            try {
                // Création du rôle de quarantaine
                const role = await interaction.guild.roles.create({
                    name: 'Quarantaine',
                    color: '#ff0000',
                    reason: 'Setup système de quarantaine'
                });

                // Création du salon de quarantaine
                const channel = await interaction.guild.channels.create({
                    name: 'quarantaine',
                    type: ChannelType.GuildText,
                    permissionOverwrites: [
                        {
                            id: interaction.guild.id,
                            deny: [PermissionsBitField.Flags.ViewChannel],
                        },
                        {
                            id: role.id,
                            allow: [
                                PermissionsBitField.Flags.ViewChannel,
                                PermissionsBitField.Flags.ReadMessageHistory
                            ],
                            deny: [
                                PermissionsBitField.Flags.SendMessages,
                                PermissionsBitField.Flags.AddReactions
                            ]
                        }
                    ],
                    reason: 'Setup système de quarantaine'
                });

                guildConfig.setQuarantineSettings(guildId, role.id, channel.id);

                const embed = new EmbedBuilder()
                    .setTitle('✅ Système de quarantaine configuré')
                    .setDescription(`Le rôle ${role} et le salon ${channel} ont été créés avec succès.\n\nAssurez-vous de placer le rôle "Quarantaine" suffisamment haut dans la hiérarchie pour qu'il puisse être appliqué aux membres.`)
                    .setColor('#00ff00');

                await interaction.editReply({ embeds: [embed] });

            } catch (error) {
                console.error(error);
                await interaction.editReply('❌ Une erreur est survenue lors de la configuration. Vérifiez que le bot a les permissions de gérer les rôles et les salons.');
            }
        } 
        else if (subcommand === 'add') {
            const targetUser = interaction.options.getUser('utilisateur');
            const reason = interaction.options.getString('raison') || 'Aucune raison spécifiée';
            const member = await interaction.guild.members.fetch(targetUser.id).catch(() => null);

            if (!member) {
                return interaction.reply({ content: '❌ Utilisateur introuvable.', ephemeral: true });
            }

            let settings = guildConfig.getQuarantineSettings(guildId);
            let autoConfigured = false;
            if ((!settings || !settings.roleId) && 
                interaction.guild.members.me.permissions.has(PermissionsBitField.Flags.ManageRoles) && 
                interaction.guild.members.me.permissions.has(PermissionsBitField.Flags.ManageChannels)) {
                try {
                    const role = await interaction.guild.roles.create({
                        name: 'Quarantaine',
                        color: '#ff0000',
                        reason: 'Auto-setup système de quarantaine'
                    });
                    const channel = await interaction.guild.channels.create({
                        name: 'quarantaine',
                        type: ChannelType.GuildText,
                        permissionOverwrites: [
                            { id: interaction.guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
                            { id: role.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.ReadMessageHistory], deny: [PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.AddReactions] }
                        ],
                        reason: 'Auto-setup système de quarantaine'
                    });
                    guildConfig.setQuarantineSettings(guildId, role.id, channel.id);
                    settings = guildConfig.getQuarantineSettings(guildId);
                    autoConfigured = true;
                } catch (e) {
                    console.error('Auto-setup quarantaine échoué:', e);
                }
            }

            if (!settings || !settings.roleId) {
                return interaction.reply({ content: "❌ Le système de quarantaine n'est pas configuré et n'a pas pu être créé automatiquement. Utilisez `/quarantine setup`.", ephemeral: true });
            }

            try {
                await member.roles.add(settings.roleId, `Mis en quarantaine par ${interaction.user.tag} - Raison: ${reason}`);

                const embed = new EmbedBuilder()
                    .setTitle('🔒 Utilisateur en quarantaine')
                    .setDescription(`${targetUser} a été mis en quarantaine.`)
                    .addFields(
                        { name: 'Raison', value: reason },
                        { name: 'Modérateur', value: interaction.user.tag }
                    )
                    .setColor('#ff0000')
                    .setTimestamp();
                    
                if (autoConfigured) {
                    embed.setFooter({ text: '⚙️ Le système de quarantaine a été automatiquement configuré.' });
                }

                await interaction.reply({ embeds: [embed] });
            } catch (error) {
                console.error(error);
                await interaction.reply({ content: "❌ Impossible de mettre l'utilisateur en quarantaine. Vérifiez la hiérarchie des rôles.", ephemeral: true });
            }
        }
        else if (subcommand === 'remove') {
            const targetUser = interaction.options.getUser('utilisateur');
            const member = await interaction.guild.members.fetch(targetUser.id).catch(() => null);

            if (!member) {
                return interaction.reply({ content: '❌ Utilisateur introuvable.', ephemeral: true });
            }

            const settings = guildConfig.getQuarantineSettings(guildId);
            if (!settings || !settings.roleId) {
                return interaction.reply({ content: "❌ Le système de quarantaine n'est pas configuré.", ephemeral: true });
            }

            try {
                await member.roles.remove(settings.roleId, `Retiré de la quarantaine par ${interaction.user.tag}`);

                const embed = new EmbedBuilder()
                    .setTitle('🔓 Utilisateur libéré')
                    .setDescription(`${targetUser} a été retiré de la quarantaine.`)
                    .setColor('#00ff00')
                    .setTimestamp();

                await interaction.reply({ embeds: [embed] });
            } catch (error) {
                console.error(error);
                await interaction.reply({ content: "❌ Impossible de retirer l'utilisateur de la quarantaine. Vérifiez la hiérarchie des rôles.", ephemeral: true });
            }
        }
    }
};
