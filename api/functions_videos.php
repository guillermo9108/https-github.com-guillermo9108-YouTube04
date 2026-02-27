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
    $mediaFilter = $_GET['mediaFilter'] ?? 'ALL';
    $sort = $_GET['sort'] ?? '';

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

    $orderBy = "createdAt DESC";
    if ($sort === 'ALPHA') $orderBy = "title ASC";
    if ($sort === 'LATEST') $orderBy = "createdAt DESC";
    if ($sort === 'RANDOM') $orderBy = "RAND()";

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
    respond(true, "Escaneo completado. $count nuevos archivos encontrados.");
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
