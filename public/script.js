// ===============================================
// --- GITBOT MANAGER PRO - FRONTEND CONTROLLER ---
// ===============================================

let currentTab = 'dashboard';
let cachedBanlist = [];
let cachedWatchlist = [];
let cachedEspionageTargets = [];
let activeModalTargetId = null;
let statsInterval = null;
let ws = null;

// Helper: Authenticated fetch wrapper
async function authFetch(url, options = {}) {
    const token = localStorage.getItem('admin_token') || localStorage.getItem('admin_password');
    const headers = options.headers ? { ...options.headers } : {};
    
    if (token) {
        headers['Authorization'] = `Bearer ${token}`;
    }
    
    const response = await fetch(url, { ...options, headers });
    
    if (response.status === 401) {
        showToast('Session expirée ou mot de passe invalide. Veuillez vous reconnecter.', 'error');
        logout();
        throw new Error('Unauthorized');
    }
    
    return response;
}

// Toast Notifications System
function showToast(message, type = 'info', duration = 4000) {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    const icons = {
        success: '✅',
        error: '❌',
        warning: '⚠️',
        info: 'ℹ️'
    };
    
    toast.innerHTML = `
        <span style="font-size: 1.1rem;">${icons[type] || 'ℹ️'}</span>
        <span style="flex: 1;">${escapeHtml(message)}</span>
    `;

    container.appendChild(toast);

    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(10px)';
        setTimeout(() => toast.remove(), 250);
    }, duration);
}

// Authentication check on page load
function checkAuth() {
    const token = localStorage.getItem('admin_token');
    if (token) {
        authFetch('/api/auth/verify')
            .then(res => res.json())
            .then(data => {
                if (data.success && data.authenticated) {
                    onLoginSuccess(token, data.bot);
                } else {
                    localStorage.removeItem('admin_token');
                }
            })
            .catch(() => {
                localStorage.removeItem('admin_token');
            });
    }
}

window.addEventListener('DOMContentLoaded', checkAuth);

function login() {
    const password = document.getElementById('password').value.trim();
    if (!password) {
        return showToast('Veuillez entrer le mot de passe.', 'warning');
    }

    fetch('/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password })
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            const token = data.token || password;
            localStorage.setItem('admin_token', token);
            localStorage.setItem('admin_password', password);
            onLoginSuccess(token, data.bot);
            showToast('Authentification réussie ! Bienvenue sur la console.', 'success');
        } else {
            showToast(data.message || 'Mot de passe incorrect.', 'error');
        }
    })
    .catch(err => {
        showToast('Erreur de connexion au serveur.', 'error');
        console.error(err);
    });
}

function onLoginSuccess(token, botInfo) {
    document.getElementById('login-container').style.display = 'none';
    document.getElementById('control-panel').style.display = 'block';
    document.getElementById('header-status-area').style.display = 'flex';

    if (botInfo) {
        document.getElementById('bot-status-text').textContent = `${botInfo.tag || 'En ligne'}`;
    }

    // Load initial tab and data
    switchTab('dashboard');
    loadServers();
    connectWebSocket();

    // Periodic stats refresher
    if (statsInterval) clearInterval(statsInterval);
    statsInterval = setInterval(() => {
        if (currentTab === 'dashboard') {
            loadSystemStats(false);
        }
    }, 15000);
}

function logout() {
    authFetch('/logout', { method: 'POST' }).catch(() => {});
    localStorage.removeItem('admin_token');
    localStorage.removeItem('admin_password');
    if (statsInterval) clearInterval(statsInterval);
    if (ws) {
        try { ws.close(); } catch (_) {}
    }
    document.getElementById('control-panel').style.display = 'none';
    document.getElementById('header-status-area').style.display = 'none';
    document.getElementById('login-container').style.display = 'block';
    document.getElementById('password').value = '';
    showToast('Déconnexion effectuée avec succès.', 'info');
}

// Tab Switching
function switchTab(tabName) {
    currentTab = tabName;
    
    // Update active nav button
    document.querySelectorAll('.nav-tabs .tab-btn').forEach(btn => {
        btn.classList.remove('active');
        if (btn.getAttribute('onclick')?.includes(tabName)) {
            btn.classList.add('active');
        }
    });

    // Update active tab pane
    document.querySelectorAll('.tab-pane').forEach(pane => {
        pane.classList.remove('active');
    });
    const targetPane = document.getElementById(`tab-${tabName}`);
    if (targetPane) {
        targetPane.classList.add('active');
    }

    // Load corresponding data
    refreshCurrentTab();
}

function refreshCurrentTab() {
    switch (currentTab) {
        case 'dashboard':
            loadSystemStats();
            break;
        case 'banlist':
            loadBanlist();
            break;
        case 'watchlist':
            loadWatchlist();
            break;
        case 'espionage':
            loadEspionageStatus();
            break;
        case 'economy':
            loadEconomyStats();
            break;
        case 'messages':
            loadChannels();
            break;
        case 'logs':
            fetchBotLogs();
            break;
    }
}

async function restartBot() {
    if (!confirm('Êtes-vous sûr de vouloir redémarrer le bot Discord ?')) return;
    try {
        showToast('Envoi du signal de redémarrage...', 'info');
        const res = await authFetch('/api/system/restart', { method: 'POST' });
        const data = await res.json();
        if (data.success) {
            showToast('Redémarrage en cours. Reconnexion automatique...', 'success');
            setTimeout(() => {
                window.location.reload();
            }, 3500);
        } else {
            showToast('Échec : ' + (data.message || 'Erreur inconnue'), 'error');
        }
    } catch (err) {
        showToast('Erreur lors du redémarrage : ' + err.message, 'error');
    }
}

// ==========================================
// --- 1. DASHBOARD & SYSTEM STATS ---
// ==========================================
function loadSystemStats(showFeedback = true) {
    authFetch('/api/system/stats')
        .then(res => res.json())
        .then(stats => {
            if (stats.bot) {
                document.getElementById('stat-ping').textContent = stats.bot.ping >= 0 ? `${stats.bot.ping} ms` : 'N/A';
                document.getElementById('stat-uptime').textContent = stats.bot.uptime || '--';
            }
            if (stats.counts) {
                document.getElementById('stat-servers').textContent = stats.counts.guilds ?? '--';
                document.getElementById('stat-members').textContent = stats.counts.members ? stats.counts.members.toLocaleString('fr-FR') : '--';
                document.getElementById('stat-bans').textContent = stats.counts.banlist ?? '--';
                document.getElementById('service-commands-badge').textContent = `${stats.counts.commands} / ${stats.counts.maxCommands}`;
            }
            if (stats.system) {
                document.getElementById('stat-ram').textContent = `${stats.system.memoryHeapMb} MB`;
            }
            if (stats.services) {
                const tgBadge = document.getElementById('service-telegram-badge');
                if (tgBadge) {
                    tgBadge.textContent = stats.services.telegram ? 'Connecté' : 'Inactif';
                    tgBadge.className = `badge ${stats.services.telegram ? 'success' : 'warning'}`;
                }
            }
            if (showFeedback && currentTab === 'dashboard') {
                log('Statistiques système actualisées.');
            }
        })
        .catch(err => {
            console.error('Error loading system stats:', err);
        });
}

// ==========================================
// --- 2. BANLIST & MODERATION ---
// ==========================================
function loadBanlist() {
    authFetch('/api/banlist')
        .then(res => res.json())
        .then(data => {
            cachedBanlist = data.bans || [];
            document.getElementById('banlist-count').textContent = cachedBanlist.length;
            renderBanlistTable(cachedBanlist);
            log(`Banlist chargée (${cachedBanlist.length} bannissement(s) enregistrés).`);
        })
        .catch(err => {
            console.error('Error loading banlist:', err);
            showToast('Erreur lors du chargement de la banlist.', 'error');
        });
}

function renderBanlistTable(bans) {
    const tbody = document.getElementById('banlist-table-body');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (bans.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align: center; color: var(--text-muted); padding: 16px;">Aucun utilisateur trouvé.</td></tr>';
        return;
    }

    bans.slice(0, 100).forEach(ban => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><code style="background: rgba(0,0,0,0.3); padding: 2px 6px; border-radius: 4px;">${escapeHtml(ban.id)}</code></td>
            <td style="color: var(--text-secondary); max-width: 250px; text-overflow: ellipsis; overflow: hidden; white-space: nowrap;">${escapeHtml(ban.reason)}</td>
            <td><span class="badge info">${escapeHtml(ban.addedBy)}</span></td>
            <td style="text-align: right;">
                <button onclick="removeBan('${ban.id}')" class="btn-danger btn-sm" title="Débannir">
                    Retirer
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function filterBanlist() {
    const query = document.getElementById('banlist-search').value.toLowerCase().trim();
    if (!query) {
        return renderBanlistTable(cachedBanlist);
    }
    const filtered = cachedBanlist.filter(b => 
        b.id.toLowerCase().includes(query) || 
        b.reason.toLowerCase().includes(query) || 
        (b.addedBy && b.addedBy.toLowerCase().includes(query))
    );
    renderBanlistTable(filtered);
}

function addSingleBan() {
    const userId = document.getElementById('ban-user-id').value.trim();
    const reason = document.getElementById('ban-reason').value.trim();

    if (!userId || !/^\d{17,20}$/.test(userId)) {
        return showToast('ID Discord invalide (17 à 20 chiffres numériques).', 'warning');
    }

    authFetch('/api/banlist/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, reason: reason || 'Banni via WebConsole' })
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            showToast(`Utilisateur ${userId} ajouté à la banlist avec succès.`, 'success');
            document.getElementById('ban-user-id').value = '';
            document.getElementById('ban-reason').value = '';
            loadBanlist();
        } else {
            showToast(data.message || 'Erreur lors de l\'ajout.', 'error');
        }
    })
    .catch(err => {
        showToast('Erreur réseau lors de l\'ajout.', 'error');
    });
}

function removeBan(userId) {
    if (!confirm(`Confirmez-vous le retrait de l'ID ${userId} de la banlist ?`)) return;

    authFetch('/api/banlist/remove', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId })
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            showToast(`ID ${userId} retiré de la banlist.`, 'success');
            loadBanlist();
        } else {
            showToast(data.message || 'Échec du retrait.', 'error');
        }
    })
    .catch(err => {
        showToast('Erreur réseau.', 'error');
    });
}

function purgeBanlistWithoutReasons() {
    if (!confirm("Voulez-vous purger automatiquement toutes les entrées sans motif valide de banlist.txt ?")) return;

    authFetch('/api/banlist/purge', { method: 'POST' })
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                showToast(`Purge terminée : ${data.removed} entrée(s) sans raison retirée(s).`, 'success');
                loadBanlist();
            } else {
                showToast('Erreur lors de la purge.', 'error');
            }
        })
        .catch(err => showToast('Erreur réseau.', 'error'));
}

// Raw bulk banlist modal
function openRawBanlistModal() {
    authFetch('/banlist')
        .then(res => res.text())
        .then(text => {
            document.getElementById('raw-banlist-textarea').value = text;
            document.getElementById('raw-banlist-modal').style.display = 'flex';
        });
}

function closeRawBanlistModal() {
    document.getElementById('raw-banlist-modal').style.display = 'none';
}

function saveRawBanlist() {
    const raw = document.getElementById('raw-banlist-textarea').value;
    authFetch('/banlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ banlist: raw })
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            showToast(`Banlist brute mise à jour (${data.count} entrées).`, 'success');
            closeRawBanlistModal();
            loadBanlist();
        } else {
            showToast(data.message || 'Erreur lors de la mise à jour.', 'error');
        }
    })
    .catch(err => showToast('Erreur réseau.', 'error'));
}

// Server massban & export functions
function massBan() {
    const select = document.getElementById('server-select-banlist') || document.getElementById('server-select');
    const serverId = select?.value;
    if (!serverId) return showToast('Veuillez sélectionner un serveur.', 'warning');

    if (!confirm(`⚠️ ATTENTION : Êtes-vous sûr de vouloir bannir massivement tous les membres de la banlist sur le serveur sélectionné ?`)) {
        return;
    }

    log(`Démarrage du massban sur le serveur ${serverId}...`);
    showToast('Exécution du massban en cours...', 'info');

    authFetch('/massban', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serverId })
    })
    .then(res => res.json())
    .then(data => {
        log(data.message);
        showToast(data.message, 'success');
    })
    .catch(err => showToast('Erreur lors du massban.', 'error'));
}

function exportBans() {
    const select = document.getElementById('server-select-banlist') || document.getElementById('server-select');
    const serverId = select?.value;
    if (!serverId) return showToast('Veuillez sélectionner un serveur.', 'warning');
    const token = localStorage.getItem('admin_token') || '';
    window.location.href = `/exportbans?serverId=${serverId}&token=${encodeURIComponent(token)}`;
}

function exportMembers() {
    const select = document.getElementById('server-select-banlist') || document.getElementById('server-select');
    const serverId = select?.value;
    if (!serverId) return showToast('Veuillez sélectionner un serveur.', 'warning');
    const token = localStorage.getItem('admin_token') || '';
    window.location.href = `/exportmembers?serverId=${serverId}&token=${encodeURIComponent(token)}`;
}

// ==========================================
// --- 3. SURVEILLANCE WATCHLIST ---
// ==========================================
function loadWatchlist() {
    authFetch('/api/watchlist')
        .then(res => res.json())
        .then(entries => {
            cachedWatchlist = entries || [];
            document.getElementById('watchlist-count').textContent = cachedWatchlist.length;
            renderWatchlistTable(cachedWatchlist);
            log(`Watchlist chargée (${cachedWatchlist.length} cible(s) sous surveillance).`);
        })
        .catch(err => {
            console.error('Error loading watchlist:', err);
            showToast('Erreur lors du chargement de la watchlist.', 'error');
        });
}

function renderWatchlistTable(entries) {
    const tbody = document.getElementById('watchlist-table-body');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (entries.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: var(--text-muted); padding: 16px;">Aucune cible sous surveillance.</td></tr>';
        return;
    }

    entries.forEach(entry => {
        const tr = document.createElement('tr');
        const levelBadgeClass = entry.watchLevel >= 4 ? 'danger' : (entry.watchLevel >= 3 ? 'warning' : 'info');
        const scopeBadgeClass = entry.isGlobal ? 'purple' : 'cyan';

        tr.innerHTML = `
            <td>
                <strong>${escapeHtml(entry.userTag)}</strong><br>
                <code style="font-size: 0.75rem; color: var(--text-muted);">${escapeHtml(entry.userId)}</code>
            </td>
            <td><span class="badge ${levelBadgeClass}">Niveau ${entry.watchLevel}</span></td>
            <td><span class="badge ${scopeBadgeClass}">${entry.isGlobal ? '🌍 Global' : '🏠 Local'}</span></td>
            <td style="color: var(--text-secondary); max-width: 200px; text-overflow: ellipsis; overflow: hidden; white-space: nowrap;">
                ${escapeHtml(entry.reason)}
            </td>
            <td style="text-align: right;">
                <button onclick="removeWatchlistTarget('${entry.userId}', '${entry.guildId}', ${entry.isGlobal})" class="btn-danger btn-sm">
                    Retirer
                </button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function filterWatchlist() {
    const query = document.getElementById('watchlist-search').value.toLowerCase().trim();
    if (!query) {
        return renderWatchlistTable(cachedWatchlist);
    }
    const filtered = cachedWatchlist.filter(w => 
        w.userId.toLowerCase().includes(query) || 
        w.reason.toLowerCase().includes(query) || 
        w.userTag.toLowerCase().includes(query)
    );
    renderWatchlistTable(filtered);
}

function addWatchlistTarget() {
    const userId = document.getElementById('wl-user-id').value.trim();
    const reason = document.getElementById('wl-reason').value.trim();
    const watchLevel = document.getElementById('wl-level').value;
    const isGlobal = document.getElementById('wl-scope').value === 'global';

    if (!userId || !/^\d{17,20}$/.test(userId)) {
        return showToast('ID Discord invalide (17 à 20 chiffres numériques).', 'warning');
    }
    if (!reason) {
        return showToast('Le motif de surveillance est obligatoire.', 'warning');
    }

    authFetch('/api/watchlist/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, reason, watchLevel: parseInt(watchLevel, 10), isGlobal })
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            showToast(`Cible ${userId} placée sous surveillance (Niveau ${watchLevel}).`, 'success');
            document.getElementById('wl-user-id').value = '';
            document.getElementById('wl-reason').value = '';
            loadWatchlist();
        } else {
            showToast(data.message || 'Erreur lors de l\'ajout.', 'error');
        }
    })
    .catch(err => showToast('Erreur réseau.', 'error'));
}

function removeWatchlistTarget(userId, guildId, isGlobal) {
    if (!confirm(`Retirer ${userId} de la surveillance ?`)) return;

    authFetch('/api/watchlist/remove', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, guildId, isGlobal })
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            showToast(`Cible ${userId} retirée de la surveillance.`, 'success');
            loadWatchlist();
        } else {
            showToast(data.message || 'Échec du retrait.', 'error');
        }
    })
    .catch(err => showToast('Erreur réseau.', 'error'));
}

function purgeWatchlistWithoutReasons() {
    if (!confirm("Purger les entrées sans raison de la watchlist ?")) return;

    authFetch('/api/watchlist/purge', { method: 'POST' })
        .then(res => res.json())
        .then(data => {
            if (data.success) {
                showToast(`Purge watchlist terminée : ${data.removed} entrée(s) retirée(s).`, 'success');
                loadWatchlist();
            } else {
                showToast('Erreur lors de la purge.', 'error');
            }
        })
        .catch(err => showToast('Erreur réseau.', 'error'));
}

// ==========================================
// --- 4. DOSSIERS D'ESPIONNAGE ---
// ==========================================
function loadEspionageStatus() {
    authFetch('/espionage/status')
        .then(res => res.json())
        .then(data => {
            document.getElementById('espionage-targets').textContent = data.targetCount ?? 0;
            const forumEl = document.getElementById('espionage-forum');
            if (forumEl) {
                forumEl.textContent = data.forumConfigured ? 'Connecté' : 'Non configuré';
                forumEl.style.color = data.forumConfigured ? '#34d399' : '#f87171';
            }
            loadEspionageTargets();
        })
        .catch(err => console.error('Error loading espionage status:', err));
}

function loadEspionageTargets() {
    authFetch('/espionage/targets')
        .then(res => res.json())
        .then(targets => {
            cachedEspionageTargets = targets || [];
            renderEspionageTable(cachedEspionageTargets);
            log(`Dossiers d'espionnage chargés (${cachedEspionageTargets.length} cible(s)).`);
        })
        .catch(err => console.error('Error loading espionage targets:', err));
}

function renderEspionageTable(targets) {
    const tbody = document.getElementById('espionage-targets-table-body');
    if (!tbody) return;
    tbody.innerHTML = '';

    if (targets.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: var(--text-muted); padding: 16px;">Aucun dossier trouvé.</td></tr>';
        return;
    }

    const threatScale = { 'Critical': 4, 'High': 3, 'Medium': 2, 'Low': 1 };
    targets.sort((a, b) => {
        const aScale = threatScale[a.threatLevel] || 0;
        const bScale = threatScale[b.threatLevel] || 0;
        if (bScale !== aScale) return bScale - aScale;
        return (b.messageCount || 0) - (a.messageCount || 0);
    });

    targets.forEach(target => {
        const tr = document.createElement('tr');
        const threatColor = target.threatLevel === 'Critical' ? '#ef4444' : (target.threatLevel === 'High' ? '#f97316' : '#3b82f6');
        const displayName = target.tag !== 'Inconnu' ? `${target.tag} (${target.id.slice(-6)})` : target.id;

        tr.innerHTML = `
            <td>
                <span onclick="showEspionageTarget('${target.id}')" style="font-weight: 600; color: var(--accent); cursor: pointer; text-decoration: underline;" title="Voir le dossier">
                    ${escapeHtml(displayName)}
                </span>
            </td>
            <td><span style="font-weight: 700; color: ${threatColor};">${target.threatLevel || 'Low'}</span></td>
            <td>${target.messageCount || 0} msgs</td>
            <td>${target.notesCount || 0} note(s)</td>
            <td style="text-align: right; display: flex; gap: 6px; justify-content: flex-end;">
                <button onclick="showEspionageTarget('${target.id}')" class="btn-secondary btn-sm">Dossier</button>
                <button onclick="banEspionageTarget('${target.id}', '${escapeHtml(target.tag)}')" class="btn-danger btn-sm">Bannir</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function filterEspionageTargets() {
    const query = document.getElementById('espionage-search').value.toLowerCase().trim();
    const threatFilter = document.getElementById('espionage-threat-filter').value;

    let filtered = cachedEspionageTargets;
    if (threatFilter !== 'ALL') {
        filtered = filtered.filter(t => t.threatLevel === threatFilter);
    }
    if (query) {
        filtered = filtered.filter(t => 
            t.id.toLowerCase().includes(query) || 
            (t.tag && t.tag.toLowerCase().includes(query))
        );
    }
    renderEspionageTable(filtered);
}

function showEspionageTarget(userId) {
    activeModalTargetId = userId;
    const content = document.getElementById('espionage-modal-content');
    content.innerHTML = '<p style="color: var(--text-muted); text-align: center; padding: 20px;">Chargement des données du dossier classifié...</p>';
    document.getElementById('espionage-modal').style.display = 'flex';

    authFetch(`/espionage/target?userId=${userId}`)
        .then(res => res.json())
        .then(target => {
            let notesHtml = '';
            if (target.notes && target.notes.length > 0) {
                notesHtml = target.notes.map(n => {
                    const date = n.timestamp ? new Date(n.timestamp).toLocaleString('fr-FR') : 'Date inconnue';
                    return `
                        <div style="margin-bottom: 8px; padding: 10px; background: rgba(0,0,0,0.3); border-radius: 8px; border: 1px solid var(--border-color);">
                            <div style="font-size: 0.75rem; color: var(--text-muted); display:flex; justify-content:space-between; margin-bottom: 4px;">
                                <span>Agent: @${escapeHtml(n.author || 'Inconnu')}</span>
                                <span>${date}</span>
                            </div>
                            <div style="color: var(--text-primary); font-size: 0.85rem;">${escapeHtml(n.content)}</div>
                        </div>
                    `;
                }).join('');
            } else {
                notesHtml = '<p style="color: var(--text-muted); font-style: italic; font-size: 0.85rem; padding: 10px;">Aucune note d\'agent enregistrée dans ce dossier.</p>';
            }

            content.innerHTML = `
                <div style="margin-bottom: 16px; display: grid; grid-template-columns: 1fr 1fr; gap: 12px; font-size: 0.9rem; background: rgba(0,0,0,0.2); padding: 12px; border-radius: 10px;">
                    <div><strong>Identifiant Discord :</strong><br><code style="background:rgba(0,0,0,0.4); padding: 2px 6px; border-radius:4px;">${target.id}</code></div>
                    <div><strong>Pseudo Discord :</strong><br><span>${escapeHtml(target.tag)}</span></div>
                    <div><strong>Niveau de Menace :</strong><br><span style="font-weight:bold; color: ${target.threatLevel === 'Critical' ? '#ef4444' : '#3b82f6'}">${target.threatLevel}</span></div>
                    <div><strong>Messages Interceptés :</strong><br><span>${target.messageCount} messages</span></div>
                </div>
                <div style="margin-top: 15px;">
                    <h3 style="margin-bottom: 10px; font-size: 0.95rem; color: var(--accent); display: flex; align-items: center; gap: 6px;">
                        <span>🕵️</span> Rapports et Notes d'Agents
                    </h3>
                    <div style="max-height: 220px; overflow-y: auto; padding-right: 4px;">
                        ${notesHtml}
                    </div>
                </div>
            `;
        })
        .catch(err => {
            content.innerHTML = `<p style="color:#ef4444; padding: 10px;">Erreur de chargement: ${escapeHtml(err.message)}</p>`;
        });
}

function closeEspionageModal() {
    document.getElementById('espionage-modal').style.display = 'none';
    activeModalTargetId = null;
    document.getElementById('espionage-new-note').value = '';
}

function submitEspionageNote() {
    if (!activeModalTargetId) return;
    const note = document.getElementById('espionage-new-note').value.trim();
    if (!note) return showToast('Veuillez écrire une note avant d\'enregistrer.', 'warning');

    authFetch('/api/espionage/target/add-note', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: activeModalTargetId, note })
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            showToast('Note d\'agent ajoutée au dossier avec succès.', 'success');
            document.getElementById('espionage-new-note').value = '';
            showEspionageTarget(activeModalTargetId);
            loadEspionageTargets();
        } else {
            showToast(data.message || 'Erreur lors de l\'enregistrement de la note.', 'error');
        }
    })
    .catch(err => showToast('Erreur réseau.', 'error'));
}

function deleteEspionageTarget() {
    if (!activeModalTargetId) return;
    if (!confirm("Voulez-vous supprimer définitivement ce dossier d'espionnage (base de données + thread Discord) ?")) return;

    authFetch('/espionage/target-delete', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: activeModalTargetId })
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            showToast('Dossier d\'espionnage supprimé avec succès.', 'success');
            closeEspionageModal();
            loadEspionageStatus();
        } else {
            showToast(data.message || 'Échec de la suppression.', 'error');
        }
    })
    .catch(err => showToast('Erreur réseau.', 'error'));
}

function banEspionageTarget(userId, tag) {
    const reason = prompt(`Entrez la raison du bannissement pour ${tag || userId} :`);
    if (reason === null) return;
    if (!reason.trim()) return showToast('La raison est obligatoire.', 'warning');

    authFetch('/espionage/target-banlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, reason })
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            showToast(`Cible ${tag || userId} bannie avec succès.`, 'success');
            loadEspionageStatus();
        } else {
            showToast(data.message || 'Échec du ban.', 'error');
        }
    })
    .catch(err => showToast('Erreur réseau.', 'error'));
}

function recreateDossiers() {
    if (!confirm("Régénérer et resynchroniser tous les dossiers d'espionnage sur le forum Discord ?")) return;

    showToast("Régénération des dossiers d'espionnage en cours...", "info");
    log("Démarrage de la régénération globale des dossiers d'espionnage...");

    authFetch('/espionage/recreate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            showToast(`Régénération terminée : ${data.count} dossiers synchronisés.`, 'success');
            loadEspionageStatus();
        } else {
            showToast(data.message || 'Erreur lors de la régénération.', 'error');
        }
    })
    .catch(err => showToast('Erreur réseau.', 'error'));
}

// ==========================================
// --- 5. ECONOMIE & BANQUE ---
// ==========================================
function loadEconomyStats() {
    authFetch('/api/economy/stats')
        .then(res => res.json())
        .then(stats => {
            document.getElementById('eco-cash-circulating').textContent = stats.totalCash ? stats.totalCash.toLocaleString('fr-FR') : (stats.circulationTotal ? stats.circulationTotal.toLocaleString('fr-FR') : '0');
            document.getElementById('eco-bank-deposits').textContent = stats.totalBank ? stats.totalBank.toLocaleString('fr-FR') : (stats.bankDepositsTotal ? stats.bankDepositsTotal.toLocaleString('fr-FR') : '0');
            document.getElementById('eco-interest-rate').textContent = `${stats.dailyInterestRatePercent || 0.8} %`;
            document.getElementById('eco-wallets-count').textContent = stats.totalWallets ?? 0;
            log('Indicateurs économiques chargés.');
        })
        .catch(err => console.error('Error loading economy stats:', err));
}

function searchEconomyUser() {
    const userId = document.getElementById('eco-search-user-id').value.trim();
    if (!userId) return showToast('Veuillez entrer un ID utilisateur.', 'warning');

    const select = document.getElementById('server-select');
    const guildId = select?.value || '';

    authFetch(`/api/economy/user?userId=${userId}&guildId=${guildId}`)
        .then(res => res.json())
        .then(data => {
            const resultBox = document.getElementById('eco-user-result');
            resultBox.style.display = 'block';
            document.getElementById('eco-res-wallet').textContent = (data.wallet || 0).toLocaleString('fr-FR');
            document.getElementById('eco-res-bank').textContent = (data.bank || 0).toLocaleString('fr-FR');
            document.getElementById('eco-res-networth').textContent = (data.netWorth || 0).toLocaleString('fr-FR');
            document.getElementById('eco-res-rate').textContent = `${data.dailyInterestRatePercent || 0.8} %`;
            showToast(`Données financières pour ${userId} chargées.`, 'success');
        })
        .catch(err => showToast('Erreur lors de la recherche utilisateur.', 'error'));
}

function executeEconomyAdjustment() {
    const userId = document.getElementById('eco-adj-user-id').value.trim();
    const type = document.getElementById('eco-adj-type').value;
    const amount = document.getElementById('eco-adj-amount').value.trim();
    const isPercent = document.getElementById('eco-adj-is-percent').value === 'true';
    const reason = document.getElementById('eco-adj-reason').value.trim();

    if (!userId || !amount) {
        return showToast('ID utilisateur et montant obligatoires.', 'warning');
    }

    const select = document.getElementById('server-select');
    const guildId = select?.value || '';

    authFetch('/api/economy/adjust', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            userId,
            guildId,
            amount,
            type,
            isPercent,
            reason: reason || 'Ajustement Console Web'
        })
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            showToast(`Ajustement appliqué : Nouveau solde = ${data.newBalance.toLocaleString('fr-FR')} coins.`, 'success');
            document.getElementById('eco-adj-amount').value = '';
            loadEconomyStats();
        } else {
            showToast(data.message || 'Échec de l\'ajustement.', 'error');
        }
    })
    .catch(err => showToast('Erreur réseau.', 'error'));
}

// ==========================================
// --- 6. SALONS & MESSAGES ---
// ==========================================
function loadServers() {
    authFetch('/servers')
        .then(res => res.json())
        .then(servers => {
            ['server-select', 'server-select-banlist'].forEach(selectId => {
                const select = document.getElementById(selectId);
                if (!select) return;
                select.innerHTML = '';
                servers.forEach(server => {
                    const option = document.createElement('option');
                    option.value = server.id;
                    option.textContent = `${server.name} (${server.memberCount || 0} membres)`;
                    select.appendChild(option);
                });
            });
            loadChannels();
        })
        .catch(err => console.error('Error loading servers:', err));
}

function loadChannels() {
    const serverId = document.getElementById('server-select')?.value;
    if (!serverId) return;

    authFetch(`/channels?serverId=${serverId}`)
        .then(res => res.json())
        .then(channels => {
            const select = document.getElementById('channel-select');
            if (!select) return;
            select.innerHTML = '';
            channels.forEach(ch => {
                const option = document.createElement('option');
                option.value = ch.id;
                option.textContent = `#${ch.name}`;
                select.appendChild(option);
            });
        })
        .catch(err => console.error('Error loading channels:', err));
}

function getMessages() {
    const serverId = document.getElementById('server-select')?.value;
    const channelId = document.getElementById('channel-select')?.value;
    if (!serverId || !channelId) return showToast('Veuillez sélectionner un serveur et un salon.', 'warning');

    const container = document.getElementById('messages-container');
    container.innerHTML = '<div class="feed-placeholder">Récupération des messages...</div>';

    authFetch(`/messages?serverId=${serverId}&channelId=${channelId}`)
        .then(res => res.json())
        .then(messages => {
            container.innerHTML = '';
            if (!messages || messages.length === 0) {
                container.innerHTML = '<div class="feed-placeholder">Aucun message récent dans ce salon.</div>';
                return;
            }
            messages.forEach(msg => {
                const div = document.createElement('div');
                div.className = 'message';
                div.innerHTML = `
                    <div class="message-header">
                        <span class="message-author">${escapeHtml(msg.author)}</span>
                        <span class="message-time">${escapeHtml(msg.timestamp)}</span>
                    </div>
                    <div class="message-content">${escapeHtml(msg.content)}</div>
                `;
                container.appendChild(div);
            });
            showToast(`${messages.length} messages chargés.`, 'info');
        })
        .catch(err => {
            container.innerHTML = '<div class="feed-placeholder" style="color:#ef4444;">Erreur lors de la récupération des messages.</div>';
        });
}

function sendChannelMessage() {
    const serverId = document.getElementById('server-select')?.value;
    const channelId = document.getElementById('channel-select')?.value;
    const message = document.getElementById('channel-send-content').value.trim();

    if (!serverId || !channelId || !message) {
        return showToast('Sélectionnez un salon et saisissez un message.', 'warning');
    }

    authFetch('/api/channels/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ serverId, channelId, message })
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            showToast('Message envoyé dans le salon Discord !', 'success');
            document.getElementById('channel-send-content').value = '';
            setTimeout(getMessages, 800);
        } else {
            showToast(data.message || 'Erreur lors de l\'envoi.', 'error');
        }
    })
    .catch(err => showToast('Erreur réseau.', 'error'));
}

// ==========================================
// --- 7. LOGS & CONSOLE DU BOT ---
// ==========================================
function fetchBotLogs() {
    const filter = document.getElementById('log-filter')?.value || 'all';
    authFetch(`/api/logs?lines=120&filter=${filter}`)
        .then(res => res.json())
        .then(data => {
            const logsPre = document.getElementById('logs');
            if (logsPre && data.lines) {
                logsPre.textContent = data.lines.length > 0 
                    ? data.lines.join('\n') 
                    : '> Aucun log trouvé pour ce filtre.\n';
                logsPre.scrollTop = logsPre.scrollHeight;
            }
        })
        .catch(err => console.error('Error fetching logs:', err));
}

function clearConsoleLog() {
    const logs = document.getElementById('logs');
    if (logs) logs.textContent = '> Console effacée.\n';
}

function log(message) {
    const logs = document.getElementById('logs');
    if (logs) {
        logs.textContent += `> [${new Date().toLocaleTimeString('fr-FR')}] ${message}\n`;
        logs.scrollTop = logs.scrollHeight;
    }
}

// ==========================================
// --- 8. WEBSOCKET & FLUX TEMPS REEL ---
// ==========================================
function connectWebSocket() {
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) {
        return;
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;
    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
        log('Connexion WebSocket au bot établie.');
    };

    ws.onmessage = (event) => {
        try {
            const data = JSON.parse(event.data);
            if (data.type === 'welcome') return;
            if (data.type === 'heartbeat') {
                if (data.ping !== undefined && data.ping >= 0) {
                    const pingEl = document.getElementById('stat-ping');
                    if (pingEl) pingEl.textContent = `${data.ping} ms`;
                }
                return;
            }
            handleGithubEvent(data);
        } catch (e) {
            console.error('Error parsing WebSocket message', e);
        }
    };

    ws.onclose = () => {
        log('Connexion WebSocket interrompue. Nouvelle tentative dans 5 secondes...');
        setTimeout(() => {
            if (localStorage.getItem('admin_token')) {
                connectWebSocket();
            }
        }, 5000);
    };

    ws.onerror = (err) => {
        console.error('WebSocket error:', err);
    };
}

function handleGithubEvent(event) {
    const feed = document.getElementById('github-feed');
    if (!feed) return;
    const placeholder = feed.querySelector('.feed-placeholder');
    if (placeholder) feed.innerHTML = '';

    const item = document.createElement('div');
    item.className = `feed-item ${event.type}`;
    
    let titleHtml = '';
    let metaHtml = '';
    
    if (event.type === 'issue') {
        titleHtml = `<span class="badge success">Issue</span> <a href="${event.url}" target="_blank">#${event.number} ${escapeHtml(event.title)}</a>`;
        metaHtml = `<span>Dépôt: ${escapeHtml(event.repository)}</span> <span>Par: @${escapeHtml(event.author)}</span>`;
    } else if (event.type === 'pull_request') {
        titleHtml = `<span class="badge purple">PR</span> <a href="${event.url}" target="_blank">#${event.number} ${escapeHtml(event.title)}</a>`;
        metaHtml = `<span>Dépôt: ${escapeHtml(event.repository)}</span> <span>Par: @${escapeHtml(event.author)}</span>`;
    } else if (event.type === 'review_comment') {
        titleHtml = `<span class="badge warning">PR Comment</span> <a href="${event.url}" target="_blank">Commentaire sur #${event.number}</a>`;
        metaHtml = `<span>Dépôt: ${escapeHtml(event.repository)}</span> <span>Auteur: @${escapeHtml(event.author)}</span>`;
    } else if (event.type === 'release') {
        titleHtml = `<span class="badge info">Release</span> <a href="${event.url}" target="_blank">Version ${escapeHtml(event.tag)}</a>`;
        metaHtml = `<span>Dépôt: ${escapeHtml(event.repository)}</span> <span>Auteur: @${escapeHtml(event.author)}</span>`;
    } else {
        titleHtml = `<span class="badge cyan">Événement</span> <span>Activité sur ${escapeHtml(event.repository || 'GitHub')}</span>`;
        metaHtml = `<span>Auteur: @${escapeHtml(event.author || 'system')}</span>`;
    }

    item.innerHTML = `
        <div class="feed-title">${titleHtml}</div>
        <div class="feed-meta">${metaHtml}</div>
    `;

    feed.insertBefore(item, feed.firstChild);
    while (feed.children.length > 30) {
        feed.removeChild(feed.lastChild);
    }
}

// Utility: HTML Escaper
function escapeHtml(text) {
    if (!text) return '';
    return String(text)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}
