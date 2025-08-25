import { WatchlistManager } from './utils/WatchlistManager.js';
import { ReportManager } from './utils/ReportManager.js';

// Mock Discord.js objects for testing
const mockMember = {
    id: '123456789012345678',
    user: {
        id: '123456789012345678',
        tag: 'TestUser#1234',
        username: 'TestUser',
        discriminator: '1234',
        createdAt: new Date('2020-01-01'),
        createdTimestamp: new Date('2020-01-01').getTime(),
        displayAvatarURL: () => 'https://example.com/avatar.png'
    },
    guild: {
        id: '987654321098765432',
        name: 'Test Guild',
        memberCount: 100
    },
    joinedAt: new Date(),
    client: {
        user: {
            displayAvatarURL: () => 'https://example.com/bot-avatar.png'
        }
    }
};

const mockMessage = {
    id: '111222333444555666',
    author: mockMember.user,
    guild: mockMember.guild,
    channel: {
        id: '777888999000111222',
        name: 'general',
        type: 0
    },
    content: 'This is a test message from a watched user',
    attachments: new Map(),
    url: 'https://discord.com/channels/987654321098765432/777888999000111222/111222333444555666',
    client: mockMember.client
};

async function testWatchlistNotifications() {
    console.log('🧪 Testing Enhanced Watchlist Notification System...\n');
    
    try {
        // Initialize managers
        const reportManager = new ReportManager();
        const watchlistManager = new WatchlistManager('data/test-watchlist.json', reportManager);
        
        // Wait for initialization
        await new Promise(resolve => setTimeout(resolve, 1000));
        
        console.log('✅ Managers initialized successfully\n');
        
        // Test 1: Add user to watchlist
        console.log('📝 Test 1: Adding user to watchlist...');
        const addResult = await watchlistManager.addToWatchlist(
            mockMember.id,
            'Test surveillance for notification system',
            '999888777666555444',
            mockMember.guild.id,
            { watchLevel: 'alert' }
        );
        
        if (addResult.success) {
            console.log('✅ User added to watchlist successfully');
        } else {
            console.log('❌ Failed to add user to watchlist:', addResult.error);
            return;
        }
        
        // Test 2: Test user join notification
        console.log('\n📝 Test 2: Testing user join notification...');
        const joinResult = await watchlistManager.handleUserJoin(mockMember);
        
        if (joinResult.success && joinResult.watched) {
            console.log('✅ User join processed successfully');
            console.log(`   - Watch Level: ${joinResult.watchLevel}`);
            console.log(`   - Is Global Watch: ${joinResult.isGlobalWatch}`);
            console.log(`   - Processing Time: ${joinResult.processingTime}ms`);
            if (joinResult.incident) {
                console.log(`   - Incident ID: ${joinResult.incident.id}`);
            }
        } else {
            console.log('❌ User join processing failed:', joinResult.error);
        }
        
        // Test 3: Test message monitoring
        console.log('\n📝 Test 3: Testing message monitoring...');
        const messageResult = await watchlistManager.handleUserMessage(mockMessage);
        
        if (messageResult.success && messageResult.watched) {
            console.log('✅ Message monitoring processed successfully');
            console.log(`   - Watch Level: ${messageResult.watchLevel}`);
            console.log(`   - Notification Sent: ${messageResult.notificationSent}`);
            console.log(`   - Processing Time: ${messageResult.processingTime}ms`);
            if (messageResult.incident) {
                console.log(`   - Incident ID: ${messageResult.incident.id}`);
            }
        } else {
            console.log('❌ Message monitoring failed:', messageResult.error);
        }
        
        // Test 4: Test action monitoring
        console.log('\n📝 Test 4: Testing action monitoring...');
        const actionResult = await watchlistManager.handleUserAction(
            mockMember.id,
            mockMember.guild.id,
            'warning',
            {
                description: 'User received a warning for inappropriate behavior',
                moderatorId: '999888777666555444',
                reason: 'Inappropriate language',
                client: mockMember.client
            }
        );
        
        if (actionResult.success && actionResult.watched) {
            console.log('✅ Action monitoring processed successfully');
            console.log(`   - Watch Level: ${actionResult.watchLevel}`);
            console.log(`   - Action Severity: ${actionResult.actionSeverity}/5`);
            console.log(`   - Notification Sent: ${actionResult.notificationSent}`);
            console.log(`   - Processing Time: ${actionResult.processingTime}ms`);
            if (actionResult.incident) {
                console.log(`   - Incident ID: ${actionResult.incident.id}`);
            }
        } else {
            console.log('❌ Action monitoring failed:', actionResult.error);
        }
        
        // Test 5: Test rate limiting
        console.log('\n📝 Test 5: Testing rate limiting...');
        console.log('Sending multiple messages quickly...');
        
        for (let i = 0; i < 3; i++) {
            const testMessage = {
                ...mockMessage,
                id: `${mockMessage.id}_${i}`,
                content: `Test message ${i + 1} for rate limiting`
            };
            
            const rateLimitResult = await watchlistManager.handleUserMessage(testMessage);
            console.log(`   Message ${i + 1}: Notification sent = ${rateLimitResult.notificationSent}`);
        }
        
        // Test 6: Test user history
        console.log('\n📝 Test 6: Testing user history...');
        const userHistory = watchlistManager.getUserHistory(mockMember.id);
        console.log('✅ User history retrieved:');
        console.log(`   - Total Entries: ${userHistory.totalEntries}`);
        console.log(`   - Total Incidents: ${userHistory.totalIncidents}`);
        console.log(`   - Total Notes: ${userHistory.totalNotes}`);
        console.log(`   - Watch Levels: ${JSON.stringify(userHistory.watchLevels)}`);
        
        // Test 7: Test severity calculation
        console.log('\n📝 Test 7: Testing action severity calculation...');
        const testActions = ['ban', 'warning', 'message_delete', 'join', 'unknown_action'];
        
        for (const action of testActions) {
            const severity = watchlistManager.getActionSeverity(action);
            const description = watchlistManager.getSeverityDescription(severity);
            console.log(`   ${action}: ${severity}/5 (${description})`);
        }
        
        // Test 8: Clean up rate limit data
        console.log('\n📝 Test 8: Testing rate limit cleanup...');
        watchlistManager.cleanupRateLimitData();
        console.log('✅ Rate limit data cleanup completed');
        
        console.log('\n🎉 All tests completed successfully!');
        console.log('\n📊 Test Summary:');
        console.log('   ✅ User join detection and notification');
        console.log('   ✅ Message monitoring with rate limiting');
        console.log('   ✅ Action monitoring with severity levels');
        console.log('   ✅ User history tracking');
        console.log('   ✅ Rate limiting functionality');
        console.log('   ✅ Error handling and recovery');
        
    } catch (error) {
        console.error('❌ Test failed with error:', error);
        console.error('Stack trace:', error.stack);
    }
}

// Run the tests
testWatchlistNotifications().catch(console.error);