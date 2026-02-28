<?php
/**
 * VIDEOS - CORE FUNCTIONS V22.0 (Sort Order Fix - Herencia de Orden)
 */

function video_process_rows(&$rows) {
    if (!$rows) return;
    foreach ($rows as &$v) {
        $v['rawPath'] = $v['videoUrl'];
        $isLocal = (isset($v['isLocal']) && ($v['isLocal'] == 1 || $v['isLocal'] === "1" || $v['isLocal'] === true));
        $isUploaded = (strpos($v['videoUrl'] ?? '', 'uploads/videos/') !== false);
        if ($isLocal || $isUploaded) {
            $v['videoUrl'] = "api/index.php?action=stream&id=" . $v['id'];
            $v['isLocal'] = true;
        }
        if (isset($v['thumbnailUrl'])) { $v['thumbnailUrl'] = fix_url($v['thumbnailUrl']); }
        if (isset($v['creatorAvatarUrl'])) { $v['creatorAvatarUrl'] = fix_url($v['creatorAvatarUrl']); }
        if (!isset($v['transcode_status'])) $v['transcode_status'] = 'NONE';
        $ext = strtolower(pathinfo($v['rawPath'] ?? '', PATHINFO_EXTENSION));
        $v['is_audio'] = (isset($v['is_audio']) && $v['is_audio'] == 1) || in_array($ext, ['mp3', 'wav', 'aac', 'm4a', 'flac']);
    }
}

/**
 * Obtiene el sortOrder configurado para una carpeta o categoría
 * HERENCIA RECURSIVA: Busca en toda la jerarquía de carpetas padre hasta encontrar un sortOrder configurado
 * Prioridad: carpeta actual -> carpetas padre (recursivo) -> categoría -> default
 */
function get_folder_sort_order($pdo, $folderPath, $categoryName = '') {
    $stmt = $pdo->query("SELECT categories FROM system_settings WHERE id = 1");
    $categories = json_decode($stmt->fetchColumn() ?: '[]', true);

    // Crear un mapa de categorías por nombre para búsqueda rápida
    $catMap = [];
    foreach ($categories as $cat) {
        $catMap[strtolower($cat['name'])] = $cat;
    }

    // 1. Buscar por ruta de carpeta completa (recursiva hacia arriba)
    if ($folderPath) {
        // Normalizar la ruta
        $folderPath = str_replace('\\', '/', $folderPath);
        $pathParts = array_filter(explode('/', $folderPath));

        // Buscar desde la carpeta más específica hasta la raíz
        while (count($pathParts) > 0) {
            $currentFolder = end($pathParts);
            $lowerFolder = strtolower($currentFolder);

            if (isset($catMap[$lowerFolder]) && !empty($catMap[$lowerFolder]['sortOrder'])) {
                return $catMap[$lowerFolder]['sortOrder'];
            }

            // Subir un nivel
            array_pop($pathParts);
        }
    }

    // 2. Buscar por categoría del video si se proporciona
    if ($categoryName && $categoryName !== 'TODOS') {
        $lowerCat = strtolower($categoryName);
        if (isset($catMap[$lowerCat]) && !empty($catMap[$lowerCat]['sortOrder'])) {
            return $catMap[$lowerCat]['sortOrder'];
        }
    }

    return 'LATEST'; // Default
}

/**
 * Obtiene las categorías hijas de una carpeta específica
 * Solo retorna categorías que existen en videos dentro de esa carpeta
 */
function get_child_categories($pdo, $folderPath) {
    $stmtS = $pdo->query("SELECT localLibraryPath FROM system_settings WHERE id = 1");
    $rootPath = rtrim($stmtS->fetchColumn(), '/\\');

    if (empty($folderPath)) {
        // En la raíz, retornar todas las categorías
        return $pdo->query("SELECT DISTINCT category FROM videos WHERE category NOT IN ('PENDING','PROCESSING','FAILED_METADATA')")->fetchAll(PDO::FETCH_COLUMN);
    }

    // Construir el path completo
    $fullPath = str_replace('\\', '/', $rootPath . '/' . $folderPath) . '/%';

    $stmt = $pdo->prepare("SELECT DISTINCT category FROM videos WHERE videoUrl LIKE ? AND category NOT IN ('PENDING','PROCESSING','FAILED_METADATA')");
    $stmt->execute([$fullPath]);
    return $stmt->fetchAll(PDO::FETCH_COLUMN);
}

function video_get_all($pdo) {
    $limit = intval($_GET['limit'] ?? 40); 
    $offset = intval($_GET['offset'] ?? 0);
    $search = trim($_GET['search'] ?? ''); 
    $folder = trim($_GET['folder'] ?? ''); 
    $category = trim($_GET['category'] ?? ''); 
    $mediaType = trim($_GET['media_type'] ?? 'ALL');
    $userSort = trim($_GET['sort_order'] ?? ''); 
    $isShorts = !empty($_GET['shorts']); 

    $params = []; 
    $where = ["v.category NOT IN ('PENDING', 'PROCESSING', 'FAILED_METADATA')"];

    if ($isShorts) { $where[] = "v.duration < 180"; }
    if (!empty($search)) { $where[] = "v.title LIKE ?"; $params[] = "%$search%"; }
    if ($mediaType === 'VIDEO') { $where[] = "v.is_audio = 0"; } 
    elseif ($mediaType === 'AUDIO') { $where[] = "v.is_audio = 1"; }
    if (!empty($category) && $category !== 'TODOS') { $where[] = "v.category = ?"; $params[] = $category; }

    $rootPath = '';
    if (!empty($folder)) {
        $stmtS = $pdo->query("SELECT localLibraryPath FROM system_settings WHERE id = 1");
        $rootPath = rtrim($stmtS->fetchColumn(), '/\\');
        $folderPath = str_replace('\\', '/', $rootPath . '/' . $folder) . '/%';
        $where[] = "v.videoUrl LIKE ?"; 
        $params[] = $folderPath;
    }

    $whereClause = implode(" AND ", $where);

    // CLAVE: Determinar el orden a usar
    // Prioridad: 1) userSort del frontend, 2) sortOrder de la carpeta/categoría, 3) LATEST
    $effectiveSort = $userSort;
    if (empty($effectiveSort)) {
        $effectiveSort = get_folder_sort_order($pdo, $folder, $category);
    }

    // Construir ORDER BY
    if ($isShorts || $effectiveSort === 'RANDOM') {
        $orderBy = "RAND()";
    } elseif ($effectiveSort === 'ALPHA') {
        $orderBy = "v.title ASC";
    } else {
        // LATEST o default
        $orderBy = "v.createdAt DESC";
    }

    $sql = "SELECT v.*, u.username as creatorName, u.avatarUrl as creatorAvatarUrl, u.role as creatorRole 
            FROM videos v LEFT JOIN users u ON v.creatorId = u.id 
            WHERE $whereClause ORDER BY $orderBy LIMIT $limit OFFSET $offset";

    $stmt = $pdo->prepare($sql); 
    $stmt->execute($params); 
    $videos = $stmt->fetchAll(PDO::FETCH_ASSOC);

    $total = $pdo->prepare("SELECT COUNT(*) FROM videos v WHERE $whereClause"); 
    $total->execute($params);
    $totalCount = $total->fetchColumn();

    $subfolders = video_discover_subfolders($pdo, $folder, $search);

    // Obtener categorías activas DENTRO de la carpeta actual (no globales)
    if (!empty($folder)) {
        // Si estamos en una carpeta, mostrar solo categorías de esa carpeta
        $catParams = [$folderPath];
        $activeCatsSql = "SELECT DISTINCT category FROM videos WHERE videoUrl LIKE ? AND category NOT IN ('PENDING','PROCESSING','FAILED_METADATA')";
        $activeCatsStmt = $pdo->prepare($activeCatsSql);
        $activeCatsStmt->execute($catParams);
        $activeCategories = $activeCatsStmt->fetchAll(PDO::FETCH_COLUMN);
    } else {
        // En la raíz, mostrar todas las categorías globales
        $activeCategories = $pdo->query("SELECT DISTINCT category FROM videos WHERE category NOT IN ('PENDING','PROCESSING','FAILED_METADATA')")->fetchAll(PDO::FETCH_COLUMN);
    }

    video_process_rows($videos);

    // Información adicional de navegación
    $navigationInfo = null;
    if (!empty($category) && $category !== 'TODOS' && empty($folder) && count($videos) > 0) {
        // Si estamos filtrando por categoría sin carpeta, encontrar la carpeta padre
        $firstVideo = $videos[0];
        $videoPath = $firstVideo['rawPath'] ?? $firstVideo['videoUrl'] ?? '';

        $stmtNav = $pdo->query("SELECT localLibraryPath FROM system_settings WHERE id = 1");
        $rootNav = rtrim($stmtNav->fetchColumn(), '/\\');

        if ($rootNav && strpos($videoPath, $rootNav) === 0) {
            $relPath = trim(substr($videoPath, strlen($rootNav)), '/\\');
            $segments = array_filter(explode('/', str_replace('\\', '/', $relPath)));
            $segments = array_values($segments);

            if (count($segments) > 1) {
                // Quitar el nombre del archivo
                array_pop($segments);
                $navigationInfo = [
                    'suggestedPath' => $segments,
                    'parentFolder' => end($segments)
                ];
            }
        }
    }

    respond(true, [
        'videos' => $videos, 
        'folders' => $subfolders, 
        'activeCategories' => $activeCategories, 
        'total' => (int)$totalCount, 
        'hasMore' => ($offset + $limit) < $totalCount,
        'appliedSortOrder' => $effectiveSort,
        'navigationInfo' => $navigationInfo
    ]);
}

function video_get_one($pdo, $id) {
    $stmt = $pdo->prepare("SELECT v.*, u.username as creatorName, u.avatarUrl as creatorAvatarUrl, u.role as creatorRole FROM videos v LEFT JOIN users u ON v.creatorId = u.id WHERE v.id = ?");
    $stmt->execute([$id]); 
    $v = $stmt->fetch(PDO::FETCH_ASSOC); 
    if (!$v) respond(false, null, "No encontrado");

    // Obtener el sortOrder de la carpeta/categoría del video
    $videoPath = $v['videoUrl'] ?? '';
    $stmtS = $pdo->query("SELECT localLibraryPath FROM system_settings WHERE id = 1");
    $rootPath = rtrim($stmtS->fetchColumn(), '/\\');

    $relativePath = '';
    if ($rootPath && strpos($videoPath, $rootPath) === 0) {
        $relativePath = trim(substr($videoPath, strlen($rootPath)), '/\\');
        $relativePath = dirname($relativePath);
    }

    $v['folderSortOrder'] = get_folder_sort_order($pdo, $relativePath, $v['category']);

    $rows = [$v]; 
    video_process_rows($rows); 
    respond(true, $rows[0]);
}

function video_get_by_creator($pdo, $userId) {
    $stmt = $pdo->prepare("SELECT * FROM videos WHERE creatorId = ? ORDER BY createdAt DESC");
    $stmt->execute([$userId]); 
    $videos = $stmt->fetchAll(PDO::FETCH_ASSOC);
    video_process_rows($videos); 
    respond(true, $videos);
}

function video_get_related($pdo, $videoId) {
    // Obtener el video actual
    $stmtV = $pdo->prepare("SELECT category, videoUrl FROM videos WHERE id = ?"); 
    $stmtV->execute([$videoId]); 
    $currentVideo = $stmtV->fetch();

    if (!$currentVideo) {
        respond(true, []);
        return;
    }

    $cat = $currentVideo['category'];
    $videoPath = $currentVideo['videoUrl'];

    // Obtener el sortOrder de la carpeta/categoría
    $stmtS = $pdo->query("SELECT localLibraryPath FROM system_settings WHERE id = 1");
    $rootPath = rtrim($stmtS->fetchColumn(), '/\\');

    $relativePath = '';
    if ($rootPath && strpos($videoPath, $rootPath) === 0) {
        $relativePath = trim(substr($videoPath, strlen($rootPath)), '/\\');
        $relativePath = dirname($relativePath);
    }

    $sortOrder = get_folder_sort_order($pdo, $relativePath, $cat);

    // Construir ORDER BY según sortOrder
    if ($sortOrder === 'RANDOM') {
        $orderBy = "RAND()";
    } elseif ($sortOrder === 'ALPHA') {
        $orderBy = "title ASC";
    } else {
        $orderBy = "createdAt DESC";
    }

    $stmt = $pdo->prepare("SELECT * FROM videos WHERE category = ? AND id != ? ORDER BY $orderBy LIMIT 12");
    $stmt->execute([$cat, $videoId]); 
    $videos = $stmt->fetchAll();
    video_process_rows($videos); 
    respond(true, $videos);
}

/**
 * Obtiene videos de la misma carpeta con el orden configurado
 */
function video_get_folder_videos($pdo, $videoId) {
    $stmtV = $pdo->prepare("SELECT videoUrl, category FROM videos WHERE id = ?");
    $stmtV->execute([$videoId]);
    $currentVideo = $stmtV->fetch();

    if (!$currentVideo) {
        respond(true, ['videos' => [], 'sortOrder' => 'LATEST']);
        return;
    }

    $videoPath = $currentVideo['videoUrl'];
    $category = $currentVideo['category'];

    // Obtener la carpeta del video
    $stmtS = $pdo->query("SELECT localLibraryPath FROM system_settings WHERE id = 1");
    $rootPath = rtrim($stmtS->fetchColumn(), '/\\');

    $folderPath = dirname($videoPath);
    $relativePath = '';
    if ($rootPath && strpos($folderPath, $rootPath) === 0) {
        $relativePath = trim(substr($folderPath, strlen($rootPath)), '/\\');
    }

    // Obtener el sortOrder configurado
    $sortOrder = get_folder_sort_order($pdo, $relativePath, $category);

    // Construir ORDER BY según sortOrder
    if ($sortOrder === 'RANDOM') {
        $orderBy = "RAND()";
    } elseif ($sortOrder === 'ALPHA') {
        $orderBy = "title ASC";
    } else {
        $orderBy = "createdAt DESC";
    }

    // Obtener videos de la misma carpeta
    $folderMatch = str_replace('\\', '/', $folderPath) . '/%';
    $stmt = $pdo->prepare("SELECT v.*, u.username as creatorName, u.avatarUrl as creatorAvatarUrl, u.role as creatorRole 
                           FROM videos v LEFT JOIN users u ON v.creatorId = u.id 
                           WHERE v.videoUrl LIKE ? AND v.category NOT IN ('PENDING', 'PROCESSING', 'FAILED_METADATA')
                           ORDER BY $orderBy");
    $stmt->execute([$folderMatch]);
    $videos = $stmt->fetchAll(PDO::FETCH_ASSOC);

    video_process_rows($videos);

    respond(true, ['videos' => $videos, 'sortOrder' => $sortOrder]);
}

/**
 * FIXED: Uso de bindValue para evitar comillas en LIMIT
 */
function video_get_unprocessed($pdo) {
    $limit = intval($_GET['limit'] ?? 50);
    $timeLimit = time() - 300;
    $stmt = $pdo->prepare("SELECT * FROM videos WHERE category = 'PENDING' AND processing_attempts < 3 AND locked_at < :time ORDER BY createdAt ASC LIMIT :limit");
    $stmt->bindValue(':time', $timeLimit, PDO::PARAM_INT);
    $stmt->bindValue(':limit', $limit, PDO::PARAM_INT);
    $stmt->execute();
    $videos = $stmt->fetchAll(PDO::FETCH_ASSOC);
    video_process_rows($videos); 
    respond(true, $videos);
}

function video_discover_subfolders($pdo, $currentRelPath = '', $search = '') {
    $stmt = $pdo->query("SELECT localLibraryPath, categories FROM system_settings WHERE id = 1");
    $settings = $stmt->fetch();
    $root = rtrim($settings['localLibraryPath'], '/\\'); 
    $categories = json_decode($settings['categories'] ?: '[]', true);

    if (empty($root) || !is_dir($root)) return [];

    $fullPath = str_replace('\\', '/', $root . '/' . $currentRelPath); 
    if (!is_dir($fullPath)) return [];

    $items = scandir($fullPath); 
    $folders = [];

    // Obtener sortOrder de la carpeta actual para ordenar las subcarpetas
    $parentSortOrder = get_folder_sort_order($pdo, $currentRelPath, '');

    foreach ($items as $item) {
        if ($item === '.' || $item === '..' || strpos($item, '.') === 0) continue;
        $itemPath = $fullPath . '/' . $item;
        if (is_dir($itemPath)) {
            if (!empty($search) && stripos($item, $search) === false) continue;
            $rel = ltrim(str_replace($root, '', $itemPath), '/\\');
            $match = str_replace('\\', '/', $itemPath) . '/%';
            $count = $pdo->prepare("SELECT COUNT(*) FROM videos WHERE videoUrl LIKE ? AND category NOT IN ('PENDING','PROCESSING','FAILED_METADATA')");
            $count->execute([$match]); 
            $total = (int)$count->fetchColumn();
            if ($total > 0 || empty($search)) {
                $thumb = $pdo->prepare("SELECT thumbnailUrl FROM videos WHERE videoUrl LIKE ? AND category NOT IN ('PENDING','PROCESSING','FAILED_METADATA') LIMIT 1");
                $thumb->execute([$match]);

                // Buscar sortOrder específico de esta subcarpeta con herencia
                // Usar la función mejorada get_folder_sort_order que hace herencia recursiva
                $folderSortOrder = get_folder_sort_order($pdo, $rel, '');

                $folders[] = [
                    'name' => $item, 
                    'relativePath' => $rel, 
                    'count' => $total, 
                    'thumbnailUrl' => fix_url($thumb->fetchColumn()),
                    'sortOrder' => $folderSortOrder,
                    'inheritedSort' => true  // Indica que puede estar heredando del padre
                ];
            }
        }
    }

    // Ordenar las carpetas según el sortOrder del padre
    if ($parentSortOrder === 'ALPHA') {
        usort($folders, function($a, $b) {
            return strcasecmp($a['name'], $b['name']);
        });
    } elseif ($parentSortOrder === 'RANDOM') {
        shuffle($folders);
    }
    // LATEST: mantener orden original del sistema de archivos

    return $folders;
}

function video_upload($pdo, $post, $files) {
    $id = 'v_' . uniqid();
    $videoPath = null; 
    if (isset($files['video']) && $files['video']['error'] === UPLOAD_ERR_OK) {
        $ext = pathinfo($files['video']['name'], PATHINFO_EXTENSION); 
        $videoName = "{$id}.{$ext}";
        if (!is_dir('uploads/videos/')) mkdir('uploads/videos/', 0777, true);
        move_uploaded_file($files['video']['tmp_name'], 'uploads/videos/' . $videoName);
        $videoPath = 'uploads/videos/' . $videoName;
    }
    $thumbPath = 'api/uploads/thumbnails/default.jpg'; 
    if (isset($files['thumbnail']) && $files['thumbnail']['error'] === UPLOAD_ERR_OK) {
        $thumbName = "t_{$id}.jpg"; 
        if (!is_dir('uploads/thumbnails/')) mkdir('uploads/thumbnails/', 0777, true);
        move_uploaded_file($files['thumbnail']['tmp_name'], 'uploads/thumbnails/' . $thumbName);
        $thumbPath = 'api/uploads/thumbnails/' . $thumbName;
    }
    $stmt = $pdo->prepare("INSERT INTO videos (id, title, description, price, category, duration, videoUrl, thumbnailUrl, creatorId, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
    $stmt->execute([$id, $post['title'], $post['description'], floatval($post['price']), $post['category'], intval($post['duration']), $videoPath, $thumbPath, $post['userId'], time()]);

    require_once 'functions_interactions.php';
    interact_notify_subscribers($pdo, $post['userId'], 'UPLOAD', "Nuevo contenido: {$post['title']}", "/watch/{$id}", $thumbPath);

    respond(true);
}

function video_update_metadata($pdo, $post, $files) {
    $id = $post['id']; 
    $success = ($post['success'] ?? '1') === '1';
    if (!$success) { 
        $pdo->prepare("UPDATE videos SET processing_attempts = processing_attempts + 1, locked_at = 0 WHERE id = ?")->execute([$id]); 
        respond(true); 
    }
    $fields = ["duration = ?", "processing_attempts = 0", "locked_at = 0"]; 
    $params = [intval($post['duration'])];
    if (isset($files['thumbnail']) && $files['thumbnail']['error'] === UPLOAD_ERR_OK) {
        $thumbName = "t_{$id}.jpg"; 
        move_uploaded_file($files['thumbnail']['tmp_name'], 'uploads/thumbnails/' . $thumbName);
        $fields[] = "thumbnailUrl = ?"; 
        $params[] = 'api/uploads/thumbnails/' . $thumbName;
    }
    $params[] = $id; 
    $pdo->prepare("UPDATE videos SET " . implode(", ", $fields) . " WHERE id = ?")->execute($params);
    $settings = $pdo->query("SELECT * FROM system_settings WHERE id = 1")->fetch();
    video_organize_single($pdo, $id, $settings); 
    respond(true);
}

function video_organize_single($pdo, $id, $settings) {
    $stmt = $pdo->prepare("SELECT * FROM videos WHERE id = ?"); 
    $stmt->execute([$id]); 
    $v = $stmt->fetch(); 
    if (!$v) return;
    $meta = smartParseFilename($v['videoUrl'], $v['category'], json_decode($settings['categories'] ?? '[]', true));
    $price = (floatval($v['price'] ?? 0) > 0) ? $v['price'] : getPriceForCategory($meta['category'], $settings, $meta['parent_category']);
    $pdo->prepare("UPDATE videos SET title = ?, category = ?, parent_category = ?, collection = ?, price = ? WHERE id = ?")->execute([$meta['title'], $meta['category'], $meta['parent_category'], $meta['collection'], $price, $id]);

    require_once 'functions_interactions.php';
    interact_notify_subscribers($pdo, $v['creatorId'], 'UPLOAD', "¡Nuevo contenido! {$meta['title']}", "/watch/{$id}", $v['thumbnailUrl']);
}

function video_scan_local($pdo, $input) {
    $scanPath = rtrim($input['path'], '/\\'); 
    if (!is_dir($scanPath)) respond(false, null, "Ruta inválida");
    $adminId = $pdo->query("SELECT id FROM users WHERE role='ADMIN' LIMIT 1")->fetchColumn();
    $exts = ['mp4', 'mkv', 'webm', 'avi', 'mov', 'mp3', 'wav', 'flac', 'm4a'];

    try {
        $di = new RecursiveDirectoryIterator($scanPath, RecursiveDirectoryIterator::SKIP_DOTS);
        $it = new RecursiveIteratorIterator($di);
    } catch (Exception $e) {
        respond(false, null, "No se pudo acceder a la carpeta: " . $e->getMessage());
    }

    $found = 0; $new = 0; $errors = [];

    foreach ($it as $file) {
        if ($file->isDir() || !in_array(strtolower($file->getExtension()), $exts)) continue;
        $found++; 
        $path = str_replace('\\', '/', $file->getRealPath());
        $id = 'loc_' . md5($path);

        try {
            $stmt = $pdo->prepare("SELECT id FROM videos WHERE videoUrl = ? OR id = ?");
            $stmt->execute([$path, $id]);

            if (!$stmt->fetch()) {
                $title = pathinfo($path, PATHINFO_FILENAME);
                $pdo->prepare("INSERT INTO videos (id, title, videoUrl, creatorId, createdAt, category, isLocal) VALUES (?, ?, ?, ?, ?, 'PENDING', 1)")
                    ->execute([$id, $title, $path, $adminId, time()]);
                $new++;
            }
        } catch (Exception $e) {
            $errors[] = "Error en '" . basename($path) . "': " . $e->getMessage();
            write_log("Scanner Error on file $path: " . $e->getMessage(), 'ERROR');
        }
    }
    respond(true, ['totalFound' => $found, 'newToImport' => $new, 'errors' => $errors]);
}

function video_get_scan_folders($pdo) {
    $stmt = $pdo->query("SELECT localLibraryPath, libraryPaths FROM system_settings WHERE id = 1");
    $s = $stmt->fetch();
    $paths = json_decode($s['libraryPaths'] ?: '[]', true);
    if ($s['localLibraryPath']) $paths[] = $s['localLibraryPath'];
    $res = [];
    foreach (array_unique($paths) as $p) { 
        if (is_dir($p)) $res[] = ['path' => $p, 'name' => basename($p)]; 
    }
    respond(true, $res);
}

function video_process_batch($pdo) {
    $stmt = $pdo->query("SELECT * FROM videos WHERE category = 'PENDING' LIMIT 10");
    $list = $stmt->fetchAll();
    respond(true, ['processed' => count($list), 'remaining' => 0, 'completed' => true]);
}

function video_smart_organize($pdo) {
    $settings = $pdo->query("SELECT * FROM system_settings WHERE id = 1")->fetch();
    $stmt = $pdo->query("SELECT id FROM videos WHERE category = 'PROCESSING'");
    $processed = 0;
    while ($id = $stmt->fetchColumn()) { 
        video_organize_single($pdo, $id, $settings); 
        $processed++; 
    }
    respond(true, ['processed' => $processed]);
}

function video_smart_organize_batch($pdo) {
    $settings = $pdo->query("SELECT * FROM system_settings WHERE id = 1")->fetch();
    $stmt = $pdo->query("SELECT id FROM videos WHERE category IN ('PENDING', 'PROCESSING') LIMIT 50");
    $processed = 0;
    while ($id = $stmt->fetchColumn()) { 
        video_organize_single($pdo, $id, $settings); 
        $processed++; 
    }
    return ['processed' => $processed];
}

function video_reorganize_all($pdo) {
    $settings = $pdo->query("SELECT * FROM system_settings WHERE id = 1")->fetch();
    $limit = intval($_GET['limit'] ?? 100); 
    $offset = intval($_GET['offset'] ?? 0);
    $stmt = $pdo->prepare("SELECT id FROM videos LIMIT :limit OFFSET :offset");
    $stmt->bindValue(':limit', $limit, PDO::PARAM_INT);
    $stmt->bindValue(':offset', $offset, PDO::PARAM_INT);
    $stmt->execute();
    $ids = $stmt->fetchAll(PDO::FETCH_COLUMN);
    foreach ($ids as $id) video_organize_single($pdo, $id, $settings);
    respond(true, ['processed' => count($ids)]);
}

function video_fix_metadata($pdo) {
    $stmt = $pdo->query("UPDATE videos SET category = 'PENDING', locked_at = 0 WHERE duration = 0 OR thumbnailUrl IS NULL");
    respond(true, ['fixedBroken' => $stmt->rowCount()]);
}

function video_get_admin_stats($pdo) {
    respond(true, [
        'total' => $pdo->query("SELECT COUNT(*) FROM videos")->fetchColumn(),
        'pending' => $pdo->query("SELECT COUNT(*) FROM videos WHERE category = 'PENDING'")->fetchColumn(),
        'processing' => $pdo->query("SELECT COUNT(*) FROM videos WHERE category = 'PROCESSING'")->fetchColumn(),
        'failed' => $pdo->query("SELECT COUNT(*) FROM videos WHERE category = 'FAILED_METADATA'")->fetchColumn(),
        'locked' => $pdo->query("SELECT COUNT(*) FROM videos WHERE locked_at > 0")->fetchColumn()
    ]);
}

function video_delete($pdo, $input) {
    $id = $input['id']; 
    $stmt = $pdo->prepare("SELECT videoUrl, thumbnailUrl FROM videos WHERE id = ?"); 
    $stmt->execute([$id]); 
    $v = $stmt->fetch();
    if ($v) { 
        if (strpos($v['videoUrl'], 'uploads/') !== false) @unlink($v['videoUrl']); 
        if (strpos($v['thumbnailUrl'], 'uploads/') !== false) @unlink($v['thumbnailUrl']); 
    }
    $pdo->prepare("DELETE FROM videos WHERE id = ?")->execute([$id]); 
    respond(true);
}
?>