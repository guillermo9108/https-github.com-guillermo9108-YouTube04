<?php
require_once 'api/functions_utils.php';
$configFile = 'api/db_config.json';
$config = json_decode(file_get_contents($configFile), true);
$dsn = "mysql:host={$config['host']};port={$config['port']};dbname={$config['name']};charset=utf8mb4";
$pdo = new PDO($dsn, $config['user'], $config['password']);

$stmt = $pdo->query("SELECT localLibraryPath, libraryPaths FROM system_settings WHERE id = 1");
$settings = $stmt->fetch(PDO::FETCH_ASSOC);
echo "SETTINGS:\n";
print_r($settings);
