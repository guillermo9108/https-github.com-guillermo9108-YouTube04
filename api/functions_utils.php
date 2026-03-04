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
    // Si empieza por api/, hacerlo absoluto desde la raíz para evitar problemas de rutas relativas en el front
    if (strpos($url, 'api/') === 0) return '/' . $url;
    return $url;
}

function resolve_video_path($url) {
    if (!$url) return null;
    
    // Si es una URL absoluta de otro servidor, no podemos resolverla localmente
    if (strpos($url, 'http') === 0) return null;
    
    // Normalizar separadores de ruta
    $url = str_replace('\\', '/', $url);
    
    // Si la ruta es relativa a la API (empieza por api/uploads)
    if (strpos($url, 'api/') === 0) {
        $cleanUrl = substr($url, 4);
        $path = __DIR__ . '/' . $cleanUrl;
        if (file_exists($path)) return $path;
        
        // Intentar también en el nivel superior si la estructura es distinta
        $pathParent = dirname(__DIR__) . '/' . $cleanUrl;
        if (file_exists($pathParent)) return $pathParent;
    }
    
    // Si es una ruta absoluta del sistema (NAS/Synology)
    if (file_exists($url)) return $url;
    
    // Intentar resolver rutas relativas al directorio raíz del proyecto
    $rootPath = dirname(__DIR__) . '/' . ltrim($url, '/');
    if (file_exists($rootPath)) return $rootPath;
    
    return null;
}

function streamVideo($id, $pdo) {
    // CORS Headers for APK/Webview
    header("Access-Control-Allow-Origin: *");
    header("Access-Control-Allow-Methods: GET, OPTIONS");
    header("Access-Control-Allow-Headers: Content-Type, Authorization, Range");
    header("Access-Control-Expose-Headers: Content-Range, Content-Length, Accept-Ranges");

    if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
        exit;
    }

    $stmt = $pdo->prepare("SELECT videoUrl, title, price, creatorId, creatorRole FROM videos WHERE id = ?");
    $stmt->execute([$id]);
    $video = $stmt->fetch();
    
    if (!$video) { 
        write_log("Stream Error: Video ID $id not found", 'ERROR');
        header("HTTP/1.1 404 Not Found"); 
        exit; 
    }

    // Basic Auth Check for streaming/downloading
    $token = $_GET['token'] ?? '';
    $isUnlocked = false;
    if (!empty($token)) {
        $stmtU = $pdo->prepare("SELECT id, role, vipExpiry FROM users WHERE currentSessionId = ?");
        $stmtU->execute([$token]);
        $user = $stmtU->fetch();
        if ($user) {
            $uid = $user['id'];
            $isAdmin = trim(strtoupper($user['role'])) === 'ADMIN';
            $isVip = $user['vipExpiry'] && $user['vipExpiry'] > time();
            
            // Check purchase
            $stmtP = $pdo->prepare("SELECT 1 FROM purchases WHERE userId = ? AND videoId = ?");
            $stmtP->execute([$uid, $id]);
            $hasPurchased = $stmtP->fetchColumn();
            
            // Requisitos: Propietario, Admin, VIP (Acceso Total) o Compra
            if ($hasPurchased || $isAdmin || $isVip || $uid === $video['creatorId']) {
                $isUnlocked = true;
            }
        }
    }

    if (!$isUnlocked) {
        header("HTTP/1.1 403 Forbidden");
        echo "Acceso denegado. Debes comprar el contenido o tener una suscripción activa.";
        exit;
    }
    
    $path = resolve_video_path($video['videoUrl']);
    
    if (!$path || !file_exists($path)) {
        write_log("Stream Error: File not found for video $id. Path: " . ($path ?: 'NULL') . " Original: " . $video['videoUrl'], 'ERROR');
        header("HTTP/1.1 404 Not Found");
        echo "Archivo no encontrado en el servidor: " . $video['videoUrl'];
        exit;
    }

    // Check if it's a directory (should not happen but for safety)
    if (is_dir($path)) {
        write_log("Stream Error: Path is a directory for video $id. Path: $path", 'ERROR');
        header("HTTP/1.1 403 Forbidden");
        exit;
    }

    $size = filesize($path);
    $fm = @fopen($path, 'rb');
    if (!$fm) { 
        write_log("Stream Error: Could not open file for video $id. Path: $path", 'ERROR');
        header("HTTP/1.1 500 Internal Server Error"); 
        exit; 
    }

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
    $mimes = [
        'mp4' => 'video/mp4',
        'mkv' => 'video/x-matroska',
        'webm' => 'video/webm',
        'avi' => 'video/x-msvideo',
        'mov' => 'video/quicktime',
        'mp3' => 'audio/mpeg',
        'wav' => 'audio/wav',
        'flac' => 'audio/flac',
        'm4a' => 'audio/mp4',
        'aac' => 'audio/aac'
    ];
    if (isset($mimes[$ext])) $mime = $mimes[$ext];

    header("Content-Type: $mime");
    header('Accept-Ranges: bytes');
    header("X-Content-Type-Options: nosniff");
    
    if (isset($_SERVER['HTTP_RANGE'])) {
        header("Content-Range: bytes $begin-$end/$size");
    }
    header("Content-Length: " . ($end - $begin + 1));
    
    // Si se solicita descarga, usar el título del video como nombre de archivo si es posible
    $disposition = isset($_GET['download']) ? 'attachment' : 'inline';
    $cleanTitle = preg_replace('/[^A-Za-z0-9_\-]/', '_', $video['title'] ?: 'video');
    $downloadName = $cleanTitle . '.' . $ext;
    
    header("Content-Disposition: $disposition; filename=\"$downloadName\"");
    header("Cache-Control: no-cache, must-revalidate");
    header("Pragma: public");
    header("Expires: 0");
    if (isset($_GET['download'])) {
        header("Content-Transfer-Encoding: binary");
    }

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

function parse_user_agent($ua) {
    if (empty($ua)) return "Desconocido";
    
    $os = "Desconocido";
    if (preg_match('/android/i', $ua)) $os = "Android";
    elseif (preg_match('/iphone|ipad|ipod/i', $ua)) $os = "iOS";
    elseif (preg_match('/windows/i', $ua)) $os = "Windows";
    elseif (preg_match('/macintosh|mac os x/i', $ua)) $os = "macOS";
    elseif (preg_match('/linux/i', $ua)) $os = "Linux";

    $browser = "Navegador";
    if (preg_match('/chrome/i', $ua) && !preg_match('/edge|opr|opera/i', $ua)) $browser = "Chrome";
    elseif (preg_match('/safari/i', $ua) && !preg_match('/chrome/i', $ua)) $browser = "Safari";
    elseif (preg_match('/firefox/i', $ua)) $browser = "Firefox";
    elseif (preg_match('/edge/i', $ua)) $browser = "Edge";
    elseif (preg_match('/opera|opr/i', $ua)) $browser = "Opera";
    
    // Detección de APK / WebView (común en apps Android)
    $requestedWith = $_SERVER['HTTP_X_REQUESTED_WITH'] ?? $_SERVER['HTTP_X_APP_PACKAGE'] ?? '';
    if (!empty($requestedWith) && !in_array($requestedWith, ['com.android.browser', 'com.android.chrome', 'org.mozilla.firefox', 'com.google.android.apps.maps'])) {
        $browser = "App ($requestedWith)";
    } elseif (preg_match('/wv|webview|crosswalk/i', $ua)) {
        $browser = "App (WebView)";
    }
    
    return "$os - $browser";
}
