
import fs from 'fs';
import path from 'path';

export class BlockedWordsManager {
    constructor(filePath = 'data/blocked_words.json') {
        this.filePath = path.join(process.cwd(), filePath);
        this.blockedWords = this.loadBlockedWords();
    }

    ensureFileExists() {
        if (!fs.existsSync(this.filePath)) {
            this.saveBlockedWords();
        }
    }

    loadBlockedWords() {
        try {
            if (fs.existsSync(this.filePath)) {
                const data = fs.readFileSync(this.filePath, 'utf8');
                return JSON.parse(data);
            }
        } catch (error) {
            console.error('Erreur lors du chargement des mots bloqués:', error);
        }
        return {};
    }

    reload() {
        this.blockedWords = this.loadBlockedWords();
        console.log(`Mots bloqués rechargés depuis ${this.filePath}`);
    }

    saveBlockedWords() {
        try {
            const dir = path.dirname(this.filePath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }
            fs.writeFileSync(this.filePath, JSON.stringify(this.blockedWords, null, 2), 'utf8');
        } catch (error) {
            console.error('Erreur lors de la sauvegarde des mots bloqués:', error);
        }
    }

    addBlockedWord(guildId, word) {
        if (!this.blockedWords[guildId]) {
            this.blockedWords[guildId] = [];
        }
        if (!this.blockedWords[guildId].includes(word)) {
            this.blockedWords[guildId].push(word);
            this.saveBlockedWords();
            return true;
        }
        return false;
    }

    removeBlockedWord(guildId, word) {
        if (!this.blockedWords[guildId]) {
            return false;
        }
        const index = this.blockedWords[guildId].indexOf(word);
        if (index > -1) {
            this.blockedWords[guildId].splice(index, 1);
            this.saveBlockedWords();
            return true;
        }
        return false;
    }

    getBlockedWords(guildId) {
        return this.blockedWords[guildId] || [];
    }

    isBlocked(guildId, text) {
        const blockedWords = this.getBlockedWords(guildId);
        if (blockedWords.length === 0) {
            return false;
        }
        const regex = new RegExp(blockedWords.join('|'), 'i');
        return regex.test(text);
    }
}
