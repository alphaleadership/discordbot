import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import { BanlistManager } from '../../utils/BanlistManager.js';

vi.mock('fs', async () => {
    const actual = await vi.importActual('fs');
    return {
        default: {
            ...actual,
            existsSync: vi.fn(),
            readFileSync: vi.fn(),
            writeFileSync: vi.fn(),
            appendFileSync: vi.fn(),
            mkdirSync: vi.fn()
        }
    };
});

describe('BanlistManager', () => {
    let manager;
    const mockPendingFile = path.join(process.cwd(), 'data/ban_pending.json');

    beforeEach(() => {
        vi.clearAllMocks();
        fs.existsSync.mockReturnValue(false);
        manager = new BanlistManager();
    });

    test('should add a user to banlist', async () => {
        fs.existsSync.mockReturnValue(true);
        fs.readFileSync.mockReturnValue('123456789 - Spamming | Ajouté par: mod1 | Le: 2026-06-24\n');

        const result = await manager.addToBanlist('987654321', 'Raid', 'mod2');
        expect(result.success).toBe(true);
        expect(fs.appendFileSync).toHaveBeenCalled();
        expect(fs.appendFileSync.mock.calls[0][0]).toBe('banlist.txt');
        expect(fs.appendFileSync.mock.calls[0][1]).toContain('987654321 - Raid');
    });

    test('should fail to add duplicate user to banlist', async () => {
        fs.existsSync.mockReturnValue(true);
        fs.readFileSync.mockReturnValue('123456789 - Spamming | Ajouté par: mod1 | Le: 2026-06-24\n');

        const result = await manager.addToBanlist('123456789', 'Duplicate', 'mod2');
        expect(result.success).toBe(false);
        expect(result.message).toContain('déjà dans la liste');
    });

    test('should remove a user from banlist', async () => {
        fs.existsSync.mockReturnValue(true);
        fs.readFileSync.mockReturnValue(
            '123456789 - Spamming | Ajouté par: mod1 | Le: 2026\n' +
            '987654321 - Raid | Ajouté par: mod2 | Le: 2026\n'
        );

        const result = await manager.removeFromBanlist('123456789');
        expect(result.success).toBe(true);
        expect(fs.writeFileSync).toHaveBeenCalled();
        expect(fs.writeFileSync.mock.calls[0][0]).toBe('banlist.txt');
        expect(fs.writeFileSync.mock.calls[0][1]).toBe('987654321 - Raid | Ajouté par: mod2 | Le: 2026\n');
    });

    test('should return error when removing user not in banlist', async () => {
        fs.existsSync.mockReturnValue(true);
        fs.readFileSync.mockReturnValue('123456789 - Spamming | Ajouté par: mod1 | Le: 2026\n');

        const result = await manager.removeFromBanlist('987654321');
        expect(result.success).toBe(false);
        expect(result.message).toContain("n'est pas dans la liste");
    });

    test('should check if a user is banned', async () => {
        fs.existsSync.mockReturnValue(true);
        fs.readFileSync.mockReturnValue('123456789 - Spamming | Ajouté par: mod1 | Le: 2026\n');

        const checkBanned = await manager.isBanned('123456789');
        expect(checkBanned.banned).toBe(true);
        expect(checkBanned.reason).toBe('Spamming');

        const checkNotBanned = await manager.isBanned('987654321');
        expect(checkNotBanned.banned).toBe(false);
    });

    test('should handle pending requests for unbans', async () => {
        const requestData = {
            type: 'remove',
            userId: '123456789',
            username: 'test#0001',
            reason: 'Pardon',
            moderatorId: 'mod1',
            moderatorTag: 'mod#0001',
            guildId: 'guild1',
            guildName: 'Guild'
        };

        const addResult = await manager.addPendingRequest(requestData);
        expect(addResult.success).toBe(true);
        expect(manager.getPendingRequests()).toHaveLength(1);
        expect(manager.getPendingRequests()[0].type).toBe('remove');
    });

    test('should approve unban pending request', async () => {
        const mockGuild = {
            members: {
                unban: vi.fn().mockResolvedValue(true)
            }
        };

        manager.pendingRequests = [{
            id: 'req_123',
            type: 'remove',
            userId: '123456789',
            username: 'test#0001',
            reason: 'Pardon',
            moderatorId: 'mod1',
            moderatorTag: 'mod#0001',
            guildId: 'guild1',
            guildName: 'Guild',
            status: 'pending'
        }];

        vi.spyOn(manager, 'removeFromBanlist').mockResolvedValue({ success: true });

        const result = await manager.approveRequest('req_123', 'admin1', mockGuild);
        expect(result.success).toBe(true);
        expect(mockGuild.members.unban).toHaveBeenCalledWith('123456789', 'Pardon (Validé par admin1)');
        expect(manager.removeFromBanlist).toHaveBeenCalledWith('123456789');
    });
});
