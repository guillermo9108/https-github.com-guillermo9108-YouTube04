<?php
/**
 * AUTH - CORE FUNCTIONS V15.2 (Avatar Processing & ACID Sessions)
 */

// Helper para obtener datos completos de usuario
function _get_user_data($pdo, $id) {
    $stmt = $pdo->prepare("SELECT id, username, role, balance, avatarUrl, shippingDetails, vipExpiry, is_verified_seller, currentSessionId, lastDeviceId, watchLater, defaultPrices FROM users WHERE id = ?");
    $stmt->execute([$id]); 
    $u = $stmt->fetch();
    if ($u) {
        if (empty($u['avatarUrl'])) {
            $settings = get_system_settings($pdo);
            $u['avatarUrl'] = $settings['defaultAvatar'] ?? '';
        }
        $u['avatarUrl'] = fix_url($u['avatarUrl']);
        $u['balance'] = (float)$u['balance'];
        $u['deviceInfo'] = $u['lastDeviceId'] ?: 'Desconocido';
        $u['watchLater'] = json_decode($u['watchLater'] ?: '[]', true);
        $u['defaultPrices'] = json_decode($u['defaultPrices'] ?: '{}', true);
        $details = json_decode($u['shippingDetails'] ?: '{}', true);
        if (!is_array($details)) $details = [];
        
        // Si no hay detalles de envío, intentar cargar desde verificación de vendedor
        if (empty($details['address']) || empty($details['fullName'])) {
            $sv = $pdo->prepare("SELECT fullName, address, mobile FROM seller_verifications WHERE userId = ? AND status = 'APPROVED' ORDER BY createdAt DESC LIMIT 1");
            $sv->execute([$id]);
            $verification = $sv->fetch(PDO::FETCH_ASSOC);
            if ($verification && is_array($verification)) {
                if (empty($details['fullName'])) $details['fullName'] = $verification['fullName'] ?? '';
                if (empty($details['address'])) $details['address'] = $verification['address'] ?? '';
                if (empty($details['phoneNumber']) && !empty($verification['mobile'])) $details['phoneNumber'] = $verification['mobile'];
            }
        }
        $u['shippingDetails'] = $details;
        return $u;
    }
    return null;
}

function auth_login($pdo, $input) {
    $u = $input['username']; $p = $input['password'];
    $stmt = $pdo->prepare("SELECT id, password_hash FROM users WHERE username = ?");
    $stmt->execute([$u]); $user = $stmt->fetch();
    
    if ($user && password_verify($p, $user['password_hash'])) {
        $sid = bin2hex(random_bytes(32));
        $userAgent = $_SERVER['HTTP_USER_AGENT'] ?? '';
        $deviceInfo = parse_user_agent($userAgent);
        $pdo->prepare("UPDATE users SET currentSessionId = ?, lastActive = ?, lastDeviceId = ? WHERE id = ?")
            ->execute([$sid, time(), $deviceInfo, $user['id']]);
        
        $data = _get_user_data($pdo, $user['id']);
        $data['sessionToken'] = $sid;
        respond(true, $data);
    }
    respond(false, null, "Credenciales inválidas");
}

function auth_register($pdo, $input) {
    $u = $input['username']; $p = password_hash($input['password'], PASSWORD_DEFAULT);
    $id = 'u_' . uniqid();
    try {
        $pdo->prepare("INSERT INTO users (id, username, password_hash, role, balance) VALUES (?, ?, ?, 'USER', 0)")
            ->execute([$id, $u, $p]);
        
        // Procesar avatar si se envió
        if (isset($_FILES['avatar']) && $_FILES['avatar']['error'] === UPLOAD_ERR_OK) {
            auth_upload_avatar($pdo, $id, $_FILES['avatar']);
        }

        // Auto-login after register
        $sid = bin2hex(random_bytes(32));
        $userAgent = substr($_SERVER['HTTP_USER_AGENT'] ?? '', 0, 255);
        $pdo->prepare("UPDATE users SET currentSessionId = ?, lastActive = ?, lastDeviceId = ? WHERE id = ?")
            ->execute([$sid, time(), $userAgent, $id]);
            
        // Refetch data to include avatarUrl
        $data = _get_user_data($pdo, $id);
        $data['sessionToken'] = $sid;
        respond(true, $data);
    } catch (Exception $e) { respond(false, null, "El usuario ya existe"); }
}

function auth_heartbeat($pdo, $input) {
    $uid = $input['userId'] ?? $_GET['userId'] ?? ''; 
    $sid = $input['sessionToken'] ?? $input['sessionId'] ?? '';
    
    if (!$uid) respond(false, null, "ID de usuario requerido");
    
    $user = _get_user_data($pdo, $uid);
    if ($user && $user['currentSessionId'] === $sid) {
        $userAgent = $_SERVER['HTTP_USER_AGENT'] ?? '';
        $deviceInfo = parse_user_agent($userAgent);
        $now = time();
        $pdo->prepare("UPDATE users SET lastActive = ?, lastDeviceId = ? WHERE id = ?")->execute([$now, $deviceInfo, $uid]);
        
        // AUTO-MARK AS DELIVERED: Any pending message sent to this user is now "Delivered" because they are active
        $pdo->prepare("UPDATE messages SET isDelivered = 1 WHERE receiverId = ? AND isDelivered = 0")->execute([$uid]);
        
        respond(true, $user);
    }
    respond(false, null, "Sesión expirada");
}

function auth_logout($pdo, $input) {
    $pdo->prepare("UPDATE users SET currentSessionId = NULL WHERE id = ?")->execute([$input['userId']]);
    respond(true);
}

function auth_get_user($pdo, $id) {
    $u = _get_user_data($pdo, $id);
    if ($u) respond(true, $u);
    respond(false, null, "No encontrado");
}

function auth_update_user($pdo, $input) {
    $uid = $input['userId'];
    $fields = []; $params = [];
    
    // Si hay un archivo de avatar en $_FILES
    if (isset($_FILES['avatar']) && $_FILES['avatar']['error'] === UPLOAD_ERR_OK) {
        $avatarUrl = auth_upload_avatar($pdo, $uid, $_FILES['avatar']);
        if ($avatarUrl) {
            $fields[] = "avatarUrl = ?";
            $params[] = $avatarUrl;
        }
    }

    foreach ($input as $k => $v) {
        if ($k === 'newPassword' && !empty($v)) {
            $fields[] = "password_hash = ?";
            $params[] = password_hash($v, PASSWORD_DEFAULT);
        } else if ($k === 'shippingDetails') {
            $fields[] = "shippingDetails = ?";
            $params[] = is_array($v) ? json_encode($v) : $v;
        } else if ($k === 'avatarUrl' && !isset($_FILES['avatar'])) {
            $fields[] = "avatarUrl = ?";
            $params[] = $v;
        } else if ($k === 'autoPurchaseLimit') {
            $fields[] = "autoPurchaseLimit = ?";
            $params[] = floatval($v);
        } else if ($k === 'toggleWatchLater') {
            $stmt = $pdo->prepare("SELECT watchLater FROM users WHERE id = ?");
            $stmt->execute([$uid]);
            $current = json_decode($stmt->fetchColumn() ?: '[]', true);
            if (in_array($v, $current)) {
                $current = array_values(array_filter($current, function($id) use ($v) { return $id !== $v; }));
            } else {
                $current[] = $v;
            }
            $fields[] = "watchLater = ?";
            $params[] = json_encode($current);
        }
    }
    
    if (empty($fields)) respond(false, null, "Nada que actualizar");
    $params[] = $uid;
    $pdo->prepare("UPDATE users SET " . implode(', ', $fields) . " WHERE id = ?")->execute($params);
    respond(true);
}

function auth_get_all_users($pdo) {
    $stmt = $pdo->query("SELECT id, username, role, balance, lastActive, is_verified_seller, avatarUrl FROM users ORDER BY lastActive DESC");
    $users = $stmt->fetchAll();
    foreach ($users as &$u) $u['avatarUrl'] = fix_url($u['avatarUrl']);
    respond(true, $users);
}

function auth_get_online_users($pdo) {
    $now = time();
    $threshold = $now - 60; // 1 minuto
    $stmt = $pdo->prepare("SELECT id, username, avatarUrl, lastActive FROM users WHERE lastActive > ? ORDER BY lastActive DESC LIMIT 100");
    $stmt->execute([$threshold]);
    $users = $stmt->fetchAll();
    foreach ($users as &$u) $u['avatarUrl'] = fix_url($u['avatarUrl']);
    respond(true, $users);
}

function auth_search_users($pdo, $input) {
    $q = $input['query'];
    $stmt = $pdo->prepare("SELECT id, username, avatarUrl, role FROM users WHERE username LIKE ? LIMIT 10");
    $stmt->execute(["%$q%"]);
    $users = $stmt->fetchAll();
    foreach ($users as &$u) $u['avatarUrl'] = fix_url($u['avatarUrl']);
    respond(true, $users);
}

// Helper para procesar avatares (se llama desde el controlador si hay archivos)
function auth_upload_avatar($pdo, $userId, $file) {
        if ($file['error'] !== UPLOAD_ERR_OK) return null;
    $ext = strtolower(pathinfo($file['name'], PATHINFO_EXTENSION));
    $name = "avatar_{$userId}_" . time() . "." . $ext; // Add timestamp to bypass cache
    $uploadDir = __DIR__ . '/uploads/avatars/';
    if (!is_dir($uploadDir)) mkdir($uploadDir, 0777, true);
    
    // Cleanup old avatars
    $oldFiles = glob($uploadDir . "avatar_{$userId}_*");
    if ($oldFiles) foreach($oldFiles as $f) @unlink($f);

    if (move_uploaded_file($file['tmp_name'], $uploadDir . $name)) {
        $target = $uploadDir . $name;
        // Crear miniatura para el avatar
        create_thumbnail($target, str_replace('.' . $ext, '_thumb.jpg', $target), 200, 200, 80);
        
        $url = 'api/uploads/avatars/' . $name;
        $pdo->prepare("UPDATE users SET avatarUrl = ? WHERE id = ?")->execute([$url, $userId]);
        return $url;
    }
    return null;
}
