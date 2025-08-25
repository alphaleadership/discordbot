/**
 * TypeScript-style interfaces for Discord Bot Enhancement data models
 * These interfaces define the structure of data objects used throughout the system
 */

/**
 * @typedef {Object} RaidEvent
 * @property {string} id - Unique identifier for the raid event
 * @property {string} guildId - Discord guild ID where the raid occurred
 * @property {Date} timestamp - When the raid was detected
 * @property {'rapid_join'|'suspicious_pattern'|'coordinated_behavior'} type - Type of raid detected
 * @property {'low'|'medium'|'high'|'critical'} severity - Severity level of the raid
 * @property {string[]} affectedUsers - Array of user IDs involved in the raid
 * @property {string[]} measures - Array of protective measures applied
 * @property {boolean} resolved - Whether the raid has been resolved
 */

/**
 * @typedef {Object} DoxDetection
 * @property {string} id - Unique identifier for the detection event
 * @property {string} messageId - Discord message ID that triggered detection
 * @property {string} userId - User ID who sent the message
 * @property {string} guildId - Guild ID where detection occurred
 * @property {'phone'|'email'|'address'|'ssn'|'other'} detectionType - Type of personal info detected
 * @property {string} content - Censored content that was detected
 * @property {Date} timestamp - When the detection occurred
 * @property {'deleted'|'warned'|'banned'} action - Action taken in response
 */

/**
 * @typedef {Object} TelegramNotification
 * @property {string} id - Unique identifier for the notification
 * @property {string} guildId - Discord guild ID this notification relates to
 * @property {'moderation'|'raid'|'dox'|'status'|'stats'} type - Type of notification
 * @property {'low'|'normal'|'high'|'urgent'} priority - Priority level
 * @property {string} message - The notification message content
 * @property {Date} timestamp - When the notification was created
 * @property {boolean} sent - Whether the notification was successfully sent
 * @property {number} retries - Number of retry attempts made
 */

/**
 * @typedef {Object} TelegramMessage
 * @property {string} id - Unique identifier for the message record
 * @property {number} telegramMessageId - Telegram's message ID
 * @property {string} telegramChannelId - Telegram channel ID
 * @property {string} guildId - Discord guild ID this message relates to
 * @property {string} discordChannelId - Discord channel ID for forwarding
 * @property {TelegramAuthor} author - Information about the Telegram message author
 * @property {string} content - Message content
 * @property {TelegramAttachment[]} attachments - Array of message attachments
 * @property {Date} timestamp - When the message was sent
 * @property {boolean} forwarded - Whether the message was forwarded to Discord
 * @property {string} [discordMessageId] - Discord message ID if forwarded
 */

/**
 * @typedef {Object} TelegramAuthor
 * @property {number} telegramUserId - Telegram user ID
 * @property {string} username - Telegram username
 * @property {string} firstName - User's first name
 * @property {string} [lastName] - User's last name (optional)
 */

/**
 * @typedef {Object} TelegramAttachment
 * @property {'photo'|'document'|'video'|'audio'} type - Type of attachment
 * @property {string} fileId - Telegram file ID
 * @property {string} [fileName] - Original file name (optional)
 * @property {string} [mimeType] - MIME type of the file (optional)
 */

/**
 * @typedef {Object} FunCommandUsage
 * @property {string} userId - Discord user ID
 * @property {string} guildId - Discord guild ID
 * @property {string} commandName - Name of the fun command used
 * @property {Date} lastUsed - When the command was last used
 * @property {number} usageCount - Total number of times used
 * @property {FunCommandScores} scores - User's scores in various games
 */

/**
 * @typedef {Object} FunCommandScores
 * @property {number} trivia - Score in trivia games
 * @property {number} games - Score in other games
 */

/**
 * @typedef {Object} WatchlistEntry
 * @property {string} userId - Discord user ID being watched
 * @property {string} username - User's Discord username
 * @property {string} discriminator - User's Discord discriminator
 * @property {string} reason - Reason for adding to watchlist
 * @property {string} addedBy - Moderator ID who added the user
 * @property {Date} addedAt - When the user was added to watchlist
 * @property {Date} lastSeen - When the user was last seen
 * @property {string} guildId - Guild ID where the user is being watched
 * @property {'observe'|'alert'|'action'} watchLevel - Level of surveillance
 * @property {WatchlistNote[]} notes - Array of moderator notes
 * @property {WatchlistIncident[]} incidents - Array of recorded incidents
 * @property {boolean} active - Whether the watchlist entry is active
 */

/**
 * @typedef {Object} WatchlistNote
 * @property {string} id - Unique identifier for the note
 * @property {string} moderatorId - ID of moderator who added the note
 * @property {string} note - The note content
 * @property {Date} timestamp - When the note was added
 */

/**
 * @typedef {Object} WatchlistIncident
 * @property {string} id - Unique identifier for the incident
 * @property {'join'|'message'|'violation'|'other'} type - Type of incident
 * @property {string} description - Description of the incident
 * @property {Date} timestamp - When the incident occurred
 * @property {string} [channelId] - Channel ID where incident occurred (optional)
 * @property {string} [messageId] - Message ID related to incident (optional)
 */

/**
 * @typedef {Object} RaidDetectionConfig
 * @property {number} rapidJoinThreshold - Number of joins to trigger detection
 * @property {number} timeWindowMs - Time window in milliseconds for detection
 * @property {string[]} whitelistedEvents - Array of whitelisted event IDs
 * @property {'low'|'medium'|'high'} protectionLevel - Default protection level
 * @property {boolean} autoSlowMode - Whether to automatically enable slow mode
 * @property {boolean} autoJoinRestrictions - Whether to automatically restrict joins
 */

/**
 * @typedef {Object} DoxDetectionConfig
 * @property {string[]} phonePatterns - Regex patterns for phone number detection
 * @property {string[]} emailPatterns - Regex patterns for email detection
 * @property {string[]} addressPatterns - Regex patterns for address detection
 * @property {string[]} ssnPatterns - Regex patterns for SSN detection
 * @property {string[]} exceptions - Array of exception patterns
 * @property {boolean} ocrEnabled - Whether OCR scanning is enabled
 * @property {boolean} autoDelete - Whether to automatically delete detected content
 */

/**
 * @typedef {Object} TelegramConfig
 * @property {string} botToken - Telegram bot token
 * @property {string} channelId - Telegram channel ID for notifications
 * @property {string} bridgeChannelId - Telegram channel ID for bidirectional bridge
 * @property {boolean} notificationsEnabled - Whether notifications are enabled
 * @property {boolean} bridgeEnabled - Whether bidirectional bridge is enabled
 * @property {string[]} allowedEventTypes - Array of allowed notification types
 */

/**
 * @typedef {Object} FunCommandsConfig
 * @property {boolean} enabled - Whether fun commands are enabled
 * @property {number} cooldownMs - Cooldown period in milliseconds
 * @property {string[]} enabledCommands - Array of enabled command names
 * @property {string[]} disabledChannels - Array of channel IDs where commands are disabled
 * @property {boolean} leaderboardEnabled - Whether leaderboards are enabled
 */

/**
 * @typedef {Object} WatchlistConfig
 * @property {boolean} enabled - Whether watchlist monitoring is enabled
 * @property {'observe'|'alert'|'action'} defaultWatchLevel - Default watch level for new entries
 * @property {boolean} autoNotifications - Whether to send automatic notifications
 * @property {number} reportIntervalHours - Hours between automatic reports
 */

export {
    // Export empty object to make this a proper ES module
    // The typedef comments above provide the interface definitions
};