<?php
/**
 * INTERACCIONES - CORE FUNCTIONS V17.0 (Rich Notifications & Fixes)
 */

function interact_save_search($pdo, $input) {
    $term = trim($input['term'] ?? ''); if (strlen($term) < 2) respond(true);
    $pdo->prepare("INSERT INTO search_history (term, count, last_searched) VALUES (?, 1, ?) ON DUPLICATE KEY UPDATE count = count + 1, last_searched = ?")->execute([$term, time(), time()]);
    respond(true);
}

function interact_get_search_suggestions($pdo, $q) {
    $q = trim($q); if (empty($q)) respond(true, $pdo->query("SELECT term as label, 'HISTORY' as type FROM search_history ORDER BY count DESC LIMIT 6")->fetchAll());
    $stmt = $pdo->prepare("SELECT title as label, id, 'VIDEO' as type FROM videos WHERE title LIKE ? LIMIT 5");
    $stmt->execute(["%$q%"]); respond(true, $stmt->fetchAll());
}

function send_direct_notification($pdo, $userId, $type, $text, $link, $avatarUrl = null, $metadata = null) {
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
    $pdo->prepare("INSERT INTO interactions (userId, videoId, isWatched, isSkipped) VALUES (?, ?, 1, 0) ON DUPLICATE KEY UPDATE isWatched = 1, isSkipped = 0")->execute([$input['userId'], $input['videoId']]);
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

function interact_get_notifications($pdo, $uid) {
    $stmt = $pdo->prepare("SELECT * FROM notifications WHERE userId = ? ORDER BY timestamp DESC LIMIT 30"); $stmt->execute([$uid]);
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
    $sid = $input['senderId']; $term = $input['targetUsername']; $vid = $input['videoId'];
    $tid = $pdo->query("SELECT id FROM users WHERE username = '$term'")->fetchColumn();
    if (!$tid) respond(false, null, "Destinatario no existe");
    $u = $pdo->query("SELECT username FROM users WHERE id = '$sid'")->fetch();
    $v = $pdo->query("SELECT title, thumbnailUrl FROM videos WHERE id = '$vid'")->fetch();
    send_direct_notification($pdo, $tid, 'SYSTEM', "@{$u['username']} te recomendó un video", "/watch/{$vid}", $v['thumbnailUrl'], ['videoTitle' => $v['title']]);
    respond(true);
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
    $stmt = $pdo->prepare("SELECT * FROM push_subscriptions WHERE userId = ?");
    $stmt->execute([$userId]);
    $subs = $stmt->fetchAll();
    
    if (empty($subs)) return;

    // Obtener llaves VAPID
    $stmtS = $pdo->query("SELECT vapidPublicKey, vapidPrivateKey FROM system_settings WHERE id = 1");
    $settings = $stmtS->fetch();
    
    foreach ($subs as $sub) {
        // Aquí se debería usar una librería como 'web-push' para PHP
        // Por ahora, registramos el intento en el log
        write_log("Push Notification Intent: To=$userId, Title=$title, Body=$body, Endpoint={$sub['endpoint']}");
        
        // Si el usuario configura FCM, se podría enviar vía cURL aquí
    }
}

function interact_request_content($pdo, $input) {
    $pdo->prepare("INSERT INTO requests (id, userId, query, status, createdAt, isVip) VALUES (?, ?, ?, 'PENDING', ?, ?)")
        ->execute([uniqid('req_'), $input['userId'], $input['query'], time(), $input['isVip'] ? 1 : 0]);
    respond(true);
}
