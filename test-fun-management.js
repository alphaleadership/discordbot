import FunCommandsManager from './utils/managers/FunCommandsManager.js';
import { EnhancedGuildConfig } from './utils/config/EnhancedGuildConfig.js';

// Mock WarnManager for testing
class MockWarnManager {
    constructor() {
        this.warnings = {};
    }
    
    addWarn(userId, reason, moderatorId) {
        if (!this.warnings[userId]) {
            this.warnings[userId] = [];
        }
        
        const warn = {
            id: Date.now().toString(),
            reason,
            date: new Date().toISOString(),
            moderator: moderatorId
        };
        
        this.warnings[userId].push(warn);
        
        return {
            ...warn,
            count: this.warnings[userId].length
        };
    }
    
    getWarns(userId) {
        return this.warnings[userId] || [];
    }
}

// Test the management and moderation functionality
async function testFunManagement() {
    console.log('Testing Fun Commands Management and Moderation...');
    
    // Initialize enhanced guild config
    const guildConfig = new EnhancedGuildConfig();
    const mockWarnManager = new MockWarnManager();
    
    // Test guild ID
    const testGuildId = '123456789';
    
    // Initialize guild config with fun commands enabled
    guildConfig.initializeEnhancedGuild(testGuildId);
    guildConfig.setFunCommandsEnabled(testGuildId, true);
    
    // Create FunCommandsManager instance
    const funManager = new FunCommandsManager(guildConfig);
    
    console.log('\n=== Testing Configuration Management ===');
    
    // Test configuration methods
    console.log('Initial config:', JSON.stringify(guildConfig.getFunCommandsConfig(testGuildId), null, 2));
    
    // Update cooldown
    guildConfig.updateFunCommandsConfig(testGuildId, { cooldownMs: 10000 });
    console.log('Updated cooldown to 10 seconds');
    
    // Disable a command
    const config = guildConfig.getFunCommandsConfig(testGuildId);
    config.enabledCommands = config.enabledCommands.filter(cmd => cmd !== 'meme');
    guildConfig.updateFunCommandsConfig(testGuildId, config);
    console.log('Disabled meme command');
    
    // Add disabled channel
    config.disabledChannels.push('disabled-channel-123');
    guildConfig.updateFunCommandsConfig(testGuildId, config);
    console.log('Added disabled channel');
    
    console.log('Final config:', JSON.stringify(guildConfig.getFunCommandsConfig(testGuildId), null, 2));
    
    console.log('\n=== Testing Usage Statistics ===');
    
    // Simulate usage for multiple users
    const users = ['user1', 'user2', 'user3'];
    
    users.forEach((userId, index) => {
        // Simulate different usage patterns
        for (let i = 0; i < (index + 1) * 10; i++) {
            funManager.setCooldown(userId, testGuildId, 'joke');
        }
        
        for (let i = 0; i < (index + 1) * 5; i++) {
            funManager.setCooldown(userId, testGuildId, '8ball');
        }
        
        // Add some trivia scores
        funManager.updateScore(userId, testGuildId, 'trivia', 10 * (index + 1));
        funManager.updateScore(userId, testGuildId, 'trivia', 15 * (index + 1));
    });
    
    // Get guild statistics
    const guildStats = funManager.getGuildUsageStats(testGuildId);
    console.log('Guild Statistics:', JSON.stringify(guildStats, null, 2));
    
    console.log('\n=== Testing Abuse Detection ===');
    
    // Create a user with excessive usage
    const abuseUserId = 'abuser123';
    
    // Simulate excessive usage
    for (let i = 0; i < 60; i++) {
        funManager.setCooldown(abuseUserId, testGuildId, 'joke');
    }
    
    for (let i = 0; i < 50; i++) {
        funManager.setCooldown(abuseUserId, testGuildId, '8ball');
    }
    
    // Check for abuse
    const abuseCheck = funManager.checkForAbuse(abuseUserId, testGuildId);
    console.log('Abuse Check Result:', JSON.stringify(abuseCheck, null, 2));
    
    if (abuseCheck.hasAbuse) {
        console.log('Applying moderation action...');
        const moderationResult = funManager.applyModerationAction(
            abuseUserId, 
            testGuildId, 
            mockWarnManager, 
            abuseCheck.reasons.join(', ')
        );
        console.log('Moderation Result:', JSON.stringify(moderationResult, null, 2));
        
        // Check if user is temporarily banned
        const isBanned = funManager.isUserTemporarilyBanned(abuseUserId, testGuildId);
        console.log('User temporarily banned:', isBanned);
        
        if (isBanned) {
            const remainingTime = funManager.getRemainingBanTime(abuseUserId, testGuildId);
            console.log('Remaining ban time (seconds):', remainingTime);
        }
    }
    
    console.log('\n=== Testing Enhanced Cooldown System ===');
    
    // Mock interaction for testing
    const mockInteraction = {
        guild: { id: testGuildId },
        channel: { id: '987654321' },
        user: { id: abuseUserId },
        options: {
            getString: () => null
        }
    };
    
    // Test command execution with abuse detection
    console.log('Testing joke command with abusive user...');
    const jokeResponse = await funManager.executeJoke(mockInteraction, mockWarnManager);
    console.log('Joke Response:', jokeResponse);
    
    // Test with normal user
    const normalUser = {
        guild: { id: testGuildId },
        channel: { id: '987654321' },
        user: { id: 'normaluser123' },
        options: {
            getString: () => null
        }
    };
    
    console.log('Testing joke command with normal user...');
    const normalJokeResponse = await funManager.executeJoke(normalUser, mockWarnManager);
    console.log('Normal Joke Response:', normalJokeResponse);
    
    console.log('\n=== Testing Channel Restrictions ===');
    
    // Test disabled channel
    const disabledChannelUser = {
        guild: { id: testGuildId },
        channel: { id: 'disabled-channel-123' },
        user: { id: 'normaluser123' },
        options: {
            getString: () => null
        }
    };
    
    console.log('Testing joke command in disabled channel...');
    const disabledChannelResponse = await funManager.executeJoke(disabledChannelUser, mockWarnManager);
    console.log('Disabled Channel Response:', disabledChannelResponse);
    
    console.log('\n=== Testing Command Restrictions ===');
    
    // Test disabled command (meme was disabled earlier)
    console.log('Testing disabled meme command...');
    const memeResponse = await funManager.executeMeme(normalUser, mockWarnManager);
    console.log('Meme Response:', memeResponse);
    
    console.log('\n=== Testing User Statistics ===');
    
    users.forEach(userId => {
        const userStats = funManager.getUserStats(userId, testGuildId);
        console.log(`Stats for ${userId}:`, JSON.stringify(userStats, null, 2));
    });
    
    console.log('\n=== Testing Top Players ===');
    
    const topPlayers = funManager.getTopPlayersByGame(testGuildId, 'trivia', 5);
    console.log('Top Trivia Players:', JSON.stringify(topPlayers, null, 2));
    
    console.log('\nFun Commands Management and Moderation test completed!');
}

// Run the test
testFunManagement().catch(console.error);