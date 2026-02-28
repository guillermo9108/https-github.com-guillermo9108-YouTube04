<?php
ob_start();
ini_set('display_errors', 0);
error_reporting(E_ALL);

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') { ob_clean(); http_response_code(200); exit(); }

require_once 'functions_schema.php';

register_shutdown_function(function() {
    $error = error_get_last();
    if ($error && ($error['type'] === E_ERROR || $error['type'] === E_PARSE || $error['type'] === E_CORE_ERROR)) {
        ob_clean();
        header('Content-Type: application/json');
        echo json_encode(['success' => false, 'error' => 'Critical Install Error: ' . $error['message']]);
        exit;
    }
});

$action = $_GET['action'] ?? '';
$input = json_decode(file_get_contents('php://input'), true);
$configFile = 'db_config.json';

function respond($success, $data = null, $error = null) {
    ob_clean();
    header('Content-Type: application/json');
    echo json_encode(['success' => $success, 'data' => $data, 'error' => $error]);
    exit();
}

if ($action === 'ping') respond(true, ['message' => 'pong']);

if ($action === 'check') {
    if (file_exists($configFile)) {
        $config = json_decode(file_get_contents($configFile), true);
        try {
            $pdo = new PDO("mysql:host={$config['host']};port={$config['port']}", $config['user'], $config['password']);
            $pdo->exec("USE `{$config['name']}`");
            if ($pdo->query("SHOW TABLES LIKE 'users'")->rowCount() > 0) respond(true, ['installed' => true]);
        } catch (Exception $e) {}
    }
    respond(true, ['installed' => false]);
}

if ($action === 'verify_db') {
    $host = $input['host'] ?? 'localhost';
    try {
        $pdo = new PDO("mysql:host=$host;port={$input['port']};charset=utf8mb4", $input['username'], $input['password']);
        respond(true, ['message' => 'Connection successful']);
    } catch (PDOException $e) { respond(false, null, 'Connection failed: ' . $e->getMessage()); }
}

if ($action === 'install') {
    $dbConfig = $input['dbConfig'];
    $adminUser = $input['adminUser'];

    try {
        $pdo = new PDO("mysql:host={$dbConfig['host']};port={$dbConfig['port']};charset=utf8mb4", $dbConfig['username'], $dbConfig['password']);
        $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);

        $pdo->exec("CREATE DATABASE IF NOT EXISTS `{$dbConfig['database']}` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");
        $pdo->exec("USE `{$dbConfig['database']}`");

        $schema = getAppSchema();
        foreach ($schema as $tableName => $def) {
            syncTable($pdo, $tableName, $def);
        }
        
        $pdo->exec("INSERT IGNORE INTO system_settings (id) VALUES (1)");

        $adminId = 'u_' . uniqid();
        $hash = password_hash($adminUser['password'], PASSWORD_DEFAULT);
        
        $stmt = $pdo->prepare("SELECT COUNT(*) FROM users WHERE username = ?");
        $stmt->execute([$adminUser['username']]);
        if ($stmt->fetchColumn() == 0) {
            $stmt = $pdo->prepare("INSERT INTO users (id, username, password_hash, role, balance, autoPurchaseLimit, watchLater) VALUES (?, ?, ?, 'ADMIN', 999999.00, 100.00, '[]')");
            $stmt->execute([$adminId, $adminUser['username'], $hash]);
        }
        
        $pdo->prepare("UPDATE users SET role = 'ADMIN' WHERE username = ?")->execute([$adminUser['username']]);

        $configData = [
            'host' => $dbConfig['host'],
            'port' => $dbConfig['port'],
            'user' => $dbConfig['username'],
            'password' => $dbConfig['password'],
            'name' => $dbConfig['database']
        ];
        file_put_contents($configFile, json_encode($configData));

        if (!file_exists('uploads/videos')) mkdir('uploads/videos', 0777, true);
        if (!file_exists('uploads/thumbnails')) mkdir('uploads/thumbnails', 0777, true);
        if (!file_exists('uploads/avatars')) mkdir('uploads/avatars', 0777, true);
        if (!file_exists('uploads/market')) mkdir('uploads/market', 0777, true);

        respond(true, ['message' => 'Installation successful']);

    } catch (PDOException $e) {
        respond(false, null, 'Installation error: ' . $e->getMessage());
    }
}
?>