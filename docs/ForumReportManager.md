# ForumReportManager Documentation

Le ForumReportManager est un système de rapport avancé qui utilise les canaux forum de Discord pour organiser et gérer les rapports de modération de manière centralisée.

## Fonctionnalités principales

### 1. Système de rapports centralisé
- Utilise un serveur de support dédié avec des canaux forum
- Chaque rapport devient un thread dans le forum
- Organisation automatique par catégories et priorités
- Suivi complet du cycle de vie des rapports

### 2. Catégories de rapports
- **Spam** 🚫 - Messages indésirables ou répétitifs
- **Harassment** ⚠️ - Harcèlement, intimidation ou comportement toxique
- **Inappropriate Content** 🔞 - Contenu NSFW ou inapproprié
- **Personal Information** 🆔 - Partage d'informations personnelles (doxxing)
- **Raid/Attack** 🛡️ - Raids de serveur ou attaques coordonnées
- **Other** ❓ - Autres violations ou préoccupations

### 3. Gestion des statuts
- **Open** 🟡 - Rapport ouvert, en attente de traitement
- **Investigating** 🔵 - En cours d'investigation
- **Resolved** 🟢 - Résolu avec succès
- **Closed** ⚫ - Fermé (sans résolution ou invalide)

### 4. Fonctionnalités avancées
- Liaison de rapports connexes
- Historique complet des actions
- Système de notes pour les modérateurs
- Statistiques détaillées
- Recherche et filtrage
- Archivage automatique

## Configuration

### 1. Configuration du serveur de support

```javascript
// Configurer le serveur de support et le canal forum
await forumReportManager.configureSupportServer(
    'SUPPORT_GUILD_ID',
    'FORUM_CHANNEL_ID'
);
```

### 2. Structure des données

Le ForumReportManager stocke ses données dans `data/forum_reports.json` :

```json
{
    "reports": {
        "000001": {
            "id": "000001",
            "reportedUser": "123456789012345678",
            "reportedUsername": "BadUser",
            "reportedBy": "987654321098765432",
            "reporterUsername": "Reporter",
            "category": "spam",
            "reason": "Posting spam messages repeatedly",
            "evidence": "Screenshots attached",
            "messageId": "111222333444555666",
            "channelId": "777888999000111222",
            "sourceGuild": "555666777888999000",
            "timestamp": "2024-01-01T12:00:00.000Z",
            "status": "investigating",
            "priority": "Medium",
            "assignedModerator": "444555666777888999",
            "notes": [],
            "linkedReports": [],
            "forumPostId": "333444555666777888",
            "resolvedAt": null,
            "resolvedBy": null,
            "resolution": null
        }
    },
    "config": {
        "supportGuildId": "123456789012345678",
        "reportsForumId": "987654321098765432",
        "lastReportId": 1
    }
}
```

## Utilisation

### 1. Création d'un rapport

```javascript
const reportData = {
    reportedUserId: 'USER_ID',
    reportedUsername: 'username',
    reporterUserId: 'REPORTER_ID',
    reporterUsername: 'reporter',
    category: 'spam',
    reason: 'Detailed reason for the report',
    evidence: 'Evidence or proof',
    messageId: 'MESSAGE_ID', // Optionnel
    channelId: 'CHANNEL_ID',
    timestamp: new Date().toISOString()
};

const result = await forumReportManager.createForumReport(reportData, 'SOURCE_GUILD_ID');
```

### 2. Mise à jour du statut

```javascript
const result = await forumReportManager.updateReportStatus(
    'REPORT_ID',
    'investigating',
    'MODERATOR_ID'
);
```

### 3. Ajout de notes

```javascript
const result = await forumReportManager.addReportNote(
    'REPORT_ID',
    'Note content here',
    'MODERATOR_ID'
);
```

### 4. Résolution d'un rapport

```javascript
const result = await forumReportManager.resolveReport(
    'REPORT_ID',
    'Resolution description',
    'MODERATOR_ID'
);
```

### 5. Liaison de rapports connexes

```javascript
const reportIds = ['000001', '000002', '000003'];
const result = await forumReportManager.linkRelatedReports(reportIds);
```

### 6. Recherche de rapports

```javascript
// Par utilisateur
const userReports = await forumReportManager.getReportsByUser('USER_ID');

// Par catégorie
const spamReports = await forumReportManager.getReportsByCategory('spam');

// Par statut
const openReports = await forumReportManager.getReportsByStatus('open');

// Par serveur source
const guildReports = await forumReportManager.getReportsByGuild('GUILD_ID');
```

### 7. Statistiques

```javascript
const stats = forumReportManager.getStatistics();
console.log(stats);
// {
//     total: 150,
//     byStatus: { open: 20, investigating: 15, resolved: 115 },
//     byCategory: { spam: 50, harassment: 30, other: 70 },
//     byPriority: { Critical: 5, High: 25, Medium: 70, Low: 50 },
//     averageResolutionTime: 24 // heures
// }
```

## Commandes slash

Le système inclut une commande `/forum-report` avec plusieurs sous-commandes :

### Pour tous les utilisateurs :
- `/forum-report create` - Créer un nouveau rapport

### Pour les modérateurs :
- `/forum-report status` - Mettre à jour le statut d'un rapport
- `/forum-report note` - Ajouter une note à un rapport
- `/forum-report resolve` - Résoudre un rapport
- `/forum-report link` - Lier des rapports connexes
- `/forum-report search` - Rechercher des rapports
- `/forum-report stats` - Voir les statistiques

### Pour les administrateurs :
- `/forum-report configure` - Configurer le serveur de support

## Intégration avec le système existant

Le ForumReportManager peut fonctionner en parallèle avec le ReportManager existant :

```javascript
// Dans votre gestionnaire de commandes
const forumReportManager = new ForumReportManager(client, guildConfig, reportManager);

// Le système utilisera le forum si configuré, sinon il utilisera le système classique
```

## Avantages du système forum

1. **Organisation** - Chaque rapport a son propre thread dédié
2. **Historique** - Toutes les interactions sont conservées dans le thread
3. **Collaboration** - Plusieurs modérateurs peuvent travailler sur un rapport
4. **Visibilité** - Statut et priorité visibles en un coup d'œil
5. **Archivage** - Les rapports résolus sont automatiquement archivés
6. **Recherche** - Utilise les fonctionnalités de recherche natives de Discord

## Bonnes pratiques

1. **Serveur de support dédié** - Utilisez un serveur séparé pour les rapports
2. **Permissions appropriées** - Limitez l'accès au forum aux modérateurs
3. **Formation des modérateurs** - Assurez-vous que l'équipe comprend le système
4. **Suivi régulier** - Vérifiez les statistiques pour identifier les tendances
5. **Archivage** - Archivez régulièrement les anciens rapports résolus

## Dépannage

### Problèmes courants

1. **Forum non configuré** - Vérifiez que le serveur de support et le canal forum sont correctement configurés
2. **Permissions insuffisantes** - Le bot doit avoir les permissions de créer des threads dans le forum
3. **Rapports non créés** - Vérifiez les logs pour les erreurs de création de thread
4. **Données corrompues** - Le système peut récupérer à partir de sauvegardes automatiques

### Logs utiles

```javascript
// Activer les logs détaillés
console.log('ForumReportManager initialized with:', {
    supportGuildId: forumReportManager.supportGuildId,
    reportsForumId: forumReportManager.reportsForumId,
    totalReports: Object.keys(forumReportManager.reports.reports).length
});
```

## Migration depuis ReportManager

Pour migrer depuis l'ancien système :

1. Configurez le ForumReportManager
2. Les nouveaux rapports utiliseront automatiquement le système forum
3. Les anciens rapports restent accessibles via ReportManager
4. Aucune perte de données

Le ForumReportManager représente une évolution majeure du système de rapports, offrant une meilleure organisation, un suivi plus détaillé et une collaboration améliorée entre les modérateurs.