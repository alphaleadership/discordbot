import FunCommandsManager from './utils/managers/FunCommandsManager.js';
import { EnhancedGuildConfig } from './utils/config/EnhancedGuildConfig.js';

// Test the FunCommandsManager
async function testFunCommandsManager() {
    console.log('Testing FunCommandsManager...');
    
    // Initialize enhanced guild config
    const guildConfig = new EnhancedGuildConfig();
    
    // Test guild ID
    const testGuildId = '123456789';
    
    // Initialize guild config with fun commands enabled
    guildConfig.initializeEnhancedGuild(testGuildId);
    guildConfig.setFunCommandsEnabled(testGuildId, true);
    
    // Create FunCommandsManager instance
    const funManager = new FunCommandsManager(guildConfig);
    
    // Mock interaction object
    const mockInteraction = {
        guild: { id: testGuildId },
        channel: { id: '987654321' },
        user: { id: 'user123' },
        options: {
            getString: (key) => {
                if (key === 'question') return 'Will this test work?';
                return null;
            }
        }
    };
    
    console.log('\n=== Testing Joke Command ===');
    try {
        const jokeResponse = await funManager.executeJoke(mockInteraction);
        console.log('Joke Response:', jokeResponse);
    } catch (error) {
        console.error('Error testing joke:', error);
    }
    
    console.log('\n=== Testing 8Ball Command ===');
    try {
        const ballResponse = await funManager.execute8Ball(mockInteraction);
        console.log('8Ball Response:', ballResponse);
    } catch (error) {
        console.error('Error testing 8ball:', error);
    }
    
    console.log('\n=== Testing Meme Command ===');
    try {
        const memeResponse = await funManager.executeMeme(mockInteraction);
        console.log('Meme Response:', memeResponse);
    } catch (error) {
        console.error('Error testing meme:', error);
    }
    
    console.log('\n=== Testing Cooldown System ===');
    try {
        // Test cooldown immediately after first use
        const cooldownResponse = await funManager.executeJoke(mockInteraction);
        console.log('Cooldown Response:', cooldownResponse);
    } catch (error) {
        console.error('Error testing cooldown:', error);
    }
    
    console.log('\n=== Testing Configuration ===');
    const config = guildConfig.getFunCommandsConfig(testGuildId);
    console.log('Fun Commands Config:', JSON.stringify(config, null, 2));
    
    console.log('\n=== Testing Usage Statistics ===');
    const userStats = funManager.getUserStats('user123', testGuildId);
    console.log('User Stats:', JSON.stringify(userStats, null, 2));
    
    const topUsers = funManager.getTopUsers(testGuildId);
    console.log('Top Users:', JSON.stringify(topUsers, null, 2));
    
    console.log('\nFunCommandsManager test completed!');
}

// Run the test
testFunCommandsManager().catch(console.error);