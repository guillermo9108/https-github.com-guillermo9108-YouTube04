<?php
/**
 * ADMINISTRACIÓN - CORE FUNCTIONS V19.0 (Auto-Transcoder Engine)
 */

function admin_get_settings($pdo) {
    $stmt = $pdo->query("SELECT * FROM system_settings WHERE id = 1");
    $settings = $stmt->fetch(PDO::FETCH_ASSOC);
    if ($settings) {
        $jsonFields = ['categories', 'libraryPaths', 'vipPlans', 'ftpSettings', 'paymentMethods', 'categoryPrices', 'customCategories', 'categoryHierarchy'];
        foreach ($jsonFields as $field) {
            if (isset($settings[$field])) {
                if (is_string($settings[$field]) && !empty($settings[$field])) {
                    $decoded = json_decode($settings[$field], true);
                    $settings[$field] = $decoded !== null ? $decoded : ($field === 'ftpSettings' || $field === 'paymentMethods' ? new stdClass() : []);
                } elseif (empty($settings[$field])) {
                    $settings[$field] = ($field === 'ftpSettings' || $field === 'paymentMethods' ? new stdClass() : []);
                }
            }
        }
        respond(true, $settings);
    }
    respond(false, null, "No se pudo cargar la configuración");
}

function admin_update_settings($pdo, $input) {
    $allowed = [
        'downloadStartTime', 'downloadEndTime', 'isQueuePaused', 'batchSize', 
        'maxDuration', 'maxResolution', 'ytDlpPath', 'ffmpegPath', 'enableYoutube', 
        'categoryPrices', 'customCategories', 'localLibraryPath', 'libraryPaths', 
        'videoCommission', 'marketCommission', 'transferFee', 'vipPlans', 
        'paymentInstructions', 'currencyConversion', 'enableDebugLog', 
        'autoTranscode', 'transcodePreset', 'proxyUrl', 'ftpSettings', 
        'categories', 'is_transcoder_active', 'tropipayClientId', 'tropipayClientSecret', 
        'geminiKey', 'paymentMethods', 'videoDeliveryMode'
    ];
    $fields = []; $params = [];
    foreach ($input as $key => $val) {
        if (in_array($key, $allowed)) {
            $fields[] = "`$key` = ?";
            $params[] = (is_array($val) || is_object($val)) ? json_encode($val, JSON_UNESCAPED_UNICODE) : $val;
        }
    }
    if (empty($fields)) respond(true);
    $sql = "UPDATE system_settings SET " . implode(', ', $fields) . " WHERE id = 1";
    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    respond(true);
}

function admin_bulk_edit_folder($pdo, $input) {
    $relPath = trim($input['folderPath'] ?? '');
    $price = floatval($input['price']);
    $sortOrder = $input['sortOrder'] ?? 'LATEST';

    $stmtS = $pdo->query("SELECT localLibraryPath, categories FROM system_settings WHERE id = 1");
    $settings = $stmtS->fetch();
    $root = rtrim($settings['localLibraryPath'], '/\\');

    // Normalizar ruta para SQL
    $fullPathPrefix = str_replace('\\', '/', $root . '/' . $relPath);
    $fullPathMatch = $fullPathPrefix . '%';

    // 1. Actualizar PRECIOS de todos los videos en la ruta (Jerárquico)
    $pdo->prepare("UPDATE videos SET price = ? WHERE videoUrl LIKE ? AND isLocal = 1")
        ->execute([$price, $fullPathMatch]);

    // 2. Identificar qué CATEGORÍAS están afectadas por esta ruta
    $stmtCats = $pdo->prepare("SELECT DISTINCT category FROM videos WHERE videoUrl LIKE ? AND isLocal = 1");
    $stmtCats->execute([$fullPathMatch]);
    $affectedCatNames = $stmtCats->fetchAll(PDO::FETCH_COLUMN);

    $baseFolderName = basename($relPath);
    if (!in_array($baseFolderName, $affectedCatNames)) {
        $affectedCatNames[] = $baseFolderName;
    }

    // 3. Actualizar el JSON de categorías para sincronizar precios y ordenamiento
    $categories = json_decode($settings['categories'] ?: '[]', true);
    $changed = false;

    foreach ($categories as &$cat) {
        $foundInAffected = false;
        foreach ($affectedCatNames as $affectedName) {
            if (strcasecmp($cat['name'], $affectedName) === 0) {
                $foundInAffected = true;
                break;
            }
        }

        if ($foundInAffected) {
            $cat['price'] = $price;
            $cat['sortOrder'] = $sortOrder;
            $changed = true;
        }
    }

    if ($changed) {
        $pdo->prepare("UPDATE system_settings SET categories = ? WHERE id = 1")
            ->execute([json_encode($categories)]);
    }

    respond(true, "Configuración aplicada recursivamente.");
}

function admin_update_category_price($pdo, $input) {
    $catId = $input['categoryId'];
    $newPrice = floatval($input['newPrice']);
    $syncVideos = !empty($input['syncVideos']);

    $stmtS = $pdo->query("SELECT categories FROM system_settings WHERE id = 1");
    $categories = json_decode($stmtS->fetchColumn() ?: '[]', true);

    $targetName = null;
    foreach ($categories as &$c) {
        if ($c['id'] === $catId) {
            $c['price'] = $newPrice;
            $targetName = $c['name'];
            break;
        }
    }

    $pdo->prepare("UPDATE system_settings SET categories = ? WHERE id = 1")->execute([json_encode($categories)]);

    if ($syncVideos && $targetName) {
        $pdo->prepare("UPDATE videos SET price = ? WHERE category = ? OR parent_category = ?")->execute([$newPrice, $targetName, $targetName]);
    }

    respond(true);
}

// --- TRANSCODE CORE FUNCTIONS ---

function admin_get_transcode_profiles($pdo) {
    $stmt = $pdo->query("SELECT * FROM transcode_profiles ORDER BY extension ASC");
    respond(true, $stmt->fetchAll());
}

function admin_save_transcode_profile($pdo, $input) {
    $ext = strtolower(trim($input['extension'] ?? ''));
    $args = trim($input['command_args'] ?? '');
    $desc = trim($input['description'] ?? 'Optimizado');

    if (!$ext || !$args) respond(false, null, "Extensión y comandos requeridos");

    $stmt = $pdo->prepare("REPLACE INTO transcode_profiles (extension, command_args, description) VALUES (?, ?, ?)");
    $stmt->execute([$ext, $args, $desc]);
    respond(true);
}

function admin_delete_transcode_profile($pdo, $ext) {
    $pdo->prepare("DELETE FROM transcode_profiles WHERE extension = ?")->execute([$ext]);
    respond(true);
}

function admin_transcode_scan_filters($pdo, $input) {
    $onlyNonMp4 = !empty($input['onlyNonMp4']);
    $mode = $input['mode'] ?? 'PREVIEW';

    $sql = "SELECT id, videoUrl FROM videos WHERE transcode_status NOT IN ('DONE', 'WAITING', 'PROCESSING')";
    if ($onlyNonMp4) {
        $sql .= " AND videoUrl NOT LIKE '%.mp4'";
    }

    $stmt = $pdo->query($sql);
    $matches = $stmt->fetchAll();

    if ($mode === 'EXECUTE' && count($matches) > 0) {
        $ids = array_column($matches, 'id');
        $placeholders = implode(',', array_fill(0, count($ids), '?'));
        $pdo->prepare("UPDATE videos SET transcode_status = 'WAITING' WHERE id IN ($placeholders)")->execute($ids);
    }

    respond(true, ['count' => count($matches)]);
}

/**
 * Función interna de ejecución de transcodificación (Mantenible)
 */
function _admin_perform_transcode_single($pdo, $video, $bins) {
    $realPath = resolve_video_path($video['videoUrl']);
    if (!$realPath || !file_exists($realPath)) {
        $pdo->prepare("UPDATE videos SET transcode_status = 'FAILED', reason = 'Archivo no accesible' WHERE id = ?")->execute([$video['id']]);
        return false;
    }

    $ffmpeg = $bins['ffmpeg'];
    $ext = strtolower(pathinfo($realPath, PATHINFO_EXTENSION));

    $stmtP = $pdo->prepare("SELECT command_args FROM transcode_profiles WHERE extension = ?");
    $stmtP->execute([$ext]);
    $args = $stmtP->fetchColumn();

    $isAudio = ($ext === 'mp3' || $ext === 'wav' || $ext === 'aac' || $ext === 'm4a');

    if (!$args) {
        if ($isAudio) {
            $args = "-c:a aac -b:a 192k -vn";
        } else {
            $args = "-c:v libx264 -preset ultrafast -pix_fmt yuv420p -c:a aac";
        }
    } else {
        if (strpos($args, '-pix_fmt') === false && !$isAudio) {
            $args .= " -pix_fmt yuv420p";
        }
    }

    $targetDir = __DIR__ . '/uploads/videos/';
    if (!is_dir($targetDir)) mkdir($targetDir, 0777, true);

    $tempFile = $targetDir . 'trans_' . $video['id'] . '.mp4';
    $logFile = __DIR__ . '/transcode_log.txt';

    $cmd = "$ffmpeg -y -i " . escapeshellarg($realPath) . " $args " . escapeshellarg($tempFile) . " 2>> " . escapeshellarg($logFile);

    $pdo->prepare("UPDATE videos SET transcode_status = 'PROCESSING' WHERE id = ?")->execute([$video['id']]);
    exec($cmd, $output, $returnCode);

    if ($returnCode === 0 && file_exists($tempFile)) {
        $newWebPath = 'uploads/videos/' . $video['id'] . '.mp4';
        rename($tempFile, __DIR__ . '/' . $newWebPath);
        $pdo->prepare("UPDATE videos SET videoUrl = ?, transcode_status = 'DONE' WHERE id = ?")->execute([$newWebPath, $video['id']]);
        return true;
    } else {
        $pdo->prepare("UPDATE videos SET transcode_status = 'FAILED', reason = 'FFmpeg Error Code $returnCode' WHERE id = ?")->execute([$video['id']]);
        return false;
    }
}

function admin_process_next_transcode($pdo) {
    $check = shell_exec('pgrep ffmpeg');
    if (!empty($check)) {
        respond(false, null, "FFmpeg ya está en ejecución en el sistema");
    }

    $stmt = $pdo->query("SELECT * FROM videos WHERE transcode_status = 'WAITING' ORDER BY createdAt ASC LIMIT 1");
    $video = $stmt->fetch();

    if (!$video) respond(false, null, "Sin videos en espera");

    $bins = get_ffmpeg_binaries($pdo);
    $res = _admin_perform_transcode_single($pdo, $video, $bins);

    if ($res) respond(true, "Conversión terminada");
    else respond(false, null, "La conversión falló. Revisa el log.");
}

function admin_retry_failed_transcodes($pdo) {
    $pdo->query("UPDATE videos SET transcode_status = 'WAITING' WHERE transcode_status = 'FAILED'");
    respond(true);
}

function admin_clear_transcode_queue($pdo) {
    $pdo->query("UPDATE videos SET transcode_status = 'NONE' WHERE transcode_status IN ('WAITING', 'FAILED')");
    respond(true);
}

function admin_remove_from_queue($pdo, $id) {
    $pdo->prepare("UPDATE videos SET transcode_status = 'NONE' WHERE id = ?")->execute([$id]);
    respond(true);
}

function admin_skip_transcode($pdo, $id) {
    $pdo->prepare("UPDATE videos SET transcode_status = 'DONE' WHERE id = ?")->execute([$id]);
    respond(true);
}

function get_real_stats($pdo) {
    $from = $_GET['from'] ?? (time() - (30 * 86400));
    $to = $_GET['to'] ?? time();

    $userCount = $pdo->query("SELECT COUNT(*) FROM users")->fetchColumn() ?: 1;

    $stmtInflow = $pdo->prepare("SELECT SUM(amount) as total_cash_in, COUNT(*) as total_cash_tx FROM transactions WHERE (timestamp BETWEEN ? AND ?) AND isExternal = 1");
    $stmtInflow->execute([$from, $to]);
    $inflow = $stmtInflow->fetch();

    $stmtVolume = $pdo->prepare("SELECT SUM(amount) as total_volume, SUM(adminFee) as total_commissions FROM transactions WHERE (timestamp BETWEEN ? AND ?) AND isExternal = 0");
    $stmtVolume->execute([$from, $to]);
    $volume = $stmtVolume->fetch();

    $stmtMix = $pdo->prepare("SELECT videoTitle as planName, COUNT(*) as qty FROM transactions WHERE type IN ('VIP', 'DEPOSIT') AND isExternal = 1 AND videoTitle IS NOT NULL AND timestamp BETWEEN ? AND ? GROUP BY videoTitle");
    $stmtMix->execute([$from, $to]);
    $planMix = $stmtMix->fetchAll(PDO::FETCH_KEY_PAIR) ?: [];

    $stmtD = $pdo->prepare("SELECT FROM_UNIXTIME(timestamp, '%Y-%m-%d') as date, SUM(CASE WHEN isExternal = 1 THEN amount ELSE 0 END) as cash_in, SUM(CASE WHEN isExternal = 0 THEN adminFee ELSE 0 END) as internal_rev FROM transactions WHERE timestamp BETWEEN ? AND ? GROUP BY date ORDER BY date ASC");
    $stmtD->execute([$from, $to]);
    $daily = $stmtD->fetchAll();

    $activeBuyers = $pdo->prepare("SELECT COUNT(DISTINCT buyerId) FROM transactions WHERE timestamp BETWEEN ? AND ? AND isExternal = 1");
    $activeBuyers->execute([$from, $to]);
    $pagadoresEfectivo = $activeBuyers->fetchColumn() ?: 0;

    respond(true, [
        'userCount' => (int)$userCount,
        'totalRevenue' => floatval($inflow['total_cash_in'] ?? 0),
        'internalRevenue' => floatval($volume['total_commissions'] ?? 0),
        'activeUsers' => (int)$pagadoresEfectivo,
        'planMix' => $planMix,
        'history' => [ 'daily' => $daily ],
        'averages' => [
            'conversion' => ($userCount > 0) ? round(($pagadoresEfectivo / $userCount) * 100, 2) : 0,
            'arpu' => ($pagadoresEfectivo > 0) ? round(floatval($inflow['total_cash_in']) / $pagadoresEfectivo, 2) : 0,
            'totalTx' => (int)$inflow['total_cash_tx']
        ]
    ]);
}

function admin_get_finance_requests($pdo) {
    $balance = $pdo->query("SELECT r.*, u.username FROM balance_requests r JOIN users u ON r.userId = u.id WHERE r.status = 'PENDING' ORDER BY r.createdAt DESC")->fetchAll();
    $vip = $pdo->query("SELECT r.*, u.username FROM vip_requests r JOIN users u ON r.userId = u.id WHERE r.status = 'PENDING' ORDER BY r.createdAt DESC")->fetchAll();
    $activeVip = $pdo->query("SELECT id, username, vipExpiry FROM users WHERE vipExpiry > UNIX_TIMESTAMP() ORDER BY vipExpiry ASC")->fetchAll();
    respond(true, ['balance' => $balance, 'vip' => $vip, 'activeVip' => $activeVip]);
}

function admin_handle_balance_request($pdo, $input) {
    $reqId = $input['reqId'] ?? ''; $status = $input['status'] ?? ''; 
    if (!$reqId || !in_array($status, ['APPROVED', 'REJECTED'])) respond(false, null, 'Datos inválidos');
    $pdo->beginTransaction();
    try {
        $stmt = $pdo->prepare("SELECT * FROM balance_requests WHERE id = ? FOR UPDATE"); $stmt->execute([$reqId]); $req = $stmt->fetch();
        if (!$req || $req['status'] !== 'PENDING') throw new Exception("Solicitud no válida");
        if ($status === 'APPROVED') {
            $pdo->prepare("UPDATE users SET balance = balance + ? WHERE id = ?")->execute([$req['amount'], $req['userId']]);
            $pdo->prepare("INSERT INTO transactions (id, buyerId, amount, type, timestamp, videoTitle, isExternal) VALUES (?, ?, ?, 'DEPOSIT', ?, 'Recarga Solicitada', 1)")->execute([uniqid('dep_'), $req['userId'], $req['amount'], time()]);
        }
        $pdo->prepare("UPDATE balance_requests SET status = ? WHERE id = ?")->execute([$status, $reqId]);
        $pdo->commit(); respond(true);
    } catch (Exception $e) { $pdo->rollBack(); respond(false, null, $e->getMessage()); }
}

function admin_handle_vip_request($pdo, $input) {
    $reqId = $input['reqId'] ?? ''; $status = $input['status'] ?? '';
    if (!$reqId || !in_array($status, ['APPROVED', 'REJECTED'])) respond(false, null, 'Datos inválidos');
    $pdo->beginTransaction();
    try {
        $stmt = $pdo->prepare("SELECT * FROM vip_requests WHERE id = ? FOR UPDATE"); $stmt->execute([$reqId]); $req = $stmt->fetch();
        if (!$req || $req['status'] !== 'PENDING') throw new Exception("No válida");
        if ($status === 'APPROVED') {
            $plan = json_decode($req['planSnapshot'], true); $userId = $req['userId'];
            $now = time();
            if ($plan['type'] === 'BALANCE') {
                $priceBase = floatval($plan['price']);
                $bonusPercent = floatval($plan['bonusPercent'] ?? 0);
                $bonusAmount = $priceBase * ($bonusPercent / 100);
                $totalCredit = $priceBase + $bonusAmount;
                $pdo->prepare("UPDATE users SET balance = balance + ? WHERE id = ?")->execute([$totalCredit, $userId]);
                $pdo->prepare("INSERT INTO transactions (id, buyerId, amount, type, timestamp, videoTitle, isExternal) VALUES (?, ?, ?, 'DEPOSIT', ?, ?, 1)")
                    ->execute([uniqid('tx_cash_'), $userId, $priceBase, $now, $plan['name']]);
                if ($bonusAmount > 0) {
                    $pdo->prepare("INSERT INTO transactions (id, buyerId, amount, type, timestamp, videoTitle, isExternal) VALUES (?, ?, ?, 'DEPOSIT', ?, ?, 0)")
                        ->execute([uniqid('tx_bonus_'), $userId, $bonusAmount, $now, "Bono: " . $plan['name']]);
                }
            } else {
                $days = intval($plan['durationDays'] ?? 30);
                $stmtU = $pdo->prepare("SELECT vipExpiry FROM users WHERE id = ?"); $stmtU->execute([$userId]);
                $current = intval($stmtU->fetchColumn());
                $newExpiry = max($current, $now) + ($days * 86400);
                $pdo->prepare("UPDATE users SET vipExpiry = ? WHERE id = ?")->execute([$newExpiry, $userId]);
                $pdo->prepare("INSERT INTO transactions (id, buyerId, amount, type, timestamp, videoTitle, isExternal) VALUES (?, ?, ?, 'VIP', ?, ?, 1)")->execute([uniqid('tx_v_'), $userId, $plan['price'], $now, $plan['name']]);
            }
        }
        $pdo->prepare("UPDATE vip_requests SET status = ? WHERE id = ?")->execute([$status, $reqId]);
        $pdo->commit(); respond(true);
    } catch (Exception $e) { $pdo->rollBack(); respond(false, null, $e->getMessage()); }
}

function admin_get_global_transactions($pdo) {
    $stmt = $pdo->query("SELECT t.*, u.username as buyerName FROM transactions t LEFT JOIN users u ON t.buyerId = u.id ORDER BY t.timestamp DESC LIMIT 500");
    $history = $stmt->fetchAll();
    $rev = $pdo->query("SELECT SUM(adminFee) FROM transactions")->fetchColumn() ?: 0;
    respond(true, ['history' => $history, 'systemRevenue' => floatval($rev)]);
}

function admin_repair_db($pdo, $input) {
    require_once 'functions_schema.php';
    $schema = getAppSchema();
    foreach ($schema as $table => $def) { syncTable($pdo, $table, $def); }
    respond(true, "Esquema sincronizado");
}

function admin_cleanup_files($pdo) {
    $dbFiles = [];
    $videos = $pdo->query("SELECT videoUrl, thumbnailUrl FROM videos")->fetchAll();
    foreach ($videos as $v) {
        if ($p1 = resolve_video_path($v['videoUrl'])) $dbFiles[] = $p1;
        if ($p2 = resolve_video_path($v['thumbnailUrl'])) $dbFiles[] = $p2;
    }
    $avatars = $pdo->query("SELECT avatarUrl FROM users WHERE avatarUrl IS NOT NULL")->fetchAll(PDO::FETCH_COLUMN);
    foreach ($avatars as $url) {
        if ($p = resolve_video_path($url)) $dbFiles[] = $p;
    }
    $market = $pdo->query("SELECT images FROM marketplace_items")->fetchAll(PDO::FETCH_COLUMN);
    foreach ($market as $json) {
        $imgs = json_decode($json, true);
        if (is_array($imgs)) {
            foreach ($imgs as $url) {
                if ($p = resolve_video_path($url)) $dbFiles[] = $p;
            }
        }
    }
    $proofs = $pdo->query("SELECT proofImageUrl FROM vip_requests WHERE proofImageUrl IS NOT NULL")->fetchAll(PDO::FETCH_COLUMN);
    foreach ($proofs as $url) {
        if ($p = resolve_video_path($url)) $dbFiles[] = $p;
    }
    $dbFiles = array_unique($dbFiles);

    // LISTA BLANCA: Archivos estáticos del sistema
    $whitelist = [
        realpath(__DIR__ . '/uploads/thumbnails/default.jpg'),
        realpath(__DIR__ . '/uploads/thumbnails/defaultaudio.jpg'),
        realpath(__DIR__ . '/uploads/avatars/default.jpg')
    ];

    $dirs = ['uploads/videos', 'uploads/thumbnails', 'uploads/avatars', 'uploads/market', 'uploads/proofs'];
    $deleted = 0;
    foreach ($dirs as $d) {
        $path = __DIR__ . '/' . $d;
        if (!is_dir($path)) continue;
        $files = scandir($path);
        foreach ($files as $f) {
            if ($f === '.' || $f === '..') continue;
            $full = realpath($path . '/' . $f);

            // Si el archivo no está en uso y no está en la whitelist, se borra
            if ($full && is_file($full) && !in_array($full, $dbFiles) && !in_array($full, $whitelist)) { 
                @unlink($full); 
                $deleted++; 
            }
        }
    }
    respond(true, ['videos' => $deleted]);
}

function admin_get_local_stats($pdo) {
    $stmt = $pdo->query("SELECT libraryPaths, localLibraryPath FROM system_settings WHERE id = 1");
    $sets = $stmt->fetch();
    $paths = json_decode($sets['libraryPaths'] ?: '[]', true);
    if ($sets['localLibraryPath']) $paths[] = $sets['localLibraryPath'];
    $volumes = [];
    $stmtCount = $pdo->prepare("SELECT COUNT(*) FROM videos WHERE videoUrl LIKE ?");
    foreach (array_unique($paths) as $p) {
        if (is_dir($p)) {
            $total = @disk_total_space($p); $free = @disk_free_space($p);
            $stmtCount->execute([$p . '%']);
            $count = $stmtCount->fetchColumn();
            $volumes[] = [
                'name' => basename($p) ?: 'Root',
                'path' => $p,
                'total' => round($total / 1073741824, 1),
                'free' => round($free / 1073741824, 1),
                'video_count' => $count
            ];
        }
    }
    $catStats = $pdo->query("SELECT category, COUNT(*) as count FROM videos GROUP BY category ORDER BY count DESC")->fetchAll();
    $dbVids = $pdo->query("SELECT COUNT(*) FROM videos")->fetchColumn();
    respond(true, ['volumes' => $volumes, 'db_videos' => (int)$dbVids, 'category_stats' => $catStats]);
}

function admin_get_logs() {
    $file = __DIR__ . '/debug_log.txt';
    if (!file_exists($file)) respond(true, []);
    $lines = file($file);
    respond(true, array_reverse(array_slice($lines, -100)));
}

function admin_clear_logs() {
    @file_put_contents(__DIR__ . '/debug_log.txt', '');
    respond(true);
}

function admin_get_requests($pdo, $status) {
    $sql = "SELECT r.*, u.username FROM requests r LEFT JOIN users u ON r.userId = u.id";
    if ($status !== 'ALL') { $sql .= " WHERE r.status = :s"; }
    $sql .= " ORDER BY r.createdAt DESC";
    $stmt = $pdo->prepare($sql);
    if ($status !== 'ALL') $stmt->execute(['s' => $status]); else $stmt->execute();
    respond(true, $stmt->fetchAll());
}

function admin_delete_request($pdo, $input) {
    $pdo->prepare("DELETE FROM requests WHERE id = ?")->execute([$input['id']]);
    respond(true);
}

function admin_update_request_status($pdo, $input) {
    $pdo->prepare("UPDATE requests SET status = ? WHERE id = ?")->execute([$input['status'], $input['id']]);
    respond(true);
}

function admin_smart_cleaner_preview($pdo, $input) {
    $days = intval($input['minDays'] ?? 30);
    $views = intval($input['maxViews'] ?? 5);
    $minLikes = intval($input['minLikes'] ?? 0);
    $maxDislikes = intval($input['maxDislikes'] ?? 100);
    $limitGb = floatval($input['maxGbLimit'] ?? 10);
    $category = $input['category'] ?? 'ALL';
    $ts = time() - ($days * 86400);

    $sql = "SELECT id, title, views, likes, dislikes, videoUrl FROM videos WHERE createdAt < :ts AND views <= :views AND likes <= :likes AND dislikes <= :dislikes";
    $params = [':ts' => $ts, ':views' => $views, ':likes' => $minLikes, ':dislikes' => $maxDislikes];

    if ($category !== 'ALL') {
        $sql .= " AND (category = :cat OR parent_category = :cat)";
        $params[':cat'] = $category;
    }

    $sql .= " ORDER BY views ASC, likes ASC, dislikes DESC";

    $stmt = $pdo->prepare($sql);
    $stmt->execute($params);
    $allMatches = $stmt->fetchAll();

    $vids = [];
    $totalBytes = 0;
    $maxBytes = $limitGb * 1073741824;

    foreach ($allMatches as $v) {
        $realPath = resolve_video_path($v['videoUrl']);
        $size = ($realPath && file_exists($realPath)) ? filesize($realPath) : 0;

        if ($maxBytes > 0 && ($totalBytes + $size) > $maxBytes) continue;

        $totalBytes += $size;
        $v['size_fmt'] = round($size / 1048576, 1) . ' MB';
        $v['reason'] = "Bajo Rendimiento ({$v['views']}v / {$v['likes']}L)";
        $vids[] = $v;
    }

    respond(true, ['preview' => $vids, 'stats' => ['spaceReclaimed' => round($totalBytes / 1073741824, 2) . ' GB']]);
}

function admin_smart_cleaner_execute($pdo, $input) {
    $ids = $input['videoIds'] ?? [];
    $deleted = 0;
    foreach ($ids as $id) {
        $stmtV = $pdo->prepare("SELECT videoUrl, thumbnailUrl FROM videos WHERE id = ?");
        $stmtV->execute([$id]);
        $v = $stmtV->fetch();
        if ($v) {
            $realVideo = resolve_video_path($v['videoUrl']);
            $realThumb = resolve_video_path($v['thumbnailUrl']);
            if ($realVideo && file_exists($realVideo)) @unlink($realVideo);
            if ($realThumb && file_exists($realThumb) && !strpos($realThumb, 'default')) @unlink($realThumb);
            $pdo->prepare("DELETE FROM videos WHERE id = ?")->execute([$id]);
            $deleted++;
        }
    }
    respond(true, ['deleted' => $deleted]);
}

function admin_file_cleanup_preview($pdo, $type) {
    $vids = [];
    if ($type === 'ORPHAN_DB') {
        $all = $pdo->query("SELECT id, title, videoUrl, views FROM videos")->fetchAll();
        foreach ($all as $v) { 
            $realPath = resolve_video_path($v['videoUrl']);
            if (!$realPath || !file_exists($realPath)) { 
                $v['reason'] = 'Archivo No Encontrado (404)'; 
                $vids[] = $v; 
            } 
        }
    } elseif ($type === 'LOW_ROI') {
        $vids = $pdo->query("SELECT id, title, videoUrl, views FROM videos WHERE views < 2 AND createdAt < UNIX_TIMESTAMP() - 2592000 LIMIT 100")->fetchAll();
        foreach ($vids as &$v) { $v['reason'] = 'Inactividad prolongada'; }
    }
    respond(true, $vids);
}

function admin_organize_paquete($pdo, $input) {
    $simulate = $input['simulate'] ?? true;
    $plan = [];
    if ($simulate) {
        $plan[] = ['file' => 'Basura Detectada (Demo)', 'size' => '0MB', 'path' => '/'];
    }
    respond(true, ['plan' => $plan, 'cleaned' => 0]);
}

function admin_add_balance($pdo, $input) {
    $targetId = $input['userId'] ?? null;
    $amount = floatval($input['amount'] ?? 0);
    if (!$targetId || $amount <= 0) respond(false, null, 'Datos inválidos');
    $pdo->beginTransaction();
    try {
        $pdo->prepare("UPDATE users SET balance = balance + ? WHERE id = ?")->execute([$amount, $targetId]);
        $pdo->prepare("INSERT INTO transactions (id, buyerId, amount, type, timestamp, videoTitle, isExternal) VALUES (?, ?, ?, 'DEPOSIT', ?, 'Recarga Admin', 1)")->execute([uniqid('dep_'), $targetId, $amount, time()]);
        $pdo->commit();
        respond(true);
    } catch (Exception $e) { $pdo->rollBack(); respond(false, null, $e->getMessage()); }
}
?>