<?php
/**
 * StreamPay - Cleanup Worker V1.0
 * Elimina archivos físicos de 0 bytes para evitar errores en el procesamiento.
 */

require_once 'functions_utils.php';

echo "--- INICIANDO CLEANUP DE ARCHIVOS VACÍOS ---\n";

$baseUploads = __DIR__ . '/uploads';

if (!is_dir($baseUploads)) {
    echo "[INFO] El directorio de uploads no existe aún.\n";
    return;
}

function cleanup_recursive($dir) {
    $count = 0;
    $files = array_diff(scandir($dir), ['.', '..']);
    
    foreach ($files as $file) {
        $path = $dir . '/' . $file;
        if (is_dir($path)) {
            $count += cleanup_recursive($path);
        } else {
            if (filesize($path) === 0) {
                echo "[DELETE] Eliminando archivo vacío: $path\n";
                if (@unlink($path)) {
                    $count++;
                } else {
                    echo "[ERROR] No se pudo eliminar: $path\n";
                }
            }
        }
    }
    return $count;
}

$deletedCount = cleanup_recursive($baseUploads);
echo "[FIN] Se eliminaron $deletedCount archivos de 0 bytes.\n";
