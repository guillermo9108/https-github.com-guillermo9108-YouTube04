<?php
require_once 'functions_utils.php';
require_once 'functions_schema.php';

$configFile = 'db_config.json';
if (!file_exists($configFile)) {
    die("Not installed");
}

$config = json_decode(file_get_contents($configFile), true);
$dsn = "mysql:host={$config['host']};port={$config['port']};dbname={$config['name']};charset=utf8mb4";
$pdo = new PDO($dsn, $config['user'], $config['password'], [
    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION
]);

$schema = getAppSchema();
foreach ($schema as $tableName => $def) {
    syncTable($pdo, $tableName, $def);
}

echo "Sync completed";
?>
