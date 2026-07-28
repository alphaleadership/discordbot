function checkAuth() {
    const savedPassword = localStorage.getItem('admin_password');
    if (savedPassword) {
        document.getElementById('password').value = savedPassword;
        login(true);
    }
}

function login(isAuto = false) {
    const password = document.getElementById('password').value;
    fetch('/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password })
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            localStorage.setItem('admin_password', password);
            document.getElementById('login-container').style.display = 'none';
            document.getElementById('control-panel').style.display = 'block';
            loadBanlist();
            loadServers();
            connectWebSocket(); // Start listening to WebSocket
        } else {
            localStorage.removeItem('admin_password');
            if (!isAuto) {
                alert('Incorrect password');
            }
        }
    });
}

// Check auth on load
window.addEventListener('DOMContentLoaded', checkAuth);

function loadBanlist() {
    fetch('/banlist')
        .then(res => res.text())
        .then(data => {
            document.getElementById('banlist').value = data;
        });
}

function updateBanlist() {
    const rawInput = document.getElementById('banlist').value;
    
    // Parser front-end : extraire les ID numériques valides (17 à 20 chiffres) et supprimer les doublons et les lignes vides
    const cleanedIds = Array.from(new Set(
        rawInput.split(/[\n,;\s]+/)
            .map(id => id.trim())
            .filter(id => /^\d{17,20}$/.test(id))
    ));
    
    const banlist = cleanedIds.join('\n');
    document.getElementById('banlist').value = banlist; // Mettre à jour le champ visuel avec les données propres
    
    fetch('/banlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ banlist })
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            log(`Banlist mise à jour avec succès (${cleanedIds.length} ID(s) valide(s) enregistré(s)).`);
        } else {
            log('Erreur lors de la mise à jour de la banlist.');
        }
    });
}

function loadServers() {
    fetch('/servers')
        .then(res => res.json())
        .then(data => {
            const select = document.getElementById('server-select');
            select.innerHTML = '';
            data.forEach(server => {
                const option = document.createElement('option');
                option.value = server.id;
                option.textContent = server.name;
                select.appendChild(option);
            });
            select.onchange = loadChannels; // Add this line
            loadChannels(); // And this line
        });
}

function loadChannels() {
    const serverId = document.getElementById('server-select').value;
    if (!serverId) return;

    fetch(`/channels?serverId=${serverId}`)
        .then(res => res.json())
        .then(data => {
            const select = document.getElementById('channel-select');
            select.innerHTML = '';
            data.forEach(channel => {
                const option = document.createElement('option');
                option.value = channel.id;
                option.textContent = channel.name;
                select.appendChild(option);
            });
        });
}

function getMessages() {
    const serverId = document.getElementById('server-select').value;
    const channelId = document.getElementById('channel-select').value;
    if (!serverId || !channelId) {
        return alert('Please select a server and a channel.');
    }

    fetch(`/messages?serverId=${serverId}&channelId=${channelId}`)
        .then(res => res.json())
        .then(data => {
            const container = document.getElementById('messages-container');
            container.innerHTML = '';
            data.forEach(message => {
                const messageElement = document.createElement('div');
                messageElement.classList.add('message');
                messageElement.innerHTML = `
                    <div class="message-header">
                        <span class="message-author">${message.author}</span>
                        <span class="message-time">${message.timestamp}</span>
                    </div>
                    <div class="message-content">${escapeHtml(message.content)}</div>
                `;
                container.appendChild(messageElement);
            });
        });
}

function massBan() {
    const serverId = document.getElementById('server-select').value;
    if (!serverId) {
        return alert('Please select a server.');
    }
    log(`Starting mass ban on server ${serverId}...`);
    fetch('/massban', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serverId })
    })
    .then(res => res.json())
    .then(data => {
        log(data.message);
    });
}

function exportBans() {
    const serverId = document.getElementById('server-select').value;
    if (!serverId) {
        return alert('Please select a server.');
    }
    log(`Exporting bans from server ${serverId}...`);
    window.location.href = `/exportbans?serverId=${serverId}`;
}

function exportMembers() {
    const serverId = document.getElementById('server-select').value;
    if (!serverId) {
        return alert('Please select a server.');
    }
    log(`Exporting members from server ${serverId}...`);
    window.location.href = `/exportmembers?serverId=${serverId}`;
}

function log(message) {
    const logs = document.getElementById('logs');
    logs.textContent += `> ${message}\n`;
    logs.scrollTop = logs.scrollHeight;
}

// HTML Escaper for message inputs
function escapeHtml(text) {
    if (!text) return '';
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

// WebSocket client connection for real-time GitHub feeds
function connectWebSocket() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;
    const ws = new WebSocket(wsUrl);

    ws.onopen = () => {
        log('Connexion WebSocket établie avec succès !');
    };

    ws.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            if (data.type === 'welcome') return;
            
            handleGithubEvent(data);
        } catch (e) {
            console.error('Error handling WebSocket message', e);
        }
    };

    ws.onclose = () => {
        log('Connexion WebSocket fermée. Tentative de reconconnexion dans 5 secondes...');
        setTimeout(connectWebSocket, 5000);
    };

    ws.onerror = (err) => {
        console.error('WebSocket Error: ', err);
    };
}

function handleGithubEvent(event) {
    const feed = document.getElementById('github-feed');
    const placeholder = feed.querySelector('.feed-placeholder');
    if (placeholder) {
        feed.innerHTML = '';
    }

    const item = document.createElement('div');
    item.className = `feed-item ${event.type}`;
    
    let titleHtml = '';
    let metaHtml = '';
    
    if (event.type === 'issue') {
        titleHtml = `<span class="badge success">Issue</span> <a href="${event.url}" target="_blank">#${event.number} ${escapeHtml(event.title)}</a>`;
        metaHtml = `<span>Dépôt: ${escapeHtml(event.repository)}</span> <span>Par: @${escapeHtml(event.author)}</span> <span>Action: ${escapeHtml(event.action)}</span>`;
    } else if (event.type === 'pull_request') {
        titleHtml = `<span class="badge purple">PR</span> <a href="${event.url}" target="_blank">#${event.number} ${escapeHtml(event.title)}</a>`;
        metaHtml = `<span>Dépôt: ${escapeHtml(event.repository)}</span> <span>Par: @${escapeHtml(event.author)}</span> <span>Action: ${escapeHtml(event.action)}</span>`;
    } else if (event.type === 'review_comment') {
        titleHtml = `<span class="badge warning">PR Comment</span> <a href="${event.url}" target="_blank">Commentaire sur la PR #${event.number}</a>`;
        metaHtml = `<span>Dépôt: ${escapeHtml(event.repository)}</span> <span>Auteur: @${escapeHtml(event.author)}</span>`;
    } else if (event.type === 'release') {
        titleHtml = `<span class="badge info">Release</span> <a href="${event.url}" target="_blank">Version ${escapeHtml(event.tag)} : ${escapeHtml(event.name)}</a>`;
        metaHtml = `<span>Dépôt: ${escapeHtml(event.repository)}</span> <span>Auteur: @${escapeHtml(event.author)}</span>`;
    } else {
        // Fallback generic event
        titleHtml = `<span class="badge info">Event</span> <span>Activité sur ${escapeHtml(event.repository || 'GitHub')}</span>`;
        metaHtml = `<span>Auteur: @${escapeHtml(event.author || 'system')}</span>`;
    }

    item.innerHTML = `
        <div class="feed-title">${titleHtml}</div>
        <div class="feed-meta">${metaHtml}</div>
    `;

    feed.insertBefore(item, feed.firstChild);

    // Limit elements to 30 items
    while (feed.children.length > 30) {
        feed.removeChild(feed.lastChild);
    }
}
