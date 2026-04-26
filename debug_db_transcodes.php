<?php
require_once 'api/functions_utils.php';
$configFile = 'api/db_config.json';
$config = json_decode(file_get_contents($configFile), true);
$dsn = "mysql:host={$config['host']};port={$config['port']};dbname={$config['name']};charset=utf8mb4";
$pdo = new PDO($dsn, $config['user'], $config['password']);

echo "ACTIVE TRANSCODES TABLE:\n";
$stmt = $pdo->query("SELECT * FROM active_transcodes");
while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
    print_r($row);
}

echo "\nLAST VIDEOS IN DB:\n";
$stmt = $pdo->query("SELECT id, title, videoUrl, transcode_status FROM videos ORDER BY createdAt DESC LIMIT 5");
while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
    print_r($row);
}
