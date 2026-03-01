<?php
/**
 * UTILS - CORE FUNCTIONS V19.5 (Synology Path Detection & Streaming)
 */

function write_log($msg, $level = 'INFO') {
    $date = date('Y-m-d H:i:s');
    $line = "[$date] [$level] $msg" . PHP_EOL;
    file_put_contents('transcode_log.txt', $line, FILE_APPEND);
}

function get_ffmpeg_binaries($pdo) {
    $stmt = $pdo->query("SELECT ffmpegPath FROM system_settings WHERE id = 1");
    $custom = $stmt->fetchColumn();
    
    $ffmpeg = $custom ?: 'ffmpeg';
    $ffprobe = str_replace('ffmpeg', 'ffprobe', $ffmpeg);
    
    // Si es Synology y no hay ruta custom, probar rutas comunes
    if ($ffmpeg === 'ffmpeg' && PHP_OS === 'Linux') {
        $synoPaths = ['/usr/bin/ffmpeg', '/bin/ffmpeg', '/usr/local/bin/ffmpeg'];
        foreach ($synoPaths as $p) {
            if (@is_executable($p)) { $ffmpeg = $p; $ffprobe = str_replace('ffmpeg', 'ffprobe', $p); break; }
        }
    }
    
    return ['ffmpeg' => $ffmpeg, 'ffprobe' => $ffprobe];
}

function get_media_duration($path, $ffprobe) {
    $cmd = "$ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 " . escapeshellarg($path);
    $duration = shell_exec($cmd);
    return floatval($duration);
}

function fix_url($url) {
    if (!$url) return null;
    if (strpos($url, 'http') === 0) return $url;
    // Si empieza por api/, quitarlo para que el front lo maneje relativo a la base
    return $url;
}

function resolve_video_path($url) {
    // Si es una URL absoluta de otro servidor, no podemos resolverla localmente
    if (strpos($url, 'http') === 0) return null;
    
    // Si la ruta es relativa a la API (empieza por api/uploads)
    if (strpos($url, 'api/') === 0) {
        return __DIR__ . '/' . substr($url, 4);
    }
    
    // Si es una ruta absoluta del sistema (NAS/Synology)
    if (file_exists($url)) return $url;
    
    return null;
}

function streamVideo($id, $pdo) {
    $stmt = $pdo->prepare("SELECT videoUrl, title FROM videos WHERE id = ?");
    $stmt->execute([$id]);
    $video = $stmt->fetch();
    
    if (!$video) { header("HTTP/1.1 404 Not Found"); exit; }
    
    $path = resolve_video_path($video['videoUrl']);
    
    if (!$path || !file_exists($path)) {
        header("HTTP/1.1 404 Not Found");
        echo "Archivo no encontrado en el servidor: " . $video['videoUrl'];
        exit;
    }

    $size = filesize($path);
    $fm = @fopen($path, 'rb');
    if (!$fm) { header("HTTP/1.1 500 Internal Server Error"); exit; }

    $begin = 0;
    $end = $size - 1;

    if (isset($_SERVER['HTTP_RANGE'])) {
        if (preg_match('/bytes=\h*(\d+)-(\d*)[\D.*]?/i', $_SERVER['HTTP_RANGE'], $matches)) {
            $begin = intval($matches[1]);
            if (!empty($matches[2])) $end = intval($matches[2]);
        }
    }

    if (isset($_SERVER['HTTP_RANGE'])) {
        header('HTTP/1.1 206 Partial Content');
    } else {
        header('HTTP/1.1 200 OK');
    }

    $mime = 'video/mp4';
    $ext = strtolower(pathinfo($path, PATHINFO_EXTENSION));
    if ($ext === 'mkv') $mime = 'video/x-matroska';
    if ($ext === 'mp3') $mime = 'audio/mpeg';

    header("Content-Type: $mime");
    header('Accept-Ranges: bytes');
    header("Content-Range: bytes $begin-$end/$size");
    header("Content-Length: " . ($end - $begin + 1));
    header("Content-Disposition: inline; filename=\"" . basename($path) . "\"");
    header("Cache-Control: no-cache");

    fseek($fm, $begin);
    $cur = $begin;
    while (!feof($fm) && $cur <= $end && (connection_status() == 0)) {
        print fread($fm, min(1024 * 16, ($end - $cur) + 1));
        $cur += 1024 * 16;
        flush();
    }
    fclose($fm);
    exit;
}
