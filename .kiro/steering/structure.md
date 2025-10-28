# Project Structure

## Root Files
- `index.js`: Main bot entry point with client initialization and event handlers
- `package.json`: Dependencies and npm scripts
- `vitest.config.js`: Test configuration
- `.env`: Environment variables (tokens, API keys, configuration)
- `*.md`: Documentation files (announcements, implementation summaries)

## Core Directories

### `/commands/`
Slash command implementations - each file exports a command object with:
- `data`: SlashCommandBuilder configuration
- `execute`: Async function handling command logic
- Commands receive all managers as parameters for dependency injection

### `/utils/`
Core utility classes and managers:
- **Managers**: `WatchlistManager.js`, `BanlistManager.js`, `BlockedWordsManager.js`
- **Handlers**: `CommandHandler.js`, `InteractionHandler.js`
- **Integrations**: `TelegramIntegration.js`, `MessageLogger.js`
- **Config**: `GuildConfig.js`, `/config/` subdirectory for enhanced configurations
- **Specialized**: `DoxDetector.js`, `RaidDetector.js`, `PermissionValidator.js`

### `/data/`
JSON data storage with organized subdirectories:
- Configuration files: `guilds_config.json`, `admins.json`, `warnings.json`
- Incident tracking: `/dox_detections/`, `/raid_events/`, `/watchlist_incidents/`
- Logs: `/system_logs/`, `/error_logs/`, `/messages/`
- Integration data: `telegram_messages.json`, `fun_command_usage.json`

### `/test/`
Testing infrastructure:
- `setup.js`: Global test configuration and mocks
- `/unit/`: Unit test files (*.test.js)
- `/test-data/`: Test fixtures and sample data

### `/public/`
Web dashboard files:
- `index.html`, `style.css`, `script.js`: Basic web interface

## File Naming Conventions
- **Commands**: kebab-case (e.g., `global-watchlist-add.js`)
- **Utils**: PascalCase classes (e.g., `WatchlistManager.js`)
- **Data files**: snake_case JSON (e.g., `guilds_config.json`)
- **Test files**: `*.test.js` suffix

## Configuration Patterns
- Guild-specific settings stored in `guilds_config.json`
- Manager classes handle their own JSON file persistence
- Environment variables for sensitive data (tokens, API keys)
- Backup system automatically syncs data files to GitHub