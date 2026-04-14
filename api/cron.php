<?php
/**
 * StreamPay - Master Cron Job V1.0
 * Ejecuta los workers de video y transcodificación de forma secuencial.
 * Puede ser llamado vía URL o CLI.
 */

header('Content-Type: text/plain; charset=utf-8');

echo "--- STREAMPAY CRON START: " . date('Y-m-d H:i:s') . " ---\n\n";

// 0. Asegurar directorios de subida
echo "[0/4] Verificando directorios...\n";
ob_start();
include 'check_dirs.php';
echo ob_get_clean();
echo "\n";

// 1. Ejecutar Cleanup Worker (Eliminar archivos de 0 bytes)
echo "[1/4] Iniciando Cleanup Worker...\n";
ob_start();
include 'cleanup_worker.php';
echo ob_get_clean();
echo "\n";

// 2. Ejecutar Video Worker (Metadatos y Miniaturas)
echo "[2/4] Iniciando Video Worker...\n";
ob_start();
include 'video_worker.php';
$videoOutput = ob_get_clean();
echo $videoOutput;
echo "\n";

// 3. Ejecutar Transcode Worker (Conversión de Formatos)
echo "[3/4] Iniciando Transcode Worker...\n";
ob_start();
include 'transcode_worker.php';
$transcodeOutput = ob_get_clean();
echo $transcodeOutput;
echo "\n";

// 4. Ejecutar Battery Worker (Simulación de Batería)
echo "[4/4] Iniciando Battery Worker...\n";
ob_start();
include 'cron_battery.php';
echo ob_get_clean();
echo "\n";

echo "--- STREAMPAY CRON END: " . date('Y-m-d H:i:s') . " ---\n";
