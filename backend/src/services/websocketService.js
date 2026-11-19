const { WebSocketServer, WebSocket } = require("ws");
const jwt = require("jsonwebtoken");

let wss = null;

function initWebSocketServer(server) {
  wss = new WebSocketServer({ server, path: "/ws" });

  wss.on("connection", (ws, req) => {
    ws.isAlive = true;
    ws.on("pong", () => {
      ws.isAlive = true;
    });

    try {
      const url = new URL(req.url, "http://localhost");
      const token = url.searchParams.get("token");
      if (token) {
        const decoded = jwt.verify(token, process.env.JWT_SECRET || "dms_super_secret_key");
        ws.user = decoded;
      }
    } catch {
      // Ignored: client may send auth frame next
    }

    ws.on("message", (raw) => {
      try {
        const msg = JSON.parse(raw.toString());
        if (msg.type === "auth" && msg.token) {
          const decoded = jwt.verify(msg.token, process.env.JWT_SECRET || "dms_super_secret_key");
          ws.user = decoded;
          ws.send(JSON.stringify({ type: "authenticated", user: { id: decoded.id, role: decoded.role } }));
        } else if (msg.type === "ping") {
          ws.send(JSON.stringify({ type: "pong" }));
        }
      } catch {
        // Ignore malformed payloads
      }
    });

    ws.on("error", (err) => {
      console.warn("[WebSocket] Client error:", err.message);
    });
  });

  // Heartbeat interval to prune dead sockets
  const interval = setInterval(() => {
    if (!wss) return;
    wss.clients.forEach((ws) => {
      if (!ws.isAlive) return ws.terminate();
      ws.isAlive = false;
      ws.ping();
    });
  }, 30000);

  wss.on("close", () => {
    clearInterval(interval);
  });

  console.log("[WebSocket] Server initialized on path /ws");
  return wss;
}

/**
 * Broadcast an Admin <-> Dealer message in real time
 */
function broadcastChatMessage(message) {
  if (!wss) return;
  const rawMsg = JSON.stringify({ type: "chat_message", data: message });
  const companyId = Number(message.companyId);
  const msgDealerId = message.dealerId ? Number(message.dealerId) : null;

  wss.clients.forEach((client) => {
    if (client.readyState !== WebSocket.OPEN || !client.user) return;
    const clientCompanyId = Number(client.user.companyId);
    if (clientCompanyId !== companyId && client.user.role !== "SUPER_ADMIN" && client.user.role !== "SUPER_ADMIN_CEO") return;

    const isAdmin = ["ADMIN", "ADMIN_CEO", "SUPER_ADMIN", "SUPER_ADMIN_CEO"].includes(client.user.role);
    const clientDealerId = client.user.dealerId ? Number(client.user.dealerId) : null;

    // Admins receive all messages for their company
    if (isAdmin) {
      client.send(rawMsg);
      return;
    }

    // Dealers receive messages addressed to them, or broadcast messages (dealerId null), or messages they sent
    if (msgDealerId === null || (clientDealerId && clientDealerId === msgDealerId)) {
      client.send(rawMsg);
    }
  });
}

/**
 * Broadcast internal team chat messages
 */
function broadcastTeamChatMessage(message) {
  if (!wss) return;
  const rawMsg = JSON.stringify({ type: "team_chat_message", data: message });
  const companyId = Number(message.companyId);
  const senderId = Number(message.senderId);
  const receiverId = message.receiverId ? Number(message.receiverId) : null;

  wss.clients.forEach((client) => {
    if (client.readyState !== WebSocket.OPEN || !client.user) return;
    const clientCompanyId = Number(client.user.companyId);
    if (clientCompanyId !== companyId && client.user.role !== "SUPER_ADMIN") return;

    const clientId = Number(client.user.id);
    if (receiverId === null || clientId === senderId || clientId === receiverId) {
      client.send(rawMsg);
    }
  });
}

module.exports = {
  initWebSocketServer,
  broadcastChatMessage,
  broadcastTeamChatMessage
};
