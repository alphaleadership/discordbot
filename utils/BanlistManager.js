import fs from 'fs';
import path from 'path';

export class BanlistManager {
    constructor() {
        this.pendingFilePath = path.join(process.cwd(), 'data/ban_pending.json');
        this.pendingRequests = [];
        this.loadPendingRequests();
        
        this.whitelistFilePath = path.join(process.cwd(), 'data/ban_whitelist.json');
        this.whitelist = {};
        this.loadWhitelist();
    }

    /**
     * Vérifie si une raison est vide ou équivalente à un placeholder générique
     * @param {string} reason - Raison à vérifier
     * @returns {boolean} True si vide ou placeholder
     */
    isReasonEmptyOrPlaceholder(reason) {
        if (!reason || typeof reason !== 'string') return true;
        const trimmed = reason.trim().toLowerCase();
        if (trimmed.length === 0) return true;
        
        const placeholders = [
            'raison non spécifiée',
            'raison non specifiee',
            'aucune raison',
            'aucune raison spécifiée',
            'aucune raison specifiee',
            'aucun',
            'aucune',
            'none',
            'no reason',
            'n/a',
            'na',
            'null',
            'undefined',
            'non spécifiée',
            'non specifiee',
            'non spécifié',
            'non specifie',
            'sans raison',
            'pas de raison'
        ];
        
        return placeholders.includes(trimmed);
    }

    /**
     * Loads whitelist from file
     */
    loadWhitelist() {
        try {
            if (fs.existsSync(this.whitelistFilePath)) {
                const data = fs.readFileSync(this.whitelistFilePath, 'utf-8');
                this.whitelist = JSON.parse(data);
                if (Array.isArray(this.whitelist)) {
                    this.whitelist = {};
                }
            } else {
                this.whitelist = {};
            }
        } catch (error) {
            console.error('Error loading whitelist:', error);
            this.whitelist = {};
        }
    }

    /**
     * Saves whitelist to file
     */
    saveWhitelist() {
        try {
            const dir = path.dirname(this.whitelistFilePath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            fs.writeFileSync(this.whitelistFilePath, JSON.stringify(this.whitelist, null, 2), 'utf-8');
            return true;
        } catch (error) {
            console.error('Error saving whitelist:', error);
            return false;
        }
    }

    /**
     * Adds a user to the whitelist of a server
     * @param {string} userId - User ID
     * @param {string} guildId - Guild ID
     * @returns {boolean} Success
     */
    addToWhitelist(userId, guildId) {
        if (!guildId) return false;
        if (!this.whitelist[guildId]) {
            this.whitelist[guildId] = [];
        }
        if (!this.whitelist[guildId].includes(userId)) {
            this.whitelist[guildId].push(userId);
            this.saveWhitelist();
            return true;
        }
        return false;
    }

    /**
     * Removes a user from the whitelist of a server
     * @param {string} userId - User ID
     * @param {string} guildId - Guild ID
     * @returns {boolean} Success
     */
    removeFromWhitelist(userId, guildId) {
        if (!guildId || !this.whitelist[guildId]) return false;
        const index = this.whitelist[guildId].indexOf(userId);
        if (index !== -1) {
            this.whitelist[guildId].splice(index, 1);
            if (this.whitelist[guildId].length === 0) {
                delete this.whitelist[guildId];
            }
            this.saveWhitelist();
            return true;
        }
        return false;
    }

    /**
     * Checks if a user is whitelisted on a server
     * @param {string} userId - User ID
     * @param {string} guildId - Guild ID
     * @returns {boolean} Whether user is whitelisted
     */
    isWhitelisted(userId, guildId) {
        if (!guildId || !this.whitelist[guildId]) return false;
        return this.whitelist[guildId].includes(userId);
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
            if (!requestData || this.isReasonEmptyOrPlaceholder(requestData.reason)) {
                return {
                    success: false,
                    error: 'Une raison explicite et non vide est obligatoire pour soumettre une demande.'
                };
            }

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
            
            const requestType = request.type || 'add';
            
            if (requestType === 'remove') {
                // Execute unban on server if we have guild
                if (guild) {
                    try {
                        await guild.members.unban(request.userId, `${request.reason} (Validé par ${adminId})`);
                    } catch (unbanError) {
                        console.error('Error executing unban during approval:', unbanError);
                    }
                }
                
                // Remove from banlist file
                const result = await this.removeFromBanlist(request.userId);
                
                if (result.success) {
                    request.status = 'approved';
                    request.resolvedBy = adminId;
                    request.resolvedAt = new Date().toISOString();
                    this.savePendingRequests();
                    return { success: true };
                } else {
                    return { success: false, error: result.message };
                }
            } else {
                // Execute ban on server if user is in server or if we have guild
                if (guild) {
                    try {
                        await guild.members.ban(request.userId, { reason: `${request.reason} (Validé par ${adminId})` });
                    } catch (banError) {
                        console.error('Error executing ban during approval:', banError);
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
     * Purge toutes les entrées de la banlist qui n'ont pas de raison valide ou ont un placeholder
     * @returns {Promise<{checked: number, removed: number, purgedUsers: Array<{userId: string, line: string, reason: string}>}>}
     */
    async purgeEntriesWithoutReason() {
        console.log('Démarrage de la purge des entrées sans raison de la banlist...');
        const results = { checked: 0, removed: 0, purgedUsers: [] };
        
        try {
            if (!fs.existsSync('banlist.txt')) {
                return results;
            }
            
            const fileContent = fs.readFileSync('banlist.txt', 'utf-8');
            const lines = fileContent.split('\n').filter(line => line.trim() !== '');
            const validLines = [];
            
            for (const line of lines) {
                results.checked++;
                const idMatch = line.match(/^(\d+)/);
                const userId = idMatch ? idMatch[1] : 'Inconnu';
                
                let reason = '';
                const separatorIndex = line.indexOf(' - ');
                if (separatorIndex !== -1) {
                    const afterDash = line.slice(separatorIndex + 3);
                    const metaIndex = afterDash.search(/\s*\|\s*(?:Ajouté par:|$)/i);
                    reason = (metaIndex !== -1 ? afterDash.slice(0, metaIndex) : afterDash).trim();
                }
                
                if (!idMatch || this.isReasonEmptyOrPlaceholder(reason)) {
                    results.removed++;
                    results.purgedUsers.push({
                        userId,
                        line,
                        reason: reason || 'Aucune raison spécifiée'
                    });
                } else {
                    validLines.push(line);
                }
            }
            
            if (results.removed > 0) {
                fs.writeFileSync('banlist.txt', validLines.join('\n') + (validLines.length > 0 ? '\n' : ''), 'utf-8');
                console.log(`[BanlistManager] Purge terminée : ${results.removed} entrée(s) sans raison retirée(s).`);
            }
            
            return results;
        } catch (error) {
            console.error('Erreur lors de la purge des entrées sans raison de la banlist:', error);
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
            if (!userId) {
                return {
                    success: false,
                    message: 'ID utilisateur manquant.'
                };
            }

            if (this.isReasonEmptyOrPlaceholder(reason)) {
                return {
                    success: false,
                    message: 'Une raison explicite et non vide est requise pour ajouter un utilisateur à la banlist.'
                };
            }

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
            const newEntry = `${userId} - ${reason.trim()} | Ajouté par: ${authorId} | Le: ${timestamp}\n`;
            
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
     * Ajoute plusieurs utilisateurs à la liste de bannissement
     * @param {string[]} userIds - Tableau d'IDs d'utilisateurs
     * @param {string} reason - La raison du bannissement
     * @param {string} authorId - L'ID de l'auteur
     * @returns {Promise<{success: boolean, message: string, added: number, errors: number}>}
     */
    async addManyToBanlist(userIds, reason, authorId) {
        try {
            if (this.isReasonEmptyOrPlaceholder(reason)) {
                return {
                    success: false,
                    message: "Une raison explicite et non vide est requise pour l'importation en masse.",
                    added: 0,
                    errors: userIds.length
                };
            }

            let addedCount = 0;
            let errorCount = 0;
            
            for (const userId of userIds) {
                const result = await this.addToBanlist(userId, reason, authorId);
                if (result.success) {
                    addedCount++;
                } else {
                    errorCount++;
                }
            }
            
            return {
                success: addedCount > 0 || userIds.length === 0,
                message: `Import terminé: ${addedCount} ajoutés, ${errorCount} erreurs/déjà existants sur ${userIds.length} IDs.`,
                added: addedCount,
                errors: errorCount
            };
        } catch (error) {
            console.error('Erreur lors de l\'ajout multiple à la banlist:', error);
            return {
                success: false,
                message: 'Une erreur est survenue lors de l\'importation en masse.',
                added: 0,
                errors: userIds.length
            };
        }
    }

    /**
     * Vérifie si un utilisateur est dans la liste de bannissement
     * @param {string} userId - L'ID de l'utilisateur à vérifier
     * @returns {Promise<{banned: boolean, reason: string}>}
     */
    async isBanned(userId, guildId = null) {
        try {
            // Si l'utilisateur est sur la liste blanche (whitelist), on ne le considère pas comme banni
            if (guildId && this.isWhitelisted(userId, guildId)) {
                return { banned: false, reason: 'Utilisateur sur la liste blanche (whitelist)' };
            }

            if (!fs.existsSync('banlist.txt')) {
                return { banned: false, reason: '' };
            }
            
            const fileContent = fs.readFileSync('banlist.txt', 'utf-8');
            const lines = fileContent.split('\n').filter(line => line.trim() !== '');
            
            const banEntry = lines.find(line => line.startsWith(`${userId} -`));
            if (banEntry) {
                // Extraire la raison du bannissement (tout ce qui suit ' - ' et précède ' | ')
                const reasonMatch = banEntry.match(/ - (.*?)( \| Ajouté par:|$)/);
                const reason = reasonMatch ? reasonMatch[1].trim() : '';
                
                // Si la raison est vide ou placeholder, l'entrée est considérée invalide
                if (this.isReasonEmptyOrPlaceholder(reason)) {
                    return { banned: false, reason: '' };
                }

                return { banned: true, reason };
            }
            
            return { banned: false, reason: '' };
        } catch (error) {
            console.error('Erreur lors de la vérification de la banlist:', error);
            // En cas d'erreur, on considère que l'utilisateur n'est pas banni pour éviter les faux positifs
            return { banned: false, reason: '' };
        }
    }

    /**
     * Retire un utilisateur de la liste de bannissement
     * @param {string} userId - L'ID de l'utilisateur à retirer
     * @returns {Promise<{success: boolean, message: string}>}
     */
    async removeFromBanlist(userId) {
        try {
            if (!fs.existsSync('banlist.txt')) {
                return {
                    success: false,
                    message: "La liste de bannissement est vide."
                };
            }
            
            const fileContent = fs.readFileSync('banlist.txt', 'utf-8');
            const lines = fileContent.split('\n').filter(line => line.trim() !== '');
            
            const index = lines.findIndex(line => line.startsWith(`${userId} -`));
            if (index === -1) {
                return {
                    success: false,
                    message: `L'utilisateur avec l'ID ${userId} n'est pas dans la liste de bannissement.`
                };
            }
            
            lines.splice(index, 1);
            fs.writeFileSync('banlist.txt', lines.join('\n') + (lines.length > 0 ? '\n' : ''), 'utf-8');
            
            return {
                success: true,
                message: `L'utilisateur avec l'ID ${userId} a été retiré de la liste de bannissement.`
            };
        } catch (error) {
            console.error('Erreur lors du retrait de la banlist:', error);
            return {
                success: false,
                message: 'Une erreur est survenue lors du retrait de la liste de bannissement.'
            };
        }
    }

    reload() {
        this.loadWhitelist();
        console.log('BanlistManager rechargé.');
    }
}
