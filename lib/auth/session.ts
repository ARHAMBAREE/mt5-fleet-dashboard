import "server-only";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import type { NextRequest, NextResponse } from "next/server";
import { env } from "@/lib/env";
import { prisma } from "@/lib/database/prisma";
import { randomToken, sha256Hex } from "@/lib/security/crypto";
import type { Role } from "@/shared/types";

export const SESSION_COOKIE = "mt5fleet_session";
export const CSRF_COOKIE = "mt5fleet_csrf";
const SESSION_DAYS = 7;

interface SessionClaims {
  sub: string;   // userId
  sid: string;   // sessionId
  role: Role;
  email: string;
}

function key(): Uint8Array {
  return new TextEncoder().encode(env.AUTH_SECRET);
}

export async function createSession(user: { id: string; role: Role; email: string }, meta: { userAgent?: string | null; ip?: string | null }) {
  const sid = randomToken(16);
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 3600 * 1000);

  const jwt = await new SignJWT({ sid, role: user.role, email: user.email })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(Math.floor(expiresAt.getTime() / 1000))
    .sign(key());

  await prisma.session.create({ data: {
    id: sid, userId: user.id, tokenHash: sha256Hex(jwt), expiresAt,
    userAgent: meta.userAgent?.slice(0, 300) ?? null, ip: meta.ip?.slice(0, 64) ?? null,
  } });
  return { jwt, expiresAt };
}

export async function setSessionCookies(res: NextResponse, jwt: string, csrfToken: string) {
  const secure = env.APP_URL.startsWith("https");
  res.cookies.set(SESSION_COOKIE, jwt, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DAYS * 24 * 3600,
  });
  // CSRF cookie must be readable by JS (double-submit).
  res.cookies.set(CSRF_COOKIE, csrfToken, {
    httpOnly: false,
    secure,
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_DAYS * 24 * 3600,
  });
}

export async function clearSessionCookies(res: NextResponse) {
  res.cookies.delete(SESSION_COOKIE);
  res.cookies.delete(CSRF_COOKIE);
}

export interface AuthUser {
  id: string;
  email: string;
  role: Role;
  name: string;
}

/**
 * Verify session cookie: signature (jose) + DB-backed revocation + expiry.
 * Returns null when unauthenticated.
 */
export async function getSessionUser(req?: NextRequest): Promise<AuthUser | null> {
  const store = await cookies();
  const token = req ? req.cookies.get(SESSION_COOKIE)?.value : store.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  try {
    const { payload } = await jwtVerify<SessionClaims>(token, key(), { algorithms: ["HS256"] });
    const sub = payload.sub;
    const sid = payload.sid;
    if (!sub || !sid) return null;

    const session = await prisma.session.findUnique({ where: { id: sid }, include: { user: true } });
    if (!session || session.userId !== sub) return null;
    if (session.expiresAt < new Date()) return null;
    if (session.tokenHash !== sha256Hex(token)) return null; // replay/tamper protection

    // Refresh last-used lazily (fire and forget; DB is still source of truth)
    void prisma.session.update({ where: { id: sid }, data: { lastUsedAt: new Date() } }).catch(() => {});

    return { id: session.user.id, email: session.user.email, role: session.user.role, name: session.user.name };
  } catch {
    return null;
  }
}

export async function destroySession(req: NextRequest): Promise<void> {
  try {
    const token = req.cookies.get(SESSION_COOKIE)?.value;
    if (!token) return;
    const { payload } = await jwtVerify(token, key(), { algorithms: ["HS256"] });
    if (payload.sid) {
      await prisma.session.deleteMany({ where: { id: String(payload.sid) } });
    }
  } catch {
    /* already invalid */
  }
}

export async function revokeAllSessions(userId: string) {
  await prisma.session.deleteMany({ where: { userId } });
}
