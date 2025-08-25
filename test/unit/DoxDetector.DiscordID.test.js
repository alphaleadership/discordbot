import DoxDetector from '../../utils/managers/DoxDetector.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Test configuration
const TEST_DATA_DIR = path.join(__dirname, '../test-data');
const TEST_DOX_FILE = path.join(TEST_DATA_DIR, 'test-dox-detections-discord.json');
const TEST_EXCEPTIONS_FILE = path.join(TEST_DATA_DIR, 'test-dox-exceptions-discord.json');

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

describe('DoxDetector Discord ID Exclusion', () => {
    let doxDetector;
    let mockWarnManager;
    let mockReportManager;

    beforeEach(() => {
        // Ensure test data directory exists
        if (!fs.existsSync(TEST_DATA_DIR)) {
            fs.mkdirSync(TEST_DATA_DIR, { recursive: true });
        }

        // Clean up test files if they exist
        [TEST_DOX_FILE, TEST_EXCEPTIONS_FILE].forEach(file => {
            if (fs.existsSync(file)) {
                fs.unlinkSync(file);
            }
        });

        mockWarnManager = new MockWarnManager();
        mockReportManager = new MockReportManager();
        
        doxDetector = new DoxDetector(
            mockWarnManager,
            mockReportManager,
            TEST_DOX_FILE
        );
    });

    afterEach(() => {
        // Clean up test files
        [TEST_DOX_FILE, TEST_EXCEPTIONS_FILE].forEach(file => {
            if (fs.existsSync(file)) {
                fs.unlinkSync(file);
            }
        });
    });

    describe('Discord ID Pattern Recognition', () => {
        const validDiscordIds = [
            '123456789012345678',    // 18 digits
            '12345678901234567',     // 17 digits
            '1234567890123456789',   // 19 digits
            '987654321098765432',    // 18 digits
            '100000000000000000',    // 18 digits (minimum valid)
            '999999999999999999'     // 18 digits (maximum valid)
        ];

        const invalidDiscordIds = [
            '12345678901234567890',  // 20 digits (too long)
            '1234567890123456',      // 16 digits (too short)
            '123456789012345',       // 15 digits (too short)
            'abc123456789012345',    // Contains letters
            '123-456-789-012-345',   // Contains hyphens
            '123 456 789 012 345'    // Contains spaces
        ];

        test('should recognize valid Discord ID patterns', () => {
            validDiscordIds.forEach(discordId => {
                const matches = discordId.match(doxDetector.discordIdPattern);
                expect(matches).not.toBeNull();
                expect(matches[0]).toBe(discordId);
            });
        });

        test('should not recognize invalid Discord ID patterns', () => {
            invalidDiscordIds.forEach(invalidId => {
                const matches = invalidId.match(doxDetector.discordIdPattern);
                if (matches) {
                    // If there are matches, they should not be the full invalid ID
                    expect(matches[0]).not.toBe(invalidId);
                }
            });
        });
    });

    describe('Discord ID Exclusion from Content', () => {
        test('should exclude Discord IDs from content analysis', () => {
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
                },
                {
                    input: 'No Discord IDs here, just text',
                    expected: 'No Discord IDs here, just text'
                }
            ];

            testCases.forEach(({ input, expected }) => {
                const result = doxDetector.excludeDiscordIds(input);
                expect(result).toBe(expected);
            });
        });

        test('should handle edge cases in Discord ID exclusion', () => {
            expect(doxDetector.excludeDiscordIds(null)).toBeNull();
            expect(doxDetector.excludeDiscordIds(undefined)).toBeUndefined();
            expect(doxDetector.excludeDiscordIds('')).toBe('');
            expect(doxDetector.excludeDiscordIds(123)).toBe(123); // Non-string input
        });
    });

    describe('Discord ID Detection Prevention', () => {
        test('should not detect Discord IDs as sensitive data', () => {
            const testMessages = [
                'User 123456789012345678 needs help',
                'Contact moderator 987654321098765432',
                'Report user ID: 555666777888999000',
                'Multiple users: 111222333444555666 and 777888999000111222',
                'Channel ID 123456789012345678 in server 987654321098765432'
            ];

            testMessages.forEach(message => {
                const result = doxDetector.detectPersonalInfo(message, 'test-guild');
                
                // Should not detect any personal information
                expect(result.detected).toBe(false);
                expect(result.detections).toHaveLength(0);
                expect(result.riskLevel).toBe('none');
            });
        });

        test('should still detect actual personal info mixed with Discord IDs', () => {
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
                
                expect(result.detected).toBe(true);
                expect(result.detections.length).toBeGreaterThan(0);
                
                const detectedTypes = result.detections.map(d => d.type);
                expectedTypes.forEach(expectedType => {
                    expect(detectedTypes).toContain(expectedType);
                });
            });
        });

        test('should not detect Discord IDs in various contexts', () => {
            const contextualMessages = [
                'Ban user 123456789012345678 for spam',
                'Kick 987654321098765432 from voice channel',
                'Mute user ID: 555666777888999000',
                'User <@123456789012345678> mentioned',
                'Channel <#987654321098765432> locked',
                'Role <@&555666777888999000> updated',
                '@123456789012345678 please check DMs',
                'User ID 123456789012345678 joined the server',
                'Message from 987654321098765432 deleted'
            ];

            contextualMessages.forEach(message => {
                const result = doxDetector.detectPersonalInfo(message, 'test-guild');
                
                expect(result.detected).toBe(false);
                expect(result.detections).toHaveLength(0);
                expect(result.riskLevel).toBe('none');
            });
        });
    });

    describe('Discord ID Exception Configuration', () => {
        test('should have Discord ID exclusion enabled by default', () => {
            const config = doxDetector.getDiscordIdExclusionConfig();
            
            expect(config.enabled).toBe(true);
            expect(config.pattern).toBe('\\b\\d{17,19}\\b');
            expect(config.type).toBe('regex');
            expect(config.description).toContain('Discord user IDs');
        });

        test('should allow configuring Discord ID exclusion', () => {
            // Disable Discord ID exclusion
            const disableResult = doxDetector.configureDiscordIdExclusion(false, 'test-moderator');
            
            expect(disableResult.success).toBe(true);
            expect(disableResult.enabled).toBe(false);
            
            const config = doxDetector.getDiscordIdExclusionConfig();
            expect(config.enabled).toBe(false);
            expect(config.addedBy).toBe('test-moderator');
        });

        test('should re-enable Discord ID exclusion', () => {
            // First disable
            doxDetector.configureDiscordIdExclusion(false, 'test-moderator');
            
            // Then re-enable
            const enableResult = doxDetector.configureDiscordIdExclusion(true, 'admin-user');
            
            expect(enableResult.success).toBe(true);
            expect(enableResult.enabled).toBe(true);
            
            const config = doxDetector.getDiscordIdExclusionConfig();
            expect(config.enabled).toBe(true);
            expect(config.addedBy).toBe('admin-user');
        });
    });

    describe('Exception System Integration', () => {
        test('should automatically add Discord ID exclusions to exception system', () => {
            // Force reload to trigger exception loading
            doxDetector.reload();
            
            const globalExceptions = doxDetector.exceptions._global;
            expect(globalExceptions).toBeDefined();
            expect(globalExceptions.discordIds).toBeDefined();
            expect(globalExceptions.discordIds.enabled).toBe(true);
            expect(globalExceptions.discordIds.pattern).toBe('\\b\\d{17,19}\\b');
        });

        test('should persist Discord ID exclusions when saving exceptions', () => {
            // Add a custom exception
            doxDetector.addException(
                'test-guild',
                'email',
                'support@company.com',
                'exact',
                'Company support email',
                'moderator-id'
            );
            
            // Reload and check that Discord ID exclusions are still there
            doxDetector.reload();
            
            const globalExceptions = doxDetector.exceptions._global;
            expect(globalExceptions.discordIds).toBeDefined();
            expect(globalExceptions.discordIds.enabled).toBe(true);
        });

        test('should check Discord ID exclusions in exception validation', () => {
            const contentWithDiscordId = 'User 123456789012345678 needs help';
            
            // Should be excepted due to Discord ID presence
            const isExcepted = doxDetector.checkExceptions('test-guild', contentWithDiscordId, 'any-type');
            expect(isExcepted).toBe(true);
        });
    });

    describe('Real-world Discord ID Scenarios', () => {
        test('should handle moderation commands with Discord IDs', () => {
            const moderationCommands = [
                '/ban 123456789012345678 spam',
                '/kick user 987654321098765432',
                '/timeout 555666777888999000 1h inappropriate behavior',
                '/warn 111222333444555666 for breaking rules',
                '/mute @123456789012345678 trolling'
            ];

            moderationCommands.forEach(command => {
                const result = doxDetector.detectPersonalInfo(command, 'test-guild');
                
                expect(result.detected).toBe(false);
                expect(result.detections).toHaveLength(0);
                expect(result.riskLevel).toBe('none');
            });
        });

        test('should handle Discord mentions and IDs in chat', () => {
            const chatMessages = [
                'Hey <@123456789012345678> check this out',
                'Thanks <@!987654321098765432> for the help',
                'Join <#555666777888999000> for discussion',
                'The <@&111222333444555666> role was updated',
                'Message ID 777888999000111222 was deleted',
                'User 123456789012345678 left the server'
            ];

            chatMessages.forEach(message => {
                const result = doxDetector.detectPersonalInfo(message, 'test-guild');
                
                expect(result.detected).toBe(false);
                expect(result.detections).toHaveLength(0);
                expect(result.riskLevel).toBe('none');
            });
        });

        test('should handle mixed content with Discord IDs and legitimate personal info', () => {
            const mixedContent = [
                {
                    message: 'User 123456789012345678 shared phone 555-123-4567',
                    shouldDetect: true,
                    expectedType: 'phone'
                },
                {
                    message: 'Contact 987654321098765432 or email support@company.com',
                    shouldDetect: true,
                    expectedType: 'email'
                },
                {
                    message: 'User ID 555666777888999000 posted SSN 123-45-6789',
                    shouldDetect: true,
                    expectedType: 'ssn'
                }
            ];

            mixedContent.forEach(({ message, shouldDetect, expectedType }) => {
                const result = doxDetector.detectPersonalInfo(message, 'test-guild');
                
                if (shouldDetect) {
                    expect(result.detected).toBe(true);
                    expect(result.detections.length).toBeGreaterThan(0);
                    
                    const detectedTypes = result.detections.map(d => d.type);
                    expect(detectedTypes).toContain(expectedType);
                } else {
                    expect(result.detected).toBe(false);
                    expect(result.detections).toHaveLength(0);
                }
            });
        });
    });

    describe('Performance and Edge Cases', () => {
        test('should handle large content with many Discord IDs efficiently', () => {
            const discordIds = Array.from({ length: 100 }, (_, i) => 
                `12345678901234567${i.toString().padStart(2, '0')}`
            );
            
            const largeContent = `Users in server: ${discordIds.join(', ')}`;
            
            const startTime = Date.now();
            const result = doxDetector.detectPersonalInfo(largeContent, 'test-guild');
            const endTime = Date.now();
            
            expect(result.detected).toBe(false);
            expect(result.detections).toHaveLength(0);
            expect(endTime - startTime).toBeLessThan(1000); // Should complete within 1 second
        });

        test('should handle malformed Discord IDs gracefully', () => {
            const malformedIds = [
                '123456789012345678abc',  // Letters at end
                'abc123456789012345678',  // Letters at start
                '123.456.789.012.345.678', // Dots
                '123-456-789-012-345-678', // Hyphens
                '123 456 789 012 345 678'  // Spaces
            ];

            malformedIds.forEach(malformedId => {
                const result = doxDetector.detectPersonalInfo(malformedId, 'test-guild');
                
                // Should not cause errors and should not detect as personal info
                expect(result).toBeDefined();
                expect(result.detected).toBe(false);
                expect(result.detections).toHaveLength(0);
            });
        });

        test('should handle empty and null content gracefully', () => {
            const edgeCases = [null, undefined, '', '   ', '\n\t'];

            edgeCases.forEach(content => {
                const result = doxDetector.detectPersonalInfo(content, 'test-guild');
                
                expect(result).toBeDefined();
                expect(result.detected).toBe(false);
                expect(result.detections).toHaveLength(0);
                expect(result.riskLevel).toBe('none');
            });
        });
    });
});

// Simple test runner for environments without Jest
if (process.argv[1] === fileURLToPath(import.meta.url)) {
    console.log('🧪 Running DoxDetector Discord ID Exclusion Tests...\n');
    
    // Mock test framework functions
    global.describe = (name, fn) => {
        console.log(`\n📋 ${name}`);
        fn();
    };
    
    global.test = (name, fn) => {
        try {
            fn();
            console.log(`  ✅ ${name}`);
        } catch (error) {
            console.log(`  ❌ ${name}: ${error.message}`);
        }
    };
    
    global.beforeEach = (fn) => fn();
    global.afterEach = (fn) => fn();
    
    // Mock Jest functions
    global.expect = (actual) => ({
        toBe: (expected) => {
            if (actual !== expected) {
                throw new Error(`Expected ${expected}, got ${actual}`);
            }
        },
        toBeNull: () => {
            if (actual !== null) {
                throw new Error(`Expected null, got ${actual}`);
            }
        },
        toBeUndefined: () => {
            if (actual !== undefined) {
                throw new Error(`Expected undefined, got ${actual}`);
            }
        },
        toBeDefined: () => {
            if (actual === undefined) {
                throw new Error('Expected value to be defined');
            }
        },
        toHaveLength: (expected) => {
            if (actual.length !== expected) {
                throw new Error(`Expected length ${expected}, got ${actual.length}`);
            }
        },
        toContain: (expected) => {
            if (!actual.includes(expected)) {
                throw new Error(`Expected "${actual}" to contain "${expected}"`);
            }
        },
        toBeGreaterThan: (expected) => {
            if (actual <= expected) {
                throw new Error(`Expected ${actual} to be greater than ${expected}`);
            }
        },
        toBeLessThan: (expected) => {
            if (actual >= expected) {
                throw new Error(`Expected ${actual} to be less than ${expected}`);
            }
        },
        not: {
            toBeNull: () => {
                if (actual === null) {
                    throw new Error(`Expected not null, got ${actual}`);
                }
            },
            toBe: (expected) => {
                if (actual === expected) {
                    throw new Error(`Expected not ${expected}, got ${actual}`);
                }
            }
        }
    });
    
    // Run basic tests
    console.log('Running basic Discord ID exclusion tests...');
    
    try {
        const mockWarn = new MockWarnManager();
        const mockReport = new MockReportManager();
        const detector = new DoxDetector(mockWarn, mockReport, TEST_DOX_FILE);
        
        // Test Discord ID pattern recognition
        const discordId = '123456789012345678';
        const matches = discordId.match(detector.discordIdPattern);
        if (matches && matches[0] === discordId) {
            console.log('  ✅ Discord ID pattern recognition test passed');
        } else {
            console.log('  ❌ Discord ID pattern recognition test failed');
        }
        
        // Test Discord ID exclusion
        const excludedContent = detector.excludeDiscordIds('User 123456789012345678 needs help');
        if (excludedContent === 'User [DISCORD_ID] needs help') {
            console.log('  ✅ Discord ID exclusion test passed');
        } else {
            console.log('  ❌ Discord ID exclusion test failed');
        }
        
        // Test no detection of Discord IDs
        const result = detector.detectPersonalInfo('User 123456789012345678 in channel', 'test-guild');
        if (!result.detected && result.detections.length === 0) {
            console.log('  ✅ Discord ID non-detection test passed');
        } else {
            console.log('  ❌ Discord ID non-detection test failed');
        }
        
        // Test mixed content detection
        const mixedResult = detector.detectPersonalInfo('User 123456789012345678 phone: 555-123-4567', 'test-guild');
        if (mixedResult.detected && mixedResult.detections.some(d => d.type === 'phone')) {
            console.log('  ✅ Mixed content detection test passed');
        } else {
            console.log('  ❌ Mixed content detection test failed');
        }
        
        console.log('\n🎉 Basic Discord ID exclusion tests completed successfully!');
        
    } catch (error) {
        console.error('❌ Test failed:', error.message);
    } finally {
        // Cleanup
        [TEST_DOX_FILE, TEST_EXCEPTIONS_FILE].forEach(file => {
            if (fs.existsSync(file)) {
                fs.unlinkSync(file);
            }
        });
    }
}