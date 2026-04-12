<?php
/**
 * UTILS - CORE FUNCTIONS V19.5 (Synology Path Detection & Streaming)
 */

function write_log($msg, $level = 'INFO') {
    $date = date('Y-m-d H:i:s');
    $line = "[$date] [$level] $msg" . PHP_EOL;
    file_put_contents('transcode_log.txt', $line, FILE_APPEND);
}

function get_system_settings($pdo) {
    static $settings = null;
    if ($settings === null) {
        $stmt = $pdo->query("SELECT * FROM system_settings WHERE id = 1");
        $settings = $stmt->fetch(PDO::FETCH_ASSOC);
    }
    return $settings;
}

function get_ffmpeg_binaries($pdo) {
    $stmt = $pdo->query("SELECT ffmpegPath FROM system_settings WHERE id = 1");
    $savedPath = $stmt->fetchColumn();
    
    // Rutas candidatas para Synology y sistemas Linux comunes
    $ffmpegCandidates = [
        $savedPath,
        '/usr/bin/ffmpeg',
        '/usr/local/bin/ffmpeg',
        '/volume1/@appstore/VideoStation/bin/ffmpeg',
        '/volume1/@appstore/ffmpeg/bin/ffmpeg',
        'ffmpeg'
    ];
    
    $ffprobeCandidates = [
        str_replace('ffmpeg', 'ffprobe', $savedPath),
        '/usr/bin/ffprobe',
        '/usr/local/bin/ffprobe',
        '/volume1/@appstore/VideoStation/bin/ffprobe',
        '/volume1/@appstore/ffmpeg/bin/ffprobe',
        '/volume1/@appstore/ffprobe/bin/ffprobe',
        'ffprobe'
    ];

    $finalFfmpeg = 'ffmpeg';
    foreach (array_unique(array_filter($ffmpegCandidates)) as $cmd) {
        $out = @shell_exec("$cmd -version 2>&1");
        if ($out && strpos($out, 'ffmpeg version') !== false) {
            $finalFfmpeg = $cmd;
            break;
        }
    }

    $finalFfprobe = 'ffprobe';
    foreach (array_unique(array_filter($ffprobeCandidates)) as $cmd) {
        $out = @shell_exec("$cmd -version 2>&1");
        if ($out && strpos($out, 'ffprobe version') !== false) {
            $finalFfprobe = $cmd;
            break;
        }
    }

    return ['ffmpeg' => $finalFfmpeg, 'ffprobe' => $finalFfprobe];
}

function get_media_duration($path, $ffprobe) {
    // 1. Intentar obtener duración del formato (más rápido)
    $cmd = "$ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 " . escapeshellarg($path);
    $duration = trim(shell_exec($cmd) ?? '');
    
    if (floatval($duration) > 0) return floatval($duration);

    // 2. Intentar obtener duración del stream de audio (común en MP3)
    $cmd = "$ffprobe -v error -select_streams a:0 -show_entries stream=duration -of default=noprint_wrappers=1:nokey=1 " . escapeshellarg($path);
    $duration = trim(shell_exec($cmd) ?? '');
    
    if (floatval($duration) > 0) return floatval($duration);

    // 3. Intentar obtener duración del stream de video
    $cmd = "$ffprobe -v error -select_streams v:0 -show_entries stream=duration -of default=noprint_wrappers=1:nokey=1 " . escapeshellarg($path);
    $duration = trim(shell_exec($cmd) ?? '');
    
    $val = floatval($duration);
    if ($val <= 0) {
        write_log("FFPROBE Error: No se pudo obtener duración para $path. Comando: $cmd", 'ERROR');
    }
    return $val;
}

function fix_url($url) {
    if (!$url) return null;
    if (strpos($url, 'http') === 0) return $url;
    // Si ya tiene el prefijo api/, asegurar que sea absoluto desde la raíz
    if (strpos($url, 'api/') === 0) return '/' . $url;
    // Si es una ruta relativa a uploads, añadir /api/
    if (strpos($url, 'uploads/') === 0) return '/api/' . $url;
    return $url;
}

function resolve_video_path($url) {
    if (!$url) return null;
    
    // Si es una URL absoluta de otro servidor, no podemos resolverla localmente
    if (strpos($url, 'http') === 0) return null;
    
    // Normalizar separadores de ruta
    $url = str_replace('\\', '/', $url);
    
    // Si la ruta es relativa a la API (empieza por api/uploads o simplemente uploads)
    if (strpos($url, 'api/') === 0) {
        $cleanUrl = substr($url, 4);
        $path = __DIR__ . '/' . $cleanUrl;
        if (file_exists($path)) return $path;
    }
    
    // Intentar resolver relativo al directorio de la API (donde están los uploads)
    $apiPath = __DIR__ . '/' . ltrim($url, '/');
    if (file_exists($apiPath) && !is_dir($apiPath)) return $apiPath;

    // Si es una ruta absoluta del sistema (NAS/Synology)
    if (file_exists($url) && !is_dir($url)) return $url;
    
    // Intentar resolver rutas relativas al directorio raíz del proyecto
    $rootPath = dirname(__DIR__) . '/' . ltrim($url, '/');
    if (file_exists($rootPath) && !is_dir($rootPath)) return $rootPath;
    
    return null;
}

function streamSubtitle($id, $ext, $pdo) {
    while (ob_get_level()) ob_end_clean();
    
    $stmt = $pdo->prepare("SELECT videoUrl FROM videos WHERE id = ?");
    $stmt->execute([$id]);
    $video = $stmt->fetch();
    if (!$video) { header("HTTP/1.1 404 Not Found"); exit; }

    $inputPath = resolve_video_path($video['videoUrl']);
    if (!$inputPath) { header("HTTP/1.1 404 Not Found"); exit; }

    $basePath = preg_replace('/\.[^.]+$/', '', $inputPath);
    $subFile = $basePath . '.' . $ext;

    if (!file_exists($subFile)) { header("HTTP/1.1 404 Not Found"); exit; }

    header("Access-Control-Allow-Origin: *");
    header("Content-Type: text/vtt");
    
    $content = file_get_contents($subFile);
    
    if ($ext === 'srt') {
        // Conversión básica de SRT a VTT
        $vtt = "WEBVTT\n\n" . preg_replace('/(\d{2}:\d{2}:\d{2}),(\d{3})/', '$1.$2', $content);
        echo $vtt;
    } else {
        echo $content;
    }
    exit;
}

function streamVideo($id, $pdo) {
    // Limpiar cualquier salida previa para evitar corrupción del stream
    while (ob_get_level()) ob_end_clean();
    
    // Aumentar límites para archivos grandes
    set_time_limit(0);
    ignore_user_abort(true);

    // CORS Headers for APK/Webview
    header("Access-Control-Allow-Origin: *");
    header("Access-Control-Allow-Methods: GET, OPTIONS");
    header("Access-Control-Allow-Headers: Content-Type, Authorization, Range, X-Requested-With");
    header("Access-Control-Expose-Headers: Content-Range, Content-Length, Accept-Ranges, Content-Disposition");

    if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
        exit;
    }

    $stmt = $pdo->prepare("SELECT v.videoUrl, v.title, v.price, v.creatorId, u.role as creatorRole FROM videos v LEFT JOIN users u ON v.creatorId = u.id WHERE v.id = ?");
    $stmt->execute([$id]);
    $video = $stmt->fetch();
    
    if (!$video) { 
        write_log("Stream Error: Video ID $id not found", 'ERROR');
        header("HTTP/1.1 404 Not Found"); 
        exit; 
    }

    // Basic Auth Check for streaming/downloading
    $token = $_GET['token'] ?? '';
    if (empty($token)) {
        $authHeader = $_SERVER['HTTP_AUTHORIZATION'] ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '';
        if (preg_match('/Bearer\s+(.*)$/i', $authHeader, $matches)) {
            $token = $matches[1];
        }
    }
    
    $isUnlocked = false;
    $uid = 'GUEST';
    if (!empty($token)) {
        $stmtU = $pdo->prepare("SELECT id, role, vipExpiry FROM users WHERE currentSessionId = ?");
        $stmtU->execute([$token]);
        $user = $stmtU->fetch();
        if ($user) {
            $uid = $user['id'];
            $isAdmin = trim(strtoupper($user['role'])) === 'ADMIN';
            $isVip = $user['vipExpiry'] && $user['vipExpiry'] > time();
            
            // Check purchase
            $stmtP = $pdo->prepare("SELECT 1 FROM transactions WHERE buyerId = ? AND videoId = ? AND type = 'PURCHASE'");
            $stmtP->execute([$uid, $id]);
            $hasPurchased = $stmtP->fetchColumn();
            
            // Requisitos: Propietario, Admin, VIP (Acceso Total), Compra o Gratis
            if ($hasPurchased || $isAdmin || $isVip || $uid === $video['creatorId'] || floatval($video['price']) <= 0) {
                $isUnlocked = true;
            }
        } else {
            // Si el token es inválido pero el video es gratis, permitir
            if (floatval($video['price']) <= 0) {
                $isUnlocked = true;
            } else {
                write_log("Stream Auth: Token invalid or expired: " . substr($token, 0, 10) . "...", 'WARNING');
            }
        }
    } else {
        // No hay token. Permitir si es gratis.
        if (floatval($video['price']) <= 0) {
            $isUnlocked = true;
        } else {
            write_log("Stream Auth: No token provided for video $id", 'WARNING');
        }
    }

    if (!$isUnlocked) {
        write_log("Stream Access Denied: User $uid for video $id", 'WARNING');
        header("HTTP/1.1 403 Forbidden");
        echo "Acceso denegado. Debes comprar el contenido o tener una suscripción activa.";
        exit;
    }
    
    write_log("Stream Access Granted: User $uid for video $id (Path: " . basename($video['videoUrl']) . ")", 'INFO');
    
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

    // Desactivar compresión para el stream
    if (function_exists('apache_setenv')) {
        @apache_setenv('no-gzip', 1);
    }
    @ini_set('zlib.output_compression', 'Off');

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
        'aac' => 'audio/aac',
        'jpg' => 'image/jpeg',
        'jpeg' => 'image/jpeg',
        'png' => 'image/png',
        'webp' => 'image/webp',
        'gif' => 'image/gif',
        'bmp' => 'image/bmp',
        'svg' => 'image/svg+xml'
    ];
    
    if (isset($_GET['download'])) {
        $mime = 'application/octet-stream';
        header("Content-Description: File Transfer");
    } else {
        if (isset($mimes[$ext])) $mime = $mimes[$ext];
    }

    header("Content-Type: $mime");
    header('Accept-Ranges: bytes');
    header("X-Content-Type-Options: nosniff");
    
    if (isset($_SERVER['HTTP_RANGE'])) {
        header("Content-Range: bytes $begin-$end/$size");
    }
    header("Content-Length: " . ($end - $begin + 1));
    
    // Si se solicita descarga, usar el título del video como nombre de archivo si es posible
    $isDownload = isset($_GET['download']);
    $disposition = $isDownload ? 'attachment' : 'inline';
    
    // Prioridad al nombre enviado por el front, si no, usar el título del video
    $rawName = $_GET['filename'] ?? $video['title'] ?? 'video';
    // Permitir puntos en el nombre pero limpiar otros caracteres raros
    $cleanTitle = preg_replace('/[^A-Za-z0-9_\-\.]/', '_', $rawName);
    
    // Limitar longitud del nombre para evitar errores de sistema de archivos (max 100 chars)
    if (strlen($cleanTitle) > 100) {
        $cleanTitle = substr($cleanTitle, 0, 100);
    }
    
    $downloadName = $cleanTitle;
    // Asegurar que tenga la extensión correcta si no la tiene
    if (strpos($downloadName, '.') === false) {
        $downloadName .= '.' . $ext;
    }
    
    // RFC 6266 compatible Content-Disposition
    header("Content-Disposition: $disposition; filename=\"$downloadName\"; filename*=UTF-8''" . rawurlencode($downloadName));
    header("Cache-Control: no-cache, must-revalidate");
    header("Pragma: public");
    header("Expires: 0");
    
    if ($isDownload) {
        header("Content-Transfer-Encoding: binary");
        // Algunos gestores de descarga prefieren el MIME real incluso en descargas
        if ($mime === 'application/octet-stream' && isset($mimes[$ext])) {
            $mime = $mimes[$ext];
            header("Content-Type: $mime");
        }
    }

    fseek($fm, $begin);
    $cur = $begin;
    while (!feof($fm) && $cur <= $end && (connection_status() == 0)) {
        $chunkSize = 1024 * 128; // Aumentar tamaño de chunk a 128KB para mejor rendimiento
        $data = fread($fm, min($chunkSize, ($end - $cur) + 1));
        if ($data === false) break;
        echo $data;
        $cur += strlen($data);
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
    if (preg_match('/StreamPayAPK\/([\d\.]+)/i', $ua, $m)) {
        $browser = "App (StreamPay v" . $m[1] . ")";
    } elseif (preg_match('/StreamPayAPK/i', $ua)) {
        $browser = "App (StreamPay)";
    } elseif (preg_match('/chrome/i', $ua) && !preg_match('/edge|opr|opera/i', $ua)) {
        $browser = "Chrome";
    } elseif (preg_match('/safari/i', $ua) && !preg_match('/chrome/i', $ua)) {
        $browser = "Safari";
    }
    elseif (preg_match('/firefox/i', $ua)) $browser = "Firefox";
    elseif (preg_match('/edge/i', $ua)) $browser = "Edge";
    elseif (preg_match('/opera|opr/i', $ua)) $browser = "Opera";
    
    // Detección de APK / WebView (común en apps Android)
    $requestedWith = $_SERVER['HTTP_X_REQUESTED_WITH'] ?? $_SERVER['HTTP_X_APP_PACKAGE'] ?? '';
    if (!empty($requestedWith) && !in_array($requestedWith, ['com.android.browser', 'com.android.chrome', 'org.mozilla.firefox', 'com.google.android.apps.maps'])) {
        // Si ya detectamos StreamPay con versión, no lo sobreescribimos totalmente
        if (strpos($browser, 'StreamPay') === false) {
            $browser = "App ($requestedWith)";
        } else {
            $browser .= " ($requestedWith)";
        }
    } elseif (preg_match('/wv|webview|crosswalk/i', $ua)) {
        $browser = "App (WebView)";
    }
    
    return "$os - $browser";
}
