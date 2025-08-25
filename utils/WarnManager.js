import fs from 'fs';
import path from 'path';

export class WarnManager {
    constructor(filePath = 'warnings.json') {
        this.filePath = path.join(process.cwd(), 'data', filePath);
        this.warnings = this.loadWarnings();
    }

    ensureFileExists() {
        const dir = path.dirname(this.filePath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        if (!fs.existsSync(this.filePath)) {
            fs.writeFileSync(this.filePath, '{}', 'utf-8');
        }
    }

    loadWarnings() {
        try {
            this.ensureFileExists();
            const data = fs.readFileSync(this.filePath, 'utf-8');
            return JSON.parse(data);
        } catch (error) {
            console.error('Erreur lors du chargement des avertissements:', error);
            return {};
        }
    }

    reload() {
        this.warnings = this.loadWarnings();
        console.log('WarnManager rechargé avec succès.');
    }

    saveWarnings() {
        try {
            fs.writeFileSync(this.filePath, JSON.stringify(this.warnings, null, 2), 'utf-8');
        } catch (error) {
            console.error('Erreur lors de la sauvegarde des avertissements:', error);
        }
    }

    addWarn(guildId, userId, reason, moderatorId = 'système') {
        if (!this.warnings[guildId]) {
            this.warnings[guildId] = {};
        }
        if (!this.warnings[guildId][userId]) {
            this.warnings[guildId][userId] = [];
        }

        const warn = {
            id: Date.now().toString(),
            reason,
            moderatorId,
            date: new Date().toISOString(),
        };

        this.warnings[guildId][userId].push(warn);
        this.saveWarnings();

        return {
            ...warn,
            count: this.warnings[guildId][userId].length
        };
    }

    getWarns(guildId, userId) {
        if (guildId) {
            return this.warnings[guildId]?.[userId] || [];
        }
        // For global warnings, we check across all guilds
        const allWarns = [];
        for (const gid in this.warnings) {
            if (this.warnings[gid][userId]) {
                allWarns.push(...this.warnings[gid][userId].map(w => ({...w, guildId: gid})));
            }
        }
        return allWarns;
    }

    removeWarn(guildId, userId, warnId) {
        if (!this.warnings[guildId]?.[userId]) return false;

        const initialLength = this.warnings[guildId][userId].length;
        this.warnings[guildId][userId] = this.warnings[guildId][userId].filter(warn => warn.id !== warnId);
        
        if (this.warnings[guildId][userId].length !== initialLength) {
            this.saveWarnings();
            return true;
        }
        return false;
    }

    clearWarns(guildId, userId) {
        if (this.warnings[guildId]?.[userId]) {
            delete this.warnings[guildId][userId];
            if (Object.keys(this.warnings[guildId]).length === 0) {
                delete this.warnings[guildId];
            }
            this.saveWarnings();
            return true;
        }
        return false;
    }

    hasWarns(guildId, userId) {
        return !!this.warnings[guildId]?.[userId] && this.warnings[guildId][userId].length > 0;
    }

    getWarnCount(guildId, userId) {
        return this.warnings[guildId]?.[userId] ? this.warnings[guildId][userId].length : 0;
    }
}

export const localWarnManager = new WarnManager('warnings.json');
export const globalWarnManager = new WarnManager('global_warnings.json');