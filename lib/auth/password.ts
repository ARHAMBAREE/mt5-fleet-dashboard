import bcrypt from "bcryptjs";

const ROUNDS = 12;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, ROUNDS);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  try {
    return await bcrypt.compare(plain, hash);
  } catch {
    return false;
  }
}

/** Password policy — enforced on register + change-password. */
export function passwordIssue(plain: string): string | null {
  if (plain.length < 10) return "Password must be at least 10 characters.";
  if (plain.length > 200) return "Password must be at most 200 characters.";
  if (!/[a-zA-Z]/.test(plain)) return "Password must contain a letter.";
  if (!/[0-9]/.test(plain)) return "Password must contain a digit.";
  return null;
}
