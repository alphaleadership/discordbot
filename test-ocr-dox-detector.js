import DoxDetector from './utils/managers/DoxDetector.js';
import { WarnManager } from './utils/WarnManager.js';
import { ReportManager } from './utils/ReportManager.js';
import fs from 'fs';

// Mock managers for testing
const mockWarnManager = new WarnManager('test_warnings.json');
const mockReportManager = new ReportManager();

// Create test instance
const doxDetector = new DoxDetector(mockWarnManager, mockReportManager, 'test_dox_detections.json');

// Test OCR functionality
async function testOCRFunctionality() {
    console.log('🔍 Testing OCR Functionality...\n');
    
    // Test image format detection
    console.log('Testing image format detection:');
    
    const testAttachments = [
        { name: 'test.jpg', contentType: 'image/jpeg' },
        { name: 'test.png', contentType: 'image/png' },
        { name: 'test.gif', contentType: 'image/gif' },
        { name: 'document.pdf', contentType: 'application/pdf' },
        { name: 'image.webp', contentType: 'image/webp' },
        { name: 'photo.JPG' }, // No content type, should check extension
        { name: 'text.txt', contentType: 'text/plain' }
    ];
    
    let passed = 0;
    let total = 0;
    
    for (const attachment of testAttachments) {
        total++;
        const isImage = doxDetector.isImageAttachment(attachment);
        const shouldBeImage = ['test.jpg', 'test.png', 'test.gif', 'image.webp', 'photo.JPG'].includes(attachment.name);
        
        if (isImage === shouldBeImage) {
            console.log(`  ✅ PASS: ${attachment.name} - ${isImage ? 'detected as image' : 'not detected as image'}`);
            passed++;
        } else {
            console.log(`  ❌ FAIL: ${attachment.name} - Expected: ${shouldBeImage}, Got: ${isImage}`);
        }
    }
    
    console.log(`\n📊 Image Detection Tests: ${passed}/${total} passed\n`);
    
    // Test combined risk level calculation
    console.log('Testing combined risk level calculation:');
    
    const riskTestCases = [
        {
            detections: [],
            expected: 'none',
            description: 'No detections'
        },
        {
            detections: [{ analysis: { riskLevel: 'low' } }],
            expected: 'low',
            description: 'Single low risk'
        },
        {
            detections: [
                { analysis: { riskLevel: 'low' } },
                { analysis: { riskLevel: 'medium' } }
            ],
            expected: 'medium',
            description: 'Low + medium risk'
        },
        {
            detections: [
                { analysis: { riskLevel: 'high' } },
                { analysis: { riskLevel: 'low' } }
            ],
            expected: 'high',
            description: 'High + low risk'
        },
        {
            detections: [
                { analysis: { riskLevel: 'critical' } },
                { analysis: { riskLevel: 'medium' } }
            ],
            expected: 'critical',
            description: 'Critical + medium risk'
        }
    ];
    
    let riskPassed = 0;
    let riskTotal = riskTestCases.length;
    
    for (const testCase of riskTestCases) {
        const result = doxDetector.calculateCombinedRiskLevel(testCase.detections);
        
        if (result === testCase.expected) {
            console.log(`  ✅ PASS: ${testCase.description} - Risk level: ${result}`);
            riskPassed++;
        } else {
            console.log(`  ❌ FAIL: ${testCase.description} - Expected: ${testCase.expected}, Got: ${result}`);
        }
    }
    
    console.log(`\n📊 Risk Level Tests: ${riskPassed}/${riskTotal} passed\n`);
    
    // Test message analysis structure (without actual OCR)
    console.log('Testing message analysis structure:');
    
    const mockMessage = {
        id: 'test-message-123',
        author: { id: 'test-user-456' },
        guild: { id: 'test-guild-789' },
        content: 'My phone number is 555-123-4567',
        attachments: new Map() // Empty attachments for this test
    };
    
    try {
        const analysis = await doxDetector.analyzeMessage(mockMessage);
        
        const requiredFields = ['messageId', 'userId', 'guildId', 'timestamp', 'textAnalysis', 'imageAnalysis', 'overallRisk', 'hasDetections'];
        let structureValid = true;
        
        for (const field of requiredFields) {
            if (!(field in analysis)) {
                console.log(`  ❌ FAIL: Missing field: ${field}`);
                structureValid = false;
            }
        }
        
        if (structureValid && analysis.textAnalysis && analysis.textAnalysis.detected) {
            console.log('  ✅ PASS: Message analysis structure is valid');
            console.log('  ✅ PASS: Text analysis detected personal information');
            console.log(`  ✅ PASS: Overall risk level: ${analysis.overallRisk}`);
        } else if (structureValid) {
            console.log('  ✅ PASS: Message analysis structure is valid');
            console.log('  ❌ FAIL: Text analysis should have detected phone number');
        }
        
    } catch (error) {
        console.log(`  ❌ FAIL: Message analysis threw error: ${error.message}`);
    }
    
    console.log('\n🎯 OCR Testing Complete!');
    console.log('Note: Actual OCR testing requires real images and network access.');
    console.log('The OCR functionality is ready for integration with Discord message handling.');
    
    // Cleanup
    try {
        if (fs.existsSync('test_dox_detections.json')) {
            fs.unlinkSync('test_dox_detections.json');
        }
        if (fs.existsSync('test_warnings.json')) {
            fs.unlinkSync('test_warnings.json');
        }
        console.log('\n🧹 Test cleanup completed.');
    } catch (error) {
        console.log('\n⚠️  Test cleanup had some issues:', error.message);
    }
}

// Run the OCR tests
testOCRFunctionality().catch(console.error);