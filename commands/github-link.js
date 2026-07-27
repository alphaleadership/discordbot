import { SlashCommandBuilder, EmbedBuilder, PermissionsBitField, ChannelType } from 'discord.js';

export default {
    data: new SlashCommandBuilder()
        .setName('github-link')
        .setDescription('Lier un dépôt GitHub à un salon Discord')
        .setDMPermission(false)
        .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator)
        .addChannelOption(option =>
            option.setName('salon')
                .setDescription('Le salon Discord à lier')
                .addChannelTypes(ChannelType.GuildText)
                .setRequired(true))
        .addStringOption(option =>
            option.setName('proprietaire')
                .setDescription('Le propriétaire du dépôt GitHub (ex: alphaleadership)')
                .setRequired(true))
        .addStringOption(option =>
            option.setName('depot')
                .setDescription('Le nom du dépôt GitHub (ex: discordbot)')
                .setRequired(true)),

    async execute(interaction, adminManager, warnManager, guildConfig) {
        const guildId = interaction.guild.id;
        const channel = interaction.options.getChannel('salon');
        const owner = interaction.options.getString('proprietaire').trim();
        const repo = interaction.options.getString('depot').trim();

        guildConfig.setGithubLink(guildId, channel.id, owner, repo);

        const embed = new EmbedBuilder()
            .setTitle('🔗 Dépôt GitHub Lié')
            .setDescription(`Le salon ${channel} a été associé avec succès au dépôt GitHub.`)
            .addFields(
                { name: 'Dépôt GitHub', value: `[${owner}/${repo}](https://github.com/${owner}/${repo})`, inline: true },
                { name: 'Salon Discord', value: `${channel}`, inline: true }
            )
            .setColor('#24292f')
            .setTimestamp();

        return interaction.reply({ embeds: [embed] });
    }
};
