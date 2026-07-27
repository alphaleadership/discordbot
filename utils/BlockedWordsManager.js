
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
        if (!text) return false;
        
        // 1. Normaliser le texte d'entrée (obtention de plusieurs variantes normalisées)
        const normalizedVariants = this.normalizeText(text);
        
        // 2. Récupérer les mots bloqués spécifiques au serveur
        const customBlockedWords = this.getBlockedWords(guildId).flatMap(w => this.normalizeText(w));
        
        // 3. Liste par défaut d'injures en français
        const defaultInsults = [
            'connard', 'connards', 'connarde', 'connardes', 
            'salope', 'salopes', 'encule', 'enculee', 'encules', 'enculees', 
            'fdp', 'pute', 'putes', 'fils de pute', 'fils de putes', 
            'batard', 'batards', 'batarde', 'batardes', 
            'petasse', 'petasses', 'pouffiasse', 'pouffiasses', 
            'con', 'conne', 'connes', 'cons',
            'nique', 'niquer', 'niquez', 'nique-ta-mere'
        ];
        
        const allWords = [...new Set([...customBlockedWords, ...defaultInsults])].filter(w => w.length > 0);
        
        if (allWords.length === 0) {
            return false;
        }
        
        // 4. Construire une expression régulière avec des frontières de mots (\b) pour chaque mot
        const escapedWords = allWords.map(w => w.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&'));
        const regex = new RegExp(escapedWords.map(w => `\\b${w}\\b`).join('|'), 'i');
        
        // 5. Tester chaque variante avec et sans espaces pour les ponctuations
        for (const variant of normalizedVariants) {
            const cleanedSpacing = variant.replace(/[^a-z0-9]/g, ' ');
            const cleanedNoSpacing = variant.replace(/[^a-z0-9]/g, '');
            
            if (regex.test(cleanedSpacing) || regex.test(cleanedNoSpacing)) {
                return true;
            }
        }
        
        return false;
    }

    normalizeText(text) {
        if (!text) return [];
        
        // Convertir en minuscules et retirer les accents/diacritiques
        let normalized = text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
        
        // Variante 1 : le 1 devient i
        const leetMap1 = {
            '4': 'a', '@': 'a',
            '3': 'e', '€': 'e',
            '1': 'i', '!': 'i', '|': 'i',
            '0': 'o',
            '5': 's', '$': 's',
            '7': 't'
        };
        const v1 = normalized.split('').map(char => leetMap1[char] || char).join('');
        
        // Variante 2 : le 1 devient l
        const leetMap2 = {
            ...leetMap1,
            '1': 'l'
        };
        const v2 = normalized.split('').map(char => leetMap2[char] || char).join('');
        
        return [...new Set([v1, v2])];
    }
}
