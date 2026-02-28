<?php
function getTropipayToken($clientId, $clientSecret) {
    $curl = curl_init();
    curl_setopt_array($curl, [
        CURLOPT_URL => "https://tropipay.com/api/v2/access/token",
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_POST => true,
        CURLOPT_POSTFIELDS => json_encode([
            "grant_type" => "client_credentials",
            "client_id" => $clientId,
            "client_secret" => $clientSecret,
            "scope" => "allow_payment_link_creation"
        ]),
        CURLOPT_HTTPHEADER => ["Content-Type: application/json"],
        CURLOPT_SSL_VERIFYPEER => false
    ]);
    $response = curl_exec($curl);
    curl_close($curl);
    $json = json_decode($response, true);
    if (!isset($json['access_token'])) throw new Exception("Tropipay Auth Error");
    return $json['access_token'];
}

function interact_create_pay_link($pdo, $input) {
    $userId = $input['userId'];
    $plan = $input['plan'];
    $stmtS = $pdo->query("SELECT tropipayClientId, tropipayClientSecret FROM system_settings LIMIT 1");
    $s = $stmtS->fetch();
    try {
        $token = getTropipayToken($s['tropipayClientId'], $s['tropipayClientSecret']);
        $ref = 'PAY_' . uniqid();
        $curl = curl_init();
        curl_setopt_array($curl, [
            CURLOPT_URL => "https://tropipay.com/api/v2/paymentcards",
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_POST => true,
            CURLOPT_POSTFIELDS => json_encode([
                "amount" => floatval($plan['price']) * 100, // Tropipay usa centavos
                "currency" => "EUR",
                "reference" => $ref,
                "concept" => "StreamPay: " . $plan['name'],
                "description" => "Upgrade a Premium / Recarga Saldo",
                "lang" => "es"
            ]),
            CURLOPT_HTTPHEADER => ["Content-Type: application/json", "Authorization: Bearer $token"],
            CURLOPT_SSL_VERIFYPEER => false
        ]);
        $response = curl_exec($curl);
        curl_close($curl);
        $json = json_decode($response, true);
        if (isset($json['shortUrl'])) {
            $pdo->prepare("INSERT INTO vip_requests (id, userId, planSnapshot, paymentRef, status, createdAt) VALUES (?, ?, ?, ?, 'PENDING', ?)")
                ->execute([uniqid('vp_'), $userId, json_encode($plan), $ref, time()]);
            respond(true, ['paymentUrl' => $json['shortUrl']]);
        }
        throw new Exception("Error generando link de pago");
    } catch (Exception $e) { respond(false, null, $e->getMessage()); }
}

function payment_verify($pdo, $input) {
    $ref = $input['reference'];
    $userId = $input['userId'];
    $stmt = $pdo->prepare("SELECT * FROM vip_requests WHERE paymentRef = ? AND userId = ? AND status = 'PENDING'");
    $stmt->execute([$ref, $userId]);
    $req = $stmt->fetch();
    if (!$req) respond(false, null, 'No hay pagos pendientes para esta referencia');
    $stmtS = $pdo->query("SELECT tropipayClientId, tropipayClientSecret FROM system_settings LIMIT 1");
    $s = $stmtS->fetch();
    try {
        $token = getTropipayToken($s['tropipayClientId'], $s['tropipayClientSecret']);
        $curl = curl_init();
        curl_setopt_array($curl, [
            CURLOPT_URL => "https://tropipay.com/api/v2/movements?reference=$ref",
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_HTTPHEADER => ["Authorization: Bearer $token"],
            CURLOPT_SSL_VERIFYPEER => false
        ]);
        $res = json_decode(curl_exec($curl), true);
        curl_close($curl);
        if (isset($res['rows'][0]) && $res['rows'][0]['status'] === 'COMPLETED') {
            $plan = json_decode($req['planSnapshot'], true);
            $pdo->beginTransaction();
            $pdo->prepare("UPDATE vip_requests SET status = 'APPROVED' WHERE id = ?")->execute([$req['id']]);
            if (($plan['type'] ?? '') === 'BALANCE') {
                $pdo->prepare("UPDATE users SET balance = balance + ? WHERE id = ?")->execute([$plan['price'], $userId]);
                $pdo->prepare("INSERT INTO transactions (id, buyerId, amount, type, timestamp, videoTitle, isExternal) VALUES (?, ?, ?, 'DEPOSIT', ?, ?, 1)")
                    ->execute([uniqid('tx_auto_'), $userId, $plan['price'], time(), $plan['name']]);
            } else {
                $days = intval($plan['durationDays'] ?? 30);
                $newExpiry = max(time(), intval($pdo->query("SELECT vipExpiry FROM users WHERE id = '$userId'")->fetchColumn())) + ($days * 86400);
                $pdo->prepare("UPDATE users SET vipExpiry = ? WHERE id = ?")->execute([$newExpiry, $userId]);
                $pdo->prepare("INSERT INTO transactions (id, buyerId, amount, type, timestamp, videoTitle, isExternal) VALUES (?, ?, ?, 'VIP', ?, ?, 1)")
                    ->execute([uniqid('tx_vip_'), $userId, $plan['price'], time(), $plan['name']]);
            }
            $pdo->commit();
            respond(true, ['message' => 'Activación completada']);
        }
        respond(false, null, 'Pago aún no verificado');
    } catch (Exception $e) { respond(false, null, $e->getMessage()); }
}
?>