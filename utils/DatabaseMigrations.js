/**
 * DatabaseMigrations - Schéma SQL du bot Discord
 * Crée toutes les tables nécessaires si elles n'existent pas.
 * Compatible MySQL 5.x (Free.fr utilise MySQL 5.x).
 */

export const MIGRATIONS = [
    // ─── Guildes ────────────────────────────────────────────────────────────
    {
        name: 'create_guilds',
        sql: `
        CREATE TABLE IF NOT EXISTS guilds (
            guild_id        VARCHAR(20)  NOT NULL,
            guild_name      VARCHAR(100) DEFAULT NULL,
            log_channel_id  VARCHAR(20)  DEFAULT NULL,
            prefix          VARCHAR(5)   DEFAULT '/',
            created_at      DATETIME     DEFAULT CURRENT_TIMESTAMP,
            updated_at      DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (guild_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        `
    },

    // ─── Warnings ───────────────────────────────────────────────────────────
    {
        name: 'create_warnings',
        sql: `
        CREATE TABLE IF NOT EXISTS warnings (
            id          INT          NOT NULL AUTO_INCREMENT,
            guild_id    VARCHAR(20)  NOT NULL,
            user_id     VARCHAR(20)  NOT NULL,
            moderator_id VARCHAR(20) NOT NULL,
            reason      TEXT         NOT NULL,
            created_at  DATETIME     DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            INDEX idx_guild_user (guild_id, user_id),
            INDEX idx_user (user_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        `
    },

    // ─── Banlist ─────────────────────────────────────────────────────────────
    {
        name: 'create_banlist',
        sql: `
        CREATE TABLE IF NOT EXISTS banlist (
            id           INT          NOT NULL AUTO_INCREMENT,
            user_id      VARCHAR(20)  NOT NULL,
            guild_id     VARCHAR(20)  DEFAULT NULL,
            reason       TEXT         NOT NULL,
            added_by     VARCHAR(20)  NOT NULL,
            is_global    TINYINT(1)   DEFAULT 0,
            created_at   DATETIME     DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            UNIQUE KEY uq_user_guild (user_id, guild_id),
            INDEX idx_user (user_id),
            INDEX idx_global (is_global)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        `
    },

    // ─── Watchlist ───────────────────────────────────────────────────────────
    {
        name: 'create_watchlist',
        sql: `
        CREATE TABLE IF NOT EXISTS watchlist (
            id           INT          NOT NULL AUTO_INCREMENT,
            user_id      VARCHAR(20)  NOT NULL,
            guild_id     VARCHAR(20)  NOT NULL,
            added_by     VARCHAR(20)  NOT NULL,
            reason       TEXT         DEFAULT NULL,
            level        VARCHAR(20)  DEFAULT 'observe',
            is_global    TINYINT(1)   DEFAULT 0,
            created_at   DATETIME     DEFAULT CURRENT_TIMESTAMP,
            updated_at   DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            UNIQUE KEY uq_user_guild (user_id, guild_id),
            INDEX idx_user (user_id),
            INDEX idx_global (is_global)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        `
    },

    // ─── Watchlist incidents ─────────────────────────────────────────────────
    {
        name: 'create_watchlist_incidents',
        sql: `
        CREATE TABLE IF NOT EXISTS watchlist_incidents (
            id           INT          NOT NULL AUTO_INCREMENT,
            user_id      VARCHAR(20)  NOT NULL,
            guild_id     VARCHAR(20)  NOT NULL,
            channel_id   VARCHAR(20)  DEFAULT NULL,
            message_id   VARCHAR(20)  DEFAULT NULL,
            content      TEXT         DEFAULT NULL,
            level        VARCHAR(20)  DEFAULT 'observe',
            created_at   DATETIME     DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            INDEX idx_user_guild (user_id, guild_id),
            INDEX idx_created (created_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        `
    },

    // ─── Dossiers espionnage ─────────────────────────────────────────────────
    {
        name: 'create_espionage_dossiers',
        sql: `
        CREATE TABLE IF NOT EXISTS espionage_dossiers (
            id             INT          NOT NULL AUTO_INCREMENT,
            user_id        VARCHAR(20)  NOT NULL,
            guild_id       VARCHAR(20)  NOT NULL,
            thread_id      VARCHAR(20)  DEFAULT NULL,
            threat_level   ENUM('Low','Medium','High','Critical') DEFAULT 'Low',
            message_count  INT          DEFAULT 0,
            created_at     DATETIME     DEFAULT CURRENT_TIMESTAMP,
            updated_at     DATETIME     DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            UNIQUE KEY uq_user_guild (user_id, guild_id),
            INDEX idx_threat (threat_level)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        `
    },

    // ─── Notes des dossiers ──────────────────────────────────────────────────
    {
        name: 'create_espionage_notes',
        sql: `
        CREATE TABLE IF NOT EXISTS espionage_notes (
            id           VARCHAR(30)  NOT NULL,
            user_id      VARCHAR(20)  NOT NULL,
            guild_id     VARCHAR(20)  NOT NULL,
            author_id    VARCHAR(20)  NOT NULL DEFAULT 'system',
            content      TEXT         NOT NULL,
            created_at   DATETIME     DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            INDEX idx_user_guild (user_id, guild_id),
            INDEX idx_created (created_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        `
    },

    // ─── Mots bloqués ────────────────────────────────────────────────────────
    {
        name: 'create_blocked_words',
        sql: `
        CREATE TABLE IF NOT EXISTS blocked_words (
            id         INT          NOT NULL AUTO_INCREMENT,
            guild_id   VARCHAR(20)  NOT NULL,
            word       VARCHAR(200) NOT NULL,
            added_by   VARCHAR(20)  NOT NULL,
            created_at DATETIME     DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            UNIQUE KEY uq_guild_word (guild_id, word),
            INDEX idx_guild (guild_id)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        `
    },

    // ─── Logs de modération ──────────────────────────────────────────────────
    {
        name: 'create_moderation_logs',
        sql: `
        CREATE TABLE IF NOT EXISTS moderation_logs (
            id           INT          NOT NULL AUTO_INCREMENT,
            guild_id     VARCHAR(20)  NOT NULL,
            user_id      VARCHAR(20)  NOT NULL,
            moderator_id VARCHAR(20)  NOT NULL,
            action       VARCHAR(50)  NOT NULL,
            reason       TEXT         DEFAULT NULL,
            duration     INT          DEFAULT NULL,
            created_at   DATETIME     DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (id),
            INDEX idx_guild_user (guild_id, user_id),
            INDEX idx_action (action),
            INDEX idx_created (created_at)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        `
    }
];

/**
 * Exécute toutes les migrations sur la base de données.
 * @param {import('./Database.js').Database} db
 */
export async function runMigrations(db) {
    if (!db.isConnected()) {
        console.warn('⚠️  [Migrations] Base de données non connectée — migrations ignorées.');
        return;
    }

    console.log('🗄️  [Migrations] Exécution des migrations SQL...');
    let success = 0;

    for (const migration of MIGRATIONS) {
        try {
            await db.query(migration.sql);
            console.log(`   ✅ ${migration.name}`);
            success++;
        } catch (err) {
            console.error(`   ❌ ${migration.name} :`, err.message);
        }
    }

    console.log(`🗄️  [Migrations] ${success}/${MIGRATIONS.length} tables prêtes.`);
}
