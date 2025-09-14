const WebSocket = require('ws');

const ws = new WebSocket("ws://localhost:8080");

ws.on('open', () => {
  console.log("✅ Connected to server");
  ws.send("Hello from client!");
});

ws.on('message', (data) => {
  console.log("📩 Message from server:", data.toString());
});

ws.on('close', () => {
  console.log("❌ Disconnected from server");
});
