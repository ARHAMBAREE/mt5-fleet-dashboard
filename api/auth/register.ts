import { NextResponse } from "next/server";
import { handleApiError, readJson, ApiError } from "@/lib/auth/guard";
import { rateLimit, clientIp } from "@/lib/validation/rate-limit";
import { registerSchema } from "@/lib/validation/schemas";
import { hashPassword, passwordIssue } from "@/lib/auth/password";
import { createSession, setSessionCookies } from "@/lib/auth/session";
import { issueCsrfToken } from "@/lib/auth/csrf";
import { bootstrapUser } from "@/lib/auth/bootstrap";
import { prisma } from "@/lib/database/prisma";

/** POST /api/auth/register — create the dashboard owner account. */
export async function POST(req: Request): Promise<Response> {
  try {
    const rl = await rateLimit(`register:${clientIp(req)}`, 5, 3600);
    if (!rl.allowed) throw new ApiError(429, "RATE_LIMITED", "Too many accounts created from this address");

    const body = await readJson(req, registerSchema);
    const issue = passwordIssue(body.password);
    if (issue) throw new ApiError(400, "VALIDATION", issue);

    const existing = await prisma.user.findUnique({ where: { email: body.email } });
    if (existing) throw new ApiError(409, "CONFLICT", "An account with this email already exists");

    const user = await prisma.user.create({
      data: {
        email: body.email,
        name: body.name || body.email.split("@")[0],
        passwordHash: await hashPassword(body.password),
        role: "OWNER",
      },
    });

    await bootstrapUser(user.id);

    const { jwt } = await createSession(user, {
      userAgent: req.headers.get("user-agent"),
      ip: clientIp(req),
    });

    const res = NextResponse.json({ ok: true, user: { id: user.id, email: user.email, name: user.name, role: user.role } });
    await setSessionCookies(res, jwt, issueCsrfToken(jwt));
    return res;
  } catch (err) {
    return handleApiError(err);
  }
}
