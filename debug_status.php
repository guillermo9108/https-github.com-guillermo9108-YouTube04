<?php
require_once 'api/functions_utils.php';
$config = json_decode(file_get_contents('api/db_config.json'), true);
$dsn = "mysql:host={$config['host']};port={$config['port']};dbname={$config['name']};charset=utf8mb4";
$pdo = new PDO($dsn, $config['user'], $config['password']);

$tables = $pdo->query("SHOW TABLES")->fetchAll(PDO::FETCH_COLUMN);
echo "Tables: " . implode(', ', $tables) . "\n";

$pending = $pdo->query("SELECT COUNT(*) FROM videos WHERE transcode_status = 'WAITING'")->fetchColumn();
echo "Pending Videos: $pending\n";

$active = $pdo->query("SELECT COUNT(*) FROM active_transcodes")->fetchColumn();
echo "Active Records: $active\n";
?>
