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

// 2. Protección: Verificar si ya hay un ffmpeg corriendo en el sistema
$check = shell_exec('pgrep ffmpeg');
if (!empty($check)) {
    die("[INFO] FFmpeg ya está trabajando en otro proceso. Saltando ciclo.\n");
}

// 3. Buscar siguiente video en cola WAITING
$stmt = $pdo->query("SELECT * FROM videos WHERE transcode_status = 'WAITING' ORDER BY createdAt ASC LIMIT 1");
$video = $stmt->fetch();

if (!$video) {
    die("[INFO] Cola vacía. No hay nada que convertir hoy.\n");
}

echo "[START] Procesando: '{$video['title']}' (ID: {$video['id']})\n";

$bins = get_ffmpeg_binaries($pdo);
$success = _admin_perform_transcode_single($pdo, $video, $bins);

if ($success) {
    echo "[SUCCESS] Conversión completada con éxito.\n";
} else {
    echo "[ERROR] La conversión falló. Revise api/transcode_log.txt para más detalles técnicos.\n";
}
?>