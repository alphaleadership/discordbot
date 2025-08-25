function login() {
    const password = document.getElementById('password').value;
    fetch('/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password })
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            document.getElementById('login-container').style.display = 'none';
            document.getElementById('control-panel').style.display = 'block';
            loadBanlist();
            loadServers();
        } else {
            alert('Incorrect password');
        }
    });
}

function loadBanlist() {
    fetch('/banlist')
        .then(res => res.text())
        .then(data => {
            document.getElementById('banlist').value = data;
        });
}

function updateBanlist() {
    const banlist = document.getElementById('banlist').value;
    fetch('/banlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ banlist })
    })
    .then(res => res.json())
    .then(data => {
        if (data.success) {
            log('Banlist updated successfully.');
        } else {
            log('Error updating banlist.');
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
                    <p><strong>${message.author}</strong> - <em>${message.timestamp}</em></p>
                    <p>${message.content}</p>
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
}
