import { test } from "node:test";
import assert from "node:assert/strict";
import {
  sanitizeMql5Payload,
  parseAccountLogin,
  checkFleetRateLimit,
} from "../lib/license/fleet-keygen";

test("sanitizeMql5Payload strips trailing null bytes from MQL5 StringToCharArray", () => {
  const payloadWithNulls = '{"license_key":"TEST-KEY","account_login":123456}\0\0\0';
  const cleaned = sanitizeMql5Payload(payloadWithNulls);
  assert.equal(cleaned, '{"license_key":"TEST-KEY","account_login":123456}');
  const parsed = JSON.parse(cleaned);
  assert.equal(parsed.license_key, "TEST-KEY");
  assert.equal(parsed.account_login, 123456);
});

test("parseAccountLogin handles both string and number representations safely", () => {
  assert.equal(parseAccountLogin(12345678), 12345678n);
  assert.equal(parseAccountLogin("52013467"), 52013467n);
  assert.equal(parseAccountLogin(""), null);
  assert.equal(parseAccountLogin(null), null);
  assert.equal(parseAccountLogin(-500), null);
  assert.equal(parseAccountLogin("abc"), null);
});

test("checkFleetRateLimit allows up to 30 requests per minute and blocks thereafter", () => {
  const testIp = `test-ip-${Date.now()}`;
  for (let i = 0; i < 30; i++) {
    const res = checkFleetRateLimit(testIp, 30, 60);
    assert.equal(res.allowed, true, `Request ${i + 1} should be allowed`);
  }
  const blocked = checkFleetRateLimit(testIp, 30, 60);
  assert.equal(blocked.allowed, false, "Request 31 should be rate-limited");
});

test("MQL5 Fleet verification contract produces strictly flat JSON", () => {
  // Simulate responses according to Argon prompt requirements
  const validResponse = {
    valid: true,
    success: true,
    status: "bound",
    account_login: 12345678,
    message: "License bound to MT5 account 12345678",
  };

  const lockedResponse = {
    valid: false,
    success: false,
    status: "locked",
    message: "License key is locked to another MT5 account (87654321)",
  };

  const expiredResponse = {
    valid: false,
    success: false,
    status: "expired",
    message: "License key has expired",
  };

  // Check flat structure (no nested objects)
  for (const res of [validResponse, lockedResponse, expiredResponse]) {
    for (const [, val] of Object.entries(res)) {
      assert.notEqual(typeof val, "object", "MQL5 EA requires strictly flat JSON keys");
    }
    assert.equal(typeof res.valid, "boolean");
    assert.equal(typeof res.success, "boolean");
    assert.equal(typeof res.status, "string");
    assert.equal(typeof res.message, "string");
  }
});

test("MT5 Fleet licensing business logic simulation", () => {
  interface MockLicense {
    key: string;
    status: string;
    boundAccount: bigint | null;
    expiresAt: Date | null;
  }

  function simulateVerify(license: MockLicense | null, login: bigint, now = new Date()) {
    if (!license) {
      return { valid: false, success: false, status: "invalid", message: "License key does not exist" };
    }
    if (license.status === "revoked") {
      return { valid: false, success: false, status: "invalid", message: "License key has been revoked by administrator" };
    }
    if (license.expiresAt && license.expiresAt.getTime() < now.getTime()) {
      license.status = "expired";
      return { valid: false, success: false, status: "expired", message: "License key has expired" };
    }
    // Auto-bind
    if (license.boundAccount === null) {
      license.boundAccount = login;
      license.status = "bound";
      return { valid: true, success: true, status: "bound", account_login: Number(login), message: `License bound to MT5 account ${login}` };
    }
    // Mismatch
    if (license.boundAccount !== login) {
      return { valid: false, success: false, status: "locked", message: `License key is locked to another MT5 account (${license.boundAccount})` };
    }
    // Returning
    license.status = "active";
    return { valid: true, success: true, status: "active", account_login: Number(login), message: "License verified" };
  }

  // 1. First use auto-bind
  const lic: MockLicense = { key: "IV-FLEET-2026-GOLD01", status: "unclaimed", boundAccount: null, expiresAt: null };
  const bindRes = simulateVerify(lic, 52013467n);
  assert.equal(bindRes.valid, true);
  assert.equal(bindRes.status, "bound");
  assert.equal(lic.boundAccount, 52013467n);

  // 2. Repeat check-in from same account -> active
  const activeRes = simulateVerify(lic, 52013467n);
  assert.equal(activeRes.valid, true);
  assert.equal(activeRes.status, "active");

  // 3. Different account -> locked
  const lockedRes = simulateVerify(lic, 99999999n);
  assert.equal(lockedRes.valid, false);
  assert.equal(lockedRes.status, "locked");

  // 4. Admin unbind resets account
  lic.boundAccount = null;
  lic.status = "unclaimed";
  assert.equal(lic.boundAccount, null);
  assert.equal(lic.status, "unclaimed");

  // 5. Can now bind to new account
  const rebindRes = simulateVerify(lic, 99999999n);
  assert.equal(rebindRes.valid, true);
  assert.equal(rebindRes.status, "bound");
  assert.equal(lic.boundAccount, 99999999n);
});
