# Design Document

## Overview

Ce document décrit la conception technique pour l'amélioration du bot Discord de modération existant. Le bot utilise actuellement Discord.js v14 avec une architecture modulaire basée sur des gestionnaires (managers) et des commandes. Les améliorations proposées s'intègrent dans cette architecture existante en étendant les fonctionnalités de détection, en ajoutant une intégration Telegram, et en introduisant des commandes de divertissement.

## Architecture

### Architecture Actuelle
- **Client Discord.js** : Gestion des connexions et événements Discord
- **CommandHandler** : Gestionnaire centralisé des commandes slash
- **Managers** : Classes spécialisées (AdminManager, WarnManager, BanlistManager, etc.)
- **Configuration** : Système de configuration par serveur (GuildConfig)
- **Logging** : Sauvegarde des messages et intégration GitHub

### Architecture Étendue
Les nouvelles fonctionnalités s'intègrent via :
- **RaidDetector** : Nouveau module de détection des raids
- **DoxDetector** : Module amélioré de détection d'informations personnelles
- **TelegramIntegration** : Service de notification Telegram
- **FunCommandsManager** : Gestionnaire des commandes de divertissement
- **WatchlistManager** : Gestionnaire de la liste de surveillance
- **EnhancedReloadSystem** : Système de rechargement amélioré

## Components and Interfaces

### 1. RaidDetector

```javascript
class RaidDetector {
    constructor(client, guildConfig, telegramIntegration)
    
    // Détection basée sur les jointures rapides
    detectRapidJoins(guildId, joinEvents)
    
    // Détection de patterns comportementaux
    detectSuspiciousPatterns(users)
    
    // Application des mesures de protection
    applyProtectiveMeasures(guild, raidLevel)
    
    // Notification des administrateurs
    notifyAdministrators(guild, raidInfo)
}
```

**Configuration** :
- Seuils configurables par serveur (nombre d'utilisateurs, fenêtre temporelle)
- Whitelist pour les événements légitimes
- Niveaux de protection automatique (slow mode, restrictions temporaires)

### 2. Enhanced DoxDetector

```javascript
class DoxDetector {
    constructor(warnManager, telegramIntegration)
    
    // Patterns de détection étendus
    detectPersonalInfo(content)
    
    // OCR pour les images
    async scanImageForText(attachment)
    
    // Gestion des exceptions configurables
    checkExceptions(guildId, content)
    
    // Escalade automatique
    handleDetection(message, detectionType)
}
```

**Patterns de Détection** :
- Numéros de téléphone (formats internationaux)
- Adresses email et physiques
- Numéros de sécurité sociale
- Coordonnées bancaires
- Noms complets avec contexte

### 3. TelegramIntegration

```javascript
class TelegramIntegration {
    constructor(botToken, channelConfigs, discordClient)
    
    // Envoi de notifications Discord → Telegram
    async sendNotification(guildId, message, priority)
    
    // Lecture des messages Telegram → Discord
    async startTelegramListener()
    async handleTelegramMessage(message)
    
    // Formatage des messages
    formatDiscordEvent(eventType, data)
    formatTelegramMessage(telegramMessage)
    
    // Gestion de la reconnexion
    handleConnectionFailure()
    
    // Configuration par serveur
    configureGuildChannel(guildId, telegramChannelName, discordChannelId)
    
    // Filtrage et validation
    validateTelegramMessage(message)
    shouldForwardMessage(message, guildConfig)
}
```

**Flux Bidirectionnel** :

**Discord → Telegram** :
- Actions de modération (bans, warns, kicks)
- Détections de raids et dox
- Statistiques périodiques
- Statut du bot (démarrage, erreurs)

**Telegram → Discord** :
- Messages du channel Telegram configuré
- Formatage avec nom d'utilisateur Telegram
- Filtrage des messages de bot/système
- Support des médias (images, documents)

### 4. FunCommandsManager

```javascript
class FunCommandsManager {
    constructor(guildConfig)
    
    // Commandes de base
    async executeJoke(interaction)
    async executeMeme(interaction)
    async executeGame(interaction)
    
    // Système de cooldown
    checkCooldown(userId, commandName)
    
    // Filtrage de contenu
    filterContent(content, guildId)
    
    // Leaderboards
    updateScore(userId, gameType, score)
}
```

**Commandes Prévues** :
- `/joke` : Blagues aléatoires
- `/meme` : Memes populaires
- `/8ball` : Boule magique
- `/trivia` : Questions-réponses
- `/leaderboard` : Classements des jeux

### 5. WatchlistManager

```javascript
class WatchlistManager {
    constructor(filePath, telegramIntegration)
    
    // Gestion de la watchlist
    addToWatchlist(userId, reason, moderatorId)
    removeFromWatchlist(userId)
    isOnWatchlist(userId)
    getWatchlistEntry(userId)
    
    // Surveillance des événements
    handleUserJoin(member)
    handleUserMessage(message)
    handleUserAction(userId, action)
    
    // Notifications et alertes
    notifyModerators(guildId, userId, event)
    generateWatchlistReport(guildId)
    
    // Configuration
    setWatchlistSettings(guildId, settings)
}
```

**Fonctionnalités de Surveillance** :
- Notification lors de la jointure d'un utilisateur surveillé
- Monitoring des messages et actions des utilisateurs surveillés
- Historique des activités suspectes
- Rapports périodiques pour les modérateurs
- Niveaux de surveillance configurables (observation, alerte, action)

### 6. EnhancedReloadSystem

```javascript
class EnhancedReloadSystem {
    constructor(commandHandler, managers, telegramIntegration)
    
    // Rechargement à chaud
    async hotReload(components)
    
    // Détection de changements
    watchConfigFiles()
    
    // Préservation d'état
    preserveActiveState()
    
    // Gestion d'erreurs robuste
    handleReloadFailure(error, component)
}
```

## Data Models

### RaidEvent
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

### DoxDetection
```javascript
{
    id: string,
    messageId: string,
    userId: string,
    guildId: string,
    detectionType: 'phone' | 'email' | 'address' | 'ssn' | 'other',
    content: string, // contenu censuré
    timestamp: Date,
    action: 'deleted' | 'warned' | 'banned'
}
```

### TelegramNotification
```javascript
{
    id: string,
    guildId: string,
    type: 'moderation' | 'raid' | 'dox' | 'status' | 'stats',
    priority: 'low' | 'normal' | 'high' | 'urgent',
    message: string,
    timestamp: Date,
    sent: boolean,
    retries: number
}
```

### TelegramMessage
```javascript
{
    id: string,
    telegramMessageId: number,
    telegramChannelId: string,
    guildId: string,
    discordChannelId: string,
    author: {
        telegramUserId: number,
        username: string,
        firstName: string,
        lastName?: string
    },
    content: string,
    attachments: [{
        type: 'photo' | 'document' | 'video' | 'audio',
        fileId: string,
        fileName?: string,
        mimeType?: string
    }],
    timestamp: Date,
    forwarded: boolean,
    discordMessageId?: string
}
```

### FunCommandUsage
```javascript
{
    userId: string,
    guildId: string,
    commandName: string,
    lastUsed: Date,
    usageCount: number,
    scores: {
        trivia: number,
        games: number
    }
}
```

### WatchlistEntry
```javascript
{
    userId: string,
    username: string,
    discriminator: string,
    reason: string,
    addedBy: string, // moderator ID
    addedAt: Date,
    lastSeen: Date,
    guildId: string,
    watchLevel: 'observe' | 'alert' | 'action',
    notes: [
        {
            id: string,
            moderatorId: string,
            note: string,
            timestamp: Date
        }
    ],
    incidents: [
        {
            id: string,
            type: 'join' | 'message' | 'violation' | 'other',
            description: string,
            timestamp: Date,
            channelId?: string,
            messageId?: string
        }
    ],
    active: boolean
}
```

## Error Handling

### Stratégies de Gestion d'Erreurs

1. **Détection de Raids**
   - Fallback vers détection basique si l'analyse avancée échoue
   - Logs détaillés pour le debugging
   - Notifications d'erreur aux administrateurs

2. **Intégration Telegram**
   - Queue de messages avec retry automatique (bidirectionnel)
   - Fallback vers logs Discord si Telegram indisponible
   - Monitoring de la connectivité
   - Gestion des erreurs de transfert Telegram → Discord
   - Validation des permissions Discord avant envoi

3. **Système de Watchlist**
   - Validation des entrées utilisateur
   - Gestion des utilisateurs inexistants
   - Protection contre les faux positifs
   - Logs détaillés des activités surveillées

4. **Système de Reload**
   - Rollback automatique en cas d'échec
   - Préservation de l'état critique
   - Isolation des composants défaillants

5. **Commandes Fun**
   - Réponses d'erreur user-friendly
   - Désactivation temporaire en cas de problème
   - Logs séparés pour le debugging

### Logging et Monitoring

```javascript
// Structure de log étendue
{
    timestamp: Date,
    level: 'debug' | 'info' | 'warn' | 'error' | 'critical',
    component: string,
    guildId?: string,
    userId?: string,
    message: string,
    metadata: object,
    stackTrace?: string
}
```

## Testing Strategy

### Tests Unitaires
- **RaidDetector** : Simulation de scénarios de raid variés
- **DoxDetector** : Tests avec patterns connus et edge cases
- **TelegramIntegration** : Mocks des API Telegram
- **WatchlistManager** : Tests de surveillance et notifications
- **FunCommands** : Validation des réponses et cooldowns

### Tests d'Intégration
- **Workflow complet** : Détection → Action → Notification
- **Gestion des pannes** : Comportement en cas d'indisponibilité des services
- **Performance** : Tests de charge sur la détection de raids

### Tests de Configuration
- **Multi-serveurs** : Validation des configurations isolées
- **Migration** : Tests de mise à jour des configurations existantes
- **Rollback** : Validation du retour aux configurations précédentes

### Environnement de Test
- Serveur Discord de test dédié
- Bot Telegram de test
- Données de test anonymisées
- Simulation d'événements Discord

## Security Considerations

### Protection des Données
- Anonymisation des logs sensibles
- Chiffrement des tokens et configurations
- Rotation régulière des clés API

### Validation des Entrées
- Sanitisation de tous les inputs utilisateur
- Validation des configurations avant application
- Protection contre l'injection de code

### Permissions et Accès
- Principe du moindre privilège
- Validation des permissions Discord avant actions
- Audit trail des actions administratives

### Rate Limiting
- Protection contre le spam des commandes fun
- Limitation des notifications Telegram
- Throttling des détections pour éviter les faux positifs

## Performance Optimizations

### Détection de Raids
- Cache des patterns utilisateur récents
- Algorithmes optimisés pour la détection en temps réel
- Seuils adaptatifs basés sur la taille du serveur

### Intégration Telegram
- Batching des notifications non-urgentes
- Compression des messages longs
- Connection pooling pour les API calls
- Polling optimisé pour les messages Telegram entrants
- Cache des médias téléchargés pour éviter les re-téléchargements

### Système de Reload
- Rechargement incrémental des composants modifiés
- Précompilation des configurations
- Lazy loading des modules non-critiques

Cette conception s'appuie sur l'architecture existante robuste du bot tout en introduisant les nouvelles fonctionnalités de manière modulaire et maintenable.