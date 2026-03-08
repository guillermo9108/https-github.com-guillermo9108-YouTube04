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
    } else {
        $res = [
            'categories' => [],
            'categoryPrices' => [],
            'customCategories' => [],
            'libraryPaths' => [],
            'ftpSettings' => [],
            'vipPlans' => [],
            'paymentMethods' => []
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
        'transferFee', 'vipPlans', 'paymentMethods', 'enableDebugLog', 'vapidPublicKey', 'vapidPrivateKey'
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
    $pdo->prepare("UPDATE users SET balance = balance + ? WHERE id = ?")->execute([$amt, $uid]);
    respond(true);
}

function admin_get_finance_requests($pdo) {
    $bal = $pdo->query("SELECT br.*, u.username FROM balance_requests br JOIN users u ON br.userId = u.id WHERE br.status = 'PENDING' ORDER BY br.createdAt DESC")->fetchAll();
    $vip = $pdo->query("SELECT vr.*, u.username FROM vip_requests vr JOIN users u ON vr.userId = u.id WHERE vr.status = 'PENDING' ORDER BY vr.createdAt DESC")->fetchAll();
    respond(true, ['balance' => $bal, 'vip' => $vip]);
}

function admin_handle_balance_request($pdo, $input) {
    $rid = $input['reqId']; $status = $input['status']; $pdo->beginTransaction();
    $stmt = $pdo->prepare("SELECT userId, amount FROM balance_requests WHERE id = ?"); $stmt->execute([$rid]); $r = $stmt->fetch();
    if ($status === 'APPROVED') $pdo->prepare("UPDATE users SET balance = balance + ? WHERE id = ?")->execute([$r['amount'], $r['userId']]);
    $pdo->prepare("UPDATE balance_requests SET status = ? WHERE id = ?")->execute([$status, $rid]);
    $pdo->commit(); respond(true);
}

function admin_handle_vip_request($pdo, $input) {
    $rid = $input['reqId']; $status = $input['status']; $pdo->beginTransaction();
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
        }
        $pdo->prepare("UPDATE vip_requests SET status = ? WHERE id = ?")->execute([$status, $rid]);
        $pdo->commit(); respond(true);
    } catch (Exception $e) { $pdo->rollBack(); respond(false, null, $e->getMessage()); }
}

function admin_get_global_transactions($pdo) {
    $stmt = $pdo->query("SELECT t.*, b.username as buyerName, c.username as creatorName FROM transactions t LEFT JOIN users b ON t.buyerId = b.id LEFT JOIN users c ON t.creatorId = c.id ORDER BY t.timestamp DESC LIMIT 200");
    respond(true, $stmt->fetchAll());
}

function admin_repair_db($pdo, $input) {
    require_once 'functions_schema.php';
    $schema = getAppSchema();
    foreach ($schema as $table => $def) syncTable($pdo, $table, $def);
    
    // Reparar columna is_audio para registros existentes
    $audioExts = ['mp3', 'wav', 'aac', 'm4a', 'flac'];
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
    
    respond(true, "Base de datos sincronizada. Se repararon $fixed registros de audio.");
}

function admin_cleanup_files($pdo) {
    $videos = $pdo->query("SELECT thumbnailUrl FROM videos")->fetchAll(PDO::FETCH_COLUMN);
    $files = glob('uploads/thumbnails/*.jpg');
    $deleted = 0;
    foreach ($files as $f) {
        $name = 'api/' . $f;
        if (!in_array($name, $videos)) { unlink($f); $deleted++; }
    }
    respond(true, "Limpieza completada. Archivos eliminados: $deleted");
}

function admin_get_local_stats($pdo) {
    $stmt = $pdo->query("SELECT COUNT(*) as total, SUM(CASE WHEN transcode_status='DONE' THEN 1 ELSE 0 END) as transcoded, SUM(CASE WHEN transcode_status='WAITING' THEN 1 ELSE 0 END) as in_queue FROM videos WHERE isLocal = 1");
    respond(true, $stmt->fetch());
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
    $exts = $input['extensions'] ?? []; // Array de extensiones a buscar, ej: ['avi', 'mkv']
    if (empty($exts)) respond(false, null, "Debe seleccionar al menos una extensión.");
    
    $placeholders = implode(',', array_fill(0, count($exts), '?'));
    $sql = "UPDATE videos SET transcode_status = 'WAITING' WHERE transcode_status = 'NONE' AND (";
    $clauses = [];
    foreach ($exts as $e) $clauses[] = "videoUrl LIKE ?";
    $sql .= implode(' OR ', $clauses) . ")";
    
    $params = [];
    foreach ($exts as $e) $params[] = "%.$e";
    
    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    respond(true, "Videos añadidos a la cola: " . $stmt->rowCount());
}

function admin_transcode_batch($pdo) {
    $pdo->prepare("UPDATE videos SET transcode_status = 'WAITING' WHERE transcode_status = 'NONE' AND isLocal = 1")->execute();
    respond(true, "Toda la biblioteca local añadida a la cola.");
}

function admin_stop_transcoder($pdo) {
    $pdo->exec("UPDATE system_settings SET is_transcoder_active = 0 WHERE id = 1");
    // Intentar matar procesos ffmpeg (solo Linux/Synology)
    @shell_exec("pkill ffmpeg");
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
    $maxViews = intval($input['maxViews'] ?? 2);
    $minLikes = intval($input['minLikes'] ?? 0);
    $maxDislikes = intval($input['maxDislikes'] ?? 10);
    $maxGbLimit = floatval($input['maxGbLimit'] ?? 50);
    $maxDeleteLimit = intval($input['maxDeleteLimit'] ?? 100);
    
    $threshold = time() - ($minDays * 86400);
    
    $sql = "SELECT id, title, views, videoUrl FROM videos WHERE isLocal = 1 AND views <= ? AND likes <= ? AND dislikes >= ? AND createdAt < ?";
    $params = [$maxViews, $minLikes, $maxDislikes, $threshold];
    
    if ($cat !== 'ALL') {
        $sql .= " AND category = ?";
        $params[] = $cat;
    }
    
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
            'size_fmt' => formatBytes($size)
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
        }
        
        $tPath = resolve_video_path($v['thumbnailUrl']);
        if ($tPath && file_exists($tPath) && basename($tPath) !== 'default.jpg' && basename($tPath) !== 'defaultaudio.jpg') {
            @unlink($tPath);
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
    $selectSql = "SELECT id, videoUrl, thumbnailUrl FROM videos WHERE views <= ? AND createdAt < ?";
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
        }
        
        $tPath = resolve_video_path($v['thumbnailUrl']);
        if ($tPath && file_exists($tPath) && basename($tPath) !== 'default.jpg' && basename($tPath) !== 'defaultaudio.jpg') {
            @unlink($tPath);
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
