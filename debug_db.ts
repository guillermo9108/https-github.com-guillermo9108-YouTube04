import mysql from 'mysql2/promise';
import fs from 'fs';

async function check() {
    const config = JSON.parse(fs.readFileSync('api/db_config.json', 'utf8'));
    const connection = await mysql.createConnection({
        host: config.host,
        user: config.user,
        password: config.password,
        database: config.name,
        port: config.port
    });

    try {
        const [settings] = await connection.execute('SELECT localLibraryPath, libraryPaths FROM system_settings WHERE id = 1');
        console.log('SETTINGS:', JSON.stringify(settings, null, 2));

        const [active] = await connection.execute('SELECT * FROM active_transcodes');
        console.log('ACTIVE_TRANSCODES:', JSON.stringify(active, null, 2));

        const [lastVideos] = await connection.execute('SELECT id, title, videoUrl, transcode_status FROM videos ORDER BY createdAt DESC LIMIT 5');
        console.log('LAST_VIDEOS:', JSON.stringify(lastVideos, null, 2));

    } finally {
        await connection.end();
    }
}

check().catch(console.error);
