import { ActionRowBuilder, ButtonBuilder, ButtonStyle } from 'discord.js';
import { InteractionConfig } from './InteractionConfig.js';
import fs from 'fs';

export class InteractionHandler {
    // ID du canal de rapport
    REPORT_CHANNEL_ID = '1406985746430296084';
    constructor(adminManager) {
        this.adminManager = adminManager;
    }

    

    async handleInteraction(interaction) {
        try {
            // Gestion des boutons
            if (interaction.isButton()) {
                return await this.handleButtonInteraction(interaction);
            }
        } catch (error) {
            console.error('Erreur dans handleInteraction:', error);
            
            // Vérifier si on peut encore répondre à l'interaction
            if (!interaction.replied && !interaction.deferred) {
                return interaction.reply({ 
                    content: '❌ Une erreur est survenue lors du traitement de votre commande.',
                    ephemeral: true 
                }).catch(console.error);
            } else if (interaction.deferred && !interaction.replied) {
                return interaction.editReply({ 
                    content: '❌ Une erreur est survenue lors du traitement de votre commande.'
                }).catch(console.error);
            }
        }
    }

    async handleButtonInteraction(interaction) {
        try {
            // Mettre à jour l'interaction pour éviter l'erreur "Unknown interaction"
            if (interaction.deferred) {
                await interaction.editReply({ content: '⏳ Traitement en cours...' }).catch(console.error);
            } else {
                await interaction.deferUpdate().catch(console.error);
            }
            
            // Vérifier si c'est une action de révocation d'admin
            if (interaction.customId.startsWith('revoke_admin_')) {
                return await this.handleRevokeAdmin(interaction);
            }
            
            // Gestion du bouton d'annulation
            if (interaction.customId === 'cancel_revoke') {
                return interaction.editReply({
                    content: '❌ Opération annulée.',
                    components: []
                }).catch(console.error);
            }
        } catch (error) {
            console.error('Erreur dans handleButtonInteraction:', error);
            
            // Essayer d'envoyer un message d'erreur si possible
            if (!interaction.replied && !interaction.deferred) {
                return interaction.reply({ 
                    content: '❌ Une erreur est survenue lors du traitement de votre action.',
                    ephemeral: true 
                }).catch(console.error);
            } else if (interaction.deferred && !interaction.replied) {
                return interaction.editReply({ 
                    content: '❌ Une erreur est survenue lors du traitement de votre action.'
                }).catch(console.error);
            }
        }
    }

    async handleRevokeAdmin(interaction) {
        try {
            // Vérifier si l'utilisateur est admin
            const isAdmin = this.adminManager.isAdmin(interaction.user.id);
            if (!isAdmin) {
                return interaction.editReply({
                    content: '❌ Seuls les administrateurs peuvent effectuer cette action.',
                    components: []
                }).catch(console.error);
            }

            const targetUserId = interaction.customId.replace('revoke_admin_', '');
            
            // Vérifier que l'ID n'est pas vide
            if (!targetUserId) {
                return interaction.editReply({
                    content: '❌ ID utilisateur invalide.',
                    components: []
                }).catch(console.error);
            }
            
            // Récupérer les informations de l'utilisateur
            let targetUser;
            try {
                targetUser = await interaction.client.users.fetch(targetUserId);
            } catch (error) {
                console.error('Erreur lors de la récupération des informations utilisateur:', error);
                return interaction.editReply({
                    content: '❌ Impossible de récupérer les informations de l\'utilisateur.',
                    components: []
                }).catch(console.error);
            }
            
            // Vérifier si l'utilisateur existe
            if (!targetUser) {
                return interaction.editReply({
                    content: '❌ Utilisateur introuvable.',
                    components: []
                }).catch(console.error);
            }

            // Retirer les droits d'admin
            const success = this.adminManager.removeAdmin(targetUserId);
            
            if (!success) {
                return interaction.editReply({
                    content: '❌ Une erreur est survenue lors de la révocation des droits administrateur.',
                    components: []
                }).catch(console.error);
            }
            
            // Sauvegarder dans le fichier texte
            this.adminManager.saveToTextFile();
            
            return interaction.editReply({
                content: `✅ Les droits d'administrateur de ${targetUser.tag} ont été révoqués.`,
                components: []
            }).catch(console.error);
            
        } catch (error) {
            console.error('Erreur dans handleRevokeAdmin:', error);
            
            // Essayer d'envoyer un message d'erreur
            if (interaction.deferred || interaction.replied) {
                return interaction.editReply({
                    content: '❌ Une erreur est survenue lors de la révocation des droits administrateur.',
                    components: []
                }).catch(console.error);
            } else {
                return interaction.reply({
                    content: '❌ Une erreur est survenue lors de la révocation des droits administrateur.',
                    ephemeral: true
                }).catch(console.error);
            }
        }
    }

    
}
