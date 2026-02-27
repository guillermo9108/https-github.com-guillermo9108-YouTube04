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

require_once 'functions_schema.php';

$action = $_GET['action'] ?? '';
$input = json_decode(file_get_contents('php://input'), true) ?? $_POST;

function respond($success, $data = null, $error = null) {
    header('Content-Type: application/json');
    echo json_encode(['success' => $success, 'data' => $data, 'error' => $error]);
    exit;
}

if ($action === 'install') {
    $config = [
        'host' => $input['host'],
        'port' => $input['port'],
        'user' => $input['user'],
        'password' => $input['password'],
        'name' => $input['name']
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
        $pass = password_hash($input['adminPass'], PASSWORD_DEFAULT);
        $stmt = $pdo->prepare("INSERT IGNORE INTO users (id, username, password_hash, role, balance) VALUES (?, ?, ?, 'ADMIN', 1000)");
        $stmt->execute([$adminId, $input['adminUser'], $pass, 1000]);

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
