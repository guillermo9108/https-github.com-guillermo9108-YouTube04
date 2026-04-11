<?php
/**
 * StreamPay - Tropipay Webhook Receiver V1.0
 * Este archivo debe configurarse como "Notification URL" en tu cuenta de Tropipay.
 */

require_once 'functions_utils.php';
require_once 'functions_payment.php';

// 1. Obtener Configuración de Base de Datos
$configFile = 'db_config.json';
if (!file_exists($configFile)) exit("Sistema no instalado");
$config = json_decode(file_get_contents($configFile), true);

try {
    $dsn = "mysql:host={$config['host']};port={$config['port']};dbname={$config['name']};charset=utf8mb4";
    $pdo = new PDO($dsn, $config['user'], $config['password'], [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC
    ]);
} catch (Exception $e) { 
    write_log("WEBHOOK DB ERROR: " . $e->getMessage(), 'ERROR');
    exit; 
}

// 2. Leer Payload de Tropipay
$payload = file_get_contents('php://input');
$data = json_decode($payload, true);

if (!$data) {
    write_log("WEBHOOK: Recibida petición sin datos válidos.", 'WARNING');
    http_response_code(400);
    exit;
}

write_log("WEBHOOK: Payload recibido de Tropipay: " . $payload, 'INFO');

// 3. Procesar Transacción
// Tropipay suele enviar 'reference' y 'status'
$reference = $data['reference'] ?? ($data['data']['reference'] ?? null);
$status = strtolower($data['status'] ?? ($data['data']['status'] ?? ''));

if ($reference && ($status === 'paid' || $status === 'completed' || $status === 'ok')) {
    
    // Buscar la solicitud pendiente en nuestra DB
    $stmt = $pdo->prepare("SELECT * FROM vip_requests WHERE paymentRef = ? AND status = 'PENDING'");
    $stmt->execute([$reference]);
    $request = $stmt->fetch();

    if ($request) {
        $res = payment_apply_plan($pdo, $request['id']);
        if ($res) {
            write_log("WEBHOOK: Pago AUTOMÁTICO procesado con éxito para Ref: $reference", 'INFO');
            http_response_code(200);
            echo "OK";
        } else {
            write_log("WEBHOOK: Fallo al aplicar plan para Ref: $reference", 'ERROR');
            http_response_code(500);
        }
    } else {
        write_log("WEBHOOK: Referencia $reference no encontrada o ya procesada.", 'INFO');
        http_response_code(200); // Respondemos 200 para que Tropipay no reintente infinitamente
    }
} else {
    write_log("WEBHOOK: Estado de pago no apto para procesar ($status).", 'INFO');
    http_response_code(200);
}
?>
