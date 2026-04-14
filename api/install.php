<?php
ob_start();
/**
 * StreamPay - Installer V1.2.0
 */
ini_set('display_errors', 0);
error_reporting(E_ALL);

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') exit;

require_once 'functions_utils.php';
require_once 'functions_schema.php';

set_error_handler(function($errno, $errstr, $errfile, $errline) {
    if (!(error_reporting() & $errno)) return false;
    write_log("INSTALL ERROR: $errstr in $errfile on line $errline", 'ERROR');
    return false;
});

register_shutdown_function(function() {
    $error = error_get_last();
    if ($error && in_array($error['type'], [E_ERROR, E_PARSE, E_CORE_ERROR, E_COMPILE_ERROR])) {
        write_log("INSTALL FATAL: " . $error['message'], 'FATAL');
        while (ob_get_level()) ob_end_clean();
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode(['success' => false, 'error' => 'Critical PHP Error: ' . $error['message']]);
    }
});

$action = $_GET['action'] ?? '';
$input = json_decode(file_get_contents('php://input'), true) ?? $_POST;

function respond($success, $data = null, $error = null) {
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
        $host = $input['host'] ?? '127.0.0.1';
        $port = $input['port'] ?? '3306';
        $user = $input['username'] ?? $input['user'] ?? 'root';
        $pass = $input['password'] ?? '';
        
        $dsn = "mysql:host=$host;port=$port;charset=utf8mb4";
        new PDO($dsn, $user, $pass, [PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION]);
        respond(true, "Conexión exitosa");
    } catch (Exception $e) {
        respond(false, null, $e->getMessage());
    }
}

if ($action === 'install') {
    $dbInput = $input['dbConfig'] ?? [];
    $config = [
        'host' => $dbInput['host'] ?? '127.0.0.1',
        'port' => $dbInput['port'] ?? '3306',
        'user' => $dbInput['username'] ?? $dbInput['user'] ?? 'root',
        'password' => $dbInput['password'] ?? '',
        'name' => $dbInput['database'] ?? $dbInput['name'] ?? 'streampay_db'
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
    } catch (Exception $e) {
        respond(false, null, "Error: " . $e->getMessage());
    }
}

respond(false, null, "Acción no válida");
?>
