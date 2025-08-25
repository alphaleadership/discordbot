import { PermissionsBitField } from 'discord.js';

/**
 * Utility class for validating permissions in moderation commands
 * Respects Discord role hierarchy and provides bot admin override functionality
 */
export default class PermissionValidator {
    constructor(adminManager) {
        this.adminManager = adminManager;
    }

    /**
     * Validates if a moderator can perform a moderation action on a target user
     * @param {GuildMember} moderator - The user attempting the action
     * @param {GuildMember|User} target - The target user
     * @param {bigint} requiredPermission - The Discord permission required
     * @param {Object} options - Additional validation options
     * @returns {Object} Validation result with success status and error message
     */
    validateModerationAction(moderator, target, requiredPermission, options = {}) {
        try {
            // Check if moderator is bot admin (override all other checks)
            if (this.adminManager.isAdmin(moderator.id)) {
                return { success: true, reason: 'bot_admin_override' };
            }

            // Prevent self-moderation
            if (moderator.id === target.id) {
                return { 
                    success: false, 
                    error: 'self_moderation_denied',
                    message: '❌ Vous ne pouvez pas effectuer cette action sur vous-même.'
                };
            }

            // Check if target is a bot admin
            if (this.adminManager.isAdmin(target.id)) {
                return { 
                    success: false, 
                    error: 'target_is_bot_admin',
                    message: '❌ Vous ne pouvez pas effectuer cette action sur un administrateur du bot.'
                };
            }

            // Check if moderator has required Discord permission
            if (!moderator.permissions.has(requiredPermission)) {
                return { 
                    success: false, 
                    error: 'insufficient_permissions',
                    message: '❌ Vous n\'avez pas les permissions nécessaires pour effectuer cette action.'
                };
            }

            // Check role hierarchy (only if target is a GuildMember)
            if (target.roles && moderator.roles) {
                if (target.roles.highest.position >= moderator.roles.highest.position) {
                    return { 
                        success: false, 
                        error: 'role_hierarchy_violation',
                        message: '❌ Vous ne pouvez pas effectuer cette action sur un utilisateur ayant un rôle égal ou supérieur au vôtre.'
                    };
                }
            }

            // Check if target is a bot (optional check)
            if (options.preventBotActions && target.bot) {
                return { 
                    success: false, 
                    error: 'target_is_bot',
                    message: '❌ Vous ne pouvez pas effectuer cette action sur un bot.'
                };
            }

            // Check if target is the guild owner (optional check)
            if (options.preventOwnerActions && target.id === moderator.guild.ownerId) {
                return { 
                    success: false, 
                    error: 'target_is_owner',
                    message: '❌ Vous ne pouvez pas effectuer cette action sur le propriétaire du serveur.'
                };
            }

            return { success: true, reason: 'permission_granted' };

        } catch (error) {
            console.error('Error in permission validation:', error);
            return { 
                success: false, 
                error: 'validation_error',
                message: '❌ Une erreur est survenue lors de la validation des permissions.'
            };
        }
    }

    /**
     * Validates kick permissions
     * @param {GuildMember} moderator - The moderator
     * @param {GuildMember} target - The target user
     * @returns {Object} Validation result
     */
    validateKickPermission(moderator, target) {
        return this.validateModerationAction(
            moderator, 
            target, 
            PermissionsBitField.Flags.KickMembers,
            { preventBotActions: true }
        );
    }

    /**
     * Validates ban permissions
     * @param {GuildMember} moderator - The moderator
     * @param {GuildMember|User} target - The target user
     * @returns {Object} Validation result
     */
    validateBanPermission(moderator, target) {
        return this.validateModerationAction(
            moderator, 
            target, 
            PermissionsBitField.Flags.BanMembers,
            { preventBotActions: true, preventOwnerActions: true }
        );
    }

    /**
     * Validates timeout permissions
     * @param {GuildMember} moderator - The moderator
     * @param {GuildMember} target - The target user
     * @returns {Object} Validation result
     */
    validateTimeoutPermission(moderator, target) {
        return this.validateModerationAction(
            moderator, 
            target, 
            PermissionsBitField.Flags.ModerateMembers,
            { preventBotActions: true }
        );
    }

    /**
     * Validates message management permissions
     * @param {GuildMember} moderator - The moderator
     * @returns {Object} Validation result
     */
    validateMessageManagementPermission(moderator) {
        try {
            // Check if moderator is bot admin (override)
            if (this.adminManager.isAdmin(moderator.id)) {
                return { success: true, reason: 'bot_admin_override' };
            }

            // Check if moderator has required Discord permission
            if (!moderator.permissions.has(PermissionsBitField.Flags.ManageMessages)) {
                return { 
                    success: false, 
                    error: 'insufficient_permissions',
                    message: '❌ Vous devez avoir la permission de gérer les messages pour utiliser cette commande.'
                };
            }

            return { success: true, reason: 'permission_granted' };

        } catch (error) {
            console.error('Error in message management permission validation:', error);
            return { 
                success: false, 
                error: 'validation_error',
                message: '❌ Une erreur est survenue lors de la validation des permissions.'
            };
        }
    }

    /**
     * Validates watchlist management permissions
     * @param {GuildMember} moderator - The moderator
     * @returns {Object} Validation result
     */
    validateWatchlistPermission(moderator) {
        try {
            // Check if moderator is bot admin (override)
            if (this.adminManager.isAdmin(moderator.id)) {
                return { success: true, reason: 'bot_admin_override' };
            }

            // Check if moderator has any moderation permission
            const moderationPermissions = [
                PermissionsBitField.Flags.KickMembers,
                PermissionsBitField.Flags.BanMembers,
                PermissionsBitField.Flags.ModerateMembers,
                PermissionsBitField.Flags.ManageMessages
            ];

            const hasAnyModerationPermission = moderationPermissions.some(permission => 
                moderator.permissions.has(permission)
            );

            if (!hasAnyModerationPermission) {
                return { 
                    success: false, 
                    error: 'insufficient_permissions',
                    message: '❌ Vous devez avoir des permissions de modération pour gérer la liste de surveillance.'
                };
            }

            return { success: true, reason: 'permission_granted' };

        } catch (error) {
            console.error('Error in watchlist permission validation:', error);
            return { 
                success: false, 
                error: 'validation_error',
                message: '❌ Une erreur est survenue lors de la validation des permissions.'
            };
        }
    }

    /**
     * Validates global watchlist permissions (bot admin only)
     * @param {GuildMember} moderator - The moderator
     * @returns {Object} Validation result
     */
    validateGlobalWatchlistPermission(moderator) {
        try {
            // Only bot admins can manage global watchlist
            if (!this.adminManager.isAdmin(moderator.id)) {
                return { 
                    success: false, 
                    error: 'bot_admin_required',
                    message: '❌ Seuls les administrateurs du bot peuvent gérer la liste de surveillance globale.'
                };
            }

            return { success: true, reason: 'bot_admin_override' };

        } catch (error) {
            console.error('Error in global watchlist permission validation:', error);
            return { 
                success: false, 
                error: 'validation_error',
                message: '❌ Une erreur est survenue lors de la validation des permissions.'
            };
        }
    }

    /**
     * Validates timeout duration
     * @param {number} duration - Duration in milliseconds
     * @returns {Object} Validation result
     */
    validateTimeoutDuration(duration) {
        try {
            const maxDuration = 28 * 24 * 60 * 60 * 1000; // 28 days in milliseconds
            const minDuration = 60 * 1000; // 1 minute in milliseconds

            if (duration < minDuration) {
                return { 
                    success: false, 
                    error: 'duration_too_short',
                    message: '❌ La durée du timeout doit être d\'au moins 1 minute.'
                };
            }

            if (duration > maxDuration) {
                return { 
                    success: false, 
                    error: 'duration_too_long',
                    message: '❌ La durée du timeout ne peut pas dépasser 28 jours.'
                };
            }

            return { success: true, duration };

        } catch (error) {
            console.error('Error in timeout duration validation:', error);
            return { 
                success: false, 
                error: 'validation_error',
                message: '❌ Une erreur est survenue lors de la validation de la durée.'
            };
        }
    }

    /**
     * Parses duration string to milliseconds
     * @param {string} durationStr - Duration string (e.g., "1h", "30m", "2d")
     * @returns {Object} Parsed duration result
     */
    parseDuration(durationStr) {
        try {
            const regex = /^(\d+)([smhd])$/i;
            const match = durationStr.match(regex);

            if (!match) {
                return { 
                    success: false, 
                    error: 'invalid_format',
                    message: '❌ Format de durée invalide. Utilisez: 30s, 5m, 2h, 1d'
                };
            }

            const value = parseInt(match[1]);
            const unit = match[2].toLowerCase();

            const multipliers = {
                's': 1000,           // seconds
                'm': 60 * 1000,      // minutes
                'h': 60 * 60 * 1000, // hours
                'd': 24 * 60 * 60 * 1000 // days
            };

            const duration = value * multipliers[unit];

            return this.validateTimeoutDuration(duration);

        } catch (error) {
            console.error('Error in duration parsing:', error);
            return { 
                success: false, 
                error: 'parsing_error',
                message: '❌ Une erreur est survenue lors de l\'analyse de la durée.'
            };
        }
    }

    /**
     * Validates message count for bulk deletion
     * @param {number} count - Number of messages to delete
     * @returns {Object} Validation result
     */
    validateMessageCount(count) {
        try {
            const maxCount = 100; // Discord API limit
            const minCount = 1;

            if (count < minCount) {
                return { 
                    success: false, 
                    error: 'count_too_low',
                    message: '❌ Le nombre de messages doit être d\'au moins 1.'
                };
            }

            if (count > maxCount) {
                return { 
                    success: false, 
                    error: 'count_too_high',
                    message: '❌ Le nombre de messages ne peut pas dépasser 100.'
                };
            }

            return { success: true, count };

        } catch (error) {
            console.error('Error in message count validation:', error);
            return { 
                success: false, 
                error: 'validation_error',
                message: '❌ Une erreur est survenue lors de la validation du nombre de messages.'
            };
        }
    }
}