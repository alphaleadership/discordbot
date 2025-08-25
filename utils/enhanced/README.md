# Enhanced Discord Bot Features

This directory contains the enhanced features for the Discord moderation bot, including raid detection, dox detection, Telegram integration, watchlist management, fun commands, and an enhanced reload system.

## Project Structure

### Managers (`utils/managers/`)
- **RaidDetector.js** - Detects and responds to server raids
- **DoxDetector.js** - Detects and handles personal information sharing
- **TelegramIntegration.js** - Bidirectional Discord-Telegram integration
- **WatchlistManager.js** - Manages user surveillance and monitoring
- **FunCommandsManager.js** - Handles entertainment commands and games
- **EnhancedReloadSystem.js** - Advanced hot-reload capabilities

### Configuration (`utils/config/`)
- **EnhancedGuildConfig.js** - Extended guild configuration with new features
- **ConfigValidator.js** - Validates configuration objects for data integrity
- **index.js** - Configuration exports

### Interfaces (`utils/interfaces/`)
- **DataModels.js** - TypeScript-style interface definitions for all data models

### Data Files (`data/`)
- **watchlist.json** - User watchlist entries
- **raid_events.json** - Recorded raid events
- **dox_detections.json** - Personal information detection logs
- **telegram_notifications.json** - Telegram notification queue
- **telegram_messages.json** - Bidirectional message history
- **fun_command_usage.json** - Fun command usage statistics and scores

## Data Models

### Core Data Types

#### RaidEvent
```javascript
{
    id: string,
    guildId: string,
    timestamp: Date,
    type: 'rapid_join' | 'suspicious_pattern' | 'coordinated_behavior',
    severity: 'low' | 'medium' | 'high' | 'critical',
    affectedUsers: [userId],
    measures: [appliedMeasures],
    resolved: boolean
}
```

#### WatchlistEntry
```javascript
{
    userId: string,
    username: string,
    discriminator: string,
    reason: string,
    addedBy: string,
    addedAt: Date,
    lastSeen: Date,
    guildId: string,
    watchLevel: 'observe' | 'alert' | 'action',
    notes: [WatchlistNote],
    incidents: [WatchlistIncident],
    active: boolean
}
```

#### TelegramMessage
```javascript
{
    id: string,
    telegramMessageId: number,
    telegramChannelId: string,
    guildId: string,
    discordChannelId: string,
    author: TelegramAuthor,
    content: string,
    attachments: [TelegramAttachment],
    timestamp: Date,
    forwarded: boolean,
    discordMessageId?: string
}
```

## Configuration Structure

Each guild now has extended configuration options:

```javascript
{
    // Existing configuration...
    antiInvite: { enabled: boolean, whitelistedChannels: [] },
    charLimit: number,
    
    // New enhanced configurations
    raidDetection: {
        enabled: boolean,
        rapidJoinThreshold: number,
        timeWindowMs: number,
        whitelistedEvents: [],
        protectionLevel: 'low' | 'medium' | 'high',
        autoSlowMode: boolean,
        autoJoinRestrictions: boolean
    },
    
    doxDetection: {
        enabled: boolean,
        phonePatterns: [string],
        emailPatterns: [string],
        addressPatterns: [string],
        ssnPatterns: [string],
        exceptions: [string],
        ocrEnabled: boolean,
        autoDelete: boolean
    },
    
    telegram: {
        botToken: string,
        channelId: string,
        bridgeChannelId: string,
        notificationsEnabled: boolean,
        bridgeEnabled: boolean,
        allowedEventTypes: [string]
    },
    
    funCommands: {
        enabled: boolean,
        cooldownMs: number,
        enabledCommands: [string],
        disabledChannels: [string],
        leaderboardEnabled: boolean
    },
    
    watchlist: {
        enabled: boolean,
        defaultWatchLevel: 'observe' | 'alert' | 'action',
        autoNotifications: boolean,
        reportIntervalHours: number
    }
}
```

## Usage

### Initialization

```javascript
import EnhancedBotFeatures from './utils/enhanced/index.js';

const enhancedFeatures = new EnhancedBotFeatures(client, existingManagers);
await enhancedFeatures.initialize();
```

### Accessing Managers

```javascript
const raidDetector = enhancedFeatures.getManager('raidDetector');
const watchlistManager = enhancedFeatures.getManager('watchlistManager');
```

### Configuration Management

```javascript
const config = enhancedFeatures.getConfig();
config.setRaidDetectionEnabled(guildId, true);
config.updateRaidDetectionConfig(guildId, { rapidJoinThreshold: 10 });
```

### Validation

```javascript
const validationResult = enhancedFeatures.validateGuildConfig(guildId);
if (!validationResult.isValid) {
    console.error('Configuration errors:', validationResult.errors);
}
```

## Implementation Status

- ✅ **Project Structure** - Complete
- ✅ **Data Models** - Complete
- ✅ **Configuration System** - Complete
- ✅ **Validation System** - Complete
- ⏳ **Manager Implementations** - Pending (individual tasks)

## Next Steps

1. Implement WatchlistManager (Task 2)
2. Implement Enhanced DoxDetector (Task 3)
3. Implement RaidDetector (Task 4)
4. Implement TelegramIntegration (Task 5)
5. Implement FunCommandsManager (Task 6)
6. Implement EnhancedReloadSystem (Task 7)
7. Integration and system wiring (Task 8)
8. Testing and validation (Task 9)

Each manager will be implemented as a separate task, building upon this foundation structure.