# Command Registration System

## Overview

The CommandHandler system automatically loads and registers all commands from the `commands/` directory. It provides enhanced error handling, validation, and logging specifically for moderation and watchlist commands.

## Command Types

### Moderation Commands
- `ban` - Ban a user from the server
- `kick` - Kick a user from the server  
- `timeout` - Put a user in timeout
- `clear` - Delete messages in bulk
- `unban` - Unban a user from the server
- `warn` - Warn a user
- `clearwarns` - Clear user warnings

### Watchlist Commands (Local)
- `watchlist-add` - Add user to local server watchlist
- `watchlist-remove` - Remove user from local server watchlist
- `watchlist-list` - List users on local server watchlist
- `watchlist-info` - Show detailed info for a watched user
- `watchlist-note` - Add a note to a watched user
- `watchlist-status` - Show watchlist status

### Global Watchlist Commands (Bot Admins Only)
- `global-watchlist-add` - Add user to global watchlist (all servers)
- `global-watchlist-remove` - Remove user from global watchlist
- `global-watchlist-list` - List users on global watchlist
- `global-watchlist-info` - Show detailed info for globally watched user

## Command Structure

All commands must follow this structure:

```javascript
import { SlashCommandBuilder } from 'discord.js';

export default {
    data: new SlashCommandBuilder()
        .setName('command-name')
        .setDescription('Command description')
        // ... options
    ,
    async execute(interaction, adminManager, warnManager, guildConfig, sharedConfig, backupToGitHub, reportManager, banlistManager, blockedWordsManager, watchlistManager, telegramIntegration, funCommandsManager, raidDetector, doxDetector, enhancedReloadSystem, permissionValidator) {
        // Command implementation
    }
};
```

## Manager Injection

The CommandHandler automatically injects all required managers into command execution:

- `adminManager` - Bot admin management
- `warnManager` - Warning system
- `guildConfig` - Guild configuration
- `sharedConfig` - Shared configuration
- `backupToGitHub` - GitHub backup system
- `reportManager` - Reporting and logging
- `banlistManager` - Ban list management
- `blockedWordsManager` - Blocked words system
- `watchlistManager` - User surveillance system
- `telegramIntegration` - Telegram bridge
- `funCommandsManager` - Fun commands system
- `raidDetector` - Raid detection
- `doxDetector` - Dox detection
- `enhancedReloadSystem` - System reload management
- `permissionValidator` - Permission validation

## Validation and Error Handling

### Required Manager Validation
The CommandHandler validates that required managers are available:

- **Moderation commands** require `permissionValidator`
- **Watchlist commands** require `watchlistManager`

### Permission Validation
All moderation and watchlist commands should use the `permissionValidator`:

```javascript
// For moderation commands
const permissionResult = permissionValidator.validateModerationAction(
    interaction.member,
    targetMember,
    PermissionsBitField.Flags.BanMembers
);

// For watchlist commands
const permissionResult = permissionValidator.validateWatchlistPermission(
    interaction.member
);

// For global watchlist commands (bot admins only)
const permissionResult = permissionValidator.validateGlobalWatchlistPermission(
    interaction.member
);
```

### Error Logging
Commands should log errors using the ModerationLogger:

```javascript
if (reportManager && reportManager.moderationLogger) {
    await reportManager.moderationLogger.logError('command-name', error, {
        userId: interaction.user.id,
        userTag: interaction.user.tag,
        guildId: interaction.guild.id,
        guildName: interaction.guild.name
    });
}
```

## Command Loading Process

1. **File Discovery**: Scans `commands/` directory for `.js` files
2. **Module Import**: Dynamically imports each command module
3. **Validation**: Validates command structure (`data` and `execute` properties)
4. **Registration**: Adds valid commands to the client command collection
5. **Discord Registration**: Registers commands with Discord API
6. **Statistics**: Logs command statistics by type

## Command Statistics

The system tracks and reports:
- Total commands loaded
- Moderation commands count
- Watchlist commands count  
- Other commands count
- Missing required commands

## Reload System

Commands can be reloaded without restarting the bot:

```javascript
const result = await commandHandler.reloadCommands();
```

This will:
1. Clear existing commands
2. Reload all command files
3. Re-register with Discord
4. Reload all managers
5. Report changes and statistics

## Testing

Command registration is tested with:
- Unit tests for command type detection
- Validation tests for required commands
- Integration tests for command execution
- Error handling tests
- Manager injection tests

Run tests with:
```bash
npm test -- test/unit/CommandHandler.test.js
npm test -- test/unit/WatchlistCommandRegistration.test.js
```

## Best Practices

### Command Implementation
1. Always validate permissions first
2. Use consistent error messages
3. Log all actions with ModerationLogger
4. Handle edge cases gracefully
5. Provide user-friendly error messages

### Error Handling
1. Catch and log all errors
2. Provide fallback responses
3. Don't expose internal errors to users
4. Use appropriate HTTP status codes

### Logging
1. Log permission denials
2. Log successful operations
3. Log errors with context
4. Use structured logging format

### Performance
1. Validate inputs early
2. Use ephemeral replies when appropriate
3. Implement pagination for large lists
4. Cache frequently accessed data

## Troubleshooting

### Command Not Loading
- Check file syntax and structure
- Verify `data` and `execute` properties exist
- Check console for loading errors
- Ensure proper export format

### Permission Errors
- Verify bot has required Discord permissions
- Check role hierarchy
- Validate user permissions
- Ensure PermissionValidator is available

### Manager Not Available
- Check manager initialization in main bot file
- Verify manager is passed to CommandHandler
- Check for manager loading errors
- Ensure proper dependency injection

### Registration Failures
- Check Discord API connectivity
- Verify bot token and permissions
- Check for command name conflicts
- Review Discord API rate limits