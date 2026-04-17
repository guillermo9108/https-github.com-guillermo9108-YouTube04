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

  // Store connected clients: userId -> WebSocket
  const clients = new Map<string, WebSocket>();

  wss.on("connection", (ws) => {
    let currentUserId: string | null = null;

    ws.on("message", (data) => {
      try {
        const message = JSON.parse(data.toString());

        if (message.type === "IDENTIFY" || message.type === "HEARTBEAT") {
          currentUserId = message.userId || message.payload?.userId;
          if (currentUserId) {
            clients.set(currentUserId, ws);
            
            // Broadcast that this user is online/active
            wss.clients.forEach(client => {
              if (client.readyState === WebSocket.OPEN) {
                client.send(JSON.stringify({
                  type: "USER_STATUS",
                  payload: { userId: currentUserId, status: "online", timestamp: Date.now() }
                }));
              }
            });
          }
        }

        if (message.type === "SHARE_VIDEO") {
          const { targetUserId, videoTitle, senderName, videoId } = message.payload;
          const targetWs = clients.get(targetUserId);

          if (targetWs && targetWs.readyState === WebSocket.OPEN) {
            targetWs.send(JSON.stringify({
              type: "NOTIFICATION",
              payload: {
                id: Date.now().toString(),
                message: `${senderName} ha compartido contigo: ${videoTitle}`,
                videoId,
                timestamp: Date.now()
              }
            }));
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
            mediaType, 
            timestamp, 
            id 
          } = message.payload;
          
          const targetWs = clients.get(receiverId);

          if (targetWs && targetWs.readyState === WebSocket.OPEN) {
            targetWs.send(JSON.stringify({
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
                mediaType,
                timestamp
              }
            }));
          }
        }
      } catch (err) {
        console.error("Error parsing WS message:", err);
      }
    });

    ws.on("close", () => {
      if (currentUserId) {
        clients.delete(currentUserId);
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
