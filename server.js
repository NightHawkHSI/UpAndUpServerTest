const fs = require("fs");
const express = require("express");
const WebSocket = require("ws");
const http = require("http");

const PORT = 8080;
const USERS_FILE = "users.json";

// === Load users from file ===
let users = {};
if (fs.existsSync(USERS_FILE)) {
    try {
        users = JSON.parse(fs.readFileSync(USERS_FILE, "utf8"));
    } catch {
        console.error("⚠️ Failed to parse users.json, starting fresh.");
        users = {};
    }
}

function saveUsers() {
    fs.writeFileSync(USERS_FILE, JSON.stringify(users, null, 2));
}

// Track connected clients by Steam ID
const connectedUsers = new Set();

// === Express HTTP server ===
const app = express();

// List of SSE clients
let sseClients = [];

// Format users for SSE
function formatUsers() {
    return Object.values(users).map(u => {
        return {
            username: u.username || "(unknown)",
            steamId: u.steamId || "N/A",
            joined: u.firstConnected ? new Date(u.firstConnected).toLocaleString() : "N/A",
            connected: connectedUsers.has(u.steamId),
            lastPosition: u.lastPosition || "N/A"
        };
    });
}

app.get("/", (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Up and Up Server</title>
            <style>
                body { font-family: Arial, sans-serif; background: #111; color: #eee; padding: 20px; }
                table { width: 100%; border-collapse: collapse; margin-top: 10px; }
                th, td { padding: 8px 12px; border: 1px solid #333; text-align: left; }
                th { background: #222; }
                tr:nth-child(even) { background: #1a1a1a; }
                h1 { color: #4cafef; }
                .dot { height: 12px; width: 12px; border-radius: 50%; display: inline-block; margin-right: 6px; }
                .green { background-color: #4caf50; }
                .red { background-color: #f44336; }
            </style>
        </head>
        <body>
            <h1>🌐 Up and Up Server</h1>
            <p>Connected Users:</p>
            <table>
                <thead>
                    <tr>
                        <th>Status</th>
                        <th>Username</th>
                        <th>Steam ID</th>
                        <th>Date Joined</th>
                        <th>Last Position</th>
                    </tr>
                </thead>
                <tbody id="users"></tbody>
            </table>

            <script>
                function renderUsers(users) {
                    const tbody = document.getElementById('users');
                    tbody.innerHTML = "";
                    users.forEach(u => {
                        const row = document.createElement("tr");
                        const statusDot = u.connected 
                            ? '<span class="dot green"></span>' 
                            : '<span class="dot red"></span>';
                        row.innerHTML = "<td>" + statusDot + "</td><td>" + u.username + "</td><td>" + u.steamId + "</td><td>" + u.joined + "</td><td>" + u.lastPosition + "</td>";
                        tbody.appendChild(row);
                    });
                }

                const evtSource = new EventSource('/events');
                evtSource.onmessage = function(event) {
                    renderUsers(JSON.parse(event.data));
                };

                // Initial render
                renderUsers(${JSON.stringify(formatUsers())});
            </script>
        </body>
        </html>
    `);
});

// SSE endpoint
app.get("/events", (req, res) => {
    res.set({
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive"
    });
    res.flushHeaders();

    sseClients.push(res);
    res.write(`data: ${JSON.stringify(formatUsers())}\n\n`);

    req.on("close", () => {
        sseClients = sseClients.filter(c => c !== res);
    });
});

function broadcastUsers() {
    const data = JSON.stringify(formatUsers());
    sseClients.forEach(res => res.write(`data: ${data}\n\n`));
}

// === HTTP + WebSocket server ===
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

wss.on("connection", (ws) => {
    console.log("🔗 Client connected");

    ws.on("message", (msg) => {
        const parts = msg.toString().split("|");
        const command = parts[0];

        if (command === "HELLO") {
            const steamId = parts[1];
            const username = parts[2];
            const region = parts[3];
            const timezone = parts[4];
            const now = new Date().toISOString();

            if (!users[steamId]) {
                users[steamId] = { steamId, username, region, timezone, firstConnected: now, lastConnected: now, lastPosition: "N/A" };
                console.log(`🆕 New user: ${username} (${steamId})`);
            } else {
                users[steamId].username = username;
                users[steamId].region = region;
                users[steamId].timezone = timezone;
                users[steamId].lastConnected = now;
                console.log(`🔄 Returning user: ${username} (${steamId})`);
            }

            connectedUsers.add(steamId);
            saveUsers();
            broadcastUsers();
            ws.send(`WELCOME|${JSON.stringify(users[steamId])}`);

        } else if (command === "POSITION") {
            // POSITION|steamId|x|y|z
            const steamId = parts[1];
            const x = parseFloat(parts[2]);
            const y = parseFloat(parts[3]);
            const z = parseFloat(parts[4]);

            if (users[steamId]) {
                users[steamId].lastPosition = `${x.toFixed(2)}, ${y.toFixed(2)}, ${z.toFixed(2)}`;
                saveUsers();
                broadcastUsers();
            }

        } else {
            console.log("⚠️ Unknown or UnNamded command:", msg.toString());
        }
    });

    ws.on("close", () => {
        console.log("❌ Client disconnected");

        // Remove disconnected clients from connectedUsers set
        connectedUsers.forEach(steamId => {
            connectedUsers.delete(steamId);
        });
        broadcastUsers();
    });
});

server.listen(PORT, "0.0.0.0", () => {
    console.log(`🌐 Server running on port ${PORT}`);
});

