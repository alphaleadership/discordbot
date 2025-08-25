import DoxDetector from './utils/managers/DoxDetector.js';
import { WarnManager } from './utils/WarnManager.js';
import { ReportManager } from './utils/ReportManager.js';
import fs from 'fs';
import path from 'path';

// Mock managers for testing
const mockWarnManager = new WarnManager('test_warnings.json');
const mockReportManager = new ReportManager();

// Create test instance
const doxDetector = new DoxDetector(mockWarnManager, mockReportManager, 'test_dox_detections.json');

// Test data
const testCases = {
    phone: {
        positive: [
            '+1 (555) 123-4567',
            '555-123-4567',
            '5551234567',
            '+33 1 23 45 67 89',
            '+44 20 7946 0958',
            '+49 30 12345678'
        ],
        negative: [
            'Call me at five five five',
            'Phone: not available',
            '123-45-6789', // This is SSN format, not phone
            'Random numbers: 12345'
        ]
    },
    email: {
        positive: [
            'john.doe@example.com',
            'user+tag@domain.co.uk',
            'test.email123@subdomain.example.org',
            'simple@test.fr'
        ],
        negative: [
            'not-an-email',
            '@domain.com',
            'user@',
            'email without domain'
        ]
    },
    ssn: {
        positive: [
            '123-45-6789',
            '123456789',
            '987-65-4321'
        ],
        negative: [
            '123-456-7890', // Too many digits
            '12-34-5678', // Wrong format
            'SSN: not provided'
        ]
    },
    creditCard: {
        positive: [
            '4532 1234 5678 9012',
            '4532-1234-5678-9012',
            '4532123456789012',
            '5555 5555 5555 4444'
        ],
        negative: [
            '1234', // Too short
            '4532 1234 5678', // Incomplete
            'Credit card: hidden'
        ]
    },
    address: {
        positive: [
            '123 Main Street',
            '456 Oak Avenue',
            '789 Elm Road',
            '12345', // ZIP code
            '90210-1234' // ZIP+4
        ],
        negative: [
            'Street without number',
            'Main Street', // No number
            'Address: confidential'
        ]
    },
    fullName: {
        positive: [
            'My name is John Doe',
            'I am Jane Smith',
            'Call me Mike Johnson',
            'Real name: Sarah Wilson'
        ],
        negative: [
            'My name is john', // Single name
            'I am happy',
            'Call me later'
        ]
    }
};

// Test functions
function runPatternTests() {
    console.log('🧪 Running DoxDetector Pattern Tests...\n');
    
    let totalTests = 0;
    let passedTests = 0;
    
    for (const [type, cases] of Object.entries(testCases)) {
        console.log(`Testing ${type} patterns:`);
        
        // Test positive cases (should detect)
        for (const testText of cases.positive) {
            totalTests++;
            const result = doxDetector.detectPersonalInfo(testText, 'test-guild');
            const detected = result.detections.some(d => d.type === type);
            
            if (detected) {
                console.log(`  ✅ PASS: "${testText}" detected as ${type}`);
                passedTests++;
            } else {
                console.log(`  ❌ FAIL: "${testText}" should be detected as ${type}`);
            }
        }
        
        // Test negative cases (should not detect)
        for (const testText of cases.negative) {
            totalTests++;
            const result = doxDetector.detectPersonalInfo(testText, 'test-guild');
            const detected = result.detections.some(d => d.type === type);
            
            if (!detected) {
                console.log(`  ✅ PASS: "${testText}" correctly not detected as ${type}`);
                passedTests++;
            } else {
                console.log(`  ❌ FAIL: "${testText}" should not be detected as ${type}`);
            }
        }
        
        console.log('');
    }
    
    console.log(`📊 Test Results: ${passedTests}/${totalTests} tests passed (${Math.round(passedTests/totalTests*100)}%)`);
    return { totalTests, passedTests };
}

function testExceptionSystem() {
    console.log('\n🔧 Testing Exception System...\n');
    
    const guildId = 'test-guild-exceptions';
    let testsPassed = 0;
    let totalTests = 0;
    
    // Test adding exceptions
    totalTests++;
    const exception = doxDetector.addException(
        guildId, 
        'email', 
        'support@company.com', 
        'exact', 
        'Company support email', 
        'test-moderator'
    );
    
    if (exception && exception.id) {
        console.log('✅ PASS: Exception added successfully');
        testsPassed++;
    } else {
        console.log('❌ FAIL: Exception not added');
    }
    
    // Test exception matching
    totalTests++;
    const testContent = 'Contact us at support@company.com for help';
    const result = doxDetector.detectPersonalInfo(testContent, guildId);
    const emailDetected = result.detections.some(d => d.type === 'email');
    
    if (!emailDetected) {
        console.log('✅ PASS: Exception correctly prevented detection');
        testsPassed++;
    } else {
        console.log('❌ FAIL: Exception did not prevent detection');
    }
    
    // Test non-excepted content still gets detected
    totalTests++;
    const nonExceptedContent = 'My email is personal@gmail.com';
    const result2 = doxDetector.detectPersonalInfo(nonExceptedContent, guildId);
    const emailDetected2 = result2.detections.some(d => d.type === 'email');
    
    if (emailDetected2) {
        console.log('✅ PASS: Non-excepted content still detected');
        testsPassed++;
    } else {
        console.log('❌ FAIL: Non-excepted content not detected');
    }
    
    console.log(`📊 Exception Tests: ${testsPassed}/${totalTests} tests passed`);
    return { totalTests, testsPassed };
}

function testRiskLevels() {
    console.log('\n⚠️  Testing Risk Level Calculation...\n');
    
    const testCases = [
        {
            content: 'My phone is 555-123-4567',
            expectedLevel: 'low',
            description: 'Single phone number'
        },
        {
            content: 'Call me at 555-123-4567 or email john@example.com',
            expectedLevel: 'medium',
            description: 'Phone + email'
        },
        {
            content: 'My SSN is 123-45-6789 and credit card is 4532 1234 5678 9012',
            expectedLevel: 'critical',
            description: 'SSN + credit card'
        },
        {
            content: 'Just a normal message',
            expectedLevel: 'none',
            description: 'No personal info'
        }
    ];
    
    let testsPassed = 0;
    let totalTests = testCases.length;
    
    for (const testCase of testCases) {
        const result = doxDetector.detectPersonalInfo(testCase.content, 'test-guild');
        
        if (result.riskLevel === testCase.expectedLevel) {
            console.log(`✅ PASS: ${testCase.description} - Risk level: ${result.riskLevel}`);
            testsPassed++;
        } else {
            console.log(`❌ FAIL: ${testCase.description} - Expected: ${testCase.expectedLevel}, Got: ${result.riskLevel}`);
        }
    }
    
    console.log(`📊 Risk Level Tests: ${testsPassed}/${totalTests} tests passed`);
    return { totalTests, testsPassed };
}

function testCensoring() {
    console.log('\n🔒 Testing Content Censoring...\n');
    
    const testCases = [
        {
            type: 'phone',
            input: '555-123-4567',
            shouldContain: '*'
        },
        {
            type: 'email',
            input: 'john@example.com',
            shouldContain: 'j***@example.com'
        },
        {
            type: 'ssn',
            input: '123-45-6789',
            shouldContain: '*'
        }
    ];
    
    let testsPassed = 0;
    let totalTests = testCases.length;
    
    for (const testCase of testCases) {
        const censored = doxDetector.censorMatch(testCase.input, testCase.type);
        
        if (censored.includes(testCase.shouldContain)) {
            console.log(`✅ PASS: ${testCase.type} censored correctly: ${censored}`);
            testsPassed++;
        } else {
            console.log(`❌ FAIL: ${testCase.type} not censored properly: ${censored}`);
        }
    }
    
    console.log(`📊 Censoring Tests: ${testsPassed}/${totalTests} tests passed`);
    return { totalTests, testsPassed };
}

// Run all tests
async function runAllTests() {
    console.log('🚀 Starting DoxDetector Test Suite\n');
    
    const results = [];
    
    results.push(runPatternTests());
    results.push(testExceptionSystem());
    results.push(testRiskLevels());
    results.push(testCensoring());
    
    // Calculate overall results
    const totalTests = results.reduce((sum, result) => sum + result.totalTests, 0);
    const totalPassed = results.reduce((sum, result) => sum + result.testsPassed, 0);
    const successRate = totalTests > 0 ? Math.round((totalPassed / totalTests) * 100) : 0;
    
    console.log('\n' + '='.repeat(50));
    console.log(`🎯 OVERALL RESULTS: ${totalPassed}/${totalTests} tests passed (${successRate}%)`);
    
    if (successRate >= 90) {
        console.log('🎉 Excellent! Pattern detection is working well.');
    } else if (successRate >= 75) {
        console.log('⚠️  Good, but some improvements needed.');
    } else {
        console.log('❌ Needs significant improvements.');
    }
    
    // Cleanup test files
    try {
        if (fs.existsSync('test_dox_detections.json')) {
            fs.unlinkSync('test_dox_detections.json');
        }
        if (fs.existsSync('test_warnings.json')) {
            fs.unlinkSync('test_warnings.json');
        }
        if (fs.existsSync('data/dox_exceptions.json')) {
            const exceptionsData = JSON.parse(fs.readFileSync('data/dox_exceptions.json', 'utf8'));
            delete exceptionsData['test-guild-exceptions'];
            fs.writeFileSync('data/dox_exceptions.json', JSON.stringify(exceptionsData, null, 2));
        }
        console.log('\n🧹 Test cleanup completed.');
    } catch (error) {
        console.log('\n⚠️  Test cleanup had some issues:', error.message);
    }
}

// Run the tests
runAllTests().catch(console.error);