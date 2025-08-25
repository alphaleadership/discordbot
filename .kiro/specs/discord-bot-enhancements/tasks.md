  DiscordAPIError[50035]: Invalid Form Body
23.options[2][APPLICATION_COMMAND_OPTIONS_REQUIRED_INVALID]: Required options must be placed before non-required options# Implementation Plan

- [x] 1. Set up enhanced project structure and core interfaces





  - Create directory structure for new managers (raid, dox, telegram, watchlist, fun)
  - Define TypeScript-style interfaces for all new data models
  - Create base configuration extensions for new features
  - _Requirements: 1.1, 2.1, 3.1, 4.1, 5.1_

- [ ] 2. Implement WatchlistManager foundation





- [x] 2.1 Create WatchlistManager class with core CRUD operations




  - Write WatchlistManager class with file-based storage (data/watchlist.json)
  - Implement addToWatchlist, removeFromWatchlist, isOnWatchlist methods
  - Create data validation and error handling for watchlist operations
  - _Requirements: 5.1_

- [x] 2.2 Add watchlist monitoring and notification system








  - Implement handleUserJoin method to detect watched users joining
  - Create notification system using existing ReportManager for sensitive alerts
  - Add incident logging for watched user activities in report channel
  - Integrate with existing report channel configuration system
  - _Requirements: 5.2, 5.3_

- [x] 2.3 Create watchlist management commands





  - Implement /watchlist-add command for adding users to watchlist
  - Implement /watchlist-remove command for removing users
  - Implement /watchlist-list command to view current watchlist
  - Add /watchlist-info command to view specific user details
  - _Requirements: 5.1, 5.4_

- [x] 3. Implement enhanced DoxDetector system





- [x] 3.1 Create enhanced pattern detection engine


  - Extend existing blocked words system with personal information patterns
  - Implement regex patterns for phone numbers, emails, addresses, SSN
  - Create configurable exception system for legitimate information sharing
  - Write unit tests for pattern detection accuracy
  - _Requirements: 2.1, 2.5_

- [x] 3.2 Add OCR capability for image scanning


  - Integrate OCR library (tesseract.js or similar) for image text extraction
  - Implement image download and processing pipeline
  - Create text analysis on extracted content using existing patterns
  - Add error handling for image processing failures
  - _Requirements: 2.4_

- [x] 3.3 Implement escalation and notification system


  - Enhance existing warning system with dox-specific escalation
  - Route all dox detection alerts through existing ReportManager to report channel
  - Implement automatic content deletion and user warnings
  - Add integration with TelegramIntegration for critical alerts via report system
  - _Requirements: 2.2, 2.3, 2.6_

- [x] 4. Create RaidDetector system





- [x] 4.1 Implement rapid join detection algorithm


  - Create user join tracking system with configurable time windows
  - Implement statistical analysis for detecting unusual join patterns
  - Add guild-specific configuration for join thresholds and timeframes
  - Write detection logic for coordinated user behavior patterns
  - _Requirements: 1.1, 1.4_

- [x] 4.2 Create automatic protective measures system


  - Implement automatic slow mode activation during detected raids
  - Create temporary join restrictions and verification requirements
  - Add automatic role restrictions for new members during raids
  - Implement configurable protection levels based on raid severity
  - _Requirements: 1.2_

- [x] 4.3 Add raid notification and management system


  - Route all raid alerts through existing ReportManager to report channel
  - Implement raid event logging in report channel with detailed information
  - Add manual override system for false positive raids via report channel
  - Create raid resolution notifications and cleanup procedures in report channel
  - _Requirements: 1.3, 1.5, 1.6_

- [x] 5. Implement TelegramIntegration system



- [x] 5.1 Create Telegram bot foundation and Discord notification sender


  - Set up Telegram Bot API integration with token management
  - Implement Discord to Telegram notification system for moderation events
  - Create message formatting for different event types (bans, warns, raids)
  - Add configuration system for guild-specific Telegram channels
  - _Requirements: 3.1, 3.2, 3.4_



- [x] 5.2 Implement Telegram message listener and Discord forwarder
  - Create Telegram message polling system to read incoming messages
  - Implement message filtering to exclude bot messages and system notifications
  - Add message formatting system to display Telegram user info in Discord
  - Create media download and upload pipeline for attachments
  - _Requirements: 3.1, 3.2_

- [x] 5.3 Add bidirectional error handling and reconnection
  - Implement connection monitoring and automatic reconnection for Telegram
  - Create message queue system with retry logic for failed deliveries
  - Add fallback logging when Telegram services are unavailable
  - Implement rate limiting and API quota management
  - _Requirements: 3.5, 3.6_

- [x] 5.4 Create Telegram configuration commands


  - Implement /set-telegram-channel command for Discord to Telegram notifications
  - Add /set-telegram-bridge command for bidirectional channel bridging
  - Create /telegram-status command to check connection and configuration
  - Add /telegram-test command for testing message delivery
  - _Requirements: 3.1, 3.6_

- [x] 6. Implement FunCommandsManager system



- [x] 6.1 Create fun commands foundation with cooldown system


  - Create FunCommandsManager class with cooldown tracking
  - Implement basic fun commands: /joke, /8ball, /meme
  - Add guild-specific configuration for enabling/disabling fun commands
  - Create content filtering system to ensure appropriate responses
  - _Requirements: 4.1, 4.2, 4.3, 4.5_

- [x] 6.2 Add interactive games and scoring system


  - Implement /trivia command with question database and scoring
  - Create leaderboard system for tracking user scores across games
  - Add /leaderboard command to display top players
  - Implement score persistence and guild-specific leaderboards
  - _Requirements: 4.4_

- [x] 6.3 Create fun command management and moderation


  - Add per-channel and per-guild configuration for fun command availability
  - Implement usage statistics and monitoring for fun commands
  - Create admin commands for managing fun command settings
  - Add integration with existing moderation system to prevent abuse
  - _Requirements: 4.5, 4.6_

- [x] 7. Implement EnhancedReloadSystem





- [x] 7.1 Create hot reload system for managers and commands


  - Extend existing CommandHandler reload functionality
  - Implement manager reload system that preserves active state
  - Add configuration file watching with automatic reload triggers
  - Create component dependency tracking for safe reload ordering
  - _Requirements: 5.1, 5.2, 5.4_

- [x] 7.2 Add error handling and rollback capabilities


  - Implement state preservation during reload operations
  - Create rollback system for failed reload attempts
  - Route all critical reload errors and failures to report channel via ReportManager
  - Implement component isolation to prevent cascade failures
  - _Requirements: 5.3, 5.5_

- [x] 7.3 Create reload management commands and monitoring


  - Enhance existing /reload command with component-specific options
  - Add /reload-status command to show system health and last reload info
  - Implement automatic reload confirmation and success notifications
  - Create reload history tracking and performance monitoring
  - _Requirements: 5.6_

- [x] 8. Integration and system wiring





- [x] 8.1 Integrate all new managers with existing bot architecture


  - Update main index.js to initialize all new managers
  - Integrate new managers with existing event handlers (messageCreate, guildMemberAdd)
  - Add new managers to CommandHandler for command execution
  - Update existing InteractionHandler to work with new systems
  - _Requirements: 1.1, 2.1, 3.1, 4.1, 5.1_

- [x] 8.2 Create comprehensive configuration system


  - Extend GuildConfig to support all new feature configurations
  - Implement migration system for existing guild configurations
  - Add validation and default value handling for new configuration options
  - Create configuration backup and restore functionality
  - _Requirements: 1.5, 2.5, 3.6, 4.5, 5.2_

- [x] 8.3 Add comprehensive logging and monitoring integration


  - Integrate all new systems with existing MessageLogger
  - Route all sensitive logs and critical events through ReportManager to report channel
  - Extend GitHub backup system to include new data files (watchlist, raid logs, etc.)
  - Create unified error reporting system that channels all alerts to report channel
  - _Requirements: 1.3, 2.6, 3.3, 5.5_

- [ ] 9. Testing and validation






- [ ] 9.1 Create unit tests for all new managers








  - Write comprehensive tests for WatchlistManager CRUD operations
  - Create tests for RaidDetector pattern recognition and thresholds
  - Implement tests for DoxDetector pattern matching and OCR functionality
  - Add tests for TelegramIntegration message handling and error scenarios
  - _Requirements: 1.1, 2.1, 3.1, 4.1, 5.1_

- [ ] 9.2 Create integration tests for system workflows
  - Test complete raid detection and response workflow
  - Validate dox detection, deletion, and notification pipeline
  - Test bidirectional Telegram-Discord message flow
  - Verify watchlist monitoring and alert system functionality
  - _Requirements: 1.6, 2.6, 3.6, 5.6_

- [ ] 9.3 Implement error handling and edge case testing
  - Test system behavior during API failures and network issues
  - Validate graceful degradation when external services are unavailable
  - Test reload system under various failure scenarios
  - Verify data integrity during system restarts and crashes
  - _Requirements: 3.5, 5.3, 5.5_