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

function video_process_rows(&$rows, $depth = 0) {
    if (!$rows || $depth > 3) return;
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

        // Calcular peso del archivo real
        if ($isLocal || $isUploaded) {
            $pathForSize = resolve_video_path($v['rawPath']);
            if ($pathForSize && file_exists($pathForSize)) {
                $bytes = filesize($pathForSize);
                $v['size_bytes'] = $bytes;

                // Persistir size_bytes si es la primera vez o cambió
                if (!isset($v['size_bytes_persisted']) || $v['size_bytes_persisted'] != $bytes) {
                    $pdo->prepare("UPDATE videos SET size_bytes = ? WHERE id = ?")->execute([$bytes, $v['id']]);
                    $v['size_bytes_persisted'] = $bytes;
                }
                
                if ($bytes >= 1073741824) {
                    $v['size_fmt'] = number_format($bytes / 1073741824, 2) . ' GB';
                } elseif ($bytes >= 1048576) {
                    $v['size_fmt'] = number_format($bytes / 1048576, 2) . ' MB';
                } elseif ($bytes >= 1024) {
                    $v['size_fmt'] = number_format($bytes / 1024, 2) . ' KB';
                } else {
                    $v['size_fmt'] = $bytes . ' B';
                }
            }
        }

        // Fetch original video if this is a reshare
        if (!empty($v['originalId']) && !isset($v['originalVideo'])) {
            $stmt = $pdo->prepare("SELECT v.*, u.username as creatorName, u.avatarUrl as creatorAvatarUrl, u.role as creatorRole 
                                   FROM videos v LEFT JOIN users u ON v.creatorId = u.id 
                                   WHERE v.id = ?");
            $stmt->execute([$v['originalId']]);
            $orig = $stmt->fetch(PDO::FETCH_ASSOC);
            if ($orig) {
                // Avoid infinite recursion by limit depth
                $v['originalVideo'] = $orig;
                $temp = [$v['originalVideo']];
                video_process_rows($temp, $depth + 1); 
                $v['originalVideo'] = $temp[0];
            }
        }

        // Fetch original marketplace item if this is a marketplace reshare
        if (!empty($v['originalMarketplaceId']) && !isset($v['originalMarketplaceItem'])) {
            $stmtM = $pdo->prepare("SELECT m.*, u.username as sellerName, u.avatarUrl as sellerAvatarUrl FROM marketplace_items m LEFT JOIN users u ON m.sellerId = u.id WHERE m.id = ?");
            $stmtM->execute([$v['originalMarketplaceId']]);
            $item = $stmtM->fetch(PDO::FETCH_ASSOC);
            if ($item) {
                // Fix URLs and types
                $item['images'] = json_decode($item['images'] ?? '[]', true);
                if (is_array($item['images'])) {
                    foreach ($item['images'] as &$img) $img = fix_url($img);
                }
                $item['sellerAvatarUrl'] = fix_url($item['sellerAvatarUrl']);
                $v['originalMarketplaceItem'] = $item;
            }
        }
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
    $isAdmin = !empty($_GET['admin_mode']);
    if (!$isAdmin && $limit > 500) $limit = 500; // Protección contra peticiones masivas que causan timeout
    if ($isAdmin && $limit > 5000) $limit = 5000; // Límite mayor para admins
    
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
    $transcodeStatus = trim($_GET['transcode_status'] ?? '');

    $params = []; 
    
    // Por defecto ocultar videos pendientes y PRIVADOS a menos que sea el admin
    $where = ["1=1"]; // Base clause to avoid SQL syntax errors
    if (!$isAdmin) {
        $where[] = "v.category NOT IN ('PENDING', 'PROCESSING', 'FAILED_METADATA')";
        $where[] = "(v.transcode_status = 'NONE' OR v.transcode_status = 'DONE')";
        $where[] = "v.is_private = 0";
    }

    // Filtros de visibilidad mejorados
    // 2. Ocultar el video 'Padre' si se fragmentó para Shorts (ya que sus fragmentos van a la sección Reels)
    $where[] = "(v.split_shorts = 0 OR v.transcode_status != 'DONE')";
    
    // Permitimos que los fragmentos lleguen si estamos en el Home para que el agrupador de React los use,
    // pero los filtramos en otros contextos si no es necesario.
    if (!$isShorts && !$isAdmin && !empty($input['category'])) { 
        // Si es una categoría específica (no el home general), mantenemos el filtro
        $where[] = "(v.originalId IS NULL OR v.is_series_fragment = 1)";
    }
    
    // Si queremos que los fragmentos de serie aparezcan como nuevos, quitamos la restricción de is_series_fragment=0
    // Opcional: Podríamos querer ocultar el 'Padre' de una serie si ya están los fragmentos, 
    // pero el usuario dice que el principal aparezca como nuevo con la suma.

    if (!empty($transcodeStatus)) {
        $where[] = "v.transcode_status = ?";
        $params[] = $transcodeStatus;
    }

    if ($onlyUnseen && !empty($userId)) {
        // Excluir si ya fue visto directamente, o si el video (o su original si es fragmento) recibió dislike o 3+ saltos
        $where[] = "NOT EXISTS (
            SELECT 1 FROM interactions i 
            WHERE i.userId = ? 
            AND (
                (i.videoId = v.id AND i.isWatched = 1)
                OR 
                ( (i.videoId = v.id OR (v.originalId IS NOT NULL AND i.videoId = v.originalId)) 
                  AND (i.disliked = 1 OR i.skip_count >= 3)
                )
            )
        )";
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
    
    if (!empty($search)) { 
        $where[] = "(v.title LIKE ? OR v.description LIKE ?)"; 
        $params[] = "%$search%"; 
        $params[] = "%$search%"; 
    }
    if (!empty($category) && $category !== 'TODOS') { $where[] = "v.category = ?"; $params[] = $category; }
    
    $stmtS = $pdo->query("SELECT localLibraryPath, libraryPaths FROM system_settings WHERE id = 1");
    $s = $stmtS->fetch();
    $paths = json_decode($s['libraryPaths'] ?: '[]', true);
    if ($s['localLibraryPath']) $paths[] = $s['localLibraryPath'];
    $roots = array_unique(array_filter(array_map(function($p) { return rtrim(str_replace('\\', '/', $p), '/'); }, $paths)));

    if (!empty($folder)) {
        $isUnified = false;
        try {
            $stmtUni = $pdo->prepare("SELECT isUnified FROM groups_metadata WHERE folderPath = ?");
            $stmtUni->execute([$folder]);
            $isUnified = (bool)$stmtUni->fetchColumn();
        } catch (Exception $e) {}

        $clauses = [];
        foreach ($roots as $root) {
            if ($isUnified) {
                $clauses[] = "REPLACE(v.videoUrl, '\\\\', '/') LIKE ?";
                $params[] = $root . '/' . $folder . '/%';
            } else {
                $clauses[] = "(REPLACE(v.videoUrl, '\\\\', '/') LIKE ? AND REPLACE(v.videoUrl, '\\\\', '/') NOT LIKE ?)";
                $params[] = $root . '/' . $folder . '/%';
                $params[] = $root . '/' . $folder . '/%/%';
            }
        }
        if (!empty($clauses)) {
            $where[] = "(" . implode(" OR ", $clauses) . ")";
        }
    } else {
        // FASE 3: Lógica especial para la página principal (Feed)
        // Si no se está explorando una carpeta, ni una categoría, ni haciendo una búsqueda, 
        // y tenemos un userId de sesión, solo mostramos contenido de los grupos suscritos y de los amigos.
        if ((empty($category) || $category === 'TODOS') && empty($search) && !$isShorts && !empty($userId) && !$isAdmin) {
            $where[] = " (
                v.creatorId = ? 
                OR v.creatorId IN (SELECT creatorId FROM subscriptions WHERE subscriberId = ?)
                OR EXISTS (
                    SELECT 1 FROM group_subscriptions gs 
                    WHERE gs.userId = ? AND gs.approved = 1
                    AND (
                        REPLACE(v.videoUrl, '\\\\', '/') LIKE CONCAT('%/', gs.folderPath, '/%')
                        OR REPLACE(v.videoUrl, '\\\\', '/') LIKE CONCAT('%/', gs.folderPath)
                        OR v.category = gs.folderPath
                    )
                )
            ) ";
            $params[] = $userId;
            $params[] = $userId;
            $params[] = $userId;
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
        if (!empty($search)) {
            $effectiveSort = 'ALPHA';
        } else {
            $effectiveSort = get_folder_sort_order($pdo, $folder, $category);
        }
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

    // Determine user approved subscriptions map
    $userApprovedSubs = [];
    if (!empty($userId)) {
        try {
            $stmtSub = $pdo->prepare("SELECT folderPath FROM group_subscriptions WHERE userId = ? AND approved = 1");
            $stmtSub->execute([$userId]);
            $userApprovedSubs = $stmtSub->fetchAll(PDO::FETCH_COLUMN);
            $userApprovedSubs = array_map('strtolower', $userApprovedSubs);
        } catch (Exception $e) {}
    }

    // Load private groups map
    $privateGroups = [];
    try {
        $stmtPriv = $pdo->query("SELECT folderPath, creatorId FROM groups_metadata WHERE isPrivate = 1");
        $privMeta = $stmtPriv->fetchAll(PDO::FETCH_ASSOC);
        foreach ($privMeta as $pm) {
            $privateGroups[strtolower($pm['folderPath'])] = $pm['creatorId'];
        }
    } catch (Exception $e) {}

    foreach ($videos as &$v) {
        $vCategory = isset($v['category']) ? strtolower($v['category']) : '';
        $belongToPrivateGroup = false;
        $groupCreatorId = null;
        $matchedGroupPath = '';

        if (isset($privateGroups[$vCategory])) {
            $belongToPrivateGroup = true;
            $groupCreatorId = $privateGroups[$vCategory];
            $matchedGroupPath = $v['category'];
        } else {
            // Check url segments
            $vUrl = str_replace('\\', '/', $v['videoUrl']);
            foreach ($privateGroups as $gPath => $cId) {
                if (strpos(strtolower($vUrl), '/' . $gPath . '/') !== false) {
                    $belongToPrivateGroup = true;
                    $groupCreatorId = $cId;
                    $matchedGroupPath = $gPath;
                    break;
                }
            }
        }

        if ($belongToPrivateGroup) {
            $v['belongsToGroup'] = $matchedGroupPath;
            $isPostCreator = ($userId && $v['creatorId'] === $userId);
            $isGroupCreator = ($userId && $groupCreatorId === $userId);
            $isSubscribed = in_array(strtolower($matchedGroupPath), $userApprovedSubs);

            if (!$isAdmin && !$isPostCreator && !$isGroupCreator && !$isSubscribed) {
                // User does not have access! Censured!
                $v['isCensored'] = 1;
                $v['originalVideoUrl'] = $v['videoUrl']; // backup
                $v['videoUrl'] = ''; // Empty video file
                $v['streamUrl'] = '';
                $v['is_private'] = 1;
            } else {
                $v['isCensored'] = 0;
            }
        } else {
            $v['isCensored'] = 0;
            // Add group path if matched with regular public groups
            // Just extract the folder name from any subfolder
            $vUrl = str_replace('\\', '/', $v['videoUrl']);
            if (isset($roots)) {
                foreach ($roots as $root) {
                    $cleaned = trim($root, '/');
                    if (empty($cleaned)) continue;
                    if (strpos($vUrl, $cleaned . '/') === 0) {
                        $remaining = trim(substr($vUrl, strlen($cleaned)), '/');
                        $parts = explode('/', $remaining);
                        if (count($parts) > 1) {
                            $v['belongsToGroup'] = $parts[0];
                        }
                    }
                }
            }
        }
    }

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

    $users = [];
    if (!empty($search) && $offset === 0) {
        $userStmt = $pdo->prepare("SELECT id, username, avatarUrl, role FROM users WHERE username LIKE ? LIMIT 5");
        $userStmt->execute(["%$search%"]);
        $users = $userStmt->fetchAll(PDO::FETCH_ASSOC);
        foreach($users as &$u) {
            $u['avatarUrl'] = fix_url($u['avatarUrl']);
        }
    }

    respond(true, [
        'videos' => $videos, 
        'folders' => $subfolders, 
        'activeCategories' => $activeCategories, 
        'total' => (int)$totalCount, 
        'hasMore' => ($offset + $limit) < $totalCount,
        'appliedSortOrder' => $effectiveSort,
        'navigationInfo' => $navigationInfo,
        'users' => $users
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

    // Obtener segmentos si existen
    // Si este video es un fragmento, queremos sus hermanos (otros fragmentos del mismo padre)
    // Si este video es el padre, queremos sus fragmentos
    $targetParentId = $v['originalId'] ?: $v['id'];
    
    $stmtSeg = $pdo->prepare("SELECT id, videoUrl, title, duration, is_series_fragment, thumbnailUrl FROM videos WHERE originalId = ? OR id = ? ORDER BY createdAt ASC");
    $stmtSeg->execute([$targetParentId, $targetParentId]);
    $v['segments'] = $stmtSeg->fetchAll(PDO::FETCH_ASSOC);
    if (!empty($v['segments'])) {
        video_process_rows($v['segments']);
    }

    $rows = [$v]; 
    video_process_rows($rows); 
    respond(true, $rows[0]);
}

function video_get_by_creator($pdo, $userId) {
    $stmt = $pdo->prepare("SELECT * FROM videos WHERE creatorId = ? AND category NOT IN ('PENDING', 'PROCESSING', 'FAILED_METADATA') AND (transcode_status = 'NONE' OR transcode_status = 'DONE') AND (originalId IS NULL OR is_series_fragment = 1) AND (split_shorts = 0 OR transcode_status != 'DONE') ORDER BY createdAt DESC");
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

    $stmt = $pdo->prepare("SELECT * FROM videos WHERE category = ? AND id != ? AND category NOT IN ('PENDING', 'PROCESSING', 'FAILED_METADATA') AND (transcode_status = 'NONE' OR transcode_status = 'DONE') AND (originalId IS NULL OR is_series_fragment = 1) AND (split_shorts = 0 OR transcode_status != 'DONE') ORDER BY $orderBy LIMIT 12");
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

    $whereClause = "v.category NOT IN ('PENDING', 'PROCESSING', 'FAILED_METADATA') AND (v.transcode_status = 'NONE' OR v.transcode_status = 'DONE')";
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
    
    // Solo intentar bloquear videos que no estén ya en la cola de transcodificación
    $stmt = $pdo->prepare("UPDATE videos 
                           SET locked_at = :now, lock_id = :lockId 
                           WHERE category = 'PENDING' 
                           AND transcode_status = 'NONE'
                           AND processing_attempts < 5 
                           AND (locked_at < :time OR locked_at IS NULL)
                           ORDER BY processing_attempts ASC, RAND()
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

function video_discover_subfolders($pdo, $currentRelPath = '', $search = '', $mediaType = 'ALL', $recursive = false) {
    $stmt = $pdo->query("SELECT localLibraryPath, libraryPaths FROM system_settings WHERE id = 1");
    $s = $stmt->fetch();
    $paths = json_decode($s['libraryPaths'] ?: '[]', true);
    if ($s['localLibraryPath']) $paths[] = $s['localLibraryPath'];
    $roots = array_unique(array_filter(array_map(function($p) { return rtrim(str_replace('\\', '/', $p), '/'); }, $paths)));

    if (empty($roots)) return [];

    $currentRelPath = trim(str_replace('\\', '/', $currentRelPath), '/');
    $folderMap = [];

    // Cargar todos los videos de la base de datos para determinar carpetas con contenido
    $sql = "SELECT id, videoUrl, category, thumbnailUrl, is_audio, title, createdAt FROM videos 
            WHERE category NOT IN ('PENDING', 'PROCESSING', 'FAILED_METADATA') 
            AND is_private = 0";
    $stmtV = $pdo->prepare($sql);
    $stmtV->execute();
    $videos = $stmtV->fetchAll(PDO::FETCH_ASSOC);

    foreach ($videos as $v) {
        // Filtrado por tipo de media si aplica
        if ($mediaType === 'VIDEO') {
            if (isset($v['is_audio']) && $v['is_audio'] == 1) continue;
        } elseif ($mediaType === 'AUDIO') {
            $ext = strtolower(pathinfo($v['videoUrl'], PATHINFO_EXTENSION));
            $audioExts = ['mp3', 'wav', 'aac', 'm4a', 'flac', 'ogg', 'opus', 'm4b'];
            if ((!isset($v['is_audio']) || $v['is_audio'] != 1) && !in_array($ext, $audioExts)) continue;
        }

        if (!empty($search)) {
            if (stripos($v['title'], $search) === false && stripos($v['videoUrl'], $search) === false) {
                continue;
            }
        }

        $videoUrl = trim(str_replace('\\', '/', $v['videoUrl']), '/');
        $videoDir = dirname($videoUrl);
        $videoDir = trim(str_replace('\\', '/', $videoDir), '/');

        // Buscar a qué raíz pertenece el video
        foreach ($roots as $root) {
            $cleanedRoot = trim($root, '/');
            if (empty($cleanedRoot)) continue;

            if (strpos($videoDir, $cleanedRoot) === 0) {
                $relPath = trim(substr($videoDir, strlen($cleanedRoot)), '/');
                if ($relPath === '' || $relPath === '.') continue;

                $parts = explode('/', $relPath);

                if ($recursive) {
                    // Solo listamos la carpeta final de contenido real (evitando las principales intermedias vacías)
                    $folderKey = strtolower($relPath);
                    
                    // Obtener miniatura inteligente
                    $targetThumb = '';
                    if (!empty($v['thumbnailUrl']) && strpos($v['thumbnailUrl'], 'default') === false) {
                        $targetThumb = fix_url($v['thumbnailUrl']);
                    } else {
                        $isImgCandidate = preg_match('/\.(png|jpg|jpeg|gif|webp)$/i', $v['videoUrl']) || (isset($v['category']) && strcasecmp($v['category'], 'IMAGES') === 0);
                        if ($isImgCandidate) {
                            $targetThumb = fix_url($v['videoUrl']);
                        } else if (!empty($v['thumbnailUrl'])) {
                            $targetThumb = fix_url($v['thumbnailUrl']);
                        } else {
                            $targetThumb = 'api/uploads/thumbnails/default.jpg';
                        }
                    }

                    if (!isset($folderMap[$folderKey])) {
                        $folderMap[$folderKey] = [
                            'name' => $relPath,
                            'relativePath' => $relPath,
                            'count' => 0,
                            'thumbnailUrl' => $targetThumb
                        ];
                    }
                    $folderMap[$folderKey]['count']++;
                    if ((empty($folderMap[$folderKey]['thumbnailUrl']) || strpos($folderMap[$folderKey]['thumbnailUrl'], 'default') !== false) && !empty($targetThumb)) {
                        $folderMap[$folderKey]['thumbnailUrl'] = $targetThumb;
                    }
                } else {
                    // No recursivo: Se comporta de manera jerárquica (para la pantalla de Home Explorer)
                    $targetThumb = '';
                    if (!empty($v['thumbnailUrl']) && strpos($v['thumbnailUrl'], 'default') === false) {
                        $targetThumb = fix_url($v['thumbnailUrl']);
                    } else {
                        $isImgCandidate = preg_match('/\.(png|jpg|jpeg|gif|webp)$/i', $v['videoUrl']) || (isset($v['category']) && strcasecmp($v['category'], 'IMAGES') === 0);
                        if ($isImgCandidate) {
                            $targetThumb = fix_url($v['videoUrl']);
                        } else if (!empty($v['thumbnailUrl'])) {
                            $targetThumb = fix_url($v['thumbnailUrl']);
                        } else {
                            $targetThumb = 'api/uploads/thumbnails/default.jpg';
                        }
                    }

                    if ($currentRelPath === '') {
                        $folderName = $parts[0];
                        $folderKey = strtolower($folderName);
                        if (!isset($folderMap[$folderKey])) {
                            $folderMap[$folderKey] = [
                                'name' => $folderName,
                                'relativePath' => $folderName,
                                'count' => 0,
                                'thumbnailUrl' => $targetThumb
                            ];
                        }
                        $folderMap[$folderKey]['count']++;
                        if ((empty($folderMap[$folderKey]['thumbnailUrl']) || strpos($folderMap[$folderKey]['thumbnailUrl'], 'default') !== false) && !empty($targetThumb)) {
                            $folderMap[$folderKey]['thumbnailUrl'] = $targetThumb;
                        }
                    } else {
                        if (strpos($relPath, $currentRelPath) === 0) {
                            $suffix = trim(substr($relPath, strlen($currentRelPath)), '/');
                            if ($suffix !== '') {
                                $suffixParts = explode('/', $suffix);
                                $folderName = $suffixParts[0];
                                $relativePath = $currentRelPath . '/' . $folderName;
                                $folderKey = strtolower($relativePath);
                                if (!isset($folderMap[$folderKey])) {
                                    $folderMap[$folderKey] = [
                                        'name' => $folderName,
                                        'relativePath' => $relativePath,
                                        'count' => 0,
                                        'thumbnailUrl' => $targetThumb
                                    ];
                                }
                                $folderMap[$folderKey]['count']++;
                                if ((empty($folderMap[$folderKey]['thumbnailUrl']) || strpos($folderMap[$folderKey]['thumbnailUrl'], 'default') !== false) && !empty($targetThumb)) {
                                    $folderMap[$folderKey]['thumbnailUrl'] = $targetThumb;
                                }
                            }
                        }
                    }
                }
                break;
            }
        }
    }

    $folders = array_values($folderMap);

    // Group videos by lowercase relativePath to identify last thumbs and new posts count
    $folderVideosList = [];
    foreach ($videos as $v) {
        $videoUrl = trim(str_replace('\\', '/', $v['videoUrl']), '/');
        $videoDir = dirname($videoUrl);
        $videoDir = trim(str_replace('\\', '/', $videoDir), '/');
        
        foreach ($roots as $root) {
            $cleanedRoot = trim($root, '/');
            if (empty($cleanedRoot)) continue;
            if (strpos($videoDir, $cleanedRoot) === 0) {
                $relPath = trim(substr($videoDir, strlen($cleanedRoot)), '/');
                if ($relPath === '' || $relPath === '.') continue;
                $folderVideosList[strtolower($relPath)][] = $v;
                break;
            }
        }
    }

    // Load all metadata from groups_metadata
    $metaMap = [];
    try {
        $stmtM = $pdo->query("SELECT folderPath, creatorId, description, coverUrl, isPrivate, isUnified, allowUpload, createdAt FROM groups_metadata");
        $allMeta = $stmtM->fetchAll(PDO::FETCH_ASSOC);
        foreach ($allMeta as $m) {
            $metaMap[strtolower($m['folderPath'])] = $m;
        }
    } catch (Exception $e) {}

    // Load members count map from group_subscriptions where approved = 1
    $membersMap = [];
    try {
        $stmtMem = $pdo->query("SELECT folderPath, COUNT(*) as count FROM group_subscriptions WHERE approved = 1 GROUP BY folderPath");
        $allMem = $stmtMem->fetchAll(PDO::FETCH_ASSOC);
        foreach ($allMem as $m) {
            $membersMap[strtolower($m['folderPath'])] = (int)$m['count'];
        }
    } catch (Exception $e) {}

    foreach ($folders as &$f) {
        $key = strtolower($f['relativePath']);
        
        // Metadata
        if (isset($metaMap[$key])) {
            $f['creatorId'] = $metaMap[$key]['creatorId'];
            $f['description'] = $metaMap[$key]['description'];
            $f['coverUrl'] = $metaMap[$key]['coverUrl'] ? fix_url($metaMap[$key]['coverUrl']) : null;
            $f['isPrivate'] = (int)$metaMap[$key]['isPrivate'];
            $f['isUnified'] = (int)($metaMap[$key]['isUnified'] ?? 0);
            $f['allowUpload'] = isset($metaMap[$key]['allowUpload']) ? (int)$metaMap[$key]['allowUpload'] : 1;
            $f['createdAt'] = (int)$metaMap[$key]['createdAt'];
        } else {
            $f['creatorId'] = 'admin';
            $f['description'] = 'Grupo sin descripción.';
            $f['coverUrl'] = null;
            $f['isPrivate'] = 0;
            $f['isUnified'] = 0;
            $f['allowUpload'] = 1;
            $f['createdAt'] = time();
        }

        // Subscriptions count
        $f['membersCount'] = isset($membersMap[$key]) ? $membersMap[$key] : 0;
        if ($f['membersCount'] === 0) {
            $f['membersCount'] = 1; // At least the creator
        }

        // Miniatures
        $f['lastVideoThumb'] = null;
        $f['lastAudioThumb'] = null;
        $f['lastImageThumb'] = null;
        $f['newPosts'] = 0;

        if (isset($folderVideosList[$key])) {
            $grpVideos = $folderVideosList[$key];
            // Sort by createdAt descending
            usort($grpVideos, function($a, $b) {
                $aTime = isset($a['createdAt']) ? (is_numeric($a['createdAt']) ? (int)$a['createdAt'] : strtotime($a['createdAt'])) : strtotime(date("Y-m-d H:i:s"));
                $bTime = isset($b['createdAt']) ? (is_numeric($b['createdAt']) ? (int)$b['createdAt'] : strtotime($b['createdAt'])) : strtotime(date("Y-m-d H:i:s"));
                return $bTime <=> $aTime;
            });

            $oneDayAgo = time() - 86400;
            foreach ($grpVideos as $gv) {
                if (!isset($gv['createdAt'])) {
                    $gv['createdAt'] = date("Y-m-d H:i:s");
                }
                $gvTime = is_numeric($gv['createdAt']) ? (int)$gv['createdAt'] : strtotime($gv['createdAt']);
                if ($gvTime >= $oneDayAgo) {
                    $f['newPosts']++;
                }

                $gvThumb = !empty($gv['thumbnailUrl']) ? fix_url($gv['thumbnailUrl']) : null;
                $isImage = preg_match('/\.(png|jpg|jpeg|gif|webp)$/i', $gv['videoUrl']) || (isset($gv['category']) && strcasecmp($gv['category'], 'IMAGES') === 0);
                $isAudio = isset($gv['is_audio']) && $gv['is_audio'] == 1;

                if ($isImage) {
                    if (!$f['lastImageThumb']) {
                        $f['lastImageThumb'] = fix_url($gv['videoUrl']);
                    }
                } else if ($isAudio) {
                    if (!$f['lastAudioThumb']) {
                        $f['lastAudioThumb'] = $gvThumb ?: 'api/uploads/thumbnails/default.jpg';
                    }
                } else {
                    if (!$f['lastVideoThumb']) {
                        $f['lastVideoThumb'] = $gvThumb ?: 'api/uploads/thumbnails/default.jpg';
                    }
                }
            }
        }
    }

    usort($folders, function($a, $b) {
        return strcasecmp($a['name'], $b['name']);
    });

    return $folders;
}

function video_upload($pdo, $post, $files) {
    if (!isset($files['video']) || $files['video']['error'] !== UPLOAD_ERR_OK) {
        respond(false, null, "Error en el archivo de video: " . ($files['video']['error'] ?? 'No enviado'));
    }

    $id = 'v_' . uniqid();
    $videoPath = null; 
    
    $ext = pathinfo($files['video']['name'], PATHINFO_EXTENSION); 
    $videoName = "{$id}.{$ext}";
    $videoDir = 'uploads/videos/';
    $folderParam = trim($post['folder'] ?? '');
    if (!empty($folderParam)) {
        $stmtSet = $pdo->query("SELECT localLibraryPath FROM system_settings WHERE id = 1");
        $sSet = $stmtSet->fetch();
        $localPath = $sSet['localLibraryPath'] ?? '';
        if (!empty($localPath)) {
            $videoDir = rtrim(str_replace('\\', '/', $localPath), '/') . '/' . trim($folderParam, '/') . '/';
        } else {
            $videoDir = 'uploads/videos/' . trim($folderParam, '/') . '/';
        }
    }
    if (!is_dir($videoDir)) mkdir($videoDir, 0777, true);
    
    if (!move_uploaded_file($files['video']['tmp_name'], $videoDir . $videoName)) {
        respond(false, null, "Error al guardar el video en el servidor");
    }
    $videoPath = $videoDir . $videoName;

    $thumbPath = 'api/uploads/thumbnails/default.jpg'; 
    $thumbDir = 'uploads/thumbnails/';
    if (!is_dir($thumbDir)) mkdir($thumbDir, 0777, true);

    if (isset($files['thumbnail']) && $files['thumbnail']['error'] === UPLOAD_ERR_OK) {
        $thumbName = "{$id}.jpg"; 
        $dest = $thumbDir . $thumbName;
        if (move_uploaded_file($files['thumbnail']['tmp_name'], $dest)) {
            $thumbPath = 'api/' . $dest;
            create_thumbnail($dest); // Genera _thumb.jpg automáticamente
        }
    } else if ($videoPath) {
        $bins = get_ffmpeg_binaries($pdo);
        $thumbName = "{$id}.jpg";
        $thumbDest = $thumbDir . $thumbName;
        if (extract_video_thumbnail($videoPath, $thumbDest, $bins['ffmpeg'])) {
            $thumbPath = 'api/' . $thumbDest;
            create_thumbnail($thumbDest); // Genera _thumb.jpg automáticamente
        }
    }

    $settings = get_system_settings($pdo);
    $autoTranscode = (int)($settings['autoTranscode'] ?? 0);

    $price = floatval($post['price'] ?? 0);
    // Permitir videos gratis (0) o forzar 1.0 si es lo deseado, pero mejor permitir flexibilidad
    // $price = $price <= 0 ? 1.00 : $price; 

    $transcodeStatus = 'NONE';
    $extLower = strtolower($ext);
    $audioExts = ['mp3', 'wav', 'aac', 'm4a', 'flac', 'ogg', 'opus', 'm4b'];
    $isAudio = in_array($extLower, $audioExts) ? 1 : 0;
    if ($extLower === 'mp4') $isAudio = 0;

    if ($autoTranscode === 1 && $extLower !== 'mp4' && $extLower !== 'mp3') {
        $transcodeStatus = 'WAITING';
    }

    $category = $post['category'] ?? 'PERSONAL';
    $collection = $post['collection'] ?? null;
    $isPrivate = !empty($post['is_private']) ? 1 : 0;
    $duration = intval($post['duration'] ?? 0);
    $title = !empty($post['title']) ? $post['title'] : "Video $id";
    $desc = $post['description'] ?? '';
    // Usar el userId del token preferiblemente si functions_auth define una forma de obtenerlo, 
    // pero por ahora usamos el enviado (asumiendo que DBService añadió el Bearer)
    $creatorId = $post['userId'] ?? 'anonymous';

    try {
        $stmt = $pdo->prepare("INSERT INTO videos (id, title, description, price, category, duration, videoUrl, thumbnailUrl, creatorId, createdAt, transcode_status, collection, is_audio, is_private) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
        $stmt->execute([$id, $title, $desc, $price, $category, $duration, $videoPath, $thumbPath, $creatorId, time(), $transcodeStatus, $collection, $isAudio, $isPrivate]);
        
        video_organize_single($pdo, $id, $settings);

        // --- RETO SEMANAL ---
        require_once __DIR__ . '/functions_challenges.php';
        check_weekly_upload_challenge($pdo, $creatorId);
        // --------------------

        respond(true, ['id' => $id, 'url' => $videoPath]);
    } catch (Exception $e) {
        respond(false, null, "Error en base de datos: " . $e->getMessage());
    }
}

function video_unlock($pdo, $input) {
    $id = $input['id'];
    $pdo->prepare("UPDATE videos SET locked_at = 0, lock_id = NULL WHERE id = ?")->execute([$id]);
    respond(true);
}

function video_update_metadata($pdo, $post, $files) {
    $id = $post['id']; 
    $success = ($post['success'] ?? '1') === '1';
    $clientIncompatible = ($post['clientIncompatible'] ?? '0') === '1';

    $fields = ["processing_attempts = processing_attempts + 1", "locked_at = 0", "lock_id = NULL"]; 
    $params = [];

    if (!$success) {
        // Marcamos como WAITING para que el transcodificador lo repare
        if ($clientIncompatible) {
            $pdo->prepare("UPDATE videos SET transcode_status = 'WAITING', reason = 'Client incompatible/Metadata error', locked_at = 0, lock_id = NULL WHERE id = ?")->execute([$id]);
        } else {
            // Si falla después de varios intentos, también lo mandamos a transcodificar
            $pdo->prepare("UPDATE videos SET " . implode(", ", $fields) . ", transcode_status = 'WAITING', reason = 'Metadata extraction failed consistently (Collaborative)' WHERE id = ? AND processing_attempts >= 2")->execute([$id]);
        }
        respond(true); 
    }
    
    $fields = ["duration = ?", "processing_attempts = 0", "locked_at = 0", "lock_id = NULL"]; 
    $params = [intval($post['duration'])];
    $hasThumbnail = false;

    if (isset($files['thumbnail']) && $files['thumbnail']['error'] === UPLOAD_ERR_OK) {
        $thumbName = "t_{$id}.jpg"; 
        $target = 'uploads/thumbnails/' . $thumbName;
        move_uploaded_file($files['thumbnail']['tmp_name'], $target);
        
        // Crear miniatura optimizada del thumbnail
        create_thumbnail($target, str_replace('.jpg', '_thumb.jpg', $target), 480, 270, 75);
        
        $fields[] = "thumbnailUrl = ?"; 
        $params[] = 'api/' . $target;
        $hasThumbnail = true;
    }

    // Obtener info básica para decidir transcode_status
    $stmtV = $pdo->prepare("SELECT is_audio FROM videos WHERE id = ?");
    $stmtV->execute([$id]);
    $vData = $stmtV->fetch();
    $isAudio = $vData && (int)$vData['is_audio'] === 1;

    // Si es un vídeo y no se pudo extraer la miniatura, lo enviamos a la cola de conversión
    // para que FFmpeg en el servidor intente capturar el frame.
    $finalStatus = ($hasThumbnail || $isAudio) ? 'DONE' : 'WAITING';
    $reason = '';
    if ($finalStatus === 'WAITING') {
        $fields[] = "transcode_status = ?";
        $params[] = 'WAITING';
        $fields[] = "reason = ?";
        $params[] = 'Collaborative extraction: Missing thumbnail';
    } else {
        $fields[] = "transcode_status = ?";
        $params[] = 'DONE';
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

    // Solo actualizar título si está vacío o es un nombre genérico (ID o UUID)
    $newTitle = $v['title'];
    $isGenericTitle = (
        empty($v['title']) || 
        strpos($v['title'], 'v_') === 0 || 
        strpos($v['title'], 'vid_') === 0 || 
        strpos($v['title'], 'img_') === 0 ||
        strpos($v['title'], 'Video v_') === 0
    );
    if ($isGenericTitle && !empty($meta['title']) && strpos($meta['title'], 'v_') !== 0) {
        $newTitle = $meta['title'];
    }

    $catPrice = getPriceForCategory($newCategory, $settings, $meta['parent_category']);
    $price = (floatval($v['price'] ?? 0) > 0) ? $v['price'] : $catPrice;

    $updateDate = ($oldCategory === 'PENDING' || $oldCategory === 'PROCESSING');
    if ($updateDate) {
        $pdo->prepare("UPDATE videos SET title = ?, category = ?, parent_category = ?, collection = ?, price = ?, createdAt = ? WHERE id = ?")
            ->execute([$newTitle, $newCategory, $meta['parent_category'], $meta['collection'], $price, time(), $id]);
    } else {
        $pdo->prepare("UPDATE videos SET title = ?, category = ?, parent_category = ?, collection = ?, price = ? WHERE id = ?")
            ->execute([$newTitle, $newCategory, $meta['parent_category'], $meta['collection'], $price, $id]);
    }

    // Notificar solo si pasa de PENDING/PROCESSING a una categoría real
    $isNowPublic = !in_array($newCategory, ['PENDING', 'PROCESSING', 'FAILED_METADATA', 'BROKEN']);
    $wasNotPublic = in_array($oldCategory, ['PENDING', 'PROCESSING', '']);
    
    if ($isNowPublic && $wasNotPublic) {
        if ($v['is_private']) return; // Don't notify private content
        require_once 'functions_interactions.php';
        interact_notify_subscribers($pdo, $v['creatorId'], 'UPLOAD', "¡Nuevo contenido! {$newTitle}", "/watch/{$id}", $v['thumbnailUrl']);
    }
}

function video_increment_share($pdo, $videoId) {
    $stmt = $pdo->prepare("UPDATE videos SET shares = shares + 1 WHERE id = ?");
    $stmt->execute([$videoId]);
    respond(true);
}

function video_reshare($pdo, $input) {
    $originalId = $input['originalId'] ?? '';
    $originalMarketplaceId = $input['originalMarketplaceId'] ?? '';
    $userId = $input['userId'] ?? '';
    $description = $input['description'] ?? '';
    
    if ((!$originalId && !$originalMarketplaceId) || !$userId) respond(false, null, "Faltan parámetros");
    
    $newId = uniqid('reshare_');
    $now = time();
    $title = '';
    $category = 'GENERAL';
    $thumbnail = null;
    $duration = 0;
    $isAudio = 0;
    $price = 0;

    if ($originalId) {
        // Obtener datos del video original
        $stmtO = $pdo->prepare("SELECT * FROM videos WHERE id = ?");
        $stmtO->execute([$originalId]);
        $orig = $stmtO->fetch();
        if (!$orig) respond(false, null, "Publicación original no encontrada");
        $title = $orig['title'];
        $category = $orig['category'];
        $thumbnail = $orig['thumbnailUrl'];
        $duration = $orig['duration'] ?? 0;
        $isAudio = $orig['is_audio'] ?? 0;
        $price = $orig['price'] ?? 0;
    } else {
        // Obtener datos del producto original
        $stmtM = $pdo->prepare("SELECT * FROM marketplace_items WHERE id = ?");
        $stmtM->execute([$originalMarketplaceId]);
        $item = $stmtM->fetch();
        if (!$item) respond(false, null, "Producto no encontrado");
        $title = $item['title'];
        $category = 'MARKETPLACE';
        $imgs = json_decode($item['images'] ?? '[]', true);
        $thumbnail = count($imgs) > 0 ? $imgs[0] : null;
        $price = $item['price'] ?? 0;
    }
    
    // Crear el nuevo post (repost)
    $stmt = $pdo->prepare("INSERT INTO videos (id, title, description, creatorId, createdAt, originalId, originalMarketplaceId, category, thumbnailUrl, duration, is_audio, price) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
    $stmt->execute([
        $newId,
        $title,
        $description,
        $userId,
        $now,
        $originalId ?: null,
        $originalMarketplaceId ?: null,
        $category,
        $thumbnail,
        $duration,
        $isAudio,
        $price
    ]);
    
    if ($originalId) {
        $pdo->prepare("UPDATE videos SET shares = shares + 1 WHERE id = ?")->execute([$originalId]);
    }
    
    respond(true, ['id' => $newId]);
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
                $category = substr($lastPart, 0, 250);
            }
        }
        
        // Si sigue siendo PENDING o vacío, forzar GENERAL para que no se repita el proceso infinitamente
        if ($category === 'PENDING' || empty($category)) {
            $category = 'GENERAL';
        }

        if (count($parts) > 0) {
            $parent_category = substr(array_pop($parts), 0, 250);
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
    // Solo resetear videos que EXPLÍCITAMENTE no tengan duración ni miniatura y no estén siendo procesados
    $stmt = $pdo->query("UPDATE videos SET category = 'PENDING', locked_at = 0 WHERE (duration = 0 OR thumbnailUrl IS NULL OR thumbnailUrl = '') AND transcode_status != 'PROCESSING'");
    respond(true, ['fixedBroken' => $stmt->rowCount()]);
}

function get_channel_content($pdo, $input) {
    $userId = $input['userId'];
    $filter = $input['filter'] ?? 'ALL';
    
    $where = ["creatorId = ?", "is_private = 0", "category NOT IN ('PENDING', 'PROCESSING', 'FAILED_METADATA')", "(transcode_status = 'NONE' OR transcode_status = 'DONE')"];
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
    
    $sql = "SELECT v.*, u.username as creatorName, u.avatarUrl as creatorAvatarUrl 
            FROM videos v 
            LEFT JOIN users u ON v.creatorId = u.id 
            WHERE " . implode(' AND ', $where) . " 
            ORDER BY v.createdAt DESC";
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
    $userId = $post['userId'] ?? '';
    $batchTitle = $post['title'] ?? 'Publicación';
    $batchDescription = $post['description'] ?? '';
    $type = $post['type'] ?? 'INDEPENDENT';
    $count = (int)($post['count'] ?? 0);

    if (!$userId) respond(false, null, "ID de usuario faltante");

    $uploadedIds = [];
    $collectionId = $count > 1 ? 'album_' . uniqid() : null;
    for ($i = 0; $i < $count; $i++) {
        $key = "image_$i";
        if (isset($files[$key]) && $files[$key]['error'] === UPLOAD_ERR_OK) {
            $ext = strtolower(pathinfo($files[$key]['name'], PATHINFO_EXTENSION));
            $videoExts = ['mp4', 'mov', 'avi', 'mkv', 'webm', '3gp'];
            $isVid = in_array($ext, $videoExts);
            
            $filename = uniqid($isVid ? 'vid_' : 'img_') . '.' . $ext;
            $targetDir = 'uploads/videos/';
            $folderParam = trim($post['folder'] ?? '');
            if (!empty($folderParam)) {
                $stmtSet = $pdo->query("SELECT localLibraryPath FROM system_settings WHERE id = 1");
                $sSet = $stmtSet->fetch();
                $localPath = $sSet['localLibraryPath'] ?? '';
                if (!empty($localPath)) {
                    $targetDir = rtrim(str_replace('\\', '/', $localPath), '/') . '/' . trim($folderParam, '/') . '/';
                } else {
                    $targetDir = 'uploads/videos/' . trim($folderParam, '/') . '/';
                }
            }
            if (!is_dir($targetDir)) mkdir($targetDir, 0777, true);
            $target = $targetDir . $filename; 
            
            if (move_uploaded_file($files[$key]['tmp_name'], $target)) {
                // Individual metadata or fallback to batch
                $title = $post["title_$i"] ?? $batchTitle;
                if ($count > 1 && !isset($post["title_$i"])) {
                    $title = $batchTitle . " (" . ($i + 1) . "/$count)";
                }
                $description = $post["description_$i"] ?? $batchDescription;
                $category = $post["category_$i"] ?? ($isVid ? 'PERSONAL' : 'IMAGES');
                $price = floatval($post["price_$i"] ?? 0);
                $isPrivate = !empty($post["is_private_$i"]) ? 1 : 0;
                $duration = intval($post["duration_$i"] ?? 0);

                $thumbnail = $target;
                if (!$isVid) {
                    // Crear miniatura para la imagen del canal
                    create_thumbnail($target, str_replace('.' . $ext, '_thumb.jpg', $target), 600, 600, 75);
                    $thumbnail = 'api/' . str_replace('.' . $ext, '_thumb.jpg', $target);
                } else {
                    // Si es video, intentar extraer miniatura
                    $bins = get_ffmpeg_binaries($pdo);
                    $thumbName = str_replace('.' . $ext, '_thumb.jpg', $filename);
                    if (!is_dir('uploads/thumbnails/')) mkdir('uploads/thumbnails/', 0777, true);
                    $thumbDest = 'uploads/thumbnails/' . $thumbName;
                    
                    if (extract_video_thumbnail($target, $thumbDest, $bins['ffmpeg'])) {
                        $thumbnail = 'api/' . $thumbDest;
                    } else {
                        $thumbnail = 'api/uploads/thumbnails/default.jpg';
                    }
                }
                
                $stmt = $pdo->prepare("INSERT INTO videos (id, title, description, videoUrl, thumbnailUrl, creatorId, createdAt, category, is_audio, duration, collection, price, is_private) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
                $id = uniqid();
                $stmt->execute([
                    $id,
                    $title,
                    $description,
                    $target,
                    $thumbnail, 
                    $userId,
                    time(),
                    $category,
                    0, // is_audio (TODO: Detectar audio real si se sube audio)
                    $duration,
                    $collectionId,
                    $price,
                    $isPrivate
                ]);
                
                // Si es video, activar procesamiento
                if ($isVid) {
                    $settings = get_system_settings($pdo);
                    video_organize_single($pdo, $id, $settings);
                }

                $uploadedIds[] = $id;
            }
        }
    }

    if (empty($uploadedIds)) {
        respond(false, null, "No se pudieron subir los archivos. Verifica los límites de tamaño o errores de red.");
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
        $vPath = resolve_video_path($v['videoUrl']);
        if ($vPath && file_exists($vPath)) {
            @unlink($vPath);
            // También intentar borrar miniatura si existe
            $ext = pathinfo($vPath, PATHINFO_EXTENSION);
            $thumb = str_replace('.' . $ext, '_thumb.jpg', $vPath);
            if (file_exists($thumb)) @unlink($thumb);
        } 
        
        $tPath = resolve_video_path($v['thumbnailUrl']);
        if ($tPath && file_exists($tPath)) {
            @unlink($tPath);
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
    
    // Prevent editing core metadata if it's a reshare
    $isReshare = (strpos($id, 'reshare_') === 0 || !empty($video['originalId']) || !empty($video['originalMarketplaceId']));
    
    $fields = [];
    $params = [];
    
    if (isset($input['title'])) { 
        if ($isReshare && $video['creatorId'] === $userId) {
             // User trying to edit their own reshare - block title change
        } else {
            $fields[] = "title = ?"; $params[] = $input['title']; 
        }
    }
    if (isset($input['description'])) { $fields[] = "description = ?"; $params[] = $input['description']; }
    if (isset($input['price'])) { 
        if ($isReshare && $video['creatorId'] === $userId) {
            // Block price change on reshare
        } else {
            $fields[] = "price = ?"; $params[] = floatval($input['price']); 
        }
    }
    if (isset($input['category'])) { 
        if ($isReshare && $video['creatorId'] === $userId) {
            // Block category change on reshare
        } else {
            $fields[] = "category = ?"; $params[] = $input['category']; 
        }
    }
    
    if (empty($fields)) respond(false, null, "Nada que actualizar o sin permisos para estos campos");
    
    $params[] = $id;
    $pdo->prepare("UPDATE videos SET " . implode(', ', $fields) . " WHERE id = ?")->execute($params);
    respond(true);
}

function upload_story($pdo, $post, $files) {
    $userId = $post['userId'] ?? '';
    if (!$userId) respond(false, null, "ID de usuario faltante");

    $type = $post['type'] ?? 'IMAGE';
    $overlayText = $post['overlayText'] ?? null;
    $overlayColor = $post['overlayColor'] ?? '#ffffff';
    $overlayBg = $post['overlayBg'] ?? 'rgba(0,0,0,0.5)';
    
    $audioUrl = $post['audioUrl'] ?? null;
    if (isset($files['audio']) && $files['audio']['error'] === UPLOAD_ERR_OK) {
        $audioId = uniqid('audio_');
        $audioExt = pathinfo($files['audio']['name'], PATHINFO_EXTENSION);
        $audioFilename = $audioId . '.' . $audioExt;
        $audioTarget = 'uploads/stories/' . $audioFilename;
        if (move_uploaded_file($files['audio']['tmp_name'], $audioTarget)) {
            $audioUrl = 'api/' . $audioTarget;
        }
    }

    // Si no hay archivo, es una compartición de contenido existente o texto
    if (!isset($files['file']) || $files['file']['error'] === UPLOAD_ERR_NO_FILE || $files['file']['error'] !== UPLOAD_ERR_OK) {
        // Opción 1: Crear historia desde video existente
        if (!empty($post['videoId'])) {
            $stmtV = $pdo->prepare("SELECT videoUrl, category, is_audio, thumbnailUrl FROM videos WHERE id = ?");
            $stmtV->execute([$post['videoId']]);
            $video = $stmtV->fetch();
            
            if ($video) {
                $id = uniqid('story_');
                $now = time();
                $expiry = $now + (24 * 3600);
                
                $storyType = ($video['category'] === 'IMAGES') ? 'IMAGE' : 'VIDEO';
                
                $stmt = $pdo->prepare("INSERT INTO stories (id, userId, contentUrl, type, overlayText, overlayColor, overlayBg, audioUrl, videoId, createdAt, expiresAt, duration) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
                $stmt->execute([$id, $userId, $video['videoUrl'], $storyType, $overlayText, $overlayColor, $overlayBg, $audioUrl, $post['videoId'], $now, $expiry, 15]);
                respond(true, ['id' => $id]);
                return;
            }
        }

        // Opción 1.5: Crear historia desde producto
        if (!empty($post['productId'])) {
            $stmtP = $pdo->prepare("SELECT images, title FROM marketplace_items WHERE id = ?");
            $stmtP->execute([$post['productId']]);
            $product = $stmtP->fetch();

            if ($product) {
                $imgs = json_decode($product['images'] ?? '[]', true);
                $contentUrl = count($imgs) > 0 ? $imgs[0] : '';
                
                $id = uniqid('story_');
                $now = time();
                $expiry = $now + (24 * 3600);
                
                $stmt = $pdo->prepare("INSERT INTO stories (id, userId, contentUrl, type, overlayText, overlayColor, overlayBg, audioUrl, productId, createdAt, expiresAt, duration) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
                $stmt->execute([$id, $userId, $contentUrl, 'IMAGE', $overlayText, $overlayColor, $overlayBg, $audioUrl, $post['productId'], $now, $expiry, 15]);
                respond(true, ['id' => $id]);
                return;
            }
        }

        // Opción 2: Historia de solo texto (con fondo gradiente o imagen por defecto)
        if ($overlayText) {
            $id = uniqid('story_');
            $now = time();
            $expiry = $now + (24 * 3600);
            
            // Usar una imagen de fondo por defecto
            $contentUrl = 'api/uploads/stories/text_bg.jpg'; 
            
            $stmt = $pdo->prepare("INSERT INTO stories (id, userId, contentUrl, type, overlayText, overlayColor, overlayBg, audioUrl, createdAt, expiresAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
            $stmt->execute([$id, $userId, $contentUrl, 'IMAGE', $overlayText, $overlayColor, $overlayBg, $audioUrl, $now, $expiry]);
            respond(true, ['id' => $id]);
            return;
        }

        // Error si llegamos aquí buscando compartición pero no hay datos
        if (isset($files['file']) && $files['file']['error'] !== UPLOAD_ERR_NO_FILE) {
             respond(false, null, "Error en archivo: " . $files['file']['error']);
        } else {
             respond(false, null, "No se recibió contenido para la historia (videoId, productId o file)");
        }
        return;
    }

    $id = uniqid('story_');
    $ext = pathinfo($files['file']['name'], PATHINFO_EXTENSION);
    $filename = $id . '.' . $ext;
    $target = 'uploads/videos/' . $filename;

    if (move_uploaded_file($files['file']['tmp_name'], $target)) {
        // Crear miniatura si es una imagen
        if ($type === 'IMAGE') {
            create_thumbnail($target, str_replace('.' . $ext, '_thumb.jpg', $target), 400, 700, 70);
        } else if ($type === 'VIDEO') {
            // Extraer miniatura del video para la historia
            $bins = get_ffmpeg_binaries($pdo);
            extract_video_thumbnail($target, str_replace('.' . $ext, '_thumb.jpg', $target), $bins['ffmpeg']);
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
    $userId = $_GET['userId'] ?? '';
    $limit = isset($_GET['limit']) ? (int)$_GET['limit'] : 200;
    $offset = isset($_GET['offset']) ? (int)$_GET['offset'] : 0;

    $oneDayAgo = $now - 86400;

    // 1. Obtener historias reales de la base de datos (duración < 24 horas)
    $sql = "SELECT s.*, u.username, u.avatarUrl,
            (CASE WHEN s.userId IN (SELECT creatorId FROM subscriptions WHERE subscriberId = ?) THEN 1 ELSE 0 END) as isFriend
            FROM stories s 
            JOIN users u ON s.userId = u.id 
            WHERE s.createdAt >= ? AND s.expiresAt > ? 
            ORDER BY s.createdAt DESC";
    $stmt = $pdo->prepare($sql);
    $stmt->execute([$userId, $oneDayAgo, $now]);
    $realStories = $stmt->fetchAll(PDO::FETCH_ASSOC);

    foreach ($realStories as &$s) {
        $s['contentUrl'] = fix_url($s['contentUrl']);
        $s['avatarUrl'] = fix_url($s['avatarUrl']);
        $s['audioUrl'] = fix_url($s['audioUrl']);
        $s['isFriend'] = (int)($s['isFriend'] ?? 0);

        if (!empty($s['videoId'])) {
            $stmtV = $pdo->prepare("SELECT v.*, u.username as creatorName, u.avatarUrl as creatorAvatarUrl, u.role as creatorRole FROM videos v LEFT JOIN users u ON v.creatorId = u.id WHERE v.id = ?");
            $stmtV->execute([$s['videoId']]);
            $orig = $stmtV->fetch();
            if ($orig) {
                $temp = [$orig];
                video_process_rows($temp);
                $s['originalVideo'] = $temp[0];
            }
        }

        if (!empty($s['productId'])) {
            $stmtP = $pdo->prepare("SELECT p.*, u.username as sellerName, u.avatarUrl as sellerAvatarUrl FROM marketplace_items p LEFT JOIN users u ON p.sellerId = u.id WHERE p.id = ?");
            $stmtP->execute([$s['productId']]);
            $item = $stmtP->fetch();
            if ($item) {
                $item['images'] = json_decode($item['images'] ?? '[]', true);
                if (is_array($item['images'])) {
                    foreach ($item['images'] as &$img) $img = fix_url($img);
                }
                $item['sellerAvatarUrl'] = fix_url($item['sellerAvatarUrl']);
                $s['originalMarketplaceItem'] = $item;
            }
        }
    }

    // 2. Obtener grupos/subcarpetas que sigue el usuario
    $followedGroups = [];
    if (!empty($userId)) {
        $stmtGs = $pdo->prepare("SELECT folderPath FROM group_subscriptions WHERE userId = ?");
        $stmtGs->execute([$userId]);
        $followedGroups = $stmtGs->fetchAll(PDO::FETCH_COLUMN);
    }

    // 3. Obtener raíces del sistema de archivos para determinar relPath de los videos
    $stmtRoots = $pdo->query("SELECT localLibraryPath, libraryPaths FROM system_settings WHERE id = 1");
    $sRoots = $stmtRoots->fetch();
    $paths = json_decode($sRoots['libraryPaths'] ?: '[]', true);
    if ($sRoots['localLibraryPath']) $paths[] = $sRoots['localLibraryPath'];
    $roots = array_unique(array_filter(array_map(function($p) { return rtrim(str_replace('\\', '/', $p), '/'); }, $paths)));

    // 4. Obtener todos los videos de las subcarpetas con contenido
    $sqlV = "SELECT v.*, u.username as creatorName, u.avatarUrl as creatorAvatarUrl 
             FROM videos v 
             LEFT JOIN users u ON v.creatorId = u.id 
             WHERE v.category NOT IN ('PENDING', 'PROCESSING', 'FAILED_METADATA') 
               AND v.is_private = 0";
    $stmtV = $pdo->query($sqlV);
    $allVideos = $stmtV->fetchAll(PDO::FETCH_ASSOC);

    // Agrupar videos por su subcarpeta
    $videosBySubfolder = [];
    foreach ($allVideos as $v) {
        $videoUrl = trim(str_replace('\\', '/', $v['videoUrl']), '/');
        $videoDir = dirname($videoUrl);
        $videoDir = trim(str_replace('\\', '/', $videoDir), '/');

        $relPath = '';
        foreach ($roots as $root) {
            $cleanedRoot = trim($root, '/');
            if (empty($cleanedRoot)) continue;

            if (strpos($videoDir, $cleanedRoot) === 0) {
                $relPath = trim(substr($videoDir, strlen($cleanedRoot)), '/');
                break;
            }
        }

        if ($relPath !== '' && $relPath !== '.') {
            $vKey = strtolower($relPath);
            if (!isset($videosBySubfolder[$vKey])) {
                $videosBySubfolder[$vKey] = [
                    'relativePath' => $relPath,
                    'videos' => []
                ];
            }
            $videosBySubfolder[$vKey]['videos'][] = $v;
        }
    }

    // 5. Generar historias de subcarpetas (grupos) con contenido
    $groupStories = [];
    foreach ($videosBySubfolder as $vKey => $folderData) {
        $relPath = $folderData['relativePath'];
        $folderVideos = $folderData['videos'];

        // Deterministic seeding based on current 24-hour day block and relPath to achieve:
        // - "Generar entre 1 y 5 historias aleatorias por grupo."
        // - "Mantenerse fijas durante 24 horas y regenerarse automáticamente de forma determinista."
        $dayBlock = floor($now / 86400); 
        $hash = md5($relPath . '_' . $dayBlock);
        
        // Count to select: between 1 and 5
        $numStoriesToSelect = (hexdec(substr($hash, 0, 4)) % 5) + 1;
        $numStoriesToSelect = min($numStoriesToSelect, count($folderVideos));
        
        // Sort folderVideos by ID so starting order is 100% stable
        usort($folderVideos, function($a, $b) {
            return (int)$a['id'] <=> (int)$b['id'];
        });
        
        // Now pick $numStoriesToSelect videos deterministically using the hash
        $selectedVideos = [];
        $tempVideos = $folderVideos;
        for ($i = 0; $i < $numStoriesToSelect; $i++) {
            if (empty($tempVideos)) break;
            $subSeed = hexdec(substr($hash, 4 + $i * 4, 4));
            $idx = $subSeed % count($tempVideos);
            $selectedVideos[] = $tempVideos[$idx];
            array_splice($tempVideos, $idx, 1);
        }

        $isSubscribed = in_array($relPath, $followedGroups) ? 1 : 0;
        if (!$isSubscribed) {
            continue;
        }

        foreach ($selectedVideos as $index => $mv) {
            // Determinar miniatura inteligente
            $storyThumb = isset($mv['thumbnailUrl']) ? $mv['thumbnailUrl'] : '';
            $isImg = preg_match('/\.(png|jpg|jpeg|gif|webp)$/i', $mv['videoUrl']) || (isset($mv['category']) && strcasecmp($mv['category'], 'IMAGES') === 0);
            if (empty($storyThumb) && $isImg) {
                $storyThumb = $mv['videoUrl'];
            }
            if (empty($storyThumb)) {
                $storyThumb = 'api/uploads/thumbnails/default.jpg';
            }

            // Nombre del grupo (subcarpeta)
            $grpName = basename($relPath);

            // Simular un creador basado en el grupo
            $simulatedCreatedAt = $now - (2 * 3600) - ($index * 3600); // Strictly within 24 hours

            // Procesar fila del video para tener campos completos en originalVideo
            $temp = [$mv];
            video_process_rows($temp);
            $processedVideo = $temp[0];

            $groupStories[] = [
                'id' => 'st_group_' . $relPath . '_' . $mv['id'],
                'userId' => 'group_' . $relPath, // El identificador de usuario es el grupo
                'username' => 'Grupo · ' . $grpName, 
                'avatarUrl' => fix_url($storyThumb),
                'contentUrl' => fix_url($mv['videoUrl']),
                'type' => $isImg ? 'IMAGE' : 'VIDEO',
                'overlayText' => $mv['title'],
                'overlayColor' => '#ffffff',
                'overlayBg' => 'bg-black/50',
                'audioUrl' => NULL,
                'videoId' => $mv['id'],
                'productId' => NULL,
                'duration' => isset($mv['duration']) && $mv['duration'] > 0 ? min($mv['duration'], 15) : 15,
                'createdAt' => $simulatedCreatedAt,
                'expiresAt' => $simulatedCreatedAt + 86400,
                'isFriend' => $isSubscribed,
                'thumbnailUrl' => fix_url($storyThumb),
                'originalVideo' => $processedVideo
            ];
        }
    }

    // 6. Consolidar todas las historias en una lista única organizada por usuarios/grupos
    // Agrupamos en un map temporal por el identificador de usuario (userId)
    $allGroups = [];

    // Agrupar historias reales por userId
    foreach ($realStories as $rs) {
        $uId = $rs['userId'];
        if (!isset($allGroups[$uId])) {
            $allGroups[$uId] = [
                'userId' => $uId,
                'isFriend' => $rs['isFriend'],
                'maxCreatedAt' => $rs['createdAt'],
                'stories' => []
            ];
        }
        $allGroups[$uId]['stories'][] = $rs;
        if ($rs['createdAt'] > $allGroups[$uId]['maxCreatedAt']) {
            $allGroups[$uId]['maxCreatedAt'] = $rs['createdAt'];
        }
    }

    // Agrupar historias de subcarpetas por de grupo userId
    foreach ($groupStories as $gs) {
        $uId = $gs['userId'];
        if (!isset($allGroups[$uId])) {
            $allGroups[$uId] = [
                'userId' => $uId,
                'isFriend' => $gs['isFriend'],
                'maxCreatedAt' => $gs['createdAt'],
                'stories' => []
            ];
        }
        $allGroups[$uId]['stories'][] = $gs;
        if ($gs['createdAt'] > $allGroups[$uId]['maxCreatedAt']) {
            $allGroups[$uId]['maxCreatedAt'] = $gs['createdAt'];
        }
    }

    // Ordenar los bloques de historias coordinadamente por el orden solicitado:
    // 1) Historia del usuario activo ($userId).
    // 2) Historias de usuarios que sigue el usuario ($isFriend === 1 y no es grupo).
    // 3) Historias de grupos (subcarpetas) ($userId empieza con "group_").
    uasort($allGroups, function($a, $b) use ($userId) {
        $aIsSelf = (!empty($userId) && $a['userId'] === $userId) ? 1 : 0;
        $bIsSelf = (!empty($userId) && $b['userId'] === $userId) ? 1 : 0;
        if ($aIsSelf !== $bIsSelf) {
            return $bIsSelf <=> $aIsSelf; // Self goes first
        }
        
        $aIsGroup = (strpos($a['userId'], 'group_') === 0) ? 1 : 0;
        $bIsGroup = (strpos($b['userId'], 'group_') === 0) ? 1 : 0;
        if ($aIsGroup !== $bIsGroup) {
            return $aIsGroup <=> $bIsGroup; // Non-group goes before group
        }
        
        if ($a['isFriend'] !== $b['isFriend']) {
            return $b['isFriend'] <=> $a['isFriend']; // Friends first
        }
        
        return $b['maxCreatedAt'] <=> $a['maxCreatedAt'];
    });

    // Aplanar de retorno a un array plano de historias individuales en el orden sorteado
    $flattenedStories = [];
    foreach ($allGroups as $groupBlock) {
        // Ordenar historias dentro del mismo bloque por createdAt
        $grpStories = $groupBlock['stories'];
        usort($grpStories, function($s1, $s2) {
            return (int)$s1['createdAt'] <=> (int)$s2['createdAt'];
        });
        foreach ($grpStories as $s) {
            $flattenedStories[] = $s;
        }
    }

    // 7. Aplicar paginación (limit y offset) para soporte de scroll infinito
    $totalStories = count($flattenedStories);
    $paginatedStories = array_slice($flattenedStories, $offset, $limit);

    respond(true, $paginatedStories);
}

function story_view($pdo, $input) {
    $storyId = $input['storyId'] ?? '';
    $userId = $input['userId'] ?? '';
    if (!$storyId || !$userId) respond(false, null, "Faltan datos");

    // Verificar si ya vio la historia
    $stmt = $pdo->prepare("SELECT COUNT(*) FROM story_views WHERE storyId = ? AND userId = ?");
    $stmt->execute([$storyId, $userId]);
    if ($stmt->fetchColumn() == 0) {
        $id = 'sv_' . uniqid();
        $stmtIns = $pdo->prepare("INSERT INTO story_views (id, storyId, userId, timestamp) VALUES (?, ?, ?, ?)");
        $stmtIns->execute([$id, $storyId, $userId, time()]);
    }
    respond(true, "Visto registrado");
}

function story_react($pdo, $input) {
    $storyId = $input['storyId'] ?? '';
    $userId = $input['userId'] ?? '';
    $reaction = $input['reaction'] ?? ''; // LIKE, LOVE, CARE, HAHA, WOW, SAD, ANGRY
    if (!$storyId || !$userId || !$reaction) respond(false, null, "Faltan datos");

    // Borrar reacción previa si existe
    $stmtDel = $pdo->prepare("DELETE FROM story_reactions WHERE storyId = ? AND userId = ?");
    $stmtDel->execute([$storyId, $userId]);

    // Insertar nueva reacción
    $id = 'sr_' . uniqid();
    $stmtIns = $pdo->prepare("INSERT INTO story_reactions (id, storyId, userId, reaction, timestamp) VALUES (?, ?, ?, ?, ?)");
    $stmtIns->execute([$id, $storyId, $userId, $reaction, time()]);

    respond(true, "Reacción guardada");
}

function get_story_interactions_data($pdo) {
    $storyId = $_GET['storyId'] ?? '';
    if (!$storyId) respond(false, null, "Falta storyId");

    // Vistas con info de usuario
    $stmtV = $pdo->prepare("SELECT v.*, u.username, u.avatarUrl 
                            FROM story_views v 
                            JOIN users u ON v.userId = u.id 
                            WHERE v.storyId = ? 
                            ORDER BY v.timestamp DESC");
    $stmtV->execute([$storyId]);
    $views = $stmtV->fetchAll();
    foreach ($views as &$v) {
        $v['avatarUrl'] = fix_url($v['avatarUrl']);
    }

    // Reacciones con info de usuario
    $stmtR = $pdo->prepare("SELECT r.*, u.username, u.avatarUrl 
                            FROM story_reactions r 
                            JOIN users u ON r.userId = u.id 
                            WHERE r.storyId = ? 
                            ORDER BY r.timestamp DESC");
    $stmtR->execute([$storyId]);
    $reactions = $stmtR->fetchAll();
    foreach ($reactions as &$r) {
        $r['avatarUrl'] = fix_url($r['avatarUrl']);
    }

    respond(true, [
        'views' => $views,
        'reactions' => $reactions
    ]);
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
            WHERE v.createdAt > ? AND v.is_private = 0 
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