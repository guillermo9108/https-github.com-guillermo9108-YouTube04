<?php
/**
 * StreamPay - FTP Module V1.1 (Resilience Fix)
 */

function listFtpFiles($pdo, $path = '/') {
    // Verificación de módulo
    if (!function_exists('ftp_connect')) {
        respond(false, null, "El soporte FTP de PHP no está habilitado en este servidor. Por favor, active 'extension=ftp' en su php.ini.");
    }

    $stmt = $pdo->query("SELECT ftpSettings FROM system_settings WHERE id = 1");
    $settings = json_decode($stmt->fetchColumn() ?: '{}', true);

    if (empty($settings['host'])) respond(false, null, "FTP no configurado en los ajustes de Admin");

    $conn = @ftp_connect($settings['host'], $settings['port'] ?: 21, 15);
    if (!$conn) respond(false, null, "No se pudo conectar al host FTP: " . $settings['host']);

    if (!@ftp_login($conn, $settings['user'], $settings['pass'])) {
        ftp_close($conn);
        respond(false, null, "Credenciales FTP inválidas para el usuario: " . $settings['user']);
    }

    ftp_pasv($conn, true);
    $rawList = @ftp_rawlist($conn, $path);
    $items = [];

    if ($rawList) {
        foreach ($rawList as $line) {
            $parts = preg_split('/\s+/', $line, 9);
            if (count($parts) < 9) continue;
            
            $isDir = $parts[0][0] === 'd';
            $name = $parts[8];
            if ($name === '.' || $name === '..') continue;

            $items[] = [
                'name' => $name,
                'path' => rtrim($path, '/') . '/' . $name,
                'type' => $isDir ? 'dir' : 'file',
                'size' => $isDir ? '-' : round($parts[4] / 1024 / 1024, 2) . ' MB'
            ];
        }
    }

    ftp_close($conn);
    respond(true, $items);
}

function importFtpFile($pdo, $input) {
    $remotePath = $input['path'] ?? '';
    if (!$remotePath) respond(false, null, "Ruta de archivo FTP inválida");

    $adminId = $pdo->query("SELECT id FROM users WHERE role='ADMIN' LIMIT 1")->fetchColumn();
    $vidId = 'ftp_' . md5($remotePath);
    
    $check = $pdo->prepare("SELECT COUNT(*) FROM videos WHERE id = ?");
    $check->execute([$vidId]);
    if ($check->fetchColumn() > 0) respond(true, "El archivo ya se encuentra indexado.");

    $title = basename($remotePath);
    $stmt = $pdo->prepare("INSERT INTO videos (id, title, description, price, thumbnailUrl, videoUrl, creatorId, createdAt, category, isLocal) VALUES (?, ?, 'FTP Remote Asset', 0, 'api/uploads/thumbnails/default.jpg', ?, ?, ?, 'PENDING', 1)");
    $stmt->execute([$vidId, $title, $remotePath, $adminId, time()]);
    
    respond(true, "Archivo indexado correctamente en la cola de procesamiento.");
}

function scanFtpRecursive($pdo, $input) {
    if (!function_exists('ftp_connect')) {
        respond(false, null, "Módulo FTP no disponible.");
    }
    // Implementación futura: Escaneo profundo de directorios remotos
    respond(true, ['scanned' => 0, 'added' => 0], "Escaneo recursivo FTP aún en fase experimental.");
}
?>
