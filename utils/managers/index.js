/**
 * Enhanced Discord Bot Managers Index
 * Exports all new manager classes for easy importing
 */

// Import all manager classes
import { RaidDetector } from './RaidDetector.js';
import DoxDetector from './DoxDetector.js';
import TelegramIntegration from './TelegramIntegration.js';
import WatchlistManager from './WatchlistManager.js';
import FunCommandsManager from './FunCommandsManager.js';
import EnhancedReloadSystem from './EnhancedReloadSystem.js';

// Export all managers
export {
    RaidDetector,
    DoxDetector,
    TelegramIntegration,
    WatchlistManager,
    FunCommandsManager,
    EnhancedReloadSystem
};

// Default export for convenience
export default {
    RaidDetector,
    DoxDetector,
    TelegramIntegration,
    WatchlistManager,
    FunCommandsManager,
    EnhancedReloadSystem
};