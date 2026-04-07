<?php
/**
 * APP - APK VERSIONING & UPDATE FUNCTIONS
 */

function app_get_latest_version($pdo = null, $userId = null, $clientVersion = null) {
    $root = dirname(__DIR__); // Project root
    
    // 1. Obtener versión de la DB si existe
    $dbVersion = '0.0.0';
    if ($pdo) {
        $stmt = $pdo->query("SELECT latestApkVersion FROM system_settings WHERE id = 1");
        $dbVersion = $stmt->fetchColumn() ?: '0.0.0';
    }

    // 2. Escanear archivos para encontrar el más reciente
    $files = array_merge(
        glob($root . '/StreamPay *.apk'),
        glob($root . '/public/StreamPay *.apk')
    );

    $versions = [];
    foreach ($files as $file) {
        $filename = basename($file);
        if (preg_match('/StreamPay (\d+\.\d+\.\d+)\.apk/i', $filename, $matches)) {
            $versions[] = [
                'version' => $matches[1],
                'filename' => $filename,
                'url' => '/' . $filename 
            ];
        }
    }

    // 3. Si hay archivos, comparar con la DB y tomar el mayor
    $latest = ['version' => $dbVersion, 'url' => null];
    if (!empty($versions)) {
        usort($versions, function($a, $b) {
            return version_compare($b['version'], $a['version']);
        });
        if (version_compare($versions[0]['version'], $dbVersion) >= 0) {
            $latest = $versions[0];
        }
    }

    // 4. Registrar versión del usuario si se proporciona
    if ($pdo && $userId && $clientVersion) {
        $stmt = $pdo->prepare("UPDATE users SET apkVersion = ? WHERE id = ?");
        $stmt->execute([$clientVersion, $userId]);
    }

    // 5. Detectar si es APK basado en UserAgent y X-Requested-With
    $ua = $_SERVER['HTTP_USER_AGENT'] ?? '';
    $requestedWith = $_SERVER['HTTP_X_REQUESTED_WITH'] ?? $_SERVER['HTTP_X_APP_PACKAGE'] ?? '';
    $isAPK = (strpos(strtolower($ua), 'streampayapk') !== false) || 
             (!empty($requestedWith) && !in_array($requestedWith, ['com.android.browser', 'com.android.chrome', 'org.mozilla.firefox', 'com.google.android.apps.maps']));

    $latest['isAPK'] = $isAPK;
    $latest['deviceIdentity'] = parse_user_agent($ua);

    respond(true, $latest);
}
