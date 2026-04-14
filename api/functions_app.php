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

    // 2. Escanear archivos para encontrar el más reciente (raíz, public, api)
    // Usamos glob con *.apk y filtramos manualmente para ser insensibles a mayúsculas
    $rawFiles = array_merge(
        glob($root . '/*.apk'),
        glob($root . '/public/*.apk'),
        glob($root . '/api/*.apk')
    );

    $versions = [];
    foreach ($rawFiles as $file) {
        $filename = basename($file);
        // Regex flexible para detectar versiones (ej: StreamPay_v1.0.5.apk, streampay_v0.0.1.apk)
        if (preg_match('/streampay.*v?([\d\.]+)\.apk/i', $filename, $matches)) {
            $url = $filename;
            if (strpos($file, $root . '/api/') === 0) {
                $url = "api/" . $filename;
            } elseif (strpos($file, $root . '/public/') === 0) {
                $url = "public/" . $filename;
            }
            
            $versions[] = [
                'version' => $matches[1],
                'filename' => $filename,
                'url' => $url
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

    // 4. Detectar si es APK basado en UserAgent y X-Requested-With
    $ua = $_SERVER['HTTP_USER_AGENT'] ?? '';
    $requestedWith = $_SERVER['HTTP_X_REQUESTED_WITH'] ?? $_SERVER['HTTP_X_APP_PACKAGE'] ?? '';
    $isAPK = (strpos(strtolower($ua), 'streampayapk') !== false) || 
             (!empty($requestedWith) && !in_array($requestedWith, ['com.android.browser', 'com.android.chrome', 'org.mozilla.firefox', 'com.google.android.apps.maps']));

    // 5. Registrar versión del usuario si se proporciona o se detecta en el UA
    if ($pdo && $userId) {
        // Obtener versión actual de la DB para ver si es NULL
        $stmt = $pdo->prepare("SELECT apkVersion FROM users WHERE id = ?");
        $stmt->execute([$userId]);
        $currentApkVersion = $stmt->fetchColumn();

        $versionToSave = $clientVersion;
        
        // Si no viene en los parámetros, intentar extraer del UA
        if (empty($versionToSave)) {
            if (preg_match('/StreamPayAPK\/([\d\.]+)/i', $ua, $m)) {
                $versionToSave = $m[1];
            }
        }

        // PROPUESTA: Si es NULL en DB y estamos en la APK, inicializar con la última del servidor
        if ($currentApkVersion === null && $isAPK) {
            if (empty($versionToSave)) {
                $versionToSave = $latest['version'];
            }
        }

        if (!empty($versionToSave)) {
            $stmt = $pdo->prepare("UPDATE users SET apkVersion = ? WHERE id = ?");
            $stmt->execute([$versionToSave, $userId]);
        }
    }

    $latest['isAPK'] = $isAPK;
    $latest['deviceIdentity'] = parse_user_agent($ua);
    $latest['foundVersions'] = $versions;

    respond(true, $latest);
}
