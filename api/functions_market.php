<?php
/**
 * MARKETPLACE - CORE FUNCTIONS V13.0 (Full Integration & Notifications)
 */

function market_get_items($pdo) {
    $stmt = $pdo->query("SELECT m.*, m.itemCondition as `condition`, u.username as sellerName, u.avatarUrl as sellerAvatarUrl FROM marketplace_items m LEFT JOIN users u ON m.sellerId = u.id WHERE status != 'ELIMINADO' ORDER BY createdAt DESC");
    $items = $stmt->fetchAll();
    foreach ($items as &$i) { 
        $i['images'] = json_decode($i['images'] ?: '[]', true); 
        $i['tags'] = json_decode($i['tags'] ?: '[]', true); 
        if (is_array($i['images'])) {
            foreach ($i['images'] as &$img) $img = fix_url($img);
        }
        $i['sellerAvatarUrl'] = fix_url($i['sellerAvatarUrl']); 
    }
    respond(true, $items);
}

function market_get_item($pdo, $id) {
    $stmt = $pdo->prepare("SELECT m.*, m.itemCondition as `condition`, u.username as sellerName, u.avatarUrl as sellerAvatarUrl, u.is_verified_seller as isVerifiedSeller FROM marketplace_items m LEFT JOIN users u ON m.sellerId = u.id WHERE m.id = ?");
    $stmt->execute([$id]); $i = $stmt->fetch();
    if ($i) { 
        $pdo->prepare("UPDATE marketplace_items SET popularity = popularity + 1 WHERE id = ?")->execute([$id]);
        $i['images'] = json_decode($i['images'] ?: '[]', true); 
        $i['tags'] = json_decode($i['tags'] ?: '[]', true); 
        if (is_array($i['images'])) {
            foreach ($i['images'] as &$img) $img = fix_url($img);
        }
        $i['sellerAvatarUrl'] = fix_url($i['sellerAvatarUrl']); 
        respond(true, $i); 
    }
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
    $isFlashSale = (isset($post['isFlashSale']) && ($post['isFlashSale'] === 'true' || $post['isFlashSale'] === '1')) ? 1 : 0;
    $pdo->prepare("INSERT INTO marketplace_items (id, title, description, price, originalPrice, stock, images, sellerId, category, itemCondition, isFlashSale, tags, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
        ->execute([$id, $post['title'], $post['description'], floatval($post['price']), floatval($post['price']), intval($post['stock']), json_encode($imgs), $post['sellerId'], $post['category'], $post['condition'], $isFlashSale, $post['tags'] ?? '[]', time()]);
    
    // NOTIFICACIÓN: Avisar a seguidores del vendedor
    require_once 'functions_interactions.php';
    interact_notify_subscribers($pdo, $post['sellerId'], 'SYSTEM', "Nuevo artículo a la venta: {$post['title']}", "/marketplace/{$id}");
    
    respond(true);
}

function market_edit_listing($pdo, $input) {
    $id = $input['id']; $data = $input['data'];
    
    // Obtener precio actual y original
    $stmt = $pdo->prepare("SELECT price, originalPrice, title FROM marketplace_items WHERE id = ?");
    $stmt->execute([$id]); $old = $stmt->fetch();
    
    $allowed = ['title', 'description', 'price', 'stock', 'status', 'isFlashSale', 'tags']; $fields = []; $params = [];
    $newPrice = isset($data['price']) ? floatval($data['price']) : floatval($old['price']);
    $origPrice = floatval($old['originalPrice'] ?: $old['price']);
    
    // Si el nuevo precio es menor que el original, calculamos descuento
    $discount = 0;
    if ($newPrice < $origPrice) {
        $discount = round((($origPrice - $newPrice) / $origPrice) * 100);
    } else if ($newPrice > $origPrice) {
        // Si el usuario sube el precio por encima del original, el nuevo precio se vuelve el original
        $origPrice = $newPrice;
        $discount = 0;
    }
    
    $data['discountPercent'] = $discount;
    $data['originalPrice'] = $origPrice;
    if (isset($data['tags']) && is_array($data['tags'])) {
        $data['tags'] = json_encode($data['tags']);
    }
    $allowed[] = 'discountPercent';
    $allowed[] = 'originalPrice';

    foreach ($data as $k => $v) { 
        if (in_array($k, $allowed)) { 
            $fields[] = "$k = ?"; 
            $params[] = $v; 
        } 
    }
    $params[] = $id; 
    $pdo->prepare("UPDATE marketplace_items SET " . implode(', ', $fields) . " WHERE id = ?")->execute($params);
    
    // NOTIFICACIÓN: Si el precio bajó, avisar a interesados
    if ($newPrice < floatval($old['price'])) {
        $stmtA = $pdo->prepare("SELECT userId FROM price_alerts WHERE itemId = ?");
        $stmtA->execute([$id]); $users = $stmtA->fetchAll(PDO::FETCH_COLUMN);
        require_once 'functions_interactions.php';
        foreach ($users as $uid) {
            send_direct_notification($pdo, $uid, 'SYSTEM', "¡Bajó de precio! {$old['title']} ahora cuesta \${$newPrice}", "/marketplace/{$id}");
        }
    }
    
    respond(true);
}

function market_toggle_price_alert($pdo, $input) {
    $uid = $input['userId']; $iid = $input['itemId'];
    $check = $pdo->prepare("SELECT COUNT(*) FROM price_alerts WHERE userId = ? AND itemId = ?");
    $check->execute([$uid, $iid]);
    if ($check->fetchColumn() > 0) {
        $pdo->prepare("DELETE FROM price_alerts WHERE userId = ? AND itemId = ?")->execute([$uid, $iid]);
        $active = false;
    } else {
        $pdo->prepare("INSERT INTO price_alerts (userId, itemId, createdAt) VALUES (?, ?, ?)")->execute([$uid, $iid, time()]);
        $active = true;
    }
    respond(true, ['active' => $active]);
}

function market_check_price_alert($pdo, $uid, $iid) {
    $stmt = $pdo->prepare("SELECT COUNT(*) FROM price_alerts WHERE userId = ? AND itemId = ?");
    $stmt->execute([$uid, $iid]);
    respond(true, ['active' => $stmt->fetchColumn() > 0]);
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
            $pdo->prepare("UPDATE marketplace_items SET stock = stock - ?, salesCount = salesCount + ? WHERE id = ?")->execute([$qty, $qty, $item['id']]);
            $pdo->prepare("UPDATE marketplace_items SET status = 'AGOTADO' WHERE id = ? AND stock <= 0")->execute([$item['id']]);
            
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
    $stmt->execute([$itemId]); 
    $reviews = $stmt->fetchAll();
    foreach ($reviews as &$r) {
        $r['userAvatarUrl'] = fix_url($r['userAvatarUrl']);
    }
    respond(true, $reviews);
}

function market_add_review($pdo, $input) {
    $pdo->prepare("INSERT INTO marketplace_reviews (id, itemId, userId, rating, comment, timestamp) VALUES (?, ?, ?, ?, ?, ?)")
        ->execute([uniqid('r_'), $input['itemId'], $input['userId'], intval($input['rating']), $input['comment'], time()]);
    respond(true);
}

function market_admin_get_items($pdo) {
    $stmt = $pdo->query("SELECT m.*, u.username as sellerName FROM marketplace_items m JOIN users u ON m.sellerId = u.id ORDER BY createdAt DESC");
    $items = $stmt->fetchAll();
    foreach ($items as &$i) {
        $i['images'] = json_decode($i['images'] ?: '[]', true);
        if (is_array($i['images'])) {
            foreach ($i['images'] as &$img) $img = fix_url($img);
        }
    }
    respond(true, $items);
}

function market_get_my_sales($pdo, $userId) {
    $stmt = $pdo->prepare("SELECT t.*, u.username as buyerName FROM transactions t JOIN users u ON t.buyerId = u.id WHERE t.creatorId = ? AND t.type = 'MARKET_PURCHASE' ORDER BY t.timestamp DESC");
    $stmt->execute([$userId]);
    respond(true, $stmt->fetchAll());
}
