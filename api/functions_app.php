<?php
/**
 * APP - APK VERSIONING & UPDATE FUNCTIONS
 */

function app_get_latest_version() {
    $root = dirname(__DIR__); // Project root
    
    // Check root and public/
    $files = array_merge(
        glob($root . '/StreamPay *.apk'),
        glob($root . '/public/StreamPay *.apk')
    );

    if (empty($files)) {
        respond(true, ['version' => '0.0.0', 'url' => null]);
    }

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

    if (empty($versions)) {
        respond(true, ['version' => '0.0.0', 'url' => null]);
    }

    // Sort by version
    usort($versions, function($a, $b) {
        return version_compare($b['version'], $a['version']);
    });

    respond(true, $versions[0]);
}
