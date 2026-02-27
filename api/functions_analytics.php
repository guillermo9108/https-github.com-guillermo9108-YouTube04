<?php
/**
 * ANALYTICS - CORE FUNCTIONS V1.0
 */

function analytics_get_detailed_stats($pdo) {
    $now = time();
    $thirtyDaysAgo = $now - (30 * 86400);

    $stats = [
        'users' => [
            'total' => $pdo->query("SELECT COUNT(*) FROM users")->fetchColumn(),
            'active_30d' => $pdo->query("SELECT COUNT(*) FROM users WHERE lastActive > $thirtyDaysAgo")->fetchColumn(),
            'new_30d' => $pdo->query("SELECT COUNT(*) FROM users WHERE id LIKE 'u_%'")->fetchColumn(), // Aproximación
        ],
        'videos' => [
            'total' => $pdo->query("SELECT COUNT(*) FROM videos")->fetchColumn(),
            'total_views' => $pdo->query("SELECT SUM(views) FROM videos")->fetchColumn() ?: 0,
            'storage_estimate' => $pdo->query("SELECT SUM(duration) FROM videos")->fetchColumn() ?: 0, // Segundos totales
        ],
        'revenue' => [
            'total_sales' => $pdo->query("SELECT SUM(amount) FROM transactions WHERE type = 'PURCHASE'")->fetchColumn() ?: 0,
            'total_fees' => $pdo->query("SELECT SUM(adminFee) FROM transactions")->fetchColumn() ?: 0,
            'vip_revenue' => $pdo->query("SELECT SUM(amount) FROM transactions WHERE type = 'VIP'")->fetchColumn() ?: 0,
        ],
        'marketplace' => [
            'total_items' => $pdo->query("SELECT COUNT(*) FROM marketplace_items WHERE status != 'ELIMINADO'")->fetchColumn(),
            'total_sales' => $pdo->query("SELECT COUNT(*) FROM transactions WHERE type = 'MARKET'")->fetchColumn(),
        ]
    ];

    respond(true, $stats);
}

function analytics_get_revenue_chart($pdo) {
    // Agrupar ventas por día en los últimos 30 días
    $thirtyDaysAgo = time() - (30 * 86400);
    $stmt = $pdo->prepare("SELECT DATE(FROM_UNIXTIME(timestamp)) as date, SUM(amount) as total FROM transactions WHERE timestamp > ? GROUP BY DATE(FROM_UNIXTIME(timestamp)) ORDER BY date ASC");
    $stmt->execute([$thirtyDaysAgo]);
    respond(true, $stmt->fetchAll());
}
