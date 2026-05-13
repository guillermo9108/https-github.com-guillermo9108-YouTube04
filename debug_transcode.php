<?php
require_once 'api/functions_utils.php';
$configFile = 'api/db_config.json';
if (!file_exists($configFile)) die("No config");
$config = json_decode(file_get_contents($configFile), true);
$dsn = "mysql:host={$config['host']};port={$config['port']};dbname={$config['name']};charset=utf8mb4";
$pdo = new PDO($dsn, $config['user'], $config['password']);

echo "System Settings (autoTranscode):\n";
$stmt = $pdo->query("SELECT autoTranscode FROM system_settings WHERE id = 1");
var_dump($stmt->fetchColumn());

echo "\nVideo Queue (WAITING):\n";
$stmt = $pdo->query("SELECT id, title, transcode_status, locked_at, queue_priority FROM videos WHERE transcode_status = 'WAITING' ORDER BY queue_priority DESC, createdAt ASC");
while($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
    print_r($row);
}

echo "\nActive Transcodes:\n";
$stmt = $pdo->query("SELECT * FROM active_transcodes");
while($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
    print_r($row);
}
