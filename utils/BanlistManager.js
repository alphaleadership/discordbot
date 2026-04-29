import fs from 'fs';
import path from 'path';

export class BanlistManager {
    constructor() {
        this.pendingFilePath = path.join(process.cwd(), 'data/ban_pending.json');
        this.pendingRequests = [];
        this.loadPendingRequests();
    }

    /**
     * Loads pending requests from file
     */
    loadPendingRequests() {
        try {
            if (fs.existsSync(this.pendingFilePath)) {
                const data = fs.readFileSync(this.pendingFilePath, 'utf-8');
                this.pendingRequests = JSON.parse(data);
            } else {
                this.pendingRequests = [];
            }
        } catch (error) {
            console.error('Error loading pending requests:', error);
            this.pendingRequests = [];
        }
    }

    /**
     * Saves pending requests to file
     */
    savePendingRequests() {
        try {
            const dir = path.dirname(this.pendingFilePath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            fs.writeFileSync(this.pendingFilePath, JSON.stringify(this.pendingRequests, null, 2), 'utf-8');
            return true;
        } catch (error) {
            console.error('Error saving pending requests:', error);
            return false;
        }
    }

    /**
     * Adds a pending ban request
     * @param {Object} requestData - The request data
     * @returns {Object} Result
     */
    async addPendingRequest(requestData) {
        try {
            const requestId = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
            const request = {
                id: requestId,
                ...requestData,
                timestamp: new Date().toISOString(),
                status: 'pending'
            };
            
            this.pendingRequests.push(request);
            this.savePendingRequests();
            
            return { success: true, request };
        } catch (error) {
            console.error('Error adding pending request:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Gets all pending requests
     * @returns {Array} Pending requests
     */
    getPendingRequests() {
        return this.pendingRequests.filter(r => r.status === 'pending');
    }

    /**
     * Approves a pending request
     * @param {string} requestId - The request ID
     * @param {string} adminId - The admin ID who approved
     * @param {import('discord.js').Guild} guild - The guild where to ban
     * @returns {Promise<Object>} Result
     */
    async approveRequest(requestId, adminId, guild) {
        try {
            const index = this.pendingRequests.findIndex(r => r.id === requestId);
            if (index === -1) return { success: false, error: 'Demande non trouvée' };
            
            const request = this.pendingRequests[index];
            if (request.status !== 'pending') return { success: false, error: 'La demande n\'est plus en attente' };
            
            // Execute ban on server if user is in server or if we have guild
            if (guild) {
                try {
                    await guild.members.ban(request.userId, { reason: `${request.reason} (Validé par ${adminId})` });
                } catch (banError) {
                    console.error('Error executing ban during approval:', banError);
                    // We continue to add to banlist even if server ban fails (might not be in server)
                }
            }
            
            // Add to banlist file
            const result = await this.addToBanlist(
                request.userId,
                request.reason,
                request.moderatorId
            );
            
            if (result.success) {
                request.status = 'approved';
                request.resolvedBy = adminId;
                request.resolvedAt = new Date().toISOString();
                this.savePendingRequests();
                return { success: true };
            } else {
                return { success: false, error: result.message };
            }
        } catch (error) {
            console.error('Error approving request:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Rejects a pending request
     * @param {string} requestId - The request ID
     * @param {string} adminId - The admin ID who rejected
     * @returns {Object} Result
     */
    async rejectRequest(requestId, adminId) {
        try {
            const index = this.pendingRequests.findIndex(r => r.id === requestId);
            if (index === -1) return { success: false, error: 'Demande non trouvée' };
            
            const request = this.pendingRequests[index];
            request.status = 'rejected';
            request.resolvedBy = adminId;
            request.resolvedAt = new Date().toISOString();
            
            this.savePendingRequests();
            return { success: true };
        } catch (error) {
            console.error('Error rejecting request:', error);
            return { success: false, error: error.message };
        }
    }

    /**
     * Cleans up entries for users who no longer exist on Discord
     * @param {import('discord.js').Client} client - The Discord client
     * @returns {Promise<Object>} Results of the cleanup
     */
    async cleanupDeletedUsers(client) {
        console.log('Starting cleanup of deleted users from banlist...');
        const results = { checked: 0, removed: 0, errors: 0 };
        
        try {
            if (!fs.existsSync('banlist.txt')) {
                return { checked: 0, removed: 0, errors: 0 };
            }
            
            const fileContent = fs.readFileSync('banlist.txt', 'utf-8');
            const lines = fileContent.split('\n').filter(line => line.trim() !== '');
            const newLines = [];
            
            for (const line of lines) {
                const userIdMatch = line.match(/^(\d+)/);
                if (!userIdMatch) {
                    newLines.push(line);
                    continue;
                }
                
                const userId = userIdMatch[1];
                results.checked++;
                
                try {
                    await client.users.fetch(userId);
                    newLines.push(line);
                } catch (error) {
                    if (error.code === 10013 || error.message.includes('Unknown User')) {
                        console.log(`User ${userId} no longer exists on Discord. Removing from banlist.`);
                        results.removed++;
                    } else {
                        newLines.push(line);
                        results.errors++;
                    }
                }
                
                // Delay to avoid rate limits
                if (results.checked % 10 === 0) {
                    await new Promise(resolve => setTimeout(resolve, 200));
                }
            }
            
            if (results.removed > 0) {
                fs.writeFileSync('banlist.txt', newLines.join('\n') + '\n', 'utf-8');
            }
            
            console.log(`Banlist cleanup finished: ${results.removed} users removed.`);
            return results;
        } catch (error) {
            console.error('Error during banlist cleanup:', error);
            return { ...results, error: error.message };
        }
    }

    /**
     * Ajoute un utilisateur à la liste de bannissement
     * @param {string} userId - L'ID de l'utilisateur à bannir
     * @param {string} reason - La raison du bannissement
     * @param {string} authorId - L'ID de l'auteur de la commande
     * @returns {Promise<{success: boolean, message: string}>}
     */
    async addToBanlist(userId, reason, authorId) {
        try {
            if (!fs.existsSync('banlist.txt')) {
                fs.writeFileSync('banlist.txt', '', 'utf-8');
            }
            
            const fileContent = fs.readFileSync('banlist.txt', 'utf-8');
            const lines = fileContent.split('\n').filter(line => line.trim() !== '');
            
            const existingEntry = lines.find(line => line.startsWith(`${userId} -`));
            if (existingEntry) {
                return {
                    success: false,
                    message: `L'utilisateur avec l'ID ${userId} est déjà dans la liste de bannissement.`
                };
            }
            
            const timestamp = new Date().toISOString();
            const newEntry = `${userId} - ${reason} | Ajouté par: ${authorId} | Le: ${timestamp}\n`;
            
            fs.appendFileSync('banlist.txt', newEntry, 'utf-8');
            
            return {
                success: true,
                message: `L'utilisateur avec l'ID ${userId} a été ajouté à la liste de bannissement.`
            };
        } catch (error) {
            console.error('Erreur lors de l\'ajout à la banlist:', error);
            return {
                success: false,
                message: 'Une erreur est survenue lors de l\'ajout à la liste de bannissement.'
            };
        }
    }

    /**
     * Vérifie si un utilisateur est dans la liste de bannissement
     * @param {string} userId - L'ID de l'utilisateur à vérifier
     * @returns {Promise<{banned: boolean, reason: string}>}
     */
    async isBanned(userId) {
        try {
            if (!fs.existsSync('banlist.txt')) {
                return { banned: false, reason: '' };
            }
            
            const fileContent = fs.readFileSync('banlist.txt', 'utf-8');
            const lines = fileContent.split('\n').filter(line => line.trim() !== '');
            
            const banEntry = lines.find(line => line.startsWith(`${userId} -`));
            if (banEntry) {
                // Extraire la raison du bannissement (tout ce qui suit ' - ' et précède ' | ')
                const reasonMatch = banEntry.match(/ - (.*?)( \| Ajouté par:|$)/);
                const reason = reasonMatch ? reasonMatch[1] : 'Raison non spécifiée';
                return { banned: true, reason };
            }
            
            return { banned: false, reason: '' };
        } catch (error) {
            console.error('Erreur lors de la vérification de la banlist:', error);
            // En cas d'erreur, on considère que l'utilisateur n'est pas banni pour éviter les faux positifs
            return { banned: false, reason: '' };
        }
    }

    reload() {
        // BanlistManager n'a pas de fichier de configuration à recharger
        console.log('BanlistManager rechargé (pas de fichier de configuration).');
    }
}
