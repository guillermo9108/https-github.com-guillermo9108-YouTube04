<?php
/**
 * VIDEOS - CORE FUNCTIONS V21.2 (NAS Library & Pagination Fix)
 */

function video_get_all($pdo) {
    $page = intval($_GET['page'] ?? 0);
    $limit = intval($_GET['limit'] ?? 40);
    $offset = $page * $limit;
    
    $folder = $_GET['folder'] ?? '';
    $query = $_GET['q'] ?? '';
    $category = $_GET['category'] ?? 'TODOS';
    $mediaFilter = $_GET['mediaFilter'] ?? $_GET['media_type'] ?? 'ALL';
    $sort = $_GET['sort'] ?? $_GET['sort_order'] ?? '';

    $where = ["transcode_status != 'PROCESSING'"];
    $params = [];

    if ($folder) {
        $where[] = "videoUrl LIKE ?";
        $params[] = "%$folder/%";
    }
    if ($query) {
        $where[] = "(title LIKE ? OR description LIKE ?)";
        $params[] = "%$query%";
        $params[] = "%$query%";
    }
    if ($category !== 'TODOS') {
        $where[] = "category = ?";
        $params[] = $category;
    }
    if ($mediaFilter === 'VIDEO') $where[] = "is_audio = 0";
    if ($mediaFilter === 'AUDIO') $where[] = "is_audio = 1";
    if ($mediaFilter === 'SHORTS') {
        $where[] = "is_audio = 0 AND duration < 60";
    }

    $orderBy = "createdAt DESC";
    if ($sort === 'ALPHA') $orderBy = "title ASC";
    if ($sort === 'LATEST' || $sort === 'recent') $orderBy = "createdAt DESC";
    if ($sort === 'RANDOM') $orderBy = "RAND()";
    if ($sort === 'views' || $sort === 'POPULAR') $orderBy = "views DESC";
    if ($sort === 'price_asc') $orderBy = "price ASC";
    if ($sort === 'price_desc') $orderBy = "price DESC";

    $whereSql = implode(" AND ", $where);
    
    // 1. Obtener Videos
    $sql = "SELECT * FROM videos WHERE $whereSql ORDER BY $orderBy LIMIT $limit OFFSET $offset";
    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    $videos = $stmt->fetchAll();
    
    foreach ($videos as &$v) {
        $v['thumbnailUrl'] = fix_url($v['thumbnailUrl']);
        // Para el front, necesitamos saber la ruta relativa para breadcrumbs si filtramos
        $v['rawPath'] = $v['videoUrl']; 
    }

    // 2. Obtener Carpetas (solo si no hay búsqueda global o estamos en raíz)
    $folders = [];
    if (empty($query) || $folder) {
        $stmtS = $pdo->query("SELECT localLibraryPath FROM system_settings WHERE id = 1");
        $root = rtrim($stmtS->fetchColumn() ?: '', '/');
        $currentFullPath = $root . ($folder ? '/' . $folder : '');
        
        if (is_dir($currentFullPath)) {
            $items = scandir($currentFullPath);
            foreach ($items as $item) {
                if ($item === '.' || $item === '..') continue;
                $full = $currentFullPath . '/' . $item;
                if (is_dir($full)) {
                    $rel = ltrim(str_replace($root, '', $full), '/');
                    // Contar items dentro
                    $count = $pdo->query("SELECT COUNT(*) FROM videos WHERE videoUrl LIKE '$full/%'")->fetchColumn();
                    if ($count > 0) {
                        // Buscar una miniatura representativa
                        $thumb = $pdo->query("SELECT thumbnailUrl FROM videos WHERE videoUrl LIKE '$full/%' AND thumbnailUrl IS NOT NULL LIMIT 1")->fetchColumn();
                        $folders[] = [
                            'name' => $item,
                            'count' => (int)$count,
                            'thumbnailUrl' => fix_url($thumb),
                            'relativePath' => $rel
                        ];
                    }
                }
            }
        }
    }

    // 3. Categorías activas en este contexto
    $catSql = "SELECT DISTINCT category FROM videos WHERE $whereSql";
    $stmtC = $pdo->prepare($catSql);
    $stmtC->execute($params);
    $activeCats = $stmtC->fetchAll(PDO::FETCH_COLUMN);

    $total = $pdo->prepare("SELECT COUNT(*) FROM videos WHERE $whereSql");
    $total->execute($params);
    $count = $total->fetchColumn();

    respond(true, [
        'videos' => $videos,
        'folders' => $folders,
        'activeCategories' => $activeCats,
        'hasMore' => ($offset + $limit) < $count,
        'total' => (int)$count
    ]);
}

function video_get_one($pdo, $id) {
    $stmt = $pdo->prepare("SELECT v.*, u.username as creatorName, u.avatarUrl as creatorAvatarUrl FROM videos v LEFT JOIN users u ON v.creatorId = u.id WHERE v.id = ?");
    $stmt->execute([$id]); $v = $stmt->fetch();
    if ($v) {
        $v['thumbnailUrl'] = fix_url($v['thumbnailUrl']);
        $v['creatorAvatarUrl'] = fix_url($v['creatorAvatarUrl']);
        respond(true, $v);
    }
    respond(false, null, "Video no encontrado");
}

function video_get_related($pdo, $id) {
    $stmt = $pdo->prepare("SELECT category FROM videos WHERE id = ?");
    $stmt->execute([$id]); $cat = $stmt->fetchColumn();
    $stmt = $pdo->prepare("SELECT * FROM videos WHERE category = ? AND id != ? ORDER BY RAND() LIMIT 8");
    $stmt->execute([$cat, $id]);
    $res = $stmt->fetchAll();
    foreach ($res as &$v) $v['thumbnailUrl'] = fix_url($v['thumbnailUrl']);
    respond(true, $res);
}

function video_upload($pdo, $post, $files) {
    $id = 'v_' . uniqid();
    $targetDir = 'uploads/videos/';
    if (!is_dir($targetDir)) mkdir($targetDir, 0777, true);
    
    $ext = pathinfo($files['video']['name'], PATHINFO_EXTENSION);
    $videoPath = $targetDir . $id . '.' . $ext;
    move_uploaded_file($files['video']['tmp_name'], $videoPath);
    
    $thumbUrl = 'api/uploads/thumbnails/default.jpg';
    if (isset($files['thumbnail'])) {
        $tDir = 'uploads/thumbnails/';
        if (!is_dir($tDir)) mkdir($tDir, 0777, true);
        $tPath = $tDir . $id . '.jpg';
        move_uploaded_file($files['thumbnail']['tmp_name'], $tPath);
        $thumbUrl = 'api/' . $tPath;
    }
    
    $pdo->prepare("INSERT INTO videos (id, title, description, price, thumbnailUrl, videoUrl, creatorId, createdAt, category, isLocal) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)")
        ->execute([$id, $post['title'], $post['description'], floatval($post['price']), $thumbUrl, 'api/' . $videoPath, $post['creatorId'], time(), $post['category']]);
    
    respond(true, ['id' => $id]);
}

function video_scan_local($pdo, $input) {
    $path = rtrim($input['path'], '/');
    if (!is_dir($path)) respond(false, null, "Ruta no válida o inaccesible");
    
    $it = new RecursiveIteratorIterator(new RecursiveDirectoryIterator($path));
    $count = 0;
    foreach ($it as $file) {
        if ($file->isDir()) continue;
        $ext = strtolower($file->getExtension());
        if (in_array($ext, ['mp4', 'mkv', 'avi', 'mov', 'ts', 'mp3', 'wav', 'flac', 'm4a'])) {
            $fullPath = str_replace('\\', '/', $file->getRealPath());
            $stmt = $pdo->prepare("SELECT id FROM videos WHERE videoUrl = ?");
            $stmt->execute([$fullPath]);
            if (!$stmt->fetch()) {
                $id = 'loc_' . md5($fullPath);
                $isAudio = in_array($ext, ['mp3', 'wav', 'flac', 'm4a']) ? 1 : 0;
                $pdo->prepare("INSERT INTO videos (id, title, videoUrl, category, createdAt, isLocal, is_audio, transcode_status) VALUES (?, ?, ?, 'PENDING', ?, 1, ?, 'NONE')")
                    ->execute([$id, $file->getBasename('.' . $file->getExtension()), $fullPath, time(), $isAudio]);
                $count++;
            }
        }
    }
    respond(true, [
        'totalFound' => $it->count() ?? $count, // Aproximación si no es contable
        'newToImport' => $count,
        'errors' => []
    ]);
}

function video_delete($pdo, $input) {
    $id = $input['id'];
    $stmt = $pdo->prepare("SELECT videoUrl, thumbnailUrl, isLocal FROM videos WHERE id = ?");
    $stmt->execute([$id]); $v = $stmt->fetch();
    if ($v) {
        // Solo borrar archivos si están en la carpeta de la API (no borrar de la biblioteca del NAS)
        if (strpos($v['videoUrl'], 'api/uploads/') === 0) {
            $p = str_replace('api/', '', $v['videoUrl']);
            if (file_exists($p)) unlink($p);
        }
        if (strpos($v['thumbnailUrl'], 'api/uploads/') === 0) {
            $p = str_replace('api/', '', $v['thumbnailUrl']);
            if (file_exists($p)) unlink($p);
        }
        $pdo->prepare("DELETE FROM videos WHERE id = ?")->execute([$id]);
        respond(true);
    }
    respond(false, null, "No encontrado");
}

function video_smart_organize($pdo) {
    $stmt = $pdo->query("SELECT id, title, videoUrl FROM videos WHERE category = 'PENDING'");
    $count = 0;
    $sets = $pdo->query("SELECT * FROM system_settings WHERE id = 1")->fetch();
    while ($v = $stmt->fetch()) {
        if (video_organize_single($pdo, $v['id'], $sets)) $count++;
    }
    respond(true, "Se organizaron $count videos automáticamente.");
}

function video_organize_single($pdo, $id, $sets) {
    $stmt = $pdo->prepare("SELECT * FROM videos WHERE id = ?");
    $stmt->execute([$id]); $v = $stmt->fetch();
    
    $path = $v['videoUrl'];
    $root = rtrim($sets['localLibraryPath'] ?? '', '/');
    
    // Si está en la biblioteca local, intentar sacar categoría de la carpeta
    if ($root && strpos($path, $root) === 0) {
        $rel = ltrim(str_replace($root, '', $path), '/');
        $parts = explode('/', $rel);
        if (count($parts) > 1) {
            $cat = strtoupper($parts[0]);
            $parent = count($parts) > 2 ? strtoupper($parts[count($parts)-2]) : null;
            $pdo->prepare("UPDATE videos SET category = ?, parent_category = ? WHERE id = ?")->execute([$cat, $parent, $id]);
            return true;
        }
    }
    return false;
}

function video_get_by_creator($pdo, $userId) {
    $stmt = $pdo->prepare("SELECT * FROM videos WHERE creatorId = ? ORDER BY createdAt DESC");
    $stmt->execute([$userId]);
    $res = $stmt->fetchAll();
    foreach ($res as &$v) $v['thumbnailUrl'] = fix_url($v['thumbnailUrl']);
    respond(true, $res);
}

function video_get_unprocessed($pdo) {
    $limit = intval($_GET['limit'] ?? 50);
    $mode = $_GET['mode'] ?? 'normal';
    
    $sql = "SELECT * FROM videos WHERE (thumbnailUrl IS NULL OR thumbnailUrl = '' OR duration = 0)";
    if ($mode === 'transcode') {
        $sql = "SELECT * FROM videos WHERE transcode_status = 'WAITING'";
    }
    
    $sql .= " ORDER BY createdAt DESC LIMIT $limit";
    respond(true, $pdo->query($sql)->fetchAll());
}

function video_update_metadata($pdo, $post, $files) {
    $id = $post['id'];
    $duration = intval($post['duration'] ?? 0);
    $success = ($post['success'] ?? '1') === '1';
    
    $fields = ["duration = ?", "processing_attempts = processing_attempts + 1"];
    $params = [$duration];
    
    if (isset($files['thumbnail'])) {
        $tDir = 'uploads/thumbnails/';
        if (!is_dir($tDir)) mkdir($tDir, 0777, true);
        $tPath = $tDir . $id . '.jpg';
        move_uploaded_file($files['thumbnail']['tmp_name'], $tPath);
        $fields[] = "thumbnailUrl = ?";
        $params[] = 'api/' . $tPath;
    }
    
    if (!$success) {
        $fields[] = "transcode_status = 'FAILED'";
    } else if ($duration > 0) {
        $fields[] = "transcode_status = 'DONE'";
    }
    
    $params[] = $id;
    $pdo->prepare("UPDATE videos SET " . implode(', ', $fields) . " WHERE id = ?")->execute($params);
    respond(true);
}

function video_get_scan_folders($pdo) {
    $stmt = $pdo->query("SELECT localLibraryPath FROM system_settings WHERE id = 1");
    $root = rtrim($stmt->fetchColumn() ?: '', '/');
    if (!$root || !is_dir($root)) respond(true, []);
    
    $folders = [];
    $items = scandir($root);
    foreach ($items as $item) {
        if ($item === '.' || $item === '..') continue;
        if (is_dir($root . '/' . $item)) {
            $folders[] = [
                'name' => $item,
                'path' => $root . '/' . $item,
                'relativePath' => $item
            ];
        }
    }
    respond(true, $folders);
}

function video_get_admin_stats($pdo) {
    $stats = [
        'pending' => (int)$pdo->query("SELECT COUNT(*) FROM videos WHERE category = 'PENDING'")->fetchColumn(),
        'locked' => (int)$pdo->query("SELECT COUNT(*) FROM videos WHERE transcode_status = 'PROCESSING'")->fetchColumn(),
        'available' => (int)$pdo->query("SELECT COUNT(*) FROM videos WHERE (thumbnailUrl IS NULL OR thumbnailUrl = '' OR duration = 0) AND transcode_status != 'PROCESSING'")->fetchColumn(),
        'processing' => (int)$pdo->query("SELECT COUNT(*) FROM videos WHERE transcode_status = 'WAITING'")->fetchColumn(),
        'broken' => (int)$pdo->query("SELECT COUNT(*) FROM videos WHERE duration = 0 AND transcode_status = 'DONE'")->fetchColumn(),
        'failed' => (int)$pdo->query("SELECT COUNT(*) FROM videos WHERE transcode_status = 'FAILED'")->fetchColumn(),
        'total' => (int)$pdo->query("SELECT COUNT(*) FROM videos")->fetchColumn()
    ];
    respond(true, $stats);
}

function video_process_batch($pdo) {
    // Esta función suele ser llamada para iniciar el procesamiento de videos pendientes
    // En este entorno, simplemente devolvemos éxito y dejamos que el worker haga su trabajo
    respond(true, "Procesamiento de lote iniciado.");
}

function video_reorganize_all($pdo) {
    $stmtS = $pdo->query("SELECT * FROM system_settings WHERE id = 1");
    $sets = $stmtS->fetch();
    $stmt = $pdo->query("SELECT id FROM videos WHERE isLocal = 1");
    $count = 0;
    while ($v = $stmt->fetch()) {
        if (video_organize_single($pdo, $v['id'], $sets)) $count++;
    }
    respond(true, "Se reorganizaron $count videos.");
}

function video_fix_metadata($pdo) {
    // Intenta corregir metadatos básicos como categorías vacías
    $pdo->exec("UPDATE videos SET category = 'GENERAL' WHERE category IS NULL OR category = '' OR category = 'PENDING'");
    respond(true, "Metadatos de la biblioteca corregidos.");
}
