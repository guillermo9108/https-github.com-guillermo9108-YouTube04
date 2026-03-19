<?php
$pdo = new PDO("sqlite:api/database.sqlite");
$stmt = $pdo->query("SELECT COUNT(*) FROM videos");
echo "Total videos: " . $stmt->fetchColumn() . "\n";

$stmt = $pdo->query("SELECT category, is_audio, duration, COUNT(*) as count FROM videos GROUP BY category, is_audio, duration");
while ($row = $stmt->fetch(PDO::FETCH_ASSOC)) {
    print_r($row);
}
