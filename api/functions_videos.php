<?php
/**
 * VIDEOS - CORE FUNCTIONS V22.0 (Sort Order Fix - Herencia de Orden)
 */

function video_lock_for_processing($pdo, $input) {
    $videoId = $input['videoId'] ?? '';
    $lockId = $input['lockId'] ?? '';
    if (!$videoId || !$lockId) respond(false, null, "Faltan parámetros");

    $now = time();
    $timeout = 60; // 1 minuto de bloqueo

    // Intentar bloquear si no está bloqueado o si el bloqueo expiró
    $stmt = $pdo->prepare("UPDATE videos SET locked_at = ?, lock_id = ? WHERE id = ? AND (locked_at < ? OR locked_at IS NULL)");
    $stmt->execute([$now, $lockId, $videoId, $now - $timeout]);

    if ($stmt->rowCount() > 0) {
        respond(true);
    } else {
        respond(false, null, "Video ya está siendo procesado por otro dispositivo");
    }
}

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
        $audioExts = ['mp3', 'wav', 'aac', 'm4a', 'flac', 'ogg', 'opus', 'm4b'];
        $isAudioExt = in_array($ext, $audioExts);
        
        // Si es MP4, NO es audio a menos que la base de datos diga explícitamente que lo es
        if ($ext === 'mp4') {
            $v['is_audio'] = (isset($v['is_audio']) && ($v['is_audio'] == 1 || $v['is_audio'] === true));
        } else {
            $v['is_audio'] = (isset($v['is_audio']) && ($v['is_audio'] == 1 || $v['is_audio'] === true)) || $isAudioExt;
        }

        // Buscar subtítulos externos (.srt, .vtt)
        $v['subtitles'] = [];
        if ($isLocal || $isUploaded) {
            $inputPath = resolve_video_path($v['rawPath']);
            if ($inputPath && file_exists($inputPath)) {
                $basePath = preg_replace('/\.[^.]+$/', '', $inputPath);
                foreach (['srt', 'vtt'] as $subExt) {
                    $subFile = $basePath . '.' . $subExt;
                    if (file_exists($subFile)) {
                        $v['subtitles'][] = [
                            'url' => "api/index.php?action=stream_sub&id=" . $v['id'] . "&ext=" . $subExt,
                            'lang' => strtoupper($subExt),
                            'label' => strtoupper($subExt),
                            'kind' => 'subtitles'
                        ];
                    }
                }
            }
        }

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
    $seed = trim($_GET['seed'] ?? '');
    $onlyUnseen = !empty($_GET['only_unseen']);

    $params = []; 
    // Por defecto ocultar videos pendientes, EXCEPTO si estamos en modo Shorts y tenemos un shortsPath configurado
    // Esto permite ver los videos mientras se procesan (aunque no tengan miniatura aún)
    $where = ["v.category NOT IN ('PROCESSING', 'FAILED_METADATA')"];
    if (!$isShorts) {
        $where[] = "v.category != 'PENDING'";
    }

    if ($onlyUnseen && !empty($userId)) {
        $where[] = "NOT EXISTS (SELECT 1 FROM interactions i WHERE i.userId = ? AND i.videoId = v.id AND (i.isWatched = 1 OR i.isSkipped = 1))";
        $params[] = $userId;
    }

    $stmtS = $pdo->query("SELECT localLibraryPath, libraryPaths, shortsPath FROM system_settings WHERE id = 1");
    $s = $stmtS->fetch();
    $shortsPath = !empty($s['shortsPath']) ? str_replace('\\', '/', rtrim($s['shortsPath'], '/')) : '';

    if ($isShorts) { 
        if ($shortsPath) {
            $where[] = "( (v.duration < 600 OR v.duration = 0 OR v.duration IS NULL) OR REPLACE(v.videoUrl, '\\\\', '/') LIKE ? )";
            $params[] = $shortsPath . '/%';
        } else {
            $where[] = "(v.duration < 600 OR v.duration = 0 OR v.duration IS NULL)";
        }
        $where[] = "v.is_audio = 0"; // Solo videos en Shorts
        $where[] = "v.category != 'IMAGES'"; // Excluir imágenes
    } else {
        // Shorts are included to be grouped by the frontend into the Reels section
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
    if ($mediaType === 'VIDEO' && !$isShorts) { 
        $mediaWhere = "v.is_audio = 0 AND v.category != 'IMAGES'"; 
    } elseif ($mediaType === 'AUDIO') { 
        $mediaWhere = "v.is_audio = 1"; 
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
    $randClause = "RAND()";
    if (!empty($seed)) {
        // Convertir seed a número para MySQL RAND()
        $seedNum = abs(crc32($seed));
        $randClause = "RAND($seedNum)";
    }

    if ($isShorts) {
        $now = time();
        if (!empty($userId)) {
            // Priority: 
            // 0: Not watched & Not disliked
            // 1: Watched
            // 2: Disliked
            $orderBy = "
                (CASE 
                    WHEN (SELECT 1 FROM interactions i WHERE i.userId = ? AND i.videoId = v.id AND i.disliked = 1 LIMIT 1) THEN 3
                    WHEN (SELECT 1 FROM interactions i WHERE i.userId = ? AND i.videoId = v.id AND i.isWatched = 1 LIMIT 1) THEN 2
                    WHEN (SELECT 1 FROM interactions i WHERE i.userId = ? AND i.videoId = v.id AND i.isSkipped = 1 LIMIT 1) THEN 1
                    ELSE 0 
                END) ASC,
                (CASE WHEN (SELECT 1 FROM subscriptions s WHERE s.subscriberId = ? AND s.creatorId = v.creatorId LIMIT 1) THEN 100 ELSE 0 END + 
                ((v.likes * 10) + v.views + 10) / POW((($now - v.createdAt) / 3600) + 2, 1.5)) DESC, 
                $randClause";
            $orderParams = [$userId, $userId, $userId, $userId];
        } else {
            // Para invitados: Popularidad con decaimiento temporal
            $orderBy = "((v.likes * 10) + v.views + 10) / POW((($now - v.createdAt) / 3600) + 2, 1.5) DESC, $randClause";
        }
    } elseif ($effectiveSort === 'RANDOM') {
        if (!empty($userId)) {
            $orderBy = "
                (CASE 
                    WHEN (SELECT 1 FROM interactions i WHERE i.userId = ? AND i.videoId = v.id AND i.disliked = 1 LIMIT 1) THEN 3
                    WHEN (SELECT 1 FROM interactions i WHERE i.userId = ? AND i.videoId = v.id AND i.isWatched = 1 LIMIT 1) THEN 2
                    WHEN (SELECT 1 FROM interactions i WHERE i.userId = ? AND i.videoId = v.id AND i.isSkipped = 1 LIMIT 1) THEN 1
                    ELSE 0 
                END) ASC,
                $randClause";
            $orderParams = [$userId, $userId, $userId];
        } else {
            $orderBy = $randClause;
        }
    } elseif ($effectiveSort === 'ALPHA') {
        if (!empty($userId)) {
            $orderBy = "
                (CASE 
                    WHEN (SELECT 1 FROM interactions i WHERE i.userId = ? AND i.videoId = v.id AND i.disliked = 1 LIMIT 1) THEN 3
                    WHEN (SELECT 1 FROM interactions i WHERE i.userId = ? AND i.videoId = v.id AND i.isWatched = 1 LIMIT 1) THEN 2
                    WHEN (SELECT 1 FROM interactions i WHERE i.userId = ? AND i.videoId = v.id AND i.isSkipped = 1 LIMIT 1) THEN 1
                    ELSE 0 
                END) ASC,
                v.title ASC";
            $orderParams = [$userId, $userId, $userId];
        } else {
            $orderBy = "v.title ASC";
        }
    } else {
        if (!empty($userId)) {
            $orderBy = "
                (CASE 
                    WHEN (SELECT 1 FROM interactions i WHERE i.userId = ? AND i.videoId = v.id AND i.disliked = 1 LIMIT 1) THEN 3
                    WHEN (SELECT 1 FROM interactions i WHERE i.userId = ? AND i.videoId = v.id AND i.isWatched = 1 LIMIT 1) THEN 2
                    WHEN (SELECT 1 FROM interactions i WHERE i.userId = ? AND i.videoId = v.id AND i.isSkipped = 1 LIMIT 1) THEN 1
                    ELSE 0 
                END) ASC,
                v.createdAt DESC";
            $orderParams = [$userId, $userId, $userId];
        } else {
            $orderBy = "v.createdAt DESC";
        }
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

    $subfolders = [];
    if (!$isShorts) {
        $subfolders = video_discover_subfolders($pdo, $folder, $search, $mediaType);
    }

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
function video_get_folder_videos($pdo, $videoId, $userSort = '', $contextFolder = '') {
    $stmtV = $pdo->prepare("SELECT videoUrl, category FROM videos WHERE id = ?");
    $stmtV->execute([$videoId]);
    $currentVideo = $stmtV->fetch();

    if (!$currentVideo) {
        respond(true, ['videos' => [], 'sortOrder' => 'LATEST']);
        return;
    }

    $videoPath = str_replace('\\', '/', $currentVideo['videoUrl']);
    $category = $currentVideo['category'];

    // Obtener las raíces de la librería
    $stmtS = $pdo->query("SELECT localLibraryPath, libraryPaths FROM system_settings WHERE id = 1");
    $s = $stmtS->fetch();
    $paths = json_decode($s['libraryPaths'] ?: '[]', true);
    if ($s['localLibraryPath']) $paths[] = $s['localLibraryPath'];
    $roots = array_unique(array_filter(array_map(function($p) { return rtrim(str_replace('\\', '/', $p), '/'); }, $paths)));

    $relativePath = '';
    $videoPathNorm = str_replace('\\', '/', $videoPath);
    
    if (!empty($contextFolder)) {
        $relativePath = trim(str_replace('\\', '/', $contextFolder), '/');
    } else {
        foreach ($roots as $root) {
            if (strpos(strtolower($videoPathNorm), strtolower($root)) === 0) {
                $rel = trim(substr($videoPathNorm, strlen($root)), '/');
                $relativePath = dirname($rel) === '.' ? '' : dirname($rel);
                break;
            }
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
        $orderBy = "v.title ASC";
    } else {
        $orderBy = "v.createdAt DESC";
    }

    // Priorizar videos de la misma carpeta exacta que el video actual
    $currentFolderPath = dirname($videoPathNorm);
    $sameFolderClause = "REPLACE(v.videoUrl, '\\\\', '/') LIKE " . $pdo->quote($currentFolderPath . '/%') . " AND REPLACE(v.videoUrl, '\\\\', '/') NOT LIKE " . $pdo->quote($currentFolderPath . '/%/%');
    // Nota: La lógica anterior de "same folder" era un poco imprecisa. 
    // Vamos a usar una técnica más robusta: comparar el dirname.
    
    $clauses = [];
    $params = [];
    foreach ($roots as $root) {
        $clauses[] = "REPLACE(v.videoUrl, '\\\\', '/') LIKE ?";
        $params[] = $root . '/' . ($relativePath ? $relativePath . '/' : '') . '%';
    }

    $whereClause = "v.category NOT IN ('PENDING', 'PROCESSING', 'FAILED_METADATA')";
    if (!empty($clauses)) {
        $whereClause .= " AND (" . implode(" OR ", $clauses) . ")";
    }

    // Orden especial: 1. Misma carpeta, 2. Subcarpetas, 3. El resto (si aplica)
    // Usamos un CASE para dar prioridad 0 a la carpeta actual y 1 a las subcarpetas
    $priorityOrder = "(CASE WHEN REPLACE(v.videoUrl, '\\\\', '/') LIKE " . $pdo->quote($currentFolderPath . '/%') . " AND REPLACE(v.videoUrl, '\\\\', '/') NOT LIKE " . $pdo->quote($currentFolderPath . '/%/%') . " THEN 0 ELSE 1 END)";

    $sql = "SELECT v.*, u.username as creatorName, u.avatarUrl as creatorAvatarUrl, u.role as creatorRole 
            FROM videos v LEFT JOIN users u ON v.creatorId = u.id 
            WHERE $whereClause
            ORDER BY $priorityOrder ASC, $orderBy";

    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    $videos = $stmt->fetchAll(PDO::FETCH_ASSOC);

    video_process_rows($videos);

    respond(true, ['videos' => $videos, 'sortOrder' => $effectiveSort]);
}

/**
 * FIXED: Uso de bindValue para evitar comillas en LIMIT
 */
function video_get_unprocessed($pdo, $params = []) {
    $limit = intval($params['limit'] ?? 1);
    $now = time();
    $timeLimit = $now - 300; // 5 minutos de bloqueo
    
    // Generar un ID de bloqueo único para esta petición
    $lockId = uniqid('lock_', true);
    
    // Intentar bloquear los videos disponibles
    // Se ordena por videoUrl para mantener el orden alfabético por carpeta
    $stmt = $pdo->prepare("UPDATE videos 
                           SET locked_at = :now, lock_id = :lockId 
                           WHERE category = 'PENDING' 
                           AND processing_attempts < 3 
                           AND (locked_at < :time OR locked_at IS NULL)
                           ORDER BY videoUrl ASC 
                           LIMIT :limit");
    $stmt->bindValue(':now', $now, PDO::PARAM_INT);
    $stmt->bindValue(':lockId', $lockId, PDO::PARAM_STR);
    $stmt->bindValue(':time', $timeLimit, PDO::PARAM_INT);
    $stmt->bindValue(':limit', $limit, PDO::PARAM_INT);
    $stmt->execute();
    
    // Recuperar los videos que acabamos de bloquear
    $stmt = $pdo->prepare("SELECT * FROM videos WHERE lock_id = :lockId");
    $stmt->execute([':lockId' => $lockId]);
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

    // Si no encontramos nada por DB y hay una búsqueda activa, 
    // podríamos mantener el fallback de filesystem para encontrar carpetas por nombre.
    if (!empty($search)) {
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
        $dest = 'uploads/thumbnails/' . $thumbName;
        move_uploaded_file($files['thumbnail']['tmp_name'], $dest);
        $thumbPath = 'api/uploads/thumbnails/' . $thumbName;
        
        // Crear miniatura optimizada
        create_thumbnail($dest);
    }
    $settings = $pdo->query("SELECT * FROM system_settings WHERE id = 1")->fetch();
    $autoTranscode = (int)($settings['autoTranscode'] ?? 0);

    $price = floatval($post['price'] ?? 0);
    if ($price <= 0) $price = 1.00;

    $transcodeStatus = 'NONE';
    $ext = strtolower(pathinfo($videoPath, PATHINFO_EXTENSION));
    $audioExts = ['mp3', 'wav', 'aac', 'm4a', 'flac', 'ogg', 'opus', 'm4b'];
    $isAudio = in_array($ext, $audioExts) ? 1 : 0;
    
    // Si es MP4, forzar que NO sea audio a menos que se especifique lo contrario
    if ($ext === 'mp4') $isAudio = 0;

    if ($autoTranscode === 1) {
        if ($ext !== 'mp4' && $ext !== 'mp3') {
            $transcodeStatus = 'WAITING';
        }
    }

    $collection = $post['collection'] ?? null;

    $stmt = $pdo->prepare("INSERT INTO videos (id, title, description, price, category, duration, videoUrl, thumbnailUrl, creatorId, createdAt, transcode_status, collection, is_audio) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
    $stmt->execute([$id, $post['title'], $post['description'], $price, $post['category'], intval($post['duration']), $videoPath, $thumbPath, $post['userId'], time(), $transcodeStatus, $collection, $isAudio]);

    require_once 'functions_interactions.php';
    // La notificación se enviará en video_organize_single cuando se procese el video
    // interact_notify_subscribers($pdo, $post['userId'], 'UPLOAD', "Nuevo contenido: {$post['title']}", "/watch/{$id}", $thumbPath);

    respond(true);
}

function video_unlock($pdo, $input) {
    $id = $input['id'];
    $pdo->prepare("UPDATE videos SET locked_at = 0, lock_id = NULL WHERE id = ?")->execute([$id]);
    respond(true);
}

function video_update_metadata($pdo, $post, $files) {
    $id = $post['id']; 
    $success = ($post['success'] ?? '1') === '1';
    if (!$success) {
        $pdo->prepare("UPDATE videos SET processing_attempts = processing_attempts + 1, locked_at = 0, lock_id = NULL WHERE id = ?")->execute([$id]); 
        respond(true); 
    }
    $fields = ["duration = ?", "processing_attempts = 0", "locked_at = 0", "lock_id = NULL"]; 
    $params = [intval($post['duration'])];
    if (isset($files['thumbnail']) && $files['thumbnail']['error'] === UPLOAD_ERR_OK) {
        $thumbName = "t_{$id}.jpg"; 
        $target = 'uploads/thumbnails/' . $thumbName;
        move_uploaded_file($files['thumbnail']['tmp_name'], $target);
        
        // Crear miniatura optimizada del thumbnail
        create_thumbnail($target, str_replace('.jpg', '_thumb.jpg', $target), 480, 270, 75);
        
        $fields[] = "thumbnailUrl = ?"; 
        $params[] = 'api/' . $target;
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

function video_increment_share($pdo, $videoId) {
    $stmt = $pdo->prepare("UPDATE videos SET shares = shares + 1 WHERE id = ?");
    $stmt->execute([$videoId]);
    respond(true);
}

function smartParseFilename($path, $currentCategory, $categories) {
    $title = pathinfo($path, PATHINFO_FILENAME);
    $ext = strtolower(pathinfo($path, PATHINFO_EXTENSION));
    $dir = dirname($path);
    $parts = explode('/', str_replace('\\', '/', $dir));
    
    $category = $currentCategory;
    $parent_category = null;
    $collection = null;

    // Detectar si es una imagen por extensión
    $imageExts = ['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp', 'svg'];
    if (in_array($ext, $imageExts)) {
        $category = 'IMAGES';
    } else {
        if (count($parts) > 0) {
            $lastPart = array_pop($parts);
            // Evitar usar nombres de carpetas genéricos de sistema como categoría
            $systemFolders = ['videos', 'uploads', 'temp', 'thumbnails'];
            if (!in_array(strtolower($lastPart), $systemFolders)) {
                $category = $lastPart;
            }
        }
        if (count($parts) > 0) {
            $parent_category = array_pop($parts);
        }
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
    return 1.0; // Default price 1.0 to avoid free access by accident
}

function video_scan_local($pdo, $input) {
    $stmtS = $pdo->query("SELECT localLibraryPath, libraryPaths, shortsPath, autoTranscode FROM system_settings WHERE id = 1");
    $settings = $stmtS->fetch();
    
    $scanPath = !empty($input['path']) ? rtrim($input['path'], '/\\') : '';
    
    // Si no se provee ruta, usamos la principal configurada
    if (empty($scanPath)) {
        $scanPath = $settings['localLibraryPath'] ?? '';
    }

    if (empty($scanPath) || !is_dir($scanPath)) {
        respond(false, null, "Ruta inválida o no configurada: " . ($scanPath ?: 'VACÍA'));
    }

    $adminId = $pdo->query("SELECT id FROM users WHERE role='ADMIN' LIMIT 1")->fetchColumn();
    $exts = ['mp4', 'mkv', 'webm', 'avi', 'mov', 'mp3', 'wav', 'flac', 'm4a'];

    $shortsPath = !empty($settings['shortsPath']) ? str_replace('\\', '/', rtrim($settings['shortsPath'], '/')) : '';
    
    // Lista de rutas a escanear (la principal + shorts si es distinta)
    $pathsToScan = [$scanPath];
    if ($shortsPath && $shortsPath !== $scanPath && is_dir($shortsPath)) {
        $pathsToScan[] = $shortsPath;
    }

    $found = 0; $new = 0; $errors = [];
    $newCategories = [];

    foreach ($pathsToScan as $currentPath) {
        try {
            $di = new RecursiveDirectoryIterator($currentPath, RecursiveDirectoryIterator::SKIP_DOTS);
            $it = new RecursiveIteratorIterator($di);
            
            foreach ($it as $file) {
                if ($file->isDir() || !in_array(strtolower($file->getExtension()), $exts)) continue;
                $found++; 
                $path = str_replace('\\', '/', $file->getRealPath());
                $id = 'loc_' . md5($path);
                
                $ext = strtolower($file->getExtension());
                $audioExts = ['mp3', 'wav', 'aac', 'm4a', 'flac', 'ogg', 'opus', 'm4b'];
                $isAudio = in_array($ext, $audioExts) ? 1 : 0;
                if ($ext === 'mp4') $isAudio = 0;

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
                        $transcodeStatus = 'NONE';
                        $autoTranscode = (int)($settings['autoTranscode'] ?? 0);
                        
                        if ($autoTranscode === 1) {
                            if ($ext !== 'mp4' && $ext !== 'mp3') {
                                $transcodeStatus = 'WAITING';
                            }
                        }

                        $price = getPriceForCategory($categoryName, $settings);
                        
                        $pdo->prepare("INSERT INTO videos (id, title, videoUrl, creatorId, createdAt, category, isLocal, is_audio, price, transcode_status) VALUES (?, ?, ?, ?, ?, 'PENDING', 1, ?, ?, ?)")
                            ->execute([$id, $title, $path, $adminId, time(), $isAudio, $price, $transcodeStatus]);
                        $new++;
                    }
                } catch (Exception $e) {
                    $errors[] = "Error en '" . basename($path) . "': " . $e->getMessage();
                }
            }
        } catch (Exception $e) {
            $errors[] = "Error al acceder a $currentPath: " . $e->getMessage();
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
    $stmt = $pdo->query("SELECT localLibraryPath, libraryPaths, shortsPath FROM system_settings WHERE id = 1");
    $s = $stmt->fetch();
    $paths = json_decode($s['libraryPaths'] ?: '[]', true);
    if ($s['localLibraryPath']) $paths[] = $s['localLibraryPath'];
    if (!empty($s['shortsPath'])) $paths[] = $s['shortsPath'];
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

function get_channel_content($pdo, $input) {
    $userId = $input['userId'];
    $filter = $input['filter'] ?? 'ALL';
    
    $where = ["creatorId = ?"];
    $params = [$userId];
    
    if ($filter === 'VIDEOS') {
        $where[] = "is_audio = 0 AND duration >= 60 AND (videoUrl NOT LIKE '%.jpg' AND videoUrl NOT LIKE '%.png' AND videoUrl NOT LIKE '%.jpeg')";
    } elseif ($filter === 'SHORTS') {
        $where[] = "is_audio = 0 AND duration < 60 AND (videoUrl NOT LIKE '%.jpg' AND videoUrl NOT LIKE '%.png' AND videoUrl NOT LIKE '%.jpeg')";
    } elseif ($filter === 'AUDIOS') {
        $where[] = "is_audio = 1";
    } elseif ($filter === 'IMAGES') {
        $where[] = "(videoUrl LIKE '%.jpg' OR videoUrl LIKE '%.png' OR videoUrl LIKE '%.jpeg')";
    }
    
    $sql = "SELECT * FROM videos WHERE " . implode(' AND ', $where) . " ORDER BY createdAt DESC";
    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    $items = $stmt->fetchAll();
    
    foreach ($items as &$i) {
        $i['thumbnailUrl'] = fix_url($i['thumbnailUrl']);
        $i['videoUrl'] = fix_url($i['videoUrl']);
    }
    
    respond(true, $items);
}

function upload_channel_images($pdo, $post, $files) {
    $userId = $post['userId'];
    $title = $post['title'];
    $description = $post['description'] ?? '';
    $type = $post['type'] ?? 'INDEPENDENT';
    $count = (int)($post['count'] ?? 0);

    $uploadedIds = [];
    $collectionId = $count > 1 ? 'album_' . uniqid() : null;
    for ($i = 0; $i < $count; $i++) {
        $key = "image_$i";
        if (isset($files[$key]) && $files[$key]['error'] === UPLOAD_ERR_OK) {
            $ext = pathinfo($files[$key]['name'], PATHINFO_EXTENSION);
            $filename = uniqid('img_') . '.' . $ext;
            $target = 'uploads/videos/' . $filename; 
            
            if (move_uploaded_file($files[$key]['tmp_name'], $target)) {
                // Crear miniatura para la imagen del canal
                create_thumbnail($target, str_replace('.' . $ext, '_thumb.jpg', $target), 600, 600, 75);
                
                $stmt = $pdo->prepare("INSERT INTO videos (id, title, description, videoUrl, thumbnailUrl, creatorId, createdAt, category, is_audio, duration, collection) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
                $id = uniqid();
                $stmt->execute([
                    $id,
                    $title . ($count > 1 ? " (" . ($i + 1) . "/$count)" : ""),
                    $description,
                    $target,
                    $target, 
                    $userId,
                    time(),
                    'IMAGES',
                    0,
                    0,
                    $collectionId
                ]);
                $uploadedIds[] = $id;
            }
        }
    }

    if (empty($uploadedIds)) {
        respond(false, null, "No se pudieron subir las imágenes");
    }

    respond(true, ['ids' => $uploadedIds]);
}

function video_get_admin_stats($pdo) {
    $total = (int)$pdo->query("SELECT COUNT(*) FROM videos")->fetchColumn();
    $pending = (int)$pdo->query("SELECT COUNT(*) FROM videos WHERE category = 'PENDING'")->fetchColumn();
    $processing = (int)$pdo->query("SELECT COUNT(*) FROM videos WHERE category = 'PROCESSING'")->fetchColumn();
    $failed = (int)$pdo->query("SELECT COUNT(*) FROM videos WHERE category = 'FAILED_METADATA'")->fetchColumn();
    $broken = (int)$pdo->query("SELECT COUNT(*) FROM videos WHERE category = 'BROKEN'")->fetchColumn();
    $locked = (int)$pdo->query("SELECT COUNT(*) FROM videos WHERE locked_at > 0")->fetchColumn();
    
    // Public are those that are NOT pending, processing, failed, or broken
    $public = $total - ($pending + $processing + $failed + $broken);
    if ($public < 0) $public = 0;

    respond(true, [
        'total' => $total,
        'pending' => $pending,
        'processing' => $processing,
        'failed' => $failed,
        'broken' => $broken,
        'locked' => $locked,
        'available' => $pending,
        'public' => $public
    ]);
}

function video_delete($pdo, $input) {
    $id = $input['id']; 
    $stmt = $pdo->prepare("SELECT videoUrl, thumbnailUrl FROM videos WHERE id = ?"); 
    $stmt->execute([$id]); 
    $v = $stmt->fetch();
    if ($v) { 
        if (strpos($v['videoUrl'], 'uploads/') !== false) {
            @unlink($v['videoUrl']);
            // También intentar borrar miniatura si existe
            $ext = pathinfo($v['videoUrl'], PATHINFO_EXTENSION);
            @unlink(str_replace('.' . $ext, '_thumb.jpg', $v['videoUrl']));
        } 
        if (strpos($v['thumbnailUrl'], 'uploads/') !== false) {
            @unlink($v['thumbnailUrl']);
            // También intentar borrar miniatura si existe
            $ext = pathinfo($v['thumbnailUrl'], PATHINFO_EXTENSION);
            @unlink(str_replace('.' . $ext, '_thumb.jpg', $v['thumbnailUrl']));
        } 
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
    $userStmt->execute([$userId]);
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

function upload_story($pdo, $post, $files) {
    $userId = $post['userId'];
    $type = $post['type'] ?? 'IMAGE';
    $overlayText = $post['overlayText'] ?? null;
    $overlayColor = $post['overlayColor'] ?? null;
    $overlayBg = $post['overlayBg'] ?? null;
    
    $audioUrl = null;
    if (isset($files['audio']) && $files['audio']['error'] === UPLOAD_ERR_OK) {
        $audioId = uniqid('audio_');
        $audioExt = pathinfo($files['audio']['name'], PATHINFO_EXTENSION);
        $audioFilename = $audioId . '.' . $audioExt;
        $audioTarget = 'uploads/videos/' . $audioFilename;
        if (move_uploaded_file($files['audio']['tmp_name'], $audioTarget)) {
            $audioUrl = $audioTarget;
        }
    }

    if (!isset($files['file']) || $files['file']['error'] !== UPLOAD_ERR_OK) {
        // If no file, but we have text, we can create a text-only story
        if ($type === 'IMAGE' && $overlayText) {
            // Create a placeholder or just use the text
            $id = uniqid('story_');
            $now = time();
            $expiry = $now + (24 * 3600);
            $stmt = $pdo->prepare("INSERT INTO stories (id, userId, contentUrl, type, overlayText, overlayColor, overlayBg, audioUrl, createdAt, expiresAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
            $stmt->execute([$id, $userId, '', $type, $overlayText, $overlayColor, $overlayBg, $audioUrl, $now, $expiry]);
            respond(true, ['id' => $id]);
            return;
        }
        respond(false, null, "Archivo no recibido");
    }

    $id = uniqid('story_');
    $ext = pathinfo($files['file']['name'], PATHINFO_EXTENSION);
    $filename = $id . '.' . $ext;
    $target = 'uploads/videos/' . $filename;

    if (move_uploaded_file($files['file']['tmp_name'], $target)) {
        // Crear miniatura si es una imagen
        if ($type === 'IMAGE') {
            create_thumbnail($target, str_replace('.' . $ext, '_thumb.jpg', $target), 400, 700, 70);
        }
        
        $now = time();
        $expiry = $now + (24 * 3600); // 24 hours
        
        $stmt = $pdo->prepare("INSERT INTO stories (id, userId, contentUrl, type, overlayText, overlayColor, overlayBg, audioUrl, createdAt, expiresAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
        $stmt->execute([$id, $userId, $target, $type, $overlayText, $overlayColor, $overlayBg, $audioUrl, $now, $expiry]);
        
        respond(true, ['id' => $id]);
    } else {
        respond(false, null, "Error al guardar el archivo");
    }
}

function get_stories($pdo) {
    $now = time();
    $sql = "SELECT s.*, u.username, u.avatarUrl 
            FROM stories s 
            JOIN users u ON s.userId = u.id 
            WHERE s.expiresAt > ? 
            ORDER BY s.createdAt DESC";
    $stmt = $pdo->prepare($sql);
    $stmt->execute([$now]);
    $stories = $stmt->fetchAll();
    
    foreach ($stories as &$s) {
        $s['contentUrl'] = fix_url($s['contentUrl']);
        $s['avatarUrl'] = fix_url($s['avatarUrl']);
        $s['audioUrl'] = fix_url($s['audioUrl']);
    }
    
    respond(true, $stories);
}

function delete_story($pdo, $input) {
    $id = $input['id'] ?? '';
    $userId = $input['userId'] ?? '';
    
    if (!$id || !$userId) respond(false, null, "ID o Usuario faltante");
    
    // Check ownership
    $stmt = $pdo->prepare("SELECT contentUrl FROM stories WHERE id = ? AND userId = ?");
    $stmt->execute([$id, $userId]);
    $story = $stmt->fetch();
    
    if (!$story) respond(false, null, "Historia no encontrada o no autorizada");
    
    // Delete file
    if (file_exists($story['contentUrl'])) {
        @unlink($story['contentUrl']);
        // Borrar miniatura si existe
        $ext = pathinfo($story['contentUrl'], PATHINFO_EXTENSION);
        $thumb = str_replace('.' . $ext, '_thumb.jpg', $story['contentUrl']);
        if (file_exists($thumb)) @unlink($thumb);
    }
    
    // Delete from DB
    $stmt = $pdo->prepare("DELETE FROM stories WHERE id = ?");
    $stmt->execute([$id]);
    
    respond(true);
}

function video_get_trending($pdo) {
    // Tendencias: Videos con más vistas y likes, priorizando los más recientes (últimos 30 días)
    $thirtyDaysAgo = time() - (30 * 24 * 60 * 60);
    
    $sql = "SELECT v.*, u.username as creatorName, u.avatarUrl as creatorAvatarUrl 
            FROM videos v 
            LEFT JOIN users u ON v.creatorId = u.id 
            WHERE v.createdAt > ? 
            ORDER BY (v.views + (v.likes * 5)) DESC 
            LIMIT 50";
            
    $stmt = $pdo->prepare($sql);
    $stmt->execute([$thirtyDaysAgo]);
    $rows = $stmt->fetchAll();
    
    // Si hay pocos videos recientes, rellenar con los más populares de siempre
    if (count($rows) < 10) {
        $sql = "SELECT v.*, u.username as creatorName, u.avatarUrl as creatorAvatarUrl 
                FROM videos v 
                LEFT JOIN users u ON v.creatorId = u.id 
                ORDER BY (v.views + (v.likes * 5)) DESC 
                LIMIT 50";
        $rows = $pdo->query($sql)->fetchAll();
    }
    
    video_process_rows($rows);
    respond(true, $rows);
}
?>
