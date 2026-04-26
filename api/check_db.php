<?php
$config = json_decode(file_get_contents('api/db_config.json'), true);
$dsn = "mysql:host={$config['host']};port={$config['port']};dbname={$config['name']};charset=utf8mb4";
$pdo = new PDO($dsn, $config['user'], $config['password']);
$stmt = $pdo->query("SHOW TABLES LIKE 'active_transcodes'");
echo ($stmt->rowCount() > 0) ? "EXISTS" : "MISSING";
