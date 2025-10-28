import { vi } from 'vitest';
import fs from 'fs';
import path from 'path';

/**
 * Test helper utilities for Discord bot testing
 */

/**
 * Creates a mock Discord client with default configuration
 * @param {Object} options - Client configuration options
 * @returns {MockClient} Configured mock Discord client
 */
export async function createMockClient(options = {}) {
  const { MockClient } = await import('../mocks/discord.js');
  const client = new MockClient(options);
  
  // Auto-login for convenience
  if (options.autoLogin !== false) {
    await client.login('mock_token');
  }
  
  return client;
}

/**
 * Creates a mock guild with common test configuration
 * @param {MockClient} client - Mock Discord client
 * @param {Object} overrides - Guild property overrides
 * @returns {MockGuild} Configured mock guild
 */
export async function createMockGuild(client, overrides = {}) {
  const { MockGuild, MockTextChannel, MockRole, MockGuildMember } = await import('../mocks/discord.js');
  
  const guild = new MockGuild(client, {
    id: '123456789012345678',
    name: 'Test Guild',
    memberCount: 100,
    ...overrides
  });
  
  // Add common channels
  const generalChannel = new MockTextChannel(guild, {
    id: '111111111111111111',
    name: 'general'
  });
  const modLogChannel = new MockTextChannel(guild, {
    id: '222222222222222222', 
    name: 'mod-log'
  });
  
  guild.channels.cache.set(generalChannel.id, generalChannel);
  guild.channels.cache.set(modLogChannel.id, modLogChannel);
  
  // Add common roles
  const moderatorRole = new MockRole(guild, {
    id: '333333333333333333',
    name: 'Moderator',
    permissions: ['BanMembers', 'KickMembers', 'ManageMessages']
  });
  
  guild.roles.cache.set(moderatorRole.id, moderatorRole);
  
  // Add to client
  client.guilds.set(guild.id, guild);
  
  return guild;
}

/**
 * Creates a mock user with optional guild member
 * @param {Object} userOptions - User configuration
 * @param {MockGuild} guild - Guild to create member in (optional)
 * @param {Object} memberOptions - Member configuration
 * @returns {Object} { user, member? }
 */
export async function createMockUser(userOptions = {}, guild = null, memberOptions = {}) {
  const { MockUser, MockGuildMember } = await import('../mocks/discord.js');
  
  const user = new MockUser({
    id: '987654321098765432',
    username: 'testuser',
    discriminator: '0001',
    ...userOptions
  });
  
  let member = null;
  if (guild) {
    member = new MockGuildMember(guild, user, memberOptions);
    guild.members.cache.set(user.id, member);
  }
  
  return { user, member };
}

/**
 * Creates a mock interaction for command testing
 * @param {Object} options - Interaction configuration
 * @returns {MockInteraction} Configured mock interaction
 */
export async function createMockInteraction(options = {}) {
  const { MockInteraction } = await import('../mocks/discord.js');
  
  const { user } = await createMockUser(options.user);
  const guild = options.guild || await createMockGuild(await createMockClient());
  const channel = guild.channels.cache.first();
  
  return new MockInteraction({
    commandName: 'test',
    user,
    guild,
    channel,
    member: guild.members.cache.get(user.id),
    options: options.options || [],
    ...options
  });
}

/**
 * Creates temporary test data files
 * @param {string} filename - File name
 * @param {Object} data - Data to write
 * @returns {string} File path
 */
export function createTempTestFile(filename, data) {
  const testDataDir = path.join(process.cwd(), 'test', 'test-data');
  const filepath = path.join(testDataDir, `${filename}.tmp`);
  
  fs.writeFileSync(filepath, JSON.stringify(data, null, 2));
  return filepath;
}

/**
 * Loads test fixture data
 * @param {string} fixtureName - Name of fixture file
 * @returns {Object} Parsed fixture data
 */
export function loadTestFixture(fixtureName) {
  const fixturePath = path.join(process.cwd(), 'test', 'fixtures', `${fixtureName}.json`);
  
  if (!fs.existsSync(fixturePath)) {
    throw new Error(`Test fixture not found: ${fixtureName}`);
  }
  
  return JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
}

/**
 * Mocks file system operations for a specific path
 * @param {string} filePath - Path to mock
 * @param {Object} mockData - Data to return
 * @returns {Object} Mock functions
 */
export function mockFileSystem(filePath, mockData = {}) {
  const mocks = {
    existsSync: vi.fn(),
    readFileSync: vi.fn(),
    writeFileSync: vi.fn(),
    mkdirSync: vi.fn(),
    unlinkSync: vi.fn(),
    readdirSync: vi.fn(),
    statSync: vi.fn()
  };
  
  // Setup default behaviors
  mocks.existsSync.mockImplementation((path) => {
    return path === filePath || mockData.exists === true;
  });
  
  mocks.readFileSync.mockImplementation((path) => {
    if (path === filePath) {
      return JSON.stringify(mockData.content || {});
    }
    throw new Error(`File not found: ${path}`);
  });
  
  mocks.writeFileSync.mockImplementation(() => {
    // Mock successful write
  });
  
  mocks.mkdirSync.mockImplementation(() => {
    // Mock successful directory creation
  });
  
  mocks.readdirSync.mockImplementation(() => {
    return mockData.files || [];
  });
  
  mocks.statSync.mockImplementation(() => ({
    size: mockData.size || 1024,
    mtime: mockData.mtime || new Date(),
    isFile: () => true,
    isDirectory: () => false
  }));
  
  // Apply mocks to fs module
  vi.doMock('fs', () => mocks);
  
  return mocks;
}

/**
 * Creates a mock manager instance with common methods
 * @param {string} managerName - Name of the manager
 * @param {Object} methods - Additional methods to mock
 * @returns {Object} Mock manager instance
 */
export function createMockManager(managerName, methods = {}) {
  const baseMethods = {
    // Common manager methods
    initialize: vi.fn().mockResolvedValue(),
    cleanup: vi.fn().mockResolvedValue(),
    getConfig: vi.fn().mockReturnValue({}),
    setConfig: vi.fn().mockResolvedValue(),
    validateConfig: vi.fn().mockReturnValue(true),
    
    // Data persistence methods
    loadData: vi.fn().mockResolvedValue({}),
    saveData: vi.fn().mockResolvedValue(),
    backupData: vi.fn().mockResolvedValue(),
    
    // Event methods
    on: vi.fn(),
    emit: vi.fn(),
    removeListener: vi.fn()
  };
  
  return {
    name: managerName,
    ...baseMethods,
    ...methods
  };
}

/**
 * Waits for an event to be emitted
 * @param {EventEmitter} emitter - Event emitter
 * @param {string} event - Event name
 * @param {number} timeout - Timeout in milliseconds
 * @returns {Promise} Promise that resolves with event data
 */
export function waitForEvent(emitter, event, timeout = 5000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Event '${event}' not emitted within ${timeout}ms`));
    }, timeout);
    
    emitter.once(event, (...args) => {
      clearTimeout(timer);
      resolve(args);
    });
  });
}

/**
 * Simulates Discord API rate limiting
 * @param {Function} fn - Function to rate limit
 * @param {number} delay - Delay in milliseconds
 * @returns {Function} Rate limited function
 */
export function simulateRateLimit(fn, delay = 1000) {
  let lastCall = 0;
  
  return async (...args) => {
    const now = Date.now();
    const timeSinceLastCall = now - lastCall;
    
    if (timeSinceLastCall < delay) {
      await new Promise(resolve => setTimeout(resolve, delay - timeSinceLastCall));
    }
    
    lastCall = Date.now();
    return fn(...args);
  };
}

/**
 * Creates a mock command for testing
 * @param {Object} options - Command configuration
 * @returns {Object} Mock command object
 */
export function createMockCommand(options = {}) {
  return {
    data: {
      name: options.name || 'test-command',
      description: options.description || 'Test command',
      options: options.options || []
    },
    execute: vi.fn().mockResolvedValue(),
    ...options
  };
}

/**
 * Asserts that a Discord embed matches expected structure
 * @param {Object} embed - Embed object to test
 * @param {Object} expected - Expected embed properties
 */
export function assertEmbedMatches(embed, expected) {
  if (expected.title) {
    expect(embed.title || embed.data?.title).toBe(expected.title);
  }
  
  if (expected.description) {
    expect(embed.description || embed.data?.description).toBe(expected.description);
  }
  
  if (expected.color) {
    expect(embed.color || embed.data?.color).toBe(expected.color);
  }
  
  if (expected.fields) {
    const embedFields = embed.fields || embed.data?.fields || [];
    expect(embedFields).toHaveLength(expected.fields.length);
    
    expected.fields.forEach((expectedField, index) => {
      const actualField = embedFields[index];
      expect(actualField.name).toBe(expectedField.name);
      expect(actualField.value).toBe(expectedField.value);
      if (expectedField.inline !== undefined) {
        expect(actualField.inline).toBe(expectedField.inline);
      }
    });
  }
}

/**
 * Creates a test environment with common setup
 * @param {Object} options - Environment configuration
 * @returns {Object} Test environment objects
 */
export async function createTestEnvironment(options = {}) {
  const client = await createMockClient(options.client);
  const guild = await createMockGuild(client, options.guild);
  const { user, member } = await createMockUser(options.user, guild, options.member);
  const interaction = await createMockInteraction({
    user,
    guild,
    member,
    ...options.interaction
  });
  
  return {
    client,
    guild,
    user,
    member,
    interaction,
    channel: guild.channels.cache.first()
  };
}

/**
 * Validates that required permissions are checked
 * @param {Function} commandExecute - Command execute function
 * @param {Array} requiredPermissions - Required permissions
 * @param {Object} testEnv - Test environment
 */
export async function testPermissionValidation(commandExecute, requiredPermissions, testEnv) {
  // Test with insufficient permissions
  testEnv.member.permissions = new (await import('../mocks/discord.js')).MockPermissions(0n);
  
  await expect(commandExecute(testEnv.interaction)).rejects.toThrow();
  
  // Test with sufficient permissions
  const { MockPermissions } = await import('../mocks/discord.js');
  let permissionBits = 0n;
  
  for (const permission of requiredPermissions) {
    permissionBits |= MockPermissions.FLAGS[permission];
  }
  
  testEnv.member.permissions = new MockPermissions(permissionBits);
  
  await expect(commandExecute(testEnv.interaction)).resolves.not.toThrow();
}