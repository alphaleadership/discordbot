# Système de Suivi des Suppressions de Messages

Le système de suivi des suppressions de messages offre une surveillance complète et une analyse des messages supprimés dans votre serveur Discord. Il permet de détecter les patterns suspects, de générer des rapports détaillés et d'alerter les modérateurs en cas d'activité anormale.

## 🎯 Fonctionnalités principales

### 1. Surveillance automatique
- **Détection en temps réel** des suppressions de messages individuels
- **Surveillance des suppressions en masse** (bulk delete)
- **Analyse des patterns suspects** (spam cleanup, raids, etc.)
- **Alertes automatiques** pour les modérateurs

### 2. Logging complet
- **Sauvegarde des messages supprimés** avec contenu, auteur, timestamp
- **Historique des suppressions** organisé par date et canal
- **Métadonnées complètes** (pièces jointes, embeds, mentions)
- **Logs système** pour les événements importants

### 3. Analyse avancée
- **Détection de patterns** de suppression rapide
- **Analyse de contenu suspect** (liens d'invitation, spam)
- **Identification des raids** et nettoyages massifs
- **Statistiques détaillées** par utilisateur, canal, période

### 4. Rapports et monitoring
- **Rapports quotidiens** automatiques
- **Analyses hebdomadaires** complètes
- **Statistiques en temps réel**
- **Recommandations** basées sur l'analyse

## 📊 Structure des données

### Messages supprimés individuels
```json
{
  "messageId": "123456789012345678",
  "author": {
    "id": "987654321098765432",
    "username": "utilisateur",
    "discriminator": "0001",
    "bot": false
  },
  "channelId": "111222333444555666",
  "channelName": "general",
  "guildId": "777888999000111222",
  "guildName": "Mon Serveur",
  "content": "Contenu du message supprimé",
  "originalTimestamp": 1640995200000,
  "deletedAt": "2024-01-01T12:00:00.000Z",
  "attachments": [],
  "embeds": [],
  "logType": "message_deletion"
}
```

### Suppressions en masse
```json
{
  "type": "bulk_deletion",
  "guildId": "777888999000111222",
  "channelId": "111222333444555666",
  "deletedCount": 25,
  "deletedAt": "2024-01-01T12:00:00.000Z",
  "messages": [
    {
      "id": "msg1",
      "author": { "id": "user1", "username": "spammer" },
      "content": "Message de spam",
      "createdTimestamp": 1640995200000
    }
  ],
  "logType": "bulk_message_deletion"
}
```

## 🚀 Installation et configuration

### 1. Intégration dans votre bot

```javascript
import MessageLogger from './utils/MessageLogger.js';
import { MessageDeletionHandler } from './utils/MessageDeletionHandler.js';
import { ReportManager } from './utils/ReportManager.js';

// Initialisation
const reportManager = new ReportManager();
const messageLogger = new MessageLogger(reportManager);
const deletionHandler = new MessageDeletionHandler(client, messageLogger);

// Les événements sont automatiquement gérés
```

### 2. Permissions requises

Le bot doit avoir les permissions suivantes :
- `VIEW_CHANNEL` - Pour voir les canaux
- `READ_MESSAGE_HISTORY` - Pour accéder à l'historique
- `SEND_MESSAGES` - Pour envoyer des rapports
- `EMBED_LINKS` - Pour les embeds de rapport

### 3. Intents Discord nécessaires

```javascript
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent, // Requis pour le contenu
        GatewayIntentBits.GuildMembers
    ]
});
```

## 📋 Commandes disponibles

### `/message-deletions stats`
Affiche les statistiques de suppression pour une période donnée.

**Options :**
- `days` (optionnel) - Nombre de jours à analyser (1-30, défaut: 7)

**Exemple :**
```
/message-deletions stats days:14
```

### `/message-deletions recent`
Affiche les suppressions récentes dans un canal.

**Options :**
- `channel` (optionnel) - Canal à analyser
- `minutes` (optionnel) - Minutes à analyser (1-1440, défaut: 30)

**Exemple :**
```
/message-deletions recent channel:#general minutes:60
```

### `/message-deletions search`
Recherche des messages supprimés selon des critères.

**Options :**
- `user` (optionnel) - Utilisateur dont les messages ont été supprimés
- `channel` (optionnel) - Canal où chercher
- `content` (optionnel) - Contenu à rechercher

**Exemple :**
```
/message-deletions search user:@spammer channel:#general
```

### `/message-deletions bulk`
Affiche les suppressions en masse récentes.

**Options :**
- `days` (optionnel) - Nombre de jours à analyser (1-14, défaut: 3)

**Exemple :**
```
/message-deletions bulk days:7
```

## 🔍 Détection automatique

### Patterns suspects détectés

1. **Suppressions rapides**
   - 3+ messages du même utilisateur supprimés en 10 minutes
   - Déclenche un log système automatique

2. **Contenu suspect**
   - Liens d'invitation Discord (`discord.gg/`)
   - Mentions massives (`@everyone`, `@here`)
   - URLs multiples dans un message
   - Caractères répétés (spam)

3. **Nettoyage de raid**
   - 20+ messages supprimés de ≤3 utilisateurs
   - Déclenche une alerte de nettoyage potentiel

4. **Suppressions massives**
   - 5+ suppressions en 5 minutes dans le même canal
   - 50+ messages supprimés en une fois

### Alertes automatiques

Le système envoie automatiquement des alertes pour :
- **Suppressions massives** (≥5 suppressions en 5 min)
- **Nettoyage de raid** potentiel
- **Taux de suppression élevé** (>100 suppressions/24h)
- **Suppressions en masse multiples** (>3 événements/24h)

## 📈 Rapports et analyses

### Rapport quotidien automatique

Généré chaque jour à minuit, inclut :
- Nombre total de suppressions
- Suppressions en masse
- Canaux les plus affectés
- Utilisateurs les plus affectés
- Alertes si taux anormal

### Rapport hebdomadaire complet

Généré chaque dimanche, inclut :
- Analyse de tendance (croissant/décroissant/stable)
- Statistiques détaillées par canal/utilisateur/jour
- Jour de pic d'activité
- Recommandations basées sur l'analyse
- Canaux et utilisateurs préoccupants

### Analyse en temps réel

Surveillance continue avec :
- Vérification toutes les 5 minutes
- Détection de patterns anormaux
- Logs de surveillance
- Alertes immédiates si nécessaire

## 🛠️ API et intégration

### Obtenir les statistiques

```javascript
// Statistiques de suppression pour un serveur
const stats = messageLogger.getDeletionStats(guildId, 7);

// Suppressions récentes dans un canal
const recent = await messageLogger.getRecentDeletions(guildId, channelId, 30);

// Statistiques de monitoring
const monitoring = await deletionHandler.getDeletionMonitoringStats(guildId);
```

### Générer un rapport

```javascript
// Rapport complet pour une période
const report = await deletionHandler.generateDeletionReport(guildId, 7);

// Contient :
// - summary: résumé des suppressions
// - breakdown: répartition par canal/utilisateur/jour
// - trends: analyse de tendance
// - recommendations: recommandations
```

### Événements personnalisés

```javascript
// Écouter les suppressions
client.on('messageDelete', async (message) => {
    // Votre logique personnalisée
});

// Écouter les suppressions en masse
client.on('messageBulkDelete', async (messages, channel) => {
    // Votre logique personnalisée
});
```

## 🔧 Configuration avancée

### Personnaliser les seuils d'alerte

```javascript
// Dans MessageDeletionHandler.js
const ALERT_THRESHOLDS = {
    rapidDeletions: 3,        // Messages du même user en 10 min
    massiveDeletions: 5,      // Suppressions en 5 min même canal
    bulkDeletionSize: 50,     // Taille minimum pour alerte bulk
    highDeletionRate: 100,    // Suppressions/24h pour alerte
    raidCleanupSize: 20,      // Messages minimum pour raid cleanup
    raidCleanupUsers: 3       // Utilisateurs maximum pour raid cleanup
};
```

### Personnaliser les patterns suspects

```javascript
// Ajouter des patterns personnalisés
const customPatterns = [
    /votre-pattern-regex/gi,
    /autre-pattern/gi
];

// Dans analyzeMessageDeletion()
const suspiciousPatterns = [
    ...defaultPatterns,
    ...customPatterns
];
```

### Configuration des rapports

```javascript
// Personnaliser la fréquence des rapports
const REPORT_SCHEDULE = {
    daily: { hour: 0, minute: 0 },      // Minuit
    weekly: { day: 0, hour: 9, minute: 0 } // Dimanche 9h
};

// Personnaliser les destinataires
const REPORT_CHANNELS = {
    daily: 'CHANNEL_ID_DAILY',
    weekly: 'CHANNEL_ID_WEEKLY',
    alerts: 'CHANNEL_ID_ALERTS'
};
```

## 📁 Structure des fichiers

```
messages/
├── GUILD_ID/
│   ├── CHANNEL_ID/
│   │   └── YYYY-MM-DD.json          # Messages normaux
│   ├── deletions/
│   │   └── YYYY-MM-DD.json          # Suppressions individuelles
│   └── bulk_deletions/
│       └── YYYY-MM-DD.json          # Suppressions en masse
└── data/
    ├── system_logs/                  # Logs système
    ├── error_logs/                   # Logs d'erreur
    └── raid_events/                  # Événements de raid
```

## 🧹 Maintenance et nettoyage

### Nettoyage automatique

```javascript
// Nettoyer les logs anciens (garde 30 jours par défaut)
const deletedCount = messageLogger.cleanOldLogs(30);
```

### Nettoyage manuel

```javascript
// Nettoyer les logs d'un serveur spécifique
await cleanGuildLogs(guildId, daysToKeep);

// Nettoyer par type de log
await cleanLogsByType('deletions', daysToKeep);
await cleanLogsByType('bulk_deletions', daysToKeep);
```

### Archivage

```javascript
// Archiver les anciens logs
await archiveOldLogs(daysToArchive);

// Exporter les statistiques
const exportData = await exportDeletionStats(guildId, startDate, endDate);
```

## 🚨 Dépannage

### Problèmes courants

1. **Logs non créés**
   - Vérifier les permissions du bot
   - Vérifier l'espace disque disponible
   - Vérifier les intents Discord

2. **Alertes non envoyées**
   - Vérifier la configuration du ReportManager
   - Vérifier les permissions du canal de rapport
   - Vérifier les seuils d'alerte

3. **Performance dégradée**
   - Nettoyer les anciens logs
   - Optimiser les requêtes de base de données
   - Réduire la fréquence de monitoring

### Logs de débogage

```javascript
// Activer les logs détaillés
console.log('MessageDeletionHandler initialized');
console.log('Event listeners configured');
console.log(`Deletion logged: ${messageId} in ${guildId}`);
```

## 📊 Métriques et KPI

### Métriques surveillées

- **Taux de suppression** (suppressions/messages totaux)
- **Fréquence des suppressions en masse**
- **Temps de réponse** aux incidents
- **Précision de détection** des raids
- **Faux positifs** dans les alertes

### Indicateurs de performance

- **Latence de logging** (<100ms)
- **Précision d'analyse** (>95%)
- **Disponibilité du système** (>99.9%)
- **Temps de génération des rapports** (<30s)

Le système de suivi des suppressions de messages offre une surveillance complète et une analyse approfondie pour maintenir la sécurité et l'ordre dans votre serveur Discord. Il combine détection automatique, analyse intelligente et rapports détaillés pour fournir aux modérateurs tous les outils nécessaires pour gérer efficacement les suppressions de messages.