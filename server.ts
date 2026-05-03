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
  console.log("Starting PHP server on port 8005...");
  const fs = await import("fs");
  const phpLog = fs.createWriteStream("php_server.log");
  const php = spawn("php", ["-S", "127.0.0.1:8005", "-t", "api"], {
    stdio: ["ignore", "pipe", "pipe"]
  });
  php.stdout?.pipe(phpLog);
  php.stderr?.pipe(phpLog);
  
  php.on("error", (err) => {
    console.error("Failed to start PHP process:", err);
    fs.appendFileSync("php_server.log", `Failed to start PHP process: ${err.message}\n`);
  });

  php.on("exit", (code, signal) => {
    console.log(`PHP process exited with code ${code} and signal ${signal}`);
    fs.appendFileSync("php_server.log", `PHP process exited with code ${code} and signal ${signal}\n`);
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

  // 3. Node.js API Fallback (since PHP is missing in this environment)
  const Database = (await import("better-sqlite3")).default;
  const bcrypt = (await import("bcryptjs")).default;
  const db = new Database("api/database.sqlite");

  // Initialize DB Schema if missing
  db.exec(`CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT DEFAULT 'USER',
    balance DECIMAL(10,2) DEFAULT 0,
    avatarUrl TEXT,
    currentSessionId TEXT,
    lastActive INTEGER,
    lastDeviceId TEXT,
    shippingDetails TEXT,
    watchLater TEXT,
    defaultPrices TEXT
  )`);
  
  db.exec(`CREATE TABLE IF NOT EXISTS videos (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    price DECIMAL(10,2) DEFAULT 0,
    thumbnailUrl TEXT,
    videoUrl TEXT,
    creatorId TEXT,
    views INTEGER DEFAULT 0,
    createdAt INTEGER,
    category TEXT DEFAULT 'GENERAL',
    duration INTEGER DEFAULT 0,
    isLocal INTEGER DEFAULT 0,
    transcode_status TEXT DEFAULT 'NONE'
  )`);

  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  app.all(["/api/index.php", "/api/install.php"], async (req, res) => {
    const action = req.query.action || req.body.action;
    console.log(`Node API Fallback: ${action}`);

    try {
      if (action === 'check_installation' || action === 'check') {
        return res.json({ success: true, data: { installed: true } });
      }

      if (action === 'login') {
        const { username, password } = req.body;
        const user = db.prepare("SELECT * FROM users WHERE username = ?").get(username) as any;
        if (user && bcrypt.compareSync(password, user.password_hash)) {
          const sid = Math.random().toString(36).substring(2);
          db.prepare("UPDATE users SET currentSessionId = ?, lastActive = ? WHERE id = ?")
            .run(sid, Math.floor(Date.now() / 1000), user.id);
          delete user.password_hash;
          user.sessionToken = sid;
          return res.json({ success: true, data: user });
        }
        return res.json({ success: false, error: "Credenciales inválidas" });
      }

      if (action === 'register') {
        const { username, password } = req.body;
        const id = 'u_' + Date.now();
        const hash = bcrypt.hashSync(password, 10);
        try {
          db.prepare("INSERT INTO users (id, username, password_hash) VALUES (?, ?, ?)")
            .run(id, username, hash);
          const sid = Math.random().toString(36).substring(2);
          db.prepare("UPDATE users SET currentSessionId = ?, lastActive = ? WHERE id = ?")
            .run(sid, Math.floor(Date.now() / 1000), id);
          const user = db.prepare("SELECT * FROM users WHERE id = ?").get(id) as any;
          delete user.password_hash;
          user.sessionToken = sid;
          return res.json({ success: true, data: user });
        } catch (e) {
          return res.json({ success: false, error: "El usuario ya existe" });
        }
      }

      if (action === 'video_get_all') {
        const videos = db.prepare("SELECT * FROM videos ORDER BY createdAt DESC").all();
        return res.json({ success: true, data: videos, appliedSortOrder: 'LATEST' });
      }

      if (action === 'get_system_settings') {
        return res.json({ success: true, data: {
          currencyConversion: 300,
          videoCommission: 20,
          marketCommission: 25,
          transferFee: 5,
          latestApkVersion: '1.0.0',
          defaultAvatar: 'api/uploads/avatars/default.png'
        }});
      }

      // Fallback for actions not yet implemented in Node.js
      return res.status(501).json({ success: false, error: `Action '${action}' not implemented in Node.js fallback. PHP is missing in this environment.` });

    } catch (err: any) {
      console.error("Node API Error:", err);
      return res.status(500).json({ success: true, error: err.message });
    }
  });

  // 4. Catch-all PHP Backend Proxy (will mostly fail here, but kept for non-index.php requests if any)
  app.use("/api", createProxyMiddleware({
    target: "http://127.0.0.1:8005",
    changeOrigin: true,
    pathRewrite: { "^/api": "" },
    on: {
      proxyReq: (proxyReq, req, res) => {
        console.log(`Proxying ${req.method} ${req.url} to PHP server`);
        // Fix for POST requests with body
        if ((req as any).body) {
          const bodyData = JSON.stringify((req as any).body);
          proxyReq.setHeader('Content-Type', 'application/json');
          proxyReq.setHeader('Content-Length', Buffer.byteLength(bodyData));
          proxyReq.write(bodyData);
        }
      },
      error: (err, req, res) => {
        console.error("Proxy Error (PHP):", err);
        const response = res as any;
        if (response.headersSent === false) {
          response.status(502).json({ success: false, error: "PHP Gateway Error: " + err.message });
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
