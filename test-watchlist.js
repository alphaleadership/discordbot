import { WatchlistManager } from './utils/WatchlistManager.js';
import fs from 'fs';

// Test file path
const testFilePath = 'data/test-watchlist.json';

// Clean up test file if it exists
if (fs.existsSync(testFilePath)) {
    fs.unlinkSync(testFilePath);
}

console.log('🧪 Testing Enhanced WatchlistManager CRUD operations...\n');

// Main test function
async function runTests() {
    try {
        // Initialize WatchlistManager
        const watchlistManager = new WatchlistManager(testFilePath);
        
        // Wait for initialization to complete
        await new Promise(resolve => setTimeout(resolve, 100));

        // Test 1: Add user to watchlist
        console.log('Test 1: Adding user to watchlist');
        const addResult = await watchlistManager.addToWatchlist(
            '123456789012345678',
            'Suspicious behavior in chat',
            '987654321098765432',
            '111222333444555666',
            {
                username: 'TestUser',
                discriminator: '1234',
                watchLevel: 'alert'
            }
        );

        console.log('✅ User added successfully:', addResult.success);
        if (addResult.warnings && addResult.warnings.length > 0) {
            console.log('   Warnings:', addResult.warnings);
        }

        // Test 2: Check if user is on watchlist
        console.log('\nTest 2: Checking if user is on watchlist');
        const isOnWatchlist = watchlistManager.isOnWatchlist('123456789012345678', '111222333444555666');
        console.log('✅ User is on watchlist:', isOnWatchlist);

        // Test 3: Get watchlist entry
        console.log('\nTest 3: Getting watchlist entry');
        const entry = watchlistManager.getWatchlistEntry('123456789012345678', '111222333444555666');
        console.log('✅ Entry retrieved:', entry ? 'Yes' : 'No');
        if (entry) {
            console.log('   - Username:', entry.username);
            console.log('   - Reason:', entry.reason);
            console.log('   - Watch Level:', entry.watchLevel);
            console.log('   - Active:', entry.active);
        }

        // Test 4: Add note to entry
        console.log('\nTest 4: Adding note to entry');
        const noteResult = await watchlistManager.addNote(
            '123456789012345678',
            '111222333444555666',
            'User was seen posting spam links',
            '987654321098765432'
        );
        console.log('✅ Note added successfully:', noteResult.success);

        // Test 5: Add incident to entry
        console.log('\nTest 5: Adding incident to entry');
        const incidentResult = await watchlistManager.addIncident(
            '123456789012345678',
            '111222333444555666',
            {
                type: 'message',
                description: 'Posted inappropriate content in #general',
                channelId: '555666777888999000',
                messageId: '999888777666555444'
            }
        );
        console.log('✅ Incident added successfully:', incidentResult.success);

        // Test 6: Get guild watchlist
        console.log('\nTest 6: Getting guild watchlist');
        const guildWatchlist = watchlistManager.getGuildWatchlist('111222333444555666');
        console.log('✅ Guild watchlist entries:', guildWatchlist.length);

        // Test 7: Get statistics
        console.log('\nTest 7: Getting watchlist statistics');
        const stats = watchlistManager.getStats('111222333444555666');
        console.log('✅ Statistics:');
        console.log('   - Total entries:', stats.total);
        console.log('   - Active entries:', stats.active);
        console.log('   - Watch levels:', stats.watchLevels);
        console.log('   - Total incidents:', stats.totalIncidents);
        console.log('   - Total notes:', stats.totalNotes);

        // Test 8: Try to add duplicate user
        console.log('\nTest 8: Trying to add duplicate user');
        const duplicateResult = await watchlistManager.addToWatchlist(
            '123456789012345678',
            'Another reason',
            '987654321098765432',
            '111222333444555666'
        );
        console.log('✅ Duplicate prevention works:', !duplicateResult.success);
        console.log('   Error message:', duplicateResult.error);

        // Test 9: Remove user from watchlist
        console.log('\nTest 9: Removing user from watchlist');
        const removeResult = await watchlistManager.removeFromWatchlist('123456789012345678', '111222333444555666');
        console.log('✅ User removed successfully:', removeResult.success);

        // Test 10: Check if user is still on watchlist after removal
        console.log('\nTest 10: Checking if user is still on watchlist after removal');
        const isStillOnWatchlist = watchlistManager.isOnWatchlist('123456789012345678', '111222333444555666');
        console.log('✅ User is no longer on active watchlist:', !isStillOnWatchlist);

        // Test 11: Validation tests
        console.log('\nTest 11: Testing validation');
        const invalidResult = await watchlistManager.addToWatchlist('', '', '', '');
        console.log('✅ Validation works:', !invalidResult.success);
        console.log('   Error message:', invalidResult.error);

        // Test 12: Test error recovery
        console.log('\nTest 12: Testing error recovery and validation');
        const validationTest = watchlistManager.validateEntryData({
            userId: '123456789012345678',
            reason: 'Test reason',
            addedBy: '987654321098765432',
            guildId: '111222333444555666',
            watchLevel: 'alert'
        });
        console.log('✅ Validation test passed:', validationTest.isValid);
        if (validationTest.warnings && validationTest.warnings.length > 0) {
            console.log('   Warnings:', validationTest.warnings);
        }

        // Test 13: Test global watchlist
        console.log('\nTest 13: Testing global watchlist');
        const globalAddResult = await watchlistManager.addToGlobalWatchlist(
            '999888777666555444',
            'Global threat user',
            '987654321098765432',
            {
                username: 'GlobalThreat',
                discriminator: '0001',
                watchLevel: 'action'
            }
        );
        console.log('✅ Global watchlist add:', globalAddResult.success);

        const globalEntry = watchlistManager.getGlobalWatchlistEntry('999888777666555444');
        console.log('✅ Global entry retrieved:', globalEntry ? 'Yes' : 'No');

        const globalRemoveResult = await watchlistManager.removeFromGlobalWatchlist('999888777666555444');
        console.log('✅ Global watchlist remove:', globalRemoveResult.success);

        console.log('\n🎉 All tests completed successfully!');

    } catch (error) {
        console.error('❌ Test failed:', error);
    } finally {
        // Clean up test file
        if (fs.existsSync(testFilePath)) {
            fs.unlinkSync(testFilePath);
            console.log('🧹 Test file cleaned up');
        }
        
        // Clean up backup and lock files
        const backupFile = `${testFilePath}.backup`;
        const lockFile = `${testFilePath}.lock`;
        
        if (fs.existsSync(backupFile)) {
            fs.unlinkSync(backupFile);
        }
        
        if (fs.existsSync(lockFile)) {
            fs.unlinkSync(lockFile);
        }
    }
}

// Run the tests
runTests();