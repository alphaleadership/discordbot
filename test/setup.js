import { vi } from 'vitest';
import fs from 'fs';
import path from 'path';

// Mock node-fetch for tests that need it
vi.mock('node-fetch', () => ({
  default: vi.fn()
}));

// Mock tesseract.js for OCR tests
vi.mock('tesseract.js', () => ({
  recognize: vi.fn().mockResolvedValue({
    data: { text: 'Mock OCR text' }
  })
}));

// Mock node-telegram-bot-api
vi.mock('node-telegram-bot-api', () => ({
  default: vi.fn().mockImplementation(() => ({
    sendMessage: vi.fn().mockResolvedValue({ message_id: 123 }),
    sendPhoto: vi.fn().mockResolvedValue({ message_id: 124 }),
    on: vi.fn(),
    startPolling: vi.fn()
  }))
}));

// Ensure test data directory exists
const testDataDir = path.join(process.cwd(), 'test', 'test-data');
if (!fs.existsSync(testDataDir)) {
  fs.mkdirSync(testDataDir, { recursive: true });
}

// Global test cleanup
afterEach(() => {
  vi.clearAllMocks();
});