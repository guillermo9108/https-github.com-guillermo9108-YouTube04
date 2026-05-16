<?php
/**
 * CHALLENGES & REWARDS - Dedicated Logic V1.0
 */

function check_weekly_upload_challenge($pdo, $userId) {
    $settingsStmt = $pdo->query("SELECT weekly_challenge_enabled, weekly_challenge_goal, weekly_challenge_reward FROM system_settings WHERE id = 1");
    $settings = $settingsStmt->fetch();
    
    if (!$settings || !($settings['weekly_challenge_enabled'])) return;
    
    $goal = (int)$settings['weekly_challenge_goal'];
    $reward = (int)$settings['weekly_challenge_reward'];
    if ($goal <= 0) return;

    $userStmt = $pdo->prepare("SELECT weeklyUploadCount, lastUploadChallengeWeek, vipExpiry, totalExtraDaysWon FROM users WHERE id = ?");
    $userStmt->execute([$userId]);
    $user = $userStmt->fetch();
    
    if (!$user) return;

    // ISO Week: YYYY-WW (e.g. 2026-20)
    $currentWeek = date('Y-W');
    $userWeek = $user['lastUploadChallengeWeek'];
    $count = ($userWeek === $currentWeek) ? (int)$user['weeklyUploadCount'] : 0;
    
    // Incrementar contador
    $count++;
    
    $newExpiry = null;
    $totalWon = (int)$user['totalExtraDaysWon'];
    
    if ($count >= $goal) {
        $now = time();
        $currentExpiry = (int)$user['vipExpiry'];
        $baseTime = ($currentExpiry > $now) ? $currentExpiry : $now;
        $newExpiry = $baseTime + ($reward * 86400);
        $totalWon += $reward;
        
        // Reiniciar contador para la semana (o simplemente dejarlo en goal si solo se puede ganar una vez por semana)
        // El requerimiento dice: "subir 1 video en la semana = +1 día"
        // Si queremos que pueda ganar varias veces, restamos goal. 
        // Pero suele ser "1 reto por semana". Lo limitaré a 1 vez por semana por ahora si el usuario llegó al tope.
        // O mejor: restamos goal para que si sube 10 videos y la meta es 1 (poco probable), gane 10 días? 
        // No, hagamoslo "Llegar a la meta semanal".
        $count = 0; 
        
        $pdo->prepare("UPDATE users SET weeklyUploadCount = ?, lastUploadChallengeWeek = ?, vipExpiry = ?, totalExtraDaysWon = ? WHERE id = ?")
            ->execute([$count, $currentWeek, $newExpiry, $totalWon, $userId]);
            
        // Notificar
        require_once __DIR__ . '/functions_app.php';
        send_direct_notification($pdo, $userId, 'SYSTEM', "¡Reto Semanal Cumplido! Has ganado {$reward} día(s) de Acceso Total por subir contenido esta semana.", "/profile");
    } else {
        $pdo->prepare("UPDATE users SET weeklyUploadCount = ?, lastUploadChallengeWeek = ? WHERE id = ?")
            ->execute([$count, $currentWeek, $userId]);
    }
}
