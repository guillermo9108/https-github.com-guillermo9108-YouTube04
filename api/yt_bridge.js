
/**
 * StreamPay YouTube Bridge
 * Uses yt-search and ytdl-core to provide data to PHP
 */
const ytSearch = require('yt-search');
const ytdl = require('@distube/ytdl-core');

const action = process.argv[2];
const query = process.argv[3];

async function run() {
    try {
        if (action === 'search') {
            const r = await ytSearch(query);
            const videos = r.videos.slice(0, 15).map(v => ({
                id: v.videoId,
                title: v.title,
                thumbnail: v.thumbnail,
                downloadUrl: v.url, // Usamos la URL original para procesarla luego
                source: 'YouTube',
                author: v.author.name,
                duration: v.seconds
            }));
            console.log(JSON.stringify(videos));
        } 
        else if (action === 'get_url') {
            // Obtiene la URL de descarga directa (formato mp4 con audio)
            const info = await ytdl.getInfo(query);
            const format = ytdl.chooseFormat(info.formats, { 
                quality: 'highestvideo', 
                filter: f => f.container === 'mp4' && f.hasAudio && f.hasVideo 
            });
            
            if (format) {
                console.log(JSON.stringify({ url: format.url, title: info.videoDetails.title }));
            } else {
                // Fallback a cualquier formato mp4 si el óptimo falla
                const fallback = info.formats.find(f => f.container === 'mp4' && f.hasAudio);
                console.log(JSON.stringify({ url: fallback ? fallback.url : null }));
            }
        }
    } catch (e) {
        console.error(JSON.stringify({ error: e.message }));
        process.exit(1);
    }
}

run();
