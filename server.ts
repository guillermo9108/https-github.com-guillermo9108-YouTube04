import express, { Request, Response, NextFunction } from "express";
import { createServer } from "http";
import { WebSocketServer, WebSocket } from "ws";
import { createServer as createViteServer } from "vite";
import * as path from "path";
import * as fs from "fs";
import { fileURLToPath } from "url";
import { spawn } from "child_process";
import { createProxyMiddleware } from "http-proxy-middleware";
import DatabaseConstructor from "better-sqlite3";
import bcrypt from "bcryptjs";
import multer from "multer";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function startServer() {
  const app = express();
  const server = createServer(app);
  const wss = new WebSocketServer({ server });
  const PORT = 3000;

  // Start PHP server for API
  console.log("Starting PHP server on port 8005...");
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
  const uploadDir = "api/uploads";
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
    fs.mkdirSync(path.join(uploadDir, "avatars"), { recursive: true });
    fs.mkdirSync(path.join(uploadDir, "videos"), { recursive: true });
    fs.mkdirSync(path.join(uploadDir, "thumbnails"), { recursive: true });
    fs.mkdirSync(path.join(uploadDir, "proofs"), { recursive: true });
  }

  const storage = multer.diskStorage({
    destination: (req: Request, file: Express.Multer.File, cb: (error: Error | null, destination: string) => void) => {
      if (file.fieldname === 'avatar') cb(null, path.join(uploadDir, 'avatars'));
      else if (file.fieldname === 'video') cb(null, path.join(uploadDir, 'videos'));
      else if (file.fieldname === 'thumbnail') cb(null, path.join(uploadDir, 'thumbnails'));
      else if (file.fieldname === 'proof_image' || file.fieldname === 'proofImage') cb(null, path.join(uploadDir, 'proofs'));
      else cb(null, uploadDir);
    },
    filename: (req: Request, file: Express.Multer.File, cb: (error: Error | null, filename: string) => void) => {
      const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
      cb(null, file.fieldname + '-' + uniqueSuffix + path.extname(file.originalname));
    }
  });

  const upload = multer({ storage: storage });

  const db = new DatabaseConstructor("api/database.sqlite");

  // Initialize DB Schema
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
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
      defaultPrices TEXT,
      vipExpiry INTEGER DEFAULT 0
    );
    
    CREATE TABLE IF NOT EXISTS videos (
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
      transcode_status TEXT DEFAULT 'NONE',
      is_private INTEGER DEFAULT 0,
      likes INTEGER DEFAULT 0,
      dislikes INTEGER DEFAULT 0,
      shares INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS interactions (
      userId TEXT,
      videoId TEXT,
      liked INTEGER DEFAULT 0,
      disliked INTEGER DEFAULT 0,
      isWatched INTEGER DEFAULT 0,
      isSkipped INTEGER DEFAULT 0,
      watchedAt INTEGER,
      PRIMARY KEY (userId, videoId)
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      userId TEXT,
      type TEXT,
      text TEXT,
      link TEXT,
      isRead INTEGER DEFAULT 0,
      timestamp INTEGER,
      avatarUrl TEXT,
      metadata TEXT
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY,
      buyerId TEXT,
      creatorId TEXT,
      videoId TEXT,
      amount DECIMAL(10,2),
      adminFee DECIMAL(10,2),
      timestamp INTEGER,
      type TEXT,
      videoTitle TEXT,
      isExternal INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS subscriptions (
      subscriberId TEXT,
      creatorId TEXT,
      createdAt INTEGER,
      PRIMARY KEY (subscriberId, creatorId)
    );

    CREATE TABLE IF NOT EXISTS comments (
      id TEXT PRIMARY KEY,
      videoId TEXT,
      userId TEXT,
      text TEXT,
      timestamp INTEGER
    );

    CREATE TABLE IF NOT EXISTS system_settings (
      id INTEGER PRIMARY KEY,
      currencyConversion DECIMAL(10,2) DEFAULT 300,
      videoCommission INTEGER DEFAULT 20,
      marketCommission INTEGER DEFAULT 25,
      transferFee INTEGER DEFAULT 5,
      latestApkVersion TEXT DEFAULT '1.0.0',
      defaultAvatar TEXT DEFAULT '/api/uploads/avatars/default.png',
      categories TEXT,
      paymentMethods TEXT,
      vipPlans TEXT
    );

    CREATE TABLE IF NOT EXISTS search_history (
      term TEXT PRIMARY KEY,
      count INTEGER DEFAULT 1,
      last_searched INTEGER
    );

    CREATE TABLE IF NOT EXISTS seller_verifications (
      id TEXT PRIMARY KEY,
      userId TEXT,
      fullName TEXT,
      idNumber TEXT,
      address TEXT,
      mobile TEXT,
      status TEXT DEFAULT 'PENDING',
      createdAt INTEGER
    );

    CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY,
      buyerId TEXT,
      creatorId TEXT,
      videoId TEXT,
      amount REAL,
      adminFee REAL,
      timestamp INTEGER,
      type TEXT,
      videoTitle TEXT,
      isExternal INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      senderId TEXT,
      receiverId TEXT,
      text TEXT,
      imageUrl TEXT,
      videoUrl TEXT,
      audioUrl TEXT,
      fileUrl TEXT,
      videoId TEXT,
      mediaType TEXT DEFAULT 'TEXT',
      isRead INTEGER DEFAULT 0,
      isDelivered INTEGER DEFAULT 0,
      timestamp INTEGER
    );

    CREATE TABLE IF NOT EXISTS push_subscriptions (
      endpoint TEXT PRIMARY KEY,
      userId TEXT,
      p256dh TEXT,
      auth TEXT,
      createdAt INTEGER
    );

    CREATE TABLE IF NOT EXISTS fcm_tokens (
      token TEXT PRIMARY KEY,
      userId TEXT,
      deviceModel TEXT,
      createdAt INTEGER
    );

    CREATE TABLE IF NOT EXISTS requests (
      id TEXT PRIMARY KEY,
      userId TEXT,
      query TEXT,
      status TEXT DEFAULT 'PENDING',
      createdAt INTEGER,
      isVip INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS balance_requests (
      id TEXT PRIMARY KEY,
      userId TEXT,
      amount REAL,
      status TEXT DEFAULT 'PENDING',
      rejectionReason TEXT,
      createdAt INTEGER
    );

    CREATE TABLE IF NOT EXISTS vip_requests (
      id TEXT PRIMARY KEY,
      userId TEXT,
      planSnapshot TEXT,
      paymentRef TEXT,
      proofText TEXT,
      proofImageUrl TEXT,
      status TEXT DEFAULT 'PENDING',
      rejectionReason TEXT,
      createdAt INTEGER
    );

    CREATE TABLE IF NOT EXISTS marketplace_items (
      id TEXT PRIMARY KEY,
      sellerId TEXT,
      title TEXT,
      description TEXT,
      price REAL,
      category TEXT,
      images TEXT,
      stock INTEGER DEFAULT 1,
      salesCount INTEGER DEFAULT 0,
      status TEXT DEFAULT 'DISPONIBLE',
      itemCondition TEXT,
      createdAt INTEGER
    );

    CREATE TABLE IF NOT EXISTS marketplace_orders (
      id TEXT PRIMARY KEY,
      buyerId TEXT,
      sellerId TEXT,
      totalAmount REAL,
      paymentMethod TEXT,
      status TEXT DEFAULT 'PENDING',
      shippingDetails TEXT,
      rejectionReason TEXT,
      createdAt INTEGER,
      updatedAt INTEGER
    );

    CREATE TABLE IF NOT EXISTS marketplace_order_items (
      id TEXT PRIMARY KEY,
      orderId TEXT,
      itemId TEXT,
      quantity INTEGER,
      price REAL,
      status TEXT DEFAULT 'PENDING'
    );

    CREATE TABLE IF NOT EXISTS marketplace_reviews (
      id TEXT PRIMARY KEY,
      itemId TEXT,
      userId TEXT,
      rating INTEGER,
      comment TEXT,
      timestamp INTEGER
    );

    CREATE TABLE IF NOT EXISTS groups_metadata (
      folderPath TEXT PRIMARY KEY,
      creatorId TEXT,
      description TEXT,
      coverUrl TEXT,
      isPrivate INTEGER DEFAULT 0,
      isUnified INTEGER DEFAULT 0,
      allowMemberUploads INTEGER DEFAULT 1,
      isSeries INTEGER DEFAULT 0,
      createdAt INTEGER
    );

    CREATE TABLE IF NOT EXISTS group_subscriptions (
      userId TEXT,
      folderPath TEXT,
      approved INTEGER DEFAULT 1,
      createdAt INTEGER,
      PRIMARY KEY (userId, folderPath)
    );

    CREATE TABLE IF NOT EXISTS stories (
      id TEXT PRIMARY KEY,
      userId TEXT,
      contentUrl TEXT,
      type TEXT DEFAULT 'IMAGE',
      overlayText TEXT,
      overlayColor TEXT,
      overlayBg TEXT,
      audioUrl TEXT,
      videoId TEXT,
      productId TEXT,
      duration INTEGER DEFAULT 15,
      createdAt INTEGER,
      expiresAt INTEGER
    );

    CREATE TABLE IF NOT EXISTS story_views (
      id TEXT PRIMARY KEY,
      storyId TEXT,
      userId TEXT,
      timestamp INTEGER
    );

    CREATE TABLE IF NOT EXISTS story_reactions (
      id TEXT PRIMARY KEY,
      storyId TEXT,
      userId TEXT,
      reaction TEXT,
      timestamp INTEGER
    );

    INSERT OR IGNORE INTO system_settings (id, categories) VALUES (1, '[{"id":"c1","name":"Gaming","price":0.5},{"id":"c2","name":"Music","price":0.8},{"id":"c3","name":"Tech","price":1.0}]');
  `);

  try {
    db.exec("ALTER TABLE system_settings ADD COLUMN batteryConfig TEXT");
  } catch (e) {}
  try {
    db.exec("ALTER TABLE system_settings ADD COLUMN batteryHistory TEXT");
  } catch (e) {}

  // Seed data for videos if empty
  const videoCount = (db.prepare("SELECT COUNT(*) as count FROM videos").get() as any).count;
  if (videoCount === 0) {
    const seedVideos = [
      {
        id: 'v1',
        title: 'Bienvenido a StreamPay',
        description: 'Descubre el marketplace de contenido premium.',
        creatorId: 'admin',
        price: 0,
        thumbnailUrl: 'https://images.unsplash.com/photo-1611162617474-5b21e879e113?w=800&q=80',
        videoUrl: 'https://storage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
        createdAt: Math.floor(Date.now() / 1000) - 3600
      },
      {
        id: 'v2',
        title: '¿Cómo funciona?',
        description: 'Tutorial rápido sobre cómo comprar y vender.',
        creatorId: 'admin',
        price: 10,
        thumbnailUrl: 'https://images.unsplash.com/photo-1485846234645-a62644f84728?w=800&q=80',
        videoUrl: 'https://storage.googleapis.com/gtv-videos-bucket/sample/ElephantsDream.mp4',
        createdAt: Math.floor(Date.now() / 1000) - 7200
      }
    ];

    const insert = db.prepare("INSERT INTO videos (id, title, description, creatorId, price, thumbnailUrl, videoUrl, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
    seedVideos.forEach(v => insert.run(v.id, v.title, v.description, v.creatorId, v.price, v.thumbnailUrl, v.videoUrl, v.createdAt));
    
    // Seed admin user
    const adminHash = bcrypt.hashSync('admin123', 10);
    db.prepare("INSERT OR IGNORE INTO users (id, username, password_hash, role, balance) VALUES (?, ?, ?, ?, ?)")
      .run('admin', 'admin', adminHash, 'ADMIN', 1000);
  }

  // Schema adjustments/migrations
  try { db.exec("ALTER TABLE groups_metadata ADD COLUMN allowMemberUploads INTEGER DEFAULT 1;"); } catch (e) {}
  try { db.exec("ALTER TABLE groups_metadata ADD COLUMN isSeries INTEGER DEFAULT 0;"); } catch (e) {}

  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Serve static uploads
  app.use("/api/uploads", express.static(path.join(process.cwd(), "api/uploads")));

  // Helper for fix_url (Node version)
  const fix_url = (url: string | null) => {
    if (!url) return null;
    if (url.startsWith('http')) return url;
    if (url.startsWith('/api/')) return url;
    return '/api/' + url;
  };

  const uploadFields = upload.fields([
    { name: 'avatar', maxCount: 1 },
    { name: 'video', maxCount: 1 },
    { name: 'thumbnail', maxCount: 1 },
    { name: 'proof_image', maxCount: 1 },
    { name: 'proofImage', maxCount: 1 },
    { name: 'images[]', maxCount: 10 },
    { name: 'file', maxCount: 1 }
  ]);

  app.use("/api", (req: Request, res: Response, next: NextFunction) => {
    uploadFields(req, res, (err: any) => {
      if (err) {
        console.error("Multer Error:", err);
        return res.status(400).json({ success: false, error: "File upload error: " + err.message });
      }
      next();
    });
  }, async (req: any, res: Response, next: NextFunction) => {
    const action = (req.query.action || req.body?.action || '').toString();
    const isPhp = req.path.endsWith(".php") || req.path === "/" || req.path === "";
    
    // Si no parece una petición al API (sin acción y sin .php), dejar pasar al proxy o a Vite
    if (!action && !isPhp) return next();

    // Log the request properties to debug form-data issues
    console.log(`Node API Fallback (Global): action=${action} path=${req.path} [${req.method}]`);

    try {
      if (action === 'check_installation' || action === 'check') {
        return res.json({ success: true, data: { installed: true, status: 'installed' } });
      }

      if (action === 'get_system_settings') {
        const settings = db.prepare("SELECT * FROM system_settings WHERE id = 1").get() as any;
        if (settings) {
          try { settings.categories = JSON.parse(settings.categories || '[]'); } catch(e) { settings.categories = []; }
          try { settings.paymentMethods = JSON.parse(settings.paymentMethods || '{}'); } catch(e) { settings.paymentMethods = {}; }
          try { settings.vipPlans = JSON.parse(settings.vipPlans || '[]'); } catch(e) { settings.vipPlans = []; }
        }
        return res.json({ success: true, data: settings || { categories: [] } });
      }

      if (action === 'client_log') {
        console.log("Client Log:", req.body);
        return res.json({ success: true });
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
          user.avatarUrl = fix_url(user.avatarUrl);
          return res.json({ success: true, data: user });
        }
        return res.json({ success: false, error: "Credenciales inválidas" });
      }

      if (action === 'register') {
        const { username, password } = req.body;
        const avatarFile = req.files?.avatar?.[0];
        const avatarUrl = avatarFile ? `uploads/avatars/${avatarFile.filename}` : null;

        const id = 'u_' + Date.now();
        const hash = bcrypt.hashSync(password, 10);
        try {
          db.prepare("INSERT INTO users (id, username, password_hash, avatarUrl) VALUES (?, ?, ?, ?)")
            .run(id, username, hash, avatarUrl);
          const sid = Math.random().toString(36).substring(2);
          db.prepare("UPDATE users SET currentSessionId = ?, lastActive = ? WHERE id = ?")
            .run(sid, Math.floor(Date.now() / 1000), id);
          const user = db.prepare("SELECT * FROM users WHERE id = ?").get(id) as any;
          delete user.password_hash;
          user.sessionToken = sid;
          user.avatarUrl = fix_url(user.avatarUrl);
          return res.json({ success: true, data: user });
        } catch (e) {
          console.error("Register Error:", e);
          return res.json({ success: false, error: "El usuario ya existe" });
        }
      }

      if (action === 'get_user' || action === 'heartbeat') {
        const userId = req.query.userId || req.body.userId;
        const user = db.prepare("SELECT * FROM users WHERE id = ? OR currentSessionId = ?").get(userId, userId) as any;
        if (user) {
          delete user.password_hash;
          user.avatarUrl = fix_url(user.avatarUrl);
          return res.json({ success: true, data: user });
        }
        return res.json({ success: false, error: "Usuario no encontrado" });
      }

      if (action === 'get_videos') {
        const folderParam = (req.query.folder || '').toString().trim();
        const categoryParam = (req.query.category || '').toString().trim();
        const searchParam = (req.query.search || req.query.q || '').toString().trim();
        const sortOrderParam = (req.query.sort_order || req.query.sortOrder || 'LATEST').toString().toUpperCase();
        const limitParam = parseInt((req.query.limit || '40').toString());
        const offsetParam = parseInt((req.query.offset || '0').toString());
        const userIdParam = (req.query.userId || '').toString().trim();

        let filterStr = "is_private = 0";
        const params: any[] = [];

        // If folder is specified, we filter by category (group name/folderPath)
        const targetCategory = folderParam || categoryParam;
        if (targetCategory && targetCategory !== 'ALL' && targetCategory !== 'TODOS' && targetCategory !== 'GENERAL') {
          filterStr += " AND LOWER(category) = LOWER(?)";
          params.push(targetCategory);
        }

        if (searchParam) {
          filterStr += " AND (title LIKE ? OR description LIKE ?)";
          params.push(`%${searchParam}%`, `%${searchParam}%`);
        }

        if (userIdParam) {
          // If specific creator
          filterStr += " AND creatorId = ?";
          params.push(userIdParam);
        }

        let orderStr = " ORDER BY createdAt DESC";
        if (sortOrderParam === 'OLDEST') {
          orderStr = " ORDER BY createdAt ASC";
        } else if (sortOrderParam === 'POPULAR' || sortOrderParam === 'FEATURED') {
          orderStr = " ORDER BY views DESC, createdAt DESC";
        }

        try {
          const totalRow = db.prepare(`SELECT COUNT(*) as count FROM videos WHERE ${filterStr}`).get(...params) as any;
          const total = totalRow?.count || 0;

          const query = `SELECT * FROM videos WHERE ${filterStr}${orderStr} LIMIT ? OFFSET ?`;
          const queryParams = [...params, limitParam, offsetParam];
          const videos = db.prepare(query).all(...queryParams) as any[];

          const processedVideos = videos.map(v => ({
            ...v,
            thumbnailUrl: fix_url(v.thumbnailUrl),
            videoUrl: fix_url(v.videoUrl)
          }));

          return res.json({ success: true, data: {
            videos: processedVideos,
            folders: [],
            activeCategories: [],
            total: total,
            hasMore: (offsetParam + videos.length) < total
          }, appliedSortOrder: sortOrderParam });
        } catch (err: any) {
          console.error("DB Error in get_videos:", err);
          return res.json({ success: false, error: err.message });
        }
      }

      if (action === 'get_folders') {
        try {
          const rows = db.prepare("SELECT * FROM groups_metadata").all() as any[];
          
          const folders = rows.map(r => {
            const videoCountObj = db.prepare("SELECT COUNT(*) as count FROM videos WHERE LOWER(category) = LOWER(?)").get(r.folderPath) as any;
            const membersCountObj = db.prepare("SELECT COUNT(*) as count FROM group_subscriptions WHERE LOWER(folderPath) = LOWER(?) AND approved = 1").get(r.folderPath) as any;
            
            return {
              name: r.folderPath,
              relativePath: r.folderPath,
              count: videoCountObj ? videoCountObj.count : 0,
              thumbnailUrl: r.coverUrl ? fix_url(r.coverUrl) : '/api/uploads/thumbnails/default.jpg',
              creatorId: r.creatorId || 'admin',
              description: r.description || 'Grupo sin descripción.',
              coverUrl: r.coverUrl ? fix_url(r.coverUrl) : null,
              isPrivate: r.isPrivate || 0,
              isUnified: r.isUnified || 0,
              allowUpload: r.allowMemberUploads !== undefined ? r.allowMemberUploads : 1,
              isSeries: r.isSeries || 0,
              createdAt: r.createdAt || Math.floor(Date.now() / 1000),
              membersCount: membersCountObj ? membersCountObj.count : 1
            };
          });

          // Include dynamic categories/groups not in groups_metadata
          const distinctCats = db.prepare("SELECT category FROM videos GROUP BY category").all() as any[];
          const reserved = ["PRINCIPAL", "PRIVADO", "PERSONAL", "GENERAL", "TODOS", "ALL", "uploads", "admin", "config", "shared"];
          
          distinctCats.forEach(cat => {
            const catName = cat.category;
            if (catName && !reserved.includes(catName.toUpperCase())) {
              const alreadyInMeta = folders.some(f => f.name.toLowerCase() === catName.toLowerCase());
              if (!alreadyInMeta) {
                const videoCountObj = db.prepare("SELECT COUNT(*) as count FROM videos WHERE LOWER(category) = LOWER(?)").get(catName) as any;
                folders.push({
                  name: catName,
                  relativePath: catName,
                  count: videoCountObj ? videoCountObj.count : 0,
                  thumbnailUrl: '/api/uploads/thumbnails/default.jpg',
                  creatorId: 'admin',
                  description: 'Grupo autocreado',
                  coverUrl: null,
                  isPrivate: 0,
                  isUnified: 0,
                  allowUpload: 1,
                  isSeries: 0,
                  createdAt: Math.floor(Date.now() / 1000),
                  membersCount: 1
                });
              }
            }
          });

          return res.json({ success: true, data: folders });
        } catch (err: any) {
          console.error("DB Error in get_folders:", err);
          return res.json({ success: false, error: err.message });
        }
      }

      if (action === 'upload_chunk') {
        const uploadId = (req.body.uploadId || '').toString().trim();
        const chunkIndex = parseInt((req.body.chunkIndex || '0').toString());
        const totalChunks = parseInt((req.body.totalChunks || '1').toString());
        const fileName = (req.body.fileName || 'video.mp4').toString().trim();

        if (!uploadId) {
          return res.json({ success: false, error: "uploadId es requerido para subida por fragmentos" });
        }

        const fileObj = req.files?.file?.[0];
        if (!fileObj) {
          return res.json({ success: false, error: "Archivo fragmentado no recibido o inválido" });
        }

        const tempDir = path.join(process.cwd(), 'api/uploads/temp_chunks', uploadId);
        if (!fs.existsSync(tempDir)) {
          fs.mkdirSync(tempDir, { recursive: true });
        }

        const partName = String(chunkIndex).padStart(5, '0') + '.part';
        const chunkPath = path.join(tempDir, partName);

        try {
          fs.copyFileSync(fileObj.path, chunkPath);
          fs.unlinkSync(fileObj.path); // remove multer temporary file
        } catch (copyErr: any) {
          console.error("Error copy file:", copyErr);
          return res.json({ success: false, error: "No se pudo guardar el fragmento en el servidor: " + copyErr.message });
        }

        const filesInTemp = fs.readdirSync(tempDir).filter(fn => fn.endsWith('.part'));
        if (filesInTemp.length < totalChunks) {
          return res.json({ success: true, data: { status: 'chunk_saved', chunkIndex } });
        }

        // Assemble chunks
        const id = 'v_' + Math.random().toString(36).substring(2) + Date.now();
        const ext = path.extname(fileName) || '.mp4';
        const videoName = `${id}${ext}`;
        const folderParam = (req.body.folder || '').toString().trim();

        let videoBaseDir = path.join(process.cwd(), 'api/uploads/videos');
        if (folderParam) {
          const cleanedFolder = folderParam.replace(/[\/\\?\*:\"'<>|\.]/g, '');
          if (cleanedFolder) {
            videoBaseDir = path.join(videoBaseDir, cleanedFolder);
          }
        }

        try {
          if (!fs.existsSync(videoBaseDir)) {
            fs.mkdirSync(videoBaseDir, { recursive: true });
          }
        } catch (dirErr) {
          videoBaseDir = path.join(process.cwd(), 'api/uploads/videos');
          if (!fs.existsSync(videoBaseDir)) {
            fs.mkdirSync(videoBaseDir, { recursive: true });
          }
        }

        let finalVideoPath = path.join(videoBaseDir, videoName);

        try {
          fs.writeFileSync(finalVideoPath, "");
        } catch (writeErr) {
          // Fallback to basic uploads/videos
          videoBaseDir = path.join(process.cwd(), 'api/uploads/videos');
          try {
            if (!fs.existsSync(videoBaseDir)) {
              fs.mkdirSync(videoBaseDir, { recursive: true });
            }
            finalVideoPath = path.join(videoBaseDir, videoName);
            fs.writeFileSync(finalVideoPath, "");
          } catch (writeErr2) {
            // Ultimate fallback to uploads root
            videoBaseDir = path.join(process.cwd(), 'api/uploads');
            finalVideoPath = path.join(videoBaseDir, videoName);
            fs.writeFileSync(finalVideoPath, "");
          }
        }

        try {
          for (let i = 0; i < totalChunks; i++) {
            const currentChunkPath = path.join(tempDir, String(i).padStart(5, '0') + '.part');
            if (!fs.existsSync(currentChunkPath)) {
              try { fs.unlinkSync(finalVideoPath); } catch (e) {}
              return res.json({ success: false, error: `Falta el fragmento número ${i}` });
            }
            const chunkData = fs.readFileSync(currentChunkPath);
            fs.appendFileSync(finalVideoPath, chunkData);
            try { fs.unlinkSync(currentChunkPath); } catch (e) {}
          }
        } catch (assembleErr: any) {
          console.error("Assemble error:", assembleErr);
          try { fs.unlinkSync(finalVideoPath); } catch (e) {}
          return res.json({ success: false, error: "No se pudo ensamblar el video final: " + assembleErr.message });
        }

        // Clean up temp directory
        try { fs.rmdirSync(tempDir); } catch (e) {}

        // Handle thumbnail
        let thumbnailUrl = 'uploads/thumbnails/default.jpg';
        const thumbnailFile = req.files?.thumbnail?.[0];
        if (thumbnailFile) {
          const thumbDir = path.join(process.cwd(), 'api/uploads/thumbnails');
          if (!fs.existsSync(thumbDir)) {
            fs.mkdirSync(thumbDir, { recursive: true });
          }
          const finalThumbPath = path.join(thumbDir, `${id}.jpg`);
          try {
            fs.copyFileSync(thumbnailFile.path, finalThumbPath);
            fs.unlinkSync(thumbnailFile.path); // remove multer temporary file
            thumbnailUrl = `uploads/thumbnails/${id}.jpg`;
          } catch (thumbErr) {
            console.error("Error copying thumbnail:", thumbErr);
          }
        }

        const price = parseFloat(req.body.price || '0');
        const category = (req.body.category || folderParam || 'GENERAL').toString().trim();
        const duration = parseInt(req.body.duration || '0');
        const title = (req.body.title || `Video ${id}`).toString().trim();
        const description = (req.body.description || '').toString().trim();
        const creatorId = (req.body.userId || 'admin').toString().trim();
        const is_private = parseInt(req.body.is_private || req.body.isPrivate || '0');

        const relativeVideoUrl = 'uploads/videos/' + (folderParam ? folderParam + '/' : '') + videoName;

        try {
          db.prepare("INSERT INTO videos (id, title, description, price, thumbnailUrl, videoUrl, creatorId, views, createdAt, category, duration, isLocal, transcode_status, is_private, likes, dislikes, shares) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, 0, 'NONE', ?, 0, 0, 0)")
            .run(id, title, description, price, thumbnailUrl, relativeVideoUrl, creatorId, Math.floor(Date.now() / 1000), category, duration, is_private);

          // Auto-create category/group metadata if it doesn't exist under groups_metadata
          if (category && category !== 'GENERAL' && category !== 'PERSONAL' && category !== 'ALL' && category !== 'TODOS') {
            const cleanedCategory = category.replace(/[\/\\?\*:\"'<>|\.]/g, '');
            if (cleanedCategory) {
              const groupExists = db.prepare("SELECT COUNT(*) as count FROM groups_metadata WHERE LOWER(folderPath) = LOWER(?)").get(cleanedCategory) as any;
              if (!groupExists || groupExists.count === 0) {
                db.prepare("INSERT OR IGNORE INTO groups_metadata (folderPath, creatorId, description, coverUrl, isPrivate, isUnified, allowMemberUploads, isSeries, createdAt) VALUES (?, ?, ?, ?, 0, 0, 1, 0, ?)")
                  .run(cleanedCategory, creatorId, 'Grupo autocreado al subir contenido.', null, Math.floor(Date.now() / 1000));
                db.prepare("INSERT OR IGNORE INTO group_subscriptions (userId, folderPath, approved, createdAt) VALUES (?, ?, 1, ?)")
                  .run(creatorId, cleanedCategory, Math.floor(Date.now() / 1000));
              }
            }
          }

          const registeredVideo = db.prepare("SELECT * FROM videos WHERE id = ?").get(id) as any;
          if (registeredVideo) {
            registeredVideo.thumbnailUrl = fix_url(registeredVideo.thumbnailUrl);
            registeredVideo.videoUrl = fix_url(registeredVideo.videoUrl);
          }

          return res.json({ success: true, data: registeredVideo || { id } });
        } catch (dbErr: any) {
          console.error("Database insert video error:", dbErr);
          return res.json({ success: false, error: dbErr.message });
        }
      }

      if (action === 'rate_video') {
        const { userId, videoId, type } = req.body;
        if (type === 'view') {
          db.prepare("UPDATE videos SET views = views + 1 WHERE id = ?").run(videoId);
          return res.json({ success: true });
        }
        
        const liked = type === 'like' ? 1 : 0;
        const disliked = type === 'dislike' ? 1 : 0;

        const current = db.prepare("SELECT liked, disliked FROM interactions WHERE userId = ? AND videoId = ?").get(userId, videoId) as any;
        let finalLiked = liked;
        let finalDisliked = disliked;

        if (current) {
          if ((type === 'like' && current.liked === 1) || (type === 'dislike' && current.disliked === 1)) {
            finalLiked = 0;
            finalDisliked = 0;
          }
          db.prepare("UPDATE interactions SET liked = ?, disliked = ? WHERE userId = ? AND videoId = ?").run(finalLiked, finalDisliked, userId, videoId);
        } else {
          db.prepare("INSERT INTO interactions (userId, videoId, liked, disliked) VALUES (?, ?, ?, ?)").run(userId, videoId, liked, disliked);
        }

        const lStats = db.prepare("SELECT COUNT(*) as c FROM interactions WHERE videoId = ? AND liked = 1").get(videoId) as any;
        const dStats = db.prepare("SELECT COUNT(*) as c FROM interactions WHERE videoId = ? AND disliked = 1").get(videoId) as any;
        db.prepare("UPDATE videos SET likes = ?, dislikes = ? WHERE id = ?").run(lStats.c, dStats.c, videoId);

        const resInt = db.prepare("SELECT * FROM interactions WHERE userId = ? AND videoId = ?").get(userId, videoId) as any;
        return res.json({ 
          success: true, 
          data: {
            newLikeCount: lStats.c,
            newDislikeCount: dStats.c,
            liked: !!resInt?.liked,
            disliked: !!resInt?.disliked,
            isWatched: !!resInt?.isWatched,
            isSkipped: !!resInt?.isSkipped
          }
        });
      }

      if (action === 'get_user_activity') {
        const userId = req.query.userId || req.body.userId;
        const watched = db.prepare("SELECT videoId FROM interactions WHERE userId = ? AND isWatched = 1").all(userId) as any[];
        const liked = db.prepare("SELECT videoId FROM interactions WHERE userId = ? AND liked = 1").all(userId) as any[];
        return res.json({ success: true, data: {
          watched: watched.map(v => v.videoId),
          liked: liked.map(v => v.videoId)
        }});
      }

      if (action === 'get_interaction') {
        const userId = req.query.userId || req.body.userId;
        const videoId = req.query.videoId || req.body.videoId;
        const inter = db.prepare("SELECT * FROM interactions WHERE userId = ? AND videoId = ?").get(userId, videoId) as any;
        return res.json({ success: true, data: inter ? {
          liked: !!inter.liked,
          disliked: !!inter.disliked,
          isWatched: !!inter.isWatched,
          isSkipped: !!inter.isSkipped
        } : { liked: false, disliked: false, isWatched: false, isSkipped: false }});
      }

      if (action === 'get_notifications') {
        const userId = req.query.userId || req.body.userId;
        const limit = Number(req.query.limit) || 30;
        const notifs = db.prepare("SELECT * FROM notifications WHERE userId = ? ORDER BY timestamp DESC LIMIT ?").all(userId, limit) as any[];
        const processedNotifs = notifs.map(n => ({
          ...n,
          avatarUrl: fix_url(n.avatarUrl),
          metadata: n.metadata ? JSON.parse(n.metadata) : null
        }));
        return res.json({ success: true, data: processedNotifs });
      }

      if (action === 'get_unread_notifications') {
        const userId = req.query.userId || req.body.userId;
        const notifs = db.prepare("SELECT * FROM notifications WHERE userId = ? AND isRead = 0 ORDER BY timestamp DESC LIMIT 10").all(userId) as any[];
        return res.json({ success: true, data: notifs.map(n => ({ ...n, avatarUrl: fix_url(n.avatarUrl), metadata: n.metadata ? JSON.parse(n.metadata) : null })) });
      }

      if (action === 'get_unread_count') {
        const userId = req.query.userId || req.body.userId;
        const row = db.prepare("SELECT COUNT(*) as count FROM notifications WHERE userId = ? AND isRead = 0").get(userId) as any;
        return res.json({ success: true, data: { count: row?.count || 0 }});
      }

      if (action === 'get_apk_background_data') {
        const userId = req.query.userId || req.body.userId;
        if (!userId) {
          return res.json({ success: false, error: "Missing userId" });
        }
        try {
          // 1. Unread notifications count and list
          const notifRow = db.prepare("SELECT COUNT(*) as count FROM notifications WHERE userId = ? AND isRead = 0").get(userId) as any;
          const unreadNotifsList = db.prepare("SELECT * FROM notifications WHERE userId = ? AND isRead = 0 ORDER BY timestamp DESC LIMIT 10").all(userId) as any[];
          
          // 2. Unread messages count and list
          const msgRow = db.prepare("SELECT COUNT(*) as count FROM messages WHERE receiverId = ? AND isRead = 0").get(userId) as any;
          const unreadMsgsList = db.prepare(`
            SELECT m.*, u.username as senderName 
            FROM messages m 
            LEFT JOIN users u ON m.senderId = u.id 
            WHERE m.receiverId = ? AND m.isRead = 0 
            ORDER BY m.timestamp DESC 
            LIMIT 20
          `).all(userId) as any[];

          return res.json({
            success: true,
            data: {
              unreadNotificationsCount: notifRow?.count || 0,
              unreadMessagesCount: msgRow?.count || 0,
              unreadNotifications: unreadNotifsList.map(n => ({
                ...n,
                avatarUrl: fix_url(n.avatarUrl),
                metadata: n.metadata ? JSON.parse(n.metadata) : null
              })),
              unreadMessages: unreadMsgsList.map(m => ({
                ...m,
                imageUrl: m.imageUrl ? fix_url(m.imageUrl) : null,
                videoUrl: m.videoUrl ? fix_url(m.videoUrl) : null,
                audioUrl: m.audioUrl ? fix_url(m.audioUrl) : null,
                fileUrl: m.fileUrl ? fix_url(m.fileUrl) : null
              }))
            }
          });
        } catch (error: any) {
          return res.json({ success: false, error: error.message });
        }
      }

      if (action === 'register_fcm_token') {
        const { userId, token, deviceModel = 'Unknown' } = req.body;
        if (!userId || !token) {
          return res.json({ success: false, error: "Missing userId or token" });
        }
        try {
          db.prepare(`
            INSERT INTO fcm_tokens (token, userId, deviceModel, createdAt)
            VALUES (?, ?, ?, ?)
            ON CONFLICT(token) DO UPDATE SET userId = ?, deviceModel = ?, createdAt = ?
          `).run(token, userId, deviceModel, Math.floor(Date.now() / 1000), userId, deviceModel, Math.floor(Date.now() / 1000));
          return res.json({ success: true, message: "Token registered successfully" });
        } catch (error: any) {
          return res.json({ success: false, error: error.message });
        }
      }

      if (action === 'get_receiver_fcm_tokens') {
        const receiverId = req.query.receiverId || req.body.receiverId;
        if (!receiverId) {
          return res.json({ success: false, error: "Missing receiverId" });
        }
        try {
          const tokens = db.prepare("SELECT token FROM fcm_tokens WHERE userId = ?").all(receiverId) as any[];
          return res.json({ success: true, data: tokens.map((t: any) => t.token) });
        } catch (error: any) {
          return res.json({ success: false, error: error.message });
        }
      }

      if (action === 'mark_watched') {
        const { userId, videoId } = req.body;
        const now = Math.floor(Date.now() / 1000);
        db.prepare("INSERT INTO interactions (userId, videoId, isWatched, watchedAt) VALUES (?, ?, 1, ?) ON CONFLICT(userId, videoId) DO UPDATE SET isWatched = 1, watchedAt = ?")
          .run(userId, videoId, now, now);
        return res.json({ success: true });
      }

      if (action === 'mark_skipped') {
        const { userId, videoId } = req.body;
        db.prepare("INSERT INTO interactions (userId, videoId, isSkipped) VALUES (?, ?, 1) ON CONFLICT(userId, videoId) DO UPDATE SET isSkipped = CASE WHEN isWatched = 1 THEN 0 ELSE 1 END")
          .run(userId, videoId);
        return res.json({ success: true });
      }

      if (action === 'purchase_video') {
         const { userId, videoId } = req.body;
         const video = db.prepare("SELECT * FROM videos WHERE id = ?").get(videoId) as any;
         const user = db.prepare("SELECT * FROM users WHERE id = ?").get(userId) as any;
         
         if (!video || !user) return res.json({ success: false, error: "Datos inválidos" });
         if (user.balance < video.price) return res.json({ success: false, error: "Saldo insuficiente" });

         const settings = db.prepare("SELECT videoCommission FROM system_settings WHERE id = 1").get() as any;
         const commissionPercent = settings && settings.videoCommission !== undefined ? Number(settings.videoCommission) : 20;
         const fee = video.price * (commissionPercent / 100);
         const part = video.price - fee;
         
         db.transaction(() => {
           db.prepare("UPDATE users SET balance = balance - ? WHERE id = ?").run(video.price, userId);
           db.prepare("UPDATE users SET balance = balance + ? WHERE id = ?").run(part, video.creatorId);
           db.prepare("INSERT INTO transactions (id, buyerId, creatorId, videoId, amount, adminFee, timestamp, type, videoTitle) VALUES (?, ?, ?, ?, ?, ?, ?, 'PURCHASE', ?)")
             .run('tx_'+Date.now(), userId, video.creatorId, videoId, video.price, fee, Math.floor(Date.now()/1000), video.title);
         })();

         return res.json({ success: true });
      }

      if (action === 'get_comments') {
        const videoId = req.query.id;
        const comments = db.prepare(`
          SELECT c.*, u.username, u.avatarUrl as userAvatarUrl 
          FROM comments c 
          JOIN users u ON c.userId = u.id 
          WHERE c.videoId = ? 
          ORDER BY c.timestamp DESC
        `).all(videoId) as any[];
        const processedComments = comments.map(c => ({
          ...c,
          userAvatarUrl: fix_url(c.userAvatarUrl)
        }));
        return res.json({ success: true, data: processedComments });
      }

      if (action === 'add_comment') {
        const { userId, videoId, text } = req.body;
        const id = 'c_' + Date.now();
        const now = Math.floor(Date.now() / 1000);
        db.prepare("INSERT INTO comments (id, videoId, userId, text, timestamp) VALUES (?, ?, ?, ?, ?)")
          .run(id, videoId, userId, text, now);
        
        const comment = db.prepare(`
          SELECT c.*, u.username, u.avatarUrl as userAvatarUrl 
          FROM comments c 
          JOIN users u ON c.userId = u.id 
          WHERE c.id = ?
        `).get(id) as any;
        
        comment.userAvatarUrl = fix_url(comment.userAvatarUrl);
        return res.json({ success: true, data: comment });
      }

      if (action === 'toggle_subscribe') {
        const { userId, creatorId } = req.body;
        const check = db.prepare("SELECT COUNT(*) as count FROM subscriptions WHERE subscriberId = ? AND creatorId = ?").get(userId, creatorId) as any;
        let isSubscribed = false;
        if (check.count > 0) {
          db.prepare("DELETE FROM subscriptions WHERE subscriberId = ? AND creatorId = ?").run(userId, creatorId);
        } else {
          db.prepare("INSERT INTO subscriptions (subscriberId, creatorId, createdAt) VALUES (?, ?, ?)").run(userId, creatorId, Math.floor(Date.now() / 1000));
          isSubscribed = true;
        }
        return res.json({ success: true, data: { isSubscribed } });
      }

      if (action === 'check_subscription') {
        const { userId, creatorId } = req.query;
        const check = db.prepare("SELECT COUNT(*) as count FROM subscriptions WHERE subscriberId = ? AND creatorId = ?").get(userId, creatorId) as any;
        return res.json({ success: true, data: { isSubscribed: check.count > 0 } });
      }

      if (action === 'get_subscriptions') {
        const userId = req.query.userId;
        const subs = db.prepare("SELECT creatorId FROM subscriptions WHERE subscriberId = ?").all(userId) as any[];
        return res.json({ success: true, data: subs.map(s => s.creatorId) });
      }

      if (action === 'get_trending_videos') {
        const videos = db.prepare("SELECT * FROM videos WHERE is_private = 0 ORDER BY views DESC LIMIT 20").all() as any[];
        return res.json({ success: true, data: videos.map(v => ({...v, thumbnailUrl: fix_url(v.thumbnailUrl), videoUrl: fix_url(v.videoUrl)})) });
      }

      if (action === 'get_video') {
        const id = req.query.id;
        const video = db.prepare("SELECT * FROM videos WHERE id = ?").get(id) as any;
        if (video) {
          video.thumbnailUrl = fix_url(video.thumbnailUrl);
          video.videoUrl = fix_url(video.videoUrl);
          return res.json({ success: true, data: video });
        }
        return res.json({ success: false, error: "Not found" });
      }

      if (action === 'get_chats') {
        const userId = req.query.userId || req.body.userId;
        const chats = db.prepare(`
          SELECT DISTINCT 
                 CASE WHEN senderId = ? THEN receiverId ELSE senderId END as otherId 
          FROM messages 
          WHERE senderId = ? OR receiverId = ? 
          ORDER BY timestamp DESC
        `).all(userId, userId, userId) as any[];
        
        const results = chats.map(c => {
          const other = db.prepare("SELECT id, username, avatarUrl FROM users WHERE id = ?").get(c.otherId) as any;
          if (!other) return null;
          const lastMsg = db.prepare(`
            SELECT * FROM messages 
            WHERE (senderId = ? AND receiverId = ?) OR (senderId = ? AND receiverId = ?) 
            ORDER BY timestamp DESC LIMIT 1
          `).get(userId, c.otherId, c.otherId, userId) as any;
          const unread = (db.prepare("SELECT COUNT(*) as count FROM messages WHERE senderId = ? AND receiverId = ? AND isRead = 0").get(c.otherId, userId) as any).count;
          
          return {
            user: { ...other, avatarUrl: fix_url(other.avatarUrl) },
            lastMessage: lastMsg,
            unreadCount: unread
          };
        }).filter(Boolean);
        
        return res.json({ success: true, data: results });
      }

      if (action === 'get_messages') {
        const { userId, otherId, limit = 50, offset = 0 } = req.query;
        db.prepare("UPDATE messages SET isRead = 1, isDelivered = 1 WHERE senderId = ? AND receiverId = ? AND isRead = 0").run(otherId, userId);
        const messages = db.prepare(`
          SELECT * FROM messages 
          WHERE (senderId = ? AND receiverId = ?) OR (senderId = ? AND receiverId = ?) 
          ORDER BY timestamp DESC
          LIMIT ? OFFSET ?
        `).all(userId, otherId, otherId, userId, Number(limit), Number(offset)) as any[];
        return res.json({ success: true, data: messages.reverse() });
      }

      if (action === 'send_message') {
        const { userId, receiverId, text, mediaType = 'TEXT' } = req.body;
        const id = 'msg_' + Date.now();
        const now = Math.floor(Date.now() / 1000);
        db.prepare("INSERT INTO messages (id, senderId, receiverId, text, mediaType, timestamp) VALUES (?, ?, ?, ?, ?, ?)")
          .run(id, userId, receiverId, text, mediaType, now);
        
        const msg = db.prepare("SELECT * FROM messages WHERE id = ?").get(id) as any;
        
        // Fetch sender's name for immediate notification building
        const sender = db.prepare("SELECT username FROM users WHERE id = ?").get(userId) as any;
        
        // Fetch receiver's FCM tokens
        const tokens = db.prepare("SELECT token FROM fcm_tokens WHERE userId = ?").all(receiverId) as any[];
        const fcmTokens = tokens.map((t: any) => t.token);

        return res.json({ 
          success: true, 
          data: {
            ...msg,
            senderName: sender?.username || "Usuario",
            receiverFcmTokens: fcmTokens
          }
        });
      }

      if (action === 'get_user_history') {
        const userId = req.query.userId || req.body.userId;
        const history = db.prepare(`
          SELECT v.*, i.watchedAt 
          FROM interactions i 
          JOIN videos v ON i.videoId = v.id 
          WHERE i.userId = ? AND i.isWatched = 1 AND v.is_private = 0 
          ORDER BY i.watchedAt DESC 
          LIMIT 50
        `).all(userId) as any[];
        return res.json({ success: true, data: history.map(v => ({ ...v, thumbnailUrl: fix_url(v.thumbnailUrl), videoUrl: fix_url(v.videoUrl) })) });
      }

      if (action === 'has_purchased') {
        const { userId, videoId } = req.query;
        const count = (db.prepare("SELECT COUNT(*) as count FROM transactions WHERE buyerId = ? AND videoId = ? AND type = 'PURCHASE'").get(userId, videoId) as any).count;
        return res.json({ success: true, data: { hasPurchased: count > 0 } });
      }

      if (action === 'mark_notification_read') {
        const { id } = req.body;
        db.prepare("UPDATE notifications SET isRead = 1 WHERE id = ?").run(id);
        return res.json({ success: true });
      }

      if (action === 'mark_all_notifications_read') {
        const { userId } = req.body;
        db.prepare("UPDATE notifications SET isRead = 1 WHERE userId = ?").run(userId);
        return res.json({ success: true });
      }

      if (action === 'get_video_likers') {
        const { videoId } = req.query;
        const likers = db.prepare(`
          SELECT u.username, u.avatarUrl 
          FROM interactions i 
          JOIN users u ON i.userId = u.id 
          WHERE i.videoId = ? AND i.liked = 1 
          ORDER BY RANDOM() LIMIT 5
        `).all(videoId) as any[];
        return res.json({ success: true, data: likers.map(u => ({ ...u, avatarUrl: fix_url(u.avatarUrl) })) });
      }

      if (action === 'get_user_followers') {
        const { userId } = req.query;
        const followers = db.prepare(`
          SELECT u.id, u.username, u.avatarUrl 
          FROM subscriptions s 
          JOIN users u ON s.subscriberId = u.id 
          WHERE s.creatorId = ?
        `).all(userId) as any[];
        return res.json({ success: true, data: followers.map(u => ({ ...u, avatarUrl: fix_url(u.avatarUrl) })) });
      }

      if (action === 'transfer_balance') {
        const { userId, targetUsername, amount } = req.body;
        const amt = parseFloat(amount);
        const sender = db.prepare("SELECT * FROM users WHERE id = ?").get(userId) as any;
        const receiver = db.prepare("SELECT * FROM users WHERE username = ?").get(targetUsername) as any;
        
        if (!sender || !receiver) return res.json({ success: false, error: "Usuarios no encontrados" });
        if (sender.balance < amt) return res.json({ success: false, error: "Saldo insuficiente" });
        
        db.transaction(() => {
          db.prepare("UPDATE users SET balance = balance - ? WHERE id = ?").run(amt, userId);
          db.prepare("UPDATE users SET balance = balance + ? WHERE id = ?").run(amt, receiver.id);
          db.prepare("INSERT INTO transactions (id, buyerId, creatorId, amount, type, timestamp, videoTitle) VALUES (?, ?, ?, ?, 'TRANSFER', ?, ?)")
            .run('tx_'+Date.now(), userId, receiver.id, amt, Math.floor(Date.now()/1000), "Transferencia a @" + targetUsername);
          db.prepare("INSERT INTO notifications (id, userId, type, text, link, timestamp, avatarUrl) VALUES (?, ?, 'SYSTEM', ?, ?, ?, ?)")
            .run('n_'+Date.now(), receiver.id, `Has recibido ${amt} $ de @${sender.username}`, '/wallet', Math.floor(Date.now()/1000), sender.avatarUrl);
        })();
        return res.json({ success: true });
      }

      if (action === 'save_search') {
        const { term } = req.body;
        if (term && term.length > 1) {
          db.prepare("INSERT INTO search_history (term, count, last_searched) VALUES (?, 1, ?) ON CONFLICT(term) DO UPDATE SET count = count + 1, last_searched = ?").run(term, Math.floor(Date.now()/1000), Math.floor(Date.now()/1000));
        }
        return res.json({ success: true });
      }

      if (action === 'get_search_suggestions') {
        const { q = '', limit = 10 } = req.query;
        const query = (q as string).trim();
        if (!query) {
           const history = db.prepare("SELECT term as label, 'HISTORY' as type FROM search_history ORDER BY count DESC LIMIT 6").all() as any[];
           return res.json({ success: true, data: history });
        }
        
        const users = db.prepare("SELECT id, username as label, avatarUrl, 'USER' as type FROM users WHERE username LIKE ? LIMIT 5").all(`%${query}%`) as any[];
        const contents = db.prepare("SELECT id, title as label, 'VIDEO' as type FROM videos WHERE title LIKE ? LIMIT ?").all(`%${query}%`, Number(limit)) as any[];
        
        return res.json({ success: true, data: [...users.map(u => ({...u, avatarUrl: fix_url(u.avatarUrl)})), ...contents] });
      }

      if (action === 'get_hashtag_suggestions') {
        const { q = '', limit = 10 } = req.query;
        const query = (q as string).trim().replace('#', '');
        // Simple mock since regex on all descriptions is expensive in SQLite
        const tags = db.prepare("SELECT DISTINCT category as value FROM videos WHERE category LIKE ? LIMIT ?").all(`%${query}%`, Number(limit)) as any[];
        return res.json({ success: true, data: tags.map(t => ({ label: `#${t.value}`, value: t.value })) });
      }

      if (action === 'get_mutual_friends') {
        const { userId, targetId } = req.query;
        // Mutual friends = Users that both follow
        const mutuals = db.prepare(`
          SELECT u.id, u.username, u.avatarUrl 
          FROM users u
          WHERE u.id IN (SELECT creatorId FROM subscriptions WHERE subscriberId = ?)
          AND u.id IN (SELECT creatorId FROM subscriptions WHERE subscriberId = ?)
          LIMIT 10
        `).all(userId, targetId) as any[];
        return res.json({ success: true, data: mutuals.map(m => ({ ...m, avatarUrl: fix_url(m.avatarUrl) })) });
      }

      if (action === 'purchase_vip_instant') {
        const { userId, plan } = req.body;
        const user = db.prepare("SELECT balance, vipExpiry FROM users WHERE id = ?").get(userId) as any;
        if (!user) return res.json({ success: false, error: "Usuario no encontrado" });
        if (user.balance < plan.price) return res.json({ success: false, error: "Saldo insuficiente" });
        
        const now = Math.floor(Date.now() / 1000);
        const durationSeconds = plan.durationDays * 86400;
        const newExpiry = Math.max(user.vipExpiry || 0, now) + durationSeconds;
        
        db.transaction(() => {
          db.prepare("UPDATE users SET balance = balance - ?, vipExpiry = ? WHERE id = ?").run(plan.price, newExpiry, userId);
          db.prepare("INSERT INTO transactions (id, buyerId, amount, type, timestamp, videoTitle, isExternal) VALUES (?, ?, ?, 'VIP', ?, ?, 1)")
            .run('txv_'+Date.now(), userId, plan.price, now, plan.name);
        })();
        return res.json({ success: true });
      }

      if (action === 'increment_share') {
        const { id } = req.query;
        db.prepare("UPDATE videos SET shares = shares + 1 WHERE id = ?").run(id);
        return res.json({ success: true });
      }

      if (action === 'get_admin_library_stats') {
        const videoStats = db.prepare("SELECT COUNT(*) as total, SUM(views) as views, SUM(likes) as likes FROM videos").get() as any;
        const userStats = db.prepare("SELECT COUNT(*) as total FROM users").get() as any;
        return res.json({ success: true, data: {
          totalVideos: videoStats.total || 0,
          totalViews: videoStats.views || 0,
          totalLikes: videoStats.likes || 0,
          totalUsers: userStats.total || 0
        }});
      }

      if (action === 'get_real_stats') {
        const fromTs = parseInt(req.query.from as string) || 0;
        const toTs = parseInt(req.query.to as string) || Math.floor(Date.now() / 1000);

        const totalUsersRow = db.prepare("SELECT COUNT(*) as count FROM users").get() as any;
        const userCount = totalUsersRow ? totalUsersRow.count : 0;

        const revRow = db.prepare(`
          SELECT SUM(amount) as total 
          FROM transactions 
          WHERE (isExternal = 1) 
            AND timestamp >= ? AND timestamp <= ?
        `).get(fromTs, toTs) as any;
        const totalRevenue = revRow && revRow.total ? parseFloat(revRow.total) : 0;

        const feeRow = db.prepare(`
          SELECT SUM(COALESCE(adminFee, 0)) as total 
          FROM transactions 
          WHERE timestamp >= ? AND timestamp <= ?
        `).get(fromTs, toTs) as any;
        const internalRevenue = feeRow && feeRow.total ? parseFloat(feeRow.total) : 0;

        const payingRow = db.prepare(`
          SELECT COUNT(DISTINCT buyerId) as count 
          FROM transactions 
          WHERE buyerId IS NOT NULL AND buyerId != ''
        `).get() as any;
        const payingCount = payingRow ? payingRow.count : 0;

        const conversion = userCount > 0 ? parseFloat(((payingCount / userCount) * 100).toFixed(1)) : 0;
        const arpu = userCount > 0 ? parseFloat((totalRevenue / userCount).toFixed(1)) : 0;

        // Fetch plan mix
        const mixRows = db.prepare(`
          SELECT videoTitle as planName, COUNT(*) as count 
          FROM transactions 
          WHERE type = 'VIP' AND timestamp >= ? AND timestamp <= ?
          GROUP BY videoTitle
        `).all(fromTs, toTs) as any[];

        const planMix: Record<string, number> = {};
        mixRows.forEach(row => {
          if (row.planName) {
            planMix[row.planName] = row.count;
          }
        });

        // Daily history points grouping
        const dailyRows = db.prepare(`
          SELECT 
            DATE(timestamp, 'unixepoch') as day,
            SUM(CASE WHEN (isExternal = 1) THEN amount ELSE 0 END) as cash_in,
            SUM(COALESCE(adminFee, 0)) as internal_rev
          FROM transactions
          WHERE timestamp >= ? AND timestamp <= ?
          GROUP BY day
          ORDER BY day ASC
        `).all(fromTs, toTs) as any[];

        const dailyMap = new Map<string, { cash_in: number, internal_rev: number }>();
        dailyRows.forEach(row => {
          if (row.day) {
            dailyMap.set(row.day, {
              cash_in: parseFloat(row.cash_in || '0'),
              internal_rev: parseFloat(row.internal_rev || '0')
            });
          }
        });

        const dailyHistory = [];
        const startDay = new Date(fromTs * 1000);
        const endDay = new Date(toTs * 1000);
        for (let d = new Date(startDay); d <= endDay; d.setDate(d.getDate() + 1)) {
          const dateStr = d.toISOString().split('T')[0];
          const value = dailyMap.get(dateStr) || { cash_in: 0, internal_rev: 0 };
          dailyHistory.push({
            label: dateStr,
            cash_in: value.cash_in,
            internal_rev: value.internal_rev
          });
        }

        if (dailyHistory.length < 2) {
          const defaultDayStr = new Date(fromTs * 1000).toISOString().split('T')[0];
          dailyHistory.push({ label: defaultDayStr, cash_in: 0, internal_rev: 0 });
          dailyHistory.push({ label: new Date(toTs * 1000).toISOString().split('T')[0], cash_in: 0, internal_rev: 0 });
        }

        return res.json({
          success: true,
          data: {
            totalRevenue,
            internalRevenue,
            userCount,
            averages: {
              arpu,
              conversion
            },
            planMix,
            history: {
              daily: dailyHistory
            }
          }
        });
      }

      if (action === 'get_global_transactions') {
        const history = db.prepare("SELECT * FROM transactions ORDER BY timestamp DESC LIMIT 200").all() as any[];
        const systemRevenueRow = db.prepare("SELECT SUM(COALESCE(adminFee, 0)) as total FROM transactions").get() as any;
        const systemRevenue = systemRevenueRow ? parseFloat(systemRevenueRow.total || '0') : 0;
        return res.json({ success: true, data: { history, systemRevenue } });
      }

      if (action === 'admin_get_server_stats') {
        const cpu = Math.round(5 + Math.random() * 15);

        const settings = db.prepare("SELECT batteryConfig, batteryHistory FROM system_settings WHERE id = 1").get() as any;
        let battery = null;
        let batteryHistory = null;
        if (settings) {
          if (settings.batteryConfig) {
            try { battery = JSON.parse(settings.batteryConfig); } catch (e) {}
          }
          if (settings.batteryHistory) {
            try { batteryHistory = JSON.parse(settings.batteryHistory); } catch (e) {}
          }
        }

        if (!battery) {
          battery = {
            voltage: 14.8,
            minWatts: 200,
            maxWatts: 300,
            isCharging: false,
            cellHealth: 89,
            currentWh: 150,
            lastUpdate: Date.now(),
            chargePower: 45,
            cellsSeries: 4,
            cellsParallel: 4,
            cellCapacityMah: 5000,
            lastChargeTime: Date.now()
          };
        }

        if (!batteryHistory || batteryHistory.length === 0) {
          batteryHistory = [];
          const now = Date.now();
          for (let i = 24; i >= 0; i--) {
            batteryHistory.push({
              t: now - i * 3600 * 1000,
              v: 14.2 + Math.sin(i / 3) * 0.5 + Math.random() * 0.1,
              c: 150 + Math.cos(i / 3) * 20
            });
          }
        }

        const totalUsersRow = db.prepare("SELECT COUNT(*) as count FROM users").get() as any;
        const activeUsersCount = totalUsersRow ? totalUsersRow.count : 1;

        return res.json({
          success: true,
          data: {
            cpu,
            storage: {
              total: "512 GB",
              used: "124 GB",
              percent: 24
            },
            network: {
              up: Math.round(20 + Math.random() * 80),
              down: Math.round(50 + Math.random() * 200)
            },
            activeUsers: activeUsersCount,
            uptime: "45d 12h 30m",
            battery,
            batteryHistory
          }
        });
      }

      if (action === 'update_system_settings') {
        const bodyKeys = Object.keys(req.body);
        if (bodyKeys.length > 0) {
          db.transaction(() => {
            for (const key of bodyKeys) {
              let valueToStore = req.body[key];
              if (typeof valueToStore === 'object') {
                valueToStore = JSON.stringify(valueToStore);
              }
              // Dynamically update column if it exists or use basic parameters
              try {
                db.prepare(`UPDATE system_settings SET ${key} = ? WHERE id = 1`).run(valueToStore);
              } catch (err: any) {
                console.error(`Failed to update system_settings column ${key}:`, err.message);
              }
            }
          })();
        }
        return res.json({ success: true });
      }

      if (action === 'admin_add_balance') {
        const { userId, amount, reason } = req.body;
        const amt = parseFloat(amount || '0');
        db.transaction(() => {
          db.prepare("UPDATE users SET balance = balance + ? WHERE id = ?").run(amt, userId);
          db.prepare("INSERT INTO transactions (id, buyerId, amount, type, timestamp, videoTitle, isExternal) VALUES (?, ?, ?, 'DEPOSIT', ?, ?, 1)")
            .run('tx_adm_add_' + Date.now(), userId, amt, Math.floor(Date.now() / 1000), reason || 'Ajuste de Saldo por Administrador');
        })();
        return res.json({ success: true });
      }

      if (action === 'get_system_settings') {
        const settings = db.prepare("SELECT * FROM system_settings WHERE id = 1").get() as any;
        if (!settings) return res.json({ success: true, data: {} });
        return res.json({ success: true, data: {
          ...settings,
          categories: JSON.parse(settings.categories || '[]'),
          paymentMethods: JSON.parse(settings.paymentMethods || '{}'),
          vipPlans: JSON.parse(settings.vipPlans || '[]'),
          isQueuePaused: !!settings.isQueuePaused,
          batteryConfig: settings.batteryConfig ? JSON.parse(settings.batteryConfig) : undefined,
          batteryHistory: settings.batteryHistory ? JSON.parse(settings.batteryHistory) : undefined
        }});
      }

      if (action === 'purchase_category') {
        const { userId, categoryId } = req.body;
        const settings = db.prepare("SELECT categories FROM system_settings WHERE id = 1").get() as any;
        const categories = JSON.parse(settings?.categories || '[]');
        const cat = categories.find((c: any) => c.id === categoryId);
        
        if (!cat) return res.json({ success: false, error: "Categoría no encontrada" });
        if (cat.price <= 0) return res.json({ success: true, message: "Categoría gratuita" });

        const user = db.prepare("SELECT balance FROM users WHERE id = ?").get(userId) as any;
        if (user.balance < cat.price) return res.json({ success: false, error: "Saldo insuficiente" });

        db.transaction(() => {
          db.prepare("UPDATE users SET balance = balance - ? WHERE id = ?").run(cat.price, userId);
          db.prepare("INSERT INTO transactions (id, buyerId, amount, type, timestamp, videoTitle) VALUES (?, ?, ?, 'PURCHASE', ?, ?)")
            .run('txc_'+Date.now(), userId, cat.price, Math.floor(Date.now()/1000), "Compra de categoría: " + cat.name);
          // Actually category purchase might need a separate table to track what user has access to.
          // For now, satisfy the UI call.
        })();
        return res.json({ success: true });
      }

      if (action === 'get_latest_version') {
        const settings = db.prepare("SELECT latestApkVersion FROM system_settings WHERE id = 1").get() as any;
        return res.json({ success: true, data: { version: settings?.latestApkVersion || '1.0.0', filename: 'streampay_v1.apk', url: null, isAPK: true, deviceIdentity: 'server' } });
      }

      if (action === 'get_categories') {
        const settings = db.prepare("SELECT categories FROM system_settings WHERE id = 1").get() as any;
        return res.json({ success: true, data: JSON.parse(settings?.categories || '[]') });
      }

      if (action === 'group_create') {
        const { userId, name, description, isPrivate, coverUrl, allowMemberUploads, isSeries } = req.body;
        if (!userId || !name) {
          return res.json({ success: false, error: "Faltan datos" });
        }
        const reserved = ["PRINCIPAL", "PRIVADO", "PERSONAL", "GENERAL", "TODOS", "ALL", "uploads", "admin", "config", "shared", "system", "local", "root"];
        if (reserved.includes(name.toUpperCase())) {
          return res.json({ success: false, error: "Ese nombre de grupo está reservado." });
        }
        const folderNameForDir = name.replace(/[\/\\?\*:\"'<>|\.]/g, '');
        if (!folderNameForDir) {
          return res.json({ success: false, error: "Nombre de grupo inválido" });
        }

        // Physically create the folder
        try {
          const groupDir = path.join(process.cwd(), 'api/uploads/videos', folderNameForDir);
          if (!fs.existsSync(groupDir)) {
            fs.mkdirSync(groupDir, { recursive: true });
          }
        } catch (dirErr: any) {
          console.error("Error creating physical folder during group_create:", dirErr);
        }

        // Register in DB
        try {
          db.prepare("INSERT OR REPLACE INTO groups_metadata (folderPath, creatorId, description, coverUrl, isPrivate, isUnified, allowMemberUploads, isSeries, createdAt) VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?)")
            .run(folderNameForDir, userId, description || 'Grupo sin descripción.', coverUrl || null, isPrivate ? 1 : 0, allowMemberUploads !== undefined ? (allowMemberUploads ? 1 : 0) : 1, isSeries ? (isSeries ? 1 : 0) : 0, Math.floor(Date.now() / 1000));
          
          db.prepare("INSERT OR IGNORE INTO group_subscriptions (userId, folderPath, approved, createdAt) VALUES (?, ?, 1, ?)")
            .run(userId, folderNameForDir, Math.floor(Date.now() / 1000));
          
          return res.json({ success: true, data: { name: folderNameForDir }, message: "Grupo creado exitosamente" });
        } catch (err: any) {
          return res.json({ success: false, error: err.message });
        }
      }

      if (action === 'group_edit') {
        const { userId, folderPath, name, description, isPrivate, coverUrl, isUnified, allowMemberUploads, isSeries } = req.body;
        if (!userId || !folderPath) {
          return res.json({ success: false, error: "Faltan datos" });
        }

        // Verify creator
        const meta = db.prepare("SELECT creatorId FROM groups_metadata WHERE folderPath = ?").get(folderPath) as any;
        if (!meta || meta.creatorId !== userId) {
          return res.json({ success: false, error: "No tienes permisos para editar este grupo" });
        }

        try {
          db.prepare(`
            UPDATE groups_metadata 
            SET description = COALESCE(?, description),
                coverUrl = COALESCE(?, coverUrl),
                isPrivate = COALESCE(?, isPrivate),
                isUnified = COALESCE(?, isUnified),
                allowMemberUploads = COALESCE(?, allowMemberUploads),
                isSeries = COALESCE(?, isSeries)
            WHERE folderPath = ?
          `).run(
            description !== undefined ? description : null,
            coverUrl !== undefined ? coverUrl : null,
            isPrivate !== undefined ? (isPrivate ? 1 : 0) : null,
            isUnified !== undefined ? (isUnified ? 1 : 0) : null,
            allowMemberUploads !== undefined ? (allowMemberUploads ? 1 : 0) : null,
            isSeries !== undefined ? (isSeries ? 1 : 0) : null,
            folderPath
          );
          return res.json({ success: true, message: "Grupo actualizado exitosamente" });
        } catch (err: any) {
          return res.json({ success: false, error: err.message });
        }
      }

      if (action === 'group_subscribe') {
        const { userId, folderPath } = req.body;
        const meta = db.prepare("SELECT isPrivate FROM groups_metadata WHERE folderPath = ?").get(folderPath) as any;
        const approved = meta?.isPrivate ? 0 : 1;
        db.prepare("INSERT OR REPLACE INTO group_subscriptions (userId, folderPath, approved, createdAt) VALUES (?, ?, ?, ?)")
          .run(userId, folderPath, approved, Math.floor(Date.now() / 1000));
        return res.json({ success: true, data: { approved } });
      }

      if (action === 'group_unsubscribe') {
        const { userId, folderPath } = req.body;
        db.prepare("DELETE FROM group_subscriptions WHERE userId = ? AND folderPath = ?").run(userId, folderPath);
        return res.json({ success: true });
      }

      if (action === 'get_group_subscriptions') {
        const { userId } = req.query;
        const rows = db.prepare("SELECT folderPath FROM group_subscriptions WHERE userId = ? AND approved = 1").all(userId) as any[];
        return res.json({ success: true, data: rows.map(r => r.folderPath) });
      }

      if (action === 'get_stories') {
        const { userId } = req.query;
        const nowSec = Math.floor(Date.now() / 1000);
        const dayAgo = nowSec - 86400;

        // Fetch real stories
        const realStories = db.prepare(`
          SELECT s.*, u.username, u.avatarUrl,
                 (CASE WHEN s.userId IN (SELECT creatorId FROM subscriptions WHERE subscriberId = ?) THEN 1 ELSE 0 END) as isFriend
          FROM stories s
          JOIN users u ON s.userId = u.id
          WHERE s.createdAt >= ? AND s.expiresAt > ?
          ORDER BY s.createdAt DESC
        `).all(userId, dayAgo, nowSec) as any[];

        // Process real stories to match PHP signature
        for (const story of realStories) {
          story.isFriend = Number(story.isFriend || 0);
          if (story.videoId) {
            story.originalVideo = db.prepare("SELECT * FROM videos WHERE id = ?").get(story.videoId);
          }
        }

        // Build dynamic group stories
        const followedGroupsRows = db.prepare("SELECT folderPath FROM group_subscriptions WHERE userId = ? AND approved = 1").all(userId) as any[];
        const followedGroups = followedGroupsRows.map(f => f.folderPath);

        const allVideos = db.prepare("SELECT * FROM videos WHERE category != 'PENDING' AND is_private = 0").all() as any[];
        const videosBySubfolder: Record<string, any[]> = {};

        for (const v of allVideos) {
          const videoUrl = (v.videoUrl || '').replace(/\\/g, '/');
          const parts = videoUrl.split('/');
          if (parts.length > 2) {
            const relPath = parts[parts.length - 2];
            const vKey = relPath.toLowerCase();
            if (!videosBySubfolder[vKey]) {
              videosBySubfolder[vKey] = [];
            }
            videosBySubfolder[vKey].push(v);
          }
        }

        const groupStories: any[] = [];
        const dayBlock = Math.floor(Date.now() / 86400000);
        const hashCode = (str: string) => {
          let hash = 0;
          for (let i = 0; i < str.length; i++) {
            hash = (hash << 5) - hash + str.charCodeAt(i);
            hash |= 0;
          }
          return Math.abs(hash);
        };

        for (const folder of followedGroups) {
          const vKey = folder.toLowerCase();
          const folderVideos = videosBySubfolder[vKey];
          if (!folderVideos || folderVideos.length === 0) continue;

          // Deterministic seed select: between 1 and 5
          const seed = hashCode(folder + '_' + dayBlock);
          let numStoriesSelect = (seed % 5) + 1;
          numStoriesSelect = Math.min(numStoriesSelect, folderVideos.length);

          // Get group metadata for title and other visual assets
          const meta = db.prepare("SELECT * FROM groups_metadata WHERE folderPath = ?").get(folder) as any;
          const isPrivateGrp = meta?.isPrivate || 0;

          // Pick deterministically
          const selectedVideos = [...folderVideos]
            .sort((a,b) => a.id.localeCompare(b.id))
            .slice(0, numStoriesSelect);

          selectedVideos.forEach((v, index) => {
            const storyThumb = v.thumbnailUrl || 'api/uploads/thumbnails/default.jpg';
            const grpName = folder;
            const simulatedCreatedAt = nowSec - (2 * 3600) - (index * 3600);

            groupStories.push({
              id: `st_group_${folder}_${v.id}`,
              userId: `group_${folder}`,
              username: `Grupo · ${grpName}`,
              avatarUrl: storyThumb,
              contentUrl: v.videoUrl,
              type: 'VIDEO',
              overlayText: v.title,
              overlayColor: '#ffffff',
              overlayBg: 'bg-black/50',
              audioUrl: null,
              videoId: v.id,
              productId: null,
              duration: v.duration && v.duration > 0 ? Math.min(v.duration, 15) : 15,
              createdAt: simulatedCreatedAt,
              expiresAt: simulatedCreatedAt + 86400,
              isFriend: 1,
              thumbnailUrl: storyThumb,
              originalVideo: v
            });
          });
        }

        // Combine
        const combined = [...realStories, ...groupStories];
        return res.json({ success: true, data: combined });
      }

      // Proxy unhandled action fallback to PHP server on port 8005
      console.log(`[Proxy] Routing unhandled action '${action}' (path: ${req.path}) to PHP server on port 8005...`);
      
      const phpUrl = new URL(`http://127.0.0.1:8005${req.path === '/' || req.path === '' ? '/index.php' : req.path}`);
      
      // Copy query parameters
      for (const [k, v] of Object.entries(req.query)) {
        if (v !== undefined) {
          phpUrl.searchParams.set(k, String(v));
        }
      }

      // Copy and translate headers
      const headersStr: Record<string, string> = {};
      for (const [k, v] of Object.entries(req.headers)) {
        if (v !== undefined) {
          const lowerKey = k.toLowerCase();
          // Filter out problematic headers that node-fetch / native-fetch auto-populate
          if (['host', 'content-length', 'connection', 'accept-encoding'].includes(lowerKey)) {
            continue;
          }
          headersStr[k] = String(v);
        }
      }
      headersStr['host'] = '127.0.0.1:8005';

      let body: any = null;
      const contentType = req.headers['content-type'] || '';

      if (req.method === 'POST') {
        if (contentType.includes('application/json')) {
          body = JSON.stringify(req.body);
        } else if (contentType.includes('application/x-www-form-urlencoded')) {
          const params = new URLSearchParams();
          for (const [k, v] of Object.entries(req.body)) {
            params.set(k, String(v));
          }
          body = params.toString();
        } else if (req.files || contentType.includes('multipart/form-data')) {
          const form = new FormData();
          
          if (req.body) {
            for (const [k, v] of Object.entries(req.body)) {
              if (v !== undefined) {
                form.append(k, String(v));
              }
            }
          }
          
          if (req.files) {
            for (const fieldName of Object.keys(req.files)) {
              const fileList = req.files[fieldName];
              if (Array.isArray(fileList)) {
                for (const f of fileList) {
                  const blob = new Blob([fs.readFileSync(f.path)], { type: f.mimetype });
                  form.append(fieldName, blob, f.originalname);
                }
              }
            }
          }
          
          body = form;
          // Native fetch handles multipart content-type boundary decoration if body is a FormData instance
        } else {
          body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
        }
      }

      const phpResponse = await fetch(phpUrl.toString(), {
        method: req.method,
        headers: headersStr,
        body: body,
      });

      const responseText = await phpResponse.text();
      const respContentType = phpResponse.headers.get('content-type') || '';

      res.status(phpResponse.status);
      res.setHeader('content-type', respContentType);
      return res.send(responseText);

    } catch (err: any) {
      console.error("Node API Error:", err);
      // Ensure we return JSON always
      return res.status(200).json({ success: false, error: err.message });
    }
  });

  // 4. Catch-all for any other /api requests that didn't match the main handler
  app.use("/api", (req, res) => {
    res.json({ success: false, error: `Route ${req.path} not found in Node API` });
  });

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
