<?php
/**
 * GROUPS - ADVANCED ADMINISTRATIVE SYSTEM (MariaDB 10 / SQLite compatible)
 */

function groups_list($pdo) {
    try {
        $stmtS = $pdo->query("SELECT localLibraryPath, libraryPaths FROM system_settings WHERE id = 1");
        $s = $stmtS->fetch(PDO::FETCH_ASSOC);
        $paths = json_decode($s['libraryPaths'] ?: '[]', true);
        if ($s['localLibraryPath']) $paths[] = $s['localLibraryPath'];
        $roots = array_unique(array_filter(array_map(function($p) { return rtrim(str_replace('\\', '/', $p), '/'); }, $paths)));

        // 1. Scan physical folders on disk
        $diskFolders = [];
        foreach ($roots as $root) {
            if (empty($root) || !is_dir($root)) continue;
            try {
                $dirIter = new DirectoryIterator($root);
                foreach ($dirIter as $fileinfo) {
                    if ($fileinfo->isDir() && !$fileinfo->isDot()) {
                        $dirPath = str_replace('\\', '/', $fileinfo->getRealPath());
                        $folderName = $fileinfo->getFilename();

                        // Count video, audio, image files
                        $videoCount = 0; $audioCount = 0; $imageCount = 0; $fileCount = 0;
                        $hasCover = false;
                        
                        try {
                            $subDi = new RecursiveDirectoryIterator($dirPath, RecursiveDirectoryIterator::SKIP_DOTS);
                            $subIt = new RecursiveIteratorIterator($subDi);
                            foreach ($subIt as $f) {
                                if ($f->isFile()) {
                                    $fileCount++;
                                    $ext = strtolower($f->getExtension());
                                    if (in_array($ext, ['mp4', 'mkv', 'webm', 'avi', 'mov'])) {
                                        $videoCount++;
                                    } elseif (in_array($ext, ['mp3', 'wav', 'aac', 'm4a', 'flac', 'ogg', 'opus'])) {
                                        $audioCount++;
                                    } elseif (in_array($ext, ['jpg', 'jpeg', 'png', 'webp', 'gif'])) {
                                        $imageCount++;
                                    }
                                }
                            }
                        } catch (Exception $e) {}

                        // Check existing physical cover
                        $coverCandidates = ['cover.jpg', 'cover.png', 'folder.jpg', 'folder.png', 'poster.jpg', 'poster.png', 'portada.jpg', 'portada.png'];
                        foreach ($coverCandidates as $candidate) {
                            if (file_exists("$dirPath/$candidate")) {
                                $hasCover = true;
                                break;
                            }
                        }

                        $diskFolders[strtolower($folderName)] = [
                            'name' => $folderName,
                            'physicalPath' => $dirPath,
                            'videoCount' => $videoCount,
                            'audioCount' => $audioCount,
                            'imageCount' => $imageCount,
                            'fileCount' => $fileCount,
                            'hasCover' => $hasCover,
                            'createdAt' => $fileinfo->getMTime()
                        ];
                    }
                }
            } catch (Exception $e) {}
        }

        // 2. Fetch or sync database records
        $stmtM = $pdo->query("SELECT * FROM groups_metadata");
        $metaRows = $stmtM->fetchAll(PDO::FETCH_ASSOC);
        $metaMap = [];
        foreach ($metaRows as $r) {
            $metaMap[strtolower($r['folderPath'])] = $r;
        }

        // Auto-detect and register new ones
        $defaultAdmin = $pdo->query("SELECT id FROM users WHERE role='ADMIN' LIMIT 1")->fetchColumn() ?: 'admin';
        foreach ($diskFolders as $key => $df) {
            if (!isset($metaMap[$key])) {
                // Auto register
                try {
                    $stmtIns = $pdo->prepare("INSERT INTO groups_metadata (folderPath, creatorId, description, coverUrl, isPrivate, isUnified, allowUpload, isSeries, createdAt, autoDetected, scheduled_deletion_time) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)");
                    $stmtIns->execute([
                        $df['name'],
                        $defaultAdmin,
                        'Grupo detectado automáticamente',
                        $df['hasCover'] ? 'api/uploads/thumbnails/default.jpg' : null,
                        0, // isPrivate
                        0, // isUnified
                        1, // allowUpload
                        0, // isSeries
                        time(),
                        1 // autoDetected
                    ]);
                    
                    // Create a log entry
                    groups_add_log($pdo, 'AUTO_DETECT', "Se detectó y registró automáticamente el grupo '" . $df['name'] . "' con " . $df['fileCount'] . " archivos.");
                    
                    // Reload record
                    $stmtGet = $pdo->prepare("SELECT * FROM groups_metadata WHERE folderPath = ?");
                    $stmtGet->execute([$df['name']]);
                    $newMeta = $stmtGet->fetch(PDO::FETCH_ASSOC);
                    if ($newMeta) {
                        $metaMap[$key] = $newMeta;
                    }
                } catch (Exception $ex) {
                    write_log("Error auto-registering group " . $df['name'] . ": " . $ex->getMessage());
                }
            }
        }

        // 3. Prepare final combined list
        $resultList = [];
        $usersList = $pdo->query("SELECT id, username, name FROM users ORDER BY username ASC")->fetchAll(PDO::FETCH_ASSOC);

        // Fetch count of registered videos for each category/folder
        $stmtVidCount = $pdo->query("SELECT category, COUNT(*) as qty FROM videos GROUP BY category");
        $vidCounts = [];
        while ($row = $stmtVidCount->fetch(PDO::FETCH_ASSOC)) {
            $vidCounts[strtolower($row['category'])] = intval($row['qty']);
        }

        foreach ($metaMap as $key => $meta) {
            $df = $diskFolders[$key] ?? null;
            $resultList[] = [
                'folderPath' => $meta['folderPath'],
                'creatorId' => $meta['creatorId'],
                'description' => $meta['description'] ?? '',
                'coverUrl' => $meta['coverUrl'] ? fix_url($meta['coverUrl']) : null,
                'isPrivate' => intval($meta['isPrivate']),
                'isUnified' => intval($meta['isUnified']),
                'allowUpload' => isset($meta['allowUpload']) ? intval($meta['allowUpload']) : 1,
                'isSeries' => isset($meta['isSeries']) ? intval($meta['isSeries']) : 0,
                'createdAt' => intval($meta['createdAt']),
                'autoDetected' => isset($meta['autoDetected']) ? intval($meta['autoDetected']) : 0,
                'scheduled_deletion_time' => $meta['scheduled_deletion_time'] ? intval($meta['scheduled_deletion_time']) : null,
                'physical' => $df ? [
                    'physicalPath' => $df['physicalPath'],
                    'videoCount' => $df['videoCount'],
                    'audioCount' => $df['audioCount'],
                    'imageCount' => $df['imageCount'],
                    'fileCount' => $df['fileCount'],
                    'hasCover' => $df['hasCover']
                ] : null,
                'dbVideoCount' => $vidCounts[$key] ?? 0
            ];
        }

        // Sort by folderPath
        usort($resultList, function($a, $b) {
            return strcasecmp($a['folderPath'], $b['folderPath']);
        });

        respond(true, [
            'groups' => $resultList,
            'users' => $usersList
        ]);
    } catch (Exception $e) {
        respond(false, null, "Error obteniendo lista de grupos: " . $e->getMessage());
    }
}

function groups_save($pdo, $input) {
    try {
        if (!isset($input['groups']) || !is_array($input['groups'])) {
            respond(false, null, "Datos de grupos inválidos para guardar");
        }

        $count = 0;
        foreach ($input['groups'] as $g) {
            $folderPath = $g['folderPath'] ?? '';
            if (empty($folderPath)) continue;

            $creatorId = $g['creatorId'] ?? '';
            $isSeries = intval($g['isSeries'] ?? 0);
            $allowUpload = intval($g['allowUpload'] ?? 1);
            $isPrivate = intval($g['isPrivate'] ?? 0);
            $description = $g['description'] ?? '';
            $newName = $g['newName'] ?? '';

            // 1. Emojis and special characters validation
            // MariaDB 10 handles utf8mb4 easily, but we can double check character encoding is utf-8
            if (!empty($newName)) {
                $newName = trim($newName);
                // Simple validations
                if (strlen($newName) < 1) {
                    respond(false, null, "El nuevo nombre del grupo no puede estar vacío");
                }
            }

            // Determine coverUrl
            $coverUrl = $g['coverUrl'] ?? null;
            if ($coverUrl && strpos($coverUrl, 'api/') === 0) {
                // Keep relative path
            }

            // 2. Perform DB Updates
            if (!empty($newName) && strcasecmp($newName, $folderPath) !== 0) {
                // Rename physical folder if physicalPath exists and is writable
                $stmtM = $pdo->prepare("SELECT * FROM groups_metadata WHERE folderPath = ?");
                $stmtM->execute([$folderPath]);
                $meta = $stmtM->fetch(PDO::FETCH_ASSOC);
                
                // Let's attempt physical renaming if folders exist
                $stmtS = $pdo->query("SELECT localLibraryPath, libraryPaths FROM system_settings WHERE id = 1");
                $s = $stmtS->fetch(PDO::FETCH_ASSOC);
                $paths = json_decode($s['libraryPaths'] ?: '[]', true);
                if ($s['localLibraryPath']) $paths[] = $s['localLibraryPath'];
                $roots = array_unique(array_filter(array_map(function($p) { return rtrim(str_replace('\\', '/', $p), '/'); }, $paths)));

                $renamedDisk = false;
                foreach ($roots as $root) {
                    $oldDir = "$root/$folderPath";
                    $newDir = "$root/$newName";
                    if (is_dir($oldDir) && is_writable($root)) {
                        if (@rename($oldDir, $newDir)) {
                            $renamedDisk = true;
                            break;
                        }
                    }
                }

                // Update category in videos database
                $stmtVid = $pdo->prepare("UPDATE videos SET category = ? WHERE category = ?");
                $stmtVid->execute([$newName, $folderPath]);

                // Update groups_metadata
                $stmtDel = $pdo->prepare("DELETE FROM groups_metadata WHERE folderPath = ?");
                $stmtDel->execute([$folderPath]);

                $stmtIns = $pdo->prepare("INSERT INTO groups_metadata (folderPath, creatorId, description, coverUrl, isPrivate, isUnified, allowUpload, isSeries, createdAt, autoDetected) VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, ?)");
                $stmtIns->execute([
                    $newName,
                    $creatorId,
                    $description,
                    $coverUrl,
                    $isPrivate,
                    $allowUpload,
                    $isSeries,
                    $meta['createdAt'] ?? time(),
                    $meta['autoDetected'] ?? 0
                ]);

                groups_add_log($pdo, 'EDIT_RENAME', "Se renombró el grupo '" . $folderPath . "' a '" . $newName . "'.");
                $folderPath = $newName; // Continue editing under new name
            } else {
                // Normal update
                $stmtUpd = $pdo->prepare("UPDATE groups_metadata SET creatorId = ?, isSeries = ?, allowUpload = ?, isPrivate = ?, description = ? WHERE folderPath = ?");
                $stmtUpd->execute([
                    $creatorId,
                    $isSeries,
                    $allowUpload,
                    $isPrivate,
                    $description,
                    $folderPath
                ]);
                groups_add_log($pdo, 'EDIT_UPDATE', "Se actualizaron parámetros del grupo '" . $folderPath . "'.");
            }
            $count++;
        }

        respond(true, null, "Se guardaron correctamente " . $count . " grupos.");
    } catch (Exception $e) {
        respond(false, null, "Error guardando cambios de grupos: " . $e->getMessage());
    }
}

function groups_upload_cover($pdo, $post, $files) {
    try {
        $folderPath = $post['folderPath'] ?? '';
        if (empty($folderPath)) {
            respond(false, null, "Grupo no especificado");
        }

        if (empty($files['cover']) || $files['cover']['error'] !== UPLOAD_ERR_OK) {
            respond(false, null, "Archivo de portada no provisto o con errores");
        }

        $file = $files['cover'];
        $ext = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));
        if (!in_array($ext, ['jpg', 'jpeg', 'png', 'webp', 'gif'])) {
            respond(false, null, "Formato de imagen inválido (solo JPG, PNG, WEBP, GIF)");
        }

        $destDir = __DIR__ . '/uploads/thumbnails';
        if (!is_dir($destDir)) {
            mkdir($destDir, 0777, true);
        }

        $uniqueName = 'group_cover_' . md5($folderPath . time()) . '.' . $ext;
        $destPath = "$destDir/$uniqueName";

        if (move_uploaded_file($file['tmp_name'], $destPath)) {
            $coverUrl = "api/uploads/thumbnails/$uniqueName";
            
            // Update DB
            $stmt = $pdo->prepare("UPDATE groups_metadata SET coverUrl = ? WHERE folderPath = ?");
            $stmt->execute([$coverUrl, $folderPath]);

            groups_add_log($pdo, 'UPLOAD_COVER', "Se subió una nueva portada para el grupo '" . $folderPath . "'.");
            respond(true, ['coverUrl' => fix_url($coverUrl)], "Portada subida con éxito");
        } else {
            respond(false, null, "Fallo al guardar el archivo en el servidor");
        }
    } catch (Exception $e) {
        respond(false, null, "Error subiendo portada: " . $e->getMessage());
    }
}

function groups_cleanup_preview($pdo) {
    try {
        $stmtSettings = $pdo->query("SELECT cleanNormalGroupsDays, cleanSeriesGroupsDays FROM system_settings WHERE id = 1");
        $settings = $stmtSettings->fetch(PDO::FETCH_ASSOC);
        $normalDays = isset($settings['cleanNormalGroupsDays']) ? intval($settings['cleanNormalGroupsDays']) : 30;
        $seriesDays = isset($settings['cleanSeriesGroupsDays']) ? intval($settings['cleanSeriesGroupsDays']) : 90;

        $now = time();
        $normalLimitTime = $now - ($normalDays * 86400);
        $seriesLimitTime = $now - ($seriesDays * 86400);

        // 1. Preview Normal Group Videos without interaction
        // Interaction means likes = 0, views = 0, shares = 0 and 0 comments
        $stmtV = $pdo->prepare("
            SELECT v.id, v.title, v.category, v.createdAt, v.creatorId, v.scheduled_deletion_time, u.username as creatorName
            FROM videos v
            LEFT JOIN users u ON v.creatorId = u.id
            JOIN groups_metadata gm ON LOWER(v.category) = LOWER(gm.folderPath)
            WHERE gm.isSeries = 0
              AND v.likes = 0 
              AND v.views = 0 
              AND v.shares = 0
              AND v.createdAt < ?
              AND (SELECT COUNT(*) FROM comments c WHERE c.videoId = v.id) = 0
        ");
        $stmtV->execute([$normalLimitTime]);
        $inactiveVideos = $stmtV->fetchAll(PDO::FETCH_ASSOC);

        // 2. Preview Series Groups without activity
        // Activity means ANY video inside the series having views > 0 or likes > 0 or shares > 0 or comments > 0
        // Or if the group has no videos, it is inactive!
        $stmtS = $pdo->query("SELECT * FROM groups_metadata WHERE isSeries = 1");
        $seriesGroups = $stmtS->fetchAll(PDO::FETCH_ASSOC);

        $inactiveSeries = [];
        foreach ($seriesGroups as $sg) {
            $folder = $sg['folderPath'];
            // Fetch videos in this series
            $stmtSvid = $pdo->prepare("SELECT id, title, views, likes, shares, createdAt FROM videos WHERE LOWER(category) = LOWER(?)");
            $stmtSvid->execute([$folder]);
            $svids = $stmtSvid->fetchAll(PDO::FETCH_ASSOC);

            $hasActiveVideo = false;
            $lastVideoTime = $sg['createdAt']; // Fallback to group creation time

            if (!empty($svids)) {
                foreach ($svids as $sv) {
                    if ($sv['createdAt'] > $lastVideoTime) {
                        $lastVideoTime = $sv['createdAt'];
                    }
                    // Fetch comments count
                    $stmtC = $pdo->prepare("SELECT COUNT(*) FROM comments WHERE videoId = ?");
                    $stmtC->execute([$sv['id']]);
                    $commentCount = intval($stmtC->fetchColumn());

                    if ($sv['views'] > 0 || $sv['likes'] > 0 || $sv['shares'] > 0 || $commentCount > 0) {
                        $hasActiveVideo = true;
                        break;
                    }
                }
            }

            // If it has no active videos and the last video/group is older than seriesDays
            if (!$hasActiveVideo && $lastVideoTime < $seriesLimitTime) {
                // Fetch group admin username
                $adminUser = $pdo->query("SELECT username FROM users WHERE id = '" . $sg['creatorId'] . "'")->fetchColumn() ?: 'admin';
                $inactiveSeries[] = [
                    'folderPath' => $sg['folderPath'],
                    'creatorId' => $sg['creatorId'],
                    'creatorName' => $adminUser,
                    'createdAt' => intval($sg['createdAt']),
                    'scheduled_deletion_time' => $sg['scheduled_deletion_time'] ? intval($sg['scheduled_deletion_time']) : null,
                    'videoCount' => count($svids),
                    'lastActivity' => intval($lastVideoTime)
                ];
            }
        }

        respond(true, [
            'inactiveVideos' => $inactiveVideos,
            'inactiveSeries' => $inactiveSeries,
            'config' => [
                'normalDays' => $normalDays,
                'seriesDays' => $seriesDays
            ]
        ]);
    } catch (Exception $e) {
        respond(false, null, "Error en preview de limpieza: " . $e->getMessage());
    }
}

function groups_cleanup_run($pdo) {
    try {
        $stmtSettings = $pdo->query("SELECT cleanNormalGroupsDays, cleanSeriesGroupsDays FROM system_settings WHERE id = 1");
        $settings = $stmtSettings->fetch(PDO::FETCH_ASSOC);
        $normalDays = isset($settings['cleanNormalGroupsDays']) ? intval($settings['cleanNormalGroupsDays']) : 30;
        $seriesDays = isset($settings['cleanSeriesGroupsDays']) ? intval($settings['cleanSeriesGroupsDays']) : 90;

        $now = time();
        $normalLimitTime = $now - ($normalDays * 86400);
        $seriesLimitTime = $now - ($seriesDays * 86400);

        $notificationsSent = 0;
        $videosDeleted = 0;
        $seriesDeleted = 0;

        // 1. CLEANUP NORMAL GROUP VIDEOS
        // We select ALL normal videos that have 0 interaction and are older than normalDays
        $stmtV = $pdo->prepare("
            SELECT v.id, v.title, v.category, v.createdAt, v.creatorId, v.scheduled_deletion_time
            FROM videos v
            JOIN groups_metadata gm ON LOWER(v.category) = LOWER(gm.folderPath)
            WHERE gm.isSeries = 0
              AND v.likes = 0 
              AND v.views = 0 
              AND v.shares = 0
              AND v.createdAt < ?
              AND (SELECT COUNT(*) FROM comments c WHERE c.videoId = v.id) = 0
        ");
        $stmtV->execute([$normalLimitTime]);
        $inactiveVideos = $stmtV->fetchAll(PDO::FETCH_ASSOC);

        // Find all currently scheduled videos that actually HAVE interaction now -> reset schedule!
        $stmtScheduled = $pdo->query("SELECT id, views, likes, shares FROM videos WHERE scheduled_deletion_time IS NOT NULL");
        while ($sv = $stmtScheduled->fetch(PDO::FETCH_ASSOC)) {
            $stmtC = $pdo->prepare("SELECT COUNT(*) FROM comments WHERE videoId = ?");
            $stmtC->execute([$sv['id']]);
            $commentCount = intval($stmtC->fetchColumn());

            if ($sv['views'] > 0 || $sv['likes'] > 0 || $sv['shares'] > 0 || $commentCount > 0) {
                // Cancel scheduled deletion!
                $pdo->prepare("UPDATE videos SET scheduled_deletion_time = NULL WHERE id = ?")->execute([$sv['id']]);
                groups_add_log($pdo, 'CLEANUP_PROTECT', "Se canceló la eliminación de la publicación '" . $sv['id'] . "' al recibir interacción.");
            }
        }

        // Process inactive normal videos
        require_once __DIR__ . '/functions_interactions.php'; // For notifications
        foreach ($inactiveVideos as $vid) {
            if (empty($vid['scheduled_deletion_time'])) {
                // Warn creator 24h before
                $deletionTime = $now + 86400; // 24 hours
                $pdo->prepare("UPDATE videos SET scheduled_deletion_time = ? WHERE id = ?")->execute([$deletionTime, $vid['id']]);
                
                $msg = "Tu publicación '" . $vid['title'] . "' en el grupo '" . $vid['category'] . "' será eliminada en 24h si no recibe interacción.";
                send_direct_notification($pdo, $vid['creatorId'], 'SYSTEM', $msg, '/profile');
                
                groups_add_log($pdo, 'CLEANUP_WARN', "Notificación enviada a " . $vid['creatorId'] . ": '" . $vid['title'] . "' programada para eliminación.");
                $notificationsSent++;
            } else {
                // If already scheduled and 24h passed
                if ($now >= intval($vid['scheduled_deletion_time'])) {
                    // Physical file cleanup
                    $stmtInfo = $pdo->prepare("SELECT videoUrl, thumbnailUrl FROM videos WHERE id = ?");
                    $stmtInfo->execute([$vid['id']]);
                    $vFile = $stmtInfo->fetch(PDO::FETCH_ASSOC);
                    
                    if ($vFile) {
                        // Delete video file
                        $vPath = resolve_video_path($vFile['videoUrl']);
                        if ($vPath && file_exists($vPath)) {
                            @unlink($vPath);
                        }
                        // Protection of cover: we NEVER delete the group's coverUrl. Only individual video thumbnails
                        $tPath = resolve_video_path($vFile['thumbnailUrl']);
                        if ($tPath && file_exists($tPath) && strpos($tPath, 'group_cover_') === false) {
                            @unlink($tPath);
                        }
                    }

                    // Delete from videos database
                    $pdo->prepare("DELETE FROM videos WHERE id = ?")->execute([$vid['id']]);
                    $pdo->prepare("DELETE FROM comments WHERE videoId = ?")->execute([$vid['id']]);
                    $pdo->prepare("DELETE FROM likes_dislikes WHERE videoId = ?")->execute([$vid['id']]);

                    groups_add_log($pdo, 'CLEANUP_DELETE_VIDEO', "Se eliminó automáticamente la publicación '" . $vid['title'] . "' del grupo '" . $vid['category'] . "' por falta de interacción.");
                    $videosDeleted++;
                }
            }
        }

        // 2. CLEANUP INACTIVE SERIES GROUPS
        $stmtS = $pdo->query("SELECT * FROM groups_metadata WHERE isSeries = 1");
        $seriesGroups = $stmtS->fetchAll(PDO::FETCH_ASSOC);

        // Find currently scheduled series that have received activity -> reset schedule!
        foreach ($seriesGroups as $sg) {
            if ($sg['scheduled_deletion_time']) {
                $folder = $sg['folderPath'];
                $stmtSvid = $pdo->prepare("SELECT id, views, likes, shares, createdAt FROM videos WHERE LOWER(category) = LOWER(?)");
                $stmtSvid->execute([$folder]);
                $svids = $stmtSvid->fetchAll(PDO::FETCH_ASSOC);

                $hasActiveVideo = false;
                $lastVideoTime = $sg['createdAt'];
                if (!empty($svids)) {
                    foreach ($svids as $sv) {
                        if ($sv['createdAt'] > $lastVideoTime) {
                            $lastVideoTime = $sv['createdAt'];
                        }
                        $stmtC = $pdo->prepare("SELECT COUNT(*) FROM comments WHERE videoId = ?");
                        $stmtC->execute([$sv['id']]);
                        $commentCount = intval($stmtC->fetchColumn());

                        if ($sv['views'] > 0 || $sv['likes'] > 0 || $sv['shares'] > 0 || $commentCount > 0) {
                            $hasActiveVideo = true;
                            break;
                        }
                    }
                }

                // If active or last activity is recent -> cancel!
                if ($hasActiveVideo || $lastVideoTime >= $seriesLimitTime) {
                    $pdo->prepare("UPDATE groups_metadata SET scheduled_deletion_time = NULL WHERE folderPath = ?")->execute([$folder]);
                    groups_add_log($pdo, 'CLEANUP_PROTECT_SERIES', "Se canceló la eliminación del grupo serie '" . $folder . "' al registrar actividad.");
                }
            }
        }

        // Check for inactive series to warn or delete
        foreach ($seriesGroups as $sg) {
            $folder = $sg['folderPath'];
            $stmtSvid = $pdo->prepare("SELECT id, views, likes, shares, createdAt FROM videos WHERE LOWER(category) = LOWER(?)");
            $stmtSvid->execute([$folder]);
            $svids = $stmtSvid->fetchAll(PDO::FETCH_ASSOC);

            $hasActiveVideo = false;
            $lastVideoTime = $sg['createdAt'];
            if (!empty($svids)) {
                foreach ($svids as $sv) {
                    if ($sv['createdAt'] > $lastVideoTime) {
                        $lastVideoTime = $sv['createdAt'];
                    }
                    $stmtC = $pdo->prepare("SELECT COUNT(*) FROM comments WHERE videoId = ?");
                    $stmtC->execute([$sv['id']]);
                    $commentCount = intval($stmtC->fetchColumn());

                    if ($sv['views'] > 0 || $sv['likes'] > 0 || $sv['shares'] > 0 || $commentCount > 0) {
                        $hasActiveVideo = true;
                        break;
                    }
                }
            }

            if (!$hasActiveVideo && $lastVideoTime < $seriesLimitTime) {
                if (empty($sg['scheduled_deletion_time'])) {
                    // Schedule series group deletion in 24 hours
                    $deletionTime = $now + 86400;
                    $pdo->prepare("UPDATE groups_metadata SET scheduled_deletion_time = ? WHERE folderPath = ?")->execute([$deletionTime, $folder]);
                    
                    $msg = "Tu grupo serie '" . $folder . "' será eliminado en 24h por falta de actividad.";
                    send_direct_notification($pdo, $sg['creatorId'], 'SYSTEM', $msg, '/profile');
                    
                    groups_add_log($pdo, 'CLEANUP_WARN_SERIES', "Notificación enviada al administrador " . $sg['creatorId'] . ": Grupo serie '" . $folder . "' programado para eliminación.");
                    $notificationsSent++;
                } else {
                    if ($now >= intval($sg['scheduled_deletion_time'])) {
                        // DELETE ENTIRE GROUP
                        // 1. Delete all videos records and physical files
                        foreach ($svids as $sv) {
                            $stmtInfo = $pdo->prepare("SELECT videoUrl, thumbnailUrl FROM videos WHERE id = ?");
                            $stmtInfo->execute([$sv['id']]);
                            $vFile = $stmtInfo->fetch(PDO::FETCH_ASSOC);
                            
                            if ($vFile) {
                                $vPath = resolve_video_path($vFile['videoUrl']);
                                if ($vPath && file_exists($vPath)) {
                                    @unlink($vPath);
                                }
                                $tPath = resolve_video_path($vFile['thumbnailUrl']);
                                if ($tPath && file_exists($tPath)) {
                                    @unlink($tPath);
                                }
                            }
                            $pdo->prepare("DELETE FROM videos WHERE id = ?")->execute([$sv['id']]);
                            $pdo->prepare("DELETE FROM comments WHERE videoId = ?")->execute([$sv['id']]);
                            $pdo->prepare("DELETE FROM likes_dislikes WHERE videoId = ?")->execute([$sv['id']]);
                        }

                        // 2. Delete the group cover file (allowed during entire group deletion!)
                        if (!empty($sg['coverUrl'])) {
                            $cPath = resolve_video_path($sg['coverUrl']);
                            if ($cPath && file_exists($cPath)) {
                                @unlink($cPath);
                            }
                        }

                        // 3. Delete physical group folder
                        $stmtS = $pdo->query("SELECT localLibraryPath, libraryPaths FROM system_settings WHERE id = 1");
                        $s = $stmtS->fetch(PDO::FETCH_ASSOC);
                        $paths = json_decode($s['libraryPaths'] ?: '[]', true);
                        if ($s['localLibraryPath']) $paths[] = $s['localLibraryPath'];
                        $roots = array_unique(array_filter(array_map(function($p) { return rtrim(str_replace('\\', '/', $p), '/'); }, $paths)));

                        foreach ($roots as $root) {
                            $groupDir = "$root/$folder";
                            if (is_dir($groupDir)) {
                                groups_delete_folder_recursive($groupDir);
                                break;
                            }
                        }

                        // 4. Delete group metadata record
                        $pdo->prepare("DELETE FROM groups_metadata WHERE folderPath = ?")->execute([$folder]);

                        groups_add_log($pdo, 'CLEANUP_DELETE_SERIES', "Se eliminó por completo el grupo serie '" . $folder . "' y todo su contenido por inactividad.");
                        $seriesDeleted++;
                    }
                }
            }
        }

        respond(true, [
            'notificationsSent' => $notificationsSent,
            'videosDeleted' => $videosDeleted,
            'seriesDeleted' => $seriesDeleted
        ], "Limpieza ejecutada: $videosDeleted publicaciones eliminadas, $seriesDeleted series eliminadas, $notificationsSent advertencias enviadas.");
    } catch (Exception $e) {
        respond(false, null, "Error ejecutando limpieza: " . $e->getMessage());
    }
}

function groups_combine_run($pdo) {
    try {
        $stmtS = $pdo->query("SELECT localLibraryPath, libraryPaths FROM system_settings WHERE id = 1");
        $s = $stmtS->fetch(PDO::FETCH_ASSOC);
        $paths = json_decode($s['libraryPaths'] ?: '[]', true);
        if ($s['localLibraryPath']) $paths[] = $s['localLibraryPath'];
        $roots = array_unique(array_filter(array_map(function($p) { return rtrim(str_replace('\\', '/', $p), '/'); }, $paths)));

        $defaultAdmin = $pdo->query("SELECT id FROM users WHERE role='ADMIN' LIMIT 1")->fetchColumn() ?: 'admin';
        $combinedCount = 0;

        foreach ($roots as $root) {
            if (empty($root) || !is_dir($root)) continue;
            
            $di = new DirectoryIterator($root);
            foreach ($di as $fileinfo) {
                if ($fileinfo->isDir() && !$fileinfo->isDot()) {
                    $dirPath = str_replace('\\', '/', $fileinfo->getRealPath());
                    $folderName = $fileinfo->getFilename();

                    // Find files in this folder directly (non-recursive for strict detection!)
                    $videoFiles = [];
                    $imageFiles = [];

                    $subFiles = array_diff(scandir($dirPath), ['.', '..']);
                    foreach ($subFiles as $f) {
                        $fPath = "$dirPath/$f";
                        if (is_file($fPath)) {
                            $ext = strtolower(pathinfo($f, PATHINFO_EXTENSION));
                            if (in_array($ext, ['mp4', 'mkv', 'webm', 'avi', 'mov'])) {
                                $videoFiles[] = $f;
                            } elseif (in_array($ext, ['jpg', 'jpeg', 'png', 'webp'])) {
                                $imageFiles[] = $f;
                            }
                        }
                    }

                    // Strict condition: Exactly 1 video and at least 1 image (e.g. cover/poster)
                    if (count($videoFiles) === 1 && count($imageFiles) >= 1) {
                        $videoName = $videoFiles[0];
                        $imageName = $imageFiles[0]; // Take the first image as cover
                        
                        $videoRelPath = "$folderName/$videoName"; // relative to library root
                        
                        // Check if this video is already in database
                        $stmtCheck = $pdo->prepare("SELECT COUNT(*) FROM videos WHERE LOWER(category) = LOWER(?) AND (videoUrl LIKE ? OR title = ?)");
                        $stmtCheck->execute([$folderName, "%$videoName%", pathinfo($videoName, PATHINFO_FILENAME)]);
                        $alreadyRegistered = intval($stmtCheck->fetchColumn()) > 0;

                        if (!$alreadyRegistered) {
                            // Copy image to web-accessible uploads/thumbnails folder
                            $destDir = __DIR__ . '/uploads/thumbnails';
                            if (!is_dir($destDir)) {
                                mkdir($destDir, 0777, true);
                            }
                            
                            $imgExt = pathinfo($imageName, PATHINFO_EXTENSION);
                            $uniqueImgName = 'combined_cover_' . md5($videoRelPath . time()) . '.' . $imgExt;
                            $destImgPath = "$destDir/$uniqueImgName";
                            
                            $thumbnailUrl = 'api/uploads/thumbnails/default.jpg';
                            if (@copy("$dirPath/$imageName", $destImgPath)) {
                                $thumbnailUrl = "api/uploads/thumbnails/$uniqueImgName";
                            }

                            // Register publication in videos table
                            $vId = 'comb_' . uniqid();
                            $title = pathinfo($videoName, PATHINFO_FILENAME);
                            
                            // Remove any file tags/ext for cleaner title
                            $title = str_replace(['_', '-'], ' ', $title);
                            $title = ucwords(trim($title));

                            // Save relative URL
                            $videoUrl = "$root/$videoRelPath";
                            
                            $stmtIns = $pdo->prepare("INSERT INTO videos (id, title, description, videoUrl, thumbnailUrl, creatorId, createdAt, category, is_audio, duration, price, is_private, isLocal, transcode_status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, 0, 0, 0, 1, 'NONE')");
                            $stmtIns->execute([
                                $vId,
                                $title,
                                "Publicación combinada automática (Video + Portada detectados en disco)",
                                $videoUrl,
                                $thumbnailUrl,
                                $defaultAdmin,
                                time(),
                                $folderName
                            ]);

                            groups_add_log($pdo, 'COMBINE_PUBLISH', "Publicación combinada automática creada en '" . $folderName . "': '" . $title . "' usando miniatura '" . $imageName . "'.");
                            $combinedCount++;
                        }
                    }
                }
            }
        }

        respond(true, ['combinedCount' => $combinedCount], "Se crearon automáticamente $combinedCount publicaciones combinadas.");
    } catch (Exception $e) {
        respond(false, null, "Error ejecutando publicación combinada: " . $e->getMessage());
    }
}

function groups_get_logs($pdo) {
    try {
        $stmt = $pdo->query("SELECT * FROM group_logs ORDER BY timestamp DESC LIMIT 100");
        $logs = $stmt->fetchAll(PDO::FETCH_ASSOC);
        respond(true, $logs);
    } catch (Exception $e) {
        respond(false, null, "Error obteniendo logs de grupos: " . $e->getMessage());
    }
}

// Helpers
function groups_add_log($pdo, $action, $message) {
    try {
        $stmt = $pdo->prepare("INSERT INTO group_logs (id, action, message, timestamp) VALUES (?, ?, ?, ?)");
        $stmt->execute([
            uniqid('glog_'),
            $action,
            $message,
            time()
        ]);
        
        // Also write to general log
        write_log("Groups: [$action] $message");
    } catch (Exception $e) {
        write_log("Failed to insert group log: " . $e->getMessage(), 'ERROR');
    }
}

function groups_delete_folder_recursive($dir) {
    if (!is_dir($dir)) return false;
    $files = array_diff(scandir($dir), ['.', '..']);
    foreach ($files as $file) {
        $path = "$dir/$file";
        (is_dir($path)) ? groups_delete_folder_recursive($path) : @unlink($path);
    }
    return @rmdir($dir);
}

function resolve_video_path($url) {
    if (empty($url)) return null;
    $url = str_replace('api/', '', $url);
    $url = ltrim($url, '/');
    
    // Check if it's absolute
    if (file_exists($url)) return $url;
    if (file_exists(__DIR__ . '/' . $url)) return __DIR__ . '/' . $url;
    return null;
}
