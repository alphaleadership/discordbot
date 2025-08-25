import DoxDetector from './utils/managers/DoxDetector.js';
import fs from 'fs';
import path from 'path';

// Mock dependencies
class MockWarnManager {
    constructor() {
        this.warnings = [];
    }

    addWarn(userId, reason, moderatorId) {
        const warning = {
            id: Date.now().toString(),
            userId,
            reason,
            moderatorId,
            timestamp: new Date().toISOString()
        };
        this.warnings.push(warning);
        return { success: true, warning, count: this.warnings.filter(w => w.userId === userId).length };
    }

    getWarnCount(userId) {
        return this.warnings.filter(w => w.userId === userId).length;
    }
}

class MockReportManager {
    constructor() {
        this.reports = [];
    }

    async sendSystemAlert(client, title, description, fields, color) {
        this.reports.push({ type: 'system', title, description, fields, color });
        return { success: true };
    }
}

console.log('🧪 Testing Discord ID Exclusion Functionality...\n');

try {
    const mockWarnManager = new MockWarnManager();
    const mockReportManager = new MockReportManager();
    const doxDetector = new DoxDetector(mockWarnManager, mockReportManager, 'data/test-dox-detections.json');

    let testsPassed = 0;
    let testsTotal = 0;

    function runTest(testName, testFn) {
        testsTotal++;
        try {
            testFn();
            console.log(`✅ ${testName}`);
            testsPassed++;
        } catch (error) {
            console.log(`❌ ${testName}: ${error.message}`);
        }
    }

    // Test 1: Discord ID pattern recognition
    runTest('Discord ID pattern recognition', () => {
        const validDiscordIds = [
            '123456789012345678',    // 18 digits
            '12345678901234567',     // 17 digits
            '1234567890123456789'    // 19 digits
        ];

        validDiscordIds.forEach(discordId => {
            const matches = discordId.match(doxDetector.discordIdPattern);
            if (!matches || matches[0] !== discordId) {
                throw new Error(`Failed to match Discord ID: ${discordId}`);
            }
        });
    });

    // Test 2: Discord ID exclusion from content
    runTest('Discord ID exclusion from content', () => {
        const testCases = [
            {
                input: 'User ID: 123456789012345678',
                expected: 'User ID: [DISCORD_ID]'
            },
            {
                input: 'Contact user 987654321098765432 for help',
                expected: 'Contact user [DISCORD_ID] for help'
            },
            {
                input: 'Multiple IDs: 123456789012345678 and 987654321098765432',
                expected: 'Multiple IDs: [DISCORD_ID] and [DISCORD_ID]'
            }
        ];

        testCases.forEach(({ input, expected }) => {
            const result = doxDetector.excludeDiscordIds(input);
            if (result !== expected) {
                throw new Error(`Expected "${expected}", got "${result}"`);
            }
        });
    });

    // Test 3: Discord IDs should not be detected as sensitive data
    runTest('Discord IDs not detected as sensitive data', () => {
        const testMessages = [
            'User 123456789012345678 needs help',
            'Contact moderator 987654321098765432',
            'Report user ID: 555666777888999000',
            'Multiple users: 111222333444555666 and 777888999000111222'
        ];

        testMessages.forEach(message => {
            const result = doxDetector.detectPersonalInfo(message, 'test-guild');
            if (result.detected || result.detections.length > 0) {
                throw new Error(`Discord ID was incorrectly detected as sensitive data in: "${message}"`);
            }
            if (result.riskLevel !== 'none') {
                throw new Error(`Expected risk level 'none', got '${result.riskLevel}' for: "${message}"`);
            }
        });
    });

    // Test 4: Mixed content - should detect actual personal info but ignore Discord IDs
    runTest('Mixed content detection', () => {
        const testCases = [
            {
                message: 'User 123456789012345678 phone: 555-123-4567',
                expectedTypes: ['phone']
            },
            {
                message: 'Contact 987654321098765432 at john@example.com',
                expectedTypes: ['email']
            },
            {
                message: 'User ID 555666777888999000 SSN: 123-45-6789',
                expectedTypes: ['ssn']
            }
        ];

        testCases.forEach(({ message, expectedTypes }) => {
            const result = doxDetector.detectPersonalInfo(message, 'test-guild');
            
            if (!result.detected || result.detections.length === 0) {
                throw new Error(`Failed to detect personal info in: "${message}"`);
            }
            
            const detectedTypes = result.detections.map(d => d.type);
            expectedTypes.forEach(expectedType => {
                if (!detectedTypes.includes(expectedType)) {
                    throw new Error(`Expected to detect ${expectedType} in: "${message}"`);
                }
            });
        });
    });

    // Test 5: Moderation commands with Discord IDs
    runTest('Moderation commands with Discord IDs', () => {
        const moderationCommands = [
            '/ban 123456789012345678 spam',
            '/kick user 987654321098765432',
            '/timeout 555666777888999000 1h inappropriate behavior',
            '/warn 111222333444555666 for breaking rules'
        ];

        moderationCommands.forEach(command => {
            const result = doxDetector.detectPersonalInfo(command, 'test-guild');
            if (result.detected || result.detections.length > 0) {
                throw new Error(`Moderation command incorrectly flagged: "${command}"`);
            }
        });
    });

    // Test 6: Discord ID exclusion configuration
    runTest('Discord ID exclusion configuration', () => {
        const config = doxDetector.getDiscordIdExclusionConfig();
        
        if (!config.enabled) {
            throw new Error('Discord ID exclusion should be enabled by default');
        }
        if (config.pattern !== '\\b\\d{17,19}\\b') {
            throw new Error(`Expected pattern '\\b\\d{17,19}\\b', got '${config.pattern}'`);
        }
        if (config.type !== 'regex') {
            throw new Error(`Expected type 'regex', got '${config.type}'`);
        }
    });

    // Test 7: Exception system integration
    runTest('Exception system integration', () => {
        doxDetector.reload();
        
        const globalExceptions = doxDetector.exceptions._global;
        if (!globalExceptions || !globalExceptions.discordIds) {
            throw new Error('Discord ID exclusions not found in global exceptions');
        }
        if (!globalExceptions.discordIds.enabled) {
            throw new Error('Discord ID exclusions should be enabled');
        }
    });

    // Test 8: Edge cases
    runTest('Edge cases handling', () => {
        const edgeCases = [null, undefined, '', '   ', '\n\t'];

        edgeCases.forEach(content => {
            const result = doxDetector.detectPersonalInfo(content, 'test-guild');
            if (result.detected || result.detections.length > 0 || result.riskLevel !== 'none') {
                throw new Error(`Edge case failed for content: ${JSON.stringify(content)}`);
            }
        });
    });

    // Test 9: Performance test with many Discord IDs
    runTest('Performance with many Discord IDs', () => {
        const discordIds = Array.from({ length: 50 }, (_, i) => 
            `12345678901234567${i.toString().padStart(2, '0')}`
        );
        
        const largeContent = `Users in server: ${discordIds.join(', ')}`;
        
        const startTime = Date.now();
        const result = doxDetector.detectPersonalInfo(largeContent, 'test-guild');
        const endTime = Date.now();
        
        if (result.detected || result.detections.length > 0) {
            throw new Error('Large content with Discord IDs should not be detected as sensitive');
        }
        
        if (endTime - startTime > 1000) {
            throw new Error(`Performance test failed: took ${endTime - startTime}ms (should be < 1000ms)`);
        }
    });

    // Test 10: Configuration changes
    runTest('Configuration changes', () => {
        // Disable Discord ID exclusion
        const disableResult = doxDetector.configureDiscordIdExclusion(false, 'test-moderator');
        if (!disableResult.success || disableResult.enabled !== false) {
            throw new Error('Failed to disable Discord ID exclusion');
        }
        
        // Re-enable Discord ID exclusion
        const enableResult = doxDetector.configureDiscordIdExclusion(true, 'admin-user');
        if (!enableResult.success || enableResult.enabled !== true) {
            throw new Error('Failed to re-enable Discord ID exclusion');
        }
        
        const config = doxDetector.getDiscordIdExclusionConfig();
        if (!config.enabled || config.addedBy !== 'admin-user') {
            throw new Error('Configuration changes not properly saved');
        }
    });

    console.log(`\n📊 Test Results: ${testsPassed}/${testsTotal} tests passed`);
    
    if (testsPassed === testsTotal) {
        console.log('🎉 All Discord ID exclusion tests passed successfully!');
        console.log('\n✅ Task 6.1 completed: Discord ID pattern exclusion implemented and tested');
    } else {
        console.log(`❌ ${testsTotal - testsPassed} tests failed`);
        process.exit(1);
    }

} catch (error) {
    console.error('❌ Test setup failed:', error.message);
    console.error(error.stack);
    process.exit(1);
} finally {
    // Cleanup test files
    const testFiles = ['data/test-dox-detections.json', 'data/test-dox-exceptions.json'];
    testFiles.forEach(file => {
        if (fs.existsSync(file)) {
            fs.unlinkSync(file);
        }
    });
}