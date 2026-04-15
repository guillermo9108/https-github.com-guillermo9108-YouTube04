<?php
require_once 'api/index.php';
$stmt = $pdo->query("SELECT COUNT(*) FROM marketplace_items");
echo "Marketplace items count: " . $stmt->fetchColumn() . "\n";
?>
