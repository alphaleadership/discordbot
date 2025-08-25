import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const CONFIG_FILE = path.join(__dirname, '..', 'data', 'telegram_config.json');

// Créer le fichier de configuration s'il n'existe pas
if (!fs.existsSync(path.dirname(CONFIG_FILE))) {
    fs.mkdirSync(path.dirname(CONFIG_FILE), { recursive: true });
}

if (!fs.existsSync(CONFIG_FILE)) {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify({ channels: {} }, null, 2));
}

export function getConfig() {
    try {
        const data = fs.readFileSync(CONFIG_FILE, 'utf8');
        return JSON.parse(data);
    } catch (error) {
        console.error('Erreur lors de la lecture du fichier de configuration:', error);
        return { channels: {} };
    }
}

export function saveConfig(config) {
    try {
        fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
        return true;
    } catch (error) {
        console.error('Erreur lors de l\'écriture du fichier de configuration:', error);
        return false;
    }
}

export function setChannelConfig(guildId, channelName) {
    const config = getConfig();
    config.channels[guildId] = {
        name: channelName,
        lastChecked: new Date().toISOString()
    };
    return saveConfig(config);
}

export function getChannelConfig(guildId) {
    const config = getConfig();
    return config.channels[guildId] || null;
}
