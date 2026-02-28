<?php
/**
 * StreamPay - Server-Side Video Worker V1.5.1 (Synology & NAS Optimized)
 * Procesa la cola de videos PENDING con detección inteligente de binarios.
 */

set_time_limit(900);
ini_set('memory_limit', '512M');

// Asegurar que PHP maneje correctamente rutas UTF-8
setlocale(LC_ALL, 'en_US.UTF-8');

require_once 'functions_utils.php';
require_once 'functions_videos.php';

$configFile = 'db_config.json';
if (!file_exists($configFile)) {
    die("[FATAL] db_config.json no encontrado.\n");
}
$config = json_decode(file_get_contents($configFile), true);

try {
    $dsn = "mysql:host={$config['host']};port={$config['port']};dbname={$config['name']};charset=utf8mb4";
    $pdo = new PDO($dsn, $config['user'], $config['password'], [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC
    ]);
} catch (Exception $e) { 
    die("[FATAL] Error MariaDB: " . $e->getMessage() . "\n"); 
}

// --- LÓGICA DE DETECCIÓN DE BINARIOS (Centralizada en utils) ---
$bins = get_ffmpeg_binaries($pdo);
$ffmpeg = $bins['ffmpeg'];
$ffprobe = $bins['ffprobe'];

echo "--- DIAGNÓSTICO DE BINARIOS ---\n";
echo "[INFO] Usando FFMPEG: $ffmpeg\n";
echo "[INFO] Usando FFPROBE: $ffprobe\n";
echo "-------------------------------\n";

$batchSize = 10;
$processed = 0;
$failed = 0;

for ($i = 0; $i < $batchSize; $i++) {
    $now = time();
    // Priorizar videos con menos intentos de procesamiento
    $stmt = $pdo->prepare("SELECT * FROM videos WHERE category = 'PENDING' AND processing_attempts < 3 AND locked_at < ? ORDER BY processing_attempts ASC, createdAt ASC LIMIT 1");
    $stmt->execute([$now - 300]);
    $video = $stmt->fetch();

    if (!$video) break;

    echo "[TAREA " . ($i+1) . "] ID: {$video['id']} - '{$video['title']}'\n";
    $pdo->prepare("UPDATE videos SET locked_at = ? WHERE id = ?")->execute([$now, $video['id']]);
    
    $realPath = resolve_video_path($video['videoUrl']);
    
    if (!$realPath || !file_exists($realPath) || filesize($realPath) < 100) {
        $reason = (!$realPath || !file_exists($realPath)) ? '404: Archivo no encontrado' : 'Error: Archivo ilegible o vacío';
        echo "[ERROR] $reason\n";
        $pdo->prepare("UPDATE videos SET category = 'FAILED_METADATA', reason = ?, locked_at = 0 WHERE id = ?")->execute([$reason, $video['id']]);
        $failed++;
        continue;
    }

    // Extracción de Duración usando función robusta centralizada
    $duration = get_media_duration($realPath, $ffprobe);

    if ($duration <= 0) {
        echo "[ERROR] No se pudo determinar la duración. Formato incompatible o binario inválido.\n";
        $pdo->prepare("UPDATE videos SET processing_attempts = processing_attempts + 1, locked_at = 0 WHERE id = ?")->execute([$video['id']]);
        $failed++;
        continue;
    }

    $finalDuration = floor($duration);

    // B. Generación de Miniatura
    $ext = strtolower(pathinfo($realPath, PATHINFO_EXTENSION));
    $isAudio = (bool)$video['is_audio'] || in_array($ext, ['mp3', 'wav', 'aac', 'm4a', 'flac']);
    $thumbUrl = '';
    $ffCode = 0;

    if ($isAudio) {
        $thumbUrl = 'api/uploads/thumbnails/defaultaudio.jpg';
        echo "[INFO] Audio: Usando carátula genérica.\n";
    } else {
        $thumbFile = 'uploads/thumbnails/' . $video['id'] . '.jpg';
        $fullThumbPath = __DIR__ . '/' . $thumbFile;
        if (!is_dir(dirname($fullThumbPath))) mkdir(dirname($fullThumbPath), 0777, true);
        
        // Capturar en el segundo 2 o al inicio si es muy corto
        $time = ($finalDuration > 5) ? "00:00:02" : "00:00:00.500";
        
        $cmdFfmpeg = "$ffmpeg -y -ss $time -i " . escapeshellarg($realPath) . " -frames:v 1 -q:v 4 " . escapeshellarg($fullThumbPath) . " 2>&1";
        exec($cmdFfmpeg, $ffOutput, $ffCode);
        
        if ($ffCode === 0 && file_exists($fullThumbPath)) {
            $thumbUrl = 'api/' . $thumbFile;
        } else {
            echo "[WARN] Falló captura de video. Usando miniatura genérica.\n";
            $thumbUrl = 'api/uploads/thumbnails/default.jpg';
            $ffCode = 0; // Permitimos continuar aunque falle el thumb
        }
    }

    if ($ffCode === 0) {
        echo "[SUCCESS] Procesado: {$finalDuration}s.\n";
        $pdo->prepare("UPDATE videos SET duration = ?, thumbnailUrl = ?, category = 'PROCESSING', locked_at = 0, processing_attempts = 0 WHERE id = ?")
            ->execute([$finalDuration, $thumbUrl, $video['id']]);
        
        // Organizar inmediatamente tras el éxito
        $sets = $pdo->query("SELECT * FROM system_settings WHERE id = 1")->fetch();
        video_organize_single($pdo, $video['id'], $sets);
        $processed++;
    } else {
        echo "[ERROR] Error fatal en FFMPEG.\n";
        $pdo->prepare("UPDATE videos SET processing_attempts = processing_attempts + 1, locked_at = 0 WHERE id = ?")->execute([$video['id']]);
        $failed++;
    }
}

echo "\nCiclo completado. OK: $processed, Error: $failed.\n";
?>