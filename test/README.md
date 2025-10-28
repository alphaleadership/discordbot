# Test Suite Documentation

This directory contains a comprehensive test suite for the Discord moderation bot, covering unit tests, integration tests, performance tests, and coverage validation.

## Test Structure

```
test/
├── setup.js                    # Global test configuration and mocks
├── mocks/                      # Mock implementations for Discord.js and other dependencies
├── fixtures/                   # Test data fixtures
├── test-data/                  # Runtime test data storage
├── utils/                      # Test utility functions
├── unit/                       # Unit tests for individual components
├── integration/                # End-to-end workflow tests
├── performance/                # Load and performance tests
└── coverage/                   # Coverage validation tests
```

## Test Categories

### Unit Tests (`test/unit/`)
- Test individual components in isolation
- Mock all external dependencies
- Focus on specific functionality and edge cases
- Target: 80%+ coverage for all components, 85%+ for critical components

### Integration Tests (`test/integration/`)
- Test complete workflows end-to-end
- Test interactions between multiple components
- Simulate realistic user scenarios
- Validate data flow and state management

### Performance Tests (`test/performance/`)
- Load testing with high volumes of data/operations
- Benchmark response times and resource usage
- Memory usage validation
- Concurrent operation testing

### Coverage Tests (`test/coverage/`)
- Validate test coverage meets minimum requirements
- Ensure critical components have comprehensive coverage
- Check test quality metrics

## Running Tests

### Basic Test Commands
```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run specific test categories
npm run test:unit
npm run test:integration
npm run test:performance

# Run with coverage
npm run test:coverage

# Run complete test suite
npm run test:all
```

### Coverage Requirements

#### Minimum Coverage Thresholds
- **Overall**: 80% statements, branches, functions, and lines
- **Critical Components**: 85% statements and functions
  - DMTicketManager.js
  - EconomyManager.js
  - ForumReportManager.js
  - AutoConfigManager.js
  - WatchlistManager.js
  - DoxDetector.js

#### Coverage Validation
```bash
# Validate coverage meets requirements
npm run test:coverage:validate

# Generate coverage report
npm run test:coverage
```

## Test Data Management

### Test Data Isolation
- Each test file uses isolated test data
- Temporary files are created in `test/test-data/`
- Cleanup occurs automatically after each test

### Mock Data
- Discord.js components are comprehensively mocked
- External APIs (Telegram, GitHub, OCR) are mocked
- Mock implementations provide realistic behavior

## Performance Benchmarks

### Economy System
- **1000 concurrent transactions**: < 5 seconds
- **500 concurrent transfers**: < 3 seconds
- **10,000 users market calculation**: < 1 second
- **Memory usage**: < 50MB increase for 1000 users

### Ticket System
- **500 concurrent ticket creations**: < 10 seconds
- **1000 message relays**: < 5 seconds
- **10,000 tickets with history**: < 60 seconds setup, < 1 second operations
- **Memory usage**: < 100MB increase for 1000 tickets

### Forum Reports
- **Multiple concurrent reports**: Efficient categorization and linking
- **Cross-guild report management**: Proper isolation and organization
- **Forum unavailability**: Graceful degradation

## Test Quality Standards

### Error Handling
- At least 70% of test files include error handling scenarios
- Test invalid inputs, network failures, and edge cases
- Verify graceful degradation and recovery

### Mock Usage
- At least 80% of test files use proper mocking
- Mock external dependencies consistently
- Clear mocks between tests to prevent interference

### Test Isolation
- Each test is independent and can run in any order
- No shared state between tests
- Proper setup and teardown for each test

## Integration Test Scenarios

### Ticket System Workflows
1. **Complete Ticket Lifecycle**
   - Interactive questionnaire completion
   - Support channel creation and management
   - Message relay between DM and support
   - Ticket resolution and archival

2. **Concurrent Operations**
   - Multiple users creating tickets simultaneously
   - Concurrent message relay operations
   - Data integrity under load

3. **Error Scenarios**
   - Support server unavailability
   - DM channel access issues
   - Network failures and recovery

### Economy System Workflows
1. **Market Dynamics**
   - Currency creation and inflation tracking
   - Market value fluctuations
   - Shop pricing adjustments

2. **Transaction Processing**
   - Peer-to-peer transfers
   - Concurrent transaction handling
   - Balance validation and integrity

3. **Large Scale Operations**
   - Performance with thousands of users
   - Economic statistics generation
   - Memory and resource management

### Forum Report Workflows
1. **Report Management**
   - Cross-guild report creation
   - Categorization and tagging
   - Status updates and resolution

2. **Report Linking**
   - Related report identification
   - Cross-reference management
   - Forum thread organization

3. **Multi-Server Coordination**
   - Reports from multiple source guilds
   - Centralized support server management
   - Permission and access control

## Continuous Integration

### Pre-commit Validation
- All tests must pass before commits
- Coverage thresholds must be met
- Performance benchmarks must be satisfied

### Test Automation
- Automated test execution on code changes
- Coverage reporting and validation
- Performance regression detection

## Troubleshooting

### Common Issues
1. **Test Timeouts**: Increase timeout in vitest.config.js for performance tests
2. **Mock Failures**: Ensure mocks are properly cleared between tests
3. **Coverage Issues**: Check file paths and exclusions in vitest config
4. **Memory Issues**: Use `global.gc()` in performance tests if available

### Debug Mode
```bash
# Run tests with verbose output
npm test -- --reporter=verbose

# Run specific test file
npm test -- test/unit/specific-test.test.js

# Run tests with debugging
node --inspect-brk node_modules/.bin/vitest run
```

## Contributing

### Adding New Tests
1. Follow existing test structure and naming conventions
2. Include both positive and negative test cases
3. Mock external dependencies appropriately
4. Ensure tests are isolated and independent
5. Add performance tests for resource-intensive operations
6. Update coverage thresholds if adding critical components

### Test Naming Conventions
- Test files: `ComponentName.test.js`
- Integration tests: `feature-workflow.test.js`
- Performance tests: `component-load.test.js`
- Describe blocks: Component or feature names
- Test cases: "should [expected behavior] when [condition]"

### Mock Guidelines
- Use comprehensive mocks for Discord.js components
- Mock external APIs and services
- Provide realistic mock responses
- Clear mocks between tests
- Document complex mock setups