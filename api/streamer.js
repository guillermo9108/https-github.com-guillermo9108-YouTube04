const express = require('express');
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const cors = require('cors');

const app = express();
app.use(cors());

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

app.get('/video', async (req, res) => {
    const { id, token } = req.query;

    if (!id || !token) return res.status(400).send("Faltan parámetros");

    try {
        // 1. Validar Usuario y Sesión mediante el token de PHP
        const [users] = await pool.execute(
            'SELECT id, role, vipExpiry FROM users WHERE currentSessionId = ?',
            [token]
        );

        if (users.length === 0) return res.status(401).send("Sesión inválida");
        const user = users[0];

        // 2. Obtener ruta del video y rol del creador
        const [videos] = await pool.execute(
            'SELECT v.videoUrl, v.creatorId, u.role as creatorRole FROM videos v LEFT JOIN users u ON v.creatorId = u.id WHERE v.id = ?',
            [id]
        );

        if (videos.length === 0) return res.status(404).send("Video no encontrado");
        const video = videos[0];

        // 3. Validar Permiso de acceso (Admin, Dueño, VIP o Compra)
        const isAdmin = user.role.trim().toUpperCase() === 'ADMIN';
        const isOwner = user.id === video.creatorId;
        const isVipActive = user.vipExpiry && (user.vipExpiry > Math.floor(Date.now() / 1000));
        const isVipContent = video.creatorRole === 'ADMIN';

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
        let filePath = video.videoUrl;
        
        // Si la ruta es relativa a la web, intentar resolverla
        if (!fs.existsSync(filePath)) {
            const possiblePath = path.join(__dirname, filePath.replace('api/', ''));
            if (fs.existsSync(possiblePath)) filePath = possiblePath;
        }

        if (!fs.existsSync(filePath)) {
            console.error("Archivo no encontrado:", filePath);
            return res.status(404).send("Archivo físico no encontrado en el NAS");
        }

        const stat = fs.statSync(filePath);
        const fileSize = stat.size;
        const range = req.headers.range;

        // 5. Streaming con soporte de Byte-Range (Adelantar/Retroceder)
        if (range) {
            const parts = range.replace(/bytes=/, "").split("-");
            const start = parseInt(parts[0], 10);
            const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
            const chunksize = (end - start) + 1;
            const file = fs.createReadStream(filePath, { start, end });
            const head = {
                'Content-Range': `bytes ${start}-${end}/${fileSize}`,
                'Accept-Ranges': 'bytes',
                'Content-Length': chunksize,
                'Content-Type': 'video/mp4',
            };
            res.writeHead(206, head);
            file.pipe(res);
        } else {
            const head = {
                'Content-Length': fileSize,
                'Content-Type': 'video/mp4',
            };
            res.writeHead(200, head);
            fs.createReadStream(filePath).pipe(res);
        }

    } catch (error) {
        console.error("Streaming Error:", error);
        res.status(500).send("Error interno del motor de streaming");
    }
});

const PORT = 3001;
app.listen(PORT, '0.0.0.0', () => {
    console.log(`StreamPay Engine Activo en puerto ${PORT}`);
    console.log(`Listo para procesar streaming offline.`);
});