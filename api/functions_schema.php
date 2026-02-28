
<?php
// DEFINICIÓN DEL ESQUEMA MAESTRO V1.6 (Identity Verification)
function getAppSchema() {
    return [
        'users' => [
            'cols' => [
                'id' => 'VARCHAR(50) PRIMARY KEY',
                'username' => 'VARCHAR(50) UNIQUE NOT NULL',
                'password_hash' => 'VARCHAR(255) NOT NULL',
                'role' => "ENUM('USER', 'ADMIN') DEFAULT 'USER'",
                'balance' => 'DECIMAL(10, 2) DEFAULT 0.00',
                'autoPurchaseLimit' => 'DECIMAL(10, 2) DEFAULT 1.00',
                'watchLater' => 'JSON',
                'currentSessionId' => 'VARCHAR(64) DEFAULT NULL',
                'lastActive' => 'BIGINT DEFAULT 0',
                'lastDeviceId' => 'VARCHAR(100) DEFAULT NULL',
                'avatarUrl' => 'VARCHAR(255) DEFAULT NULL',
                'defaultPrices' => 'JSON DEFAULT NULL',
                'shippingDetails' => 'JSON DEFAULT NULL',
                'vipExpiry' => 'BIGINT DEFAULT 0',
                'is_verified_seller' => 'TINYINT(1) DEFAULT 0'
            ]
        ],
        'videos' => [
            'cols' => [
                'id' => 'VARCHAR(50) PRIMARY KEY',
                'title' => 'VARCHAR(255) NOT NULL',
                'description' => 'TEXT',
                'price' => 'DECIMAL(10, 2) DEFAULT 0.00',
                'thumbnailUrl' => 'TEXT',
                'videoUrl' => 'TEXT',
                'creatorId' => 'VARCHAR(50)',
                'views' => 'INT DEFAULT 0',
                'createdAt' => 'BIGINT',
                'likes' => 'INT DEFAULT 0',
                'dislikes' => 'INT DEFAULT 0',
                'category' => "VARCHAR(100) DEFAULT 'GENERAL'",
                'parent_category' => "VARCHAR(100) DEFAULT NULL",
                'collection' => "VARCHAR(100) DEFAULT NULL",
                'duration' => 'INT DEFAULT 0',
                'fileHash' => 'VARCHAR(32)',
                'isLocal' => 'TINYINT(1) DEFAULT 0',
                'is_audio' => 'TINYINT(1) DEFAULT 0',
                'processing_attempts' => 'INT DEFAULT 0',
                'needs_transcode' => 'TINYINT(1) DEFAULT 0',
                'transcode_status' => "ENUM('NONE', 'WAITING', 'PROCESSING', 'DONE', 'FAILED') DEFAULT 'NONE'",
                'transcode_progress' => 'INT DEFAULT 0',
                'reason' => 'TEXT DEFAULT NULL',
                'locked_at' => 'BIGINT DEFAULT 0'
            ],
            'indices' => [
                'idx_category' => 'category',
                'idx_parent_category' => 'parent_category',
                'idx_created_at' => 'createdAt',
                'idx_creator_id' => 'creatorId'
            ]
        ],
        'requests' => [
            'cols' => [
                'id' => 'VARCHAR(50) PRIMARY KEY',
                'userId' => 'VARCHAR(50)',
                'query' => 'TEXT',
                'status' => "ENUM('PENDING', 'COMPLETED', 'FAILED') DEFAULT 'PENDING'",
                'createdAt' => 'BIGINT',
                'isVip' => 'TINYINT(1) DEFAULT 0'
            ]
        ],
        'search_history' => [
            'cols' => [
                'term' => 'VARCHAR(100) PRIMARY KEY',
                'count' => 'INT DEFAULT 1',
                'last_searched' => 'BIGINT'
            ]
        ],
        'marketplace_items' => [
            'cols' => [
                'id' => 'VARCHAR(50) PRIMARY KEY',
                'title' => 'VARCHAR(255) NOT NULL',
                'description' => 'TEXT',
                'price' => 'DECIMAL(10, 2)',
                'originalPrice' => 'DECIMAL(10, 2)',
                'discountPercent' => 'INT DEFAULT 0',
                'stock' => 'INT DEFAULT 1',
                'images' => 'JSON',
                'sellerId' => 'VARCHAR(50)',
                'category' => 'VARCHAR(100)',
                'itemCondition' => 'VARCHAR(50)',
                'status' => "ENUM('ACTIVO', 'AGOTADO', 'ELIMINADO') DEFAULT 'ACTIVO'",
                'createdAt' => 'BIGINT'
            ]
        ],
        'marketplace_reviews' => [
            'cols' => [
                'id' => 'VARCHAR(50) PRIMARY KEY',
                'itemId' => 'VARCHAR(50)',
                'userId' => 'VARCHAR(50)',
                'rating' => 'INT',
                'comment' => 'TEXT',
                'timestamp' => 'BIGINT'
            ]
        ],
        'subscriptions' => [
            'cols' => [
                'subscriberId' => 'VARCHAR(50)',
                'creatorId' => 'VARCHAR(50)',
                'createdAt' => 'BIGINT'
            ],
            'pk' => 'PRIMARY KEY (subscriberId, creatorId)'
        ],
        'comments' => [
            'cols' => [
                'id' => 'VARCHAR(50) PRIMARY KEY',
                'videoId' => 'VARCHAR(50)',
                'userId' => 'VARCHAR(50)',
                'text' => 'TEXT',
                'timestamp' => 'BIGINT'
            ]
        ],
        'balance_requests' => [
            'cols' => [
                'id' => 'VARCHAR(50) PRIMARY KEY',
                'userId' => 'VARCHAR(50)',
                'amount' => 'DECIMAL(10, 2)',
                'status' => "ENUM('PENDING', 'APPROVED', 'REJECTED') DEFAULT 'PENDING'",
                'createdAt' => 'BIGINT'
            ]
        ],
        'vip_requests' => [
            'cols' => [
                'id' => 'VARCHAR(50) PRIMARY KEY',
                'userId' => 'VARCHAR(50)',
                'planSnapshot' => 'JSON',
                'paymentRef' => 'VARCHAR(100)',
                'proofText' => 'TEXT DEFAULT NULL',
                'proofImageUrl' => 'VARCHAR(255) DEFAULT NULL',
                'status' => "ENUM('PENDING', 'APPROVED', 'REJECTED') DEFAULT 'PENDING'",
                'createdAt' => 'BIGINT'
            ]
        ],
        'seller_verifications' => [
            'cols' => [
                'id' => 'VARCHAR(50) PRIMARY KEY',
                'userId' => 'VARCHAR(50)',
                'fullName' => 'VARCHAR(100)',
                'idNumber' => 'VARCHAR(50)',
                'address' => 'TEXT',
                'mobile' => 'VARCHAR(20)',
                'status' => "ENUM('PENDING', 'APPROVED', 'REJECTED') DEFAULT 'PENDING'",
                'createdAt' => 'BIGINT'
            ]
        ],
        'transcode_profiles' => [
            'cols' => [
                'extension' => 'VARCHAR(10) PRIMARY KEY',
                'command_args' => 'TEXT',
                'description' => 'VARCHAR(255)'
            ]
        ],
        'system_settings' => [
            'cols' => [
                'id' => 'INT PRIMARY KEY DEFAULT 1',
                'downloadStartTime' => "VARCHAR(10) DEFAULT '01:00'",
                'downloadEndTime' => "VARCHAR(10) DEFAULT '06:00'",
                'isQueuePaused' => 'TINYINT(1) DEFAULT 0',
                'batchSize' => 'INT DEFAULT 2',
                'maxDuration' => 'INT DEFAULT 600',
                'maxResolution' => 'INT DEFAULT 1080',
                'ytDlpPath' => 'VARCHAR(255)',
                'ffmpegPath' => 'VARCHAR(255) DEFAULT "ffmpeg"',
                'geminiKey' => 'VARCHAR(255)',
                'pexelsKey' => 'VARCHAR(255) DEFAULT NULL',
                'pixabayKey' => 'VARCHAR(255) DEFAULT NULL',
                'tropipayClientId' => 'VARCHAR(255)',
                'tropipayClientSecret' => 'VARCHAR(255)',
                'currencyConversion' => 'DECIMAL(10, 2) DEFAULT 300.00',
                'enableYoutube' => 'TINYINT(1) DEFAULT 0',
                'autoTranscode' => 'TINYINT(1) DEFAULT 0',
                'transcodePreset' => "VARCHAR(50) DEFAULT 'ultrafast'",
                'proxyUrl' => 'VARCHAR(255) DEFAULT NULL',
                'is_transcoder_active' => 'TINYINT(1) DEFAULT 0',
                'categories' => 'JSON DEFAULT NULL',
                'categoryPrices' => 'JSON DEFAULT NULL',
                'customCategories' => 'JSON DEFAULT NULL',
                'libraryPaths' => 'JSON DEFAULT NULL',
                'ftpSettings' => 'JSON DEFAULT NULL',
                'paymentInstructions' => 'TEXT DEFAULT NULL',
                'categoryHierarchy' => 'JSON DEFAULT NULL',
                'autoGroupFolders' => 'TINYINT(1) DEFAULT 1',
                'localLibraryPath' => "VARCHAR(255) DEFAULT ''",
                'videoCommission' => 'INT DEFAULT 20',
                'marketCommission' => 'INT DEFAULT 25',
                'transferFee' => 'DECIMAL(10, 2) DEFAULT 5.00',
                'vipPlans' => 'JSON DEFAULT NULL',
                'paymentMethods' => 'JSON DEFAULT NULL',
                'enableDebugLog' => 'TINYINT(1) DEFAULT 1'
            ]
        ],
        'transactions' => [
            'cols' => [
                'id' => 'VARCHAR(50) PRIMARY KEY',
                'buyerId' => 'VARCHAR(50) DEFAULT NULL',
                'creatorId' => 'VARCHAR(50) DEFAULT NULL',
                'videoId' => 'VARCHAR(50) DEFAULT NULL',
                'marketplaceItemId' => 'VARCHAR(50) DEFAULT NULL',
                'amount' => 'DECIMAL(10, 2)',
                'adminFee' => 'DECIMAL(10, 2) DEFAULT 0.00',
                'timestamp' => 'BIGINT',
                'type' => 'VARCHAR(20)',
                'shippingData' => 'JSON DEFAULT NULL',
                'fulfillmentStatus' => "VARCHAR(20) DEFAULT 'PENDING'",
                'videoTitle' => 'VARCHAR(255) DEFAULT NULL',
                'recipientName' => 'VARCHAR(50) DEFAULT NULL',
                'senderName' => 'VARCHAR(50) DEFAULT NULL',
                'isExternal' => 'TINYINT(1) DEFAULT 0'
            ],
            'indices' => [
                'idx_tx_buyer' => 'buyerId',
                'idx_tx_time' => 'timestamp',
                'idx_tx_type' => 'type'
            ]
        ],
        'interactions' => [
            'cols' => [
                'userId' => 'VARCHAR(50)',
                'videoId' => 'VARCHAR(50)',
                'liked' => 'TINYINT(1) DEFAULT 0',
                'disliked' => 'TINYINT(1) DEFAULT 0',
                'isWatched' => 'TINYINT(1) DEFAULT 0'
            ],
            'pk' => 'PRIMARY KEY (userId, videoId)'
        ],
        'notifications' => [
            'cols' => [
                'id' => 'VARCHAR(50) PRIMARY KEY',
                'userId' => 'VARCHAR(50)',
                'type' => 'VARCHAR(20)',
                'text' => 'VARCHAR(255)',
                'link' => 'VARCHAR(255)',
                'isRead' => 'TINYINT(1) DEFAULT 0',
                'timestamp' => 'BIGINT',
                'avatarUrl' => 'VARCHAR(255) DEFAULT NULL',
                'metadata' => 'JSON DEFAULT NULL'
            ],
            'indices' => [
                'idx_notif_user' => 'userId',
                'idx_notif_time' => 'timestamp'
            ]
        ]
    ];
}

function syncTable($pdo, $tableName, $def) {
    try {
        $result = $pdo->query("SHOW TABLES LIKE '$tableName'");
        if ($result->rowCount() == 0) {
            $sql = "CREATE TABLE $tableName (";
            $cols = [];
            foreach ($def['cols'] as $colName => $colDef) {
                $cols[] = "$colName $colDef";
            }
            $sql .= implode(", ", $cols);
            if (isset($def['pk'])) $sql .= ", " . $def['pk'];
            $sql .= ") CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci";
            $pdo->exec($sql);
        } else {
            $stmt = $pdo->query("SHOW COLUMNS FROM $tableName");
            $existingColumnsData = $stmt->fetchAll(PDO::FETCH_ASSOC);
            $existingCols = array_map('strtolower', array_column($existingColumnsData, 'Field'));
            foreach ($def['cols'] as $colName => $colDef) {
                if (!in_array(strtolower($colName), $existingCols)) {
                    $alterDef = str_ireplace("PRIMARY KEY", "", $colDef);
                    $pdo->exec("ALTER TABLE $tableName ADD COLUMN $colName $alterDef");
                }
            }
        }
        
        // Sincronización de Índices
        if (isset($def['indices'])) {
            $existingIndices = $pdo->query("SHOW INDEX FROM $tableName")->fetchAll(PDO::FETCH_COLUMN, 2);
            foreach ($def['indices'] as $idxName => $col) {
                if (!in_array($idxName, $existingIndices)) {
                    try {
                        $pdo->exec("CREATE INDEX $idxName ON $tableName ($col)");
                    } catch (Exception $e) {}
                }
            }
        }
    } catch (Exception $e) { 
        write_log("Sync Error en $tableName: " . $e->getMessage(), 'ERROR');
    }
}
?>
