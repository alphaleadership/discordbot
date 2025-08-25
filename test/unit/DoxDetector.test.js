import DoxDetector from '../../utils/managers/DoxDetector.js';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Test configuration
const TEST_DATA_DIR = path.join(__dirname, '../test-data');
const TEST_DOX_FILE = path.join(TEST_DATA_DIR, 'test-dox-detections.json');
const TEST_EXCEPTIONS_FILE = path.join(TEST_DATA_DIR, 'test-dox-exceptions.json');

// Mock dependencies
class MockWarnManager {
    constructor() {
        this.warnings = [];
    }

    async addWarning(userId, guildId, reason, moderatorId) {
        const warning = {
            id: Date.now().toString(),
            userId,
            guildId,
            reason,
            moderatorId,
            timestamp: new Date().toISOString()
        };
        this.warnings.push(warning);
        return { success: true, warning };
    }

    getWarnings(userId, guildId) {
        return this.warnings.filter(w => w.userId === userId && w.guildId === guildId);
    }
}

class MockReportManager {
    constructor() {
        this.reports = [];
    }

    async sendDoxAlert(client, guildId, embed) {
        this.reports.push({ type: 'dox', guildId, embed });
        return { success: true };
    }
}

describe('DoxDetector', () => {
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
            TEST_DOX_FILE,
            TEST_EXCEPTIONS_FILE
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

    describe('Phone Number Detection', () => {
        const phoneTestCases = {
            positive: [
                '+1 (555) 123-4567',
                '555-123-4567',
                '5551234567',
                '+33 1 23 45 67 89',
                '+44 20 7946 0958',
                '+49 30 12345678',
                '(555) 123-4567',
                '555.123.4567'
            ],
            negative: [
                'Call me at five five five',
                'Phone: not available',
                '123-45-6789', // SSN format
                'Random numbers: 12345',
                'Version 1.2.3.4',
                'IP: 192.168.1.1'
            ]
        };

        test('should detect valid phone numbers', () => {
            phoneTestCases.positive.forEach(phone => {
                const result = doxDetector.detectPersonalInfo(phone, 'test-guild');
                const phoneDetected = result.detections.some(d => d.type === 'phone');
                expect(phoneDetected).toBe(true);
            });
        });

        test('should not detect invalid phone patterns', () => {
            phoneTestCases.negative.forEach(text => {
                const result = doxDetector.detectPersonalInfo(text, 'test-guild');
                const phoneDetected = result.detections.some(d => d.type === 'phone');
                expect(phoneDetected).toBe(false);
            });
        });
    });

    describe('Email Detection', () => {
        const emailTestCases = {
            positive: [
                'john.doe@example.com',
                'user+tag@domain.co.uk',
                'test.email123@subdomain.example.org',
                'simple@test.fr',
                'contact@company-name.com',
                'support@my-site.net'
            ],
            negative: [
                'not-an-email',
                '@domain.com',
                'user@',
                'email without domain',
                'fake@',
                '@fake.com'
            ]
        };

        test('should detect valid email addresses', () => {
            emailTestCases.positive.forEach(email => {
                const result = doxDetector.detectPersonalInfo(email, 'test-guild');
                const emailDetected = result.detections.some(d => d.type === 'email');
                expect(emailDetected).toBe(true);
            });
        });

        test('should not detect invalid email patterns', () => {
            emailTestCases.negative.forEach(text => {
                const result = doxDetector.detectPersonalInfo(text, 'test-guild');
                const emailDetected = result.detections.some(d => d.type === 'email');
                expect(emailDetected).toBe(false);
            });
        });
    });

    describe('SSN Detection', () => {
        const ssnTestCases = {
            positive: [
                '123-45-6789',
                '123456789',
                '987-65-4321',
                'SSN: 555-44-3333'
            ],
            negative: [
                '123-456-7890', // Too many digits
                '12-34-5678', // Wrong format
                'SSN: not provided',
                '000-00-0000', // Invalid SSN
                '123-00-0000' // Invalid SSN
            ]
        };

        test('should detect valid SSN patterns', () => {
            ssnTestCases.positive.forEach(ssn => {
                const result = doxDetector.detectPersonalInfo(ssn, 'test-guild');
                const ssnDetected = result.detections.some(d => d.type === 'ssn');
                expect(ssnDetected).toBe(true);
            });
        });

        test('should not detect invalid SSN patterns', () => {
            ssnTestCases.negative.forEach(text => {
                const result = doxDetector.detectPersonalInfo(text, 'test-guild');
                const ssnDetected = result.detections.some(d => d.type === 'ssn');
                expect(ssnDetected).toBe(false);
            });
        });
    });

    describe('Credit Card Detection', () => {
        const ccTestCases = {
            positive: [
                '4532 1234 5678 9012',
                '4532-1234-5678-9012',
                '4532123456789012',
                '5555 5555 5555 4444',
                '378282246310005' // American Express
            ],
            negative: [
                '1234', // Too short
                '4532 1234 5678', // Incomplete
                'Credit card: hidden',
                '0000 0000 0000 0000' // Invalid
            ]
        };

        test('should detect valid credit card numbers', () => {
            ccTestCases.positive.forEach(cc => {
                const result = doxDetector.detectPersonalInfo(cc, 'test-guild');
                const ccDetected = result.detections.some(d => d.type === 'creditCard');
                expect(ccDetected).toBe(true);
            });
        });

        test('should not detect invalid credit card patterns', () => {
            ccTestCases.negative.forEach(text => {
                const result = doxDetector.detectPersonalInfo(text, 'test-guild');
                const ccDetected = result.detections.some(d => d.type === 'creditCard');
                expect(ccDetected).toBe(false);
            });
        });
    });

    describe('Address Detection', () => {
        const addressTestCases = {
            positive: [
                '123 Main Street',
                '456 Oak Avenue',
                '789 Elm Road',
                '12345', // ZIP code
                '90210-1234', // ZIP+4
                '1600 Pennsylvania Avenue'
            ],
            negative: [
                'Street without number',
                'Main Street', // No number
                'Address: confidential',
                'Street'
            ]
        };

        test('should detect address patterns', () => {
            addressTestCases.positive.forEach(address => {
                const result = doxDetector.detectPersonalInfo(address, 'test-guild');
                const addressDetected = result.detections.some(d => d.type === 'address');
                expect(addressDetected).toBe(true);
            });
        });

        test('should not detect non-address patterns', () => {
            addressTestCases.negative.forEach(text => {
                const result = doxDetector.detectPersonalInfo(text, 'test-guild');
                const addressDetected = result.detections.some(d => d.type === 'address');
                expect(addressDetected).toBe(false);
            });
        });
    });

    describe('Risk Level Calculation', () => {
        test('should calculate low risk for single detection', () => {
            const result = doxDetector.detectPersonalInfo('My phone is 555-123-4567', 'test-guild');
            expect(result.riskLevel).toBe('low');
        });

        test('should calculate medium risk for multiple detections', () => {
            const result = doxDetector.detectPersonalInfo(
                'Call me at 555-123-4567 or email john@example.com',
                'test-guild'
            );
            expect(result.riskLevel).toBe('medium');
        });

        test('should calculate high risk for sensitive information', () => {
            const result = doxDetector.detectPersonalInfo(
                'My SSN is 123-45-6789 and email is john@example.com',
                'test-guild'
            );
            expect(result.riskLevel).toBe('high');
        });

        test('should calculate critical risk for multiple sensitive items', () => {
            const result = doxDetector.detectPersonalInfo(
                'SSN: 123-45-6789, Credit Card: 4532 1234 5678 9012',
                'test-guild'
            );
            expect(result.riskLevel).toBe('critical');
        });

        test('should return none for no detections', () => {
            const result = doxDetector.detectPersonalInfo('Just a normal message', 'test-guild');
            expect(result.riskLevel).toBe('none');
        });
    });

    describe('Content Censoring', () => {
        test('should censor phone numbers', () => {
            const censored = doxDetector.censorMatch('555-123-4567', 'phone');
            expect(censored).toContain('*');
            expect(censored).not.toBe('555-123-4567');
        });

        test('should partially censor emails', () => {
            const censored = doxDetector.censorMatch('john@example.com', 'email');
            expect(censored).toContain('j***@example.com');
        });

        test('should fully censor SSN', () => {
            const censored = doxDetector.censorMatch('123-45-6789', 'ssn');
            expect(censored).toBe('***-**-****');
        });

        test('should censor credit cards', () => {
            const censored = doxDetector.censorMatch('4532 1234 5678 9012', 'creditCard');
            expect(censored).toContain('*');
            expect(censored).not.toBe('4532 1234 5678 9012');
        });
    });

    describe('Exception System', () => {
        test('should add exception successfully', () => {
            const result = doxDetector.addException(
                'test-guild',
                'email',
                'support@company.com',
                'exact',
                'Company support email',
                'moderator-id'
            );

            expect(result.success).toBe(true);
            expect(result.exception).toBeDefined();
            expect(result.exception.id).toBeDefined();
        });

        test('should prevent detection for excepted content', () => {
            // Add exception
            doxDetector.addException(
                'test-guild',
                'email',
                'support@company.com',
                'exact',
                'Company support email',
                'moderator-id'
            );

            // Test content with excepted email
            const result = doxDetector.detectPersonalInfo(
                'Contact us at support@company.com for help',
                'test-guild'
            );

            const emailDetected = result.detections.some(d => d.type === 'email');
            expect(emailDetected).toBe(false);
        });

        test('should still detect non-excepted content', () => {
            // Add exception for specific email
            doxDetector.addException(
                'test-guild',
                'email',
                'support@company.com',
                'exact',
                'Company support email',
                'moderator-id'
            );

            // Test with different email
            const result = doxDetector.detectPersonalInfo(
                'My personal email is personal@gmail.com',
                'test-guild'
            );

            const emailDetected = result.detections.some(d => d.type === 'email');
            expect(emailDetected).toBe(true);
        });

        test('should handle pattern-based exceptions', () => {
            // Add pattern exception
            doxDetector.addException(
                'test-guild',
                'email',
                '@company.com',
                'pattern',
                'All company emails',
                'moderator-id'
            );

            // Test with company email
            const result = doxDetector.detectPersonalInfo(
                'Contact sales@company.com or support@company.com',
                'test-guild'
            );

            const emailDetected = result.detections.some(d => d.type === 'email');
            expect(emailDetected).toBe(false);
        });

        test('should remove exception', () => {
            // Add exception
            const addResult = doxDetector.addException(
                'test-guild',
                'email',
                'support@company.com',
                'exact',
                'Company support email',
                'moderator-id'
            );

            const exceptionId = addResult.exception.id;

            // Remove exception
            const removeResult = doxDetector.removeException('test-guild', exceptionId);
            expect(removeResult.success).toBe(true);

            // Test that detection now works
            const result = doxDetector.detectPersonalInfo(
                'Contact us at support@company.com',
                'test-guild'
            );

            const emailDetected = result.detections.some(d => d.type === 'email');
            expect(emailDetected).toBe(true);
        });
    });

    describe('OCR Functionality', () => {
        test('should handle OCR processing', async () => {
            // Mock attachment
            const mockAttachment = {
                url: 'https://example.com/image.png',
                contentType: 'image/png',
                size: 1024000
            };

            // Note: This would require actual OCR implementation
            // For now, we test the interface
            const result = await doxDetector.scanImageForText(mockAttachment);
            
            expect(result).toBeDefined();
            expect(typeof result.success).toBe('boolean');
        });

        test('should handle OCR errors gracefully', async () => {
            const invalidAttachment = {
                url: 'invalid-url',
                contentType: 'text/plain',
                size: 0
            };

            const result = await doxDetector.scanImageForText(invalidAttachment);
            
            expect(result.success).toBe(false);
            expect(result.error).toBeDefined();
        });

        test('should reject oversized images', async () => {
            const oversizedAttachment = {
                url: 'https://example.com/huge-image.png',
                contentType: 'image/png',
                size: 50 * 1024 * 1024 // 50MB
            };

            const result = await doxDetector.scanImageForText(oversizedAttachment);
            
            expect(result.success).toBe(false);
            expect(result.error).toContain('size');
        });
    });

    describe('Message Handling', () => {
        test('should handle message with personal info', async () => {
            const mockMessage = {
                id: 'message-id',
                content: 'My phone number is 555-123-4567',
                author: {
                    id: 'user-id',
                    tag: 'TestUser#1234'
                },
                guild: {
                    id: 'test-guild'
                },
                channel: {
                    id: 'channel-id'
                },
                delete: jest.fn().mockResolvedValue(true),
                reply: jest.fn().mockResolvedValue(true)
            };

            const result = await doxDetector.handleDetection(mockMessage, {
                detections: [{ type: 'phone', match: '555-123-4567', censored: '***-***-****' }],
                riskLevel: 'low'
            });

            expect(result.success).toBe(true);
            expect(result.action).toBe('deleted');
        });

        test('should escalate for repeat offenders', async () => {
            const userId = 'repeat-user';
            const guildId = 'test-guild';

            // Add previous warnings
            await mockWarnManager.addWarning(userId, guildId, 'Previous dox attempt', 'mod-id');
            await mockWarnManager.addWarning(userId, guildId, 'Another dox attempt', 'mod-id');

            const mockMessage = {
                id: 'message-id',
                content: 'SSN: 123-45-6789',
                author: {
                    id: userId,
                    tag: 'RepeatUser#1234'
                },
                guild: {
                    id: guildId
                },
                channel: {
                    id: 'channel-id'
                },
                delete: jest.fn().mockResolvedValue(true),
                reply: jest.fn().mockResolvedValue(true)
            };

            const result = await doxDetector.handleDetection(mockMessage, {
                detections: [{ type: 'ssn', match: '123-45-6789', censored: '***-**-****' }],
                riskLevel: 'high'
            });

            expect(result.success).toBe(true);
            expect(result.escalated).toBe(true);
        });
    });

    describe('Statistics and Logging', () => {
        test('should track detection statistics', () => {
            // Generate some detections
            doxDetector.detectPersonalInfo('Phone: 555-123-4567', 'test-guild');
            doxDetector.detectPersonalInfo('Email: test@example.com', 'test-guild');
            doxDetector.detectPersonalInfo('SSN: 123-45-6789', 'test-guild');

            const stats = doxDetector.getDetectionStats('test-guild');
            
            expect(stats.total).toBeGreaterThan(0);
            expect(stats.byType).toBeDefined();
            expect(stats.byRiskLevel).toBeDefined();
        });

        test('should get recent detections', () => {
            // Add some detections
            doxDetector.logDetection('test-guild', 'user-id', {
                type: 'phone',
                match: '555-123-4567',
                riskLevel: 'low'
            });

            const recent = doxDetector.getRecentDetections('test-guild', 24); // Last 24 hours
            
            expect(Array.isArray(recent)).toBe(true);
            expect(recent.length).toBeGreaterThan(0);
        });
    });

    describe('Error Handling', () => {
        test('should handle file system errors', () => {
            // Create detector with invalid file path
            const invalidDetector = new DoxDetector(
                mockWarnManager,
                mockReportManager,
                '/invalid/path/detections.json'
            );

            const result = invalidDetector.detectPersonalInfo('test content', 'test-guild');
            
            expect(result).toBeDefined();
            expect(result.detections).toBeDefined();
        });

        test('should handle corrupted exception file', () => {
            // Write invalid JSON to exception file
            fs.writeFileSync(TEST_EXCEPTIONS_FILE, 'invalid json content');
            
            // Detector should handle this gracefully
            const detector = new DoxDetector(
                mockWarnManager,
                mockReportManager,
                TEST_DOX_FILE,
                TEST_EXCEPTIONS_FILE
            );
            
            expect(detector.exceptions).toEqual({});
        });

        test('should handle invalid input gracefully', () => {
            const result = doxDetector.detectPersonalInfo(null, null);
            
            expect(result.detections).toEqual([]);
            expect(result.riskLevel).toBe('none');
        });
    });
});

// Simple test runner for environments without Jest
if (process.argv[1] === fileURLToPath(import.meta.url)) {
    console.log('🧪 Running DoxDetector Unit Tests...\n');
    
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
    global.jest = {
        fn: () => ({
            mockResolvedValue: (value) => () => Promise.resolve(value)
        })
    };
    
    global.expect = (actual) => ({
        toBe: (expected) => {
            if (actual !== expected) {
                throw new Error(`Expected ${expected}, got ${actual}`);
            }
        },
        toEqual: (expected) => {
            if (JSON.stringify(actual) !== JSON.stringify(expected)) {
                throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
            }
        },
        toBeDefined: () => {
            if (actual === undefined) {
                throw new Error('Expected value to be defined');
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
        }
    });
    
    // Run basic tests
    console.log('Running basic DoxDetector tests...');
    
    try {
        const mockWarn = new MockWarnManager();
        const mockReport = new MockReportManager();
        const detector = new DoxDetector(mockWarn, mockReport, TEST_DOX_FILE);
        
        // Test phone detection
        const phoneResult = detector.detectPersonalInfo('Call me at 555-123-4567', 'test-guild');
        const phoneDetected = phoneResult.detections.some(d => d.type === 'phone');
        if (phoneDetected) {
            console.log('  ✅ Phone detection test passed');
        } else {
            console.log('  ❌ Phone detection test failed');
        }
        
        // Test email detection
        const emailResult = detector.detectPersonalInfo('Email me at test@example.com', 'test-guild');
        const emailDetected = emailResult.detections.some(d => d.type === 'email');
        if (emailDetected) {
            console.log('  ✅ Email detection test passed');
        } else {
            console.log('  ❌ Email detection test failed');
        }
        
        // Test risk level calculation
        const riskResult = detector.detectPersonalInfo('SSN: 123-45-6789, CC: 4532 1234 5678 9012', 'test-guild');
        if (riskResult.riskLevel === 'critical') {
            console.log('  ✅ Risk level calculation test passed');
        } else {
            console.log('  ❌ Risk level calculation test failed');
        }
        
        console.log('\n🎉 Basic DoxDetector tests completed successfully!');
        
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