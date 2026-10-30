<?php
declare(strict_types=1);

/**
 * PHP CLI License Generator
 * Usage:
 *   php cli/generate.php --days=365 --notes="John Doe" --count=1
 */

if (php_sapi_name() !== 'cli') {
    die("CLI execution only\n");
}

require_once __DIR__ . '/../config.php';

$options = getopt('', ['days::', 'account::', 'notes::', 'count::']);
$days = isset($options['days']) ? (int)$options['days'] : 365;
$count = isset($options['count']) ? max(1, (int)$options['count']) : 1;
$notes = $options['notes'] ?? null;
$account = isset($options['account']) && ctype_digit((string)$options['account']) ? (int)$options['account'] : null;

$expiryStr = null;
if ($days > 0) {
    $expiry = new DateTime('now', new DateTimeZone('UTC'));
    $expiry->modify("+{$days} days");
    $expiryStr = $expiry->format('Y-m-d H:i:s');
}

echo "\n======================================================\n";
echo "  MT5 License Generator (PHP CLI) — investmentsview.com\n";
echo "======================================================\n";
echo "Generating: {$count} key(s)\n";
echo "Expiry:     " . ($expiryStr ? "{$expiryStr} ({$days} days)" : "Lifetime (no expiry)") . "\n";
echo "Binding:    " . ($account ? "Locked to Account {$account}" : "Auto-bind on first connection") . "\n";
if ($notes) echo "Notes:      {$notes}\n";
echo "------------------------------------------------------\n";

$pdo = getDbConnection();

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

    $stmt = $pdo->prepare('
        INSERT INTO ea_licenses (id, license_key, account_number, expires_at, is_active, notes)
        VALUES (:id, :key, :account, :expiry, 1, :notes)
    ');
    $stmt->execute([
        ':id'      => $uuid,
        ':key'     => $key,
        ':account' => $account,
        ':expiry'  => $expiryStr,
        ':notes'   => $notes,
    ]);

    echo sprintf("[#%d] KEY: %s\n", $i + 1, $key);
}

echo "======================================================\n\n";
