# Technology Stack

## Runtime & Language
- **Node.js** with ES Modules (type: "module")
- **JavaScript** (ES6+) with modern async/await patterns

## Core Dependencies
- **discord.js v14.21.0**: Primary Discord API library
- **dotenv**: Environment variable management
- **express**: Web server for dashboard/API endpoints
- **axios & node-fetch**: HTTP client libraries
- **node-telegram-bot-api**: Telegram integration
- **tesseract.js**: OCR for image text detection
- **@octokit/rest**: GitHub API integration

## Testing Framework
- **Vitest**: Modern test runner with built-in mocking
- Test files located in `test/` directory
- Unit tests in `test/unit/`
- Test data in `test/test-data/`

## Build & Development Commands

```bash
# Install dependencies
npm install

# Run tests
npm test                # Run all tests once
npm run test:watch      # Run tests in watch mode
npm run test:unit       # Run only unit tests

# Start the bot
node index.js

# Development with auto-restart (if using nodemon)
nodemon index.js
```

## Architecture Patterns
- **ES Modules**: All imports use ES6 module syntax
- **Class-based managers**: Utilities organized as classes (e.g., WatchlistManager, CommandHandler)
- **Event-driven**: Discord.js event handlers for message processing
- **Async/await**: Consistent use of modern async patterns
- **JSON file storage**: Configuration and data persistence using JSON files
- **Modular commands**: Each command is a separate file in `commands/` directory