<?php
/**
 * INTERACCIONES - CORE FUNCTIONS V17.0 (Rich Notifications & Fixes)
 */

function interact_save_search($pdo, $input) {
    $term = trim($input['term'] ?? ''); if (strlen($term) < 2) respond(true);
    $pdo->prepare("INSERT INTO search_history (term, count, last_searched) VALUES (?, 1, ?) ON DUPLICATE KEY UPDATE count = count + 1, last_searched = ?")->execute([$term, time(), time()]);
    respond(true);
}

function interact_get_hashtag_suggestions($pdo, $q, $limit = 10) {
    $q = trim($q, '# ');
    $limit = (int)$limit;
    
    // Búsqueda simple en descripciones para encontrar hashtags que comiencen con $q
    // LIMIT 100 para no procesar demasiadas filas, luego extraemos con regex
    $stmt = $pdo->prepare("SELECT description FROM videos WHERE description LIKE ? LIMIT 100");
    $stmt->execute(["%#$q%"]);
    $rows = $stmt->fetchAll(PDO::FETCH_COLUMN);
    
    $tags = [];
    foreach ($rows as $desc) {
        if (preg_match_all('/#(\w+)/', $desc, $matches)) {
            foreach ($matches[1] as $tag) {
                if (stripos($tag, $q) === 0) {
                    $tags[$tag] = ($tags[$tag] ?? 0) + 1;
                }
            }
        }
    }
    
    arsort($tags);
    $results = [];
    foreach (array_slice(array_keys($tags), 0, $limit) as $t) {
        $results[] = ['label' => "#$t", 'value' => $t];
    }
    
    respond(true, $results);
}

function interact_get_search_suggestions($pdo, $q, $limit = 10) {
    $limit = (int)$limit;
    $q = trim($q); 
    if (empty($q)) respond(true, $pdo->query("SELECT term as label, 'HISTORY' as type FROM search_history ORDER BY count DESC LIMIT 6")->fetchAll());
    
    // Sugerencias de Usuarios
    $stmtU = $pdo->prepare("SELECT id, username as label, avatarUrl, 'USER' as type FROM users WHERE username LIKE ? LIMIT 5");
    $stmtU->execute(["%$q%"]);
    $uResults = $stmtU->fetchAll(PDO::FETCH_ASSOC);
    foreach($uResults as &$u) $u['avatarUrl'] = fix_url($u['avatarUrl']);

    // Sugerencias de Contenido (Videos/Audios)
    $stmtV = $pdo->prepare("SELECT id, title as label, (CASE WHEN is_audio = 1 THEN 'AUDIO' ELSE 'VIDEO' END) as type FROM videos WHERE title LIKE ? LIMIT $limit");
    $stmtV->execute(["%$q%"]); 
    $vResults = $stmtV->fetchAll(PDO::FETCH_ASSOC);
    
    respond(true, array_merge($uResults, $vResults));
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
        
        $price = floatval($v['price']);
        if ($price < 0) {
            // Compute real-time ETECSA dynamic formula
            $stmtS = $pdo->query("SELECT currencyConversion, etecsaCostGB, etecsaDiscount FROM system_settings WHERE id = 1");
            $settings = $stmtS->fetch();
            $currencyConversion = floatval($settings['currencyConversion'] ?? 300.00);
            $etecsaCostGB = floatval($settings['etecsaCostGB'] ?? 0.3500);
            $etecsaDiscount = floatval($settings['etecsaDiscount'] ?? 0.70);

            $sizeMB = floatval($v['size_bytes'] ?? 0) / (1024.0 * 1024.0);
            if ($sizeMB <= 0) {
                $sizeMB = 1.0;
            }
            $computedPrice = (($sizeMB / 1024.0) * ($etecsaCostGB * $currencyConversion)) * $etecsaDiscount;
            if ($computedPrice < 1.0) {
                $computedPrice = 1.0;
            }
            $price = round($computedPrice, 2);
            
            // Persist the calculated price directly so it becomes static for subsequent actions
            $pdo->query("UPDATE videos SET price = $price WHERE id = '$vid'");
            $v['price'] = $price;
        }

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
        $pdo->prepare("UPDATE users SET vipExpiry = ?, paidVipExpiry = ? WHERE id = ?")->execute([$new, $new, $uid]);
        $pdo->prepare("INSERT INTO transactions (id, buyerId, amount, type, timestamp, videoTitle, isExternal) VALUES (?, ?, ?, 'VIP', ?, ?, 0)")->execute([uniqid('txv_'), $uid, $plan['price'], $now, $plan['name']]);
        $pdo->commit(); respond(true);
    } catch (Exception $e) { $pdo->rollBack(); respond(false, null, $e->getMessage()); }
}

function interact_rate($pdo, $input) {
    $uid = $input['userId']; $vid = $input['videoId']; $type = $input['type'];
    
    // PREVENIR AUTOLIKE
    if ($type === 'like') {
        $creatorStmt = $pdo->prepare("SELECT creatorId FROM videos WHERE id = ?");
        $creatorStmt->execute([$vid]);
        if ($creatorStmt->fetchColumn() === $uid) {
            respond(false, null, "No puedes dar like a tu propio contenido");
        }
    }
    
    // Si es fragmento, obtenemos el originalId para marcar la interacción globalmente si se desea,
    // o simplemente para que la lógica de filtrado sepa que el "origen" fue rechazado.
    $v = $pdo->prepare("SELECT originalId FROM videos WHERE id = ?");
    $v->execute([$vid]);
    $vMeta = $v->fetch();
    $origId = $vMeta['originalId'] ?? $vid;

    $stmt = $pdo->prepare("SELECT liked, disliked FROM interactions WHERE userId = ? AND videoId = ?");
    $stmt->execute([$uid, $vid]);
    $current = $stmt->fetch();
    
    $newLiked = ($type === 'like') ? 1 : 0;
    $newDisliked = ($type === 'dislike') ? 1 : 0;
    
    $likeDiff = 0;
    if ($current) {
        if (($type === 'like' && $current['liked'] == 1) || ($type === 'dislike' && $current['disliked'] == 1)) {
            $pdo->prepare("UPDATE interactions SET liked = 0, disliked = 0 WHERE userId = ? AND videoId = ?")->execute([$uid, $vid]);
            $resLiked = false;
            $resDisliked = false;
            if ($type === 'like') $likeDiff = -1;
        } else {
            $pdo->prepare("UPDATE interactions SET liked = ?, disliked = ? WHERE userId = ? AND videoId = ?")->execute([$newLiked, $newDisliked, $uid, $vid]);
            $resLiked = ($newLiked === 1);
            $resDisliked = ($newDisliked === 1);
            if ($type === 'like') $likeDiff = 1;
            else if ($current['liked'] == 1) $likeDiff = -1; // Was liked, now disliked
        }
    } else {
        $pdo->prepare("INSERT INTO interactions (userId, videoId, liked, disliked) VALUES (?, ?, ?, ?)")->execute([$uid, $vid, $newLiked, $newDisliked]);
        $resLiked = ($newLiked === 1);
        $resDisliked = ($newDisliked === 1);
        if ($resLiked) $likeDiff = 1;
    }

    // --- LOGICA DE PREMIO POR LIKES ---
    if ($likeDiff !== 0) {
        $creatorStmt = $pdo->prepare("SELECT creatorId FROM videos WHERE id = ?");
        $creatorStmt->execute([$vid]);
        $creatorId = $creatorStmt->fetchColumn();

        if ($creatorId) {
            // Actualizar likes acumulados del creador
            $pdo->prepare("UPDATE users SET accumulatedLikes = GREATEST(0, accumulatedLikes + ?) WHERE id = ?")
                ->execute([$likeDiff, $creatorId]);
            
            // Si el Like fue positivo, verificar si llegó a la meta
            if ($likeDiff > 0) {
                $settingsStmt = $pdo->query("SELECT likes_goal, max_monthly_extra_days FROM system_settings WHERE id = 1");
                $sData = $settingsStmt->fetch();
                $goal = (int)($sData['likes_goal'] ?? 20);
                $maxExtra = (int)($sData['max_monthly_extra_days'] ?? 14);
                
                $userStmt = $pdo->prepare("SELECT accumulatedLikes, vipExpiry, monthlyExtraDaysCount, lastExtraDayMonth, totalExtraDaysWon FROM users WHERE id = ?");
                $userStmt->execute([$creatorId]);
                $userData = $userStmt->fetch();
                
                if ($userData && $userData['accumulatedLikes'] >= $goal) {
                    $now = time();
                    $currentMonth = date('Y-m');
                    
                    // Resetear contador si es un nuevo mes
                    $monthlyCount = ($userData['lastExtraDayMonth'] === $currentMonth) ? (int)$userData['monthlyExtraDaysCount'] : 0;
                    
                    if ($monthlyCount < $maxExtra) {
                        $newAcc = $userData['accumulatedLikes'] - $goal;
                        $currentExpiry = (int)$userData['vipExpiry'];
                        $baseTime = ($currentExpiry > $now) ? $currentExpiry : $now;
                        $newExpiry = $baseTime + 86400; // +1 día
                        $newMonthlyCount = $monthlyCount + 1;
                        $newTotalWon = (int)($userData['totalExtraDaysWon'] ?? 0) + 1;
                        
                        $pdo->prepare("UPDATE users SET accumulatedLikes = ?, vipExpiry = ?, monthlyExtraDaysCount = ?, lastExtraDayMonth = ?, totalExtraDaysWon = ? WHERE id = ?")
                            ->execute([$newAcc, $newExpiry, $newMonthlyCount, $currentMonth, $newTotalWon, $creatorId]);
                            
                        // Notificar al creador
                        require_once __DIR__ . '/functions_app.php';
                        send_direct_notification($pdo, $creatorId, 'SYSTEM', "¡Felicidades! Has ganado 1 día de Acceso Total. ({$newMonthlyCount}/{$maxExtra} este mes).", "/profile");
                    } else {
                        // Meta alcanzada pero límite mensual excedido
                        // Opcionalmente podemos dejar los likes ahí para el siguiente mes o simplemente no dar el premio.
                        // En este caso, restamos los likes para que el contador no se bloquee, pero avisamos.
                        $newAcc = $userData['accumulatedLikes'] - $goal;
                        $pdo->prepare("UPDATE users SET accumulatedLikes = ?, monthlyExtraDaysCount = ?, lastExtraDayMonth = ? WHERE id = ?")
                            ->execute([$newAcc, $monthlyCount, $currentMonth, $creatorId]);
                            
                        require_once __DIR__ . '/functions_app.php';
                        send_direct_notification($pdo, $creatorId, 'SYSTEM', "Has alcanzado la meta de likes, pero ya has ganado el máximo de {$maxExtra} días este mes. ¡Sigue así para el próximo mes!", "/profile");
                    }
                }
            }
        }
    }
    // ---------------------------------

    // SI ES DISLIKE Y ES FRAGMENTO: Marcar dislike también en el ORGINAL para que el filtro lo detecte
    if ($type === 'dislike' && $resDisliked && $origId !== $vid) {
        $pdo->prepare("INSERT INTO interactions (userId, videoId, disliked) VALUES (?, ?, 1) ON DUPLICATE KEY UPDATE disliked = 1")
            ->execute([$uid, $origId]);
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
            'isSkipped' => (bool)($res['isSkipped'] ?? false),
            'skip_count' => (int)($res['skip_count'] ?? 0)
        ]);
    } else {
        respond(true, ['liked' => false, 'disliked' => false, 'isWatched' => false, 'isSkipped' => false, 'skip_count' => 0]);
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
    $uid = $input['userId']; $vid = $input['videoId'];
    
    // Obtenemos originalId para propagar el skip si es fragmento (según requerimiento de 3 skips)
    $v = $pdo->prepare("SELECT originalId FROM videos WHERE id = ?");
    $v->execute([$vid]);
    $vMeta = $v->fetch();
    $origId = $vMeta['originalId'] ?? $vid;

    // Solo marcar como saltado si NO ha sido visto antes
    $pdo->prepare("INSERT INTO interactions (userId, videoId, isSkipped, skip_count) VALUES (?, ?, 1, 1) 
                  ON DUPLICATE KEY UPDATE 
                  isSkipped = CASE WHEN isWatched = 1 THEN 0 ELSE 1 END,
                  skip_count = CASE WHEN isWatched = 1 THEN skip_count ELSE skip_count + 1 END")
        ->execute([$uid, $vid]); 
    
    // Si es fragmento, incrementamos skip_count en el ORIGINAL también (pero no forzamos isSkipped)
    if ($origId !== $vid) {
         $pdo->prepare("INSERT INTO interactions (userId, videoId, isSkipped, skip_count) VALUES (?, ?, 1, 1) 
                       ON DUPLICATE KEY UPDATE 
                       skip_count = CASE WHEN isWatched = 1 THEN skip_count ELSE skip_count + 1 END")
             ->execute([$uid, $origId]);
    }
    
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
    $sid = $input['userId']; $term = $input['targetUsername'];
    $amtRaw = (string)($input['amount'] ?? '');
    
    // SEGURIDAD: Omitir operadores aritméticos para evitar manipulaciones
    if (preg_match('/[\+\-\*\/×÷]/', $amtRaw)) {
        respond(false, null, "Operación no permitida en el monto (caracteres especiales detectados)");
    }
    
    $amt = floatval($amtRaw); 
    if ($amt <= 0) respond(false, null, "El monto debe ser mayor a 0");
    
    $pdo->beginTransaction();
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
    $sql = "SELECT m.*, uS.username as senderName 
            FROM messages m
            LEFT JOIN users uS ON m.senderId = uS.id
            WHERE (m.senderId = :u1 AND m.receiverId = :u2) OR (m.senderId = :u3 AND m.receiverId = :u4) 
            ORDER BY m.timestamp DESC
            LIMIT :limit OFFSET :offset";
            
    $stmt = $pdo->prepare($sql);
    $stmt->bindValue(':u1', $userId);
    $stmt->bindValue(':u2', $otherId);
    $stmt->bindValue(':u3', $otherId);
    $stmt->bindValue(':u4', $userId);
    $stmt->bindValue(':limit', (int)$limit, PDO::PARAM_INT);
    $stmt->bindValue(':offset', (int)$offset, PDO::PARAM_INT);
    $stmt->execute();
    
    $messages = $stmt->fetchAll();
    
    // Los devolvemos en orden ASC para el frontend (más fácil de manejar)
    $messages = array_reverse($messages);
    
    foreach ($messages as &$m) {
        if (isset($m['imageUrl']) && $m['imageUrl']) $m['imageUrl'] = fix_url($m['imageUrl']);
        if (isset($m['videoUrl']) && $m['videoUrl']) $m['videoUrl'] = fix_url($m['videoUrl']);
        if (isset($m['audioUrl']) && $m['audioUrl']) $m['audioUrl'] = fix_url($m['audioUrl']);
        if (isset($m['fileUrl']) && $m['fileUrl']) $m['fileUrl'] = fix_url($m['fileUrl']);
        
        $m['isRead'] = (int)$m['isRead'] === 1;
        $m['isDelivered'] = (int)$m['isDelivered'] === 1;
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

function group_subscribe($pdo, $input) {
    $userId = $input['userId'] ?? '';
    $folderPath = $input['folderPath'] ?? '';
    if (!$userId || !$folderPath) respond(false, null, "Faltan datos");

    // Check if the group is private
    $isPrivate = 0;
    try {
        $stmtM = $pdo->prepare("SELECT isPrivate, creatorId FROM groups_metadata WHERE folderPath = ?");
        $stmtM->execute([$folderPath]);
        $meta = $stmtM->fetch(PDO::FETCH_ASSOC);
        if ($meta) {
            $isPrivate = (int)$meta['isPrivate'];
            // Creator is always auto-approved
            if ($meta['creatorId'] === $userId) {
                $isPrivate = 0;
            }
        }
    } catch (Exception $e) {}

    $approved = $isPrivate === 1 ? 0 : 1;

    try {
        $stmt = $pdo->prepare("INSERT INTO group_subscriptions (userId, folderPath, approved, createdAt) VALUES (?, ?, ?, ?)");
        $stmt->execute([$userId, $folderPath, $approved, time()]);
        if ($approved === 0) {
            $creatorId = $meta['creatorId'] ?? 'admin';
            $buyerName = $pdo->query("SELECT username FROM users WHERE id = '$userId'")->fetchColumn() ?: 'Un usuario';
            send_direct_notification(
                $pdo, 
                $creatorId, 
                'GROUP_REQUEST', 
                "El usuario {$buyerName} ha solicitado unirse a tu grupo privado '{$folderPath}'.", 
                "/groups?tab=ADMIN&pending=1", 
                null
            );
            respond(true, ['approved' => false], "Solicitud de suscripción enviada. Esperando aprobación del administrador.");
        } else {
            respond(true, ['approved' => true], "Suscripción a grupo exitosa");
        }
    } catch (Exception $e) {
        respond(false, null, "Ya estás suscrito o tienes una solicitud pendiente");
    }
}

function group_unsubscribe($pdo, $input) {
    $userId = $input['userId'] ?? '';
    $folderPath = $input['folderPath'] ?? '';
    if (!$userId || !$folderPath) respond(false, null, "Faltan datos");

    $stmt = $pdo->prepare("DELETE FROM group_subscriptions WHERE userId = ? AND folderPath = ?");
    $stmt->execute([$userId, $folderPath]);
    respond(true, "Cancelación de suscripción exitosa");
}

function get_group_subscriptions($pdo) {
    $userId = $_GET['userId'] ?? '';
    if (!$userId) respond(false, null, "Falta userId");

    // Return approved folderPaths
    $stmt = $pdo->prepare("SELECT folderPath FROM group_subscriptions WHERE userId = ? AND approved = 1");
    $stmt->execute([$userId]);
    $subs = $stmt->fetchAll(PDO::FETCH_COLUMN);
    respond(true, $subs);
}

function get_user_all_subscriptions($pdo) {
    $userId = $_GET['userId'] ?? '';
    if (!$userId) respond(false, null, "Falta userId");

    $stmt = $pdo->prepare("SELECT folderPath, approved FROM group_subscriptions WHERE userId = ?");
    $stmt->execute([$userId]);
    $subs = $stmt->fetchAll(PDO::FETCH_ASSOC);
    respond(true, $subs);
}

function save_group_cover_file($folderName, $base64Data, $pdo) {
    if (empty($base64Data) || strpos($base64Data, 'data:image/') !== 0) {
        return $base64Data; // Already a URL or empty
    }
    
    // Resolve base path
    $stmtSet = $pdo->query("SELECT localLibraryPath FROM system_settings WHERE id = 1");
    $sSet = $stmtSet->fetch();
    $localPath = $sSet['localLibraryPath'] ?? '';
    if (empty($localPath)) {
        $localPath = 'uploads/videos/';
    }
    $basePath = rtrim(str_replace('\\', '/', $localPath), '/');
    $targetDir = $basePath . '/' . $folderName;
    
    if (!is_dir($targetDir)) {
        @mkdir($targetDir, 0777, true);
    }
    
    // Parse base64
    $parts = explode(',', $base64Data);
    if (count($parts) < 2) return $base64Data;
    $data = base64_decode($parts[1]);
    if (!$data) return $base64Data;
    
    // Save as cover.jpg or cover image
    $filePath = $targetDir . '/cover.jpg';
    if (file_put_contents($filePath, $data)) {
        return 'uploads/videos/' . $folderName . '/cover.jpg';
    }
    
    return $base64Data;
}

function group_create($pdo, $input) {
    $userId = $input['userId'] ?? '';
    $groupName = trim($input['name'] ?? '');
    $description = trim($input['description'] ?? 'Grupo sin descripción.');
    $isPrivate = !empty($input['isPrivate']) ? 1 : 0;
    $allowUpload = !isset($input['allowUpload']) || !empty($input['allowUpload']) ? 1 : 0;
    $coverUrl = $input['coverUrl'] ?? null;

    if (!$userId || !$groupName) respond(false, null, "Faltan datos");

    // Bloquear nombres reservados
    $reserved = ["PRINCIPAL", "PRIVADO", "PERSONAL", "GENERAL", "TODOS", "ALL", "uploads", "admin", "config", "shared"];
    if (in_array(strtoupper($groupName), $reserved)) {
        respond(false, null, "Ese nombre de grupo está reservado.");
    }

    // Clean up name but allow unicode/emojis!
    // Safe filesystem path: replace / \ ? * : " ' < > | . with empty string, preserving Russian/Spanish letters/emojis
    $folderNameForDir = preg_replace('/[\/\\\\\?\*\:\"\'\<\>\|\.]/u', '', $groupName);
    if (empty($folderNameForDir)) {
        respond(false, null, "Nombre de grupo inválido");
    }

    // Process and save coverUrl if base64 before creating group folder or registering meatadata
    $coverUrl = save_group_cover_file($folderNameForDir, $coverUrl, $pdo);

    // Create physical/virtual directory
    $stmtSet = $pdo->query("SELECT localLibraryPath FROM system_settings WHERE id = 1");
    $sSet = $stmtSet->fetch();
    $localPath = $sSet['localLibraryPath'] ?? '';
    if (empty($localPath)) {
        $localPath = 'uploads/videos/';
    }

    $basePath = rtrim(str_replace('\\', '/', $localPath), '/');
    $targetDir = $basePath . '/' . $folderNameForDir;

    if (is_dir($targetDir) || file_exists($targetDir)) {
        respond(false, null, "El grupo (carpeta) ya existe física o virtualmente");
    }

    // Try detecting alternative disks/volumes in Synology NAS to prevent filling up the system volume
    $synologyOtherVolumes = ['/volume2', '/volume3', '/volume4', '/volumeUSB1', '/volumeUSB2'];
    $externalFolder = null;
    foreach ($synologyOtherVolumes as $vol) {
        if (is_dir($vol) && is_writable($vol)) {
            $externalFolder = $vol . '/streamplay_media';
            if (!is_dir($externalFolder)) {
                @mkdir($externalFolder, 0777, true);
            }
            break;
        }
    }

    $folderCreated = false;
    if ($externalFolder !== null && is_dir($externalFolder) && is_writable($externalFolder)) {
        // Physical directory on the other disk
        $realExtDir = $externalFolder . '/' . $folderNameForDir;
        if (!is_dir($realExtDir)) {
            if (mkdir($realExtDir, 0777, true)) {
                // Now create a symlink (virtual folder) inside $localPath pointing to the external directory
                if (@symlink($realExtDir, $targetDir)) {
                    $folderCreated = true;
                } else {
                    // Fallback to standard creation if symlink fails
                    @rmdir($realExtDir);
                }
            }
        }
    }

    if (!$folderCreated) {
        if (!is_dir($targetDir)) {
            if (!is_dir($basePath)) {
                @mkdir($basePath, 0777, true);
            }
            if (!@mkdir($targetDir, 0777, true)) {
                // Fallback to local writable path inside app directory:
                $fallbackPath = __DIR__ . '/uploads/videos';
                @mkdir($fallbackPath, 0777, true);
                $targetDir = $fallbackPath . '/' . $folderNameForDir;
                @mkdir($targetDir, 0777, true);
            }
        }
    }

    $isSeries = !empty($input['isSeries']) ? 1 : 0;

    // Register metadata
    try {
        $stmtMeta = $pdo->prepare("INSERT INTO groups_metadata (folderPath, creatorId, description, coverUrl, isPrivate, allowUpload, isSeries, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");
        $stmtMeta->execute([$folderNameForDir, $userId, $description, $coverUrl, $isPrivate, $allowUpload, $isSeries, time()]);
    } catch (Exception $e) {
        // En caso de que falle de otra manera, intentamos sin el campo allowUpload o registramos el error
        try {
            $stmtMeta = $pdo->prepare("INSERT INTO groups_metadata (folderPath, creatorId, description, coverUrl, isPrivate, createdAt) VALUES (?, ?, ?, ?, ?, ?)");
            $stmtMeta->execute([$folderNameForDir, $userId, $description, $coverUrl, $isPrivate, time()]);
            // Intentar alterar la tabla dinámicamente si falta la columna
            $pdo->exec("ALTER TABLE groups_metadata ADD COLUMN allowUpload TINYINT(1) DEFAULT 1");
            $pdo->exec("ALTER TABLE groups_metadata ADD COLUMN isSeries TINYINT(1) DEFAULT 0");
            $pdo->exec("UPDATE groups_metadata SET allowUpload = $allowUpload, isSeries = $isSeries WHERE folderPath = '" . str_replace("'", "''", $folderNameForDir) . "'");
        } catch (Exception $ex) {}
    }

    // Automatically auto-subscribe creator with approved=1
    $stmt = $pdo->prepare("INSERT INTO group_subscriptions (userId, folderPath, approved, createdAt) VALUES (?, ?, 1, ?)");
    try {
        $stmt->execute([$userId, $folderNameForDir, time()]);
    } catch (Exception $e) {}

    respond(true, ['name' => $folderNameForDir], "Grupo creado exitosamente");
}

function group_edit($pdo, $input) {
    $userId = $input['userId'] ?? '';
    $folderPath = $input['folderPath'] ?? '';
    if (!$userId || !$folderPath) respond(false, null, "Faltan datos");

    $stmt = $pdo->prepare("SELECT creatorId FROM groups_metadata WHERE folderPath = ?");
    $stmt->execute([$folderPath]);
    $creatorId = $stmt->fetchColumn();
    if ($creatorId !== $userId) respond(false, null, "No tienes permisos de administrador para este grupo");

    $description = $input['description'] ?? null;
    $coverUrl = $input['coverUrl'] ?? null;
    $isPrivate = !empty($input['isPrivate']) ? 1 : 0;
    $isUnified = !empty($input['isUnified']) ? 1 : 0;
    $allowUpload = !isset($input['allowUpload']) || !empty($input['allowUpload']) ? 1 : 0;
    $isSeries = !empty($input['isSeries']) ? 1 : 0;
    $newName = trim($input['name'] ?? '');

    // Process and physically save group cover image in the correct directory
    $folderNameForCover = (!empty($newName) && $newName !== $folderPath) ? preg_replace('/[\/\\\\\?\*\:\"\'\<\>\|\.]/u', '', $newName) : $folderPath;
    $coverUrl = save_group_cover_file($folderNameForCover, $coverUrl, $pdo);

    if (!empty($newName) && $newName !== $folderPath) {
        $reserved = ["PRINCIPAL", "PRIVADO", "PERSONAL", "GENERAL", "TODOS", "ALL", "uploads", "admin", "config", "shared"];
        if (in_array(strtoupper($newName), $reserved)) {
            respond(false, null, "Ese nombre de grupo está reservado.");
        }
        $folderNameForDir = preg_replace('/[\/\\\\\?\*\:\"\'\<\>\|\.]/u', '', $newName);
        if (empty($folderNameForDir)) respond(false, null, "Nombre de grupo inválido");

        $stmtSet = $pdo->query("SELECT localLibraryPath FROM system_settings WHERE id = 1");
        $sSet = $stmtSet->fetch();
        $localPath = $sSet['localLibraryPath'] ?? 'uploads/videos/';
        $oldDir = rtrim(str_replace('\\', '/', $localPath), '/') . '/' . $folderPath;
        $newDir = rtrim(str_replace('\\', '/', $localPath), '/') . '/' . $folderNameForDir;

        if (is_dir($oldDir)) {
            if (is_dir($newDir)) respond(false, null, "El nuevo nombre ya existe física o virtualmente.");
            rename($oldDir, $newDir);
        }

        // update db records
        try {
            $stmtMeta = $pdo->prepare("UPDATE groups_metadata SET folderPath = ?, description = ?, coverUrl = ?, isPrivate = ?, isUnified = ?, allowUpload = ?, isSeries = ? WHERE folderPath = ?");
            $stmtMeta->execute([$folderNameForDir, $description, $coverUrl, $isPrivate, $isUnified, $allowUpload, $isSeries, $folderPath]);
        } catch (Exception $e) {
            $stmtMeta = $pdo->prepare("UPDATE groups_metadata SET folderPath = ?, description = ?, coverUrl = ?, isPrivate = ?, isUnified = ? WHERE folderPath = ?");
            $stmtMeta->execute([$folderNameForDir, $description, $coverUrl, $isPrivate, $isUnified, $folderPath]);
            try {
                $pdo->exec("ALTER TABLE groups_metadata ADD COLUMN allowUpload TINYINT(1) DEFAULT 1");
                $pdo->exec("ALTER TABLE groups_metadata ADD COLUMN isSeries TINYINT(1) DEFAULT 0");
                $pdo->exec("UPDATE groups_metadata SET allowUpload = $allowUpload, isSeries = $isSeries WHERE folderPath = '" . str_replace("'", "''", $folderNameForDir) . "'");
            } catch (Exception $ex) {}
        }

        $stmtSub = $pdo->prepare("UPDATE group_subscriptions SET folderPath = ? WHERE folderPath = ?");
        $stmtSub->execute([$folderNameForDir, $folderPath]);

        // update videos
        $stmtV = $pdo->prepare("SELECT id, videoUrl FROM videos WHERE category = ? OR videoUrl LIKE ?");
        $stmtV->execute([$folderPath, "%/{$folderPath}/%"]);
        $vids = $stmtV->fetchAll(PDO::FETCH_ASSOC);
        foreach ($vids as $v) {
            $newVideoUrl = str_replace("/{$folderPath}/", "/{$folderNameForDir}/", $v['videoUrl']);
            $stmtUp = $pdo->prepare("UPDATE videos SET category = ?, videoUrl = ? WHERE id = ?");
            $stmtUp->execute([$folderNameForDir, $newVideoUrl, $v['id']]);
        }

        $folderPath = $folderNameForDir;
    } else {
        try {
            $stmtMeta = $pdo->prepare("UPDATE groups_metadata SET description = ?, coverUrl = ?, isPrivate = ?, isUnified = ?, allowUpload = ?, isSeries = ? WHERE folderPath = ?");
            $stmtMeta->execute([$description, $coverUrl, $isPrivate, $isUnified, $allowUpload, $isSeries, $folderPath]);
        } catch (Exception $e) {
            $stmtMeta = $pdo->prepare("UPDATE groups_metadata SET description = ?, coverUrl = ?, isPrivate = ?, isUnified = ? WHERE folderPath = ?");
            $stmtMeta->execute([$description, $coverUrl, $isPrivate, $isUnified, $folderPath]);
            try {
                $pdo->exec("ALTER TABLE groups_metadata ADD COLUMN allowUpload TINYINT(1) DEFAULT 1");
                $pdo->exec("ALTER TABLE groups_metadata ADD COLUMN isSeries TINYINT(1) DEFAULT 0");
                $pdo->exec("UPDATE groups_metadata SET allowUpload = $allowUpload, isSeries = $isSeries WHERE folderPath = '" . str_replace("'", "''", $folderPath) . "'");
            } catch (Exception $ex) {}
        }
    }

    respond(true, ['folderPath' => $folderPath], "Grupo actualizado con éxito");
}

function group_get_pending_subs($pdo, $input) {
    $userId = $input['userId'] ?? '';
    if (!$userId) respond(false, null, "Faltan datos");

    // Fetch all pending subscriptions for groups created by $userId
    $stmt = $pdo->prepare("
        SELECT gs.userId, gs.folderPath, gs.createdAt, u.username, u.avatarUrl 
        FROM group_subscriptions gs
        JOIN users u ON gs.userId = u.id
        JOIN groups_metadata gm ON gs.folderPath = gm.folderPath
        WHERE gs.approved = 0 AND gm.creatorId = ?
    ");
    $stmt->execute([$userId]);
    $pending = $stmt->fetchAll(PDO::FETCH_ASSOC);

    foreach ($pending as &$p) {
        $p['avatarUrl'] = $p['avatarUrl'] ? fix_url($p['avatarUrl']) : 'uploads/avatars/default.png';
    }

    respond(true, $pending);
}

function group_approve_sub($pdo, $input) {
    $adminId = $input['userId'] ?? '';
    $subscriberId = $input['subscriberId'] ?? '';
    $folderPath = $input['folderPath'] ?? '';
    if (!$adminId || !$subscriberId || !$folderPath) respond(false, null, "Faltan datos");

    // Confirm that adminId is indeed the creator
    $stmt = $pdo->prepare("SELECT creatorId FROM groups_metadata WHERE folderPath = ?");
    $stmt->execute([$folderPath]);
    $creatorId = $stmt->fetchColumn();
    if ($creatorId !== $adminId) respond(false, null, "No tienes permisos");

    $stmtUp = $pdo->prepare("UPDATE group_subscriptions SET approved = 1 WHERE userId = ? AND folderPath = ?");
    $stmtUp->execute([$subscriberId, $folderPath]);

    send_direct_notification(
        $pdo, 
        $subscriberId, 
        'GROUP_APPROVED', 
        "¡Tu solicitud para unirte al grupo '{$folderPath}' ha sido aprobada!", 
        "/groups?folder=" . urlencode($folderPath), 
        null
    );

    respond(true, null, "Suscripción aprobada");
}

function group_decline_sub($pdo, $input) {
    $adminId = $input['userId'] ?? '';
    $subscriberId = $input['subscriberId'] ?? '';
    $folderPath = $input['folderPath'] ?? '';
    if (!$adminId || !$subscriberId || !$folderPath) respond(false, null, "Faltan datos");

    $stmt = $pdo->prepare("SELECT creatorId FROM groups_metadata WHERE folderPath = ?");
    $stmt->execute([$folderPath]);
    $creatorId = $stmt->fetchColumn();
    if ($creatorId !== $adminId) respond(false, null, "No tienes permisos");

    $stmtDel = $pdo->prepare("DELETE FROM group_subscriptions WHERE userId = ? AND folderPath = ?");
    $stmtDel->execute([$subscriberId, $folderPath]);

    send_direct_notification(
        $pdo, 
        $subscriberId, 
        'GROUP_DECLINED', 
        "Tu solicitud para unirte al grupo '{$folderPath}' ha sido rechazada.", 
        "/groups", 
        null
    );

    respond(true, null, "Solicitud rechazada");
}
