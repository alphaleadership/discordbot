import { SlashCommandBuilder, EmbedBuilder, PermissionsBitField, ChannelType } from 'discord.js';

export default {
    data: new SlashCommandBuilder()
        .setName('service-setup')
        .setDescription('Configure le rôle et le salon de logs pour la prise de service')
        .setDMPermission(false)
        .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator)
        .addRoleOption(option =>
            option.setName('role')
                .setDescription('Le rôle attribué en service')
                .setRequired(true))
        .addChannelOption(option =>
            option.setName('logs')
                .setDescription('Le salon où envoyer les logs de service')
                .addChannelTypes(ChannelType.GuildText)
                .setRequired(true)),

    async execute(interaction, adminManager, warnManager, guildConfig) {
        const guildId = interaction.guild.id;
        const role = interaction.options.getRole('role');
        const logChannel = interaction.options.getChannel('logs');

        guildConfig.setServiceSettings(guildId, role.id, logChannel.id);

        const embed = new EmbedBuilder()
            .setTitle('⚙️ Service configuré')
            .setDescription('Le système de prise de service a été configuré avec succès !')
            .addFields(
                { name: 'Rôle de service', value: `${role}`, inline: true },
                { name: 'Salon de logs', value: `${logChannel}`, inline: true }
            )
            .setColor('#3b82f6')
            .setTimestamp();

        return interaction.reply({ embeds: [embed] });
    }
};
