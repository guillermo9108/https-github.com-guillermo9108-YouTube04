<?php

/**
 * StreamPay - Utility Functions V12.0 (Synology Path Fix)
 * CORRECCIÓN: Mejorada resolución de rutas para NAS Synology
 */

/**
 * Detecta las rutas de ffmpeg y ffprobe basándose en los ajustes y rutas comunes de Synology/Linux.
 */
function get_ffmpeg_binaries($pdo) {
    $stmt = $pdo->query("SELECT ffmpegPath FROM system_settings WHERE id = 1");
    $adminFfmpeg = $stmt->fetchColumn();

    $ffmpeg = 'ffmpeg';
    $ffprobe = 'ffprobe';

    $search_ffmpeg = array_filter([
        $adminFfmpeg,
        '/volume1/@appstore/ffmpeg/bin/ffmpeg',
        '/volume1/@appstore/VideoStation/bin/ffmpeg',
        '/volume1/@appstore/MediaServer/bin/ffmpeg',
        '/usr/bin/ffmpeg',
        '/bin/ffmpeg'
    ]);

    foreach ($search_ffmpeg as $path) {
        if (@is_executable($path)) {
            $ffmpeg = $path;
            break;
        }
    }

    $nearby_ffprobe = dirname($ffmpeg) . DIRECTORY_SEPARATOR . 'ffprobe';
    if (@is_executable($nearby_ffprobe)) {
        $ffprobe = $nearby_ffprobe;
    } else {
        $search_ffprobe = [
            '/volume1/@appstore/ffmpeg/bin/ffprobe',
            '/volume1/@appstore/VideoStation/bin/ffprobe',
            '/volume1/@appstore/MediaServer/bin/ffprobe',
            '/usr/bin/ffprobe',
            '/bin/ffprobe'
        ];
        foreach ($search_ffprobe as $path) {
            if (@is_executable($path)) {
                $ffprobe = $path;
                break;
            }
        }
    }

    return ['ffmpeg' => $ffmpeg, 'ffprobe' => $ffprobe];
}

/**
 * Obtiene la duración de un archivo multimedia de forma robusta.
 */
function get_media_duration($realPath, $ffprobe) {
    $cmdProbe = "$ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 " . escapeshellarg($realPath) . " 2>&1";
    $durOutput = trim(shell_exec($cmdProbe));
    $duration = floatval($durOutput);

    if ($duration <= 0 || strpos($durOutput, 'N/A') !== false) {
        $cmdDeep = "$ffprobe -v error -select_streams v:0 -show_entries stream=duration -of default=noprint_wrappers=1:nokey=1 " . escapeshellarg($realPath) . " 2>&1";
        $deepOutput = trim(shell_exec($cmdDeep));

        if (floatval($deepOutput) <= 0) {
            $cmdDeep = "$ffprobe -v error -select_streams a:0 -show_entries stream=duration -of default=noprint_wrappers=1:nokey=1 " . escapeshellarg($realPath) . " 2>&1";
            $deepOutput = trim(shell_exec($cmdDeep));
        }
        $duration = floatval($deepOutput);
    }
    return $duration;
}

function smartParseFilename($fullPath, $existingCategory = null, $hierarchy = []) {
    $filename = pathinfo($fullPath, PATHINFO_FILENAME);
    $fullPathNormalized = str_replace('\\', '/', $fullPath);
    $pathParts = array_values(array_filter(explode('/', $fullPathNormalized)));

    $cleanText = function($txt) {
        $junk = ['/\b(1080p|720p|4k|x264|h264|bluray|web-dl|mkv|mp4)\b/i', '/\./', '/_/'];
        $t = $txt;
        foreach ($junk as $p) { $t = preg_replace($p, ' ', $t); }
        return trim(preg_replace('/\s+/', ' ', $t));
    };
    $cleanName = $cleanText($filename);

    $detectedCat = 'GENERAL';
    $detectedParent = null;
    $detectedCollection = null;

    $partsCount = count($pathParts);
    for ($i = $partsCount - 1; $i >= 0; $i--) {
        $segment = trim($pathParts[$i]);
        if (empty($segment) || $segment === basename($fullPath)) continue;
        foreach ($hierarchy as $cat) {
            if (strcasecmp($segment, $cat['name']) === 0) {
                $detectedCat = $cat['name'];
                if (!empty($cat['autoSub'])) {
                    if (isset($pathParts[$i + 1]) && $pathParts[$i + 1] !== basename($fullPath)) {
                        $detectedParent = $cat['name'];
                        $detectedCat = $pathParts[$i + 1];
                        if (isset($pathParts[$i + 2]) && $pathParts[$i + 2] !== basename($fullPath)) {
                            $detectedCollection = $pathParts[$i + 1];
                            $detectedCat = $pathParts[$i + 2];
                        }
                    }
                }
                break 2;
            }
        }
    }

    return [
        'title' => substr(ucwords(strtolower($cleanName)), 0, 250),
        'category' => substr($detectedCat, 0, 95),
        'parent_category' => $detectedParent ? substr($detectedParent, 0, 95) : null,
        'collection' => $detectedCollection ? substr($detectedCollection, 0, 95) : null
    ];
}

function getPriceForCategory($catName, $settings, $parentCatName = null) {
    $categories = is_array($settings['categories']) ? $settings['categories'] : json_decode($settings['categories'] ?? '[]', true);
    foreach ($categories as $cat) {
        if (strcasecmp($cat['name'], $catName) === 0) return floatval($cat['price']);
    }
    if ($parentCatName) {
        foreach ($categories as $cat) {
            if (strcasecmp($cat['name'], $parentCatName) === 0) return floatval($cat['price']);
        }
    }
    return 1.00;
}

function write_log($message, $level = 'INFO') {
    $logFile = __DIR__ . '/debug_log.txt';
    $timestamp = date('Y-m-d H:i:s');
    $formattedMessage = "[$timestamp] [$level] $message" . PHP_EOL;
    @file_put_contents($logFile, $formattedMessage, FILE_APPEND);
    if (php_sapi_name() === 'cli') echo $formattedMessage;
}

/**
 * CORRECCIÓN V12.0: Resolución de rutas mejorada para Synology
 * Maneja mejor las rutas absolutas de volúmenes y rutas relativas
 */
function resolve_video_path($pathOrUrl, $pdo = null) {
    if (!$pathOrUrl) {
        write_log("resolve_video_path: Path vacío", 'ERROR');
        return false;
    }
    
    // Normalizar separadores de ruta
    $path = str_replace('\\', '/', trim($pathOrUrl));
    
    // Eliminar prefijo 'api/' si existe (artifact de procesamiento anterior)
    if (strpos($path, 'api/index.php?action=stream') === 0) {
        write_log("resolve_video_path: Detectada URL de stream, no es una ruta de archivo", 'ERROR');
        return false;
    }
    
    write_log("resolve_video_path: Intentando resolver: $path", 'DEBUG');

    // 1. Ruta absoluta directa (Synology: /volume1/..., /volume2/..., etc.)
    if (preg_match('/^\/volume\d+/', $path)) {
        if (file_exists($path) && is_file($path)) {
            write_log("resolve_video_path: Encontrado como ruta absoluta Synology: $path", 'DEBUG');
            return $path; // No usar realpath() que puede fallar en algunos casos
        }
        // Intentar con realpath como fallback
        $real = @realpath($path);
        if ($real && file_exists($real) && is_file($real)) {
            write_log("resolve_video_path: Encontrado via realpath Synology: $real", 'DEBUG');
            return $real;
        }
    }

    // 2. Otra ruta absoluta Unix/Linux
    if (strpos($path, '/') === 0) {
        if (file_exists($path) && is_file($path)) {
            write_log("resolve_video_path: Encontrado como ruta absoluta Unix: $path", 'DEBUG');
            return realpath($path) ?: $path;
        }
    }

    // 3. Ruta relativa a uploads/videos/
    if (strpos($path, 'uploads/videos/') !== false) {
        $cleanPath = $path;
        if (strpos($cleanPath, 'api/') === 0) {
            $cleanPath = substr($cleanPath, 4);
        }
        $internalPath = __DIR__ . '/' . $cleanPath;
        if (file_exists($internalPath) && is_file($internalPath)) {
            write_log("resolve_video_path: Encontrado como ruta relativa uploads: $internalPath", 'DEBUG');
            return realpath($internalPath) ?: $internalPath;
        }
    }

    // 4. Ruta relativa genérica a la carpeta API
    $cleanPath = (strpos($path, 'api/') === 0) ? substr($path, 4) : $path;
    $internalPath = __DIR__ . '/' . $cleanPath;
    if (file_exists($internalPath) && is_file($internalPath)) {
        write_log("resolve_video_path: Encontrado como ruta relativa API: $internalPath", 'DEBUG');
        return realpath($internalPath) ?: $internalPath;
    }

    // 5. Buscar en localLibraryPath si está configurado
    if ($pdo) {
        try {
            $stmt = $pdo->query("SELECT localLibraryPath FROM system_settings WHERE id = 1");
            $libraryPath = $stmt->fetchColumn();
            if ($libraryPath) {
                $libraryPath = rtrim(str_replace('\\', '/', $libraryPath), '/');
                
                // Si el path no empieza con /, agregar el libraryPath como base
                if (strpos($path, '/') !== 0) {
                    $fullPath = $libraryPath . '/' . $path;
                    if (file_exists($fullPath) && is_file($fullPath)) {
                        write_log("resolve_video_path: Encontrado en libraryPath: $fullPath", 'DEBUG');
                        return $fullPath;
                    }
                }
                
                // Buscar si el archivo está dentro del libraryPath con nombre diferente
                $filename = basename($path);
                $searchPath = $libraryPath . '/*/' . $filename;
                $matches = glob($searchPath);
                if (!empty($matches) && is_file($matches[0])) {
                    write_log("resolve_video_path: Encontrado via glob: " . $matches[0], 'DEBUG');
                    return $matches[0];
                }
            }
        } catch (Exception $e) {
            write_log("resolve_video_path: Error buscando en libraryPath: " . $e->getMessage(), 'ERROR');
        }
    }

    write_log("resolve_video_path: No se pudo resolver la ruta: $path", 'ERROR');
    return false;
}

function fix_url($url) {
    if (empty($url)) return "api/uploads/thumbnails/default.jpg";
    if (strpos($url, 'http') === 0) return $url;
    if (strpos($url, 'data:') === 0) return $url;
    $clean = ltrim($url, '/');
    if (strpos($clean, 'api/') === 0) return $clean;
    if (strpos($clean, 'uploads/') === 0) return 'api/' . $clean;
    return 'api/' . $clean;
}

/**
 * CORRECCIÓN V12.0: Función de streaming mejorada
 * - Mejor manejo de errores
 * - Logging detallado para diagnóstico
 * - Soporte mejorado para Synology
 */
function streamVideo($id, $pdo) {
    // Cerrar sesión para evitar bloqueos
    if (session_id()) session_write_close();
    
    // Limpiar cualquier buffer de salida
    while (ob_get_level()) ob_end_clean();
    header_remove();

    write_log("streamVideo: Iniciando stream para ID: $id", 'INFO');

    // Obtener configuración del sistema
    $stmtS = $pdo->query("SELECT videoDeliveryMode, localLibraryPath FROM system_settings WHERE id = 1");
    $settings = $stmtS->fetch();
    $mode = $settings['videoDeliveryMode'] ?? 'PHP';
    $rootLib = rtrim(str_replace('\\', '/', $settings['localLibraryPath'] ?? ''), '/');

    write_log("streamVideo: Modo de entrega: $mode, Library: $rootLib", 'DEBUG');

    // Obtener la URL/ruta del video de la base de datos
    $stmt = $pdo->prepare("SELECT videoUrl, isLocal FROM videos WHERE id = ?");
    $stmt->execute([$id]);
    $videoData = $stmt->fetch();
    
    if (!$videoData || !$videoData['videoUrl']) {
        write_log("streamVideo: Video no encontrado en DB: $id", 'ERROR');
        header("HTTP/1.1 404 Not Found");
        echo "Video no encontrado";
        exit;
    }
    
    $videoUrl = $videoData['videoUrl'];
    write_log("streamVideo: videoUrl de DB: $videoUrl", 'DEBUG');

    // Resolver la ruta real del archivo
    $realPath = resolve_video_path($videoUrl, $pdo);
    
    if (!$realPath) {
        write_log("streamVideo: No se pudo resolver la ruta: $videoUrl", 'ERROR');
        header("HTTP/1.1 404 Not Found");
        echo "Archivo no encontrado - ruta no resuelta";
        exit;
    }
    
    if (!file_exists($realPath)) {
        write_log("streamVideo: Archivo no existe: $realPath", 'ERROR');
        header("HTTP/1.1 404 Not Found");
        echo "Archivo no existe en el sistema";
        exit;
    }
    
    if (!is_readable($realPath)) {
        write_log("streamVideo: Archivo no legible (permisos): $realPath", 'ERROR');
        header("HTTP/1.1 403 Forbidden");
        echo "Sin permisos de lectura";
        exit;
    }

    write_log("streamVideo: Archivo encontrado: $realPath", 'INFO');

    $fileSize = filesize($realPath);
    if ($fileSize === false || $fileSize === 0) {
        write_log("streamVideo: Archivo vacío o error al obtener tamaño: $realPath", 'ERROR');
        header("HTTP/1.1 500 Internal Server Error");
        echo "Error al leer archivo";
        exit;
    }

    $ext = strtolower(pathinfo($realPath, PATHINFO_EXTENSION));

    // Determinar MIME type
    $mimeTypes = [
        'mp3' => 'audio/mpeg',
        'wav' => 'audio/wav',
        'm4a' => 'audio/mp4',
        'aac' => 'audio/aac',
        'flac' => 'audio/flac',
        'ogg' => 'audio/ogg',
        'mkv' => 'video/x-matroska',
        'webm' => 'video/webm',
        'avi' => 'video/x-msvideo',
        'mov' => 'video/quicktime',
        'mp4' => 'video/mp4',
        'm4v' => 'video/mp4'
    ];
    $mime = $mimeTypes[$ext] ?? 'video/mp4';

    write_log("streamVideo: Tamaño: $fileSize bytes, MIME: $mime", 'DEBUG');

    // Headers CORS y de streaming
    header("Access-Control-Allow-Origin: *");
    header("Access-Control-Allow-Methods: GET, HEAD, OPTIONS");
    header("Access-Control-Allow-Headers: Range, Authorization, Content-Type");
    header("Access-Control-Expose-Headers: Content-Length, Content-Range, Accept-Ranges");
    header("Accept-Ranges: bytes");
    header("Content-Type: $mime");
    header("Cache-Control: no-cache, no-store, must-revalidate");
    header("Pragma: no-cache");

    // Manejar petición HEAD (usado por el navegador para verificar)
    if ($_SERVER['REQUEST_METHOD'] === 'HEAD') {
        header("Content-Length: $fileSize");
        write_log("streamVideo: Respondiendo HEAD request", 'DEBUG');
        exit;
    }

    // Modo NGINX X-Accel-Redirect
    if ($mode === 'NGINX') {
        $normalizedRealPath = str_replace('\\', '/', $realPath);
        if ($rootLib && strpos($normalizedRealPath, $rootLib) === 0) {
            $relativePath = substr($normalizedRealPath, strlen($rootLib));
            header("X-Accel-Redirect: /internal_media" . $relativePath);
            write_log("streamVideo: NGINX redirect a /internal_media$relativePath", 'INFO');
            exit;
        } else {
            $apiRoot = str_replace('\\', '/', realpath(__DIR__ . '/../'));
            if (strpos($normalizedRealPath, $apiRoot) === 0) {
                $relativePath = substr($normalizedRealPath, strlen($apiRoot));
                header("X-Accel-Redirect: /internal_api" . $relativePath);
                write_log("streamVideo: NGINX redirect a /internal_api$relativePath", 'INFO');
                exit;
            }
        }
        write_log("streamVideo: NGINX mode pero no se encontró ruta relativa, fallback a PHP", 'WARNING');
    } 
    // Modo Apache X-Sendfile
    else if ($mode === 'APACHE') {
        header("X-Sendfile: $realPath");
        write_log("streamVideo: APACHE X-Sendfile: $realPath", 'INFO');
        exit;
    }

    // Modo PHP directo (default)
    $fp = @fopen($realPath, 'rb');
    if (!$fp) {
        write_log("streamVideo: No se pudo abrir archivo: $realPath", 'ERROR');
        header("HTTP/1.1 403 Forbidden");
        echo "Error al abrir archivo";
        exit;
    }

    set_time_limit(0);
    
    // Manejo de Range Requests (para seeking en video)
    $offset = 0;
    $end = $fileSize - 1;
    $length = $fileSize;

    if (isset($_SERVER['HTTP_RANGE'])) {
        if (preg_match('/bytes=(\d*)-(\d*)/', $_SERVER['HTTP_RANGE'], $matches)) {
            $offset = $matches[1] !== '' ? intval($matches[1]) : 0;
            $end = $matches[2] !== '' ? intval($matches[2]) : $fileSize - 1;
            
            // Validar rangos
            if ($offset > $end || $offset >= $fileSize) {
                header('HTTP/1.1 416 Range Not Satisfiable');
                header("Content-Range: bytes */$fileSize");
                fclose($fp);
                exit;
            }
            
            $length = $end - $offset + 1;
            
            header('HTTP/1.1 206 Partial Content');
            header("Content-Range: bytes $offset-$end/$fileSize");
            header("Content-Length: $length");
            
            fseek($fp, $offset);
            write_log("streamVideo: Range request: $offset-$end/$fileSize", 'DEBUG');
        }
    } else {
        header("Content-Length: $fileSize");
    }

    // Streaming del contenido
    $bufferSize = 1024 * 512; // 512KB buffer
    $bytesSent = 0;
    
    while (!feof($fp) && $bytesSent < $length) {
        $readSize = min($bufferSize, $length - $bytesSent);
        $data = fread($fp, $readSize);
        
        if ($data === false) {
            write_log("streamVideo: Error leyendo archivo en offset $bytesSent", 'ERROR');
            break;
        }
        
        echo $data;
        $bytesSent += strlen($data);
        flush();
        
        if (connection_aborted()) {
            write_log("streamVideo: Conexión abortada por cliente", 'DEBUG');
            break;
        }
    }
    
    fclose($fp);
    write_log("streamVideo: Stream completado, bytes enviados: $bytesSent", 'INFO');
    exit;
}
?>