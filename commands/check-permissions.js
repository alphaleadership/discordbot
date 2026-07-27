import { SlashCommandBuilder, EmbedBuilder, PermissionsBitField } from 'discord.js';

export default {
    data: new SlashCommandBuilder()
        .setName('check-permissions')
        .setDescription('Vérifie si le bot a toutes les permissions requises pour son bon fonctionnement')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.Administrator)
        .setDMPermission(false),
    
    async execute(interaction) {
        const requiredPermissions = [
            { flag: PermissionsBitField.Flags.ViewChannel, name: 'Voir les salons' },
            { flag: PermissionsBitField.Flags.SendMessages, name: 'Envoyer des messages' },
            { flag: PermissionsBitField.Flags.ManageRoles, name: 'Gérer les rôles' },
            { flag: PermissionsBitField.Flags.ManageChannels, name: 'Gérer les salons' },
            { flag: PermissionsBitField.Flags.KickMembers, name: 'Expulser des membres' },
            { flag: PermissionsBitField.Flags.BanMembers, name: 'Bannir des membres' },
            { flag: PermissionsBitField.Flags.ModerateMembers, name: 'Exclure temporairement (Timeout)' },
            { flag: PermissionsBitField.Flags.ManageMessages, name: 'Gérer les messages' }
        ];

        const botMember = await interaction.guild.members.fetch(interaction.client.user.id);
        const botPermissions = botMember.permissions;

        let description = '**État des permissions requises :**\n\n';
        let allGood = true;

        for (const perm of requiredPermissions) {
            if (botPermissions.has(perm.flag)) {
                description += `✅ **${perm.name}**\n`;
            } else {
                description += `❌ **${perm.name}** (Manquante)\n`;
                allGood = false;
            }
        }

        if (allGood) {
            description += '\n✨ Le bot a toutes les permissions nécessaires !';
        } else {
            description += '\n⚠️ **Attention** : Certaines permissions manquent. Le bot pourrait ne pas fonctionner correctement.';
        }

        const embed = new EmbedBuilder()
            .setTitle('Vérification des permissions du bot')
            .setDescription(description)
            .setColor(allGood ? '#00FF00' : '#FF0000')
            .setTimestamp();

        await interaction.reply({ embeds: [embed], ephemeral: true });
    }
};
