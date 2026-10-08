import { createHmac, randomBytes, timingSafeEqual, createHash } from "node:crypto";

export function sha256Hex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

export function hmacHex(secret: string, input: string): string {
  return createHmac("sha256", secret).update(input).digest("hex");
}

export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/** Cryptographically random pairing code: ABC-123-XYZ */
const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I confusion

export function generatePairingCode(): string {
  const pick = (n: number) =>
    Array.from({ length: n }, () => ALPHABET[randomBytes(1)[0] % ALPHABET.length]).join("");
  const digits = (n: number) =>
    Array.from({ length: n }, () => String(randomBytes(1)[0] % 10)).join("");
  return `${pick(3)}-${digits(3)}-${pick(3)}`;
}

/** Normalise user-typed pairing codes (lowercase, missing dashes, spaces). */
export function normalizePairingCode(raw: string): string {
  const cleaned = raw.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (cleaned.length !== 9) return raw.trim().toUpperCase();
  return `${cleaned.slice(0, 3)}-${cleaned.slice(3, 6)}-${cleaned.slice(6, 9)}`;
}
