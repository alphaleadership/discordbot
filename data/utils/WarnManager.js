import fs from 'fs';
import path from 'path';

export class WarnManager {
    constructor(filePath = 'warnings.json') {
        this.filePath = path.join(process.cwd(), filePath);
        this.warnings = this.loadWarnings();
    }

    ensureFileExists() {
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

    addWarn(userId, reason, moderatorId = 'système') {
        if (!this.warnings[userId]) {
            this.warnings[userId] = [];
        }

        const warn = {
            id: Date.now().toString(),
            reason,
            moderatorId,
            date: new Date().toISOString(),
            count: this.warnings[userId].length + 1
        };

        this.warnings[userId].push(warn);
        this.saveWarnings();

        return {
            ...warn,
            count: this.warnings[userId].length
        };
    }

    getWarns(userId) {
        return this.warnings[userId] || [];
    }

    removeWarn(userId, warnId) {
        if (!this.warnings[userId]) return false;

        const initialLength = this.warnings[userId].length;
        this.warnings[userId] = this.warnings[userId].filter(warn => warn.id !== warnId);
        
        if (this.warnings[userId].length !== initialLength) {
            this.saveWarnings();
            return true;
        }
        return false;
    }

    clearWarns(userId) {
        if (this.warnings[userId]) {
            delete this.warnings[userId];
            this.saveWarnings();
            return true;
        }
        return false;
    }

    hasWarns(userId) {
        return !!this.warnings[userId] && this.warnings[userId].length > 0;
    }

    getWarnCount(userId) {
        return this.warnings[userId] ? this.warnings[userId].length : 0;
    }
}
