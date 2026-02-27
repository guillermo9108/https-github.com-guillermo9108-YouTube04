<?php

// --- TROPIPAY INTEGRATION V2.3 (Inverse Rate Support - 2x1 Logic) ---

function getTropipayToken($clientId, $clientSecret) {
    $curl = curl_init();
    $data = json_encode([
        "grant_type" => "client_credentials",
        "client_id" => $clientId,
        "client_secret" => $clientSecret,
        "scope" => "allow_payment_link_creation"
    ]);

    curl_setopt_array($curl, [
        CURLOPT_URL => "https://tropipay.com/api/v2/access/token",
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_ENCODING => "",
        CURLOPT_MAXREDIRS => 10,
        CURLOPT_TIMEOUT => 30,
        CURLOPT_HTTP_VERSION => CURL_HTTP_VERSION_1_1,
        CURLOPT_CUSTOMREQUEST => "POST",
        CURLOPT_POSTFIELDS => $data,
        CURLOPT_SSL_VERIFYPEER => false,
        CURLOPT_SSL_VERIFYHOST => false,
        CURLOPT_HTTPHEADER => [
            "Content-Type: application/json"
        ],
    ]);

    $response = curl_exec($curl);
    $err = curl_error($curl);
    curl_close($curl);

    if ($err) throw new Exception("cURL Error: " . $err);
    
    $json = json_decode($response, true);
    if (!isset($json['access_token'])) throw new Exception("Tropipay Auth Failed: " . ($json['error'] ?? 'Unknown'));
    
    return $json['access_token'];
}

function payment_create_link($pdo, $input) {
    $userId = $input['userId'];
    $plan = $input['plan'];

    $stmtS = $pdo->query("SELECT tropipayClientId, tropipayClientSecret, paymentMethods FROM system_settings LIMIT 1");
    $settings = $stmtS->fetch(PDO::FETCH_ASSOC);

    $methods = json_decode($settings['paymentMethods'] ?? '{}', true);
    $tropiConfig = $methods['tropipay'] ?? ['exchangeRate' => 1, 'currencySymbol' => 'EUR'];

    $rate = floatval($tropiConfig['exchangeRate'] ?? 1);
    if ($rate <= 0) $rate = 1;
    $currency = $tropiConfig['currencySymbol'] ?? 'EUR';
    
    // CORRECCIÓN LÓGICA: DIVIDIR PRECIO POR TASA (2x1 -> Precio 100 / Tasa 2 = Paga 50)
    // Tropipay requiere el monto en centavos (monto * 100)
    $finalAmount = round((floatval($plan['price']) / $rate) * 100);
    
    try {
        $token = getTropipayToken($settings['tropipayClientId'], $settings['tropipayClientSecret']);
        $ref = 'tp_' . uniqid();

        // 1. Crear el PayLink en Tropipay
        $curl = curl_init();
        $payload = json_encode([
            "amount" => $finalAmount,
            "currency" => $currency,
            "description" => "VIP Plan: " . $plan['name'],
            "reference" => $ref,
            "urlSuccess" => "http://" . $_SERVER['HTTP_HOST'] . "/#/profile",
            "urlFailed" => "http://" . $_SERVER['HTTP_HOST'] . "/#/vip",
            "serviceId" => 1,
            "lang" => "es"
        ]);

        curl_setopt_array($curl, [
            CURLOPT_URL => "https://tropipay.com/api/v2/paymentcards",
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_SSL_VERIFYPEER => false,
            CURLOPT_SSL_VERIFYHOST => false,
            CURLOPT_CUSTOMREQUEST => "POST",
            CURLOPT_POSTFIELDS => $payload,
            CURLOPT_HTTPHEADER => [
                "Authorization: Bearer " . $token,
                "Content-Type: application/json"
            ],
        ]);

        $response = curl_exec($curl);
        curl_close($curl);
        $resJson = json_decode($response, true);

        if (!isset($resJson['shortUrl'])) {
            throw new Exception("Error al crear PayLink: " . ($resJson['error']['message'] ?? 'Respuesta inválida'));
        }

        // 2. Registrar la solicitud en la base de datos para seguimiento
        $pdo->prepare("INSERT INTO vip_requests (id, userId, planSnapshot, status, createdAt, paymentRef) VALUES (?, ?, ?, 'PENDING', ?, ?)")
            ->execute([uniqid('vpr_'), $userId, json_encode($plan), time(), $ref]);

        respond(true, ['paymentUrl' => $resJson['shortUrl']]);

    } catch (Exception $e) {
        respond(false, null, $e->getMessage());
    }
}

function payment_verify($pdo, $input) {
    $ref = $input['reference'];
    $userId = $input['userId'];
    
    $stmt = $pdo->prepare("SELECT * FROM vip_requests WHERE paymentRef = ? AND userId = ? AND status = 'PENDING'");
    $stmt->execute([$ref, $userId]);
    $req = $stmt->fetch(PDO::FETCH_ASSOC);
    
    if (!$req) respond(false, null, 'Solicitud no encontrada o ya procesada.');

    $stmtS = $pdo->query("SELECT tropipayClientId, tropipayClientSecret FROM system_settings LIMIT 1");
    $s = $stmtS->fetch(PDO::FETCH_ASSOC);
    
    try {
        $token = getTropipayToken($s['tropipayClientId'], $s['tropipayClientSecret']);
        
        $curl = curl_init();
        curl_setopt_array($curl, [
            CURLOPT_URL => "https://tropipay.com/api/v2/movements?reference=" . $ref,
            CURLOPT_RETURNTRANSFER => true,
            CURLOPT_SSL_VERIFYPEER => false,
            CURLOPT_SSL_VERIFYHOST => false,
            CURLOPT_HTTPHEADER => ["Authorization: Bearer " . $token],
        ]);
        
        $response = curl_exec($curl);
        curl_close($curl);
        
        $json = json_decode($response, true);
        $rows = $json['rows'] ?? [];
        
        $validPayment = false;
        foreach ($rows as $row) {
            if ($row['reference'] === $ref && $row['status'] === 'COMPLETED') {
                $validPayment = true;
                break;
            }
        }
        
        if ($validPayment) {
            $plan = json_decode($req['planSnapshot'], true);
            $pdo->beginTransaction();
            
            $pdo->prepare("UPDATE vip_requests SET status = 'APPROVED' WHERE id = ?")->execute([$req['id']]);
            
            if ($plan['type'] === 'BALANCE') {
                $priceBase = floatval($plan['price']);
                $bonusPercent = floatval($plan['bonusPercent'] ?? 0);
                $bonusAmount = $priceBase * ($bonusPercent / 100);
                $totalCredit = $priceBase + $bonusAmount;

                // 1. Acreditar saldo total al usuario
                $pdo->prepare("UPDATE users SET balance = balance + ? WHERE id = ?")->execute([$totalCredit, $userId]);
                
                // 2. Registrar el Dinero Real (isExternal = 1)
                $pdo->prepare("INSERT INTO transactions (id, buyerId, amount, type, timestamp, videoTitle, isExternal) VALUES (?, ?, ?, 'DEPOSIT', ?, ?, 1)")
                    ->execute([uniqid('tx_cash_auto_'), $userId, $priceBase, time(), $plan['name']]);
                
                // 3. Registrar el Bono (isExternal = 0)
                if ($bonusAmount > 0) {
                    $pdo->prepare("INSERT INTO transactions (id, buyerId, amount, type, timestamp, videoTitle, isExternal) VALUES (?, ?, ?, 'DEPOSIT', ?, ?, 0)")
                        ->execute([uniqid('tx_bonus_auto_'), $userId, $bonusAmount, time(), "Bono: " . $plan['name']]);
                }
                    
            } else {
                $days = intval($plan['durationDays']);
                $seconds = $days * 86400;
                $now = time();
                $stmtUser = $pdo->prepare("SELECT vipExpiry FROM users WHERE id = ?");
                $stmtUser->execute([$userId]);
                $currentExpiry = intval($stmtUser->fetchColumn());
                $newStart = ($currentExpiry > $now) ? $currentExpiry : $now;
                $newExpiry = $newStart + $seconds;
                $pdo->prepare("UPDATE users SET vipExpiry = ? WHERE id = ?")->execute([$newExpiry, $userId]);
                
                // Membresía de Acceso es 100% externo
                $pdo->prepare("INSERT INTO transactions (id, buyerId, amount, timestamp, type, videoTitle, isExternal) VALUES (?, ?, ?, ?, 'VIP', ?, 1)")
                    ->execute([uniqid('tx_vip_auto_'), $userId, $plan['price'], time(), $plan['name']]);
            }
            
            $nid = uniqid('n_');
            $pdo->prepare("INSERT INTO notifications (id, userId, type, text, link, isRead, timestamp) VALUES (?, ?, 'SYSTEM', ?, '/profile', 0, ?)")
                ->execute([$nid, $userId, "Pago confirmado. Plan '{$plan['name']}' activado.", time()]);
            
            $pdo->commit();
            respond(true, ['message' => 'VIP Activado Exitosamente']);
        } else {
            respond(false, null, 'Pago no encontrado o pendiente en Tropipay. Intenta de nuevo en unos minutos.');
        }
    } catch (Exception $e) {
        respond(false, null, $e->getMessage());
    }
}
