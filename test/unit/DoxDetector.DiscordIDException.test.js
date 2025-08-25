import DoxDetector from '../../utils/managers/DoxDetector.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Test configuration
const TEST_DATA_DIR = path.join(__dirname, '../test-data');
const TEST_DOX_FILE = path.join(TEST_DATA_DIR, 'test-dox-detections-exception.json');
const TEST_EXCEPTIONS_FILE = path.join(TEST_DATA_DIR, 'test-dox-exceptions-exception.json');

// Simple test runner for environments without Jest
if (true) {
    console.log('🧪 Running DoxDetector Discord ID Exception System Tests...\n');
    
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
            },
            toThrow: () => {
                try {
                    if (typeof actual === 'function') {
                        actual();
                    }
                } catch (error) {
                    throw new Error(`Expected function not to throw, but it threw: ${error.message}`);
                }
            }
        }
    });
    
    // Mock Jest spies
    global.jest = {
        spyOn: (obj, method) => {
            const original = obj[method];
            const calls = [];
            const spy = (...args) => {
                calls.push(args);
                return original.apply(obj, args);
            };
            spy.mockImplementation = (fn) => {
                obj[method] = fn || (() => {});
                return spy;
            };
            spy.mockRestore = () => {
                obj[method] = original;
            };
            spy.toHaveBeenCalledWith = (expected) => {
                const found = calls.some(call => 
                    call.length === 1 && 
                    typeof call[0] === 'string' && 
                    call[0].includes(expected)
                );
                if (!found) {
                    throw new Error(`Expected spy to have been called with "${expected}"`);
                }
            };
            obj[method] = spy;
            return spy;
        }
    };
}

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

describe('DoxDetector Discord ID Exception System', () => {
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

    describe('Discord ID Exception Configuration', () => {
        test('should automatically create Discord ID exclusions on initialization', () => {
            const globalExceptions = doxDetector.exceptions._global;
            
            expect(globalExceptions).toBeDefined();
            expect(globalExceptions.discordIds).toBeDefined();
            expect(globalExceptions.discordIds.enabled).toBe(true);
            expect(globalExceptions.discordIds.pattern).toBe('\\b\\d{17,19}\\b');
            expect(globalExceptions.discordIds.systemProtected).toBe(true);
            expect(globalExceptions.discordIds.version).toBe('1.1.0');
        });

        test('should ensure Discord ID exclusions with proper metadata', () => {
            const result = doxDetector.ensureDiscordIdExclusions(doxDetector.exceptions);
            
            expect(result.wasUpdated).toBe(true);
            expect(result.changesApplied.length).toBeGreaterThan(0);
            expect(result.currentConfig).toBeDefined();
            expect(result.currentConfig.configurationHistory).toBeDefined();
            expect(result.currentConfig.additionalPatterns).toBeDefined();
        });

        test('should include additional Discord ID patterns', () => {
            const config = doxDetector.exceptions._global.discordIds;
            
            expect(config.additionalPatterns).toBeDefined();
            expect(config.additionalPatterns.mentions).toBeDefined();
            expect(config.additionalPatterns.channelMentions).toBeDefined();
            expect(config.additionalPatterns.roleMentions).toBeDefined();
            expect(config.additionalPatterns.customEmojis).toBeDefined();
            
            // Check that all additional patterns are enabled by default
            Object.values(config.additionalPatterns).forEach(pattern => {
                expect(pattern.enabled).toBe(true);
                expect(pattern.pattern).toBeDefined();
                expect(pattern.description).toBeDefined();
            });
        });

        test('should prevent removal of system-protected Discord ID exclusions', () => {
            const result = doxDetector.removeException('_global', 'discordIds', 'any-id', 'test-moderator');
            
            expect(result.success).toBe(false);
            expect(result.error).toContain('Cannot remove global Discord ID exclusions');
            expect(result.message).toContain('system-protected');
        });

        test('should update configuration history on changes', () => {
            const initialHistory = doxDetector.exceptions._global.discordIds.configurationHistory.length;
            
            // Force an update
            doxDetector.ensureDiscordIdExclusions(doxDetector.exceptions, true);
            
            const newHistory = doxDetector.exceptions._global.discordIds.configurationHistory.length;
            expect(newHistory).toBeGreaterThan(initialHistory);
            
            const latestEntry = doxDetector.exceptions._global.discordIds.configurationHistory[newHistory - 1];
            expect(latestEntry.timestamp).toBeDefined();
            expect(latestEntry.action).toBe('updated');
            expect(latestEntry.reason).toContain('Force update');
        });
    });

    describe('Discord ID Exception Validation', () => {
        test('should validate Discord ID exclusions successfully', () => {
            const validation = doxDetector.validateDiscordIdExclusions();
            
            expect(validation.valid).toBe(true);
            expect(validation.issues).toHaveLength(0);
            expect(validation.timestamp).toBeDefined();
            expect(validation.detectionConsistency).toBeDefined();
        });

        test('should detect invalid Discord ID patterns', () => {
            // Corrupt the pattern
            doxDetector.exceptions._global.discordIds.pattern = '[invalid regex';
            
            const validation = doxDetector.validateDiscordIdExclusions();
            
            expect(validation.valid).toBe(false);
            expect(validation.issues.length).toBeGreaterThan(0);
            expect(validation.issues.some(issue => issue.includes('Invalid regex pattern'))).toBe(true);
        });

        test('should detect disabled Discord ID exclusions', () => {
            doxDetector.exceptions._global.discordIds.enabled = false;
            
            const validation = doxDetector.validateDiscordIdExclusions();
            
            expect(validation.valid).toBe(false);
            expect(validation.issues.some(issue => issue.includes('Discord ID exclusion is disabled'))).toBe(true);
        });

        test('should validate detection consistency', () => {
            const consistency = doxDetector.validateDetectionConsistency();
            
            expect(consistency.consistent).toBe(true);
            expect(consistency.testResults).toBeDefined();
            expect(consistency.testResults.shouldBeExcluded).toBe(true);
            expect(consistency.testResults.isExcepted).toBe(true);
        });

        test('should detect pattern inconsistencies', () => {
            // Change the exception pattern to be different from the method pattern
            doxDetector.exceptions._global.discordIds.pattern = '\\d{18}';
            
            const consistency = doxDetector.validateDetectionConsistency();
            
            expect(consistency.consistent).toBe(false);
            expect(consistency.issues.some(issue => 
                issue.includes('Discord ID patterns inconsistent')
            )).toBe(true);
        });
    });

    describe('Discord ID Exception Repair and Maintenance', () => {
        test('should repair corrupted Discord ID exclusions', () => {
            // Corrupt the configuration
            delete doxDetector.exceptions._global.discordIds;
            
            const repairResult = doxDetector.repairDiscordIdExclusions('test-admin');
            
            expect(repairResult.success).toBe(true);
            expect(repairResult.repairsApplied.length).toBeGreaterThan(0);
            expect(doxDetector.exceptions._global.discordIds).toBeDefined();
            expect(doxDetector.exceptions._global.discordIds.repairedBy).toBe('test-admin');
        });

        test('should not repair valid configurations unnecessarily', () => {
            const repairResult = doxDetector.repairDiscordIdExclusions('test-admin');
            
            expect(repairResult.success).toBe(true);
            expect(repairResult.message).toContain('already valid');
            expect(repairResult.repairsApplied).toHaveLength(0);
        });

        test('should synchronize Discord ID patterns', () => {
            // Create pattern mismatch
            doxDetector.exceptions._global.discordIds.pattern = '\\b\\d{17,19}\\b';
            doxDetector.discordIdPattern = /\d{18}/g; // Different pattern
            
            doxDetector.synchronizeDiscordIdPatterns();
            
            expect(doxDetector.discordIdPattern.source).toBe('\\b\\d{17,19}\\b');
        });

        test('should perform automatic maintenance', () => {
            // Create some issues to fix
            doxDetector.exceptions._global.discordIds.enabled = false;
            
            const maintenanceResult = doxDetector.maintainDiscordIdExclusions();
            
            expect(maintenanceResult.success).toBe(true);
            expect(maintenanceResult.actionsPerformed.length).toBeGreaterThan(0);
            expect(doxDetector.exceptions._global.discordIds.lastMaintenance).toBeDefined();
            expect(doxDetector.exceptions._global.discordIds.maintenanceHistory).toBeDefined();
        });

        test('should maintain maintenance history', () => {
            const initialHistory = doxDetector.exceptions._global.discordIds.maintenanceHistory || [];
            
            doxDetector.maintainDiscordIdExclusions();
            
            const newHistory = doxDetector.exceptions._global.discordIds.maintenanceHistory;
            expect(newHistory.length).toBe(initialHistory.length + 1);
            
            const latestEntry = newHistory[newHistory.length - 1];
            expect(latestEntry.timestamp).toBeDefined();
            expect(latestEntry.issuesFound).toBeDefined();
            expect(latestEntry.actionsPerformed).toBeDefined();
        });
    });

    describe('Enhanced Discord ID Detection', () => {
        test('should exclude Discord mentions from detection', () => {
            const testMessages = [
                'Hey <@123456789012345678> check this out',
                'Thanks <@!987654321098765432> for the help',
                'Join <#555666777888999000> for discussion',
                'The <@&111222333444555666> role was updated'
            ];

            testMessages.forEach(message => {
                const result = doxDetector.detectPersonalInfo(message, 'test-guild');
                
                expect(result.detected).toBe(false);
                expect(result.detections).toHaveLength(0);
                expect(result.riskLevel).toBe('none');
            });
        });

        test('should track Discord ID match statistics', () => {
            const initialMatchCount = doxDetector.exceptions._global.discordIds.matchCount || 0;
            
            // Trigger some matches
            doxDetector.checkExceptions('test-guild', 'User 123456789012345678 joined', 'any-type');
            doxDetector.checkExceptions('test-guild', 'Hey <@987654321098765432>', 'any-type');
            
            const config = doxDetector.exceptions._global.discordIds;
            expect(config.matchCount).toBeGreaterThan(initialMatchCount);
            expect(config.lastMatched).toBeDefined();
            expect(config.matchHistory).toBeDefined();
            expect(config.matchHistory.main).toBeDefined();
            expect(config.matchHistory.mentions).toBeDefined();
        });

        test('should handle custom emoji IDs correctly', () => {
            const emojiMessages = [
                'Nice work! <:thumbsup:123456789012345678>',
                'Animated emoji: <a:party:987654321098765432>',
                'Multiple emojis: <:smile:111222333444555666> <:wink:777888999000111222>'
            ];

            emojiMessages.forEach(message => {
                const result = doxDetector.detectPersonalInfo(message, 'test-guild');
                
                expect(result.detected).toBe(false);
                expect(result.detections).toHaveLength(0);
                expect(result.riskLevel).toBe('none');
            });
        });

        test('should still detect real personal info with Discord IDs present', () => {
            const mixedMessages = [
                {
                    message: 'User <@123456789012345678> shared phone: 555-123-4567',
                    expectedType: 'phone'
                },
                {
                    message: 'Contact <@!987654321098765432> at john@example.com',
                    expectedType: 'email'
                },
                {
                    message: 'User ID 555666777888999000 posted SSN: 123-45-6789',
                    expectedType: 'ssn'
                }
            ];

            mixedMessages.forEach(({ message, expectedType }) => {
                const result = doxDetector.detectPersonalInfo(message, 'test-guild');
                
                expect(result.detected).toBe(true);
                expect(result.detections.length).toBeGreaterThan(0);
                
                const detectedTypes = result.detections.map(d => d.type);
                expect(detectedTypes).toContain(expectedType);
            });
        });
    });

    describe('Exception System Integration', () => {
        test('should persist Discord ID exclusions across reloads', () => {
            const originalConfig = { ...doxDetector.exceptions._global.discordIds };
            
            // Reload the detector
            doxDetector.reload();
            
            const reloadedConfig = doxDetector.exceptions._global.discordIds;
            expect(reloadedConfig.enabled).toBe(originalConfig.enabled);
            expect(reloadedConfig.pattern).toBe(originalConfig.pattern);
            expect(reloadedConfig.systemProtected).toBe(originalConfig.systemProtected);
        });

        test('should perform maintenance during reload', () => {
            // Create an issue that needs maintenance
            doxDetector.exceptions._global.discordIds.version = '1.0.0'; // Outdated version
            
            const consoleSpy = jest.spyOn(console, 'log').mockImplementation();
            
            doxDetector.reload();
            
            expect(doxDetector.exceptions._global.discordIds.version).toBe('1.1.0');
            expect(consoleSpy).toHaveBeenCalledWith(
                expect.stringContaining('maintenance')
            );
            
            consoleSpy.mockRestore();
        });

        test('should get comprehensive exception information', () => {
            const exceptionInfo = doxDetector.getExceptionInfo('test-guild');
            
            expect(exceptionInfo.guildId).toBe('test-guild');
            expect(exceptionInfo.globalExceptions).toBeDefined();
            expect(exceptionInfo.discordIdExclusion).toBeDefined();
            expect(exceptionInfo.validation).toBeDefined();
            expect(exceptionInfo.discordIdStats).toBeDefined();
            expect(exceptionInfo.summary).toBeDefined();
            expect(exceptionInfo.summary.discordIdExclusionEnabled).toBe(true);
            expect(exceptionInfo.summary.discordIdExclusionValid).toBe(true);
        });

        test('should get Discord ID exclusion statistics', () => {
            const stats = doxDetector.getDiscordIdExclusionStats();
            
            expect(stats.enabled).toBe(true);
            expect(stats.pattern).toBe('\\b\\d{17,19}\\b');
            expect(stats.valid).toBe(true);
            expect(stats.statistics).toBeDefined();
            expect(stats.statistics.discordIdExclusionPresent).toBe(true);
        });
    });

    describe('Error Handling and Edge Cases', () => {
        test('should handle corrupted exception files gracefully', () => {
            // Write corrupted JSON to exception file
            const exceptionsPath = path.join(process.cwd(), 'data/dox_exceptions.json');
            fs.writeFileSync(exceptionsPath, '{ invalid json }', 'utf8');
            
            // Should not throw error and should create valid configuration
            const newDetector = new DoxDetector(mockWarnManager, mockReportManager);
            
            expect(newDetector.exceptions._global).toBeDefined();
            expect(newDetector.exceptions._global.discordIds).toBeDefined();
            expect(newDetector.exceptions._global.discordIds.enabled).toBe(true);
        });

        test('should handle missing exception files', () => {
            const exceptionsPath = path.join(process.cwd(), 'data/dox_exceptions.json');
            if (fs.existsSync(exceptionsPath)) {
                fs.unlinkSync(exceptionsPath);
            }
            
            const newDetector = new DoxDetector(mockWarnManager, mockReportManager);
            
            expect(newDetector.exceptions._global).toBeDefined();
            expect(newDetector.exceptions._global.discordIds).toBeDefined();
        });

        test('should handle invalid regex patterns in additional patterns', () => {
            // Add invalid regex pattern
            doxDetector.exceptions._global.discordIds.additionalPatterns.invalid = {
                pattern: '[invalid regex',
                description: 'Invalid pattern',
                enabled: true
            };
            
            const validation = doxDetector.validateDiscordIdExclusions();
            
            expect(validation.valid).toBe(false);
            expect(validation.issues.some(issue => 
                issue.includes("Invalid additional pattern 'invalid'")
            )).toBe(true);
        });

        test('should handle synchronization errors gracefully', () => {
            // Set invalid pattern that will cause synchronization to fail
            doxDetector.exceptions._global.discordIds.pattern = '[invalid';
            
            // Should not throw error
            expect(() => {
                doxDetector.synchronizeDiscordIdPatterns();
            }).not.toThrow();
            
            // Should fall back to default pattern
            expect(doxDetector.discordIdPattern.source).toBe('\\b\\d{17,19}\\b');
        });
    });
});

// Run basic tests at the end
setTimeout(() => {
    console.log('\n🔧 Running basic Discord ID exception system tests...');
    
    try {
        const mockWarn = new MockWarnManager();
        const mockReport = new MockReportManager();
        const detector = new DoxDetector(mockWarn, mockReport, TEST_DOX_FILE);
        
        // Test automatic Discord ID exclusion creation
        const globalExceptions = detector.exceptions._global;
        if (globalExceptions && globalExceptions.discordIds && globalExceptions.discordIds.enabled) {
            console.log('  ✅ Automatic Discord ID exclusion creation test passed');
        } else {
            console.log('  ❌ Automatic Discord ID exclusion creation test failed');
        }
        
        // Test validation
        const validation = detector.validateDiscordIdExclusions();
        if (validation.valid && validation.issues.length === 0) {
            console.log('  ✅ Discord ID exclusion validation test passed');
        } else {
            console.log('  ❌ Discord ID exclusion validation test failed');
        }
        
        // Test mention exclusion
        const mentionResult = detector.detectPersonalInfo('Hey <@123456789012345678> check this', 'test-guild');
        if (!mentionResult.detected && mentionResult.detections.length === 0) {
            console.log('  ✅ Discord mention exclusion test passed');
        } else {
            console.log('  ❌ Discord mention exclusion test failed');
        }
        
        // Test maintenance
        const maintenanceResult = detector.maintainDiscordIdExclusions();
        if (maintenanceResult.success) {
            console.log('  ✅ Discord ID exclusion maintenance test passed');
        } else {
            console.log('  ❌ Discord ID exclusion maintenance test failed');
        }
        
        console.log('\n🎉 Basic Discord ID exception system tests completed successfully!');
        
    } catch (error) {
        console.error('❌ Test failed:', error.message);
        console.error(error.stack);
    } finally {
        // Cleanup
        [TEST_DOX_FILE, TEST_EXCEPTIONS_FILE].forEach(file => {
            if (fs.existsSync(file)) {
                fs.unlinkSync(file);
            }
        });
    }
}, 100);