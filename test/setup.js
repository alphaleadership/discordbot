import { vi } from 'vitest';
import fs from 'fs';
import path from 'path';

// Mock Discord.js with comprehensive mocks
vi.mock('discord.js', async () => {
  const mocks = await import('./mocks/discord.js');
  return mocks;
});

// Mock node-fetch for tests that need it
vi.mock('node-fetch', () => ({
  default: vi.fn().mockImplementation((url, options) => {
    return Promise.resolve({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: () => Promise.resolve({ success: true }),
      text: () => Promise.resolve('Mock response'),
      headers: new Map()
    });
  })
}));

// Mock axios for HTTP requests
vi.mock('axios', () => ({
  default: {
    get: vi.fn().mockResolvedValue({ data: { success: true } }),
    post: vi.fn().mockResolvedValue({ data: { success: true } }),
    put: vi.fn().mockResolvedValue({ data: { success: true } }),
    delete: vi.fn().mockResolvedValue({ data: { success: true } }),
    create: vi.fn().mockReturnThis()
  }
}));

// Mock tesseract.js for OCR tests
vi.mock('tesseract.js', () => ({
  recognize: vi.fn().mockResolvedValue({
    data: { 
      text: 'Mock OCR text',
      confidence: 95,
      words: [
        { text: 'Mock', confidence: 95 },
        { text: 'OCR', confidence: 95 },
        { text: 'text', confidence: 95 }
      ]
    }
  }),
  createWorker: vi.fn().mockResolvedValue({
    load: vi.fn().mockResolvedValue(),
    loadLanguage: vi.fn().mockResolvedValue(),
    initialize: vi.fn().mockResolvedValue(),
    recognize: vi.fn().mockResolvedValue({
      data: { text: 'Mock OCR text', confidence: 95 }
    }),
    terminate: vi.fn().mockResolvedValue()
  })
}));

// Mock node-telegram-bot-api
vi.mock('node-telegram-bot-api', () => ({
  default: vi.fn().mockImplementation(() => ({
    sendMessage: vi.fn().mockResolvedValue({ 
      message_id: 123,
      chat: { id: 456 },
      text: 'Mock message'
    }),
    sendPhoto: vi.fn().mockResolvedValue({ 
      message_id: 124,
      chat: { id: 456 },
      photo: [{ file_id: 'mock_photo_id' }]
    }),
    sendDocument: vi.fn().mockResolvedValue({
      message_id: 125,
      chat: { id: 456 },
      document: { file_id: 'mock_doc_id' }
    }),
    editMessageText: vi.fn().mockResolvedValue({
      message_id: 123,
      chat: { id: 456 },
      text: 'Edited message'
    }),
    deleteMessage: vi.fn().mockResolvedValue(true),
    on: vi.fn(),
    startPolling: vi.fn(),
    stopPolling: vi.fn(),
    getMe: vi.fn().mockResolvedValue({
      id: 789,
      is_bot: true,
      first_name: 'Test Bot',
      username: 'testbot'
    })
  }))
}));

// Mock @octokit/rest for GitHub integration
vi.mock('@octokit/rest', () => ({
  Octokit: vi.fn().mockImplementation(() => ({
    rest: {
      repos: {
        createOrUpdateFileContents: vi.fn().mockResolvedValue({
          data: { commit: { sha: 'mock_sha' } }
        }),
        getContent: vi.fn().mockResolvedValue({
          data: { content: Buffer.from('mock content').toString('base64') }
        })
      },
      git: {
        getRef: vi.fn().mockResolvedValue({
          data: { object: { sha: 'mock_ref_sha' } }
        })
      }
    }
  }))
}));

// Mock dotenv
vi.mock('dotenv', () => ({
  config: vi.fn()
}));

// Mock express for web server tests
vi.mock('express', () => ({
  default: vi.fn(() => ({
    use: vi.fn(),
    get: vi.fn(),
    post: vi.fn(),
    listen: vi.fn((port, callback) => {
      if (callback) callback();
      return { close: vi.fn() };
    }),
    static: vi.fn()
  }))
}));

// Ensure test data directory exists
const testDataDir = path.join(process.cwd(), 'test', 'test-data');
if (!fs.existsSync(testDataDir)) {
  fs.mkdirSync(testDataDir, { recursive: true });
}

// Create test data subdirectories
const testSubDirs = [
  'guilds',
  'users', 
  'messages',
  'logs',
  'backups',
  'temp'
];

testSubDirs.forEach(dir => {
  const dirPath = path.join(testDataDir, dir);
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
});

// Global test utilities
global.createMockGuild = async (overrides = {}) => {
  const { MockGuild, MockClient } = await import('./mocks/discord.js');
  const client = new MockClient();
  return new MockGuild(client, {
    id: '123456789012345678',
    name: 'Test Guild',
    ...overrides
  });
};

global.createMockUser = async (overrides = {}) => {
  const { MockUser } = await import('./mocks/discord.js');
  return new MockUser({
    id: '987654321098765432',
    username: 'testuser',
    discriminator: '0001',
    ...overrides
  });
};

global.createMockInteraction = async (overrides = {}) => {
  const { MockInteraction } = await import('./mocks/discord.js');
  const user = await global.createMockUser();
  return new MockInteraction({
    commandName: 'test',
    user,
    ...overrides
  });
};

global.createTestDataFile = (filename, data) => {
  const filepath = path.join(testDataDir, filename);
  fs.writeFileSync(filepath, JSON.stringify(data, null, 2));
  return filepath;
};

global.cleanupTestData = () => {
  const files = fs.readdirSync(testDataDir);
  files.forEach(file => {
    const filepath = path.join(testDataDir, file);
    const stat = fs.statSync(filepath);
    if (stat.isFile() && file.endsWith('.tmp')) {
      fs.unlinkSync(filepath);
    }
  });
};

// Mock process.env for tests
const originalEnv = process.env;
beforeEach(() => {
  process.env = {
    ...originalEnv,
    NODE_ENV: 'test',
    DISCORD_TOKEN: 'mock_discord_token',
    TELEGRAM_BOT_TOKEN: 'mock_telegram_token',
    GITHUB_TOKEN: 'mock_github_token',
    GITHUB_REPO: 'test/repo',
    GITHUB_OWNER: 'testowner'
  };
});

// Global test cleanup
afterEach(() => {
  vi.clearAllMocks();
  global.cleanupTestData();
  process.env = originalEnv;
});

// Global test teardown
afterAll(() => {
  // Clean up any persistent test data
  try {
    const tempFiles = fs.readdirSync(testDataDir)
      .filter(file => file.endsWith('.tmp') || file.startsWith('test_'));
    
    tempFiles.forEach(file => {
      const filepath = path.join(testDataDir, file);
      if (fs.existsSync(filepath)) {
        fs.unlinkSync(filepath);
      }
    });
  } catch (error) {
    // Ignore cleanup errors
  }
});