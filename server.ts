import express from "express";
import { createServer } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";
import { spawn } from "child_process";
import { createProxyMiddleware } from "http-proxy-middleware";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const server = createServer(app);
  const wss = new WebSocketServer({ server });
  const PORT = 3000;

  // Start PHP server for API
  console.log("Starting PHP server on port 8000...");
  const php = spawn("php", ["-S", "0.0.0.0:8000", "-t", "."], {
    stdio: "inherit"
  });

  // Start Streamer server on port 3001
  console.log("Starting Streamer server on port 3001...");
  const streamer = spawn("node", ["api/streamer.js"], {
    stdio: "inherit",
    env: { ...process.env, PORT: "3001" }
  });

  // Store connected clients: userId -> Set of WebSockets (allowing multiple tabs)
  const userSockets = new Map<string, Set<WebSocket>>();

  wss.on("connection", (ws) => {
    let currentUserId: string | null = null;

    ws.on("message", (data) => {
      try {
        const message = JSON.parse(data.toString());

        if (message.type === "IDENTIFY" || message.type === "HEARTBEAT") {
          const userId = message.userId || message.payload?.userId;
          if (userId) {
            const uid = String(userId).trim();
            if (message.type === "IDENTIFY") console.log(`WebSocket: User ${uid} identified`);
            
            // Unlink previous userId if it changed
            if (currentUserId && currentUserId !== uid) {
                userSockets.get(currentUserId)?.delete(ws);
                if (userSockets.get(currentUserId)?.size === 0) userSockets.delete(currentUserId);
            }
            
            currentUserId = uid;
            (ws as any).userId = uid; // Tag the socket
            if (!userSockets.has(uid)) {
              userSockets.set(uid, new Set());
            }
            userSockets.get(uid)!.add(ws);
            
            // Broadcast that this user is online
            const onlineMessage = JSON.stringify({
              type: "USER_STATUS",
              payload: { userId: uid, status: "online", timestamp: Date.now() }
            });

            wss.clients.forEach(client => {
              if (client.readyState === WebSocket.OPEN) {
                client.send(onlineMessage);
              }
            });

            // If IDENTIFY, send back list of online users
            if (message.type === "IDENTIFY") {
                const onlineUsers = Array.from(userSockets.keys());
                ws.send(JSON.stringify({
                    type: "ONLINE_USERS",
                    payload: onlineUsers
                }));
            }
          }
        }

        if (message.type === "SHARE_VIDEO") {
          const { targetUserId, videoTitle, senderName, videoId } = message.payload;
          const sockets = userSockets.get(targetUserId);

          if (sockets) {
            const notification = JSON.stringify({
              type: "NOTIFICATION",
              payload: {
                id: Date.now().toString(),
                message: `${senderName} ha compartido contigo: ${videoTitle}`,
                videoId,
                timestamp: Date.now()
              }
            });
            sockets.forEach(s => {
              if (s.readyState === WebSocket.OPEN) s.send(notification);
            });
          }
        }

        if (message.type === "CHAT_MESSAGE") {
          // Normalize payload fields (handle both camelCase and snake_case)
          const payload = message.payload || {};
          const receiverId = String(payload.receiverId || payload.receiver_id || "");
          const senderId = String(payload.senderId || payload.sender_id || "");
          
          if (!receiverId) {
            console.error("CHAT_MESSAGE missing receiverId", payload);
            return;
          }

          // Ensure both casing versions exist for compatibility
          const normalizedPayload = {
            ...payload,
            senderId,
            receiverId,
            sender_id: senderId,
            receiver_id: receiverId
          };

          console.log(`Chat message from ${senderId} to ${receiverId}: ${payload.text?.substring(0, 20)}...`);
          
          const chatMsg = JSON.stringify({
            type: "CHAT_MESSAGE",
            payload: normalizedPayload
          });

          // Send to receiver
          const receiverSockets = userSockets.get(receiverId);
          if (receiverSockets && receiverSockets.size > 0) {
            console.log(`Sending to ${receiverSockets.size} active sockets for receiver ${receiverId}`);
            receiverSockets.forEach(s => {
              if (s.readyState === WebSocket.OPEN) s.send(chatMsg);
            });
          }

          // Also sync to other sockets of the sender (multi-tab sync)
          const senderSockets = userSockets.get(senderId);
          if (senderSockets && senderSockets.size > 1) {
            senderSockets.forEach(s => {
              // Send to other sockets of the same user, excluding the current one
              if (s !== ws && s.readyState === WebSocket.OPEN) {
                s.send(chatMsg);
              }
            });
          }
        }
      } catch (err) {
        console.error("Error parsing WS message:", err);
      }
    });

    ws.on("close", () => {
      if (currentUserId) {
        const sockets = userSockets.get(currentUserId);
        if (sockets) {
          sockets.delete(ws);
          if (sockets.size === 0) {
            userSockets.delete(currentUserId);
            
            // Broadcast that this user is offline
            const offlineMessage = JSON.stringify({
              type: "USER_STATUS",
              payload: { userId: currentUserId, status: "offline", timestamp: Date.now() }
            });
            
            wss.clients.forEach(client => {
              if (client.readyState === WebSocket.OPEN) {
                client.send(offlineMessage);
              }
            });
          }
        }
        console.log(`User disconnected: ${currentUserId}`);
      }
    });
  });

  // Health check
  app.get("/api/health", (req, res) => res.json({ status: "ok" }));

  // 1. Serve uploads as static
  app.use("/api/uploads", express.static(path.join(__dirname, "api", "uploads")));

  // 2. Streamer Proxy (Port 3001)
  app.use("/api/video", createProxyMiddleware({
    target: "http://localhost:3001",
    changeOrigin: true,
    pathRewrite: { "^/api/video": "/video" },
  }));

  // 3. Catch-all PHP Backend Proxy
  app.use("/api", createProxyMiddleware({
    target: "http://localhost:8000/api",
    changeOrigin: true,
    on: {
      proxyReq: (proxyReq, req, res) => {
        // Direct streaming for FormData/POST requests
      },
      error: (err, req, res) => {
        console.error("Proxy Error (PHP):", err);
        const response = res as any;
        if (response && response.status && !response.headersSent) {
          response.status(502).json({ success: false, error: "PHP Gateway Error" });
        }
      }
    }
  }));

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
