<?php
ob_start();
/**
 * StreamPay - Installer V1.2.0
 */
ini_set('display_errors', 1);
error_reporting(E_ALL);

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') exit;

require_once 'functions_utils.php';
require_once 'functions_schema.php';

$action = $_GET['action'] ?? '';
write_log("Installer Request: action=$action");
$input = json_decode(file_get_contents('php://input'), true) ?? $_POST;
if ($input) write_log("Installer Input: " . json_encode($input));

function respond($success, $data = null, $error = null) {
    // Limpiar cualquier salida previa (warnings, notices)
    while (ob_get_level()) ob_end_clean();
    header('Content-Type: application/json');
    echo json_encode(['success' => $success, 'data' => $data, 'error' => $error]);
    exit;
}

if ($action === 'check') {
    $installed = file_exists('db_config.json');
    respond(true, ['installed' => $installed]);
}

if ($action === 'verify_db') {
    try {
        $host = isset($input['host']) ? $input['host'] : '';
        $port = isset($input['port']) ? $input['port'] : '3306';
        $user = isset($input['user']) ? $input['user'] : '';
        $pass = isset($input['password']) ? $input['password'] : '';
        
        $dsn = "mysql:host=$host;port=$port;charset=utf8mb4";
        new PDO($dsn, $user, $pass, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
        respond(true, "Conexión exitosa");
    } catch (Throwable $e) {
        respond(false, null, $e->getMessage());
    }
}

if ($action === 'install') {
    $config = [
        'host' => $input['dbConfig']['host'],
        'port' => $input['dbConfig']['port'],
        'user' => $input['dbConfig']['user'],
        'password' => $input['dbConfig']['password'],
        'name' => $input['dbConfig']['name']
    ];

    try {
        $dsn = "mysql:host={$config['host']};port={$config['port']};charset=utf8mb4";
        $pdo = new PDO($dsn, $config['user'], $config['password'], [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
        
        $pdo->exec("CREATE DATABASE IF NOT EXISTS `{$config['name']}` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
        $pdo->exec("USE `{$config['name']}`");

        // Sincronizar todas las tablas
        $schema = getAppSchema();
        foreach ($schema as $tableName => $def) {
            syncTable($pdo, $tableName, $def);
        }

        // Crear Admin Inicial
        $adminId = 'admin_' . uniqid();
        $pass = password_hash($input['adminUser']['password'], PASSWORD_DEFAULT);
        $stmt = $pdo->prepare("INSERT IGNORE INTO users (id, username, password_hash, role, balance) VALUES (?, ?, ?, 'ADMIN', 1000)");
        $stmt->execute([$adminId, $input['adminUser']['username'], $pass]);

        // Configuración inicial del sistema
        $pdo->exec("INSERT IGNORE INTO system_settings (id, ffmpegPath) VALUES (1, 'ffmpeg')");

        // Guardar config
        file_put_contents('db_config.json', json_encode($config, JSON_PRETTY_PRINT));
        
        respond(true, "Instalación completada con éxito");
    } catch (Throwable $e) {
        respond(false, null, "Error: " . $e->getMessage());
    }
}

respond(false, null, "Acción no válida");
