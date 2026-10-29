import { describe, it, expect } from 'vitest';
import http from 'http';

// Helper function logic under test (matching index.js)
function formatAttachmentHeader(filename, type = 'attachment') {
    const raw = String(filename || 'export.txt').replace(/[\r\n\0]/g, '');
    const asciiFallback = raw
        .replace(/œ/g, 'oe').replace(/Œ/g, 'OE')
        .replace(/æ/g, 'ae').replace(/Æ/g, 'AE')
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^\x20-\x7E]/g, '_')
        .replace(/["\\;]/g, '_');
    const encoded = encodeURIComponent(raw);
    return `${type}; filename="${asciiFallback}"; filename*=UTF-8''${encoded}`;
}

describe('Web Management Server - Content-Disposition and Header safety', () => {
    it('should format header safely with unicode characters (like œ, |, accents)', () => {
        const guildName = 'Katzetœ | Service secret listenbourgeois';
        const filename = `${guildName}-members.txt`;
        const header = formatAttachmentHeader(filename);

        expect(header).toContain('attachment;');
        expect(header).toContain('filename="Katzetoe | Service secret listenbourgeois-members.txt"');
        expect(header).toContain("filename*=UTF-8''Katzet%C5%93%20%7C%20Service%20secret%20listenbourgeois-members.txt");

        // Verify that it does NOT throw ERR_INVALID_CHAR in Node http.ServerResponse
        const res = new http.ServerResponse({ method: 'GET' });
        expect(() => {
            res.setHeader('Content-Disposition', header);
        }).not.toThrow();

        expect(res.getHeader('Content-Disposition')).toBe(header);
    });

    it('should sanitize double quotes, backslashes, semicolons and newlines in filenames', () => {
        const malicious = 'bad"file;name\r\nwith\\slash.txt';
        const header = formatAttachmentHeader(malicious);

        // Verify no raw newlines or dangerous unescaped chars in header
        expect(header).not.toContain('\r');
        expect(header).not.toContain('\n');
        expect(header).not.toContain('bad"file');

        const res = new http.ServerResponse({ method: 'GET' });
        expect(() => {
            res.setHeader('Content-Disposition', header);
        }).not.toThrow();
    });

    it('should handle empty or undefined filenames cleanly', () => {
        const header = formatAttachmentHeader(null);
        expect(header).toContain('filename="export.txt"');
    });

    it('should support emojis in server names without throwing ERR_INVALID_CHAR', () => {
        const emojiGuild = '🚀 Super Guild 🎉';
        const filename = `${emojiGuild}-bans.txt`;
        const header = formatAttachmentHeader(filename);

        const res = new http.ServerResponse({ method: 'GET' });
        expect(() => {
            res.setHeader('Content-Disposition', header);
        }).not.toThrow();

        expect(header).toContain('filename*=UTF-8\'\'%F0%9F%9A%80%20Super%20Guild%20%F0%9F%8E%89-bans.txt');
    });
});
