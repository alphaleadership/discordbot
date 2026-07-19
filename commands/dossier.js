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
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('reset')
                .setDescription('Régénère entièrement tous les dossiers d\'espionnage côté Discord (Admin uniquement)')
        )
        .addSubcommand(subcommand =>
            subcommand
                .setName('clear')
                .setDescription('Supprime définitivement le dossier d\'un membre (Admin uniquement)')
                .addUserOption(option =>
                    option.setName('membre')
                        .setDescription('Le membre dont le dossier doit être supprimé')
                        .setRequired(true)
                )
        ),

    async execute(interaction, adminManager, warnManager, guildConfig, sharedConfig, backupToGitHub, reportManager, banlistManager, blockedWordsManager, watchlistManager, telegramIntegration, funCommandsManager, raidDetector, doxDetector, enhancedReloadSystem, permissionValidator, economyManager, forumReportManager, autoConfigManager, dmTicketManager, customsManager, espionageManager) {
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

        if (subcommand === 'reset') {
            if (!adminManager.isAdmin(interaction.user.id)) {
                return interaction.reply({
                    content: '❌ Accès refusé : Cette action de réinitialisation est strictement réservée aux administrateurs du bot.',
                    ephemeral: true
                });
            }

            await interaction.deferReply({ ephemeral: true });

            try {
                const result = await espionageManager.regenerateAllDossiers(interaction.guild);
                if (result.success) {
                    return interaction.editReply({
                        content: `✅ Régénération terminée : **${result.count}** dossiers d'espionnage ont été recréés sur Discord avec toutes leurs notes historiques.`
                    });
                } else {
                    return interaction.editReply({
                        content: `❌ Échec de la régénération : ${result.message}`
                    });
                }
            } catch (error) {
                console.error('Error during global dossiers regeneration:', error);
                return interaction.editReply({
                    content: '❌ Une erreur critique est survenue lors de la régénération des dossiers.'
                });
            }
        } else if (subcommand === 'clear') {
            if (!adminManager.isAdmin(interaction.user.id)) {
                return interaction.reply({
                    content: '❌ Accès refusé : Cette action de suppression est strictement réservée aux administrateurs du bot.',
                    ephemeral: true
                });
            }

            const targetUser = interaction.options.getUser('membre', true);
            await interaction.deferReply({ ephemeral: true });

            try {
                const result = await espionageManager.clearMemberDossier(targetUser, interaction.guild);
                if (result.success) {
                    return interaction.editReply({
                        content: `✅ Dossier de **${result.username}** supprimé définitivement (thread Discord supprimé et base locale nettoyée).`
                    });
                } else {
                    return interaction.editReply({
                        content: `❌ Échec du nettoyage : ${result.message}`
                    });
                }
            } catch (error) {
                console.error('Error clearing member dossier:', error);
                return interaction.editReply({
                    content: '❌ Une erreur critique est survenue lors de la suppression du dossier.'
                });
            }
        }

        const user = interaction.options.getUser('membre', false);

        if (!user) {
            return interaction.reply({
                content: '❌ Option membre manquante.',
                ephemeral: true
            });
        }

        if (user.bot) {
            return interaction.reply({
                content: '❌ Impossible d\'espionner ou de créer un dossier sur un automate (bot).',
                ephemeral: true
            });
        }

        // On tente de récupérer le membre s'il est encore sur le serveur,
        // mais on ne bloque plus la commande s'il n'y est pas (ex: parti, expulsé).
        const member = await interaction.guild.members.fetch(user.id).catch(() => null);
        const target = member ?? user; // on utilise le member si dispo, sinon le user brut

        await interaction.deferReply({ ephemeral: true });

        try {
            if (subcommand === 'consulter') {
                console.log(`[DEBUG COMMAND] Consultation demandée pour ${user.username} (${user.id}).`);
                const thread = await espionageManager.getOrCreateMemberDossier(target);
                if (!thread) {
                    console.log(`[DEBUG COMMAND] Échec de la récupération ou création du dossier pour ${user.username}.`);
                    return interaction.editReply({
                        content: '❌ Impossible de créer ou d\'accéder au dossier de ce membre.'
                    });
                }

                console.log(`[DEBUG COMMAND] Dossier récupéré avec succès. URL: ${thread.url}`);
                const embed = new EmbedBuilder()
                    .setColor('#00ff00')
                    .setTitle(`✅ Dossier opérationnel : ${user.username}`)
                    .setDescription(`Le dossier de renseignement a été récupéré avec succès dans le salon d'espionnage.${!member ? '\n⚠️ *Ce membre n\'est plus présent sur le serveur.*' : ''}`)
                    .addFields(
                        { name: '👤 Cible', value: `${user} (ID: \`${user.id}\`)`, inline: true },
                        { name: '📁 Accès au Dossier', value: `[Ouvrir le Dossier Classé Confidential](${thread.url})`, inline: true }
                    )
                    .setFooter({ text: 'Service de Renseignement de Monteloria' })
                    .setTimestamp();

                await interaction.editReply({ embeds: [embed] });

            } else if (subcommand === 'note') {
                const noteContent = interaction.options.getString('rapport');
                console.log(`[DEBUG COMMAND] Ajout de note demandée pour ${user.username} (${user.id}). Contenu: "${noteContent}"`);
                const success = await espionageManager.addNote(target, noteContent, interaction.user.id);

                if (success) {
                    console.log(`[DEBUG COMMAND] Note ajoutée avec succès. Récupération du thread pour réponse...`);
                    const thread = await espionageManager.getOrCreateMemberDossier(target);
                    await interaction.editReply({
                        content: `✅ Rapport d'agent enregistré avec succès pour ${user.username} dans son [Dossier Classé](${thread.url}).`
                    });
                } else {
                    console.log(`[DEBUG COMMAND] Échec de l'ajout de note dans EspionageManager.`);
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