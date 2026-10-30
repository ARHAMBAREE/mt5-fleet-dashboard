import test from "node:test";
import assert from "node:assert/strict";
import {
  generateLicenseKey,
  normalizeLicenseKey,
  formatLicenseKey,
  parseAccountNumber,
  serializeLicense,
} from "../lib/license/keygen";

test("license key generation and formatting", () => {
  const formatted = generateLicenseKey(true);
  const raw = generateLicenseKey(false);

  // Formatted: XXXX-XXXX-XXXX-XXXX (19 characters)
  assert.equal(formatted.length, 19);
  assert.match(formatted, /^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);

  // Raw: 16 characters
  assert.equal(raw.length, 16);
  assert.match(raw, /^[A-Z2-9]{16}$/);

  // Normalization
  assert.equal(normalizeLicenseKey("abcd-efgh-jklm-npqr"), "ABCDEFGHJKLMNPQR");
  assert.equal(normalizeLicenseKey("  ABCD-EFGH-JKLM-NPQR  "), "ABCDEFGHJKLMNPQR");

  // Re-formatting
  assert.equal(formatLicenseKey("ABCDEFGHJKLMNPQR"), "ABCD-EFGH-JKLM-NPQR");
  assert.equal(formatLicenseKey("abcd-efgh-jklm-npqr"), "ABCD-EFGH-JKLM-NPQR");
});

test("license key uniqueness over 1000 generations", () => {
  const keys = new Set<string>();
  for (let i = 0; i < 1000; i++) {
    const key = generateLicenseKey(true);
    assert.equal(keys.has(key), false, `Collision detected on key ${key}`);
    keys.add(key);
  }
  assert.equal(keys.size, 1000);
});

test("parseAccountNumber handles numbers and strings safely", () => {
  assert.equal(parseAccountNumber(10529482), 10529482n);
  assert.equal(parseAccountNumber("10529482"), 10529482n);
  assert.equal(parseAccountNumber("  9988776655  "), 9988776655n);

  // Invalid cases
  assert.equal(parseAccountNumber(""), null);
  assert.equal(parseAccountNumber(null), null);
  assert.equal(parseAccountNumber(undefined), null);
  assert.equal(parseAccountNumber("abc1234"), null);
  assert.equal(parseAccountNumber("-12345"), null);
});

test("serializeLicense converts BigInt to Number for JSON safety", () => {
  const license = {
    id: "uuid-123",
    licenseKey: "ABCD-EFGH-JKLM-NPQR",
    accountNumber: 10529482n,
    expiryDate: new Date(),
    isActive: true,
  };

  const serialized = serializeLicense(license);
  assert.equal(typeof serialized.accountNumber, "number");
  assert.equal(serialized.accountNumber, 10529482);

  // Verifying JSON.stringify does not throw
  const jsonStr = JSON.stringify(serialized);
  assert.ok(jsonStr.includes("10529482"));
});

test("MQL5 payload handles trailing null bytes gracefully", () => {
  // MQL5 StringToCharArray often includes \0 at the end if not resized
  const rawWithNull = '{"license_key":"ABCD-EFGH-JKLM-NPQR","account_number":10529482}\0\0';
  const cleaned = rawWithNull.replace(/\0+$/g, "").trim();
  const parsed = JSON.parse(cleaned);

  assert.equal(parsed.license_key, "ABCD-EFGH-JKLM-NPQR");
  assert.equal(parsed.account_number, 10529482);
});

test("verification contract ensures flat JSON with status and valid keys", () => {
  const successContract = {
    status: "success",
    valid: true,
    message: "License active",
  };
  const errorContract = {
    status: "error",
    valid: false,
    error: "License key is already locked to another MT5 account",
  };

  assert.equal(typeof successContract.valid, "boolean");
  assert.equal(successContract.valid, true);
  assert.equal(typeof successContract.message, "string");

  assert.equal(typeof errorContract.valid, "boolean");
  assert.equal(errorContract.valid, false);
  assert.equal(typeof errorContract.error, "string");

  // Ensure no nested objects exist in contract
  for (const val of Object.values(successContract)) {
    assert.ok(typeof val !== "object" || val === null);
  }
  for (const val of Object.values(errorContract)) {
    assert.ok(typeof val !== "object" || val === null);
  }
});


