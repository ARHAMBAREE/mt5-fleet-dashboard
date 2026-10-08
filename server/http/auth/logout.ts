import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { handleApiError } from "@/lib/auth/guard";
import { destroySession, clearSessionCookies } from "@/lib/auth/session";

/** POST /api/auth/logout — revokes the DB session and clears cookies. */
export async function POST(req: NextRequest): Promise<Response> {
  try {
    await destroySession(req);
    const res = NextResponse.json({ ok: true });
    await clearSessionCookies(res);
    return res;
  } catch (err) {
    return handleApiError(err);
  }
}
