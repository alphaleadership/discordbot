import { describe, test, expect, beforeEach, vi } from 'vitest';
import fs from 'fs';
import { BlockedWordsManager } from '../../utils/BlockedWordsManager.js';

vi.mock('fs', async () => {
    const actual = await vi.importActual('fs');
    return {
        default: {
            ...actual,
            existsSync: vi.fn(),
            readFileSync: vi.fn(),
            writeFileSync: vi.fn()
        }
    };
});

describe('BlockedWordsManager', () => {
    let manager;

    beforeEach(() => {
        vi.clearAllMocks();
        fs.existsSync.mockReturnValue(false);
        manager = new BlockedWordsManager('data/blocked_words.json');
    });

    test('should load blocked words', () => {
        fs.existsSync.mockReturnValue(true);
        fs.readFileSync.mockReturnValue(JSON.stringify({
            'guild1': ['mot1', 'mot2']
        }));
        
        const m = new BlockedWordsManager();
        expect(m.getBlockedWords('guild1')).toEqual(['mot1', 'mot2']);
    });

    test('should add custom blocked words', () => {
        manager.blockedWords = {};
        const added = manager.addBlockedWord('guild1', 'salut');
        expect(added).toBe(true);
        expect(manager.getBlockedWords('guild1')).toContain('salut');
    });

    test('should detect default insults', () => {
        // "connard" is in the default insults list
        expect(manager.isBlocked('guild1', 'Tu es un gros connard')).toBe(true);
        expect(manager.isBlocked('guild1', 'Bonjour tout le monde')).toBe(false);
    });

    test('should normalize diacritics/accents', () => {
        // "enculé" with accents
        expect(manager.isBlocked('guild1', 'Espèce d\'enculé')).toBe(true);
        expect(manager.isBlocked('guild1', 'Espece d\'enculé')).toBe(true);
    });

    test('should handle leetspeak bypass attempts', () => {
        // "c0nn4rd" for "connard"
        expect(manager.isBlocked('guild1', 'c0nn4rd')).toBe(true);
        // "5410p3" for "salope"
        expect(manager.isBlocked('guild1', '5410p3')).toBe(true);
    });

    test('should handle punctuation bypass attempts', () => {
        // "c*o*n*n*a*r*d"
        expect(manager.isBlocked('guild1', 'c*o*n.n_a-r/d')).toBe(true);
    });

    test('should avoid false positives using word boundaries', () => {
        // "con" is a default insult, but should not trigger on "concombre" or "flocon"
        expect(manager.isBlocked('guild1', 'Je mange un concombre')).toBe(false);
        expect(manager.isBlocked('guild1', 'Il y a un flocon de neige')).toBe(false);
        expect(manager.isBlocked('guild1', 'T\'es vraiment trop con')).toBe(true);
    });
});
