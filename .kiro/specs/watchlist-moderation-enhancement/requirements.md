# Requirements Document

## Introduction

Cette fonctionnalité vise à réparer et améliorer le système de surveillance (WatchlistManager) du bot Discord et à ajouter des commandes de modération complètes utilisables par les personnes ayant les permissions appropriées ou les administrateurs du bot. Le système permettra une surveillance efficace des utilisateurs problématiques et fournira des outils de modération robustes pour maintenir l'ordre dans les serveurs Discord.

## Requirements

### Requirement 1

**User Story:** En tant que modérateur Discord, je veux pouvoir ajouter des utilisateurs à une liste de surveillance locale ou globale, afin de pouvoir surveiller leur comportement et prendre des mesures préventives.

#### Acceptance Criteria

1. WHEN un modérateur utilise la commande `/watchlist-add` THEN le système SHALL ajouter l'utilisateur à la liste de surveillance avec la raison fournie
2. WHEN un administrateur du bot utilise la commande `/global-watchlist-add` THEN le système SHALL ajouter l'utilisateur à la liste de surveillance globale
3. IF l'utilisateur est déjà sur la liste de surveillance THEN le système SHALL afficher un message d'erreur approprié
4. WHEN un utilisateur surveillé rejoint un serveur THEN le système SHALL notifier automatiquement les modérateurs
5. WHEN un utilisateur surveillé envoie un message THEN le système SHALL enregistrer l'activité selon le niveau de surveillance configuré

### Requirement 2

**User Story:** En tant que modérateur Discord, je veux pouvoir consulter et gérer la liste de surveillance, afin de maintenir un suivi efficace des utilisateurs problématiques.

#### Acceptance Criteria

1. WHEN un modérateur utilise la commande `/watchlist-list` THEN le système SHALL afficher tous les utilisateurs surveillés sur le serveur
2. WHEN un modérateur utilise la commande `/watchlist-info` THEN le système SHALL afficher les détails complets d'un utilisateur surveillé
3. WHEN un modérateur utilise la commande `/watchlist-remove` THEN le système SHALL retirer l'utilisateur de la liste de surveillance
4. WHEN un modérateur ajoute une note avec `/watchlist-note` THEN le système SHALL enregistrer la note avec l'horodatage et l'auteur
5. IF un utilisateur n'est pas sur la liste de surveillance THEN le système SHALL afficher un message d'erreur approprié

### Requirement 3

**User Story:** En tant que modérateur Discord, je veux avoir accès à des commandes de modération complètes, afin de pouvoir maintenir l'ordre et appliquer les règles du serveur efficacement.

#### Acceptance Criteria

1. WHEN un modérateur utilise la commande `/kick` THEN le système SHALL expulser l'utilisateur du serveur avec la raison fournie
2. WHEN un modérateur utilise la commande `/ban` THEN le système SHALL bannir l'utilisateur du serveur avec la raison fournie
3. WHEN un modérateur utilise la commande `/unban` THEN le système SHALL débannir l'utilisateur du serveur
4. WHEN un modérateur utilise la commande `/timeout` THEN le système SHALL mettre l'utilisateur en timeout pour la durée spécifiée
5. WHEN un modérateur utilise la commande `/clear` THEN le système SHALL supprimer le nombre de messages spécifié
6. IF l'utilisateur cible a des permissions supérieures THEN le système SHALL refuser l'action avec un message d'erreur

### Requirement 4

**User Story:** En tant qu'administrateur de serveur, je veux que les commandes de modération respectent la hiérarchie des permissions Discord, afin d'assurer la sécurité et l'intégrité du système de modération.

#### Acceptance Criteria

1. WHEN un utilisateur sans permissions appropriées tente d'utiliser une commande de modération THEN le système SHALL refuser l'accès avec un message d'erreur
2. WHEN un modérateur tente d'agir sur un utilisateur avec des permissions supérieures THEN le système SHALL refuser l'action
3. WHEN un administrateur du bot utilise une commande THEN le système SHALL permettre l'action indépendamment des permissions Discord
4. IF un utilisateur tente de s'auto-modérer THEN le système SHALL refuser l'action avec un message d'erreur approprié
5. WHEN une action de modération est effectuée THEN le système SHALL enregistrer l'action dans les logs avec tous les détails pertinents

### Requirement 5

**User Story:** En tant que modérateur Discord, je veux recevoir des notifications automatiques sur les activités des utilisateurs surveillés, afin de pouvoir réagir rapidement aux comportements problématiques.

#### Acceptance Criteria

1. WHEN un utilisateur surveillé rejoint le serveur THEN le système SHALL envoyer une notification aux modérateurs
2. WHEN un utilisateur surveillé avec niveau "alert" ou "action" envoie un message THEN le système SHALL notifier les modérateurs
3. WHEN un utilisateur surveillé effectue une action suspecte THEN le système SHALL enregistrer l'incident et notifier selon le niveau de surveillance
4. IF le niveau de surveillance est "observe" THEN le système SHALL seulement enregistrer les activités sans notification
5. WHEN une notification est envoyée THEN elle SHALL inclure les détails de l'utilisateur, l'action, et l'historique pertinent

### Requirement 6

**User Story:** En tant qu'administrateur du bot, je veux pouvoir gérer la liste de surveillance globale, afin de partager des informations sur les utilisateurs problématiques entre tous les serveurs utilisant le bot.

#### Acceptance Criteria

1. WHEN un administrateur utilise `/global-watchlist-add` THEN le système SHALL ajouter l'utilisateur à la surveillance globale
2. WHEN un administrateur utilise `/global-watchlist-remove` THEN le système SHALL retirer l'utilisateur de la surveillance globale
3. WHEN un administrateur utilise `/global-watchlist-list` THEN le système SHALL afficher tous les utilisateurs sur la liste globale
4. WHEN un utilisateur de la liste globale rejoint n'importe quel serveur THEN le système SHALL notifier les modérateurs de ce serveur
5. IF un utilisateur est sur la liste globale THEN il SHALL être automatiquement surveillé sur tous les serveurs

### Requirement 7

**User Story:** En tant que développeur du bot, je veux que le WatchlistManager soit robuste et gère correctement les erreurs, afin d'assurer la fiabilité du système de surveillance.

#### Acceptance Criteria

1. WHEN une erreur de fichier se produit THEN le système SHALL créer automatiquement les fichiers manquants
2. WHEN des données corrompues sont détectées THEN le système SHALL utiliser des valeurs par défaut et enregistrer l'erreur
3. WHEN une opération échoue THEN le système SHALL retourner un message d'erreur descriptif
4. IF le fichier de données est verrouillé THEN le système SHALL réessayer l'opération avec un délai
5. WHEN le système redémarre THEN il SHALL recharger automatiquement toutes les données de surveillance

### Requirement 8

**User Story:** En tant qu'utilisateur Discord, je veux que le système antidox ne détecte pas les IDs Discord comme des données sensibles, afin d'éviter les faux positifs lors du partage d'informations légitimes sur les utilisateurs.

#### Acceptance Criteria

1. WHEN un message contient un ID Discord (format 17-19 chiffres) THEN le système antidox SHALL ignorer cet ID et ne pas le signaler comme donnée sensible
2. WHEN un modérateur partage un ID utilisateur pour des raisons de modération THEN le système SHALL permettre le partage sans déclencher d'alerte
3. WHEN le système antidox analyse un message THEN il SHALL exclure les IDs Discord de la détection de données personnelles
4. IF un message contient à la fois un ID Discord et d'autres données sensibles THEN le système SHALL seulement signaler les autres données sensibles
5. WHEN la configuration antidox est mise à jour THEN elle SHALL inclure une exception spécifique pour les IDs Discord