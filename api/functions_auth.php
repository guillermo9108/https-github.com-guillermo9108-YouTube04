
<?php

/**
 * Procesa una imagen de avatar para redimensionarla y comprimirla (GD Library)
 */
function process_avatar_image($tmp_path, $dest_path, $max_size = 400) {
    if (!function_exists('imagecreatefromstring')) return move_uploaded_file($tmp_path, $dest_path);

    $data = file_get_contents($tmp_path);
    $src = @imagecreatefromstring($data);
    if (!$src) return move_uploaded_file($tmp_path, $dest_path);

    $w = imagesx($src);
    $h = imagesy($src);
    
    // Calcular nuevas dimensiones
    if ($w > $h) {
        $new_w = $max_size;
        $new_h = floor($h * ($max_size / $w));
    } else {
        $new_h = $max_size;
        $new_w = floor($w * ($max_size / $h));
    }

    $dst = imagecreatetruecolor($new_w, $new_h);
    
    // Preservar transparencia para PNG
    imagealphablending($dst, false);
    imagesavealpha($dst, true);
    
    imagecopyresampled($dst, $src, 0, 0, 0, 0, $new_w, $new_h, $w, $h);
    
    // Guardar como JPEG con compresión moderada (75) para ahorrar espacio
    $success = imagejpeg($dst, $dest_path, 75);
    
    imagedestroy($src);
    imagedestroy($dst);
    
    return $success;
}

function getBearerToken() {
    $headers = getallheaders(); $auth = '';
    if (isset($headers['Authorization'])) $auth = $headers['Authorization'];
    elseif (isset($headers['authorization'])) $auth = $headers['authorization'];
    elseif (isset($_SERVER['HTTP_AUTHORIZATION'])) $auth = $_SERVER['HTTP_AUTHORIZATION'];
    elseif (isset($_SERVER['REDIRECT_HTTP_AUTHORIZATION'])) $auth = $_SERVER['REDIRECT_HTTP_AUTHORIZATION'];
    elseif (isset($_GET['token'])) $auth = $_GET['token']; 
    if (empty($auth)) return null;
    if (preg_match('/Bearer\s(\S+)/', $auth, $matches)) return $matches[1];
    return trim(str_replace('Bearer', '', $auth));
}

function auth_login($pdo, $input) {
    $user = trim($input['username'] ?? ''); $pass = $input['password'] ?? '';
    $deviceId = substr($input['deviceId'] ?? 'unknown', 0, 100);
    $stmt = $pdo->prepare("SELECT * FROM users WHERE username = ?");
    $stmt->execute([$user]); $u = $stmt->fetch(PDO::FETCH_ASSOC);
    if ($u && password_verify($pass, $u['password_hash'])) {
        $token = bin2hex(random_bytes(32));
        $pdo->prepare("UPDATE users SET currentSessionId = ?, lastActive = ?, lastDeviceId = ? WHERE id = ?")->execute([$token, time(), $deviceId, $u['id']]);
        $u['sessionToken'] = $token; $u['lastDeviceId'] = $deviceId;
        unset($u['password_hash']); $u['watchLater'] = json_decode($u['watchLater'] ?? '[]', true);
        $u['defaultPrices'] = json_decode($u['defaultPrices'] ?? '{}', true); $u['shippingDetails'] = json_decode($u['shippingDetails'] ?? '{}', true);
        $u['avatarUrl'] = fix_url($u['avatarUrl']); respond(true, $u);
    }
    respond(false, null, 'Credenciales incorrectas');
}

function auth_logout($pdo, $input) {
    $uid = trim($input['userId'] ?? '', '"\' ');
    if ($uid) $pdo->prepare("UPDATE users SET currentSessionId = NULL WHERE id = ?")->execute([$uid]);
    respond(true);
}

function auth_heartbeat($pdo, $input) {
    $uid = trim($input['userId'] ?? $_GET['userId'] ?? '', '"\' '); 
    $token = getBearerToken();
    if (!$uid || !$token) { http_response_code(401); respond(false, null, 'Sesión no proporcionada'); }
    $stmt = $pdo->prepare("SELECT * FROM users WHERE id = ?"); $stmt->execute([$uid]); $u = $stmt->fetch(PDO::FETCH_ASSOC);
    if ($u && $u['currentSessionId'] === $token) {
        $pdo->prepare("UPDATE users SET lastActive = ? WHERE id = ?")->execute([time(), $uid]);
        unset($u['password_hash']); $u['watchLater'] = json_decode($u['watchLater'] ?? '[]', true);
        $u['defaultPrices'] = json_decode($u['defaultPrices'] ?? '{}', true); $u['shippingDetails'] = json_decode($u['shippingDetails'] ?? '{}', true);
        $u['avatarUrl'] = fix_url($u['avatarUrl']); $u['sessionToken'] = $token; respond(true, $u);
    }
    http_response_code(401); respond(false, null, 'Sesión expirada');
}

function auth_register($pdo, $input) {
    $username = trim($_POST['username'] ?? ''); $password = $_POST['password'] ?? '';
    $deviceId = substr($_POST['deviceId'] ?? 'unknown', 0, 100);
    if (!$username || !$password) respond(false, null, 'Campos incompletos');
    $stmt = $pdo->prepare("SELECT COUNT(*) FROM users WHERE username = ?"); $stmt->execute([$username]);
    if ($stmt->fetchColumn() > 0) respond(false, null, 'Usuario ya existe');
    $id = 'u_' . uniqid(); $hash = password_hash($password, PASSWORD_DEFAULT); $avatarUrl = null;
    if (isset($_FILES['avatar']) && $_FILES['avatar']['error'] === UPLOAD_ERR_OK) {
        if (!is_dir('uploads/avatars/')) mkdir('uploads/avatars/', 0777, true);
        $name = "av_{$id}.jpg"; // Forzamos JPG procesado
        $dest = 'uploads/avatars/' . $name;
        if (process_avatar_image($_FILES['avatar']['tmp_name'], $dest)) $avatarUrl = $dest;
    }
    $token = bin2hex(random_bytes(32));
    $pdo->prepare("INSERT INTO users (id, username, password_hash, role, balance, avatarUrl, currentSessionId, lastActive, lastDeviceId, watchLater) VALUES (?, ?, ?, 'USER', 0, ?, ?, ?, ?, '[]')")->execute([$id, $username, $hash, $avatarUrl, $token, time(), $deviceId]);
    respond(true, ['id' => $id, 'username' => $username, 'role' => 'USER', 'balance' => 0, 'avatarUrl' => fix_url($avatarUrl), 'sessionToken' => $token]);
}

function auth_get_user($pdo, $id) {
    $id = trim($id, '"\' '); $stmt = $pdo->prepare("SELECT * FROM users WHERE id = ?"); $stmt->execute([$id]); $u = $stmt->fetch(PDO::FETCH_ASSOC);
    if ($u) {
        unset($u['password_hash']); $u['watchLater'] = json_decode($u['watchLater'] ?? '[]', true);
        $u['defaultPrices'] = json_decode($u['defaultPrices'] ?? '{}', true) ?: (object)[]; $u['shippingDetails'] = json_decode($u['shippingDetails'] ?? '{}', true) ?: (object)[];
        $u['avatarUrl'] = fix_url($u['avatarUrl']); $u['autoPurchaseLimit'] = floatval($u['autoPurchaseLimit'] ?? 1.00); respond(true, $u);
    }
    respond(false, null, 'Usuario no encontrado');
}

function auth_get_all_users($pdo) {
    $stmt = $pdo->query("SELECT id, username, role, balance, avatarUrl, lastActive, lastDeviceId FROM users ORDER BY lastActive DESC");
    $users = $stmt->fetchAll(PDO::FETCH_ASSOC); foreach ($users as &$u) { $u['avatarUrl'] = fix_url($u['avatarUrl']); } respond(true, $users);
}

function auth_search_users($pdo, $input) {
    $q = trim($input['q'] ?? ''); $uid = trim($input['userId'] ?? '', '"\' '); if (strlen($q) < 2) respond(true, []);
    $stmt = $pdo->prepare("SELECT username, avatarUrl FROM users WHERE username LIKE ? AND id != ? LIMIT 5"); $stmt->execute(["%$q%", $uid]); $res = $stmt->fetchAll(PDO::FETCH_ASSOC);
    foreach ($res as &$r) { $r['avatarUrl'] = fix_url($r['avatarUrl']); } respond(true, $res);
}

function auth_update_user($pdo, $input) {
    $data = !empty($_POST) ? $_POST : $input; $uid = trim($data['userId'] ?? '', '"\' '); if (!$uid) respond(false, null, "ID usuario requerido");
    $fields = []; $params = [];
    if (isset($_FILES['avatar']) && $_FILES['avatar']['error'] === UPLOAD_ERR_OK) {
        if (!is_dir('uploads/avatars/')) mkdir('uploads/avatars/', 0777, true);
        $name = "av_{$uid}_" . time() . ".jpg";
        $dest = 'uploads/avatars/' . $name;
        $old = $pdo->query("SELECT avatarUrl FROM users WHERE id = '$uid'")->fetchColumn(); 
        if (process_avatar_image($_FILES['avatar']['tmp_name'], $dest)) {
            if ($old && file_exists($old)) @unlink($old);
            $fields[] = "avatarUrl = ?"; $params[] = $dest;
        }
    }
    if (!empty($data['newPassword'])) { $fields[] = "password_hash = ?"; $params[] = password_hash($data['newPassword'], PASSWORD_DEFAULT); }
    if (!empty($data['toggleWatchLater'])) {
        $vid = $data['toggleWatchLater'];
        $curr = json_decode($pdo->query("SELECT watchLater FROM users WHERE id = '$uid'")->fetchColumn() ?: '[]', true);
        if (in_array($vid, $curr)) $curr = array_values(array_diff($curr, [$vid])); else $curr[] = $vid;
        $fields[] = "watchLater = ?"; $params[] = json_encode($curr);
    }
    $allowed = ['autoPurchaseLimit', 'defaultPrices', 'shippingDetails', 'watchLater'];
    foreach ($data as $key => $val) { if (in_array($key, $allowed)) { $fields[] = "$key = ?"; $params[] = (is_array($val) || is_object($val)) ? json_encode($val) : $val; } }
    if (empty($fields)) respond(true);
    $params[] = $uid; $stmt = $pdo->prepare("UPDATE users SET " . implode(', ', $fields) . " WHERE id = ?"); $stmt->execute($params);
    respond(true);
}
