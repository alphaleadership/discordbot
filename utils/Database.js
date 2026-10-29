import mysql from 'mysql2/promise';
import { DatabaseGateway } from './DatabaseGateway.js';

/**
 * Database - Gestionnaire de connexion MySQL
 * 
 * Stratégie de connexion :
 *   1. Essaie MySQL direct (mysql2) — fonctionne si le bot tourne sur le réseau Free.fr
 *   2. Si échec, bascule automatiquement sur la passerelle PHP HTTP
 * 
 * Ainsi le même code fonctionne en local (via passerelle) et sur le serveur (direct).
 */
export class Database {
    constructor() {
        this.pool      = null;      // connexion mysql2 directe
        this.gateway   = null;      // passerelle PHP HTTP
        this.mode      = null;      // 'direct' | 'gateway' | null
        this.connected = false;
    }

    /**
     * Initialise la connexion. Essaie mysql2 direct d'abord, puis passerelle.
     */
    async connect() {
        // ── Tentative 1 : MySQL direct ────────────────────────────────────────
        const host     = process.env.MYSQL_HOST;
        const user     = process.env.MYSQL_USER;
        const password = process.env.MYSQL_PASS;
        const database = process.env.MYSQL_DB;

        if (host && user && password && database &&
            !user.startsWith('VOTRE_') && !password.startsWith('VOTRE_')) {
            try {
                this.pool = mysql.createPool({
                    host,
                    port:             parseInt(process.env.MYSQL_PORT || '3306', 10),
                    user,
                    password,
                    database,
                    waitForConnections: true,
                    connectionLimit:    5,
                    queueLimit:         0,
                    connectTimeout:     5000,
                    ssl: process.env.MYSQL_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
                    enableKeepAlive:       true,
                    keepAliveInitialDelay: 30000
                });

                const conn = await this.pool.getConnection();
                conn.release();
                this.connected = true;
                this.mode      = 'direct';
                console.log(`✅ [Database] MySQL direct connecté (${host}/${database})`);
                return;
            } catch (err) {
                console.warn(`⚠️  [Database] MySQL direct échoué (${err.message}) — bascule sur la passerelle...`);
                await this.pool?.end().catch(() => {});
                this.pool = null;
            }
        }

        // ── Tentative 2 : Passerelle PHP HTTP ────────────────────────────────
        const gatewayUrl = process.env.GATEWAY_URL;
        const gatewayKey = process.env.GATEWAY_SECRET;

        if (gatewayUrl && gatewayKey &&
            !gatewayUrl.includes('LOGIN_FREE') && !gatewayKey.startsWith('REMPLACER_')) {
            this.gateway = new DatabaseGateway();
            await this.gateway.connect();

            if (this.gateway.isConnected()) {
                this.connected = true;
                this.mode      = 'gateway';
                return;
            }
        }

        console.warn('⚠️  [Database] Ni MySQL direct ni passerelle disponibles — DB désactivée.');
    }

    // ── API publique (identique quel que soit le mode) ────────────────────────

    async query(sql, params = []) {
        this._assertConnected();
        if (this.mode === 'direct') {
            const [rows] = await this.pool.execute(sql, params);
            return rows;
        }
        return this.gateway.query(sql, params);
    }

    async queryOne(sql, params = []) {
        const rows = await this.query(sql, params);
        return Array.isArray(rows) ? (rows[0] || null) : rows;
    }

    async execute(sql, params = []) {
        this._assertConnected();
        if (this.mode === 'direct') {
            const [result] = await this.pool.execute(sql, params);
            return result;
        }
        return this.gateway.execute(sql, params);
    }

    async transaction(callback) {
        this._assertConnected();
        if (this.mode === 'direct') {
            const conn = await this.pool.getConnection();
            await conn.beginTransaction();
            try {
                const result = await callback(conn);
                await conn.commit();
                return result;
            } catch (err) {
                await conn.rollback();
                throw err;
            } finally {
                conn.release();
            }
        }
        // Passerelle : pas de vrai rollback
        return this.gateway.transaction(callback);
    }

    async disconnect() {
        if (this.pool) {
            await this.pool.end().catch(() => {});
            this.pool = null;
        }
        if (this.gateway) {
            await this.gateway.disconnect();
            this.gateway = null;
        }
        this.connected = false;
        this.mode      = null;
        console.log('🔌 [Database] Déconnecté.');
    }

    isConnected() {
        return this.connected;
    }

    getMode() {
        return this.mode;
    }

    _assertConnected() {
        if (!this.connected) throw new Error('[Database] Non connectée');
    }
}

// Singleton partagé
export const db = new Database();
