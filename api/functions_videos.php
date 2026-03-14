<?php
/**
 * VIDEOS - CORE FUNCTIONS V22.0 (Sort Order Fix - Herencia de Orden)
 */

function video_process_rows(&$rows) {
    if (!$rows) return;
    global $pdo;
    $settings = get_system_settings($pdo);

    foreach ($rows as &$v) {
        $v['rawPath'] = $v['videoUrl'];
        $isLocal = (isset($v['isLocal']) && ($v['isLocal'] == 1 || $v['isLocal'] === "1" || $v['isLocal'] === true));
        $isUploaded = (strpos($v['videoUrl'] ?? '', 'uploads/videos/') !== false);
        if ($isLocal || $isUploaded) {
            $v['videoUrl'] = "api/index.php?action=stream&id=" . $v['id'];
            $v['isLocal'] = true;
        }
        
        $ext = strtolower(pathinfo($v['rawPath'] ?? '', PATHINFO_EXTENSION));
        $v['is_audio'] = (isset($v['is_audio']) && $v['is_audio'] == 1) || in_array($ext, ['mp3', 'wav', 'aac', 'm4a', 'flac']);

        if (empty($v['thumbnailUrl'])) {
            if ($v['is_audio']) {
                $v['thumbnailUrl'] = $settings['defaultAudioThumb'] ?? '';
            } else {
                $v['thumbnailUrl'] = $settings['defaultVideoThumb'] ?? '';
            }
        }

        if (isset($v['thumbnailUrl'])) { $v['thumbnailUrl'] = fix_url($v['thumbnailUrl']); }
        if (isset($v['creatorAvatarUrl'])) { 
            if (empty($v['creatorAvatarUrl'])) {
                $v['creatorAvatarUrl'] = $settings['defaultAvatar'] ?? '';
            }
            $v['creatorAvatarUrl'] = fix_url($v['creatorAvatarUrl']); 
        }
        if (!isset($v['transcode_status'])) $v['transcode_status'] = 'NONE';
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
    $stmtS = $pdo->query("SELECT localLibraryPath, libraryPaths FROM system_settings WHERE id = 1");
    $s = $stmtS->fetch();
    $paths = json_decode($s['libraryPaths'] ?: '[]', true);
    if ($s['localLibraryPath']) $paths[] = $s['localLibraryPath'];
    $roots = array_unique(array_filter(array_map(function($p) { return rtrim(str_replace('\\', '/', $p), '/'); }, $paths)));

    if (empty($folderPath)) {
        return $pdo->query("SELECT DISTINCT category FROM videos WHERE category NOT IN ('PENDING','PROCESSING','FAILED_METADATA')")->fetchAll(PDO::FETCH_COLUMN);
    }

    $clauses = [];
    $params = [];
    foreach ($roots as $root) {
        $clauses[] = "REPLACE(videoUrl, '\\\\', '/') LIKE ?";
        $params[] = $root . '/' . $folderPath . '/%';
    }
    
    if (empty($clauses)) return [];

    $stmt = $pdo->prepare("SELECT DISTINCT category FROM videos WHERE (" . implode(" OR ", $clauses) . ") AND category NOT IN ('PENDING','PROCESSING','FAILED_METADATA')");
    $stmt->execute($params);
    return $stmt->fetchAll(PDO::FETCH_COLUMN);
}

function video_get_all($pdo) {
    $limit = intval($_GET['limit'] ?? 40); 
    if ($limit > 500) $limit = 500; // Protección contra peticiones masivas que causan timeout
    $offset = intval($_GET['offset'] ?? 0);
    $search = trim($_GET['search'] ?? ''); 
    $folder = trim($_GET['folder'] ?? ''); 
    $category = trim($_GET['category'] ?? ''); 
    $mediaType = trim($_GET['media_type'] ?? 'ALL');
    $userSort = trim($_GET['sort_order'] ?? ''); 
    $userId = trim($_GET['userId'] ?? '');
    $isShorts = !empty($_GET['shorts']); 

    $params = []; 
    $where = ["v.category NOT IN ('PENDING', 'PROCESSING', 'FAILED_METADATA')"];

    if ($isShorts) { 
        $where[] = "(v.duration < 180 OR v.duration = 0)"; 
        $where[] = "v.is_audio = 0"; // Solo videos en Shorts
    }
    
    if (!empty($search)) { $where[] = "v.title LIKE ?"; $params[] = "%$search%"; }
    if (!empty($category) && $category !== 'TODOS') { $where[] = "v.category = ?"; $params[] = $category; }
    
    $stmtS = $pdo->query("SELECT localLibraryPath, libraryPaths FROM system_settings WHERE id = 1");
    $s = $stmtS->fetch();
    $paths = json_decode($s['libraryPaths'] ?: '[]', true);
    if ($s['localLibraryPath']) $paths[] = $s['localLibraryPath'];
    $roots = array_unique(array_filter(array_map(function($p) { return rtrim(str_replace('\\', '/', $p), '/'); }, $paths)));

    if (!empty($folder)) {
        $clauses = [];
        foreach ($roots as $root) {
            $clauses[] = "REPLACE(v.videoUrl, '\\\\', '/') LIKE ?";
            $params[] = $root . '/' . $folder . '/%';
        }
        if (!empty($clauses)) {
            $where[] = "(" . implode(" OR ", $clauses) . ")";
        }
    }

    // Filtro de Media Type
    $mediaWhere = "";
    if ($mediaType === 'VIDEO') { 
        $mediaWhere = "(v.is_audio = 0 OR v.is_audio IS NULL)"; 
    } elseif ($mediaType === 'AUDIO') { 
        $mediaWhere = "(v.is_audio = 1 OR v.videoUrl LIKE '%.mp3' OR v.videoUrl LIKE '%.wav' OR v.videoUrl LIKE '%.aac' OR v.videoUrl LIKE '%.m4a' OR v.videoUrl LIKE '%.flac' OR v.videoUrl LIKE '%.ogg' OR v.videoUrl LIKE '%.opus' OR v.videoUrl LIKE '%.m4b' OR v.videoUrl LIKE '%.mp4a')"; 
    }
    
    if ($mediaWhere) {
        $where[] = $mediaWhere;
    }

    $whereClause = implode(" AND ", $where);

    // CLAVE: Determinar el orden a usar
    $effectiveSort = $userSort;
    if (empty($effectiveSort)) {
        $effectiveSort = get_folder_sort_order($pdo, $folder, $category);
    }
    $orderParams = [];
    if ($isShorts) {
        if (!empty($userId)) {
            // Prioridad: Suscritos > Likes > Vistas > Random
            $orderBy = "(SELECT COUNT(*) FROM subscriptions s WHERE s.subscriberId = ? AND s.creatorId = v.creatorId) DESC, v.likes DESC, v.views DESC, RAND()";
            $orderParams[] = $userId;
        } else {
            $orderBy = "v.likes DESC, v.views DESC, RAND()";
        }
    } elseif ($effectiveSort === 'RANDOM') {
        $orderBy = "RAND()";
    } elseif ($effectiveSort === 'ALPHA') {
        $orderBy = "v.title ASC";
    } else {
        $orderBy = "v.createdAt DESC";
    }

    $finalParams = array_merge($params, $orderParams);

    $sql = "SELECT v.*, u.username as creatorName, u.avatarUrl as creatorAvatarUrl, u.role as creatorRole 
            FROM videos v LEFT JOIN users u ON v.creatorId = u.id 
            WHERE $whereClause ORDER BY $orderBy LIMIT $limit OFFSET $offset";

    $stmt = $pdo->prepare($sql); 
    $stmt->execute($finalParams); 
    $videos = $stmt->fetchAll(PDO::FETCH_ASSOC);

    $total = $pdo->prepare("SELECT COUNT(*) FROM videos v WHERE $whereClause"); 
    $total->execute($params);
    $totalCount = $total->fetchColumn();

    $subfolders = video_discover_subfolders($pdo, $folder, $search, $mediaType);

    // Obtener categorías activas DENTRO de la carpeta actual (no globales) y filtradas por mediaType
    $catWhere = ["category NOT IN ('PENDING','PROCESSING','FAILED_METADATA')"];
    $catParams = [];
    
    if (!empty($folder)) {
        $clauses = [];
        foreach ($roots as $root) {
            $clauses[] = "REPLACE(videoUrl, '\\\\', '/') LIKE ?";
            $catParams[] = $root . '/' . $folder . '/%';
        }
        if (!empty($clauses)) {
            $catWhere[] = "(" . implode(" OR ", $clauses) . ")";
        }
    }
    
    if ($mediaWhere) {
        // Reutilizamos mediaWhere pero quitando el alias 'v.' si lo tuviera (no lo tiene en este caso)
        $catWhere[] = str_replace('v.', '', $mediaWhere);
    }
    
    $catWhereClause = implode(" AND ", $catWhere);
    $activeCatsSql = "SELECT DISTINCT category FROM videos WHERE $catWhereClause";
    $activeCatsStmt = $pdo->prepare($activeCatsSql);
    $activeCatsStmt->execute($catParams);
    $activeCategories = $activeCatsStmt->fetchAll(PDO::FETCH_COLUMN);

    video_process_rows($videos);

    // Información adicional de navegación
    $navigationInfo = null;
    if (!empty($category) && $category !== 'TODOS' && empty($folder) && count($videos) > 0 && !empty($roots)) {
        // Si estamos filtrando por categoría sin carpeta, encontrar la carpeta padre
        $firstVideo = $videos[0];
        $videoPath = $firstVideo['rawPath'] ?? $firstVideo['videoUrl'] ?? '';

        foreach ($roots as $rootPath) {
            if ($rootPath && strpos($videoPath, $rootPath) === 0) {
                $relPath = trim(substr($videoPath, strlen($rootPath)), '/\\');
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
                break;
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
    $stmtS = $pdo->query("SELECT localLibraryPath, libraryPaths FROM system_settings WHERE id = 1");
    $s = $stmtS->fetch();
    $paths = json_decode($s['libraryPaths'] ?: '[]', true);
    if ($s['localLibraryPath']) $paths[] = $s['localLibraryPath'];
    $roots = array_unique(array_filter(array_map(function($p) { return rtrim(str_replace('\\', '/', $p), '/'); }, $paths)));

    $relativePath = '';
    $videoPathNorm = str_replace('\\', '/', $videoPath);
    foreach ($roots as $root) {
        if (strpos(strtolower($videoPathNorm), strtolower($root)) === 0) {
            $rel = trim(substr($videoPathNorm, strlen($root)), '/');
            $relativePath = dirname($rel) === '.' ? '' : dirname($rel);
            break;
        }
    }

    $v['folderSortOrder'] = get_folder_sort_order($pdo, $relativePath, $v['category']);

    $rows = [$v]; 
    video_process_rows($rows); 
    respond(true, $rows[0]);
}

function video_get_by_creator($pdo, $userId) {
    $stmt = $pdo->prepare("SELECT * FROM videos WHERE creatorId = ? AND category NOT IN ('PENDING', 'PROCESSING', 'FAILED_METADATA') ORDER BY createdAt DESC");
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

    $videoPath = $currentVideo['videoUrl'];

    // Obtener el sortOrder de la carpeta/categoría
    $stmtS = $pdo->query("SELECT localLibraryPath, libraryPaths FROM system_settings WHERE id = 1");
    $s = $stmtS->fetch();
    $paths = json_decode($s['libraryPaths'] ?: '[]', true);
    if ($s['localLibraryPath']) $paths[] = $s['localLibraryPath'];
    $roots = array_unique(array_filter(array_map(function($p) { return rtrim(str_replace('\\', '/', $p), '/'); }, $paths)));

    $relativePath = '';
    $videoPathNorm = str_replace('\\', '/', $videoPath);
    foreach ($roots as $root) {
        if (strpos(strtolower($videoPathNorm), strtolower($root)) === 0) {
            $rel = trim(substr($videoPathNorm, strlen($root)), '/');
            $relativePath = dirname($rel) === '.' ? '' : dirname($rel);
            break;
        }
    }

    $sortOrder = get_folder_sort_order($pdo, $relativePath, $currentVideo['category']);

    // Construir ORDER BY según sortOrder
    if ($sortOrder === 'RANDOM') {
        $orderBy = "RAND()";
    } elseif ($sortOrder === 'ALPHA') {
        $orderBy = "title ASC";
    } else {
        $orderBy = "createdAt DESC";
    }

    $stmt = $pdo->prepare("SELECT * FROM videos WHERE category = ? AND id != ? ORDER BY $orderBy LIMIT 12");
    $stmt->execute([$currentVideo['category'], $videoId]); 
    $videos = $stmt->fetchAll();
    video_process_rows($videos); 
    respond(true, $videos);
}

/**
 * Obtiene videos de la misma carpeta con el orden configurado
 */
function video_get_folder_videos($pdo, $videoId, $userSort = '') {
    $stmtV = $pdo->prepare("SELECT videoUrl, category FROM videos WHERE id = ?");
    $stmtV->execute([$videoId]);
    $currentVideo = $stmtV->fetch();

    if (!$currentVideo) {
        respond(true, ['videos' => [], 'sortOrder' => 'LATEST']);
        return;
    }

    $videoPath = str_replace('\\', '/', $currentVideo['videoUrl']);
    $category = $currentVideo['category'];

    // Obtener la carpeta del video
    $stmtS = $pdo->query("SELECT localLibraryPath, libraryPaths FROM system_settings WHERE id = 1");
    $s = $stmtS->fetch();
    $paths = json_decode($s['libraryPaths'] ?: '[]', true);
    if ($s['localLibraryPath']) $paths[] = $s['localLibraryPath'];
    $roots = array_unique(array_filter(array_map(function($p) { return rtrim(str_replace('\\', '/', $p), '/'); }, $paths)));

    $relativePath = '';
    $videoPathNorm = str_replace('\\', '/', $videoPath);
    foreach ($roots as $root) {
        if (strpos(strtolower($videoPathNorm), strtolower($root)) === 0) {
            $rel = trim(substr($videoPathNorm, strlen($root)), '/');
            $relativePath = dirname($rel) === '.' ? '' : dirname($rel);
            break;
        }
    }

    // Obtener el sortOrder configurado
    $effectiveSort = $userSort;
    if (empty($effectiveSort)) {
        $effectiveSort = get_folder_sort_order($pdo, $relativePath, $category);
    }

    // Construir ORDER BY según sortOrder
    if ($effectiveSort === 'RANDOM') {
        $orderBy = "RAND()";
    } elseif ($effectiveSort === 'ALPHA') {
        $orderBy = "title ASC";
    } else {
        $orderBy = "createdAt DESC";
    }

    // Obtener videos de la misma carpeta
    $folderPath = dirname($videoPath);
    $folderMatch = str_replace('\\', '/', $folderPath) . '/%';
    $stmt = $pdo->prepare("SELECT v.*, u.username as creatorName, u.avatarUrl as creatorAvatarUrl, u.role as creatorRole 
                           FROM videos v LEFT JOIN users u ON v.creatorId = u.id 
                           WHERE REPLACE(v.videoUrl, '\\\\', '/') LIKE ? AND v.category NOT IN ('PENDING', 'PROCESSING', 'FAILED_METADATA')
                           ORDER BY $orderBy");
    $stmt->execute([$folderMatch]);
    $videos = $stmt->fetchAll(PDO::FETCH_ASSOC);

    video_process_rows($videos);

    respond(true, ['videos' => $videos, 'sortOrder' => $effectiveSort]);
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

function video_discover_subfolders($pdo, $currentRelPath = '', $search = '', $mediaType = 'ALL') {
    $stmt = $pdo->query("SELECT localLibraryPath, libraryPaths FROM system_settings WHERE id = 1");
    $s = $stmt->fetch();
    $paths = json_decode($s['libraryPaths'] ?: '[]', true);
    if ($s['localLibraryPath']) $paths[] = $s['localLibraryPath'];
    $roots = array_unique(array_filter(array_map(function($p) { return rtrim(str_replace('\\', '/', $p), '/'); }, $paths)));

    if (empty($roots)) return [];

    $currentRelPath = trim(str_replace('\\', '/', $currentRelPath), '/');
    $folderMap = [];

    foreach ($roots as $root) {
        $prefix = $root;
        if (!empty($currentRelPath)) {
            $prefix .= '/' . $currentRelPath;
        }
        $prefix = rtrim($prefix, '/') . '/';
        $prefixLen = strlen($prefix);

        // SQL Optimizado: Agrupar por el primer segmento de la ruta relativa
        // Buscamos videos que tengan al menos un nivel más de carpeta (contengan un '/')
        $sql = "SELECT 
                    SUBSTRING_INDEX(SUBSTRING(REPLACE(videoUrl, '\\\\', '/'), ? + 1), '/', 1) as folderName,
                    COUNT(*) as videoCount,
                    MAX(thumbnailUrl) as thumb
                FROM videos 
                WHERE REPLACE(videoUrl, '\\\\', '/') LIKE ?
                AND category NOT IN ('PENDING', 'PROCESSING', 'FAILED_METADATA')";
        
        $params = [$prefixLen, $prefix . '%/%'];

        if ($mediaType === 'VIDEO') {
            $sql .= " AND (is_audio = 0 OR is_audio IS NULL)";
        } elseif ($mediaType === 'AUDIO') {
            $sql .= " AND (is_audio = 1 OR videoUrl LIKE '%.mp3' OR videoUrl LIKE '%.wav' OR videoUrl LIKE '%.aac' OR videoUrl LIKE '%.m4a' OR videoUrl LIKE '%.flac' OR videoUrl LIKE '%.ogg' OR videoUrl LIKE '%.opus' OR videoUrl LIKE '%.m4b' OR videoUrl LIKE '%.mp4a')";
        }

        if (!empty($search)) {
            $sql .= " AND (title LIKE ? OR REPLACE(videoUrl, '\\\\', '/') LIKE ?)";
            $params[] = "%$search%";
            $params[] = "%$search%";
        }

        $sql .= " GROUP BY folderName";
        
        try {
            $stmt = $pdo->prepare($sql);
            $stmt->execute($params);
            $results = $stmt->fetchAll(PDO::FETCH_ASSOC);

            foreach ($results as $row) {
                $folderName = $row['folderName'];
                if (empty($folderName)) continue;
                
                $folderKey = strtolower($folderName);
                if (!isset($folderMap[$folderKey])) {
                    $folderMap[$folderKey] = [
                        'name' => $folderName,
                        'relativePath' => ($currentRelPath ? $currentRelPath . '/' : '') . $folderName,
                        'count' => 0,
                        'thumbnailUrl' => fix_url($row['thumb'])
                    ];
                }
                $folderMap[$folderKey]['count'] += (int)$row['videoCount'];
                
                // Preferir miniaturas que no sean la por defecto
                if ((strpos($folderMap[$folderKey]['thumbnailUrl'] ?? '', 'default') !== false) && $row['thumb'] && strpos($row['thumb'], 'default') === false) {
                    $folderMap[$folderKey]['thumbnailUrl'] = fix_url($row['thumb']);
                }
            }
        } catch (Exception $e) {
            write_log("Error in optimized folder discovery: " . $e->getMessage(), 'ERROR');
        }
    }

    // Si no encontramos nada por DB o queremos asegurar carpetas vacías (opcional), 
    // podríamos mantener el fallback de filesystem, pero solo si no hay resultados o búsqueda activa.
    if (empty($folderMap) || !empty($search)) {
        foreach ($roots as $root) {
            $fullPath = $root;
            if (!empty($currentRelPath)) {
                $fullPath .= '/' . $currentRelPath;
            }
            $fullPath = rtrim($fullPath, '/') . '/';

            if (!is_dir($fullPath)) {
                continue;
            }

            $items = @scandir($fullPath); 
            if ($items === false) continue;
            
            foreach ($items as $item) {
                if ($item === '.' || $item === '..' || strpos($item, '.') === 0) continue;
                $itemPath = $fullPath . $item;
                if (is_dir($itemPath)) {
                    if (!empty($search) && stripos($item, $search) === false) continue;
                    
                    $rel = ($currentRelPath ? $currentRelPath . '/' : '') . $item;
                    $folderKey = strtolower($item);
                    
                    if (isset($folderMap[$folderKey])) continue; // Evitar duplicados si ya se encontró por DB

                    $match = str_replace('\\', '/', $itemPath) . '/%';
                    $matchEscaped = str_replace('/', '\\', $match);
                    
                    // Optimización: Verificar existencia primero (más rápido que contar todo)
                    $check = $pdo->prepare("SELECT COUNT(*) as total, MAX(thumbnailUrl) as thumb FROM videos 
                                           WHERE (REPLACE(videoUrl, '\\\\', '/') LIKE ? OR videoUrl LIKE ?)
                                           AND category NOT IN ('PENDING','PROCESSING','FAILED_METADATA')
                                           LIMIT 1");
                    $check->execute([$match, $matchEscaped]);
                    $res = $check->fetch();
                    $total = (int)($res['total'] ?? 0);
                    
                    if ($total > 0 || (empty($search) && is_dir($itemPath))) {
                        $folderMap[$folderKey] = [
                            'name' => $item, 
                            'relativePath' => $rel, 
                            'count' => $total, 
                            'thumbnailUrl' => fix_url($res['thumb'] ?? '')
                        ];
                    }
                }
            }
        }
    }

    $folders = array_values($folderMap);
    usort($folders, function($a, $b) {
        return strcasecmp($a['name'], $b['name']);
    });

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
    $settings = $pdo->query("SELECT * FROM system_settings WHERE id = 1")->fetch();
    $autoTranscode = (int)($settings['autoTranscode'] ?? 0);

    $price = floatval($post['price'] ?? 0);
    if ($price <= 0) $price = 1.00;

    $transcodeStatus = 'NONE';
    if ($autoTranscode === 1) {
        $ext = strtolower(pathinfo($videoPath, PATHINFO_EXTENSION));
        if ($ext !== 'mp4' && $ext !== 'mp3') {
            $transcodeStatus = 'WAITING';
        }
    }

    $stmt = $pdo->prepare("INSERT INTO videos (id, title, description, price, category, duration, videoUrl, thumbnailUrl, creatorId, createdAt, transcode_status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
    $stmt->execute([$id, $post['title'], $post['description'], $price, $post['category'], intval($post['duration']), $videoPath, $thumbPath, $post['userId'], time(), $transcodeStatus]);

    require_once 'functions_interactions.php';
    // La notificación se enviará en video_organize_single cuando se procese el video
    // interact_notify_subscribers($pdo, $post['userId'], 'UPLOAD', "Nuevo contenido: {$post['title']}", "/watch/{$id}", $thumbPath);

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

    $isLocal = (int)$v['isLocal'] === 1;
    $oldCategory = $v['category'];

    $meta = smartParseFilename($v['videoUrl'], $v['category'], json_decode($settings['categories'] ?? '[]', true));
    
    // Solo actualizar categoría si es local o si estaba en PENDING
    $newCategory = $v['category'];
    if ($isLocal || $oldCategory === 'PENDING') {
        $newCategory = $meta['category'];
    }

    $catPrice = getPriceForCategory($newCategory, $settings, $meta['parent_category']);
    $price = (floatval($v['price'] ?? 0) > 0) ? $v['price'] : $catPrice;

    $pdo->prepare("UPDATE videos SET title = ?, category = ?, parent_category = ?, collection = ?, price = ? WHERE id = ?")->execute([$meta['title'], $newCategory, $meta['parent_category'], $meta['collection'], $price, $id]);

    // Notificar solo si pasa de PENDING a una categoría real, o si es un upload manual que acaba de procesarse
    if ($oldCategory === 'PENDING' || $oldCategory === 'PROCESSING') {
        require_once 'functions_interactions.php';
        interact_notify_subscribers($pdo, $v['creatorId'], 'UPLOAD', "¡Nuevo contenido! {$meta['title']}", "/watch/{$id}", $v['thumbnailUrl']);
    }
}

function smartParseFilename($path, $currentCategory, $categories) {
    $title = pathinfo($path, PATHINFO_FILENAME);
    $dir = dirname($path);
    $parts = explode('/', str_replace('\\', '/', $dir));
    
    $category = $currentCategory;
    $parent_category = null;
    $collection = null;

    if (count($parts) > 0) {
        $category = array_pop($parts);
    }
    if (count($parts) > 0) {
        $parent_category = array_pop($parts);
    }

    return [
        'title' => $title,
        'category' => $category,
        'parent_category' => $parent_category,
        'collection' => $collection
    ];
}

function getPriceForCategory($category, $settings, $parent_category = null) {
    $cats = json_decode($settings['categories'] ?? '[]', true);
    foreach ($cats as $c) {
        if (strcasecmp($c['name'], $category) === 0 && isset($c['price'])) {
            $val = floatval($c['price']);
            return ($val > 0) ? $val : 1.0;
        }
    }
    if ($parent_category) {
        foreach ($cats as $c) {
            if (strcasecmp($c['name'], $parent_category) === 0 && isset($c['price'])) {
                $val = floatval($c['price']);
                return ($val > 0) ? $val : 1.0;
            }
        }
    }
    return 1.0; // Default price to avoid free access by accident
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
    $newCategories = [];

    foreach ($it as $file) {
        if ($file->isDir() || !in_array(strtolower($file->getExtension()), $exts)) continue;
        $found++; 
        $path = str_replace('\\', '/', $file->getRealPath());
        $id = 'loc_' . md5($path);
        
        $ext = strtolower($file->getExtension());
        $isAudio = in_array($ext, ['mp3', 'wav', 'aac', 'm4a', 'flac', 'ogg', 'opus', 'm4b']) ? 1 : 0;

        // Extract category from path
        $dir = dirname($path);
        $parts = explode('/', $dir);
        $categoryName = array_pop($parts);
        if ($categoryName && !in_array($categoryName, $newCategories)) {
            $newCategories[] = $categoryName;
        }

        try {
            $stmt = $pdo->prepare("SELECT id FROM videos WHERE videoUrl = ? OR id = ?");
            $stmt->execute([$path, $id]);

            if (!$stmt->fetch()) {
                $title = pathinfo($path, PATHINFO_FILENAME);
                
                // Lógica de Auto-Encolado para el Transcodificador
                $transcodeStatus = 'NONE';
                $stmtS = $pdo->query("SELECT autoTranscode FROM system_settings WHERE id = 1");
                $autoTranscode = (int)$stmtS->fetchColumn();
                
                if ($autoTranscode === 1) {
                    $ext = strtolower(pathinfo($path, PATHINFO_EXTENSION));
                    // Encolar si no es MP4 (video) o MP3 (audio)
                    if ($ext !== 'mp4' && $ext !== 'mp3') {
                        $transcodeStatus = 'WAITING';
                    }
                }

                // Default price 1.0 to avoid free access by accident
                $pdo->prepare("INSERT INTO videos (id, title, videoUrl, creatorId, createdAt, category, isLocal, is_audio, price, transcode_status) VALUES (?, ?, ?, ?, ?, 'PENDING', 1, ?, 1.00, ?)")
                    ->execute([$id, $title, $path, $adminId, time(), $isAudio, $transcodeStatus]);
                $new++;
            }
        } catch (Exception $e) {
            $errors[] = "Error en '" . basename($path) . "': " . $e->getMessage();
            write_log("Scanner Error on file $path: " . $e->getMessage(), 'ERROR');
        }
    }
    
    // Auto-create categories
    if (!empty($newCategories)) {
        $stmtS = $pdo->query("SELECT categories FROM system_settings WHERE id = 1");
        $cats = json_decode($stmtS->fetchColumn() ?: '[]', true);
        $existingNames = array_map(function($c) { return strtolower($c['name']); }, $cats);
        
        $updated = false;
        foreach ($newCategories as $catName) {
            if (!in_array(strtolower($catName), $existingNames)) {
                // Default price 1.0 for newly discovered categories
                $cats[] = ['name' => $catName, 'price' => 1.0, 'sortOrder' => 'LATEST'];
                $existingNames[] = strtolower($catName);
                $updated = true;
            }
        }
        
        if ($updated) {
            $pdo->prepare("UPDATE system_settings SET categories = ? WHERE id = 1")->execute([json_encode($cats)]);
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
    $stmt = $pdo->query("SELECT id FROM videos WHERE category IN ('PENDING', 'PROCESSING')");
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

function video_update($pdo, $input) {
    $id = $input['id'];
    $userId = $input['userId'];
    
    // Verificar propiedad o admin
    $stmt = $pdo->prepare("SELECT creatorId FROM videos WHERE id = ?");
    $stmt->execute([$id]);
    $video = $stmt->fetch();
    
    if (!$video) respond(false, null, "Video no encontrado");
    
    $userStmt = $pdo->prepare("SELECT role FROM users WHERE id = ?");
    $userStmt->execute([userId]);
    $userRole = $userStmt->fetchColumn();
    
    if ($video['creatorId'] !== $userId && $userRole !== 'ADMIN') {
        respond(false, null, "No tienes permiso para editar este video");
    }
    
    $fields = [];
    $params = [];
    
    if (isset($input['title'])) { $fields[] = "title = ?"; $params[] = $input['title']; }
    if (isset($input['description'])) { $fields[] = "description = ?"; $params[] = $input['description']; }
    if (isset($input['price'])) { $fields[] = "price = ?"; $params[] = floatval($input['price']); }
    if (isset($input['category'])) { $fields[] = "category = ?"; $params[] = $input['category']; }
    
    if (empty($fields)) respond(false, null, "Nada que actualizar");
    
    $params[] = $id;
    $pdo->prepare("UPDATE videos SET " . implode(', ', $fields) . " WHERE id = ?")->execute($params);
    respond(true);
}
?>
