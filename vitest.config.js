import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['test/**/*.test.js'],
    exclude: ['node_modules/**', 'dist/**'],
    testTimeout: 30000, // Increased for performance tests
    setupFiles: ['./test/setup.js'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      exclude: [
        'node_modules/**',
        'test/**',
        'coverage/**',
        '*.config.js',
        'public/**',
        'backup-to-github.js',
        'eng.traineddata',
        'WeakSignalFinder/**'
      ],
      thresholds: {
        global: {
          branches: 80,
          functions: 80,
          lines: 80,
          statements: 80
        },
        // Higher thresholds for critical components
        'utils/DMTicketManager.js': {
          branches: 85,
          functions: 90,
          lines: 85,
          statements: 85
        },
        'utils/EconomyManager.js': {
          branches: 85,
          functions: 90,
          lines: 85,
          statements: 85
        },
        'utils/ForumReportManager.js': {
          branches: 80,
          functions: 85,
          lines: 80,
          statements: 80
        },
        'utils/AutoConfigManager.js': {
          branches: 80,
          functions: 85,
          lines: 80,
          statements: 80
        }
      }
    },
    pool: 'threads',
    poolOptions: {
      threads: {
        singleThread: true
      }
    },
    // Performance test configuration
    benchmark: {
      include: ['test/performance/**/*.test.js'],
      exclude: ['node_modules/**'],
      reporters: ['verbose']
    }
  }
});