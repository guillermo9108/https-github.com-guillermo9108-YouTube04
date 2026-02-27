<?php
/**
 * StreamPay - Master Cron Job V1.0
 * Ejecuta los workers de video y transcodificación de forma secuencial.
 * Puede ser llamado vía URL o CLI.
 */

header('Content-Type: text/plain; charset=utf-8');

echo "--- STREAMPAY CRON START: " . date('Y-m-d H:i:s') . " ---\n\n";

// 1. Ejecutar Video Worker (Metadatos y Miniaturas)
echo "[1/2] Iniciando Video Worker...\n";
ob_start();
include 'video_worker.php';
$videoOutput = ob_get_clean();
echo $videoOutput;
echo "\n";

// 2. Ejecutar Transcode Worker (Conversión de Formatos)
echo "[2/2] Iniciando Transcode Worker...\n";
ob_start();
include 'transcode_worker.php';
$transcodeOutput = ob_get_clean();
echo $transcodeOutput;
echo "\n";

echo "--- STREAMPAY CRON END: " . date('Y-m-d H:i:s') . " ---\n";
