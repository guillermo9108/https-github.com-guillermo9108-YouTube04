<?php
/**
 * StreamPay - Server-Side Video Worker V1.6 (Refactored)
 * Procesa la cola de videos PENDING con detección inteligente de binarios.
 */

set_time_limit(900);
ini_set('memory_limit', '512M');

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

$bins = get_ffmpeg_binaries($pdo);
$ffmpeg = $bins['ffmpeg'];
$ffprobe = $bins['ffprobe'];

// Protección: Verificar si ya hay demasiados procesos FFmpeg corriendo
$check = shell_exec('ps aux | grep ffmpeg | grep -v grep | wc -l');
$count = (int)trim($check);
if ($count >= 3) {
    die("[INFO] Ya hay 3 o más procesos FFmpeg trabajando. Saltando ciclo.\n");
}

echo "--- VIDEO WORKER V1.6 ---\n";

$batchSize = 20;
$processed = 0;
$failed = 0;

for ($i = 0; $i < $batchSize; $i++) {
    $now = time();
    $stmt = $pdo->prepare("SELECT * FROM videos WHERE (category = 'PENDING' OR thumbnailUrl IS NULL OR thumbnailUrl = '' OR thumbnailUrl LIKE '%default.jpg') AND transcode_status = 'NONE' AND processing_attempts < 5 AND locked_at < ? ORDER BY processing_attempts ASC, createdAt ASC LIMIT 1");
    $stmt->execute([$now - 60]);
    $video = $stmt->fetch();

    if (!$video) break;

    echo "[TASK " . ($i+1) . "] ID: {$video['id']} - '{$video['title']}'\n";
    $pdo->prepare("UPDATE videos SET locked_at = ? WHERE id = ?")->execute([$now, $video['id']]);
    
    $realPath = resolve_video_path($video['videoUrl']);
    
    if (!$realPath || !file_exists($realPath)) {
        $reason = '404: File not found';
        echo "[ERROR] $reason\n";
        $pdo->prepare("UPDATE videos SET category = 'FAILED_METADATA', reason = ?, locked_at = 0 WHERE id = ?")->execute([$reason, $video['id']]);
        $failed++;
        continue;
    }

    if (filesize($realPath) < 100) {
        $reason = 'Error: File empty or unreadable';
        echo "[ERROR] $reason\n";
        $pdo->prepare("UPDATE videos SET category = 'FAILED_METADATA', reason = ?, locked_at = 0 WHERE id = ?")->execute([$reason, $video['id']]);
        $failed++;
        continue;
    }

    // Usar la función centralizada para extraer todo (duración + miniatura)
    $res = worker_video_extract_metadata($pdo, $video['id'], $ffmpeg, $ffprobe);

    if ($res) {
        $finalDuration = floor($res['duration']);
        echo "[SUCCESS] Processed: {$finalDuration}s.\n";
        
        // Solo cambiar categoría a PROCESSING si estaba en PENDING
        $newCategory = ($video['category'] === 'PENDING') ? 'PROCESSING' : $video['category'];
        
        $pdo->prepare("UPDATE videos SET category = ?, locked_at = 0, processing_attempts = 0 WHERE id = ?")
            ->execute([$newCategory, $video['id']]);
        
        // Organizar inmediatamente tras el éxito
        $sets = $pdo->query("SELECT * FROM system_settings WHERE id = 1")->fetch();
        video_organize_single($pdo, $video['id'], $sets);
        $processed++;
    } else {
        echo "[WARN] Thumb extraction failed. Queuing for transcode.\n";
        
        $pdo->prepare("UPDATE videos SET transcode_status = 'WAITING', reason = 'Metadata/Thumb extraction failed', locked_at = 0, processing_attempts = processing_attempts + 1 WHERE id = ?")
            ->execute([$video['id']]);
        
        $failed++;
    }
}

echo "\nCycle completed. OK: $processed, Failed: $failed.\n";
?>
