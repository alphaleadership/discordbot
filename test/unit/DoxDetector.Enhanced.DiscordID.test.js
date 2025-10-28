import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Import DoxDetector - adjust path as needed
import DoxDetector from '../../utils/managers/DoxDetector.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Test configuration
const TEST_DATA_DIR = path.join(__dirname, '../test-data');
const TEST_DOX_FILE = path.join(TEST_DATA_DIR, 'enhanced-dox-detections.json');
const TEST_EXCEPTIONS_FILE = path.join(TEST_DATA_DIR, 'enhanced-dox-exceptions.json');

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

describe('Enhanced DoxDetector Discord ID Exclusion Tests', () => {
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
   describe('Discord ID Pattern Recognition and Exclusion', () => {
        test('should recognize all valid Discord ID formats', () => {
            const validDiscordIds = [
                '123456789012345678',    // 18 digits (most common)
                '12345678901234567',     // 17 digits (minimum)
                '1234567890123456789',   // 19 digits (maximum)
                '987654321098765432',    // Different 18 digit ID
                '100000000000000000',    // Minimum valid snowflake
                '999999999999999999'     // Maximum 18 digit ID
            ];

            validDiscordIds.forEach(discordId => {
                const matches = discordId.match(/\b\d{17,19}\b/g);
                expect(matches).not.toBeNull();
                expect(matches[0]).toBe(discordId);
            });
        });

        test('should not recognize invalid Discord ID formats', () => {
            const invalidDiscordIds = [
                '12345678901234567890',  // 20 digits (too long)
                '1234567890123456',      // 16 digits (too short)
                '123456789012345',       // 15 digits (too short)
                'abc123456789012345',    // Contains letters
                '123-456-789-012-345',   // Contains hyphens
                '123 456 789 012 345',   // Contains spaces
                '123.456.789.012.345',   // Contains dots
                '',                      // Empty string
                '0',                     // Single digit
                '12345'                  // Short number
            ];

            invalidDiscordIds.forEach(invalidId => {
                const matches = invalidId.match(/\b\d{17,19}\b/g);
                if (matches) {
                    // If there are matches, they should not be the full invalid ID
                    expect(matches[0]).not.toBe(invalidId);
                }
            });
        });

        test('should exclude Discord IDs from content analysis', () => {
            const testCases = [
                {
                    input: 'User ID: 123456789012345678',
                    description: 'Simple Discord ID'
                },
                {
                    input: 'Contact user 987654321098765432 for help',
                    description: 'Discord ID in sentence'
                },
                {
                    input: 'Multiple IDs: 123456789012345678 and 987654321098765432',
                    description: 'Multiple Discord IDs'
                },
                {
                    input: 'Channel <#555666777888999000> and user <@111222333444555666>',
                    description: 'Discord mentions with IDs'
                },
                {
                    input: 'Message ID 777888999000111222 was deleted',
                    description: 'Message ID reference'
                }
            ];

            testCases.forEach(({ input, description }) => {
                const result = doxDetector.detectPersonalInfo(input, 'test-guild');
                
                expect(result.detected).toBe(false);
                expect(result.detections).toHaveLength(0);
                expect(result.riskLevel).toBe('none');
            });
        });
    });

    describe('Discord ID Detection Prevention', () => {
        test('should not detect Discord IDs as sensitive data in various contexts', () => {
            const contextualMessages = [
                'Ban user 123456789012345678 for spam',
                'Kick 987654321098765432 from voice channel',
                'Mute user ID: 555666777888999000',
                'User <@123456789012345678> mentioned',
                'Channel <#987654321098765432> locked',
                'Role <@&555666777888999000> updated',
                '@123456789012345678 please check DMs',
                'User ID 123456789012345678 joined the server',
                'Message from 987654321098765432 deleted',
                '/ban 123456789012345678 inappropriate behavior',
                '/timeout 987654321098765432 1h trolling',
                'Report user 555666777888999000 to moderators',
                'User 111222333444555666 left the server',
                'Welcome 777888999000111222 to the community!'
            ];

            contextualMessages.forEach(message => {
                const result = doxDetector.detectPersonalInfo(message, 'test-guild');
                
                expect(result.detected).toBe(false);
                expect(result.detections).toHaveLength(0);
                expect(result.riskLevel).toBe('none');
            });
        });

        test('should still detect actual personal info mixed with Discord IDs', () => {
            const mixedContentTests = [
                {
                    message: 'User 123456789012345678 phone: 555-123-4567',
                    expectedTypes: ['phone'],
                    description: 'Discord ID with phone number'
                },
                {
                    message: 'Contact 987654321098765432 at john@example.com',
                    expectedTypes: ['email'],
                    description: 'Discord ID with email'
                },
                {
                    message: 'User ID 555666777888999000 SSN: 123-45-6789',
                    expectedTypes: ['ssn'],
                    description: 'Discord ID with SSN'
                },
                {
                    message: 'User <@123456789012345678> credit card: 4532 1234 5678 9012',
                    expectedTypes: ['creditCard'],
                    description: 'Discord mention with credit card'
                },
                {
                    message: 'Channel 987654321098765432 address: 123 Main Street',
                    expectedTypes: ['address'],
                    description: 'Discord ID with address'
                }
            ];

            mixedContentTests.forEach(({ message, expectedTypes, description }) => {
                const result = doxDetector.detectPersonalInfo(message, 'test-guild');
                
                expect(result.detected).toBe(true);
                expect(result.detections.length).toBeGreaterThan(0);
                
                const detectedTypes = result.detections.map(d => d.type);
                expectedTypes.forEach(expectedType => {
                    expect(detectedTypes).toContain(expectedType);
                });
            });
        });
    });

    describe('Discord Mention and Format Handling', () => {
        test('should handle Discord user mentions', () => {
            const mentionFormats = [
                'Hey <@123456789012345678> check this out',
                'Thanks <@!987654321098765432> for the help',
                'Welcome <@555666777888999000>!',
                'Ping <@111222333444555666> and <@777888999000111222>',
                'User <@123456789012345678> is online'
            ];

            mentionFormats.forEach(message => {
                const result = doxDetector.detectPersonalInfo(message, 'test-guild');
                
                expect(result.detected).toBe(false);
                expect(result.detections).toHaveLength(0);
                expect(result.riskLevel).toBe('none');
            });
        });

        test('should handle Discord channel mentions', () => {
            const channelMentions = [
                'Join <#123456789012345678> for discussion',
                'Check out <#987654321098765432>',
                'Move to <#555666777888999000> please',
                'Channels <#111222333444555666> and <#777888999000111222>',
                'Post in <#123456789012345678> only'
            ];

            channelMentions.forEach(message => {
                const result = doxDetector.detectPersonalInfo(message, 'test-guild');
                
                expect(result.detected).toBe(false);
                expect(result.detections).toHaveLength(0);
                expect(result.riskLevel).toBe('none');
            });
        });

        test('should handle Discord role mentions', () => {
            const roleMentions = [
                'The <@&123456789012345678> role was updated',
                'Assign <@&987654321098765432> to new members',
                'Remove <@&555666777888999000> from user',
                'Roles <@&111222333444555666> and <@&777888999000111222>',
                'Ping <@&123456789012345678> for help'
            ];

            roleMentions.forEach(message => {
                const result = doxDetector.detectPersonalInfo(message, 'test-guild');
                
                expect(result.detected).toBe(false);
                expect(result.detections).toHaveLength(0);
                expect(result.riskLevel).toBe('none');
            });
        });

        test('should handle custom emoji IDs', () => {
            const emojiMessages = [
                'Nice work! <:thumbsup:123456789012345678>',
                'Animated emoji: <a:party:987654321098765432>',
                'Multiple emojis: <:smile:111222333444555666> <:wink:777888999000111222>',
                'Custom emoji <:custom:555666777888999000> looks great',
                'React with <:heart:123456789012345678>'
            ];

            emojiMessages.forEach(message => {
                const result = doxDetector.detectPersonalInfo(message, 'test-guild');
                
                expect(result.detected).toBe(false);
                expect(result.detections).toHaveLength(0);
                expect(result.riskLevel).toBe('none');
            });
        });
    });

    describe('Exception System Integration', () => {
        test('should have Discord ID exclusions in exception system', () => {
            // Check if Discord ID exclusions are automatically added
            const hasDiscordIdExclusions = doxDetector.checkExceptions(
                'test-guild', 
                'User 123456789012345678 needs help', 
                'any-type'
            );
            
            expect(hasDiscordIdExclusions).toBe(true);
        });

        test('should persist Discord ID exclusions across reloads', () => {
            // First check that exclusions work
            const beforeReload = doxDetector.detectPersonalInfo(
                'User 123456789012345678 in channel', 
                'test-guild'
            );
            expect(beforeReload.detected).toBe(false);

            // Reload the detector
            doxDetector.reload();

            // Check that exclusions still work
            const afterReload = doxDetector.detectPersonalInfo(
                'User 987654321098765432 online', 
                'test-guild'
            );
            expect(afterReload.detected).toBe(false);
        });

        test('should handle Discord ID exclusion configuration', () => {
            // Test getting Discord ID exclusion config
            const config = doxDetector.getDiscordIdExclusionConfig();
            
            expect(config).toBeDefined();
            expect(config.enabled).toBe(true);
            expect(config.pattern).toBeDefined();
            expect(config.description).toContain('Discord');
        });
    });

    describe('Performance and Edge Cases', () => {
        test('should handle large content with many Discord IDs efficiently', () => {
            // Generate content with 100 Discord IDs
            const discordIds = Array.from({ length: 100 }, (_, i) => 
                `12345678901234567${i.toString().padStart(2, '0')}`
            );
            
            const largeContent = `Users in server: ${discordIds.join(', ')}. ` +
                'This is a large message with many Discord IDs that should be processed efficiently.';
            
            const startTime = Date.now();
            const result = doxDetector.detectPersonalInfo(largeContent, 'test-guild');
            const endTime = Date.now();
            
            expect(result.detected).toBe(false);
            expect(result.detections).toHaveLength(0);
            expect(endTime - startTime).toBeLessThan(1000); // Should complete within 1 second
        });

        test('should handle malformed Discord-like IDs gracefully', () => {
            const malformedIds = [
                '123456789012345678abc',  // Letters at end
                'abc123456789012345678',  // Letters at start
                '123.456.789.012.345.678', // Dots
                '123-456-789-012-345-678', // Hyphens
                '123 456 789 012 345 678', // Spaces
                '123456789012345678.0',   // Decimal
                '123456789012345678e10',  // Scientific notation
                '0x123456789012345678'    // Hexadecimal prefix
            ];

            malformedIds.forEach(malformedId => {
                const result = doxDetector.detectPersonalInfo(
                    `Content with malformed ID: ${malformedId}`, 
                    'test-guild'
                );
                
                // Should not cause errors and should not detect as personal info
                expect(result).toBeDefined();
                expect(result.detected).toBe(false);
                expect(result.detections).toHaveLength(0);
            });
        });

        test('should handle empty and null content gracefully', () => {
            const edgeCases = [null, undefined, '', '   ', '\n\t', '0', 'null', 'undefined'];

            edgeCases.forEach(content => {
                const result = doxDetector.detectPersonalInfo(content, 'test-guild');
                
                expect(result).toBeDefined();
                expect(result.detected).toBe(false);
                expect(result.detections).toHaveLength(0);
                expect(result.riskLevel).toBe('none');
            });
        });

        test('should handle concurrent Discord ID processing', async () => {
            const messages = Array.from({ length: 50 }, (_, i) => 
                `User ${123456789012345678 + i} is online`
            );

            const promises = messages.map(message => 
                Promise.resolve(doxDetector.detectPersonalInfo(message, 'test-guild'))
            );

            const results = await Promise.all(promises);

            // All results should be consistent
            results.forEach(result => {
                expect(result.detected).toBe(false);
                expect(result.detections).toHaveLength(0);
                expect(result.riskLevel).toBe('none');
            });
        });
    });

    describe('Real-world Discord Scenarios', () => {
        test('should handle moderation commands with Discord IDs', () => {
            const moderationCommands = [
                '/ban 123456789012345678 spam',
                '/kick user 987654321098765432',
                '/timeout 555666777888999000 1h inappropriate behavior',
                '/warn 111222333444555666 for breaking rules',
                '/mute @123456789012345678 trolling',
                '/unban 777888999000111222',
                '/clear 50 messages from 123456789012345678',
                '/role add 987654321098765432 @Member',
                '/nick 555666777888999000 NewNickname',
                '/move 111222333444555666 to General'
            ];

            moderationCommands.forEach(command => {
                const result = doxDetector.detectPersonalInfo(command, 'test-guild');
                
                expect(result.detected).toBe(false);
                expect(result.detections).toHaveLength(0);
                expect(result.riskLevel).toBe('none');
            });
        });

        test('should handle Discord bot logs and system messages', () => {
            const systemMessages = [
                'User 123456789012345678 joined the server',
                'User 987654321098765432 left the server',
                'Message ID 555666777888999000 was deleted by moderator',
                'Channel 111222333444555666 was created',
                'Role 777888999000111222 was assigned to user 123456789012345678',
                'Invite created by 987654321098765432 expires in 24h',
                'Voice channel 555666777888999000 user limit set to 10',
                'Thread 111222333444555666 was archived',
                'Webhook 777888999000111222 was updated',
                'Integration 123456789012345678 was enabled'
            ];

            systemMessages.forEach(message => {
                const result = doxDetector.detectPersonalInfo(message, 'test-guild');
                
                expect(result.detected).toBe(false);
                expect(result.detections).toHaveLength(0);
                expect(result.riskLevel).toBe('none');
            });
        });

        test('should handle Discord API responses and webhooks', () => {
            const apiResponses = [
                '{"user_id": "123456789012345678", "username": "TestUser"}',
                '{"channel_id": "987654321098765432", "guild_id": "555666777888999000"}',
                '{"message_id": "111222333444555666", "author": {"id": "777888999000111222"}}',
                'Webhook payload: {"id": "123456789012345678", "token": "webhook_token"}',
                'API response: {"guild": {"id": "987654321098765432", "name": "Test Server"}}',
                'Event data: {"user": "555666777888999000", "action": "join"}',
                'Audit log: {"target_id": "111222333444555666", "executor_id": "777888999000111222"}',
                'Bot response: {"bot_id": "123456789012345678", "status": "online"}',
                'Permission check: {"user": "987654321098765432", "permissions": 8}',
                'Rate limit: {"user_id": "555666777888999000", "retry_after": 1000}'
            ];

            apiResponses.forEach(response => {
                const result = doxDetector.detectPersonalInfo(response, 'test-guild');
                
                expect(result.detected).toBe(false);
                expect(result.detections).toHaveLength(0);
                expect(result.riskLevel).toBe('none');
            });
        });
    });

    describe('Integration with Existing DoxDetector Functionality', () => {
        test('should maintain normal detection for non-Discord content', () => {
            const normalPersonalInfo = [
                'My phone number is 555-123-4567',
                'Email me at john@example.com',
                'My SSN is 123-45-6789',
                'Credit card: 4532 1234 5678 9012',
                'I live at 123 Main Street'
            ];

            normalPersonalInfo.forEach(info => {
                const result = doxDetector.detectPersonalInfo(info, 'test-guild');
                
                expect(result.detected).toBe(true);
                expect(result.detections.length).toBeGreaterThan(0);
                expect(result.riskLevel).not.toBe('none');
            });
        });

        test('should work correctly with existing exception system', () => {
            // Add a regular exception
            const addResult = doxDetector.addException(
                'test-guild',
                'email',
                'support@company.com',
                'exact',
                'Company support email',
                'moderator-id'
            );

            expect(addResult.success).toBe(true);

            // Test that both Discord IDs and regular exceptions work
            const discordIdResult = doxDetector.detectPersonalInfo(
                'User 123456789012345678 contact support@company.com',
                'test-guild'
            );

            expect(discordIdResult.detected).toBe(false);
            expect(discordIdResult.detections).toHaveLength(0);

            // Test that non-excepted emails are still detected
            const otherEmailResult = doxDetector.detectPersonalInfo(
                'User 987654321098765432 email: personal@gmail.com',
                'test-guild'
            );

            expect(otherEmailResult.detected).toBe(true);
            expect(otherEmailResult.detections.some(d => d.type === 'email')).toBe(true);
        });

        test('should maintain detection statistics accuracy', () => {
            // Generate some detections (should not include Discord IDs)
            doxDetector.detectPersonalInfo('User 123456789012345678 phone: 555-123-4567', 'test-guild');
            doxDetector.detectPersonalInfo('Contact 987654321098765432 at test@example.com', 'test-guild');
            doxDetector.detectPersonalInfo('User ID 555666777888999000 only', 'test-guild');

            const stats = doxDetector.getDetectionStats('test-guild');
            
            // Should only count actual personal info, not Discord IDs
            expect(stats.total).toBe(2); // phone and email only
            expect(stats.byType.phone).toBe(1);
            expect(stats.byType.email).toBe(1);
            expect(stats.byType.discordId || 0).toBe(0); // Discord IDs should not be counted
        });
    });
});