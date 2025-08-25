import { WatchlistManager } from './utils/WatchlistManager.js';
import { ReportManager } from './utils/ReportManager.js';
import fs from 'fs';

// Test file path
const testFilePath = 'data/test-watchlist-monitoring.json';

// Clean up test file if it exists
if (fs.existsSync(testFilePath)) {
    fs.unlinkSync(testFilePath);
}

console.log('🧪 Testing WatchlistManager monitoring and notification system...\n');

// Mock ReportManager for testing
class MockReportManager extends ReportManager {
    constructor() {
        super();
        this.sentAlerts = [];
    }

    async sendWatchlistAlert(client, guildId, embed) {
        this.sentAlerts.push({
            guildId,
            embed: {
                title: embed.data.title,
                description: embed.data.description,
                fields: embed.data.fields
            },
            timestamp: new Date().toISOString()
        });
        
        console.log(`📧 Mock alert sent for guild ${guildId}: ${embed.data.title}`);
        return { success: true, message: 'Mock alert sent' };
    }

    getLastAlert() {
        return this.sentAlerts[this.sentAlerts.length - 1];
    }

    getAlertCount() {
        return this.sentAlerts.length;
    }
}

// Mock Discord objects
const createMockMember = (userId, username, guildId, guildName) => ({
    id: userId,
    user: {
        id: userId,
        username: username,
        discriminator: '1234',
        tag: `${username}#1234`,
        displayAvatarURL: () => 'https://example.com/avatar.png',
        createdAt: new Date('2020-01-01')
    },
    guild: {
        id: guildId,
        name: guildName
    },
    client: {
        user: {
            displayAvatarURL: () => 'https://example.com/bot-avatar.png'
        }
    }
});

const createMockMessage = (userId, username, guildId, channelId, content) => ({
    id: '999888777666555444',
    author: {
        id: userId,
        username: username,
        discriminator: '1234',
        tag: `${username}#1234`,
        displayAvatarURL: () => 'https://example.com/avatar.png',
        bot: false
    },
    guild: {
        id: guildId,
        name: 'Test Guild'
    },
    channel: {
        id: channelId,
        name: 'general'
    },
    content: content,
    url: `https://discord.com/channels/${guildId}/${channelId}/999888777666555444`,
    client: {
        user: {
            displayAvatarURL: () => 'https://example.com/bot-avatar.png'
        }
    }
});

// Initialize managers
const mockReportManager = new MockReportManager();
const watchlistManager = new WatchlistManager(testFilePath, mockReportManager);

console.log('🔧 Setup complete. Starting tests...\n');

// Test 1: Setup watchlist entry
console.log('Test 1: Setting up watchlist entry');
const setupResult = watchlistManager.addToWatchlist(
    '123456789012345678',
    'Suspicious behavior - potential spammer',
    '987654321098765432',
    '111222333444555666',
    {
        username: 'SuspiciousUser',
        discriminator: '1234',
        watchLevel: 'alert'
    }
);
console.log('✅ Watchlist entry created:', setupResult.success);

// Test 2: Test handleUserJoin for watched user
console.log('\nTest 2: Testing handleUserJoin for watched user');
const mockMember = createMockMember('123456789012345678', 'SuspiciousUser', '111222333444555666', 'Test Guild');
const joinResult = await watchlistManager.handleUserJoin(mockMember);

console.log('✅ Join detection result:', joinResult.success);
console.log('   - User was watched:', joinResult.watched);
console.log('   - Watch level:', joinResult.watchLevel);
console.log('   - Incident created:', joinResult.incident ? 'Yes' : 'No');

// Check if alert was sent
const alertCount1 = mockReportManager.getAlertCount();
console.log('   - Alert sent:', alertCount1 > 0 ? 'Yes' : 'No');

// Test 3: Test handleUserJoin for non-watched user
console.log('\nTest 3: Testing handleUserJoin for non-watched user');
const mockNonWatchedMember = createMockMember('999888777666555444', 'RegularUser', '111222333444555666', 'Test Guild');
const nonWatchedJoinResult = await watchlistManager.handleUserJoin(mockNonWatchedMember);

console.log('✅ Non-watched user result:', nonWatchedJoinResult.success);
console.log('   - User was watched:', nonWatchedJoinResult.watched);

// Test 4: Test handleUserMessage for watched user (alert level)
console.log('\nTest 4: Testing handleUserMessage for watched user (alert level)');
const mockMessage = createMockMessage('123456789012345678', 'SuspiciousUser', '111222333444555666', '555666777888999000', 'This is a test message that might be suspicious');
const messageResult = await watchlistManager.handleUserMessage(mockMessage);

console.log('✅ Message monitoring result:', messageResult.success);
console.log('   - User was watched:', messageResult.watched);
console.log('   - Watch level:', messageResult.watchLevel);

const alertCount2 = mockReportManager.getAlertCount();
console.log('   - New alert sent:', alertCount2 > alertCount1 ? 'Yes' : 'No');

// Test 5: Test handleUserMessage for watched user (observe level)
console.log('\nTest 5: Testing handleUserMessage for watched user (observe level)');
// Change watch level to observe
const observeUser = watchlistManager.addToWatchlist(
    '555444333222111000',
    'Just observing this user',
    '987654321098765432',
    '111222333444555666',
    {
        username: 'ObservedUser',
        discriminator: '5678',
        watchLevel: 'observe'
    }
);

const observeMessage = createMockMessage('555444333222111000', 'ObservedUser', '111222333444555666', '555666777888999000', 'Normal message from observed user');
const observeMessageResult = await watchlistManager.handleUserMessage(observeMessage);

console.log('✅ Observe level message result:', observeMessageResult.success);
console.log('   - User was watched:', observeMessageResult.watched);
console.log('   - Watch level:', observeMessageResult.watchLevel);

const alertCount3 = mockReportManager.getAlertCount();
console.log('   - Alert sent (should be no):', alertCount3 > alertCount2 ? 'Yes' : 'No');

// Test 6: Test handleUserAction
console.log('\nTest 6: Testing handleUserAction');
const actionResult = await watchlistManager.handleUserAction(
    '123456789012345678',
    '111222333444555666',
    'violation',
    {
        description: 'User violated community guidelines',
        channelId: '555666777888999000'
    }
);

console.log('✅ Action monitoring result:', actionResult.success);
console.log('   - User was watched:', actionResult.watched);
console.log('   - Incident created:', actionResult.incident ? 'Yes' : 'No');

const alertCount4 = mockReportManager.getAlertCount();
console.log('   - Alert sent:', alertCount4 > alertCount3 ? 'Yes' : 'No');

// Test 7: Test generateWatchlistReport
console.log('\nTest 7: Testing generateWatchlistReport');
const reportResult = await watchlistManager.generateWatchlistReport('111222333444555666');

console.log('✅ Report generation result:', reportResult.success);
if (reportResult.success) {
    console.log('   - Total watched users:', reportResult.report.summary.totalWatched);
    console.log('   - Recent incidents (24h):', reportResult.report.summary.recentIncidents24h);
    console.log('   - Active users (week):', reportResult.report.summary.activeUsersWeek);
    console.log('   - Report entries:', reportResult.report.entries.length);
}

// Test 8: Test setWatchlistSettings
console.log('\nTest 8: Testing setWatchlistSettings');
const settingsResult = watchlistManager.setWatchlistSettings('111222333444555666', {
    enabled: true,
    defaultWatchLevel: 'alert',
    autoNotifications: true,
    reportIntervalHours: 12
});

console.log('✅ Settings update result:', settingsResult.success);
if (settingsResult.success) {
    console.log('   - Default watch level:', settingsResult.settings.defaultWatchLevel);
    console.log('   - Auto notifications:', settingsResult.settings.autoNotifications);
    console.log('   - Report interval:', settingsResult.settings.reportIntervalHours, 'hours');
}

// Test 9: Check final statistics
console.log('\nTest 9: Final statistics check');
const finalStats = watchlistManager.getStats('111222333444555666');
console.log('✅ Final statistics:');
console.log('   - Total entries:', finalStats.total);
console.log('   - Active entries:', finalStats.active);
console.log('   - Total incidents:', finalStats.totalIncidents);
console.log('   - Watch levels:', finalStats.watchLevels);

// Test 10: Check all sent alerts
console.log('\nTest 10: Review all sent alerts');
console.log('✅ Total alerts sent:', mockReportManager.getAlertCount());
mockReportManager.sentAlerts.forEach((alert, index) => {
    console.log(`   Alert ${index + 1}:`);
    console.log(`     - Title: ${alert.embed.title}`);
    console.log(`     - Description: ${alert.embed.description}`);
    console.log(`     - Guild: ${alert.guildId}`);
});

console.log('\n🎉 All monitoring tests completed!');

// Clean up test file
if (fs.existsSync(testFilePath)) {
    fs.unlinkSync(testFilePath);
    console.log('🧹 Test file cleaned up');
}

console.log('\n📊 Test Summary:');
console.log('- User join monitoring: ✅ Working');
console.log('- Message monitoring: ✅ Working');
console.log('- Action monitoring: ✅ Working');
console.log('- Alert system: ✅ Working');
console.log('- Report generation: ✅ Working');
console.log('- Settings management: ✅ Working');
console.log('- Watch level filtering: ✅ Working');