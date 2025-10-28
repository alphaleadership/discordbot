import { SlashCommandBuilder, EmbedBuilder, ChannelType } from 'discord.js';

export default {
    data: new SlashCommandBuilder()
        .setName('help-forum-setup')
        .setDescription('Guide pour configurer le système de rapports par forum'),
    
    async execute(interaction) {
        try {
            const embed = new EmbedBuilder()
                .setColor('#3498db')
                .setTitle('📋 Guide de Configuration du Forum de Rapports')
                .setDescription('**Voici comment configurer correctement le système de rapports par forum :**')
                .addFields(
                    {
                        name: '1️⃣ Prérequis',
                        value: [
                            '• Vous devez être **administrateur** du bot',
                            '• Avoir un **serveur de support** dédié',
                            '• **Créer un salon forum** dans ce serveur',
                            '• Le bot doit être présent dans le serveur de support'
                        ].join('\n'),
                        inline: false
                    },
                    {
                        name: '2️⃣ Créer un Salon Forum',
                        value: [
                            '• Allez dans votre serveur de support',
                            '• Clic droit sur une catégorie → **Créer un salon**',
                            '• Sélectionnez **"Forum"** comme type de salon',
                            '• Nommez-le (ex: "rapports-moderation")',
                            '• Configurez les permissions appropriées'
                        ].join('\n'),
                        inline: false
                    },
                    {
                        name: '3️⃣ Utiliser la Commande',
                        value: [
                            '```',
                            '/setup-reports-forum',
                            '  support-server-id: [ID_DU_SERVEUR]',
                            '  forum-channel: #nom-du-salon-forum',
                            '```',
                            '**⚠️ IMPORTANT:** Vous DEVEZ spécifier le salon forum exact où les rapports seront créés.'
                        ].join('\n'),
                        inline: false
                    },
                    {
                        name: '4️⃣ Permissions Requises',
                        value: [
                            'Le bot doit avoir ces permissions dans le salon forum :',
                            '• `Voir le salon`',
                            '• `Envoyer des messages`',
                            '• `Créer des posts publics`',
                            '• `Gérer les posts`',
                            '• `Intégrer des liens`'
                        ].join('\n'),
                        inline: false
                    },
                    {
                        name: '5️⃣ Exemple Complet',
                        value: [
                            '```',
                            '/setup-reports-forum',
                            '  support-server-id: 123456789012345678',
                            '  forum-channel: #rapports-moderation',
                            '```',
                            'Ceci configurera le salon forum #rapports-moderation comme destination pour tous les rapports.'
                        ].join('\n'),
                        inline: false
                    },
                    {
                        name: '❓ Problèmes Courants',
                        value: [
                            '• **"Le salon doit être un salon forum"** → Créez un salon de type Forum',
                            '• **"Permissions manquantes"** → Donnez les permissions au bot',
                            '• **"Serveur introuvable"** → Vérifiez l\'ID du serveur',
                            '• **"Salon pas dans le bon serveur"** → Le salon forum doit être dans le serveur de support'
                        ].join('\n'),
                        inline: false
                    }
                )
                .setFooter({ 
                    text: 'Une fois configuré, tous les rapports de tous vos serveurs seront centralisés dans le salon forum spécifié' 
                })
                .setTimestamp();

            const embed2 = new EmbedBuilder()
                .setColor('#e74c3c')
                .setTitle('⚠️ Points Importants à Retenir')
                .addFields(
                    {
                        name: '🎯 Salon Forum Obligatoire',
                        value: 'Vous **DEVEZ** spécifier un salon forum. Ce n\'est pas optionnel. Le salon forum est l\'endroit exact où tous les rapports seront créés sous forme de posts.',
                        inline: false
                    },
                    {
                        name: '🏠 Un Seul Serveur de Support',
                        value: 'Tous les rapports de tous vos serveurs Discord seront centralisés dans le salon forum que vous spécifiez. Choisissez bien votre serveur de support.',
                        inline: false
                    },
                    {
                        name: '🔒 Sécurité',
                        value: 'Assurez-vous que seuls les modérateurs ont accès au salon forum pour maintenir la confidentialité des rapports.',
                        inline: false
                    },
                    {
                        name: '📊 Organisation',
                        value: 'Chaque rapport deviendra un post séparé dans le forum, permettant une organisation claire et un suivi individuel.',
                        inline: false
                    }
                )
                .setFooter({ 
                    text: 'Besoin d\'aide ? Contactez un administrateur du bot' 
                });

            await interaction.reply({ 
                embeds: [embed, embed2], 
                ephemeral: true 
            });

        } catch (error) {
            console.error('Error in help-forum-setup command:', error);
            await interaction.reply({
                content: '❌ Une erreur est survenue lors de l\'affichage de l\'aide.',
                ephemeral: true
            });
        }
    },
};