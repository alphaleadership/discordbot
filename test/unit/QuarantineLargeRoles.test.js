import { describe, it, expect } from 'vitest';

describe('Quarantaine Grands Rôles', () => {
    it('devrait détecter si un rôle mentionné a plus de 20 membres', () => {
        // Rôle avec plus de 20 membres
        const mockLargeRole = {
            id: 'role-large-id',
            name: 'Grand Rôle',
            members: {
                size: 25
            }
        };

        // Rôle avec moins de 20 membres
        const mockSmallRole = {
            id: 'role-small-id',
            name: 'Petit Rôle',
            members: {
                size: 5
            }
        };

        // Message simulant une mention de grand rôle
        const messageWithLargeRole = {
            mentions: {
                roles: {
                    some: (fn) => [mockLargeRole].some(fn)
                }
            }
        };

        // Message simulant une mention de petit rôle
        const messageWithSmallRole = {
            mentions: {
                roles: {
                    some: (fn) => [mockSmallRole].some(fn)
                }
            }
        };

        const hasLargeRoleMention1 = messageWithLargeRole.mentions && 
            messageWithLargeRole.mentions.roles && 
            typeof messageWithLargeRole.mentions.roles.some === 'function' && 
            messageWithLargeRole.mentions.roles.some(role => role.members && role.members.size > 20);

        const hasLargeRoleMention2 = messageWithSmallRole.mentions && 
            messageWithSmallRole.mentions.roles && 
            typeof messageWithSmallRole.mentions.roles.some === 'function' && 
            messageWithSmallRole.mentions.roles.some(role => role.members && role.members.size > 20);

        expect(hasLargeRoleMention1).toBe(true);
        expect(hasLargeRoleMention2).toBe(false);
    });
});
