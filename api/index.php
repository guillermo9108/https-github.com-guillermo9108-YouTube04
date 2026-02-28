<?php
ob_start();
/**
 * StreamPay - Core Controller V11.8 (Notification & Admin Delete Fix)
 */
ini_set('display_errors', 0); 
error_reporting(E_ALL);
date_default_timezone_set('UTC');

ini_set('max_execution_time', 300);
ini_set('memory_limit', '512M');

header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: POST, GET, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, Range');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    if (ob_get_level()) ob_clean();
    http_response_code(200);
    exit();
}

require_once 'functions_utils.php';

set_error_handler(function($errno, $errstr, $errfile, $errline) {
    if (!(error_reporting() & $errno)) return false;
    write_log("$errstr in $errfile on line $errline", 'ERROR');
    return false;
});

register_shutdown_function(function() {
    $error = error_get_last();
    if ($error && in_array($error['type'], [E_ERROR, E_PARSE, E_CORE_ERROR, E_COMPILE_ERROR])) {
        write_log("FATAL: " . $error['message'], 'FATAL');
        if (ob_get_level()) ob_clean();
        header('Content-Type: application/json; charset=utf-8');
        echo json_encode(['success' => false, 'error' => 'Critical PHP Error: ' . $error['message']]);
    }
});

$configFile = 'db_config.json';
if (!file_exists($configFile)) {
    if (ob_get_level()) ob_clean();
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['success' => false, 'error' => 'Sistema no instalado']);
    exit;
}

$config = json_decode(file_get_contents($configFile), true);

function respond($success, $data = null, $error = null) {
    // Limpiamos cualquier salida previa (espacios, warnings) para que el JSON sea puro
    while (ob_get_level()) ob_end_clean(); 
    header('Content-Type: application/json; charset=utf-8');
    echo json_encode(['success' => $success, 'data' => $data, 'error' => $error], JSON_UNESCAPED_UNICODE);
    exit();
}

try {
    $dsn = "mysql:host={$config['host']};port={$config['port']};dbname={$config['name']};charset=utf8mb4";
    $pdo = new PDO($dsn, $config['user'], $config['password'], [
        PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
        PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC
    ]);
} catch (PDOException $e) {
    respond(false, null, "Error de conexión BD");
}

require_once 'functions_auth.php';
require_once 'functions_videos.php';
require_once 'functions_interactions.php';
require_once 'functions_market.php';
require_once 'functions_admin.php';
require_once 'functions_portability.php';

if (file_exists('functions_ftp.php')) require_once 'functions_ftp.php';
if (file_exists('functions_payment.php')) require_once 'functions_payment.php';

$action = $_GET['action'] ?? '';
$input = json_decode(file_get_contents('php://input'), true) ?? $_POST;

try {
    switch ($action) {
        case 'submit_seller_verification': interact_submit_seller_verification($pdo, $input); break;
        case 'get_seller_verification_requests': admin_get_seller_verification_requests($pdo); break;
        case 'admin_handle_seller_verification': admin_handle_seller_verification($pdo, $input); break;
        case 'submit_manual_vip_request': 
            $uid = $_POST['userId'];
            $planRaw = $_POST['planSnapshot'];
            $plan = json_decode($planRaw, true);
            $text = $_POST['proofText'] ?? null;
            $img = null;
            if (isset($_FILES['proofImage']) && $_FILES['proofImage']['error'] === UPLOAD_ERR_OK) {
                $ext = strtolower(pathinfo($_FILES['proofImage']['name'], PATHINFO_EXTENSION));
                $name = "proof_" . uniqid() . ".{$ext}";
                if (!is_dir('uploads/proofs/')) mkdir('uploads/proofs/', 0777, true);
                move_uploaded_file($_FILES['proofImage']['tmp_name'], 'uploads/proofs/' . $name);
                $img = 'api/uploads/proofs/' . $name;
            }
            $pdo->prepare("INSERT INTO vip_requests (id, userId, planSnapshot, status, createdAt, proofText, proofImageUrl) VALUES (?, ?, ?, 'PENDING', ?, ?, ?)")
                ->execute([uniqid('mpr_'), $uid, $planRaw, time(), $text, $img]);
            send_direct_notification($pdo, $uid, 'SYSTEM', "Tu solicitud de membresía '{$plan['name']}' ha sido recibida y está en espera de revisión.", "/profile");
            respond(true);
            break;
        case 'port_save_backup': port_save_backup($pdo, $_POST, $_FILES); break;
        case 'port_restore_backup': port_restore_backup($pdo, $input); break;
        case 'login': auth_login($pdo, $input); break;
        case 'register': auth_register($pdo, $input); break;
        case 'heartbeat': auth_heartbeat($pdo, $input); break;
        case 'logout': auth_logout($pdo, $input); break;
        case 'get_user': auth_get_user($pdo, $_GET['userId'] ?? ''); break;
        case 'get_all_users': auth_get_all_users($pdo); break;
        case 'search_users': auth_search_users($pdo, $input); break;
        case 'update_user_profile': auth_update_user($pdo, $input); break;
        case 'get_videos': video_get_all($pdo); break;
        case 'get_video': video_get_one($pdo, $_GET['id'] ?? ''); break;
        case 'get_videos_by_creator': video_get_by_creator($pdo, $_GET['userId'] ?? ''); break;
        case 'get_related_videos': video_get_related($pdo, $_GET['videoId'] ?? ''); break;
        case 'get_unprocessed_videos': video_get_unprocessed($pdo); break;
        case 'upload_video': video_upload($pdo, $_POST, $_FILES); break;
        case 'update_video_metadata': video_update_metadata($pdo, $_POST, $_FILES); break;
        case 'delete_video': video_delete($pdo, $input); break;
        case 'get_scan_folders': video_get_scan_folders($pdo); break;
        case 'get_admin_library_stats': video_get_admin_stats($pdo); break;
        case 'scan_local_library': video_scan_local($pdo, $input); break;
        case 'process_scan_batch': video_process_batch($pdo); break;
        case 'smart_organize_library': video_smart_organize($pdo); break;
        case 'reorganize_all_videos': video_reorganize_all($pdo); break;
        case 'fix_library_metadata': video_fix_metadata($pdo); break;
        case 'stream': streamVideo($_GET['id'] ?? '', $pdo); break;
        case 'save_search': interact_save_search($pdo, $input); break;
        case 'get_search_suggestions': interact_get_search_suggestions($pdo, $_GET['q'] ?? ''); break;
        case 'has_purchased': interact_has_purchased($pdo, $_GET['userId'] ?? '', $_GET['videoId'] ?? ''); break;
        case 'purchase_video': interact_purchase($pdo, $input); break;
        case 'purchase_vip_instant': interact_purchase_vip_instant($pdo, $input); break;
        case 'transfer_balance': interact_transfer_balance($pdo, $input); break;
        case 'share_video': interact_share_video($pdo, $input); break;
        case 'rate_video': 
            if (($input['type'] ?? '') === 'view') {
                $pdo->prepare("UPDATE videos SET views = views + 1 WHERE id = ?")->execute([$input['videoId']]);
                respond(true);
            } else {
                interact_rate($pdo, $input); 
            }
            break;
        case 'get_interaction': interact_get($pdo, $_GET['userId'] ?? '', $_GET['videoId'] ?? ''); break;
        case 'mark_watched': interact_mark_watched($pdo, $input); break;
        case 'get_user_activity': interact_get_activity($pdo, $_GET['userId'] ?? ''); break;
        case 'get_comments': interact_get_comments($pdo, $_GET['id'] ?? ''); break;
        case 'add_comment': interact_add_comment($pdo, $input); break;
        case 'get_notifications': interact_get_notifications($pdo, $_GET['userId'] ?? ''); break;
        case 'mark_notification_read': interact_mark_notification_read($pdo, $input); break;
        case 'mark_all_notifications_read': interact_mark_all_notifications_read($pdo, $input); break;
        case 'get_user_transactions': interact_get_transactions($pdo, $_GET['userId'] ?? ''); break;
        case 'toggle_subscribe': interact_toggle_subscribe($pdo, $input); break;
        case 'check_subscription': interact_check_subscription($pdo, $_GET['userId'] ?? '', $_GET['creatorId'] ?? ''); break;
        case 'get_subscriptions': interact_get_subscriptions($pdo, $_GET['userId'] ?? ''); break;
        case 'request_content': interact_request_content($pdo, $input); break;
        case 'create_pay_link': if(function_exists('payment_create_link')) payment_create_link($pdo, $input); else respond(false, null, "Módulo de pago no disponible"); break;
        case 'verify_payment': if(function_exists('payment_verify')) payment_verify($pdo, $input); else respond(false, null, "Módulo de pago no disponible"); break;
        case 'get_marketplace_items': market_get_items($pdo); break;
        case 'get_marketplace_item': market_get_item($pdo, $_GET['id'] ?? ''); break;
        case 'create_listing': market_create_listing($pdo, $_POST, $_FILES); break;
        case 'edit_listing': market_edit_listing($pdo, $input); break;
        case 'checkout_cart': market_checkout($pdo, $input); break;
        case 'admin_delete_listing': market_admin_delete_listing($pdo, $input); break;
        case 'get_reviews': market_get_reviews($pdo, $_GET['itemId'] ?? ''); break;
        case 'add_review': market_add_review($pdo, $input); break;
        case 'get_system_settings': admin_get_settings($pdo); break;
        case 'update_system_settings': admin_update_settings($pdo, $input); break;
        case 'admin_bulk_edit_folder': admin_bulk_edit_folder($pdo, $input); break;
        case 'admin_update_category_price': admin_update_category_price($pdo, $input); break;
        case 'admin_add_balance': admin_add_balance($pdo, $input); break;
        case 'admin_get_marketplace_items': market_admin_get_items($pdo); break;
        case 'get_balance_requests': admin_get_finance_requests($pdo); break;
        case 'handle_balance_request': admin_handle_balance_request($pdo, $input); break;
        case 'handle_vip_request': admin_handle_vip_request($pdo, $input); break;
        case 'get_global_transactions': admin_get_global_transactions($pdo); break;
        case 'admin_repair_db': admin_repair_db($pdo, $input); break;
        case 'admin_cleanup_files': admin_cleanup_files($pdo); break;
        case 'admin_get_local_stats': admin_get_local_stats($pdo); break;
        case 'admin_get_logs': admin_get_logs(); break;
        case 'admin_clear_logs': admin_clear_logs(); break;
        case 'get_real_stats': get_real_stats($pdo); break;
        case 'get_requests': admin_get_requests($pdo, $_GET['status'] ?? 'ALL'); break;
        case 'delete_request': admin_delete_request($pdo, $input); break;
        case 'update_request_status': admin_update_request_status($pdo, $input); break;
        case 'admin_get_transcode_profiles': admin_get_transcode_profiles($pdo); break;
        case 'admin_save_transcode_profile': admin_save_transcode_profile($pdo, $input); break;
        case 'admin_delete_transcode_profile': admin_delete_transcode_profile($pdo, $_GET['extension'] ?? ''); break;
        case 'admin_transcode_scan_filters': admin_transcode_scan_filters($pdo, $input); break;
        case 'admin_transcode_batch': admin_transcode_batch($pdo); break;
        case 'admin_process_next_transcode': admin_process_next_transcode($pdo); break;
        case 'admin_stop_transcoder': admin_stop_transcoder($pdo); break;
        case 'admin_get_transcode_log': admin_get_transcode_log(); break;
        case 'admin_retry_failed_transcodes': admin_retry_failed_transcodes($pdo); break;
        case 'admin_clear_transcode_queue': admin_clear_transcode_queue($pdo); break;
        case 'admin_remove_from_queue': admin_remove_from_queue($pdo, $_GET['videoId'] ?? ''); break;
        case 'admin_skip_transcode': admin_skip_transcode($pdo, $_GET['videoId'] ?? ''); break;
        case 'admin_smart_cleaner_preview': admin_smart_cleaner_preview($pdo, $input); break;
        case 'admin_smart_cleaner_execute': admin_smart_cleaner_execute($pdo, $input); break;
        case 'admin_file_cleanup_preview': admin_file_cleanup_preview($pdo, $_GET['type'] ?? ''); break;
        case 'admin_organize_paquete': admin_organize_paquete($pdo, $input); break;
        case 'list_ftp_files': if(function_exists('listFtpFiles')) listFtpFiles($pdo, $_GET['path'] ?? '/'); else respond(false, null, "Módulo FTP no disponible"); break;
        case 'import_ftp_file': if(function_exists('importFtpFile')) importFtpFile($pdo, $input); else respond(false, null, "Módulo FTP no disponible"); break;
        case 'scan_ftp_recursive': if(function_exists('scanFtpRecursive')) scanFtpRecursive($pdo, $input); else respond(false, null, "Módulo FTP no disponible"); break;
        default: respond(false, null, "Acción desconocida: $action"); break;
    }
} catch (Exception $e) {
    respond(false, null, $e->getMessage());
}
?>