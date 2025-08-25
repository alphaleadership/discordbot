import { describe, it, expect, beforeEach, vi } from 'vitest';
import { PermissionsBitField } from 'discord.js';
import PermissionValidator from '../../utils/PermissionValidator.js';

describe('PermissionValidator', () => {
    let permissionValidator;
    let mockAdminManager;
    let mockModerator;
    let mockTarget;

    beforeEach(() => {
        // Mock AdminManager
        mockAdminManager = {
            isAdmin: vi.fn()
        };

        permissionValidator = new PermissionValidator(mockAdminManager);

        // Mock moderator
        mockModerator = {
            id: 'moderator123',
            permissions: {
                has: vi.fn()
            },
            roles: {
                highest: { position: 5 }
            },
            guild: {
                ownerId: 'owner123'
            }
        };

        // Mock target
        mockTarget = {
            id: 'target123',
            bot: false,
            roles: {
                highest: { position: 3 }
            }
        };
    });

    describe('validateModerationAction', () => {
        it('should allow action for bot admin', () => {
            mockAdminManager.isAdmin.mockReturnValue(true);

            const result = permissionValidator.validateModerationAction(
                mockModerator,
                mockTarget,
                PermissionsBitField.Flags.KickMembers
            );

            expect(result.success).toBe(true);
            expect(result.reason).toBe('bot_admin_override');
        });

        it('should deny self-moderation', () => {
            mockAdminManager.isAdmin.mockReturnValue(false);
            mockTarget.id = mockModerator.id;

            const result = permissionValidator.validateModerationAction(
                mockModerator,
                mockTarget,
                PermissionsBitField.Flags.KickMembers
            );

            expect(result.success).toBe(false);
            expect(result.error).toBe('self_moderation_denied');
            expect(result.message).toContain('vous-même');
        });

        it('should deny action on bot admin target', () => {
            mockAdminManager.isAdmin.mockReturnValueOnce(false).mockReturnValueOnce(true);

            const result = permissionValidator.validateModerationAction(
                mockModerator,
                mockTarget,
                PermissionsBitField.Flags.KickMembers
            );

            expect(result.success).toBe(false);
            expect(result.error).toBe('target_is_bot_admin');
            expect(result.message).toContain('administrateur du bot');
        });

        it('should deny action without required permissions', () => {
            mockAdminManager.isAdmin.mockReturnValue(false);
            mockModerator.permissions.has.mockReturnValue(false);

            const result = permissionValidator.validateModerationAction(
                mockModerator,
                mockTarget,
                PermissionsBitField.Flags.KickMembers
            );

            expect(result.success).toBe(false);
            expect(result.error).toBe('insufficient_permissions');
            expect(result.message).toContain('permissions nécessaires');
        });

        it('should deny action due to role hierarchy', () => {
            mockAdminManager.isAdmin.mockReturnValue(false);
            mockModerator.permissions.has.mockReturnValue(true);
            mockTarget.roles.highest.position = 6; // Higher than moderator

            const result = permissionValidator.validateModerationAction(
                mockModerator,
                mockTarget,
                PermissionsBitField.Flags.KickMembers
            );

            expect(result.success).toBe(false);
            expect(result.error).toBe('role_hierarchy_violation');
            expect(result.message).toContain('rôle égal ou supérieur');
        });

        it('should deny action on bot when preventBotActions is true', () => {
            mockAdminManager.isAdmin.mockReturnValue(false);
            mockModerator.permissions.has.mockReturnValue(true);
            mockTarget.bot = true;

            const result = permissionValidator.validateModerationAction(
                mockModerator,
                mockTarget,
                PermissionsBitField.Flags.KickMembers,
                { preventBotActions: true }
            );

            expect(result.success).toBe(false);
            expect(result.error).toBe('target_is_bot');
            expect(result.message).toContain('bot');
        });

        it('should deny action on guild owner when preventOwnerActions is true', () => {
            mockAdminManager.isAdmin.mockReturnValue(false);
            mockModerator.permissions.has.mockReturnValue(true);
            mockTarget.id = 'owner123'; // Same as guild owner

            const result = permissionValidator.validateModerationAction(
                mockModerator,
                mockTarget,
                PermissionsBitField.Flags.BanMembers,
                { preventOwnerActions: true }
            );

            expect(result.success).toBe(false);
            expect(result.error).toBe('target_is_owner');
            expect(result.message).toContain('propriétaire du serveur');
        });

        it('should allow valid moderation action', () => {
            mockAdminManager.isAdmin.mockReturnValue(false);
            mockModerator.permissions.has.mockReturnValue(true);

            const result = permissionValidator.validateModerationAction(
                mockModerator,
                mockTarget,
                PermissionsBitField.Flags.KickMembers
            );

            expect(result.success).toBe(true);
            expect(result.reason).toBe('permission_granted');
        });

        it('should handle validation errors gracefully', () => {
            mockAdminManager.isAdmin.mockImplementation(() => {
                throw new Error('Test error');
            });

            const result = permissionValidator.validateModerationAction(
                mockModerator,
                mockTarget,
                PermissionsBitField.Flags.KickMembers
            );

            expect(result.success).toBe(false);
            expect(result.error).toBe('validation_error');
        });
    });

    describe('validateKickPermission', () => {
        it('should validate kick permission correctly', () => {
            mockAdminManager.isAdmin.mockReturnValue(false);
            mockModerator.permissions.has.mockReturnValue(true);

            const result = permissionValidator.validateKickPermission(mockModerator, mockTarget);

            expect(result.success).toBe(true);
            expect(mockModerator.permissions.has).toHaveBeenCalledWith(PermissionsBitField.Flags.KickMembers);
        });

        it('should prevent kick on bot', () => {
            mockAdminManager.isAdmin.mockReturnValue(false);
            mockModerator.permissions.has.mockReturnValue(true);
            mockTarget.bot = true;

            const result = permissionValidator.validateKickPermission(mockModerator, mockTarget);

            expect(result.success).toBe(false);
            expect(result.error).toBe('target_is_bot');
        });
    });

    describe('validateBanPermission', () => {
        it('should validate ban permission correctly', () => {
            mockAdminManager.isAdmin.mockReturnValue(false);
            mockModerator.permissions.has.mockReturnValue(true);

            const result = permissionValidator.validateBanPermission(mockModerator, mockTarget);

            expect(result.success).toBe(true);
            expect(mockModerator.permissions.has).toHaveBeenCalledWith(PermissionsBitField.Flags.BanMembers);
        });

        it('should prevent ban on guild owner', () => {
            mockAdminManager.isAdmin.mockReturnValue(false);
            mockModerator.permissions.has.mockReturnValue(true);
            mockTarget.id = 'owner123';

            const result = permissionValidator.validateBanPermission(mockModerator, mockTarget);

            expect(result.success).toBe(false);
            expect(result.error).toBe('target_is_owner');
        });
    });

    describe('validateTimeoutPermission', () => {
        it('should validate timeout permission correctly', () => {
            mockAdminManager.isAdmin.mockReturnValue(false);
            mockModerator.permissions.has.mockReturnValue(true);

            const result = permissionValidator.validateTimeoutPermission(mockModerator, mockTarget);

            expect(result.success).toBe(true);
            expect(mockModerator.permissions.has).toHaveBeenCalledWith(PermissionsBitField.Flags.ModerateMembers);
        });
    });

    describe('validateMessageManagementPermission', () => {
        it('should allow bot admin', () => {
            mockAdminManager.isAdmin.mockReturnValue(true);

            const result = permissionValidator.validateMessageManagementPermission(mockModerator);

            expect(result.success).toBe(true);
            expect(result.reason).toBe('bot_admin_override');
        });

        it('should validate manage messages permission', () => {
            mockAdminManager.isAdmin.mockReturnValue(false);
            mockModerator.permissions.has.mockReturnValue(true);

            const result = permissionValidator.validateMessageManagementPermission(mockModerator);

            expect(result.success).toBe(true);
            expect(mockModerator.permissions.has).toHaveBeenCalledWith(PermissionsBitField.Flags.ManageMessages);
        });

        it('should deny without manage messages permission', () => {
            mockAdminManager.isAdmin.mockReturnValue(false);
            mockModerator.permissions.has.mockReturnValue(false);

            const result = permissionValidator.validateMessageManagementPermission(mockModerator);

            expect(result.success).toBe(false);
            expect(result.error).toBe('insufficient_permissions');
        });
    });

    describe('validateWatchlistPermission', () => {
        it('should allow bot admin', () => {
            mockAdminManager.isAdmin.mockReturnValue(true);

            const result = permissionValidator.validateWatchlistPermission(mockModerator);

            expect(result.success).toBe(true);
            expect(result.reason).toBe('bot_admin_override');
        });

        it('should allow with any moderation permission', () => {
            mockAdminManager.isAdmin.mockReturnValue(false);
            mockModerator.permissions.has.mockReturnValueOnce(false)
                .mockReturnValueOnce(true); // Has BanMembers

            const result = permissionValidator.validateWatchlistPermission(mockModerator);

            expect(result.success).toBe(true);
        });

        it('should deny without any moderation permission', () => {
            mockAdminManager.isAdmin.mockReturnValue(false);
            mockModerator.permissions.has.mockReturnValue(false);

            const result = permissionValidator.validateWatchlistPermission(mockModerator);

            expect(result.success).toBe(false);
            expect(result.error).toBe('insufficient_permissions');
        });
    });

    describe('validateGlobalWatchlistPermission', () => {
        it('should allow bot admin', () => {
            mockAdminManager.isAdmin.mockReturnValue(true);

            const result = permissionValidator.validateGlobalWatchlistPermission(mockModerator);

            expect(result.success).toBe(true);
            expect(result.reason).toBe('bot_admin_override');
        });

        it('should deny non-bot admin', () => {
            mockAdminManager.isAdmin.mockReturnValue(false);

            const result = permissionValidator.validateGlobalWatchlistPermission(mockModerator);

            expect(result.success).toBe(false);
            expect(result.error).toBe('bot_admin_required');
        });
    });

    describe('validateTimeoutDuration', () => {
        it('should accept valid duration', () => {
            const duration = 60 * 60 * 1000; // 1 hour

            const result = permissionValidator.validateTimeoutDuration(duration);

            expect(result.success).toBe(true);
            expect(result.duration).toBe(duration);
        });

        it('should reject duration too short', () => {
            const duration = 30 * 1000; // 30 seconds

            const result = permissionValidator.validateTimeoutDuration(duration);

            expect(result.success).toBe(false);
            expect(result.error).toBe('duration_too_short');
        });

        it('should reject duration too long', () => {
            const duration = 29 * 24 * 60 * 60 * 1000; // 29 days

            const result = permissionValidator.validateTimeoutDuration(duration);

            expect(result.success).toBe(false);
            expect(result.error).toBe('duration_too_long');
        });
    });

    describe('parseDuration', () => {
        it('should parse seconds correctly', () => {
            const result = permissionValidator.parseDuration('90s');

            expect(result.success).toBe(true);
            expect(result.duration).toBe(90 * 1000);
        });

        it('should parse minutes correctly', () => {
            const result = permissionValidator.parseDuration('30m');

            expect(result.success).toBe(true);
            expect(result.duration).toBe(30 * 60 * 1000);
        });

        it('should parse hours correctly', () => {
            const result = permissionValidator.parseDuration('2h');

            expect(result.success).toBe(true);
            expect(result.duration).toBe(2 * 60 * 60 * 1000);
        });

        it('should parse days correctly', () => {
            const result = permissionValidator.parseDuration('1d');

            expect(result.success).toBe(true);
            expect(result.duration).toBe(24 * 60 * 60 * 1000);
        });

        it('should reject invalid format', () => {
            const result = permissionValidator.parseDuration('invalid');

            expect(result.success).toBe(false);
            expect(result.error).toBe('invalid_format');
        });

        it('should reject duration too long after parsing', () => {
            const result = permissionValidator.parseDuration('30d');

            expect(result.success).toBe(false);
            expect(result.error).toBe('duration_too_long');
        });
    });

    describe('validateMessageCount', () => {
        it('should accept valid count', () => {
            const result = permissionValidator.validateMessageCount(50);

            expect(result.success).toBe(true);
            expect(result.count).toBe(50);
        });

        it('should reject count too low', () => {
            const result = permissionValidator.validateMessageCount(0);

            expect(result.success).toBe(false);
            expect(result.error).toBe('count_too_low');
        });

        it('should reject count too high', () => {
            const result = permissionValidator.validateMessageCount(150);

            expect(result.success).toBe(false);
            expect(result.error).toBe('count_too_high');
        });

        it('should accept boundary values', () => {
            const result1 = permissionValidator.validateMessageCount(1);
            const result100 = permissionValidator.validateMessageCount(100);

            expect(result1.success).toBe(true);
            expect(result100.success).toBe(true);
        });
    });
});