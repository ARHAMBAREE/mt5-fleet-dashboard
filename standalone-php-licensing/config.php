<?php
declare(strict_types=1);

/**
 * Licensing System Configuration
 * Configure your database connection and owner authentication secret.
 */

// Database credentials
define('DB_HOST', getenv('DB_HOST') ?: 'localhost');
define('DB_PORT', getenv('DB_PORT') ?: '3306');
define('DB_NAME', getenv('DB_NAME') ?: 'investmentsview_db');
define('DB_USER', getenv('DB_USER') ?: 'db_user');
define('DB_PASS', getenv('DB_PASS') ?: 'db_password');

// Owner Secret Key: required to generate licenses via API (Authorization: Bearer <OWNER_SECRET_KEY>)
define('OWNER_SECRET_KEY', getenv('OWNER_SECRET_KEY') ?: 'CHANGE_THIS_TO_A_SECURE_RANDOM_SECRET_KEY_64_CHARS');

// PDO Connection Helper
function getDbConnection(): PDO {
    static $pdo = null;
    if ($pdo === null) {
        $dsn = sprintf('mysql:host=%s;port=%s;dbname=%s;charset=utf8mb4', DB_HOST, DB_PORT, DB_NAME);
        $options = [
            PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES   => false,
        ];
        $pdo = new PDO($dsn, DB_USER, DB_PASS, $options);
    }
    return $pdo;
}

// JSON Output Helper
function sendJsonResponse(array $payload, int $httpCode = 200): void {
    http_response_code($httpCode);
    header('Content-Type: application/json; charset=utf-8');
    header('Cache-Control: no-store, no-cache, must-revalidate, max-age=0');
    header('Pragma: no-cache');
    echo json_encode($payload, JSON_UNESCAPED_SLASHES | JSON_PRETTY_PRINT);
    exit;
}

// 16-Character Key Generator
function generateRandomLicenseKey(bool $formatted = true): string {
    $charset = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    $raw = '';
    $bytes = random_bytes(16);
    for ($i = 0; $i < 16; $i++) {
        $raw .= $charset[ord($bytes[$i]) % strlen($charset)];
    }
    if ($formatted) {
        return sprintf('%s-%s-%s-%s', substr($raw, 0, 4), substr($raw, 4, 4), substr($raw, 8, 4), substr($raw, 12, 4));
    }
    return $raw;
}

