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
            loadEspionageStatus();
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

function loadEspionageStatus() {
    fetch('/espionage/status')
        .then(res => res.json())
        .then(data => {
            document.getElementById('espionage-targets').textContent = data.targetCount;
            document.getElementById('espionage-forum').textContent = data.forumConfigured ? 'Oui' : 'Non';
            if (data.forumConfigured) {
                document.getElementById('espionage-forum').style.color = '#34d399'; // green accent
            } else {
                document.getElementById('espionage-forum').style.color = '#f87171'; // red danger
            }
            loadEspionageTargets();
        })
        .catch(err => {
            console.error('Error loading espionage status:', err);
            document.getElementById('espionage-targets').textContent = 'Erreur';
            document.getElementById('espionage-forum').textContent = 'Erreur';
        });
}

function loadEspionageTargets() {
    fetch('/espionage/targets')
        .then(res => res.json())
        .then(targets => {
            const tbody = document.getElementById('espionage-targets-table-body');
            tbody.innerHTML = '';
            
            if (targets.length === 0) {
                tbody.innerHTML = '<tr><td colspan="3" style="text-align: center; padding: 8px; color: var(--text-muted);">Aucune cible.</td></tr>';
                return;
            }

            // Échelle de tri par niveau de menace
            const threatScale = {
                'Critical': 4,
                'High': 3,
                'Medium': 2,
                'Low': 1
            };

            // Trier : Niveau de menace décroissant, puis par nombre de messages décroissant
            targets.sort((a, b) => {
                const aScale = threatScale[a.threatLevel] || 0;
                const bScale = threatScale[b.threatLevel] || 0;
                if (bScale !== aScale) {
                    return bScale - aScale;
                }
                return (b.messageCount || 0) - (a.messageCount || 0);
            });

            targets.forEach(target => {
                const tr = document.createElement('tr');
                tr.style.borderBottom = '1px solid rgba(255,255,255,0.03)';
                
                const threatColor = target.threatLevel === 'Critical' ? '#ef4444' : (target.threatLevel === 'High' ? '#f97316' : '#3b82f6');
                const displayName = target.tag !== 'Inconnu' ? `${target.tag} (${target.id.slice(-6)})` : target.id;

                tr.innerHTML = `
                    <td onclick="showEspionageTarget('${target.id}')" style="padding: 6px; font-weight: 500; color: var(--accent); cursor: pointer; text-decoration: underline; text-overflow: ellipsis; overflow: hidden; white-space: nowrap; max-width: 120px;" title="Cliquer pour voir le dossier (ID: ${target.id})">${escapeHtml(displayName)}</td>
                    <td style="padding: 6px; color: ${threatColor}; font-weight: bold;">${target.threatLevel}</td>
                    <td style="padding: 6px; text-align: right;">
                        <button onclick="banEspionageTarget('${target.id}', '${target.tag}')" class="btn-danger" style="padding: 3px 6px; font-size: 0.75rem; border-radius: 4px; background: linear-gradient(135deg, #ef4444 0%, #dc2626 100%);">Ban</button>
                    </td>
                `;
                tbody.appendChild(tr);
            });
        })
        .catch(err => {
            console.error('Error loading espionage targets:', err);
        });
}

let activeModalTargetId = null;

function showEspionageTarget(userId) {
    activeModalTargetId = userId;
    const content = document.getElementById('espionage-modal-content');
    content.innerHTML = '<p>Chargement des détails du dossier...</p>';
    document.getElementById('espionage-modal').style.display = 'flex';

    fetch(`/espionage/target?userId=${userId}`)
        .then(res => res.json())
        .then(target => {
            let notesHtml = '';
            if (target.notes && target.notes.length > 0) {
                notesHtml = target.notes.map(n => {
                    const date = new Date(n.timestamp).toLocaleString('fr-FR');
                    return `<div style="margin-bottom: 8px; padding: 8px; background: rgba(255,255,255,0.03); border-radius: 6px; border: 1px solid rgba(255,255,255,0.05);">
                        <div style="font-size: 0.75rem; color: var(--text-muted); display:flex; justify-content:space-between;">
                            <span>Par: @${n.author}</span>
                            <span>${date}</span>
                        </div>
                        <div style="margin-top: 4px; color: var(--text-primary); font-size: 0.85rem;">${escapeHtml(n.content)}</div>
                    </div>`;
                }).join('');
            } else {
                notesHtml = '<p style="color: var(--text-muted); font-style: italic; font-size: 0.85rem;">Aucun rapport d\'agent ou note rédigée.</p>';
            }

            content.innerHTML = `
                <div style="margin-bottom: 15px; display: grid; grid-template-columns: 1fr 1fr; gap: 10px; font-size: 0.9rem;">
                    <div><strong>Identifiant :</strong> <code style="background:rgba(0,0,0,0.3); padding: 2px 4px; border-radius:4px;">${target.id}</code></div>
                    <div><strong>Tag Discord :</strong> <span>${escapeHtml(target.tag)}</span></div>
                    <div><strong>Menace :</strong> <span style="font-weight:bold; color: ${target.threatLevel === 'Critical' ? '#ef4444' : '#3b82f6'}">${target.threatLevel}</span></div>
                    <div><strong>Messages :</strong> <span>${target.messageCount}</span></div>
                </div>
                <div style="margin-top: 15px;">
                    <h3 style="margin-bottom: 10px; font-size: 0.95rem; color: var(--text-secondary); border-bottom: 1px solid rgba(255,255,255,0.05); padding-bottom: 5px;">🕵️ Notes d'Agents & Rapports</h3>
                    <div style="max-height: 200px; overflow-y: auto; padding-right: 5px;">
                        ${notesHtml}
                    </div>
                </div>
            `;
        })
        .catch(err => {
            content.innerHTML = `<p style="color:#ef4444;">Erreur lors du chargement : ${escapeHtml(err.message)}</p>`;
        });
}

function closeEspionageModal() {
    document.getElementById('espionage-modal').style.display = 'none';
    activeModalTargetId = null;
}

function deleteEspionageTarget() {
    if (!activeModalTargetId) return;
    if (!confirm("Êtes-vous sûr de vouloir supprimer définitivement ce dossier d'espionnage (thread Discord + base locale) ? Cette action est irréversible.")) {
        return;
    }

    log(`Demande de suppression définitive du dossier ${activeModalTargetId}...`);
    fetch('/espionage/target-delete', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: activeModalTargetId })
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            log(`Succès : ${data.message}`);
            closeEspionageModal();
            loadEspionageStatus();
        } else {
            log(`Échec de la suppression : ${data.message}`);
            alert(`Erreur : ${data.message}`);
        }
    })
    .catch(err => {
        log(`Erreur lors de la suppression : ${err.message}`);
    });
}

function banEspionageTarget(userId, tag) {
    const reason = prompt(`Entrez la raison du bannissement pour ${tag || userId} :`);
    if (reason === null) return; // Annulé
    if (!reason.trim()) {
        alert("La raison est obligatoire pour procéder au bannissement.");
        return;
    }

    log(`Demande d'ajout de ${tag || userId} à la banlist...`);
    fetch('/espionage/target-banlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, reason })
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            log(`Succès : ${tag || userId} a été banni et son dossier mis à jour.`);
            loadEspionageStatus();
        } else {
            log(`Échec du bannissement : ${data.message}`);
            alert(`Erreur : ${data.message}`);
        }
    })
    .catch(err => {
        log(`Erreur de connexion : ${err.message}`);
    });
}

function recreateDossiers() {
    log("Démarrage de la régénération globale des dossiers d'espionnage...");
    fetch('/espionage/recreate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            log(`Régénération terminée : ${data.count} dossiers d'espionnage ont été recréés avec succès.`);
            loadEspionageStatus();
        } else {
            log(`Échec de la régénération : ${data.message}`);
        }
    })
    .catch(err => {
        log(`Erreur lors de la requête de régénération : ${err.message}`);
    });
}
