import { NextResponse } from "next/server";
import { runMaintenance } from "@/server/maintenance";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * GET/POST /api/cron/maintenance — Vercel cron target (every 5 minutes).
 * Auth: CRON_SECRET env var if set (Authorization: Bearer …), otherwise the
 * request must come from Vercel's cron (x-vercel-cron header).
 */
async function handle(req: Request): Promise<Response> {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, code: "UNAUTHORIZED" }, { status: 401 });
  }

  const result = await runMaintenance();
  return NextResponse.json({ ok: true, ...result, at: Date.now() });
}

export async function GET(req: Request) {
  return handle(req);
}

export async function POST(req: Request) {
  return handle(req);
}
