# Design Document

## Overview

This design document outlines the implementation of five major enhancements to the Discord moderation bot: a support server-based ticket system, a dynamic economy system with market fluctuations, forum-based reporting on the support server, automatic server configuration, and a comprehensive test workflow. The design leverages the existing bot architecture while adding new managers and handlers to maintain code organization and modularity.

## Architecture

The enhanced bot will maintain its current modular architecture while introducing new components:

### Core Components
- **DMTicketManager**: Handles private message ticket creation and management
- **EconomyManager**: Manages virtual currency, market dynamics, and transactions
- **ForumReportManager**: Manages forum-based reporting system on support server
- **AutoConfigManager**: Handles automatic server setup and configuration
- **Enhanced Test Suite**: Comprehensive testing framework with mocks

### Support Server Architecture
The bot will operate with a designated "support server" concept where:
- All tickets from any server are managed in dedicated channels
- Reports from all servers are organized in forum channels
- Cross-server moderation coordination occurs
- Administrative oversight and logging happens

## Components and Interfaces

### 1. DMTicketManager
```javascript
class DMTicketManager {
  constructor(client, guildConfig)
  
  // Core ticket operations
  async createTicket(user, initialMessage)
  async closeTicket(ticketId, reason, moderator)
  async relayMessage(source, target, message)
  
  // Ticket management
  async getActiveTickets(userId)
  async getTicketHistory(userId)
  async archiveTicket(ticketId)
  
  // Configuration
  setSupportServer(guildId)
  getSupportServer()
}
```

### 2. EconomyManager
```javascript
class EconomyManager {
  constructor(guildConfig)
  
  // Currency operations
  async getBalance(userId, guildId)
  async addCurrency(userId, guildId, amount, reason)
  async transferCurrency(fromUserId, toUserId, guildId, amount)
  
  // Market dynamics
  async calculateMarketValue(guildId)
  async updateInflation(guildId)
  async getEconomicStats(guildId)
  
  // Shop system
  async purchaseItem(userId, guildId, itemId)
  async getShopItems(guildId)
  async updateItemPrices(guildId)
}
```

### 3. ForumReportManager
```javascript
class ForumReportManager {
  constructor(client, guildConfig)
  
  // Report operations
  async createForumReport(reportData, sourceGuild)
  async updateReportStatus(reportId, status, moderator)
  async linkRelatedReports(reportIds)
  
  // Forum management
  async setupReportsForum(supportGuildId)
  async categorizeReport(reportType)
  async archiveReport(reportId)
}
```

### 4. AutoConfigManager
```javascript
class AutoConfigManager {
  constructor(client, guildConfig)
  
  // Auto-configuration
  async configureNewGuild(guild)
  async createModerationChannels(guild)
  async setupDefaultRoles(guild)
  async setDefaultPermissions(guild)
  
  // Configuration management
  async getConfigTemplate(guildSize)
  async customizeConfig(guildId, settings)
  async validateConfiguration(guildId)
}
```

## Data Models

### Ticket System
```javascript
// tickets.json structure
{
  "tickets": {
    "ticketId": {
      "id": "unique-ticket-id",
      "userId": "discord-user-id",
      "supportChannelId": "support-channel-id",
      "status": "open|closed",
      "createdAt": "timestamp",
      "closedAt": "timestamp",
      "closedBy": "moderator-id",
      "closeReason": "reason",
      "messageCount": 0,
      "sourceGuild": "guild-where-user-came-from"
    }
  },
  "userTickets": {
    "userId": ["ticket-id-1", "ticket-id-2"]
  }
}
```

### Economy System
```javascript
// economy.json structure
{
  "guilds": {
    "guildId": {
      "totalCurrency": 0,
      "baseValue": 1.0,
      "currentValue": 1.0,
      "inflationRate": 0.0,
      "lastUpdate": "timestamp",
      "users": {
        "userId": {
          "balance": 0,
          "totalEarned": 0,
          "totalSpent": 0,
          "lastActivity": "timestamp"
        }
      },
      "shop": {
        "itemId": {
          "name": "item-name",
          "basePrice": 100,
          "currentPrice": 100,
          "stock": -1,
          "purchases": 0
        }
      }
    }
  }
}
```

### Forum Reports
```javascript
// forum_reports.json structure
{
  "reports": {
    "reportId": {
      "id": "unique-report-id",
      "forumPostId": "discord-forum-post-id",
      "sourceGuild": "guild-id-where-report-originated",
      "reportedUser": "user-id",
      "reportedBy": "reporter-user-id",
      "category": "spam|harassment|other",
      "status": "open|investigating|resolved",
      "createdAt": "timestamp",
      "resolvedAt": "timestamp",
      "resolvedBy": "moderator-id",
      "linkedReports": ["related-report-ids"]
    }
  }
}
```

### Auto-Configuration Templates
```javascript
// auto_config_templates.json structure
{
  "templates": {
    "small": {
      "maxMembers": 100,
      "channels": {
        "moderation-log": { "type": "text", "permissions": "mod-only" },
        "reports": { "type": "text", "permissions": "mod-only" }
      },
      "roles": {
        "Moderator": { "permissions": ["MANAGE_MESSAGES", "TIMEOUT_MEMBERS"] }
      }
    },
    "medium": {
      "maxMembers": 1000,
      "channels": {
        "moderation-log": { "type": "text", "permissions": "mod-only" },
        "reports": { "type": "text", "permissions": "mod-only" },
        "appeals": { "type": "text", "permissions": "mod-only" }
      }
    }
  }
}
```

## Error Handling

### Ticket System Error Handling
- **DM Disabled**: Gracefully handle users with DMs disabled by creating a temporary channel
- **Support Server Unavailable**: Queue tickets and process when server becomes available
- **Channel Creation Failures**: Implement retry logic with exponential backoff
- **Message Relay Failures**: Store failed messages for manual review

### Economy System Error Handling
- **Insufficient Funds**: Validate balances before transactions
- **Market Calculation Errors**: Implement safeguards against extreme value fluctuations
- **Concurrent Transaction Issues**: Use atomic operations and transaction locks
- **Data Corruption**: Regular backup validation and recovery procedures

### Forum Reports Error Handling
- **Forum Unavailable**: Fall back to regular channel reporting
- **Permission Issues**: Validate bot permissions before creating forum posts
- **Cross-Server Communication**: Handle network failures gracefully

### Auto-Configuration Error Handling
- **Permission Failures**: Provide clear feedback about missing permissions
- **Existing Configuration Conflicts**: Detect and resolve configuration overlaps
- **Partial Setup Failures**: Allow resuming incomplete configurations

## Testing Strategy

### Unit Testing Framework
- **Vitest Configuration**: Enhanced test runner with Discord.js mocking
- **Manager Testing**: Isolated testing of each manager class
- **Mock Services**: Comprehensive mocking of Discord API and external services
- **Data Validation**: Testing of all JSON schema validations

### Integration Testing
- **Cross-Manager Testing**: Testing interactions between different managers
- **Event Flow Testing**: Testing complete user workflows end-to-end
- **Error Scenario Testing**: Testing all error handling paths
- **Performance Testing**: Load testing for economy calculations and ticket volume

### Test Coverage Requirements
- **Minimum 80% Coverage**: All new code must meet coverage requirements
- **Critical Path Coverage**: 100% coverage for security and moderation features
- **Edge Case Testing**: Comprehensive testing of boundary conditions
- **Regression Testing**: Automated testing to prevent feature breakage

### Continuous Integration
- **Pre-commit Hooks**: Automated testing before code commits
- **GitHub Actions**: Automated testing on pull requests
- **Test Environment**: Isolated testing environment with mock Discord servers
- **Performance Benchmarks**: Automated performance regression detection