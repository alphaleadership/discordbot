import { SlashCommandBuilder, EmbedBuilder, PermissionsBitField } from 'discord.js';

export default {
    data: new SlashCommandBuilder()
        .setName('dossier')
        .setDescription('Gérer les dossiers d\'espionnage confidentiels sur les membres')
        .addSubcommand(subcommand =>
            subcommand
                .setName('consulter')
                .setDescription('Consulter ou créer le dossier d\'un membre')
                .addUserOption(option =>
                    option.setName('membre')
                        .setDescription('Le membre à cibler')
                        .setRequired(true)
                )
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('note')
                .setDescription('Ajouter un rapport d\'agent ou une note de dossier sur un membre')
                .addUserOption(option =>
                    option.setName('membre')
                        .setDescription('Le membre ciblé')
                        .setRequired(true)
                )
                .addStringOption(option =>
                    option.setName('rapport')
                        .setDescription('Le rapport ou la note d\'observation à ajouter')
                        .setRequired(true)
                )
        ),

    async execute(interaction, adminManager, warnManager, guildConfig, sharedConfig, backupToGitHub, reportManager, banlistManager, blockedWordsManager, watchlistManager, telegramIntegration, funCommandsManager, raidDetector, doxDetector, enhancedReloadSystem, permissionValidator, dmTicketManager, economyManager, forumReportManager, espionageManager) {
        if (!adminManager.isAgent(interaction.user.id)) {
            return interaction.reply({
                content: '❌ Accès refusé : Cette commande est strictement réservée aux agents et administrateurs du bot.',
                ephemeral: true
            });
        }

        if (!espionageManager) {
            return interaction.reply({
                content: '❌ Erreur : Le service de renseignement et d\'espionnage n\'est pas activé sur ce bot.',
                ephemeral: true
            });
        }

        const subcommand = interaction.options.getSubcommand();
        const user = interaction.options.getUser('membre');
        const member = await interaction.guild.members.fetch(user.id).catch(() => null);

        if (!member) {
            return interaction.reply({
                content: '❌ Membre introuvable sur ce serveur.',
                ephemeral: true
            });
        }

        if (user.bot) {
            return interaction.reply({
                content: '❌ Impossible d\'espionner ou de créer un dossier sur un automate (bot).',
                ephemeral: true
            });
        }

        await interaction.deferReply({ ephemeral: true });

        try {
            if (subcommand === 'consulter') {
                const thread = await espionageManager.getOrCreateMemberDossier(member);
                if (!thread) {
                    return interaction.editReply({
                        content: '❌ Impossible de créer ou d\'accéder au dossier de ce membre.'
                    });
                }

                const embed = new EmbedBuilder()
                    .setColor('#00ff00')
                    .setTitle(`✅ Dossier opérationnel : ${user.username}`)
                    .setDescription(`Le dossier de renseignement a été récupéré avec succès dans le salon d'espionnage.`)
                    .addFields(
                        { name: '👤 Cible', value: `${user} (ID: \`${user.id}\`)`, inline: true },
                        { name: '📁 Accès au Dossier', value: `[Ouvrir le Dossier Classé Confidential](${thread.url})`, inline: true }
                    )
                    .setFooter({ text: 'Service de Renseignement de Monteloria' })
                    .setTimestamp();

                await interaction.editReply({ embeds: [embed] });

            } else if (subcommand === 'note') {
                const noteContent = interaction.options.getString('rapport');
                const success = await espionageManager.addNote(member, noteContent, interaction.user.id);

                if (success) {
                    const thread = await espionageManager.getOrCreateMemberDossier(member);
                    await interaction.editReply({
                        content: `✅ Rapport d'agent enregistré avec succès pour ${user.username} dans son [Dossier Classé](${thread.url}).`
                    });
                } else {
                    await interaction.editReply({
                        content: '❌ Échec de l\'enregistrement du rapport d\'agent.'
                    });
                }
            }
        } catch (error) {
            console.error('Error executing dossier command:', error);
            await interaction.editReply({
                content: '❌ Une erreur est survenue lors de l\'accès au système de dossiers.'
            });
        }
    }
};
