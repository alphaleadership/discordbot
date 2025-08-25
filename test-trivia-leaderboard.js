import FunCommandsManager from './utils/managers/FunCommandsManager.js';
import { EnhancedGuildConfig } from './utils/config/EnhancedGuildConfig.js';

// Test the trivia and leaderboard functionality
async function testTriviaAndLeaderboard() {
    console.log('Testing Trivia and Leaderboard functionality...');
    
    // Initialize enhanced guild config
    const guildConfig = new EnhancedGuildConfig();
    
    // Test guild ID
    const testGuildId = '123456789';
    
    // Initialize guild config with fun commands enabled
    guildConfig.initializeEnhancedGuild(testGuildId);
    guildConfig.setFunCommandsEnabled(testGuildId, true);
    
    // Enable trivia command specifically
    const config = guildConfig.getFunCommandsConfig(testGuildId);
    if (!config.enabledCommands.includes('trivia')) {
        config.enabledCommands.push('trivia');
        guildConfig.updateFunCommandsConfig(testGuildId, config);
    }
    
    // Create FunCommandsManager instance
    const funManager = new FunCommandsManager(guildConfig);
    
    // Mock interaction object for trivia
    const mockTriviaInteraction = {
        guild: { id: testGuildId },
        channel: { id: '987654321' },
        user: { id: 'user123' },
        options: {
            getString: (key) => null
        }
    };
    
    // Mock interaction object for leaderboard
    const mockLeaderboardInteraction = {
        guild: { id: testGuildId },
        channel: { id: '987654321' },
        user: { id: 'user123' },
        options: {
            getString: (key) => {
                if (key === 'game') return 'trivia';
                return null;
            }
        }
    };
    
    console.log('\n=== Testing Trivia Command ===');
    try {
        const triviaResponse = await funManager.executeTrivia(mockTriviaInteraction);
        console.log('Trivia Response:', triviaResponse);
    } catch (error) {
        console.error('Error testing trivia:', error);
    }
    
    console.log('\n=== Testing Score System ===');
    try {
        // Simulate answering some trivia questions
        console.log('Simulating trivia answers...');
        
        // User 1 answers correctly
        funManager.updateScore('user123', testGuildId, 'trivia', 10);
        funManager.updateScore('user123', testGuildId, 'trivia', 15);
        funManager.updateScore('user123', testGuildId, 'trivia', 0); // Wrong answer
        
        // User 2 answers
        funManager.updateScore('user456', testGuildId, 'trivia', 20);
        funManager.updateScore('user456', testGuildId, 'trivia', 10);
        
        // User 3 answers
        funManager.updateScore('user789', testGuildId, 'trivia', 25);
        
        console.log('Scores updated successfully!');
    } catch (error) {
        console.error('Error updating scores:', error);
    }
    
    console.log('\n=== Testing Leaderboard Command ===');
    try {
        const leaderboardResponse = await funManager.executeLeaderboard(mockLeaderboardInteraction);
        console.log('Leaderboard Response:', leaderboardResponse);
    } catch (error) {
        console.error('Error testing leaderboard:', error);
    }
    
    console.log('\n=== Testing User Game Stats ===');
    try {
        const user123Stats = funManager.getUserGameStats('user123', testGuildId, 'trivia');
        console.log('User123 Trivia Stats:', JSON.stringify(user123Stats, null, 2));
        
        const user456Stats = funManager.getUserGameStats('user456', testGuildId, 'trivia');
        console.log('User456 Trivia Stats:', JSON.stringify(user456Stats, null, 2));
        
        const user789Stats = funManager.getUserGameStats('user789', testGuildId, 'trivia');
        console.log('User789 Trivia Stats:', JSON.stringify(user789Stats, null, 2));
    } catch (error) {
        console.error('Error testing user stats:', error);
    }
    
    console.log('\n=== Testing Top Players ===');
    try {
        const topPlayers = funManager.getTopPlayersByGame(testGuildId, 'trivia', 5);
        console.log('Top Trivia Players:', JSON.stringify(topPlayers, null, 2));
    } catch (error) {
        console.error('Error testing top players:', error);
    }
    
    console.log('\n=== Testing Trivia Answer Processing ===');
    try {
        // Test correct answer
        const correctResult = funManager.processTriviaAnswer('user123', testGuildId, 0, 0);
        console.log('Correct Answer Result:', JSON.stringify(correctResult, null, 2));
        
        // Test incorrect answer
        const incorrectResult = funManager.processTriviaAnswer('user123', testGuildId, 0, 1);
        console.log('Incorrect Answer Result:', JSON.stringify(incorrectResult, null, 2));
    } catch (error) {
        console.error('Error testing trivia answer processing:', error);
    }
    
    console.log('\nTrivia and Leaderboard test completed!');
}

// Run the test
testTriviaAndLeaderboard().catch(console.error);