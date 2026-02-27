<?php
/**
 * MARKETPLACE - CORE FUNCTIONS V13.0 (Full Integration & Notifications)
 */

function market_get_items($pdo) {
    $stmt = $pdo->query("SELECT m.*, u.username as sellerName, u.avatarUrl as sellerAvatarUrl FROM marketplace_items m LEFT JOIN users u ON m.sellerId = u.id WHERE status != 'ELIMINADO' ORDER BY createdAt DESC");
    $items = $stmt->fetchAll();
    foreach ($items as &$i) { $i['images'] = json_decode($i['images'] ?: '[]', true); $i['sellerAvatarUrl'] = fix_url($i['sellerAvatarUrl']); }
    respond(true, $items);
}

function market_get_item($pdo, $id) {
    $stmt = $pdo->prepare("SELECT m.*, u.username as sellerName, u.avatarUrl as sellerAvatarUrl, u.is_verified_seller as isVerifiedSeller FROM marketplace_items m LEFT JOIN users u ON m.sellerId = u.id WHERE m.id = ?");
    $stmt->execute([$id]); $i = $stmt->fetch();
    if ($i) { $i['images'] = json_decode($i['images'] ?: '[]', true); $i['sellerAvatarUrl'] = fix_url($i['sellerAvatarUrl']); respond(true, $i); }
    respond(false, null, "Producto no encontrado");
}

function market_create_listing($pdo, $post, $files) {
    $id = 'm_' . uniqid(); $imgs = [];
    if (isset($files['images'])) {
        if (!is_dir('uploads/market/')) mkdir('uploads/market/', 0777, true);
        foreach ($files['images']['tmp_name'] as $idx => $tmp) {
            $name = "{$id}_{$idx}.jpg"; move_uploaded_file($tmp, 'uploads/market/' . $name);
            $imgs[] = 'api/uploads/market/' . $name;
        }
    }
    $pdo->prepare("INSERT INTO marketplace_items (id, title, description, price, stock, images, sellerId, category, itemCondition, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
        ->execute([$id, $post['title'], $post['description'], floatval($post['price']), intval($post['stock']), json_encode($imgs), $post['sellerId'], $post['category'], $post['condition'], time()]);
    
    // NOTIFICACIÓN: Avisar a seguidores del vendedor
    require_once 'functions_interactions.php';
    interact_notify_subscribers($pdo, $post['sellerId'], 'SYSTEM', "Nuevo artículo a la venta: {$post['title']}", "/marketplace/{$id}");
    
    respond(true);
}

function market_edit_listing($pdo, $input) {
    $id = $input['id']; $data = $input['data'];
    $allowed = ['title', 'description', 'price', 'stock', 'status']; $fields = []; $params = [];
    foreach ($data as $k => $v) { if (in_array($k, $allowed)) { $fields[] = "$k = ?"; $params[] = $v; } }
    $params[] = $id; $pdo->prepare("UPDATE marketplace_items SET " . implode(', ', $fields) . " WHERE id = ?")->execute($params);
    respond(true);
}

function market_admin_delete_listing($pdo, $input) {
    $id = $input['id'];
    // Marcamos como eliminado para no romper historial de transacciones si existieran
    $pdo->prepare("UPDATE marketplace_items SET status = 'ELIMINADO' WHERE id = ?")->execute([$id]);
    respond(true);
}

function market_checkout($pdo, $input) {
    $uid = $input['userId']; $cart = $input['cart']; $ship = $input['shippingDetails']; $pdo->beginTransaction();
    try {
        $total = 0; $adminId = $pdo->query("SELECT id FROM users WHERE role = 'ADMIN' LIMIT 1")->fetchColumn();
        $buyerName = $pdo->query("SELECT username FROM users WHERE id = '$uid'")->fetchColumn();
        
        foreach ($cart as $item) {
            $stmt = $pdo->prepare("SELECT price, sellerId, stock, title FROM marketplace_items WHERE id = ? FOR UPDATE");
            $stmt->execute([$item['id']]); $real = $stmt->fetch();
            $qty = intval($item['quantity']); $sub = floatval($real['price']) * $qty;
            if ($real['stock'] < $qty) throw new Exception("Stock agotado: {$real['title']}");
            $total += $sub; $fee = $sub * 0.25; $part = $sub - $fee;
            
            // Pago al vendedor
            $pdo->prepare("UPDATE users SET balance = balance + ? WHERE id = ?")->execute([$part, $real['sellerId']]);
            if ($adminId) $pdo->prepare("UPDATE users SET balance = balance + ? WHERE id = ?")->execute([$fee, $adminId]);
            $pdo->prepare("UPDATE marketplace_items SET stock = stock - ? WHERE id = ?")->execute([$qty, $item['id']]);
            
            // NOTIFICACIÓN: Avisar al vendedor sobre la venta
            require_once 'functions_interactions.php';
            send_direct_notification($pdo, $real['sellerId'], 'SALE', "Vendiste {$qty}x {$real['title']} a @{$buyerName}. Entregar a: {$ship['address']}", "/profile");
        }
        
        // Cobro al comprador
        $pdo->prepare("UPDATE users SET balance = balance - ? WHERE id = ?")->execute([$total, $uid]);
        $pdo->commit(); respond(true);
    } catch (Exception $e) { $pdo->rollBack(); respond(false, null, $e->getMessage()); }
}

function market_get_reviews($pdo, $itemId) {
    $stmt = $pdo->prepare("SELECT r.*, u.username, u.avatarUrl as userAvatarUrl FROM marketplace_reviews r JOIN users u ON r.userId = u.id WHERE r.itemId = ?");
    $stmt->execute([$itemId]); respond(true, $stmt->fetchAll());
}

function market_add_review($pdo, $input) {
    $pdo->prepare("INSERT INTO marketplace_reviews (id, itemId, userId, rating, comment, timestamp) VALUES (?, ?, ?, ?, ?, ?)")
        ->execute([uniqid('r_'), $input['itemId'], $input['userId'], intval($input['rating']), $input['comment'], time()]);
    respond(true);
}

function market_admin_get_items($pdo) {
    $stmt = $pdo->query("SELECT m.*, u.username as sellerName FROM marketplace_items m JOIN users u ON m.sellerId = u.id ORDER BY createdAt DESC");
    respond(true, $stmt->fetchAll());
}
