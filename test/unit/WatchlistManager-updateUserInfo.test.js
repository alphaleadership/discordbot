import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { WatchlistManager } from '../../utils/WatchlistManager.js';
import fs from 'fs';
import path from 'path';

describe('WatchlistManager - updateUserInfo & handleUserMessage', () => {
    const testDataDir = path.join(process.cwd(), 'test', 'test-data', 'watchlist-test');
    const testFile = 'test/test-data/watchlist-test/test-watchlist-update.json';
    const testFileAbs = path.join(process.cwd(), testFile);

    beforeEach(() => {
        if (!fs.existsSync(testDataDir)) {
            fs.mkdirSync(testDataDir, { recursive: true });
        }
        if (fs.existsSync(testFileAbs)) {
            fs.unlinkSync(testFileAbs);
        }
    });

    afterEach(() => {
        if (fs.existsSync(testFileAbs)) {
            fs.unlinkSync(testFileAbs);
        }
        if (fs.existsSync(testDataDir)) {
            fs.rmSync(testDataDir, { recursive: true, force: true });
        }
    });

    it('should return a success object when updateUserInfo is called', () => {
        const manager = new WatchlistManager(testFile, null);
        manager.addToWatchlist('user123', 'test reason', 'mod1', 'guild1');

        const result = manager.updateUserInfo('user123', {
            username: 'NewUsername',
            discriminator: '0001',
            lastSeen: new Date().toISOString()
        });

        expect(result).toBeDefined();
        expect(result.success).toBe(true);
        expect(result.updated).toBe(true);

        const entry = manager.getWatchlistEntry('user123', 'guild1');
        expect(entry.username).toBe('NewUsername');
    });

    it('should not throw TypeError during handleUserMessage even if user is on watchlist', async () => {
        const manager = new WatchlistManager(testFile, null);
        manager.addToWatchlist('user123', 'test reason', 'mod1', 'guild1', { watchLevel: 'observe' });

        const mockMessage = {
            author: { id: 'user123', username: 'TestUser', discriminator: '0000', bot: false },
            guild: { id: 'guild1', name: 'Test Guild' },
            channel: { id: 'chan1', name: 'general' },
            content: 'Hello world'
        };

        const result = await manager.handleUserMessage(mockMessage);
        expect(result.watched).toBe(true);
        expect(result.watchLevel).toBe('observe');
    });
});
