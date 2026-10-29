import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import { WatchlistManager } from '../../utils/WatchlistManager.js';

describe('WatchlistManager - Purge entries without reasons', () => {
    const testDir = path.join(process.cwd(), 'test/test-data/purge-test');
    const testFile = 'test/test-data/purge-test/watchlist.json';

    const mockReportManager = {
        sendWatchlistAlert: vi.fn().mockResolvedValue({ success: true }),
        logModerationAction: vi.fn().mockResolvedValue({ success: true })
    };

    beforeEach(() => {
        if (!fs.existsSync(testDir)) {
            fs.mkdirSync(testDir, { recursive: true });
        }
        // Always ensure a valid base file exists
        const baseData = {
            _metadata: { version: '2.0', created: new Date().toISOString() },
            _settings: {}
        };
        fs.writeFileSync(path.join(process.cwd(), testFile), JSON.stringify(baseData, null, 2));
    });

    afterEach(() => {
        try {
            if (fs.existsSync(testDir)) {
                fs.rmSync(testDir, { recursive: true, force: true });
            }
        } catch (e) {
            // Ignore cleanup errors
        }
    });

    test('isReasonEmptyOrPlaceholder identifies empty and placeholder reasons', () => {
        const manager = new WatchlistManager(testFile, mockReportManager);

        expect(manager.isReasonEmptyOrPlaceholder('')).toBe(true);
        expect(manager.isReasonEmptyOrPlaceholder('   ')).toBe(true);
        expect(manager.isReasonEmptyOrPlaceholder(null)).toBe(true);
        expect(manager.isReasonEmptyOrPlaceholder(undefined)).toBe(true);
        expect(manager.isReasonEmptyOrPlaceholder('Raison non spécifiée')).toBe(true);
        expect(manager.isReasonEmptyOrPlaceholder('raison non specifiee')).toBe(true);
        expect(manager.isReasonEmptyOrPlaceholder('aucune raison')).toBe(true);
        expect(manager.isReasonEmptyOrPlaceholder('None')).toBe(true);
        expect(manager.isReasonEmptyOrPlaceholder('N/A')).toBe(true);

        expect(manager.isReasonEmptyOrPlaceholder('Spamming in announcements')).toBe(false);
        expect(manager.isReasonEmptyOrPlaceholder('Raid suspect')).toBe(false);
    });

    test('isValidWatchlistEntry rejects entries with empty or placeholder reasons', () => {
        const manager = new WatchlistManager(testFile, mockReportManager);

        const validEntry = {
            userId: '123456789012345678',
            guildId: 'guild_123',
            reason: 'Suspicious bot account',
            addedBy: '987654321098765432'
        };
        expect(manager.isValidWatchlistEntry(validEntry)).toBe(true);

        const emptyReasonEntry = { ...validEntry, reason: '' };
        expect(manager.isValidWatchlistEntry(emptyReasonEntry)).toBe(false);

        const whitespaceReasonEntry = { ...validEntry, reason: '   ' };
        expect(manager.isValidWatchlistEntry(whitespaceReasonEntry)).toBe(false);

        const placeholderEntry = { ...validEntry, reason: 'Raison non spécifiée' };
        expect(manager.isValidWatchlistEntry(placeholderEntry)).toBe(false);
    });

    test('addToWatchlist and addToGlobalWatchlist reject empty or placeholder reasons', async () => {
        const manager = new WatchlistManager(testFile, mockReportManager);
        await manager.initializeWatchlist();

        const localRes = await manager.addToWatchlist('123456789012345678', 'Raison non spécifiée', '987654321098765432', 'guild_1');
        expect(localRes.success).toBe(false);

        const globalRes = await manager.addToGlobalWatchlist('123456789012345678', 'none', '987654321098765432');
        expect(globalRes.success).toBe(false);
    });

    test('purgeEntriesWithoutReason purges invalid reason entries and keeps valid entries', async () => {
        const manager = new WatchlistManager(testFile, mockReportManager);
        await manager.initializeWatchlist();

        const initialData = {
            _metadata: { version: '2.0', created: new Date().toISOString() },
            _settings: { autoAction: true },
            'guild1_111': {
                userId: '111',
                guildId: 'guild1',
                reason: 'Valid raid suspect reason',
                addedBy: 'admin1',
                active: true,
                notes: [],
                incidents: [],
                addedAt: new Date().toISOString()
            },
            'guild1_222': {
                userId: '222',
                guildId: 'guild1',
                reason: '',
                addedBy: 'admin1',
                active: true,
                notes: [],
                incidents: [],
                addedAt: new Date().toISOString()
            },
            'guild1_333': {
                userId: '333',
                guildId: 'guild1',
                reason: 'Raison non spécifiée',
                addedBy: 'admin1',
                active: true,
                notes: [],
                incidents: [],
                addedAt: new Date().toISOString()
            },
            'GLOBAL_444': {
                userId: '444',
                guildId: 'GLOBAL',
                reason: 'Aucune raison',
                addedBy: 'admin1',
                active: true,
                notes: [],
                incidents: [],
                addedAt: new Date().toISOString()
            },
            'GLOBAL_555': {
                userId: '555',
                guildId: 'GLOBAL',
                reason: 'Confirmed dox threat',
                addedBy: 'admin1',
                active: true,
                notes: [],
                incidents: [],
                addedAt: new Date().toISOString()
            }
        };

        manager.watchlist = JSON.parse(JSON.stringify(initialData));

        const purgeResult = await manager.purgeEntriesWithoutReason();

        expect(purgeResult.checked).toBe(5);
        expect(purgeResult.removed).toBe(3);
        expect(purgeResult.purgedKeys).toEqual(['guild1_222', 'guild1_333', 'GLOBAL_444']);

        // Check in-memory state
        expect(manager.watchlist['guild1_111']).toBeDefined();
        expect(manager.watchlist['GLOBAL_555']).toBeDefined();
        expect(manager.watchlist['guild1_222']).toBeUndefined();
        expect(manager.watchlist['guild1_333']).toBeUndefined();
        expect(manager.watchlist['GLOBAL_444']).toBeUndefined();

        // Check persisted state in file
        const savedData = JSON.parse(fs.readFileSync(path.join(process.cwd(), testFile), 'utf-8'));
        expect(savedData['guild1_111']).toBeDefined();
        expect(savedData['GLOBAL_555']).toBeDefined();
        expect(savedData['guild1_222']).toBeUndefined();
        expect(savedData._metadata).toBeDefined();
        expect(savedData._settings).toBeDefined();
    });

    test('fixWatchlistData automatically purges entries without valid reasons', () => {
        const manager = new WatchlistManager(testFile, mockReportManager);
        const dataToFix = {
            _metadata: { version: '2.0' },
            _settings: {},
            'user_valid': {
                userId: '111',
                reason: 'Legitimate reason'
            },
            'user_invalid': {
                userId: '222',
                reason: 'Raison non spécifiée'
            },
            'user_empty': {
                userId: '333',
                reason: ''
            }
        };

        const fixed = manager.fixWatchlistData(dataToFix);
        expect(fixed['user_valid']).toBeDefined();
        expect(fixed['user_invalid']).toBeUndefined();
        expect(fixed['user_empty']).toBeUndefined();
    });
});
