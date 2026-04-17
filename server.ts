import express from "express";
import { createServer } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { createServer as createViteServer } from "vite";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const server = createServer(app);
  const wss = new WebSocketServer({ server });
  const PORT = 3000;

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
            const uid = String(userId);
            // Unlink previous userId if it changed (unlikely in same socket)
            if (currentUserId && currentUserId !== uid) {
                userSockets.get(currentUserId)?.delete(ws);
            }
            
            currentUserId = uid;
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
          const { 
            receiverId, 
            senderId, 
            text, 
            imageUrl, 
            videoUrl, 
            audioUrl, 
            fileUrl, 
            videoId,
            mediaType, 
            timestamp, 
            id 
          } = message.payload;
          
          const sockets = userSockets.get(receiverId);

          if (sockets) {
            const chatMsg = JSON.stringify({
              type: "CHAT_MESSAGE",
              payload: {
                id,
                senderId,
                receiverId,
                text,
                imageUrl,
                videoUrl,
                audioUrl,
                fileUrl,
                videoId,
                mediaType,
                timestamp
              }
            });
            sockets.forEach(s => {
              if (s.readyState === WebSocket.OPEN) s.send(chatMsg);
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

  // API routes
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Serve api/uploads as static
  app.use("/api/uploads", express.static(path.join(__dirname, "api", "uploads")));

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
