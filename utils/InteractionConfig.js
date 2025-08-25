// Configuration pour le gestionnaire d'interactions
export const InteractionConfig = {
    // Référence à la fonction de sauvegarde
    backupToGitHub: null,
    // Dernière sauvegarde
    lastBackupTime: 0
};

// Fonction pour initialiser la configuration
export function initInteractionConfig(config) {
    if (config.backupToGitHub) {
        InteractionConfig.backupToGitHub = config.backupToGitHub;
    }
    if (config.lastBackupTime !== undefined) {
        InteractionConfig.lastBackupTime = config.lastBackupTime;
    }
}
