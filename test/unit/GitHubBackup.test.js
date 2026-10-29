import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import {
    GITHUB_API_VERSION,
    FILES_TO_BACKUP,
    createOctokitClient,
    backupFile,
    runBackup
} from '../../backup-to-github.js';

describe('GitHub Backup System with latest API version', () => {
    const testDir = path.join(process.cwd(), 'test', 'test-data', 'backup-test');
    const testFile = path.join(testDir, 'test-file.txt');

    beforeEach(() => {
        if (!fs.existsSync(testDir)) {
            fs.mkdirSync(testDir, { recursive: true });
        }
        fs.writeFileSync(testFile, 'test backup content', 'utf8');
        process.env.GITHUB_OWNER = 'testowner';
        process.env.GITHUB_REPO = 'testrepo';
        process.env.GITHUB_BRANCH = 'main';
    });

    afterEach(() => {
        if (fs.existsSync(testFile)) {
            fs.unlinkSync(testFile);
        }
        if (fs.existsSync(testDir)) {
            fs.rmSync(testDir, { recursive: true, force: true });
        }
        vi.clearAllMocks();
    });

    it('should use the latest GitHub API version 2026-03-10 by default', () => {
        expect(GITHUB_API_VERSION).toBe('2026-03-10');
    });

    it('should configure Octokit client with latest API version and JSON headers', () => {
        const client = createOctokitClient('fake-token-123');
        expect(client).toBeDefined();
        expect(client.config).toBeDefined();
        expect(client.config.auth).toBe('fake-token-123');
        expect(client.config.request.headers['X-GitHub-Api-Version']).toBe('2026-03-10');
        expect(client.config.request.headers['Accept']).toBe('application/vnd.github+json');
    });

    it('should return null when token is missing in createOctokitClient', () => {
        const client = createOctokitClient('');
        expect(client).toBeNull();
    });

    it('should update an existing file on GitHub (matching sha)', async () => {
        const mockClient = {
            repos: {
                getContent: vi.fn().mockResolvedValue({
                    data: { sha: 'existing_sha_123' }
                }),
                createOrUpdateFileContents: vi.fn().mockResolvedValue({
                    data: {
                        commit: { sha: 'new_commit_sha' },
                        content: { html_url: 'https://github.com/testowner/testrepo/blob/main/test.txt' }
                    }
                })
            }
        };

        const success = await backupFile(testFile, mockClient);
        expect(success).toBe(true);
        expect(mockClient.repos.getContent).toHaveBeenCalledWith({
            owner: 'testowner',
            repo: 'testrepo',
            path: testFile,
            ref: 'main'
        });
        expect(mockClient.repos.createOrUpdateFileContents).toHaveBeenCalledWith(
            expect.objectContaining({
                owner: 'testowner',
                repo: 'testrepo',
                path: testFile,
                sha: 'existing_sha_123',
                branch: 'main'
            })
        );
    });

    it('should create a new file when it does not exist on GitHub (404)', async () => {
        const notFoundError = new Error('Not Found');
        notFoundError.status = 404;

        const mockClient = {
            repos: {
                getContent: vi.fn().mockRejectedValue(notFoundError),
                createOrUpdateFileContents: vi.fn().mockResolvedValue({
                    data: {
                        commit: { sha: 'initial_sha' },
                        content: { html_url: 'https://github.com/testowner/testrepo/blob/main/test.txt' }
                    }
                })
            }
        };

        const success = await backupFile(testFile, mockClient);
        expect(success).toBe(true);
        expect(mockClient.repos.createOrUpdateFileContents).toHaveBeenCalledWith(
            expect.objectContaining({
                branch: 'main'
            })
        );
        const callArgs = mockClient.repos.createOrUpdateFileContents.mock.calls[0][0];
        expect(callArgs.sha).toBeUndefined();
    });

    it('should handle non-existent local file gracefully', async () => {
        const mockClient = {
            repos: {
                getContent: vi.fn(),
                createOrUpdateFileContents: vi.fn()
            }
        };

        const success = await backupFile('non_existent_file_xyz.txt', mockClient);
        expect(success).toBe(false);
        expect(mockClient.repos.getContent).not.toHaveBeenCalled();
    });

    it('should return false when client is missing', async () => {
        const success = await backupFile(testFile, null);
        expect(success).toBe(false);
    });

    it('should handle 403 forbidden error gracefully', async () => {
        const forbiddenError = new Error('Resource not accessible by personal access token');
        forbiddenError.status = 403;

        const mockClient = {
            repos: {
                getContent: vi.fn().mockRejectedValue(forbiddenError)
            }
        };

        const success = await backupFile(testFile, mockClient);
        expect(success).toBe(false);
    });

    it('should run complete backup suite across multiple files', async () => {
        const testFile2 = path.join(testDir, 'test-file2.txt');
        fs.writeFileSync(testFile2, 'second test content', 'utf8');

        const mockClient = {
            repos: {
                getContent: vi.fn().mockResolvedValue({ data: { sha: 'sha_abc' } }),
                createOrUpdateFileContents: vi.fn().mockResolvedValue({
                    data: {
                        commit: { sha: 'commit_abc' },
                        content: { html_url: 'https://github.com' }
                    }
                })
            }
        };

        const success = await runBackup(mockClient, [testFile, testFile2]);
        expect(success).toBe(true);
        expect(mockClient.repos.createOrUpdateFileContents).toHaveBeenCalledTimes(2);

        if (fs.existsSync(testFile2)) {
            fs.unlinkSync(testFile2);
        }
    });
});
