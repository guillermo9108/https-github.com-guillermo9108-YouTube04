<?php
/**
 * StreamPay - Módulo de Portabilidad V1.3 (Restauración Masiva Optimizada)
 */

function port_save_backup($pdo, $post, $files) {
    // Aumentar límites para el proceso de guardado
    set_time_limit(300);
    
    $targetPath = rtrim($post['path'] ?? '', '/');
    if (empty($targetPath)) respond(false, null, "La ruta de destino es obligatoria.");

    if (!is_dir($targetPath)) {
        if (!@mkdir($targetPath, 0777, true)) {
            respond(false, null, "No se pudo crear el directorio de destino. Verifique permisos.");
        }
    }

    if (!isset($files['backup']) || $files['backup']['error'] !== UPLOAD_ERR_OK) {
        respond(false, null, "Error al recibir el archivo de backup.");
    }

    $fileName = 'backup_streampay_' . date('Ymd_His') . '.zip';
    $dest = $targetPath . '/' . $fileName;

    if (move_uploaded_file($files['backup']['tmp_name'], $dest)) {
        respond(true, ['file' => $fileName, 'full_path' => $dest]);
    } else {
        respond(false, null, "Error al mover el archivo al destino final.");
    }
}

function port_restore_backup($pdo, $input) {
    // AJUSTES CRÍTICOS PARA 6,000+ REGISTROS
    set_time_limit(900); // 15 minutos
    ini_set('memory_limit', '1G'); // 1 GB RAM para el proceso PHP

    $zipPath = $input['zipPath'] ?? '';
    $videoLibraryPath = rtrim($input['videoLibraryPath'] ?? '', '/');

    if (empty($zipPath) || !file_exists($zipPath)) respond(false, null, "El archivo ZIP no existe o no es accesible.");
    if (empty($videoLibraryPath)) respond(false, null, "Debe especificar la ubicación de los videos.");

    $zip = new ZipArchive();
    if ($zip->open($zipPath) !== TRUE) respond(false, null, "No se pudo abrir el archivo ZIP.");

    // 1. Extraer a carpeta temporal
    $tempDir = __DIR__ . '/temp_restore_' . uniqid();
    mkdir($tempDir);
    $zip->extractTo($tempDir);
    $zip->close();

    $jsonPath = $tempDir . '/database.json';
    if (!file_exists($jsonPath)) {
        port_cleanup($tempDir);
        respond(false, null, "El ZIP no contiene database.json.");
    }

    $data = json_decode(file_get_contents($jsonPath), true);
    if (!$data || !isset($data['videos'])) {
        port_cleanup($tempDir);
        respond(false, null, "Formato de base de datos inválido.");
    }

    // 2. Restaurar Categorías
    $categoriesSynced = 0;
    if (isset($data['system_metadata']['categories'])) {
        $backupCats = $data['system_metadata']['categories'];
        $stmtS = $pdo->query("SELECT categories FROM system_settings WHERE id = 1");
        $currentCats = json_decode($stmtS->fetchColumn() ?: '[]', true);
        
        $newCatList = $currentCats;
        foreach ($backupCats as $bCat) {
            $exists = false;
            foreach ($currentCats as $cCat) {
                if (strcasecmp($bCat['name'], $cCat['name']) === 0) {
                    $exists = true; break;
                }
            }
            if (!$exists) {
                $newCatList[] = $bCat;
                $categoriesSynced++;
            }
        }
        
        if ($categoriesSynced > 0) {
            $pdo->prepare("UPDATE system_settings SET categories = ? WHERE id = 1")->execute([json_encode($newCatList)]);
        }
    }

    // 3. Procesar miniaturas si existen
    $thumbDir = __DIR__ . '/uploads/thumbnails/';
    if (!is_dir($thumbDir)) mkdir($thumbDir, 0777, true);

    if (is_dir($tempDir . '/thumbnails/')) {
        $thumbFiles = glob($tempDir . '/thumbnails/*.jpg');
        foreach ($thumbFiles as $f) {
            @copy($f, $thumbDir . basename($f));
        }
    }

    // 4. Restauración Masiva
    $imported = 0;
    $errors = 0;
    $adminId = $pdo->query("SELECT id FROM users WHERE role='ADMIN' LIMIT 1")->fetchColumn();

    // Desactivar índices temporalmente para velocidad (Opcional, MariaDB suele manejar bien 6k sin esto)
    foreach ($data['videos'] as $v) {
        $relPath = $v['relativePath'] ?? basename($v['videoUrl'] ?? '');
        if (empty($relPath)) continue;

        $relPath = str_replace('\\', '/', $relPath);
        $newAbsolutePath = $videoLibraryPath . '/' . $relPath;
        $newThumbUrl = 'api/uploads/thumbnails/' . basename($v['thumbnailUrl'] ?? 'default.jpg');

        $sql = "INSERT INTO videos (id, title, description, price, thumbnailUrl, videoUrl, creatorId, createdAt, category, parent_category, collection, duration, isLocal, transcode_status) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, 'NONE')
                ON DUPLICATE KEY UPDATE 
                    title = VALUES(title), 
                    description = VALUES(description),
                    price = VALUES(price),
                    thumbnailUrl = VALUES(thumbnailUrl),
                    videoUrl = VALUES(videoUrl),
                    category = VALUES(category),
                    parent_category = VALUES(parent_category),
                    collection = VALUES(collection),
                    duration = VALUES(duration),
                    isLocal = 1";
        
        try {
            $stmt = $pdo->prepare($sql);
            $stmt->execute([
                $v['id'], 
                $v['title'] ?? 'Restaurado', 
                $v['description'] ?? '', 
                floatval($v['price'] ?? 0), 
                $newThumbUrl, 
                $newAbsolutePath,
                $adminId, 
                $v['createdAt'] ?? time(), 
                $v['category'] ?? 'GENERAL', 
                $v['parent_category'] ?? null, 
                $v['collection'] ?? null, 
                intval($v['duration'] ?? 0)
            ]);
            $imported++;
        } catch (Exception $e) {
            $errors++;
        }
    }

    port_cleanup($tempDir);
    respond(true, [
        'imported' => $imported, 
        'errors' => $errors, 
        'categories_synced' => $categoriesSynced
    ]);
}

function port_cleanup($dir) {
    if (!is_dir($dir)) return;
    $it = new RecursiveIteratorIterator(
        new RecursiveDirectoryIterator($dir, RecursiveDirectoryIterator::SKIP_DOTS),
        RecursiveIteratorIterator::CHILD_FIRST
    );
    foreach ($it as $file) {
        if ($file->isDir()) rmdir($file->getRealPath());
        else unlink($file->getRealPath());
    }
    rmdir($dir);
}