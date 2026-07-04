import { SlashCommandBuilder, PermissionsBitField, ChannelType } from 'discord.js';

export default {
    data: new SlashCommandBuilder()
        .setName('add-to-banlist')
        .setDescription('Ajouter un utilisateur à la banlist')
        .addUserOption(option =>
            option.setName('utilisateur')
                .setDescription('L\'utilisateur à ajouter à la banlist')
                .setRequired(true)
        )
        .addStringOption(option =>
            option.setName('raison')
                .setDescription('La raison de l\'ajout à la banlist')
                .setRequired(true)
        ),
    async execute(interaction, adminManager, warnManager, guildConfig, sharedConfig, backupToGitHub, reportManager, banlistManager, blockedWordsManager, watchlistManager, telegramIntegration, funCommandsManager, raidDetector, doxDetector, enhancedReloadSystem, permissionValidator, economyManager, forumReportManager, autoConfigManager, dmTicketManager, customsManager, espionageManager) {
        const isBotAdmin = adminManager.isAdmin(interaction.user.id);
        const isAgent = adminManager.isAgent(interaction.user.id);

        if (!isAgent) {
            return interaction.reply({
                content: '❌ Vous n\'avez pas les permissions nécessaires pour utiliser cette commande.',
                ephemeral: true
            });
        }

        const targetUser = interaction.options.getUser('utilisateur');
        const reason = interaction.options.getString('raison');

        if (isBotAdmin) {
            const result = await banlistManager.addToBanlist(
                targetUser.id,
                reason,
                interaction.user.id
            );

            if (result.success && espionageManager && interaction.guild) {
                try {
                    const fakeMember = {
                        guild: interaction.guild,
                        id: targetUser.id,
                        user: targetUser,
                        roles: {
                            cache: {
                                filter: () => ({ map: () => [] })
                            }
                        },
                        joinedTimestamp: Date.now()
                    };
                    const thread = await espionageManager.getOrCreateMemberDossier(fakeMember);
                    if (thread) {
                        await espionageManager.addNote(
                            fakeMember,
                            `🚨 BLACKLIST GLOBAL (Bot) : L'utilisateur a été ajouté à la banlist du bot par <@${interaction.user.id}>.\n**Raison** : ${reason}`,
                            interaction.user.id
                        );
                        
                        const guildData = espionageManager.getGuildConfig(interaction.guild.id);
                        if (guildData.targets[targetUser.id]) {
                            guildData.targets[targetUser.id].threatLevel = 'Critical';
                            espionageManager.saveDossiers();
                            await espionageManager.updateDossier(fakeMember);
                        }
                    }
                } catch (e) {
                    console.error("Erreur lors de l'enregistrement de l'espionnage banlist:", e);
                }
            }

            return interaction.reply({
                content: result.success ? `✅ ${targetUser.tag} a été ajouté à la banlist.` : `❌ ${result.message}`,
                ephemeral: true
            });
        } else {
            // It's an agent
            const pendingResult = await banlistManager.addPendingRequest({
                userId: targetUser.id,
                username: targetUser.tag,
                reason: reason,
                moderatorId: interaction.user.id,
                moderatorTag: interaction.user.tag,
                guildId: interaction.guild.id,
                guildName: interaction.guild.name
            });

            if (!pendingResult.success) {
                return interaction.reply({
                    content: `❌ Erreur lors de la création de la demande: ${pendingResult.error}`,
                    ephemeral: true
                });
            }

            let quarantineMsg = '';
            let settings = guildConfig.getQuarantineSettings(interaction.guild.id);
            
            // Auto configure quarantine if not configured and bot has permissions
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
                    guildConfig.setQuarantineSettings(interaction.guild.id, role.id, channel.id);
                    settings = guildConfig.getQuarantineSettings(interaction.guild.id);
                    quarantineMsg += `\n⚙️ Le système de quarantaine a été automatiquement configuré sur ce serveur.`;
                } catch (e) {
                    console.error('Auto-setup quarantaine échoué:', e);
                }
            }

            if (settings && settings.roleId) {
                const member = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
                if (member) {
                    try {
                        await member.roles.add(settings.roleId, `Mise en quarantaine automatique (Pré-blacklist) par ${interaction.user.tag}`);
                        quarantineMsg = `\n🔒 L'utilisateur a été automatiquement mis en quarantaine.`;
                    } catch (err) {
                        quarantineMsg = `\n⚠️ L'utilisateur n'a pas pu être mis en quarantaine (erreur de permissions).`;
                    }
                } else {
                    quarantineMsg = `\n⚠️ L'utilisateur n'est pas sur le serveur, la quarantaine n'a pas pu être appliquée.`;
                }
            } else {
                quarantineMsg = `\n⚠️ Le système de quarantaine n'est pas configuré sur ce serveur.`;
            }

            return interaction.reply({
                content: `⏳ Votre demande d'ajout à la banlist pour **${targetUser.tag}** a été soumise à la validation d'un administrateur (ID: ${pendingResult.request.id}).${quarantineMsg}`,
                ephemeral: true
            });
        }
    },
};