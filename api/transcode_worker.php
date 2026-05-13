<?php
/**
 * StreamPay - Auto Transcode Worker V1.1.0 (CLI Compliant)
 * Ejecuta la cola de transcodificación si el modo automático está activo.
 */

// Cambiar al directorio donde reside el archivo para resolver rutas relativas
chdir(__DIR__);

set_time_limit(3600); // 1 hora máximo por video (útil para NAS lentos)
ini_set('memory_limit', '512M');

require_once 'functions_utils.php';
require_once 'functions_admin.php';

$configFile = 'db_config.json';
if (!file_exists($configFile)) {
    die("[FATAL] db_config.json no encontrado. Ejecute el setup primero.\n");
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

// 1. Verificar si el modo automático está activo
$stmtS = $pdo->query("SELECT autoTranscode FROM system_settings WHERE id = 1");
$isAuto = (bool)$stmtS->fetchColumn();

if (!$isAuto) {
    die("[INFO] Transcodificación automática desactivada en ajustes web.\n");
}

// 2. Protección: Verificar si ya hay procesos FFmpeg corriendo en el sistema
// Intentamos varios métodos para mayor compatibilidad
$count = 0;
$checkPs = @shell_exec('ps aux | grep ffmpeg | grep -v grep | wc -l');
if ($checkPs !== null) {
    $count = (int)trim($checkPs);
} else {
    // Si ps aux falla, intentar pgrep -c (si existe)
    $checkPgrep = @shell_exec('pgrep -c ffmpeg');
    if ($checkPgrep !== null) $count = (int)trim($checkPgrep);
}

if ($count >= 1) {
    die("[INFO] Ya hay un proceso FFmpeg trabajando ($count). Saltando ciclo para evitar saturación.\n");
}

// 2.1 Protección adicional: Evitar que el worker mismo se solape (usando lock temporal)
$lockFile = __DIR__ . '/transcode_worker.lock';
if (file_exists($lockFile) && (time() - filemtime($lockFile) < 1800)) {
    die("[INFO] El worker ya tiene un bloqueo activo reciente. Saltando.\n");
}
file_put_contents($lockFile, getmypid());

// 3. Buscar siguiente video en cola WAITING
$now = time();
// Aceptamos locked_at = 0 o bloqueos de hace más de 10 minutos (por si el worker anterior crasheó)
$stmt = $pdo->prepare("SELECT * FROM videos WHERE transcode_status = 'WAITING' AND (locked_at = 0 OR locked_at < ?) ORDER BY queue_priority DESC, createdAt ASC LIMIT 1");
$stmt->execute([$now - 600]); 
$video = $stmt->fetch();

if (!$video) {
    @unlink($lockFile);
    die("[INFO] Cola vacía. No hay nada que convertir hoy.\n");
}

// Bloquear inmediatamente
$pdo->prepare("UPDATE videos SET locked_at = ? WHERE id = ?")->execute([$now, $video['id']]);

echo "[START] Procesando: '{$video['title']}' (ID: {$video['id']})\n";

$bins = get_ffmpeg_binaries($pdo);
$success = _admin_perform_transcode_single($pdo, $video, $bins);

@unlink($lockFile);

if ($success) {
    echo "[SUCCESS] Conversión completada con éxito.\n";
    // Si hay más en cola, disparar el siguiente ciclo
    _admin_background_transcode_trigger($pdo);
} else {
    echo "[ERROR] La conversión falló. Revise api/transcode_log.txt o log.txt para detalles.\n";
}
?>
