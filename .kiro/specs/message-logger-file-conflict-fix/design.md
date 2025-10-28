# Design Document

## Overview

This design document outlines the solution for fixing file conflicts in the MessageLogger system and implementing automatic cleanup of old message files. The solution implements a queue-based write system with file locking, atomic operations, and scheduled cleanup to ensure data integrity and efficient disk space management.

## Architecture

The enhanced MessageLogger will use an asynchronous, queue-based architecture with the following key components:

### Core Components
- **WriteQueue**: Manages queued write operations per file to prevent conflicts
- **AtomicFileWriter**: Handles atomic write operations using temporary files
- **FileCleanupScheduler**: Manages automatic deletion of old message files
- **ErrorRecoveryManager**: Handles write failures and recovery operations
- **BackpressureController**: Prevents memory overload during high message volume

### File Locking Strategy
The system will use a combination of:
- **In-memory locks**: Prevent concurrent writes to the same file within the process
- **File-based queuing**: Queue operations per file path to ensure sequential processing
- **Atomic writes**: Use temporary files and atomic rename operations

## Components and Interfaces

### 1. Enhanced MessageLogger
```javascript
class MessageLogger {
  constructor(reportManager = null, options = {})
  
  // Core message operations
  async saveMessage(message)
  async saveMessageBatch(messages)
  
  // Queue management
  async processWriteQueue(filePath)
  async addToWriteQueue(filePath, messageData)
  
  // Cleanup operations
  async scheduleCleanup()
  async performCleanup(retentionDays = 1)
  async cleanupGuildFiles(guildId, retentionDays)
  
  // Recovery operations
  async recoverFailedWrites()
  async validateFileIntegrity(filePath)
}
```

### 2. WriteQueue Manager
```javascript
class WriteQueueManager {
  constructor()
  
  // Queue operations
  async addToQueue(filePath, data, priority = 0)
  async processQueue(filePath)
  async getQueueStatus(filePath)
  
  // Lock management
  async acquireLock(filePath)
  async releaseLock(filePath)
  isLocked(filePath)
  
  // Batch processing
  async processBatch(filePath, maxBatchSize = 50)
  async optimizeBatching(filePath)
}
```

### 3. AtomicFileWriter
```javascript
class AtomicFileWriter {
  constructor(options = {})
  
  // Atomic operations
  async writeAtomic(filePath, data, options = {})
  async appendAtomic(filePath, newData, options = {})
  async backupAndWrite(filePath, data)
  
  // Validation
  async validateWrite(filePath, expectedData)
  async createBackup(filePath)
  async restoreFromBackup(filePath)
}
```

### 4. FileCleanupScheduler
```javascript
class FileCleanupScheduler {
  constructor(messageLogger, options = {})
  
  // Scheduling
  async startScheduler()
  async stopScheduler()
  async scheduleNextCleanup()
  
  // Cleanup operations
  async performDailyCleanup()
  async cleanupByRetentionPolicy(retentionDays)
  async cleanupByDiskSpace(targetFreeSpace)
  
  // Statistics
  async getCleanupStats()
  async calculateDiskUsage()
}
```

## Data Models

### Write Queue Entry
```javascript
{
  id: "unique-operation-id",
  filePath: "messages/guildId/channelId/date.json",
  operation: "append|write|batch",
  data: messageData,
  priority: 0,
  timestamp: "2025-01-09T10:00:00.000Z",
  retryCount: 0,
  maxRetries: 5,
  status: "pending|processing|completed|failed"
}
```

### Cleanup Configuration
```javascript
{
  global: {
    retentionDays: 1,
    cleanupSchedule: "0 2 * * *", // Daily at 2 AM
    maxDiskUsage: "10GB",
    batchSize: 100
  },
  guilds: {
    "guildId": {
      retentionDays: 7,
      customSchedule: "0 3 * * *"
    }
  }
}
```

### File Lock Registry
```javascript
{
  locks: {
    "filePath": {
      locked: true,
      lockId: "unique-lock-id",
      acquiredAt: "timestamp",
      processId: "process-identifier",
      queueLength: 5
    }
  },
  statistics: {
    totalLocks: 0,
    averageWaitTime: 0,
    maxQueueLength: 0
  }
}
```

## Error Handling

### Write Operation Failures
- **Retry Logic**: Exponential backoff with jitter (100ms, 200ms, 400ms, 800ms, 1600ms)
- **Failure Recovery**: Store failed operations in recovery queue for later processing
- **Corruption Detection**: Validate JSON integrity after each write operation
- **Backup Restoration**: Automatic restoration from backup files when corruption is detected

### File System Errors
- **Permission Errors**: Graceful degradation with detailed logging
- **Disk Space Errors**: Trigger emergency cleanup and alert administrators
- **Network Storage Issues**: Implement local caching and retry mechanisms
- **Concurrent Access**: Queue-based resolution with timeout handling

### Memory Management
- **Queue Size Limits**: Maximum 1000 operations per file queue
- **Backpressure**: Reject new operations when memory usage exceeds 80% of limit
- **Batch Optimization**: Automatically batch operations when queue size > 10
- **Memory Monitoring**: Regular garbage collection and memory usage reporting

## Testing Strategy

### Unit Testing
- **Queue Operations**: Test queue management, locking, and batch processing
- **Atomic Writes**: Test atomic operations, backup/restore, and corruption handling
- **Cleanup Logic**: Test retention policies, disk space management, and scheduling
- **Error Scenarios**: Test all failure modes and recovery mechanisms

### Integration Testing
- **Concurrent Operations**: Simulate high message volume with multiple concurrent writes
- **File System Stress**: Test with various file system conditions and limitations
- **Recovery Testing**: Test system recovery after crashes and corruption events
- **Performance Testing**: Measure throughput and latency under various load conditions

### Load Testing
- **Message Volume**: Test with 1000+ messages per second
- **File Count**: Test with 10,000+ message files
- **Concurrent Guilds**: Test with 100+ active guilds simultaneously
- **Memory Usage**: Monitor memory consumption during extended operations

## Performance Optimizations

### Write Batching
- **Smart Batching**: Combine messages for the same file within 100ms window
- **Size Limits**: Maximum 50 messages per batch or 1MB total size
- **Priority Queuing**: Process high-priority operations first
- **Adaptive Batching**: Adjust batch size based on system load

### Caching Strategy
- **File Handle Caching**: Keep frequently accessed files open for faster writes
- **Metadata Caching**: Cache file existence and size information
- **Queue Status Caching**: Cache queue lengths and lock status
- **Cleanup Statistics**: Cache disk usage and cleanup metrics

### Asynchronous Operations
- **Non-blocking Writes**: All file operations use async/await patterns
- **Background Processing**: Queue processing runs in background without blocking main thread
- **Parallel Cleanup**: Process multiple files simultaneously during cleanup
- **Streaming Operations**: Use streams for large file operations

## Implementation Phases

### Phase 1: Core Queue System
1. Implement WriteQueueManager with basic locking
2. Add AtomicFileWriter with temporary file operations
3. Update MessageLogger to use queue-based writes
4. Add basic error handling and retry logic

### Phase 2: Advanced Features
1. Implement batch processing and optimization
2. Add comprehensive error recovery mechanisms
3. Implement backpressure and memory management
4. Add detailed logging and monitoring

### Phase 3: Cleanup System
1. Implement FileCleanupScheduler with configurable retention
2. Add disk space monitoring and emergency cleanup
3. Implement guild-specific cleanup policies
4. Add cleanup statistics and reporting

### Phase 4: Performance & Monitoring
1. Add performance metrics and monitoring
2. Implement adaptive batching and optimization
3. Add comprehensive testing and validation
4. Performance tuning and optimization