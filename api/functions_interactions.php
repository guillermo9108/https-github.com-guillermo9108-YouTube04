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

function admin_get_seller_verification_requests($pdo) {
    respond(true, $pdo->query("SELECT sv.*, u.username FROM seller_verifications sv JOIN users u ON sv.userId = u.id WHERE sv.status = 'PENDING' ORDER BY sv.createdAt DESC")->fetchAll());
}

function admin_handle_seller_verification($pdo, $input) {
    $reqId = $input['reqId']; $status = $input['status']; $pdo->beginTransaction();
    $stmt = $pdo->prepare("SELECT userId FROM seller_verifications WHERE id = ?"); $stmt->execute([$reqId]); $uid = $stmt->fetchColumn();
    if ($status === 'APPROVED') $pdo->prepare("UPDATE users SET is_verified_seller = 1 WHERE id = ?")->execute([$uid]);
    $pdo->prepare("UPDATE seller_verifications SET status = ? WHERE id = ?")->execute([$status, $reqId]);
    $pdo->commit(); respond(true);
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
    $pdo->prepare("REPLACE INTO interactions (userId, videoId, liked) VALUES (?, ?, ?)")->execute([$uid, $vid, $type === 'like' ? 1 : 0]);
    $likes = $pdo->query("SELECT COUNT(*) FROM interactions WHERE videoId = '$vid' AND liked = 1")->fetchColumn();
    $pdo->prepare("UPDATE videos SET likes = ? WHERE id = ?")->execute([$likes, $vid]);
    respond(true, ['newLikeCount' => $likes]);
}

function interact_get($pdo, $userId, $videoId) {
    $stmt = $pdo->prepare("SELECT * FROM interactions WHERE userId = ? AND videoId = ?");
    $stmt->execute([$userId, $videoId]); $res = $stmt->fetch();
    respond(true, $res ?: ['liked' => false, 'disliked' => false, 'isWatched' => false]);
}

function interact_get_activity($pdo, $userId) {
    $watched = $pdo->prepare("SELECT videoId FROM interactions WHERE userId = ? AND isWatched = 1"); $watched->execute([$userId]);
    $liked = $pdo->prepare("SELECT videoId FROM interactions WHERE userId = ? AND liked = 1"); $liked->execute([$userId]);
    respond(true, ['watched' => $watched->fetchAll(PDO::FETCH_COLUMN), 'liked' => $liked->fetchAll(PDO::FETCH_COLUMN)]);
}

function interact_mark_watched($pdo, $input) {
    $pdo->prepare("INSERT INTO interactions (userId, videoId, isWatched) VALUES (?, ?, 1) ON DUPLICATE KEY UPDATE isWatched = 1")->execute([$input['userId'], $input['videoId']]);
    respond(true);
}

function interact_get_comments($pdo, $vid) {
    $stmt = $pdo->prepare("SELECT c.*, u.username, u.avatarUrl as userAvatarUrl FROM comments c JOIN users u ON c.userId = u.id WHERE c.videoId = ? ORDER BY c.timestamp DESC");
    $stmt->execute([$vid]); respond(true, $stmt->fetchAll());
}

function interact_add_comment($pdo, $input) {
    $id = uniqid('c_'); $now = time();
    $pdo->prepare("INSERT INTO comments (id, videoId, userId, text, timestamp) VALUES (?, ?, ?, ?, ?)")->execute([$id, $input['videoId'], $input['userId'], $input['text'], $now]);
    respond(true, ['id' => $id, 'timestamp' => $now]);
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

function interact_request_content($pdo, $input) {
    $pdo->prepare("INSERT INTO requests (id, userId, query, status, createdAt, isVip) VALUES (?, ?, ?, 'PENDING', ?, ?)")
        ->execute([uniqid('req_'), $input['userId'], $input['query'], time(), $input['isVip'] ? 1 : 0]);
    respond(true);
}
?>