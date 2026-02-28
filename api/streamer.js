const express = require('express');
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const cors = require('cors');

const app = express();
app.use(cors({
    origin: '*',
    methods: ['GET', 'HEAD', 'OPTIONS'],
    allowedHeaders: ['Range', 'Authorization', 'Content-Type', 'Accept'],
    exposedHeaders: ['Content-Length', 'Content-Range', 'Accept-Ranges', 'Content-Type']
}));

// Cargar configuración de base de datos desde el archivo de PHP
// Se espera que esté en /volume1/web/api/db_config.json
const dbConfigPath = path.join(__dirname, 'db_config.json');
let dbConfig;
try {
    dbConfig = JSON.parse(fs.readFileSync(dbConfigPath, 'utf8'));
} catch (e) {
    console.error("No se pudo leer db_config.json. Ejecuta el Setup primero.");
    process.exit(1);
}

const pool = mysql.createPool({
    host: dbConfig.host,
    user: dbConfig.user,
    password: dbConfig.password,
    database: dbConfig.name,
    port: dbConfig.port || 3306,
    waitForConnections: true,
    connectionLimit: 10
});

// Mapa de MIME types
const mimeTypes = {
    'mp4': 'video/mp4',
    'm4v': 'video/mp4',
    'mkv': 'video/x-matroska',
    'webm': 'video/webm',
    'avi': 'video/x-msvideo',
    'mov': 'video/quicktime',
    'wmv': 'video/x-ms-wmv',
    'flv': 'video/x-flv',
    'ogv': 'video/ogg',
    'mp3': 'audio/mpeg',
    'wav': 'audio/wav',
    'm4a': 'audio/mp4',
    'aac': 'audio/aac',
    'ogg': 'audio/ogg',
    'flac': 'audio/flac',
    'wma': 'audio/x-ms-wma'
};

// Función para resolver la ruta del archivo
function resolveFilePath(videoUrl, localLibraryPath) {
    let filePath = videoUrl;
    
    // Si es una ruta absoluta y existe
    if (fs.existsSync(filePath)) return filePath;
    
    // Si es relativa a la API
    if (filePath.startsWith('api/')) {
        filePath = filePath.replace('api/', '');
    }
    
    // Intentar desde el directorio actual
    let possiblePath = path.join(__dirname, filePath);
    if (fs.existsSync(possiblePath)) return possiblePath;
    
    // Intentar desde la librería local configurada
    if (localLibraryPath) {
        possiblePath = path.join(localLibraryPath, filePath);
        if (fs.existsSync(possiblePath)) return possiblePath;
    }
    
    // Intentar la ruta original
    if (fs.existsSync(videoUrl)) return videoUrl;
    
    return null;
}

app.get('/video', async (req, res) => {
    const { id, token } = req.query;

    if (!id || !token) return res.status(400).send("Faltan parámetros (id y token requeridos)");

    try {
        // 1. Validar Usuario y Sesión mediante el token de PHP
        const [users] = await pool.execute(
            'SELECT id, role, vipExpiry FROM users WHERE currentSessionId = ?',
            [token]
        );

        if (users.length === 0) return res.status(401).send("Sesión inválida o expirada");
        const user = users[0];

        // 2. Obtener ruta del video, configuración del sistema y rol del creador
        const [[videos], [settings]] = await Promise.all([
            pool.execute(
                'SELECT v.videoUrl, v.creatorId, u.role as creatorRole FROM videos v LEFT JOIN users u ON v.creatorId = u.id WHERE v.id = ?',
                [id]
            ),
            pool.execute('SELECT localLibraryPath FROM system_settings WHERE id = 1')
        ]);

        if (videos.length === 0) return res.status(404).send("Video no encontrado en la base de datos");
        const video = videos[0];
        const localLibraryPath = settings.length > 0 ? settings[0].localLibraryPath : null;

        // 3. Validar Permiso de acceso (Admin, Dueño, VIP o Compra)
        const isAdmin = user.role && user.role.trim().toUpperCase() === 'ADMIN';
        const isOwner = user.id === video.creatorId;
        const isVipActive = user.vipExpiry && (user.vipExpiry > Math.floor(Date.now() / 1000));
        const isVipContent = video.creatorRole && video.creatorRole.trim().toUpperCase() === 'ADMIN';

        let hasAccess = isAdmin || isOwner || (isVipActive && isVipContent);

        if (!hasAccess) {
            const [purchase] = await pool.execute(
                'SELECT id FROM transactions WHERE buyerId = ? AND videoId = ? AND type = "PURCHASE"',
                [user.id, id]
            );
            if (purchase.length > 0) hasAccess = true;
        }

        if (!hasAccess) return res.status(403).send("No has pagado por este video");

        // 4. Resolver ruta física absoluta
        const filePath = resolveFilePath(video.videoUrl, localLibraryPath);

        if (!filePath) {
            console.error("Archivo no encontrado. URL original:", video.videoUrl);
            return res.status(404).send("Archivo físico no encontrado en el servidor");
        }

        const stat = fs.statSync(filePath);
        const fileSize = stat.size;
        
        if (fileSize === 0) {
            return res.status(404).send("Archivo vacío");
        }
        
        // Determinar MIME type
        const ext = path.extname(filePath).toLowerCase().replace('.', '');
        const contentType = mimeTypes[ext] || 'application/octet-stream';
        
        const range = req.headers.range;

        // 5. Streaming con soporte de Byte-Range (Adelantar/Retroceder)
        if (range) {
            const parts = range.replace(/bytes=/, "").split("-");
            const start = parseInt(parts[0], 10);
            const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
            
            // Validar rangos
            if (start > fileSize - 1 || end > fileSize - 1) {
                res.writeHead(416, {
                    'Content-Range': `bytes */${fileSize}`
                });
                return res.end();
            }
            
            const chunksize = (end - start) + 1;
            const file = fs.createReadStream(filePath, { start, end });
            const head = {
                'Content-Range': `bytes ${start}-${end}/${fileSize}`,
                'Accept-Ranges': 'bytes',
                'Content-Length': chunksize,
                'Content-Type': contentType,
                'Cache-Control': 'no-cache, no-store, must-revalidate',
                'Pragma': 'no-cache',
                'Expires': '0'
            };
            res.writeHead(206, head);
            file.pipe(res);
        } else {
            const head = {
                'Content-Length': fileSize,
                'Content-Type': contentType,
                'Accept-Ranges': 'bytes',
                'Cache-Control': 'no-cache, no-store, must-revalidate',
                'Pragma': 'no-cache',
                'Expires': '0'
            };
            res.writeHead(200, head);
            fs.createReadStream(filePath).pipe(res);
        }

    } catch (error) {
        console.error("Streaming Error:", error);
        res.status(500).send("Error interno del motor de streaming: " + error.message);
    }
});

// Endpoint de health check
app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

const PORT = process.env.STREAMER_PORT || 3001;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`StreamPay Engine Activo en puerto ${PORT}`);
    console.log(`Listo para procesar streaming offline.`);
    console.log(`Health check: http://localhost:${PORT}/health`);
});