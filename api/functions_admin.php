<?php
/**
 * ADMIN - CORE FUNCTIONS V24.0 (Smart Cleaner & Orphan Sync)
 */

function admin_get_settings($pdo) {
    $stmt = $pdo->query("SELECT * FROM system_settings WHERE id = 1");
    $res = $stmt->fetch();
    if ($res) {
        $res['categories'] = json_decode($res['categories'] ?: '[]', true);
        $res['categoryPrices'] = json_decode($res['categoryPrices'] ?: '[]', true);
        $res['customCategories'] = json_decode($res['customCategories'] ?: '[]', true);
        $res['libraryPaths'] = json_decode($res['libraryPaths'] ?: '[]', true);
        $res['ftpSettings'] = json_decode($res['ftpSettings'] ?: '[]', true);
        $res['vipPlans'] = json_decode($res['vipPlans'] ?: '[]', true);
        $res['paymentMethods'] = json_decode($res['paymentMethods'] ?: '[]', true);
        $res['batteryConfig'] = json_decode($res['batteryConfig'] ?? 'null', true);
        $res['batteryHistory'] = json_decode($res['batteryHistory'] ?? '[]', true);
    } else {
        $res = [
            'categories' => [],
            'categoryPrices' => [],
            'customCategories' => [],
            'libraryPaths' => [],
            'ftpSettings' => [],
            'vipPlans' => [],
            'paymentMethods' => [],
            'batteryConfig' => null,
            'batteryHistory' => []
        ];
    }
    respond(true, $res);
}

function admin_update_settings($pdo, $input) {
    $allowed = [
        'downloadStartTime', 'downloadEndTime', 'isQueuePaused', 'batchSize', 'maxDuration', 'maxResolution',
        'ytDlpPath', 'ffmpegPath', 'geminiKey', 'pexelsKey', 'pixabayKey', 'tropipayClientId', 'tropipayClientSecret',
        'currencyConversion', 'enableYoutube', 'autoTranscode', 'transcodePreset', 'proxyUrl', 'categories',
        'categoryPrices', 'customCategories', 'libraryPaths', 'ftpSettings', 'paymentInstructions',
        'categoryHierarchy', 'autoGroupFolders', 'localLibraryPath', 'videoCommission', 'marketCommission',
        'transferFee', 'vipPlans', 'paymentMethods', 'enableDebugLog', 'vapidPublicKey', 'vapidPrivateKey',
        'defaultVideoThumb', 'defaultAudioThumb', 'defaultAvatar', 'latestApkVersion', 'batteryConfig', 'batteryHistory',
        'shortsPath'
    ];
    
    $fields = []; $params = [];
    foreach ($input as $k => $v) {
        if (in_array($k, $allowed)) {
            $fields[] = "$k = ?";
            $params[] = is_array($v) ? json_encode($v) : $v;
        }
    }
    
    if (empty($fields)) respond(false, null, "No hay campos válidos para actualizar");
    
    $pdo->prepare("UPDATE system_settings SET " . implode(', ', $fields) . " WHERE id = 1")->execute($params);
    respond(true);
}

function admin_bulk_edit_folder($pdo, $input) {
    $path = $input['folderPath'];
    $price = floatval($input['price']);
    $sortOrder = $input['sortOrder'] ?? 'LATEST';
    
    $pdo->beginTransaction();
    try {
        // 1. Actualizar videos que COMIENCEN con esa ruta (recursivo)
        $stmt = $pdo->prepare("UPDATE videos SET price = ? WHERE videoUrl LIKE ?");
        $stmt->execute([$price, '%' . $path . '%']);
        
        // 2. Registrar/Actualizar en la tabla de categorías (para persistencia de carpetas)
        $folderName = basename($path);
        $stmtS = $pdo->query("SELECT categories FROM system_settings WHERE id = 1");
        $cats = json_decode($stmtS->fetchColumn() ?: '[]', true);
        
        $found = false;
        foreach ($cats as &$c) {
            if (strcasecmp($c['name'], $folderName) === 0) {
                $c['price'] = $price;
                $c['sortOrder'] = $sortOrder;
                $found = true;
                break;
            }
        }
        
        if (!$found) {
            $cats[] = ['name' => $folderName, 'price' => $price, 'sortOrder' => $sortOrder];
        }
        
        // 3. Aplicar recursivamente a subcarpetas conocidas en categories
        // Buscamos videos en esta ruta para extraer sus subcarpetas
        $stmtSub = $pdo->prepare("SELECT DISTINCT category FROM videos WHERE videoUrl LIKE ? AND category != ?");
        $stmtSub->execute(['%' . $path . '%', $folderName]);
        $subCategories = $stmtSub->fetchAll(PDO::FETCH_COLUMN);
        
        foreach ($subCategories as $subCat) {
            $subFound = false;
            foreach ($cats as &$c) {
                if (strcasecmp($c['name'], $subCat) === 0) {
                    $c['price'] = $price;
                    $c['sortOrder'] = $sortOrder;
                    $subFound = true;
                    break;
                }
            }
            if (!$subFound) {
                $cats[] = ['name' => $subCat, 'price' => $price, 'sortOrder' => $sortOrder];
            }
        }
        
        $pdo->prepare("UPDATE system_settings SET categories = ? WHERE id = 1")->execute([json_encode($cats)]);
        
        $pdo->commit();
        respond(true);
    } catch (Exception $e) {
        $pdo->rollBack();
        respond(false, null, $e->getMessage());
    }
}

function admin_update_category_price($pdo, $input) {
    $cat = $input['category'];
    $price = floatval($input['price']);
    $pdo->prepare("UPDATE videos SET price = ? WHERE category = ?")->execute([$price, $cat]);
    respond(true);
}

function admin_add_balance($pdo, $input) {
    $uid = $input['userId'];
    $amt = floatval($input['amount']);
    $reason = $input['reason'] ?? 'Ajuste administrativo';
    
    $pdo->beginTransaction();
    try {
        $pdo->prepare("UPDATE users SET balance = balance + ? WHERE id = ?")->execute([$amt, $uid]);
        
        // Registro de auditoría
        $pdo->prepare("INSERT INTO transactions (id, buyerId, amount, type, timestamp, videoTitle, isExternal) VALUES (?, ?, ?, 'ADMIN_ADJUSTMENT', ?, ?, 0)")
            ->execute([uniqid('tx_adj_'), $uid, $amt, time(), $reason]);
            
        $pdo->commit();
        respond(true);
    } catch (Exception $e) {
        $pdo->rollBack();
        respond(false, null, $e->getMessage());
    }
}

function admin_get_finance_requests($pdo) {
    $bal = $pdo->query("SELECT br.*, u.username FROM balance_requests br JOIN users u ON br.userId = u.id WHERE br.status = 'PENDING' ORDER BY br.createdAt DESC")->fetchAll();
    $vip = $pdo->query("SELECT vr.*, u.username FROM vip_requests vr JOIN users u ON vr.userId = u.id WHERE vr.status = 'PENDING' ORDER BY vr.createdAt DESC")->fetchAll();
    respond(true, ['balance' => $bal, 'vip' => $vip]);
}

function admin_handle_balance_request($pdo, $input) {
    $rid = $input['reqId']; 
    $status = $input['status']; 
    $reason = $input['reason'] ?? null;
    
    $pdo->beginTransaction();
    try {
        $stmt = $pdo->prepare("SELECT userId, amount FROM balance_requests WHERE id = ?"); 
        $stmt->execute([$rid]); 
        $r = $stmt->fetch();
        
        if ($status === 'APPROVED') {
            $pdo->prepare("UPDATE users SET balance = balance + ? WHERE id = ?")->execute([$r['amount'], $r['userId']]);
            
            // Registro de transacción
            $pdo->prepare("INSERT INTO transactions (id, buyerId, amount, type, timestamp, videoTitle, isExternal) VALUES (?, ?, ?, 'DEPOSIT', ?, 'Recarga de Saldo (Aprobada)', 1)")
                ->execute([uniqid('tx_dep_'), $r['userId'], $r['amount'], time()]);
        }
        
        $pdo->prepare("UPDATE balance_requests SET status = ?, rejectionReason = ? WHERE id = ?")->execute([$status, $reason, $rid]);
        
        if ($status === 'REJECTED' && $reason) {
            require_once 'functions_interactions.php';
            send_direct_notification($pdo, $r['userId'], 'SYSTEM', "Tu solicitud de saldo ha sido rechazada. Motivo: $reason", "/profile");
        }
        
        $pdo->commit(); 
        respond(true);
    } catch (Exception $e) {
        $pdo->rollBack();
        respond(false, null, $e->getMessage());
    }
}

function admin_handle_vip_request($pdo, $input) {
    $rid = $input['reqId']; 
    $status = $input['status']; 
    $reason = $input['reason'] ?? null;
    
    $pdo->beginTransaction();
    try {
        $stmt = $pdo->prepare("SELECT * FROM vip_requests WHERE id = ?"); $stmt->execute([$rid]); $r = $stmt->fetch();
        if ($status === 'APPROVED') {
            $plan = json_decode($r['planSnapshot'], true);
            if ($plan['type'] === 'BALANCE') {
                $priceBase = floatval($plan['price']);
                $bonusPercent = floatval($plan['bonusPercent'] ?? 0);
                $bonusAmount = $priceBase * ($bonusPercent / 100);
                $totalCredit = $priceBase + $bonusAmount;
                
                $pdo->prepare("UPDATE users SET balance = balance + ? WHERE id = ?")->execute([$totalCredit, $r['userId']]);
                
                // Registro de transacciones para auditoría
                $pdo->prepare("INSERT INTO transactions (id, buyerId, amount, type, timestamp, videoTitle, isExternal) VALUES (?, ?, ?, 'DEPOSIT', ?, ?, 1)")
                    ->execute([uniqid('tx_cash_'), $r['userId'], $priceBase, time(), $plan['name']]);
                if ($bonusAmount > 0) {
                    $pdo->prepare("INSERT INTO transactions (id, buyerId, amount, type, timestamp, videoTitle, isExternal) VALUES (?, ?, ?, 'DEPOSIT', ?, ?, 0)")
                        ->execute([uniqid('tx_bonus_'), $r['userId'], $bonusAmount, time(), "Bono: " . $plan['name']]);
                }
            } else {
                $days = intval($plan['durationDays']);
                $seconds = $days * 86400;
                $now = time();
                $stmtU = $pdo->prepare("SELECT vipExpiry FROM users WHERE id = ?"); $stmtU->execute([$r['userId']]); $curr = intval($stmtU->fetchColumn());
                $newStart = ($curr > $now) ? $curr : $now;
                $pdo->prepare("UPDATE users SET vipExpiry = ? WHERE id = ?")->execute([$newStart + $seconds, $r['userId']]);
                
                $pdo->prepare("INSERT INTO transactions (id, buyerId, amount, timestamp, type, videoTitle, isExternal) VALUES (?, ?, ?, ?, 'VIP', ?, 1)")
                    ->execute([uniqid('tx_vip_'), $r['userId'], $plan['price'], time(), $plan['name']]);
            }
            
            require_once 'functions_interactions.php';
            send_direct_notification($pdo, $r['userId'], 'SYSTEM', "Tu solicitud de '{$plan['name']}' ha sido aprobada.", "/profile");
        } else if ($status === 'REJECTED') {
            $pdo->prepare("UPDATE vip_requests SET status = ?, rejectionReason = ? WHERE id = ?")->execute([$status, $reason, $rid]);
            if ($reason) {
                require_once 'functions_interactions.php';
                send_direct_notification($pdo, $r['userId'], 'SYSTEM', "Tu solicitud VIP ha sido rechazada. Motivo: $reason", "/profile");
            }
        }
        
        if ($status !== 'REJECTED') {
            $pdo->prepare("UPDATE vip_requests SET status = ? WHERE id = ?")->execute([$status, $rid]);
        }
        
        $pdo->commit(); respond(true);
    } catch (Exception $e) { $pdo->rollBack(); respond(false, null, $e->getMessage()); }
}

function admin_get_global_transactions($pdo) {
    $stmt = $pdo->query("SELECT t.*, b.username as buyerName, c.username as creatorName FROM transactions t LEFT JOIN users b ON t.buyerId = b.id LEFT JOIN users c ON t.creatorId = c.id ORDER BY t.timestamp DESC LIMIT 200");
    respond(true, $stmt->fetchAll());
}

function admin_repair_broken_videos($pdo) {
    set_time_limit(3600); // 1 hora
    ignore_user_abort(true);
    
    $bins = get_ffmpeg_binaries($pdo);
    $ffprobe = $bins['ffprobe'];
    
    // 1. Identificar videos físicamente eliminados para limpiar la BD
    $stmt = $pdo->query("SELECT id, videoUrl FROM videos WHERE isLocal = 1");
    $allVideos = $stmt->fetchAll();
    $deletedCount = 0;
    
    foreach ($allVideos as $v) {
        $path = resolve_video_path($v['videoUrl']);
        if (!$path || !file_exists($path)) {
            $pdo->prepare("DELETE FROM videos WHERE id = ?")->execute([$v['id']]);
            $deletedCount++;
        }
    }

    // 2. Identificar videos sin miniatura física o con errores de detección
    // Obtenemos thumbnailUrl directamente en la consulta principal para mayor eficiencia
    $stmt = $pdo->query("SELECT id, videoUrl, thumbnailUrl, is_audio FROM videos WHERE isLocal = 1 AND is_audio = 0");
    $videos = $stmt->fetchAll();
    $requeueCount = 0;
    
    foreach ($videos as $v) {
        $path = resolve_video_path($v['videoUrl']);
        if (!$path || !file_exists($path)) continue;

        $needsRepair = false;

        // Comprobación de Miniatura Física
        $thumb = $v['thumbnailUrl'];
        $physicalThumbMissing = true;
        
        if (!empty($thumb) && strpos($thumb, 'default_video.png') === false && strpos($thumb, 'default.jpg') === false) {
            $thumbPath = resolve_video_path($thumb);
            if ($thumbPath && file_exists($thumbPath) && filesize($thumbPath) > 0) {
                $physicalThumbMissing = false;
            }
        }

        if ($physicalThumbMissing) {
            $needsRepair = true;
        }

        // Comprobación de Stream de Video (Solo si ffprobe es funcional y no detectamos falta de miniatura)
        if (!$needsRepair && !empty($ffprobe)) {
            $cmd = "$ffprobe -v error -select_streams v:0 -show_entries stream=codec_type -of default=noprint_wrappers=1:nokey=1 " . escapeshellarg($path) . " 2>&1";
            $probeResult = trim(@shell_exec($cmd) ?? '');
            
            // Si ffprobe nos dice EXPLÍCITAMENTE que es audio o algo inválido, lo re-encolamos.
            // Si retorna vacío o error, ignoramos para evitar falsos positivos masivos por fallos del binario.
            if (!empty($probeResult) && $probeResult !== 'video' && strpos($probeResult, 'error') === false) {
                $needsRepair = true;
            }
        }

        if ($needsRepair) {
            // Solo resetear si no está en proceso activo ('PROCESSING')
            $stmtUpdate = $pdo->prepare("UPDATE videos SET transcode_status = 'WAITING', thumbnailUrl = '', processing_attempts = 0 WHERE id = ? AND transcode_status != 'PROCESSING'");
            $stmtUpdate->execute([$v['id']]);
            if ($stmtUpdate->rowCount() > 0) {
                $requeueCount++;
            }
        }
    }

    respond(true, [
        'deleted' => $deletedCount,
        'requeued' => $requeueCount,
        'message' => "Reparación completada: $deletedCount registros huérfanos eliminados, $requeueCount videos re-encolados por falta de miniatura física o error de stream."
    ]);
}

function admin_repair_db($pdo, $input) {
    require_once 'functions_schema.php';
    $schema = getAppSchema();
    foreach ($schema as $table => $def) syncTable($pdo, $table, $def);
    
    // Reparar columna is_audio para registros existentes
    $audioExts = ['mp3', 'wav', 'aac', 'm4a', 'flac', 'ogg', 'opus', 'm4b'];
    $placeholders = implode(',', array_fill(0, count($audioExts), '?'));
    $sql = "UPDATE videos SET is_audio = 1 WHERE is_audio = 0 AND (";
    $clauses = [];
    foreach ($audioExts as $ext) $clauses[] = "videoUrl LIKE ?";
    $sql .= implode(' OR ', $clauses) . ")";
    
    $params = [];
    foreach ($audioExts as $ext) $params[] = "%.$ext";
    
    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    $fixed = $stmt->rowCount();

    // Reparar MP4 que están como audio por error
    $pdo->query("UPDATE videos SET is_audio = 0 WHERE is_audio = 1 AND videoUrl LIKE '%.mp4'");
    
    respond(true, "Base de datos sincronizada. Se repararon $fixed registros de audio.");
}

function admin_cleanup_files($pdo) {
    $videos = $pdo->query("SELECT videoUrl FROM videos")->fetchAll(PDO::FETCH_COLUMN);
    $thumbs = $pdo->query("SELECT thumbnailUrl FROM videos")->fetchAll(PDO::FETCH_COLUMN);
    $avatars = $pdo->query("SELECT avatarUrl FROM users")->fetchAll(PDO::FETCH_COLUMN);
    $market = $pdo->query("SELECT images FROM marketplace_items")->fetchAll(PDO::FETCH_COLUMN);
    $stories = $pdo->query("SELECT contentUrl FROM stories")->fetchAll(PDO::FETCH_COLUMN);
    $storyAudio = $pdo->query("SELECT audioUrl FROM stories")->fetchAll(PDO::FETCH_COLUMN);
    $proofs = $pdo->query("SELECT proofImageUrl FROM vip_requests")->fetchAll(PDO::FETCH_COLUMN);
    
    $usedFiles = array_merge($videos, $thumbs, $avatars, $stories, $storyAudio, $proofs);
    foreach ($market as $imgs) {
        $decoded = json_decode($imgs ?: '[]', true);
        if (is_array($decoded)) $usedFiles = array_merge($usedFiles, $decoded);
    }
    
    // Normalizar archivos usados a rutas locales relativas (ej: uploads/thumbnails/x.jpg)
    $localUsed = [];
    foreach ($usedFiles as $u) {
        if (!$u) continue;
        $path = $u;
        // Quitar prefijos comunes para normalizar
        $path = ltrim($path, '/');
        if (strpos($path, 'api/') === 0) $path = substr($path, 4);
        
        if (!empty($path)) {
            $localUsed[] = $path;
            $localUsed[] = './' . $path; // Por si glob devuelve ./
            
            // Si es una imagen, proteger también su miniatura convencional
            $ext = pathinfo($path, PATHINFO_EXTENSION);
            if (in_array(strtolower($ext), ['jpg', 'jpeg', 'png', 'webp'])) {
                $thumbPath = str_replace('.' . $ext, '_thumb.jpg', $path);
                $localUsed[] = $thumbPath;
                $localUsed[] = './' . $thumbPath;
            }
        }
    }
    
    $dirs = ['uploads/thumbnails/', 'uploads/avatars/', 'uploads/market/', 'uploads/videos/', 'uploads/proofs/'];
    $deleted = 0;
    foreach ($dirs as $dir) {
        if (!is_dir($dir)) continue;
        $files = glob($dir . '*');
        if (!$files) continue;
        foreach ($files as $f) {
            if (is_file($f)) {
                // Normalizar la ruta del archivo encontrado por glob
                $normF = ltrim($f, './');
                if (!in_array($normF, $localUsed)) {
                    @unlink($f);
                    $deleted++;
                }
            }
        }
    }
    
    respond(true, ['videos' => $deleted, 'message' => "Limpieza completada. Archivos eliminados: $deleted"]);
}

function admin_upload_default_thumb($pdo, $post, $files) {
    if (!isset($files['image'])) respond(false, null, "No se subió ninguna imagen");
    
    $type = $post['type'] ?? 'video';
    $ext = pathinfo($files['image']['name'], PATHINFO_EXTENSION) ?: 'jpg';
    $name = "default_{$type}_" . time() . "." . $ext;
    $target = "uploads/defaults/";
    if (!is_dir($target)) mkdir($target, 0777, true);
    
    if (move_uploaded_file($files['image']['tmp_name'], $target . $name)) {
        $url = "api/" . $target . $name;
        $field = "";
        if ($type === 'video') $field = "defaultVideoThumb";
        elseif ($type === 'audio') $field = "defaultAudioThumb";
        elseif ($type === 'avatar') $field = "defaultAvatar";
        
        if ($field) {
            $pdo->prepare("UPDATE system_settings SET $field = ? WHERE id = 1")->execute([$url]);
        }
        
        respond(true, ['url' => $url]);
    }
    respond(false, null, "Error al mover el archivo");
}

function admin_get_local_stats($pdo) {
    $stmtS = $pdo->query("SELECT localLibraryPath, libraryPaths FROM system_settings WHERE id = 1");
    $s = $stmtS->fetch();
    $paths = json_decode($s['libraryPaths'] ?: '[]', true);
    if ($s['localLibraryPath']) $paths[] = $s['localLibraryPath'];
    $paths = array_unique(array_filter($paths));

    $volumes = [];
    foreach ($paths as $path) {
        if (is_dir($path)) {
            $free = @disk_free_space($path);
            $total = @disk_total_space($path);
            // Convert to GB
            $freeGB = $free ? round($free / (1024 * 1024 * 1024), 2) : 0;
            $totalGB = $total ? round($total / (1024 * 1024 * 1024), 2) : 0;
            
            // Count videos in this path
            $stmtV = $pdo->prepare("SELECT COUNT(*) FROM videos WHERE videoUrl LIKE ?");
            $stmtV->execute([$path . '%']);
            $count = (int)$stmtV->fetchColumn();

            $volumes[] = [
                'name' => basename($path) ?: $path,
                'path' => $path,
                'total' => $totalGB,
                'free' => $freeGB,
                'video_count' => $count
            ];
        }
    }

    $category_stats = $pdo->query("SELECT category, COUNT(*) as count FROM videos GROUP BY category")->fetchAll();

    respond(true, [
        'volumes' => $volumes,
        'category_stats' => $category_stats
    ]);
}

function admin_reconstruct_thumbnails($pdo) {
    $dirs = [
        'uploads/thumbnails/',
        'uploads/avatars/',
        'uploads/market/',
        'uploads/videos/'
    ];

    $processed = 0;
    $created = 0;

    foreach ($dirs as $dir) {
        if (!is_dir($dir)) continue;
        
        $files = glob($dir . '*');
        if (!$files) continue;
        
        foreach ($files as $file) {
            if (!is_file($file)) continue;
            
            $ext = strtolower(pathinfo($file, PATHINFO_EXTENSION));
            if (!in_array($ext, ['jpg', 'jpeg', 'png', 'webp'])) continue;
            
            // Si ya es una miniatura con el nuevo formato, ignorar
            if (strpos($file, '_thumb.') !== false) continue;
            
            $thumbPath = str_replace('.' . $ext, '_thumb.jpg', $file);
            
            if (!file_exists($thumbPath)) {
                // Si el archivo está en la carpeta de thumbnails, es una miniatura capturada
                if (strpos($dir, 'thumbnails') !== false) {
                    // Intentar crear la versión optimizada
                    if (create_thumbnail($file, $thumbPath, 480, 270, 75)) {
                        $created++;
                    } else if (copy($file, $thumbPath)) {
                        // Fallback a copia simple si falla GD
                        $created++;
                    }
                } else {
                    // Si está en otra carpeta (videos, avatares), es un original, creamos la miniatura optimizada
                    if (create_thumbnail($file, $thumbPath, 480, 270, 75)) {
                        $created++;
                    }
                }
            }
            $processed++;
        }
    }

    // También resetear intentos para videos que EXPLÍCITAMENTE no tienen nada en DB (la reparación física se hace en la otra acción)
    $pdo->prepare("UPDATE videos SET processing_attempts = 0, locked_at = 0 WHERE (thumbnailUrl IS NULL OR thumbnailUrl = '') AND transcode_status != 'PROCESSING'")->execute();

    respond(true, [
        'processed' => $processed,
        'created' => $created,
        'message' => "Reconstrucción finalizada. Analizados: $processed, Creados: $created"
    ]);
}

function admin_battery_manual_shutdown($pdo) {
    $stmt = $pdo->query("SELECT batteryConfig FROM system_settings WHERE id = 1");
    $battery = json_decode($stmt->fetchColumn() ?: 'null', true);
    if ($battery) {
        $battery['isManualShutdown'] = true;
        $pdo->prepare("UPDATE system_settings SET batteryConfig = ? WHERE id = 1")->execute([json_encode($battery)]);
    }
    respond(true);
}

function admin_get_logs() {
    $logFile = 'transcode_log.txt';
    if (!file_exists($logFile)) respond(true, []);
    $lines = array_slice(explode("\n", file_get_contents($logFile)), -100);
    respond(true, $lines);
}

function admin_clear_logs() {
    file_put_contents('transcode_log.txt', "");
    respond(true);
}

function get_real_stats($pdo) {
    $stats = [
        'totalUsers' => $pdo->query("SELECT COUNT(*) FROM users")->fetchColumn(),
        'totalVideos' => $pdo->query("SELECT COUNT(*) FROM videos")->fetchColumn(),
        'totalSales' => $pdo->query("SELECT SUM(amount) FROM transactions WHERE type = 'PURCHASE'")->fetchColumn() ?: 0,
        'totalAdminFees' => $pdo->query("SELECT SUM(adminFee) FROM transactions")->fetchColumn() ?: 0,
        'totalMarketItems' => $pdo->query("SELECT COUNT(*) FROM marketplace_items WHERE status != 'ELIMINADO'")->fetchColumn(),
        'pendingVip' => $pdo->query("SELECT COUNT(*) FROM vip_requests WHERE status = 'PENDING'")->fetchColumn(),
        'pendingBalance' => $pdo->query("SELECT COUNT(*) FROM balance_requests WHERE status = 'PENDING'")->fetchColumn(),
        'pendingVerification' => $pdo->query("SELECT COUNT(*) FROM seller_verifications WHERE status = 'PENDING'")->fetchColumn()
    ];
    respond(true, $stats);
}

function admin_get_requests($pdo, $status) {
    $sql = "SELECT r.*, u.username FROM requests r JOIN users u ON r.userId = u.id";
    if ($status !== 'ALL') $sql .= " WHERE r.status = '$status'";
    $sql .= " ORDER BY r.createdAt DESC";
    respond(true, $pdo->query($sql)->fetchAll());
}

function admin_delete_request($pdo, $input) {
    $pdo->prepare("DELETE FROM requests WHERE id = ?")->execute([$input['id']]);
    respond(true);
}

function admin_update_request_status($pdo, $input) {
    $pdo->prepare("UPDATE requests SET status = ? WHERE id = ?")->execute([$input['status'], $input['id']]);
    respond(true);
}

// --- TRANSCODE MANAGEMENT ---

function admin_get_transcode_profiles($pdo) {
    respond(true, $pdo->query("SELECT * FROM transcode_profiles")->fetchAll());
}

function admin_save_transcode_profile($pdo, $input) {
    $pdo->prepare("REPLACE INTO transcode_profiles (extension, command_args, description) VALUES (?, ?, ?)")
        ->execute([$input['extension'], $input['command_args'], $input['description']]);
    respond(true);
}

function admin_delete_transcode_profile($pdo, $ext) {
    $pdo->prepare("DELETE FROM transcode_profiles WHERE extension = ?")->execute([$ext]);
    respond(true);
}

function admin_transcode_scan_filters($pdo, $input) {
    $mode = $input['mode'] ?? 'PREVIEW';
    $onlyNonMp4 = isset($input['onlyNonMp4']) ? (bool)$input['onlyNonMp4'] : false;
    $onlyIncompatible = isset($input['onlyIncompatible']) ? (bool)$input['onlyIncompatible'] : false;
    $onlyAudios = isset($input['onlyAudios']) ? (bool)$input['onlyAudios'] : false;
    
    $where = ["transcode_status = 'NONE'", "isLocal = 1"];
    $params = [];
    
    if ($onlyNonMp4) {
        $where[] = "videoUrl NOT LIKE '%.mp4'";
    }
    
    if ($onlyIncompatible) {
        $incompatibleExts = ['mkv', 'avi', 'ts', 'mov', 'wmv', 'flv', 'webm', 'm4v'];
        $clauses = [];
        foreach ($incompatibleExts as $e) {
            $clauses[] = "videoUrl LIKE ?";
            $params[] = "%.$e";
        }
        $where[] = "(" . implode(' OR ', $clauses) . ")";
    }

    if ($onlyAudios) {
        $where[] = "is_audio = 1";
    }
    
    // Compatibilidad con envío de extensiones explícitas
    if (isset($input['extensions']) && is_array($input['extensions']) && !empty($input['extensions'])) {
        $clauses = [];
        foreach ($input['extensions'] as $e) {
            $clauses[] = "videoUrl LIKE ?";
            $params[] = "%.$e";
        }
        $where[] = "(" . implode(' OR ', $clauses) . ")";
    }
    
    $whereSql = implode(' AND ', $where);
    
    if ($mode === 'PREVIEW') {
        $stmt = $pdo->prepare("SELECT COUNT(*) FROM videos WHERE $whereSql");
        $stmt->execute($params);
        $count = $stmt->fetchColumn();
        respond(true, ['count' => (int)$count]);
    } else {
        $stmt = $pdo->prepare("UPDATE videos SET transcode_status = 'WAITING' WHERE $whereSql");
        $stmt->execute($params);
        $count = $stmt->rowCount();
        respond(true, ['count' => $count, 'message' => "Videos añadidos a la cola: $count"]);
    }
}

function admin_transcode_batch($pdo) {
    $pdo->prepare("UPDATE videos SET transcode_status = 'WAITING' WHERE transcode_status = 'NONE' AND isLocal = 1")->execute();
    respond(true, "Toda la biblioteca local añadida a la cola.");
}

function admin_stop_transcoder($pdo) {
    $pdo->exec("UPDATE system_settings SET is_transcoder_active = 0 WHERE id = 1");
    // Intentar matar procesos ffmpeg (más portable que pkill)
    @shell_exec("ps aux | grep ffmpeg | grep -v grep | awk '{print $2}' | xargs kill -9");
    respond(true, "Transcodificador detenido y procesos eliminados.");
}

function admin_get_transcode_log() {
    $file = 'transcode_log.txt';
    if (!file_exists($file)) respond(true, "");
    $content = file_get_contents($file);
    respond(true, $content);
}

function admin_retry_failed_transcodes($pdo) {
    $pdo->exec("UPDATE videos SET transcode_status = 'WAITING' WHERE transcode_status = 'FAILED'");
    respond(true, "Reintentando videos fallidos.");
}

function admin_clear_transcode_queue($pdo) {
    $pdo->exec("UPDATE videos SET transcode_status = 'NONE' WHERE transcode_status = 'WAITING'");
    respond(true, "Cola de transcodificación vaciada.");
}

function admin_remove_from_queue($pdo, $vid) {
    $pdo->prepare("UPDATE videos SET transcode_status = 'NONE' WHERE id = ?")->execute([$vid]);
    respond(true);
}

function admin_skip_transcode($pdo, $vid) {
    $pdo->prepare("UPDATE videos SET transcode_status = 'DONE' WHERE id = ?")->execute([$vid]);
    respond(true);
}

function admin_process_next_transcode($pdo) {
    // Buscar binarios necesarios
    $ffmpeg = 'ffmpeg'; 
    
    // Buscar el siguiente video en cola
    $stmt = $pdo->query("SELECT * FROM videos WHERE transcode_status = 'WAITING' LIMIT 1");
    $video = $stmt->fetch();
    
    if (!$video) {
        respond(true, "Cola vacía");
    }
    
    // Ejecutar transcodificación (usa la función interna _admin_perform_transcode_single)
    $success = _admin_perform_transcode_single($pdo, $video, ['ffmpeg' => $ffmpeg]);
    
    respond($success, $success ? "Procesado correctamente" : "Fallo al procesar");
}

// --- SMART CLEANER & ORPHAN SYNC ---

function formatBytes($bytes, $precision = 2) { 
    $units = array('B', 'KB', 'MB', 'GB', 'TB'); 
    $bytes = max($bytes, 0); 
    $pow = floor(($bytes ? log($bytes) : 0) / log(1024)); 
    $pow = min($pow, count($units) - 1); 
    $bytes /= pow(1024, $pow);
    return round($bytes, $precision) . ' ' . $units[$pow]; 
}

function admin_smart_cleaner_preview($pdo, $input) {
    $cat = $input['category'] ?? 'ALL';
    $minDays = intval($input['minDays'] ?? 30);
    $maxViews = intval($input['maxViews'] ?? 5);
    // Hacer likes y dislikes opcionales para no ser tan restrictivos por defecto
    $minLikes = isset($input['minLikes']) ? intval($input['minLikes']) : null;
    $maxDislikes = isset($input['maxDislikes']) ? intval($input['maxDislikes']) : null;
    $maxGbLimit = floatval($input['maxGbLimit'] ?? 10);
    $maxDeleteLimit = intval($input['maxDeleteLimit'] ?? 100);
    
    $threshold = time() - ($minDays * 86400);
    
    // Construcción dinámica de la consulta
    $where = ["isLocal = 1", "views <= ?", "createdAt < ?"];
    $params = [$maxViews, $threshold];
    
    if ($minLikes !== null) {
        $where[] = "likes <= ?";
        $params[] = $minLikes;
    }
    if ($maxDislikes !== null) {
        $where[] = "dislikes >= ?";
        $params[] = $maxDislikes;
    }
    
    if ($cat !== 'ALL') {
        $where[] = "category = ?";
        $params[] = $cat;
    }
    
    $whereSql = implode(' AND ', $where);
    
    // Protección: Excluir videos comprados
    $sql = "SELECT id, title, views, videoUrl, thumbnailUrl FROM videos 
            WHERE $whereSql 
            AND id NOT IN (SELECT videoId FROM transactions WHERE type = 'PURCHASE' AND videoId IS NOT NULL)
            ORDER BY views ASC, createdAt ASC";
    
    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    $videos = $stmt->fetchAll(PDO::FETCH_ASSOC);
    
    $preview = [];
    $totalBytes = 0;
    $maxBytes = $maxGbLimit * 1024 * 1024 * 1024;
    $count = 0;
    
    foreach ($videos as $v) {
        if ($totalBytes >= $maxBytes) break;
        if ($count >= $maxDeleteLimit) break;
        
        $path = resolve_video_path($v['videoUrl']);
        $size = 0;
        if ($path && file_exists($path)) {
            $size = filesize($path);
        }
        
        $totalBytes += $size;
        $preview[] = [
            'id' => $v['id'],
            'title' => $v['title'],
            'views' => $v['views'],
            'size_fmt' => formatBytes($size),
            'reason' => 'Baja relevancia'
        ];
        $count++;
    }
    
    respond(true, [
        'preview' => $preview,
        'stats' => [
            'spaceReclaimed' => formatBytes($totalBytes)
        ]
    ]);
}

function admin_smart_cleaner_execute($pdo, $input) {
    $ids = $input['videoIds'] ?? [];
    if (empty($ids)) respond(false, null, "No se seleccionaron elementos.");
    
    $placeholders = implode(',', array_fill(0, count($ids), '?'));
    
    // Buscar archivos para eliminarlos físicamente
    $stmt = $pdo->prepare("SELECT videoUrl, thumbnailUrl FROM videos WHERE id IN ($placeholders)");
    $stmt->execute($ids);
    $videos = $stmt->fetchAll(PDO::FETCH_ASSOC);
    
    foreach ($videos as $v) {
        $vPath = resolve_video_path($v['videoUrl']);
        if ($vPath && file_exists($vPath)) {
            @unlink($vPath);
            $ext = pathinfo($vPath, PATHINFO_EXTENSION);
            @unlink(str_replace('.' . $ext, '_thumb.jpg', $vPath));
        }
        
        $tPath = resolve_video_path($v['thumbnailUrl']);
        if ($tPath && file_exists($tPath) && basename($tPath) !== 'default.jpg' && basename($tPath) !== 'defaultaudio.jpg') {
            @unlink($tPath);
            $ext = pathinfo($tPath, PATHINFO_EXTENSION);
            @unlink(str_replace('.' . $ext, '_thumb.jpg', $tPath));
        }
    }
    
    $pdo->prepare("DELETE FROM videos WHERE id IN ($placeholders)")->execute($ids);
    
    respond(true, "Se eliminaron " . count($ids) . " videos y sus archivos.");
}

function admin_extreme_janitor($pdo, $input) {
    $cat = $input['category'] ?? 'ALL';
    $minDays = intval($input['minDays'] ?? 30);
    $maxViews = intval($input['maxViews'] ?? 5);
    $limit = intval($input['maxDeleteLimit'] ?? 100);
    
    $threshold = time() - ($minDays * 86400);
    
    // First, select the videos to be deleted so we can remove their files
    // Protección: Excluir videos comprados
    $selectSql = "SELECT id, videoUrl, thumbnailUrl FROM videos 
                  WHERE views <= ? 
                  AND createdAt < ?
                  AND id NOT IN (SELECT videoId FROM transactions WHERE type = 'PURCHASE' AND videoId IS NOT NULL)";
    $params = [$maxViews, $threshold];
    
    if ($cat !== 'ALL') {
        $selectSql .= " AND category = ?";
        $params[] = $cat;
    }
    
    $selectSql .= " LIMIT $limit";
    
    $stmt = $pdo->prepare($selectSql);
    $stmt->execute($params);
    $videos = $stmt->fetchAll(PDO::FETCH_ASSOC);
    
    if (empty($videos)) {
        respond(true, "Janitor completado. Registros eliminados: 0");
    }
    
    $ids = array_column($videos, 'id');
    
    // Delete physical files
    foreach ($videos as $v) {
        $vPath = resolve_video_path($v['videoUrl']);
        if ($vPath && file_exists($vPath)) {
            @unlink($vPath);
            $ext = pathinfo($vPath, PATHINFO_EXTENSION);
            @unlink(str_replace('.' . $ext, '_thumb.jpg', $vPath));
        }
        
        $tPath = resolve_video_path($v['thumbnailUrl']);
        if ($tPath && file_exists($tPath) && basename($tPath) !== 'default.jpg' && basename($tPath) !== 'defaultaudio.jpg') {
            @unlink($tPath);
            $ext = pathinfo($tPath, PATHINFO_EXTENSION);
            @unlink(str_replace('.' . $ext, '_thumb.jpg', $tPath));
        }
    }
    
    // Delete database records
    $placeholders = implode(',', array_fill(0, count($ids), '?'));
    $deleteSql = "DELETE FROM videos WHERE id IN ($placeholders)";
    $pdo->prepare($deleteSql)->execute($ids);
    
    respond(true, "Janitor completado. Registros y archivos eliminados: " . count($ids));
}

function admin_file_cleanup_preview($pdo, $type) {
    $results = [];
    if ($type === 'THUMBS') {
        $dbThumbs = $pdo->query("SELECT thumbnailUrl FROM videos")->fetchAll(PDO::FETCH_COLUMN);
        $dbThumbs = array_map(function($t) { return basename($t); }, $dbThumbs);
        
        $files = glob('uploads/thumbnails/*.jpg');
        foreach ($files as $f) {
            $base = basename($f);
            if (!in_array($base, $dbThumbs) && $base !== 'default.jpg' && $base !== 'defaultaudio.jpg') {
                $results[] = ['path' => $f, 'size' => filesize($f)];
            }
        }
    }
    respond(true, $results);
}

function admin_organize_paquete($pdo, $input) {
    $path = rtrim($input['path'], '/');
    if (!is_dir($path)) respond(false, null, "La ruta no es un directorio válido.");
    
    $files = glob($path . '/*.{mp4,mkv,avi,mov,ts}', GLOB_BRACE);
    $count = 0;
    foreach ($files as $f) {
        $name = basename($f);
        // Lógica simple: si el nombre tiene "S01E01" o similar, crear carpeta de serie
        if (preg_match('/(.*)[sS](\d+)[eE](\d+)/', $name, $m)) {
            $showName = trim(str_replace(['.', '_'], ' ', $m[1]));
            $destDir = $path . '/' . $showName . '/Temporada ' . intval($m[2]);
            if (!is_dir($destDir)) mkdir($destDir, 0777, true);
            rename($f, $destDir . '/' . $name);
            $count++;
        }
    }
    respond(true, "Se organizaron $count archivos.");
}

function admin_client_log($input) {
    $msg = $input['message'] ?? '';
    $level = $input['level'] ?? 'ERROR';
    $log = "[" . date('Y-m-d H:i:s') . "] [$level] $msg\n";
    file_put_contents('client_errors.log', $log, FILE_APPEND);
    respond(true);
}

function admin_get_seller_verification_requests($pdo) {
    $stmt = $pdo->query("SELECT sv.*, u.username FROM seller_verifications sv JOIN users u ON sv.userId = u.id WHERE sv.status = 'PENDING' ORDER BY sv.createdAt DESC");
    respond(true, $stmt->fetchAll());
}

function admin_run_video_worker($pdo) {
    // Intentar ejecutar el worker en segundo plano
    $cmd = "php " . __DIR__ . "/video_worker.php > /dev/null 2>&1 &";
    @shell_exec($cmd);
    respond(true, "Worker iniciado en segundo plano.");
}

function admin_handle_seller_verification($pdo, $input) {
    $id = $input['id'];
    $status = $input['status'];
    $pdo->beginTransaction();
    try {
        $stmt = $pdo->prepare("SELECT userId FROM seller_verifications WHERE id = ?");
        $stmt->execute([$id]);
        $uid = $stmt->fetchColumn();
        
        $pdo->prepare("UPDATE seller_verifications SET status = ? WHERE id = ?")->execute([$status, $id]);
        if ($status === 'APPROVED') {
            // Obtener los datos de la verificación para guardarlos en el perfil del usuario
            $stmt = $pdo->prepare("SELECT fullName, address, mobile FROM seller_verifications WHERE id = ?");
            $stmt->execute([$id]);
            $sv = $stmt->fetch();
            
            if ($sv) {
                $shippingDetails = json_encode([
                    'fullName' => $sv['fullName'],
                    'address' => $sv['address'],
                    'phoneNumber' => $sv['mobile']
                ]);
                $pdo->prepare("UPDATE users SET is_verified_seller = 1, shippingDetails = ? WHERE id = ?")->execute([$shippingDetails, $uid]);
            } else {
                $pdo->prepare("UPDATE users SET is_verified_seller = 1 WHERE id = ?")->execute([$uid]);
            }
        }
        $pdo->commit();
        respond(true);
    } catch (Exception $e) {
        $pdo->rollBack();
        respond(false, null, $e->getMessage());
    }
}

function admin_ban_user($pdo, $input) {
    $uid = $input['userId'];
    $pdo->prepare("UPDATE users SET is_banned = 1 WHERE id = ?")->execute([$uid]);
    respond(true);
}

function admin_unban_user($pdo, $input) {
    $uid = $input['userId'];
    $pdo->prepare("UPDATE users SET is_banned = 0 WHERE id = ?")->execute([$uid]);
    respond(true);
}

function update_battery_simulation($pdo) {
    $stmt = $pdo->query("SELECT batteryConfig, batteryHistory FROM system_settings WHERE id = 1");
    $settings = $stmt->fetch();
    $battery = json_decode($settings['batteryConfig'] ?: 'null', true);
    $history = json_decode($settings['batteryHistory'] ?: '[]', true);
    
    if (!$battery) {
        $battery = [
            'voltage' => 14.8,
            'vQuimico' => 14.8,
            'vReal' => 14.8,
            'minWatts' => 18,
            'maxWatts' => 45,
            'isCharging' => true,
            'cellHealth' => 89,
            'currentWh' => 125,
            'lastUpdate' => $now,
            'chargePower' => 45,
            'cellsSeries' => 4,
            'cellsParallel' => 4,
            'cellCapacityMah' => 5000,
            'temp' => 25
        ];
    }

    $now = floor(microtime(true) * 1000);
    $lastUpdate = $battery['lastUpdate'] ?? $now;
    
    // Check for manual override to prevent UI settings from being immediately overwritten by simulation
    $manualOverrideUntil = $battery['manualOverrideUntil'] ?? 0;
    if ($now < $manualOverrideUntil) {
        return [
            'config' => $battery,
            'history' => $history
        ];
    }
    
    // Convertir de segundos a milisegundos si es necesario (migración)
    if ($lastUpdate < 10000000000) {
        $lastUpdate *= 1000;
    }
    
    $elapsedMs = $now - $lastUpdate;
    $elapsedSeconds = $elapsedMs / 1000;

    if ($elapsedSeconds <= 0) {
        return [
            'config' => $battery,
            'history' => $history
        ];
    }

    // Si el salto es mayor a 5 minutos, probablemente el sistema estuvo apagado.
    $isOutage = $elapsedSeconds > 300;
    $elapsedHours = $elapsedSeconds / 3600;

    if ($isOutage) {
        $lastPoint = end($history);
        $lastV = $lastPoint ? $lastPoint['v'] : 14.8;
        $lastPct = round(($lastV - 12.0) / 4.8 * 100);
        
        $isManual = $battery['isManualShutdown'] ?? false;
        $battery['isManualShutdown'] = false; // Reset flag
        
        if (!$isManual) {
            // Apagado inesperado (Corte de luz o batería agotada realmente)
            if ($lastPct <= 0) {
                // Contar cuántos puntos de 0% hubo al final
                $zeroCount = 0;
                for ($i = count($history) - 1; $i >= 0; $i--) {
                    $p = $history[$i];
                    $pPct = round(($p['v'] - 12.0) / 4.8 * 100);
                    if ($pPct <= 0) $zeroCount++;
                    else break;
                }
                
                if ($zeroCount >= 3) {
                    // Calibración: La batería aguantó más de lo esperado a 0%
                    $battery['calibration']['status'] = 'CALIBRATED_DEEP_DISCHARGE';
                    $battery['calibration']['lastEvent'] = "Batería agotada con margen extra ($zeroCount min a 0%)";
                }
            } else if ($lastPct < 3) {
                // Calibración por descarga casi completa
                $battery['calibration']['status'] = 'CALIBRATED_LOW';
                $battery['calibration']['lastEvent'] = "Apagado con batería baja ($lastPct%)";
            } else {
                // Apagado con carga -> Posible sobreestimación de capacidad
                $battery['calibration']['status'] = 'CALIBRATED_UNEXPECTED';
                $battery['calibration']['lastEvent'] = "Apagado inesperado con $lastPct% restante";
            }
        } else {
            $battery['calibration']['lastEvent'] = "Apagado manual registrado con $lastPct%";
        }
        
        // Lógica de reanudación
        if ($lastPct > 5) {
            // Continuar desde donde se quedó (no forzamos a 0)
        } else {
            // Forzar a 0% si estaba muy bajo o fue inesperado
            $battery['currentWh'] = 0;
            $battery['vQuimico'] = 12.0;
        }
        
        // Al encenderse, asumimos que está conectado a la red solo si no hay una configuración previa que diga lo contrario
        if (!isset($battery['isCharging'])) {
            $battery['isCharging'] = true;
        }
        $elapsedHours = 0;
    }
    
    // 1. Constantes del Sistema (4S4P 21700)
    $soh = ($battery['cellHealth'] ?? 100) / 100;
    $capTotalWh = 250 * $soh; 
    $cargadorMaxW = ($battery['chargePower'] ?? 45);
    $vMax = 16.8;
    $vMin = 12.0; // Punto de corte real

    // 2. Aprendizaje del Historial (Calibración Automática)
    if (!empty($history) && count($history) > 10 && !isset($battery['lastLearning'])) {
        $lastPoints = array_slice($history, -20);
        $vDiff = $lastPoints[count($lastPoints)-1]['v'] - $lastPoints[0]['v'];
        $tDiff = ($lastPoints[count($lastPoints)-1]['t'] - $lastPoints[0]['t']) / 3600000; // Horas
        
        if ($tDiff > 0.1) { // Al menos 6 minutos de datos
            $observedRate = abs($vDiff / $tDiff); // V/h
            $expectedRate = ($vMax - $vMin) / ($capTotalWh / 25); // Estimación simple
            
            // Si la descarga es mucho más rápida de lo esperado, bajar SOH
            if ($vDiff < 0 && $observedRate > $expectedRate * 1.2) {
                $battery['cellHealth'] = max(50, ($battery['cellHealth'] ?? 100) - 0.1);
            }
            $battery['lastLearning'] = $now;
        }
    }
    // Reset learning flag periodically
    if (isset($battery['lastLearning']) && ($now - $battery['lastLearning']) > 86400000) {
        unset($battery['lastLearning']);
    }

    // 3. Cálculo de Consumo (P_sys)
    $load = sys_getloadavg();
    $cpuUsage = $load ? $load[0] * 100 / 4 : 10;
    $diskActivity = rand(0, 100);
    
    $pSys = ($battery['minWatts'] ?? 18) + ($cpuUsage * 0.25) + (($diskActivity / 100) * 2);
    $effectivePSys = $isOutage ? 0 : $pSys;

    // 4. Lógica de Carga
    $isCharging = $battery['isCharging'] ?? false;
    $pCharge = 0;

    if ($isCharging) {
        $pCharge = max(0, $cargadorMaxW - $effectivePSys);
        // Thermal Throttling suave
        if (($battery['temp'] ?? 25) > 45) {
            $pCharge *= 0.7;
        }
    }

    // 5. Curva No Lineal de Voltaje (V_quimico)
    $vQuimico = $battery['vQuimico'] ?? ($battery['voltage'] ?? 14.8);
    $netPower = $isCharging ? $pCharge : -$effectivePSys;
    $deltaWh = $netPower * $elapsedHours;
    
    $currentWh = ($battery['currentWh'] ?? ($capTotalWh * 0.5)) + $deltaWh;
    $currentWh = max(0, min($capTotalWh, $currentWh));

    // Tasa de cambio de voltaje basada en capacidad real (SOH)
    $baseVPerWh = ($vMax - $vMin) / $capTotalWh;
    $vChange = $deltaWh * $baseVPerWh;

    // Efecto Meseta y Tramos Críticos
    if ($vQuimico >= 14.2 && $vQuimico <= 15.8) {
        $vChange *= 0.6; 
    }
    if (!$isCharging && $vQuimico < 13.5) {
        $vChange *= 1.8; 
    }
    
    // Fase CV suave
    if ($isCharging && $vQuimico > 16.0) {
        $cvFactor = max(0.1, ($vMax - $vQuimico) / ($vMax - 16.0));
        $vChange *= $cvFactor;
        $pCharge *= $cvFactor;
    }

    $vQuimico += $vChange;
    $vQuimico = max($vMin, min($vMax, $vQuimico));

    // 6. Voltaje de Pantalla (V_display) - Transiciones Suaves
    // El voltaje de pantalla cae bajo carga y sube al cargar (Resistencia Interna)
    $internalRes = 0.02 * (1.2 - $soh); // Aumenta con el desgaste
    $vDrop = $effectivePSys * $internalRes;
    $vRise = $isCharging ? ($pCharge * $internalRes * 1.5) : 0;
    
    $targetVDisplay = $vQuimico - $vDrop + $vRise;
    
    // Suavizado de V_display para evitar saltos bruscos
    $currentVDisplay = $battery['voltage'] ?? $vQuimico;
    $smoothingFactor = min(1, $elapsedSeconds / 10); // 10 segundos para estabilizar
    $vDisplay = $currentVDisplay + ($targetVDisplay - $currentVDisplay) * $smoothingFactor;

    // 7. Monitor de Temperatura
    $tempBase = 25;
    $tempLoad = ($pSys / 50) * 12;
    $tempCharge = $isCharging ? ($pCharge / 45) * 15 : 0;
    $targetTemp = $tempBase + $tempLoad + $tempCharge;
    $currentTemp = $battery['temp'] ?? 25;
    $battery['temp'] = round($currentTemp + ($targetTemp - $currentTemp) * $smoothingFactor, 1);

    // Actualizar estado
    $battery['vQuimico'] = round($vQuimico, 3);
    $battery['voltage'] = round($vDisplay, 3);
    $battery['vReal'] = round($vQuimico, 3); // Voltaje para cálculo de % (sin caídas por carga)
    $battery['pSys'] = round($pSys, 2);
    $battery['pCharge'] = round($pCharge, 2);
    $battery['currentWh'] = round($currentWh, 2);
    $battery['lastUpdate'] = $now;
    $battery['vMin'] = $vMin; 
    $battery['vMax'] = $vMax;

    // Sugerencias de Calibración
    if (!isset($battery['calibration'])) {
        $battery['calibration'] = [
            'status' => 'NORMAL',
            'suggestions' => [
                "Ciclo Completo: Descarga hasta 12.0V y carga ininterrumpida hasta 16.8V.",
                "Efecto Meseta: Entre 14.5V y 15.5V el voltaje subirá más lento, es normal.",
                "Fase CV: Al superar 16.2V la carga se ralentiza para proteger las celdas."
            ]
        ];
    }

    // Migración de historial a milisegundos
    foreach ($history as &$point) {
        if (isset($point['t']) && $point['t'] < 10000000000) {
            $point['t'] *= 1000;
        }
    }

    // Update History (cada 1 minuto = 60,000 ms)
    $lastHistory = end($history);
    if (empty($history) || ($now - $lastHistory['t']) >= 60000) {
        $history[] = [
            't' => $now, 
            'v' => $battery['voltage'], 
            'c' => $isCharging ? 1 : 0, 
            'p' => $pSys,
            'temp' => $battery['temp']
        ];
        if (count($history) > 1440) array_shift($history); // 24 horas a 1 min/punto
    }

    $pdo->prepare("UPDATE system_settings SET batteryConfig = ?, batteryHistory = ? WHERE id = 1")
        ->execute([json_encode($battery), json_encode($history)]);

    // Al final del update, aseguramos que la versión de la APK esté actualizada en los settings
    $pdo->prepare("UPDATE system_settings SET latestApkVersion = '1.0.3' WHERE id = 1 AND (latestApkVersion != '1.0.3' OR latestApkVersion IS NULL)")->execute();

    return [
        'config' => $battery,
        'history' => $history
    ];
}

function admin_get_server_stats($pdo) {
    // 1. CPU Usage (Load Average)
    $load = sys_getloadavg();
    $cpuUsage = $load ? round($load[0] * 100 / 4, 2) : rand(5, 15);

    // 2. Storage Usage (Sum of all library paths)
    $stmt = $pdo->query("SELECT libraryPaths FROM system_settings WHERE id = 1");
    $settings = $stmt->fetch();
    $paths = json_decode($settings['libraryPaths'] ?: '[]', true);
    if (empty($paths)) $paths = ["/"];
    
    $diskTotal = 0;
    $diskFree = 0;
    $seenDevs = [];
    foreach ($paths as $p) {
        if (!is_dir($p)) continue;
        // Skip slow network paths if they are not responsive (simple check)
        if (strpos($p, '/volume') === 0 && !@is_readable($p)) continue; 
        
        $dev = @file_exists($p) ? @lstat($p)['dev'] : null;
        if ($dev && in_array($dev, $seenDevs)) continue; 
        if ($dev) $seenDevs[] = $dev;

        $diskTotal += @disk_total_space($p) ?: 0;
        $diskFree += @disk_free_space($p) ?: 0;
    }
    
    // Fallback if no paths or errors
    if ($diskTotal === 0) {
        $diskTotal = 100 * 1024 * 1024 * 1024;
        $diskFree = 50 * 1024 * 1024 * 1024;
    }
    $diskUsed = $diskTotal - $diskFree;
    $diskPercent = $diskTotal > 0 ? round(($diskUsed / $diskTotal) * 100, 2) : 0;

    // 3. Battery Simulation (Persistent)
    $simResult = update_battery_simulation($pdo);
    $battery = $simResult ? $simResult['config'] : null;
    $history = $simResult ? $simResult['history'] : [];

    // 4. Network Speed (Simulated)
    $netDown = rand(100, 5000);
    $netUp = rand(50, 2000);

    // 5. Active Users
    $fiveMinsAgo = time() - 300;
    $stmt = $pdo->prepare("SELECT COUNT(*) FROM users WHERE lastActive > ?");
    $stmt->execute([$fiveMinsAgo]);
    $userCount = (int)$stmt->fetchColumn();

    respond(true, [
        'cpu' => $cpuUsage,
        'storage' => [
            'total' => formatBytes($diskTotal),
            'used' => formatBytes($diskUsed),
            'percent' => $diskPercent
        ],
        'network' => [
            'up' => $netUp,
            'down' => $netDown
        ],
        'activeUsers' => $userCount,
        'uptime' => (function_exists('shell_exec') && !@ini_get('safe_mode')) ? (@shell_exec('uptime -p') ?: 'N/A') : 'N/A',
        'battery' => $battery,
        'batteryHistory' => $history
    ]);
}

function admin_server_control($pdo, $input) {
    $action = $input['serverAction'] ?? '';
    if ($action === 'shutdown') {
        @shell_exec('shutdown -h now');
        respond(true, "Comando de apagado enviado.");
    } elseif ($action === 'reboot') {
        @shell_exec('reboot');
        respond(true, "Comando de reinicio enviado.");
    }
    respond(false, null, "Acción no válida");
}

function admin_change_user_role($pdo, $input) {
    $uid = $input['userId'];
    $role = $input['role']; // ADMIN, USER, SELLER (if we add SELLER to enum)
    
    // First ensure the role is valid for the enum
    if (!in_array($role, ['USER', 'ADMIN'])) {
        respond(false, null, "Rol no válido");
    }
    
    $pdo->prepare("UPDATE users SET role = ? WHERE id = ?")->execute([$role, $uid]);
    respond(true);
}

function admin_delete_user($pdo, $input) {
    $uid = $input['userId'];
    $pdo->beginTransaction();
    try {
        // Delete related data to maintain integrity
        $pdo->prepare("DELETE FROM interactions WHERE userId = ?")->execute([$uid]);
        $pdo->prepare("DELETE FROM comments WHERE userId = ?")->execute([$uid]);
        $pdo->prepare("DELETE FROM notifications WHERE userId = ?")->execute([$uid]);
        $pdo->prepare("DELETE FROM subscriptions WHERE subscriberId = ? OR creatorId = ?")->execute([$uid, $uid]);
        $pdo->prepare("DELETE FROM users WHERE id = ?")->execute([$uid]);
        $pdo->commit();
        respond(true);
    } catch (Exception $e) {
        $pdo->rollBack();
        respond(false, null, $e->getMessage());
    }
}

function admin_suspend_seller($pdo, $input) {
    $uid = $input['userId'];
    $pdo->prepare("UPDATE users SET is_verified_seller = 0 WHERE id = ?")->execute([$uid]);
    respond(true);
}

function admin_feature_listing($pdo, $input) {
    $itemId = $input['itemId'];
    $isFeatured = $input['isFeatured'] ? 1 : 0;
    $pdo->prepare("UPDATE marketplace_items SET is_featured = ? WHERE id = ?")->execute([$isFeatured, $itemId]);
    respond(true);
}

function admin_deep_cleanup($pdo) {
    // 1. Delete videos from DB that don't exist on disk
    $videos = $pdo->query("SELECT id, videoUrl FROM videos WHERE isLocal = 1")->fetchAll();
    $deletedCount = 0;
    foreach ($videos as $v) {
        $path = resolve_video_path($v['videoUrl']);
        if (!$path || !file_exists($path)) {
            $pdo->prepare("DELETE FROM videos WHERE id = ?")->execute([$v['id']]);
            $deletedCount++;
        }
    }
    
    // 2. Delete orphaned thumbnails (already partially handled by admin_cleanup_files)
    // But let's make it more robust
    
    respond(true, "Limpieza profunda completada. Registros huérfanos eliminados: $deletedCount");
}

/**
 * Realiza la transcodificación de un solo video (Uso interno por worker)
 */
function _admin_perform_transcode_single($pdo, $video, $bins) {
    $ffmpeg = $bins['ffmpeg'];
    $videoId = $video['id'];
    $videoUrl = $video['videoUrl'];
    $inputPath = resolve_video_path($videoUrl);

    if (!$inputPath || !file_exists($inputPath)) {
        write_log("Transcode: Archivo de entrada no encontrado: $videoUrl", 'ERROR');
        $pdo->prepare("UPDATE videos SET transcode_status = 'FAILED' WHERE id = ?")->execute([$videoId]);
        return false;
    }

    // Determinar perfil según extensión de entrada
    $ext = strtolower(pathinfo($inputPath, PATHINFO_EXTENSION));
    $audioExts = ['mp3', 'wav', 'aac', 'm4a', 'flac', 'ogg', 'opus', 'm4b'];
    $isAudioInput = in_array($ext, $audioExts);
    
    $stmt = $pdo->prepare("SELECT * FROM transcode_profiles WHERE extension = ?");
    $stmt->execute([$ext]);
    $profile = $stmt->fetch();

    if (!$profile) {
        if ($isAudioInput) {
            // Perfil por defecto para audio: Asegurar MP3 compatible
            $profile = [
                'command_args' => '-c:a libmp3lame -b:a 192k',
                'extension' => 'mp3'
            ];
        } else {
            // Perfil por defecto para video: Convertir a MP4 compatible
            $profile = [
                'command_args' => '-c:v libx264 -preset ultrafast -crf 28 -c:a aac -b:a 128k -movflags +faststart',
                'extension' => 'mp4'
            ];
        }
    }

    // Determinar extensión de salida
    $outputExt = $profile['extension'];
    
    // Forzar extensión correcta si detectamos encoders específicos en los argumentos
    if (strpos($profile['command_args'], 'libmp3lame') !== false) $outputExt = 'mp3';
    if (strpos($profile['command_args'], 'libx264') !== false) $outputExt = 'mp4';
    
    // Salvaguarda: Si la entrada es audio, la salida DEBE ser audio (mp3 por defecto si no se especificó otra cosa)
    if ($isAudioInput && !in_array($outputExt, $audioExts)) {
        $outputExt = 'mp3';
        if (strpos($profile['command_args'], 'libx264') !== false) {
            // Si por error se asignó un perfil de video a un audio, resetear a audio
            $profile['command_args'] = '-c:a libmp3lame -b:a 192k';
        }
    }
    
    $outputPath = preg_replace('/\.[^.]+$/', '', $inputPath) . '_t.' . $outputExt;
    
    // Evitar colisión si ya existe el archivo de salida
    if (file_exists($outputPath)) {
        @unlink($outputPath);
    }

    // Actualizar estado a PROCESSING
    $pdo->prepare("UPDATE videos SET transcode_status = 'PROCESSING' WHERE id = ?")->execute([$videoId]);

    $cmd = "$ffmpeg -y -i " . escapeshellarg($inputPath) . " " . $profile['command_args'] . " " . escapeshellarg($outputPath) . " 2>&1";
    write_log("Transcode: Iniciando $videoId: $cmd");
    
    $output = [];
    $returnVar = 0;
    exec($cmd, $output, $returnVar);

    if ($returnVar === 0 && file_exists($outputPath) && filesize($outputPath) > 0) {
        // Éxito
        $newFilename = basename($outputPath);
        $newUrl = dirname($videoUrl) . '/' . $newFilename;
        if ($videoUrl[0] === '/') $newUrl = '/' . ltrim($newUrl, '/');
        
        // Actualizar base de datos
        $pdo->prepare("UPDATE videos SET videoUrl = ?, transcode_status = 'DONE', locked_at = 0 WHERE id = ?")
            ->execute([$newUrl, $videoId]);
        
        // Opcional: Eliminar el original para ahorrar espacio si se desea
        // @unlink($inputPath);
        
        write_log("Transcode: Éxito $videoId -> $newUrl");
        return true;
    } else {
        // Fallo
        $errorMsg = implode(" | ", array_slice($output, -3));
        write_log("Transcode: Falló $videoId. Error: $errorMsg", 'ERROR');
        $pdo->prepare("UPDATE videos SET transcode_status = 'FAILED', locked_at = 0 WHERE id = ?")->execute([$videoId]);
        return false;
    }
}
