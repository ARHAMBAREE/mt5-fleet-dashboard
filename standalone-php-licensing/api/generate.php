<?php
declare(strict_types=1);

require_once __DIR__ . '/../config.php';

// Accept only POST
if (($_SERVER['REQUEST_METHOD'] ?? 'GET') !== 'POST') {
    sendJsonResponse(['ok' => false, 'error' => 'POST method required'], 405);
}

// Security: Verify Owner Secret Key
$authHeader = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
$token = '';
if (preg_match('/Bearer\s(\S+)/', $authHeader, $matches)) {
    $token = $matches[1];
} elseif (!empty($_GET['secret'])) {
    $token = (string)$_GET['secret'];
}

if (empty($token) || !hash_equals(OWNER_SECRET_KEY, $token)) {
    sendJsonResponse(['ok' => false, 'error' => 'Unauthorized: Invalid or missing owner secret key'], 403);
}

// Parse input payload
$input = file_get_contents('php://input');
$data = json_decode($input ?: '[]', true) ?: $_POST;

$days = isset($data['days']) ? (int)$data['days'] : 365;
$count = isset($data['count']) ? min(50, max(1, (int)$data['count'])) : 1;
$notes = isset($data['notes']) ? substr(trim((string)$data['notes']), 0, 255) : null;
$preAccount = !empty($data['account']) && ctype_digit((string)$data['account']) ? (int)$data['account'] : null;

try {
    $pdo = getDbConnection();
    $created = [];

    for ($i = 0; $i < $count; $i++) {
        $uuid = sprintf(
            '%04x%04x-%04x-%04x-%04x-%04x%04x%04x',
            mt_rand(0, 0xffff), mt_rand(0, 0xffff),
            mt_rand(0, 0xffff),
            mt_rand(0, 0x0fff) | 0x4000,
            mt_rand(0, 0x3fff) | 0x8000,
            mt_rand(0, 0xffff), mt_rand(0, 0xffff), mt_rand(0, 0xffff)
        );

        $key = generateRandomLicenseKey(true);

        $expiryStr = null;
        if ($days > 0) {
            $expiry = new DateTime('now', new DateTimeZone('UTC'));
            $expiry->modify("+{$days} days");
            $expiryStr = $expiry->format('Y-m-d H:i:s');
        }

        $stmt = $pdo->prepare('
            INSERT INTO ea_licenses (id, license_key, account_number, expires_at, is_active, notes)
            VALUES (:id, :key, :account, :expiry, 1, :notes)
        ');
        $stmt->execute([
            ':id'      => $uuid,
            ':key'     => $key,
            ':account' => $preAccount,
            ':expiry'  => $expiryStr,
            ':notes'   => $notes,
        ]);

        $created[] = [
            'licenseKey'    => $key,
            'accountNumber' => $preAccount,
            'expiresAt'     => $expiryStr,
            'notes'         => $notes,
            'isActive'      => true,
        ];
    }

    sendJsonResponse([
        'ok'       => true,
        'count'    => count($created),
        'licenses' => $created,
    ]);

} catch (Throwable $e) {
    error_log('[Licensing Generation Error] ' . $e->getMessage());
    sendJsonResponse(['ok' => false, 'error' => 'Database error: ' . $e->getMessage()], 500);
}
