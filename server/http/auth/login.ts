import { NextResponse } from "next/server";
import { handleApiError, readJson, ApiError } from "@/lib/auth/guard";
import { rateLimit, clientIp } from "@/lib/validation/rate-limit";
import { loginSchema } from "@/lib/validation/schemas";
import { verifyPassword } from "@/lib/auth/password";
import { createSession, setSessionCookies } from "@/lib/auth/session";
import { issueCsrfToken } from "@/lib/auth/csrf";
import { prisma } from "@/lib/database/prisma";

/** POST /api/auth/login — bcrypt verify + session cookie + CSRF token. */
export async function POST(req: Request): Promise<Response> {
  try {
    const body = await readJson(req, loginSchema);
    const ip = clientIp(req);
    const rl = await rateLimit(`login:${ip}`, 10, 300);
    const rlEmail = await rateLimit(`login-email:${body.email}`, 10, 300);
    if (!rl.allowed || !rlEmail.allowed) {
      throw new ApiError(429, "RATE_LIMITED", "Too many login attempts — try again in a few minutes");
    }

    const user = await prisma.user.findUnique({ where: { email: body.email } });
    // Constant-ish work either way to reduce user-enumeration signal.
    const ok = user
      ? await verifyPassword(body.password, user.passwordHash)
      : await verifyPassword(body.password, "$2b$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvali");
    if (!user || !ok) throw new ApiError(401, "INVALID_CREDENTIALS", "Invalid email or password");

    const { jwt } = await createSession(user, { userAgent: req.headers.get("user-agent"), ip });
    const res = NextResponse.json({
      ok: true,
      user: { id: user.id, email: user.email, name: user.name, role: user.role },
    });
    await setSessionCookies(res, jwt, issueCsrfToken(jwt));
    return res;
  } catch (err) {
    return handleApiError(err);
  }
}
