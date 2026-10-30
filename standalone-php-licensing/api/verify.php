<?php
declare(strict_types=1);

require_once __DIR__ . '/../config.php';

// Accept GET or POST
$method = $_SERVER['REQUEST_METHOD'] ?? 'GET';
if ($method !== 'GET' && $method !== 'POST') {
    sendJsonResponse(['status' => 'error', 'valid' => false, 'error' => 'Method not allowed'], 405);
}

// Extract inputs from GET query parameters
$rawKey = $_GET['license_key'] ?? $_GET['licenseKey'] ?? $_GET['LicenseKey'] ?? $_GET['key'] ?? '';
$rawAccount = $_GET['account_number'] ?? $_GET['accountNumber'] ?? $_GET['AccountNumber'] ?? $_GET['login'] ?? '';

// If POST, check JSON body or POST form data
if ($method === 'POST') {
    $rawInput = file_get_contents('php://input');
    if (!empty($rawInput)) {
        // Strip trailing null bytes (\0) from MQL5 StringToCharArray
        $cleanedInput = rtrim($rawInput, "\0\r\n\t ");
        $json = json_decode($cleanedInput, true);
        if (is_array($json)) {
            $rawKey = $json['license_key'] ?? $json['licenseKey'] ?? $json['LicenseKey'] ?? $json['key'] ?? $rawKey;
            $rawAccount = $json['account_number'] ?? $json['accountNumber'] ?? $json['AccountNumber'] ?? $json['login'] ?? $rawAccount;
        }
    }
    if (empty($rawKey) && !empty($_POST)) {
        $rawKey = $_POST['license_key'] ?? $_POST['licenseKey'] ?? $_POST['LicenseKey'] ?? $_POST['key'] ?? '';
        $rawAccount = $_POST['account_number'] ?? $_POST['accountNumber'] ?? $_POST['AccountNumber'] ?? $_POST['login'] ?? '';
    }
}

// Sanitize inputs
$rawKey = trim((string)$rawKey);
$rawAccount = trim((string)$rawAccount);

if ($rawKey === '' || $rawAccount === '' || !ctype_digit($rawAccount)) {
    sendJsonResponse(['status' => 'error', 'valid' => false, 'error' => 'license_key and account_number are required'], 200);
}

$accountNumber = (int)$rawAccount;

// Normalize key (support XXXX-XXXX-XXXX-XXXX and raw 16 chars)
$cleanKey = strtoupper(preg_replace('/[^A-Za-z0-9]/', '', $rawKey));
$formattedKey = strlen($cleanKey) === 16
    ? sprintf('%s-%s-%s-%s', substr($cleanKey, 0, 4), substr($cleanKey, 4, 4), substr($cleanKey, 8, 4), substr($cleanKey, 12, 4))
    : $cleanKey;

try {
    $pdo = getDbConnection();

    // 1. Fetch license matching formatted or raw key
    $stmt = $pdo->prepare('SELECT * FROM ea_licenses WHERE license_key = :formatted OR license_key = :raw LIMIT 1');
    $stmt->execute([':formatted' => $formattedKey, ':raw' => $cleanKey]);
    $license = $stmt->fetch();

    // Check 1: Key exists
    if (!$license) {
        sendJsonResponse(['status' => 'error', 'valid' => false, 'error' => 'Invalid license key'], 200);
    }

    // Check 2: Active status & Expiration
    $now = new DateTime('now', new DateTimeZone('UTC'));
    $isExpired = false;
    if (!empty($license['expires_at'])) {
        $expiry = new DateTime($license['expires_at'], new DateTimeZone('UTC'));
        $isExpired = ($now > $expiry);
    }

    if ((int)$license['is_active'] !== 1 || $isExpired) {
        sendJsonResponse(['status' => 'error', 'valid' => false, 'error' => 'License is expired or revoked'], 200);
    }

    // Check 3: First-time use (unassigned account) -> bind atomically
    if ($license['account_number'] === null) {
        $updateStmt = $pdo->prepare('
            UPDATE ea_licenses 
            SET account_number = :account, last_verified_at = NOW() 
            WHERE id = :id AND account_number IS NULL
        ');
        $updateStmt->execute([
            ':account' => $accountNumber,
            ':id'      => $license['id'],
        ]);

        if ($updateStmt->rowCount() === 0) {
            // Concurrent race condition occurred; verify if bound to another
            $recheckStmt = $pdo->prepare('SELECT account_number FROM ea_licenses WHERE id = :id');
            $recheckStmt->execute([':id' => $license['id']]);
            $boundAcc = $recheckStmt->fetchColumn();
            if ((int)$boundAcc !== $accountNumber) {
                sendJsonResponse([
                    'status' => 'error',
                    'valid'  => false,
                    'error'  => 'License key is already locked to another MT5 account',
                ], 200);
            }
        }

        sendJsonResponse([
            'status'  => 'success',
            'valid'   => true,
            'message' => 'License active',
        ], 200);
    }

    // Check 4: Account match check (prevents account sharing)
    if ((int)$license['account_number'] !== $accountNumber) {
        sendJsonResponse([
            'status' => 'error',
            'valid'  => false,
            'error'  => 'License key is already locked to another MT5 account',
        ], 200);
    }

    // Check 5: Valid match -> update last_verified_at
    $touchStmt = $pdo->prepare('UPDATE ea_licenses SET last_verified_at = NOW() WHERE id = :id');
    $touchStmt->execute([':id' => $license['id']]);

    sendJsonResponse([
        'status'  => 'success',
        'valid'   => true,
        'message' => 'License active',
    ], 200);

} catch (Throwable $e) {
    error_log('[Licensing API Error] ' . $e->getMessage());
    sendJsonResponse([
        'status' => 'error',
        'valid'  => false,
        'error'  => 'Internal verification server error',
    ], 500);
}
