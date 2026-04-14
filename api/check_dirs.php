<?php
$dirs = [
    'uploads',
    'uploads/videos',
    'uploads/thumbnails',
    'uploads/avatars',
    'uploads/marketplace'
];

echo "--- CHECKING DIRECTORIES ---\n";
foreach ($dirs as $d) {
    $path = __DIR__ . '/' . $d;
    if (!is_dir($path)) {
        echo "[MISSING] $d - Creating...\n";
        if (mkdir($path, 0777, true)) {
            echo "[SUCCESS] Created $d\n";
        } else {
            echo "[ERROR] Failed to create $d\n";
        }
    } else {
        echo "[OK] $d exists. Writable: " . (is_writable($path) ? 'YES' : 'NO') . "\n";
    }
}
echo "--- FINISHED ---\n";
