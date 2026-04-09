<?php
/**
 * Script para mantener activo el simulador de batería en Xpenology.
 * Configurar en el Programador de Tareas de Synology para ejecutarse cada 1-5 minutos.
 * Comando: curl -s http://localhost/api/cron_battery.php
 */

require_once 'config.php';
require_once 'functions.php';
require_once 'functions_admin.php';

try {
    $pdo = get_db_connection();
    $simResult = update_battery_simulation($pdo);
    
    if ($simResult) {
        $battery = $simResult['config'];
        $history = $simResult['history'];
        echo "Simulación de batería actualizada: " . $battery['voltage'] . "V (" . round(($battery['voltage'] - 12) / 4.8 * 100) . "%)\n";
        echo "Puntos en el historial: " . count($history) . "\n";
    } else {
        echo "Simulador de batería no configurado.\n";
    }
} catch (Exception $e) {
    echo "Error: " . $e->getMessage() . "\n";
}
