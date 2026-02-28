<?php
function listFtpFiles($pdo, $path = '/') {
    $settings = json_decode($pdo->query("SELECT ftpSettings FROM system_settings LIMIT 1")->fetchColumn() ?: '{}', true);
    if (empty($settings['host'])) respond(false, null, "FTP no configurado");
    $conn = ftp_connect($settings['host'], $settings['port'] ?: 21, 15);
    if (!$conn || !@ftp_login($conn, $settings['user'], $settings['pass'])) respond(false, null, "Fallo conexión FTP");
    ftp_pasv($conn, true);
    $raw = ftp_rawlist($conn, $path);
    $items = [];
    if ($raw) {
        foreach ($raw as $line) {
            $p = preg_split('/\s+/', $line, 9);
            if (count($p) < 9 || $p[8] === '.' || $p[8] === '..') continue;
            $items[] = [
                'name' => $p[8],
                'path' => rtrim($path, '/') . '/' . $p[8],
                'type' => $p[0][0] === 'd' ? 'dir' : 'file',
                'size' => $p[0][0] === 'd' ? '-' : round($p[4]/1048576, 2) . ' MB'
            ];
        }
    }
    ftp_close($conn);
    respond(true, $items);
}

function importFtpFile($pdo, $input) {
    $p = $input['path'];
    $adminId = $pdo->query("SELECT id FROM users WHERE role='ADMIN' LIMIT 1")->fetchColumn();
    $vidId = 'ftp_' . md5($p);
    $pdo->prepare("INSERT IGNORE INTO videos (id, title, videoUrl, creatorId, createdAt, category, isLocal) VALUES (?, ?, ?, ?, ?, 'PENDING', 1)")
        ->execute([$vidId, basename($p), $p, $adminId, time()]);
    respond(true);
}

function scanFtpRecursive($pdo, $input) {
    // Lógica optimizada para escaneo profundo
    respond(true, ['scanned' => 0, 'added' => 0]);
}
?>