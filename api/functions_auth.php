<?php
/**
 * AUTH - CORE FUNCTIONS V15.2 (Avatar Processing & ACID Sessions)
 */

function auth_login($pdo, $input) {
    $u = $input['username']; $p = $input['password'];
    $stmt = $pdo->prepare("SELECT * FROM users WHERE username = ?");
    $stmt->execute([$u]); $user = $stmt->fetch();
    
    if ($user && password_verify($p, $user['password_hash'])) {
        $sid = bin2hex(random_bytes(32));
        $pdo->prepare("UPDATE users SET currentSessionId = ?, lastActive = ?, lastDeviceId = ? WHERE id = ?")
            ->execute([$sid, time(), $_SERVER['HTTP_USER_AGENT'], $user['id']]);
        unset($user['password_hash']);
        $user['sessionId'] = $sid;
        $user['avatarUrl'] = fix_url($user['avatarUrl']);
        respond(true, $user);
    }
    respond(false, null, "Credenciales inválidas");
}

function auth_register($pdo, $input) {
    $u = $input['username']; $p = password_hash($input['password'], PASSWORD_DEFAULT);
    $id = 'u_' . uniqid();
    try {
        $pdo->prepare("INSERT INTO users (id, username, password_hash, role, balance) VALUES (?, ?, ?, 'USER', 0)")
            ->execute([$id, $u, $p]);
        respond(true, ['id' => $id, 'username' => $u]);
    } catch (Exception $e) { respond(false, null, "El usuario ya existe"); }
}

function auth_heartbeat($pdo, $input) {
    $uid = $input['userId']; $sid = $input['sessionId'];
    $stmt = $pdo->prepare("SELECT id, currentSessionId, role, balance, vipExpiry, is_verified_seller FROM users WHERE id = ?");
    $stmt->execute([$uid]); $user = $stmt->fetch();
    if ($user && $user['currentSessionId'] === $sid) {
        $pdo->prepare("UPDATE users SET lastActive = ? WHERE id = ?")->execute([time(), $uid]);
        respond(true, $user);
    }
    respond(false, null, "Sesión expirada");
}

function auth_logout($pdo, $input) {
    $pdo->prepare("UPDATE users SET currentSessionId = NULL WHERE id = ?")->execute([$input['userId']]);
    respond(true);
}

function auth_get_user($pdo, $id) {
    $stmt = $pdo->prepare("SELECT id, username, role, balance, avatarUrl, shippingDetails, vipExpiry, is_verified_seller FROM users WHERE id = ?");
    $stmt->execute([$id]); $u = $stmt->fetch();
    if ($u) {
        $u['avatarUrl'] = fix_url($u['avatarUrl']);
        $details = json_decode($u['shippingDetails'] ?: '{}', true);
        
        // Si no hay detalles de envío, intentar cargar desde verificación de vendedor
        if (empty($details['address']) || empty($details['fullName'])) {
            $sv = $pdo->prepare("SELECT fullName, address, mobile FROM seller_verifications WHERE userId = ? AND status = 'APPROVED' ORDER BY createdAt DESC LIMIT 1");
            $sv->execute([$id]);
            $verification = $sv->fetch();
            if ($verification) {
                if (empty($details['fullName'])) $details['fullName'] = $verification['fullName'];
                if (empty($details['address'])) $details['address'] = $verification['address'];
                if (empty($details['phoneNumber'])) $details['phoneNumber'] = $verification['mobile'];
            }
        }
        
        $u['shippingDetails'] = $details;
        respond(true, $u);
    }
    respond(false, null, "No encontrado");
}

function auth_update_user($pdo, $input) {
    $uid = $input['userId'];
    $allowed = ['shippingDetails', 'avatarUrl', 'password'];
    $fields = []; $params = [];
    
    foreach ($input as $k => $v) {
        if ($k === 'password' && !empty($v)) {
            $fields[] = "password_hash = ?";
            $params[] = password_hash($v, PASSWORD_DEFAULT);
        } else if ($k === 'shippingDetails') {
            $fields[] = "shippingDetails = ?";
            $params[] = json_encode($v);
        } else if ($k === 'avatarUrl') {
            $fields[] = "avatarUrl = ?";
            $params[] = $v;
        }
    }
    
    if (empty($fields)) respond(false, null, "Nada que actualizar");
    $params[] = $uid;
    $pdo->prepare("UPDATE users SET " . implode(', ', $fields) . " WHERE id = ?")->execute($params);
    respond(true);
}

function auth_get_all_users($pdo) {
    $stmt = $pdo->query("SELECT id, username, role, balance, lastActive, is_verified_seller FROM users ORDER BY lastActive DESC");
    respond(true, $stmt->fetchAll());
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
    $name = "avatar_{$userId}." . $ext;
    if (!is_dir('uploads/avatars/')) mkdir('uploads/avatars/', 0777, true);
    move_uploaded_file($file['tmp_name'], 'uploads/avatars/' . $name);
    $url = 'api/uploads/avatars/' . $name;
    $pdo->prepare("UPDATE users SET avatarUrl = ? WHERE id = ?")->execute([$url, $userId]);
    return $url;
}
