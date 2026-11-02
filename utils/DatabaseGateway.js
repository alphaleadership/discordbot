import fetch from 'node-fetch';

/**
 * DatabaseGateway - Client HTTP vers la passerelle PHP Free.fr
 * 
 * Remplace mysql2 quand le bot tourne hors du réseau Free.fr.
 * Chaque requête SQL est envoyée via HTTP POST au script PHP
 * qui l'exécute localement sur le serveur Free.fr.
 * 
 * URL passerelle : https://[login].free.fr/db_gateway.php
 */
export class DatabaseGateway {
    constructor() {
        this.gatewayUrl = process.env.GATEWAY_URL || null;
        this.gatewayKey = process.env.GATEWAY_SECRET || null;
        this.connected  = false;
        this.timeout    = 10000; // 10s
    }

    /**
     * Vérifie que la passerelle est accessible.
     */
    async connect() {
        if (!this.gatewayUrl || !this.gatewayKey) {
            console.warn('⚠️  [Gateway] GATEWAY_URL ou GATEWAY_SECRET manquant dans .env');
            return;
        }

        // Tester avec une requête légère
        try {
            const result = await this.query('SELECT 1 AS ok');
            if (result && result[0]?.ok === 1) {
                this.connected = true;
                console.log(`✅ [Gateway] Passerelle PHP connectée : ${this.gatewayUrl}`);
            }
        } catch (err) {
            console.error('❌ [Gateway] Passerelle inaccessible :', err.message);
            this.connected = false;
        }
    }

    /**
     * Envoie une requête SQL à la passerelle PHP.
     * @param {string} sql    - Requête SQL avec placeholders ?
     * @param {Array}  params - Paramètres
     * @returns {Promise<Array>} Tableau de lignes (SELECT) ou objet résultat
     */
    async query(sql, params = []) {
        if (!this.gatewayUrl || !this.gatewayKey) {
            throw new Error('Gateway non configurée (GATEWAY_URL / GATEWAY_SECRET manquants)');
        }

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), this.timeout);

        try {
            const res = await fetch(this.gatewayUrl, {
                method:  'POST',
                headers: {
                    'Content-Type':    'application/json',
                    'X-Gateway-Key':   this.gatewayKey
                },
                body:   JSON.stringify({ sql, params }),
                signal: controller.signal
            });

            clearTimeout(timer);

            if (!res.ok) {
                const errBody = await res.text().catch(() => '');
                throw new Error(`HTTP ${res.status} : ${errBody}`);
            }

            const data = await res.json();

            if (data.error) {
                throw new Error(`SQL error : ${data.error}`);
            }

            // SELECT → retourner les lignes
            if (Array.isArray(data.rows)) return data.rows;

            // INSERT / UPDATE / DELETE → retourner le résultat mysql2-compatible
            return data;

        } catch (err) {
            clearTimeout(timer);
            if (err.name === 'AbortError') {
                throw new Error('Gateway timeout (>10s)');
            }
            throw err;
        }
    }

    /**
     * Retourne la première ligne d'un SELECT.
     */
    async queryOne(sql, params = []) {
        const rows = await this.query(sql, params);
        return Array.isArray(rows) ? (rows[0] || null) : rows;
    }

    /**
     * Alias de query pour les INSERT/UPDATE/DELETE.
     * Retourne { insertId, affectedRows }.
     */
    async execute(sql, params = []) {
        const result = await this.query(sql, params);
        if (Array.isArray(result)) return { affectedRows: result.length, insertId: 0 };
        return {
            affectedRows: result.affected_rows ?? 0,
            insertId:     result.insert_id     ?? 0
        };
    }

    /**
     * Simule une transaction (la passerelle PHP ne supporte pas les transactions
     * multi-requêtes, chaque appel est indépendant — à améliorer si besoin).
     */
    async transaction(callback) {
        // Wrapper minimal — pas de vrai rollback possible via HTTP
        return await callback(this);
    }

    isConnected() {
        return this.connected;
    }

    async disconnect() {
        this.connected = false;
    }
}

// Instance singleton
export const gateway = new DatabaseGateway();
