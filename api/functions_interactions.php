<?php
/**
 * INTERACCIONES - CORE FUNCTIONS V17.0 (Rich Notifications & Fixes)
 */

function interact_save_search($pdo, $input) {
    $term = trim($input['term'] ?? ''); if (strlen($term) < 2) respond(true);
    $pdo->prepare("INSERT INTO search_history (term, count, last_searched) VALUES (?, 1, ?) ON DUPLICATE KEY UPDATE count = count + 1, last_searched = ?")->execute([$term, time(), time()]);
    respond(true);
}

function interact_get_search_suggestions($pdo, $q, $limit = 5) {
    $limit = (int)$limit;
    $q = trim($q); if (empty($q)) respond(true, $pdo->query("SELECT term as label, 'HISTORY' as type FROM search_history ORDER BY count DESC LIMIT 6")->fetchAll());
    $stmt = $pdo->prepare("SELECT title as label, id, 'VIDEO' as type FROM videos WHERE title LIKE ? LIMIT $limit");
    $stmt->execute(["%$q%"]); respond(true, $stmt->fetchAll());
}

function send_direct_notification($pdo, $userId, $type, $text, $link, $avatarUrl = null, $metadata = null) {
    // PREVENIR DUPLICADOS: No enviar la misma notificación al mismo usuario si se envió hace menos de 60s
    $stmtCheck = $pdo->prepare("SELECT COUNT(*) FROM notifications WHERE userId = ? AND type = ? AND link = ? AND timestamp > ?");
    $stmtCheck->execute([$userId, $type, $link, time() - 60]);
    if ($stmtCheck->fetchColumn() > 0) return;

    $jsonMeta = is_array($metadata) ? json_encode($metadata) : $metadata;
    $pdo->prepare("INSERT INTO notifications (id, userId, type, text, link, isRead, timestamp, avatarUrl, metadata) VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?)")
        ->execute([uniqid('n_'), $userId, $type, $text, $link, time(), $avatarUrl, $jsonMeta]);
    
    // Intentar enviar notificación push
    try {
        send_push_notification($pdo, $userId, "Nueva notificación", $text, $link);
    } catch (Exception $e) {
        write_log("Push Error: " . $e->getMessage(), 'ERROR');
    }
}

function interact_notify_subscribers($pdo, $creatorId, $type, $text, $link, $imageOverride = null) {
    $stmt = $pdo->prepare("SELECT subscriberId FROM subscriptions WHERE creatorId = ?"); $stmt->execute([$creatorId]); $subs = $stmt->fetchAll(PDO::FETCH_COLUMN);
    $avatar = $imageOverride ?: $pdo->query("SELECT avatarUrl FROM users WHERE id = '$creatorId'")->fetchColumn();
    foreach ($subs as $subId) send_direct_notification($pdo, $subId, $type, $text, $link, $avatar);
}

function interact_submit_seller_verification($pdo, $input) {
    $pdo->prepare("INSERT INTO seller_verifications (id, userId, fullName, idNumber, address, mobile, status, createdAt) VALUES (?, ?, ?, ?, ?, ?, 'PENDING', ?)")->execute([uniqid('sv_'), $input['userId'], $input['fullName'], $input['idNumber'], $input['address'], $input['mobile'], time()]);
    respond(true);
}

function interact_has_purchased($pdo, $userId, $videoId) {
    $stmt = $pdo->prepare("SELECT COUNT(*) FROM transactions WHERE buyerId = ? AND videoId = ? AND type = 'PURCHASE'"); $stmt->execute([$userId, $videoId]);
    respond(true, ['hasPurchased' => $stmt->fetchColumn() > 0]);
}

function interact_purchase($pdo, $input) {
    $bid = $input['userId']; $vid = $input['videoId']; $pdo->beginTransaction();
    try {
        $v = $pdo->query("SELECT * FROM videos WHERE id = '$vid'")->fetch();
        $buyerName = $pdo->query("SELECT username FROM users WHERE id = '$bid'")->fetchColumn();
        $bal = $pdo->query("SELECT balance FROM users WHERE id = '$bid'")->fetchColumn();
        if ($bal < $v['price']) throw new Exception("Saldo insuficiente");
        $fee = $v['price'] * 0.20; $part = $v['price'] - $fee;
        $pdo->prepare("UPDATE users SET balance = balance - ? WHERE id = ?")->execute([$v['price'], $bid]);
        $pdo->prepare("UPDATE users SET balance = balance + ? WHERE id = ?")->execute([$part, $v['creatorId']]);
        $aid = $pdo->query("SELECT id FROM users WHERE role = 'ADMIN' LIMIT 1")->fetchColumn();
        if ($aid) $pdo->prepare("UPDATE users SET balance = balance + ? WHERE id = ?")->execute([$fee, $aid]);
        $pdo->prepare("INSERT INTO transactions (id, buyerId, creatorId, videoId, amount, adminFee, timestamp, type, videoTitle, isExternal) VALUES (?, ?, ?, ?, ?, ?, ?, 'PURCHASE', ?, 0)")->execute([uniqid('tx_'), $bid, $v['creatorId'], $vid, $v['price'], $fee, time(), $v['title']]);
        
        // NOTIFICACIÓN ENRIQUECIDA: Incluir miniatura del video en la venta
        send_direct_notification($pdo, $v['creatorId'], 'SALE', "@{$buyerName} compró: {$v['title']}", "/profile", $v['thumbnailUrl'], ['amount' => $v['price'], 'net' => $part]);
        
        $pdo->commit(); respond(true);
    } catch (Exception $e) { $pdo->rollBack(); respond(false, null, $e->getMessage()); }
}

function interact_purchase_vip_instant($pdo, $input) {
    $uid = $input['userId']; $plan = $input['plan']; $now = time();
    $pdo->beginTransaction();
    try {
        $bal = $pdo->query("SELECT balance FROM users WHERE id = '$uid'")->fetchColumn();
        if ($bal < $plan['price']) throw new Exception("Saldo insuficiente");
        $pdo->prepare("UPDATE users SET balance = balance - ? WHERE id = ?")->execute([$plan['price'], $uid]);
        $stmtU = $pdo->prepare("SELECT vipExpiry FROM users WHERE id = ?"); $stmtU->execute([$uid]); $curr = $stmtU->fetchColumn();
        $new = max($curr, $now) + ($plan['durationDays'] * 86400);
        $pdo->prepare("UPDATE users SET vipExpiry = ? WHERE id = ?")->execute([$new, $uid]);
        $pdo->prepare("INSERT INTO transactions (id, buyerId, amount, type, timestamp, videoTitle, isExternal) VALUES (?, ?, ?, 'VIP', ?, ?, 0)")->execute([uniqid('txv_'), $uid, $plan['price'], $now, $plan['name']]);
        $pdo->commit(); respond(true);
    } catch (Exception $e) { $pdo->rollBack(); respond(false, null, $e->getMessage()); }
}

function interact_rate($pdo, $input) {
    $uid = $input['userId']; $vid = $input['videoId']; $type = $input['type'];
    
    $stmt = $pdo->prepare("SELECT liked, disliked FROM interactions WHERE userId = ? AND videoId = ?");
    $stmt->execute([$uid, $vid]);
    $current = $stmt->fetch();
    
    $newLiked = ($type === 'like') ? 1 : 0;
    $newDisliked = ($type === 'dislike') ? 1 : 0;
    
    if ($current) {
        if (($type === 'like' && $current['liked'] == 1) || ($type === 'dislike' && $current['disliked'] == 1)) {
            $pdo->prepare("UPDATE interactions SET liked = 0, disliked = 0 WHERE userId = ? AND videoId = ?")->execute([$uid, $vid]);
            $resLiked = false;
            $resDisliked = false;
        } else {
            $pdo->prepare("UPDATE interactions SET liked = ?, disliked = ? WHERE userId = ? AND videoId = ?")->execute([$newLiked, $newDisliked, $uid, $vid]);
            $resLiked = ($newLiked === 1);
            $resDisliked = ($newDisliked === 1);
        }
    } else {
        $pdo->prepare("INSERT INTO interactions (userId, videoId, liked, disliked) VALUES (?, ?, ?, ?)")->execute([$uid, $vid, $newLiked, $newDisliked]);
        $resLiked = ($newLiked === 1);
        $resDisliked = ($newDisliked === 1);
    }
    
    $likes = $pdo->query("SELECT COUNT(*) FROM interactions WHERE videoId = '$vid' AND liked = 1")->fetchColumn();
    $dislikes = $pdo->query("SELECT COUNT(*) FROM interactions WHERE videoId = '$vid' AND disliked = 1")->fetchColumn();
    $pdo->prepare("UPDATE videos SET likes = ?, dislikes = ? WHERE id = ?")->execute([$likes, $dislikes, $vid]);
    
    $isWatched = (bool)$pdo->query("SELECT isWatched FROM interactions WHERE userId = '$uid' AND videoId = '$vid'")->fetchColumn();
    $isSkipped = (bool)$pdo->query("SELECT isSkipped FROM interactions WHERE userId = '$uid' AND videoId = '$vid'")->fetchColumn();
    
    respond(true, [
        'newLikeCount' => $likes, 
        'newDislikeCount' => $dislikes,
        'liked' => $resLiked,
        'disliked' => $resDisliked,
        'isWatched' => $isWatched,
        'isSkipped' => $isSkipped
    ]);
}

function interact_get($pdo, $userId, $videoId) {
    $stmt = $pdo->prepare("SELECT * FROM interactions WHERE userId = ? AND videoId = ?");
    $stmt->execute([$userId, $videoId]); $res = $stmt->fetch();
    if ($res) {
        $liked = $res['liked'] !== null && (int)$res['liked'] === 1;
        $disliked = $res['disliked'] !== null && (int)$res['disliked'] === 1;
        respond(true, [
            'liked' => $liked, 
            'disliked' => $disliked, 
            'isWatched' => (bool)$res['isWatched'],
            'isSkipped' => (bool)($res['isSkipped'] ?? false)
        ]);
    } else {
        respond(true, ['liked' => false, 'disliked' => false, 'isWatched' => false, 'isSkipped' => false]);
    }
}

function interact_get_activity($pdo, $userId) {
    $watched = $pdo->prepare("SELECT videoId FROM interactions WHERE userId = ? AND isWatched = 1"); $watched->execute([$userId]);
    $liked = $pdo->prepare("SELECT videoId FROM interactions WHERE userId = ? AND liked = 1"); $liked->execute([$userId]);
    $skipped = $pdo->prepare("SELECT videoId FROM interactions WHERE userId = ? AND isSkipped = 1"); $skipped->execute([$userId]);
    respond(true, [
        'watched' => $watched->fetchAll(PDO::FETCH_COLUMN), 
        'liked' => $liked->fetchAll(PDO::FETCH_COLUMN),
        'skipped' => $skipped->fetchAll(PDO::FETCH_COLUMN)
    ]);
}

function interact_mark_watched($pdo, $input) {
    $now = time();
    $pdo->prepare("INSERT INTO interactions (userId, videoId, isWatched, isSkipped, watchedAt) VALUES (?, ?, 1, 0, ?) ON DUPLICATE KEY UPDATE isWatched = 1, isSkipped = 0, watchedAt = ?")->execute([$input['userId'], $input['videoId'], $now, $now]);
    respond(true);
}

function interact_mark_skipped($pdo, $input) {
    // Solo marcar como saltado si NO ha sido visto antes
    $pdo->prepare("INSERT INTO interactions (userId, videoId, isSkipped) VALUES (?, ?, 1) ON DUPLICATE KEY UPDATE isSkipped = CASE WHEN isWatched = 1 THEN 0 ELSE 1 END")->execute([$input['userId'], $input['videoId']]);
    respond(true);
}

function interact_get_comments($pdo, $vid) {
    $stmt = $pdo->prepare("SELECT c.*, u.username, u.avatarUrl as userAvatarUrl FROM comments c JOIN users u ON c.userId = u.id WHERE c.videoId = ? ORDER BY c.timestamp DESC");
    $stmt->execute([$vid]); respond(true, $stmt->fetchAll());
}

function interact_add_comment($pdo, $input) {
    $id = uniqid('c_'); $now = time();
    $pdo->prepare("INSERT INTO comments (id, videoId, userId, text, timestamp) VALUES (?, ?, ?, ?, ?)")->execute([$id, $input['videoId'], $input['userId'], $input['text'], $now]);
    
    // Return full comment data for immediate UI update
    $stmt = $pdo->prepare("SELECT c.*, u.username, u.avatarUrl as userAvatarUrl FROM comments c JOIN users u ON c.userId = u.id WHERE c.id = ?");
    $stmt->execute([$id]);
    $comment = $stmt->fetch();
    
    respond(true, $comment);
}

function interact_toggle_subscribe($pdo, $input) {
    $uid = $input['userId']; $cid = $input['creatorId'];
    $check = $pdo->prepare("SELECT COUNT(*) FROM subscriptions WHERE subscriberId = ? AND creatorId = ?"); $check->execute([$uid, $cid]);
    if ($check->fetchColumn() > 0) { $pdo->prepare("DELETE FROM subscriptions WHERE subscriberId = ? AND creatorId = ?")->execute([$uid, $cid]); $sub = false; }
    else { $pdo->prepare("INSERT INTO subscriptions (subscriberId, creatorId, createdAt) VALUES (?, ?, ?)")->execute([$uid, $cid, time()]); $sub = true; }
    respond(true, ['isSubscribed' => $sub]);
}

function interact_check_subscription($pdo, $uid, $cid) {
    $stmt = $pdo->prepare("SELECT COUNT(*) FROM subscriptions WHERE subscriberId = ? AND creatorId = ?"); $stmt->execute([$uid, $cid]);
    respond(true, ['isSubscribed' => $stmt->fetchColumn() > 0]);
}

function interact_get_subscriptions($pdo, $userId) {
    $stmt = $pdo->prepare("SELECT creatorId FROM subscriptions WHERE subscriberId = ?");
    $stmt->execute([$userId]); respond(true, $stmt->fetchAll(PDO::FETCH_COLUMN));
}

function interact_get_mutual_friends($pdo, $userId, $targetId) {
    if (!$userId || !$targetId) respond(true, []);
    
    // Mutual friends = Users that both $userId and $targetId follow
    $sql = "SELECT u.id, u.username, u.avatarUrl 
            FROM users u
            WHERE u.id IN (SELECT creatorId FROM subscriptions WHERE subscriberId = ?)
            AND u.id IN (SELECT creatorId FROM subscriptions WHERE subscriberId = ?)
            LIMIT 10";
    
    $stmt = $pdo->prepare($sql);
    $stmt->execute([$userId, $targetId]);
    $mutuals = $stmt->fetchAll();
    
    foreach ($mutuals as &$m) {
        $m['avatarUrl'] = fix_url($m['avatarUrl']);
    }
    
    respond(true, $mutuals);
}

function interact_get_notifications($pdo, $uid, $limit = 30) {
    $limit = (int)$limit;
    $stmt = $pdo->prepare("SELECT * FROM notifications WHERE userId = ? ORDER BY timestamp DESC LIMIT $limit"); $stmt->execute([$uid]);
    $notifs = $stmt->fetchAll();
    
    // Default avatar fallback
    $defaultAvatar = null;
    
    foreach ($notifs as &$n) {
        $n['avatarUrl'] = fix_url($n['avatarUrl']);
        
        // Verificar si la miniatura existe (si es local)
        if ($n['avatarUrl'] && strpos($n['avatarUrl'], '/api/uploads/') === 0) {
            $localPath = __DIR__ . '/' . substr($n['avatarUrl'], 5);
            if (!file_exists($localPath)) {
                if (!$defaultAvatar) {
                    $defaultAvatar = $pdo->query("SELECT defaultAvatar FROM system_settings WHERE id = 1")->fetchColumn();
                }
                $n['avatarUrl'] = fix_url($defaultAvatar);
            }
        }
        
        if ($n['metadata']) {
            $decoded = json_decode($n['metadata'], true);
            $n['metadata'] = $decoded ?: $n['metadata'];
        }
    }
    respond(true, $notifs);
}

function interact_get_unread_notifications($pdo, $uid) {
    $stmt = $pdo->prepare("SELECT * FROM notifications WHERE userId = ? AND isRead = 0 ORDER BY timestamp DESC LIMIT 10");
    $stmt->execute([$uid]);
    $notifs = $stmt->fetchAll();
    foreach ($notifs as &$n) {
        $n['avatarUrl'] = fix_url($n['avatarUrl']);
        if ($n['metadata']) {
            $decoded = json_decode($n['metadata'], true);
            $n['metadata'] = $decoded ?: $n['metadata'];
        }
    }
    respond(true, $notifs);
}

function interact_get_unread_count($pdo, $uid) {
    $stmt = $pdo->prepare("SELECT COUNT(*) FROM notifications WHERE userId = ? AND isRead = 0");
    $stmt->execute([$uid]);
    respond(true, ['count' => (int)$stmt->fetchColumn()]);
}

function interact_mark_notification_read($pdo, $input) {
    $pdo->prepare("UPDATE notifications SET isRead = 1 WHERE id = ?")->execute([$input['id']]);
    respond(true);
}

function interact_mark_all_notifications_read($pdo, $input) {
    $pdo->prepare("UPDATE notifications SET isRead = 1 WHERE userId = ?")->execute([$input['userId']]);
    respond(true);
}

function interact_get_transactions($pdo, $userId) {
    $stmt = $pdo->prepare("SELECT * FROM transactions WHERE buyerId = ? OR creatorId = ? ORDER BY timestamp DESC LIMIT 50");
    $stmt->execute([$userId, $userId]); respond(true, $stmt->fetchAll());
}

function interact_share_video($pdo, $input) {
    if (!$pdo) respond(false, null, "Database connection not found");
    $sid = $input['senderId']; $term = $input['targetUsername']; $vid = $input['videoId'];
    if (!$sid || !$term || !$vid) respond(false, null, "Faltan parámetros");
    
    $tid = $pdo->query("SELECT id FROM users WHERE username = '$term'")->fetchColumn();
    if (!$tid) respond(false, null, "Destinatario no existe");
    $u = $pdo->query("SELECT username FROM users WHERE id = '$sid'")->fetch();
    $v = $pdo->query("SELECT id, title, thumbnailUrl, category, is_audio FROM videos WHERE id = '$vid'")->fetch();
    
    if (!$v) respond(false, null, "Video no encontrado");

    // Enviar notificación instantánea
    send_direct_notification($pdo, $tid, 'SYSTEM', "@{$u['username']} te recomendó un video", "/watch/{$vid}", $v['thumbnailUrl'], ['videoTitle' => $v['title']]);
    
    // Compartir en chat (Insertar mensaje)
    $msgId = uniqid('MS');
    $timestamp = time();
    $text = "He compartido un video contigo: " . $v['title'];
    
    $isAudio = (int)$v['is_audio'] === 1;
    $mediaType = $isAudio ? 'AUDIO' : 'VIDEO';
    $mediaCol = $isAudio ? 'audioUrl' : 'videoUrl';
    
    // Usar la URL que el frontend pueda interpretar para el streamer
    $streamUrl = "/api/index.php?action=stream&id=" . $vid;
    
    $stmt = $pdo->prepare("INSERT INTO messages (id, senderId, receiverId, text, $mediaCol, videoId, mediaType, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
    $stmt->execute([$msgId, $sid, $tid, $text, $streamUrl, $vid, $mediaType, $timestamp]);
    
    respond(true);
}

function interact_get_video_likers($pdo, $videoId, $userId = null) {
    if ($userId) {
        // Primero intentar obtener alguien a quien el usuario sigue
        $stmt = $pdo->prepare("SELECT u.username, u.avatarUrl FROM interactions i JOIN users u ON i.userId = u.id JOIN subscriptions s ON s.creatorId = u.id WHERE i.videoId = ? AND i.liked = 1 AND s.subscriberId = ? ORDER BY RAND() LIMIT 1");
        $stmt->execute([$videoId, $userId]);
        $followedLiker = $stmt->fetch(PDO::FETCH_ASSOC);
        
        if ($followedLiker) {
            respond(true, [$followedLiker]);
            return;
        }
    }
    
    // Si no hay seguidos o no se pasó userId, obtener cualquier liker aleatorio
    $stmt = $pdo->prepare("SELECT u.username, u.avatarUrl FROM interactions i JOIN users u ON i.userId = u.id WHERE i.videoId = ? AND i.liked = 1 ORDER BY RAND() LIMIT 1");
    $stmt->execute([$videoId]);
    $anyLiker = $stmt->fetch(PDO::FETCH_ASSOC);
    respond(true, $anyLiker ? [$anyLiker] : []);
}

function interact_get_user_followers($pdo, $userId) {
    $stmt = $pdo->prepare("SELECT u.id, u.username, u.avatarUrl FROM subscriptions s JOIN users u ON s.subscriberId = u.id WHERE s.creatorId = ?");
    $stmt->execute([$userId]);
    respond(true, $stmt->fetchAll(PDO::FETCH_ASSOC));
}

function interact_transfer_balance($pdo, $input) {
    $sid = $input['userId']; $term = $input['targetUsername']; $amt = floatval($input['amount']); $pdo->beginTransaction();
    try {
        $sBal = $pdo->query("SELECT balance FROM users WHERE id = '$sid'")->fetchColumn(); if ($sBal < $amt) throw new Exception("Saldo insuficiente");
        $tid = $pdo->query("SELECT id FROM users WHERE username = '$term'")->fetchColumn(); if (!$tid) throw new Exception("Usuario no encontrado");
        $senderName = $pdo->query("SELECT username FROM users WHERE id = '$sid'")->fetchColumn();
        
        $pdo->prepare("UPDATE users SET balance = balance - ? WHERE id = ?")->execute([$amt, $sid]);
        $pdo->prepare("UPDATE users SET balance = balance + ? WHERE id = ?")->execute([$amt, $tid]);
        
        // NOTIFICACIÓN: Avisar al receptor sobre el saldo recibido
        send_direct_notification($pdo, $tid, 'SYSTEM', "Has recibido {$amt} $ de @{$senderName}", "/profile");
        
        $pdo->commit(); respond(true);
    } catch (Exception $e) { $pdo->rollBack(); respond(false, null, $e->getMessage()); }
}

function interact_subscribe_push($pdo, $input) {
    $uid = $input['userId'];
    $sub = $input['subscription']; // { endpoint, keys: { p256dh, auth } }
    
    if (empty($sub['endpoint'])) respond(false, null, "Endpoint requerido");
    
    $pdo->prepare("INSERT INTO push_subscriptions (endpoint, userId, p256dh, auth, createdAt) VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE userId = ?, p256dh = ?, auth = ?")
        ->execute([
            $sub['endpoint'], 
            $uid, 
            $sub['keys']['p256dh'], 
            $sub['keys']['auth'], 
            time(),
            $uid,
            $sub['keys']['p256dh'],
            $sub['keys']['auth']
        ]);
    respond(true);
}

function interact_unsubscribe_push($pdo, $input) {
    $endpoint = $input['endpoint'];
    $pdo->prepare("DELETE FROM push_subscriptions WHERE endpoint = ?")->execute([$endpoint]);
    respond(true);
}

function send_push_notification($pdo, $userId, $title, $body, $url = '/') {
    if (file_exists(__DIR__ . '/web_push.php')) {
        require_once __DIR__ . '/web_push.php';
        return send_web_push($pdo, $userId, $title, $body, $url);
    }
    return ['sent' => 0, 'failed' => 0];
}

function interact_test_push($pdo, $input) {
    $uid = $input['userId'];
    if (file_exists(__DIR__ . '/web_push.php')) {
        require_once __DIR__ . '/web_push.php';
        $res = send_web_push($pdo, $uid, "Prueba de StreamPay", "¡Hola! Las notificaciones push están funcionando correctamente.", "/profile");
        respond(true, $res);
    }
    respond(false, null, "Módulo de Push no disponible");
}

function interact_generate_vapid_keys($pdo) {
    if (file_exists(__DIR__ . '/web_push.php')) {
        require_once __DIR__ . '/web_push.php';
        $keys = generate_vapid_keys($pdo);
        respond(true, $keys);
    }
    respond(false, null, "Módulo de Push no disponible");
}

function interact_request_content($pdo, $input) {
    $pdo->prepare("INSERT INTO requests (id, userId, query, status, createdAt, isVip) VALUES (?, ?, ?, 'PENDING', ?, ?)")
        ->execute([uniqid('req_'), $input['userId'], $input['query'], time(), $input['isVip'] ? 1 : 0]);
    respond(true);
}

function interact_submit_balance_request($pdo, $input) {
    $uid = $input['userId'];
    $amt = floatval($input['amount']);
    if ($amt <= 0) respond(false, null, "Monto inválido");
    
    $pdo->prepare("INSERT INTO balance_requests (id, userId, amount, status, createdAt) VALUES (?, ?, ?, 'PENDING', ?)")
        ->execute([uniqid('br_'), $uid, $amt, time()]);
    
    send_direct_notification($pdo, $uid, 'SYSTEM', "Tu solicitud de recarga de \${$amt} ha sido recibida y está en espera de revisión.", "/wallet");
    respond(true);
}

function interact_get_history($pdo, $userId) {
    $sql = "SELECT v.*, u.username as creatorName, u.avatarUrl as creatorAvatarUrl, i.watchedAt 
            FROM interactions i 
            JOIN videos v ON i.videoId = v.id 
            LEFT JOIN users u ON v.creatorId = u.id 
            WHERE i.userId = ? AND i.isWatched = 1 AND v.is_private = 0 
            ORDER BY i.watchedAt DESC 
            LIMIT 50";
    $stmt = $pdo->prepare($sql);
    $stmt->execute([$userId]);
    $rows = $stmt->fetchAll();
    
    if (file_exists('functions_videos.php')) {
        require_once 'functions_videos.php';
        video_process_rows($rows);
    }
    respond(true, $rows);
}

function interact_get_chats($pdo, $userId) {
    // Obtener lista de usuarios con los que se ha chateado
    $sql = "SELECT DISTINCT 
                CASE WHEN senderId = ? THEN receiverId ELSE senderId END as otherId 
            FROM messages 
            WHERE senderId = ? OR receiverId = ? 
            ORDER BY timestamp DESC";
    $stmt = $pdo->prepare($sql);
    $stmt->execute([$userId, $userId, $userId]);
    $userIds = $stmt->fetchAll(PDO::FETCH_COLUMN);
    
    $chats = [];
    foreach ($userIds as $otherId) {
        $stmtU = $pdo->prepare("SELECT id, username, avatarUrl, lastActive FROM users WHERE id = ?");
        $stmtU->execute([$otherId]);
        $otherUser = $stmtU->fetch();
        if (!$otherUser) continue;
        
        // Último mensaje
        $stmtM = $pdo->prepare("SELECT * FROM messages WHERE (senderId = ? AND receiverId = ?) OR (senderId = ? AND receiverId = ?) ORDER BY timestamp DESC LIMIT 1");
        $stmtM->execute([$userId, $otherId, $otherId, $userId]);
        $lastMsg = $stmtM->fetch();
        
        // No leídos
        $stmtUnread = $pdo->prepare("SELECT COUNT(*) FROM messages WHERE senderId = ? AND receiverId = ? AND isRead = 0");
        $stmtUnread->execute([$otherId, $userId]);
        $unreadCount = (int)$stmtUnread->fetchColumn();
        
        $otherUser['avatarUrl'] = fix_url($otherUser['avatarUrl']);
        $chats[] = [
            'user' => $otherUser,
            'lastMessage' => $lastMsg,
            'unreadCount' => $unreadCount
        ];
    }
    
    respond(true, $chats);
}

function interact_mark_delivered($pdo, $input) {
    $userId = $input['userId'];
    $otherId = $input['otherId'];
    $pdo->prepare("UPDATE messages SET isDelivered = 1 WHERE senderId = ? AND receiverId = ? AND isDelivered = 0")
        ->execute([$otherId, $userId]);
    respond(true);
}

function interact_get_messages($pdo, $input) {
    $userId = $input['userId'] ?? '';
    $otherId = $input['otherId'] ?? '';
    $limit = isset($input['limit']) ? (int)$input['limit'] : 50;
    $offset = isset($input['offset']) ? (int)$input['offset'] : 0;
    
    if (!$userId || !$otherId) respond(false, null, "Faltan IDs");

    // Marcar como LEÍDOS (lo que implica entregados) los mensajes ENVIADOS POR EL OTRO al USUARIO ACTUAL
    // Esto se hace solo cuando se abre el chat (al llamar a get_messages)
    $pdo->prepare("UPDATE messages SET isRead = 1, isDelivered = 1 WHERE senderId = ? AND receiverId = ? AND isRead = 0")->execute([$otherId, $userId]);
    
    // Para paginación inversa (traer los últimos), traemos ordenados por timestamp DESC
    // El frontend luego puede invertirlos para mostrar en orden cronológico
    $sql = "SELECT * FROM messages 
            WHERE (senderId = ? AND receiverId = ?) OR (senderId = ? AND receiverId = ?) 
            ORDER BY timestamp DESC
            LIMIT ? OFFSET ?";
            
    $stmt = $pdo->prepare($sql);
    $stmt->bindParam(1, $userId);
    $stmt->bindParam(2, $otherId);
    $stmt->bindParam(3, $otherId);
    $stmt->bindParam(4, $userId);
    $stmt->bindParam(5, $limit, PDO::PARAM_INT);
    $stmt->bindParam(6, $offset, PDO::PARAM_INT);
    $stmt->execute();
    
    $messages = $stmt->fetchAll();
    
    // Los devolvemos en orden ASC para el frontend (más fácil de manejar)
    $messages = array_reverse($messages);
    
    foreach ($messages as &$m) {
        if ($m['imageUrl']) $m['imageUrl'] = fix_url($m['imageUrl']);
        if ($m['videoUrl']) $m['videoUrl'] = fix_url($m['videoUrl']);
        if ($m['audioUrl']) $m['audioUrl'] = fix_url($m['audioUrl']);
        if ($m['fileUrl']) $m['fileUrl'] = fix_url($m['fileUrl']);
    }
    
    respond(true, $messages);
}

function interact_send_message($pdo, $input) {
    $senderId = $input['userId'];
    $receiverId = $input['receiverId'];
    $text = $input['text'] ?? '';
    $imageUrl = $input['imageUrl'] ?? null;
    $videoUrl = $input['videoUrl'] ?? null;
    $audioUrl = $input['audioUrl'] ?? null;
    $fileUrl = $input['fileUrl'] ?? null;
    $videoId = $input['videoId'] ?? null;
    $mediaType = $input['mediaType'] ?? 'TEXT';
    $timestamp = isset($input['timestamp']) ? (int)$input['timestamp'] : time();

    $id = uniqid('msg_');
    
    if (empty($text) && empty($imageUrl) && empty($videoUrl) && empty($audioUrl) && empty($fileUrl)) {
        respond(false, null, "Mensaje vacío");
    }
    
    $pdo->prepare("INSERT INTO messages (id, senderId, receiverId, text, imageUrl, videoUrl, audioUrl, fileUrl, videoId, mediaType, isRead, isDelivered, timestamp) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?)")
        ->execute([$id, $senderId, $receiverId, $text, $imageUrl, $videoUrl, $audioUrl, $fileUrl, $videoId, $mediaType, $timestamp]);
        
    respond(true, [
        'id' => $id,
        'senderId' => $senderId,
        'receiverId' => $receiverId,
        'text' => $text,
        'imageUrl' => $imageUrl ? fix_url($imageUrl) : null,
        'videoUrl' => $videoUrl ? fix_url($videoUrl) : null,
        'audioUrl' => $audioUrl ? fix_url($audioUrl) : null,
        'fileUrl' => $fileUrl ? fix_url($fileUrl) : null,
        'videoId' => $videoId,
        'mediaType' => $mediaType,
        'timestamp' => $timestamp,
        'isRead' => 0,
        'isDelivered' => 0
    ]);
}
