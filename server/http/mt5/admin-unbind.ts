import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/database/prisma";
import { ensureMt5FleetLicensesTable, sanitizeMql5Payload } from "@/lib/license/fleet-keygen";
import { formatLicenseKey, normalizeLicenseKey } from "@/lib/license/keygen";
import { getSessionUser } from "@/lib/auth/session";

export const dynamic = "force-dynamic";

/**
 * Validates admin credentials via:
 * 1. `x-admin-secret` header matching ADMIN_API_SECRET (or AUTH_SECRET)
 * 2. Or an authenticated ADMIN / OWNER session cookie
 */
async function isAuthorizedAdmin(req: NextRequest): Promise<boolean> {
  const secretHeader = req.headers.get("x-admin-secret");
  const configuredSecret = process.env.ADMIN_API_SECRET || process.env.AUTH_SECRET;

  if (secretHeader && configuredSecret && secretHeader === configuredSecret) {
    return true;
  }

  // Fallback to active admin session cookie if called from dashboard UI
  try {
    const user = await getSessionUser(req);
    if (user && (user.role === "ADMIN" || user.role === "OWNER")) {
      return true;
    }
  } catch {
    // Session check failed
  }

  return false;
}

/**
 * POST /api/mt5/admin/unbind
 * Resets bound account data so the license can bind to a new MT5 account.
 */
export async function POST(req: NextRequest) {
  await ensureMt5FleetLicensesTable();

  const authed = await isAuthorizedAdmin(req);
  if (!authed) {
    return NextResponse.json(
      { success: false, message: "Unauthorized: Invalid or missing x-admin-secret" },
      { status: 401 }
    );
  }

  let rawKey = "";
  try {
    const text = sanitizeMql5Payload(await req.text());
    if (text) {
      const parsed = JSON.parse(text);
      rawKey = parsed?.license_key ?? parsed?.licenseKey ?? parsed?.key ?? "";
    }
  } catch {
    // try query params
  }

  if (!rawKey) {
    const url = new URL(req.url);
    rawKey = url.searchParams.get("license_key") || url.searchParams.get("key") || "";
  }

  const licenseKey = String(rawKey || "").trim();
  if (!licenseKey) {
    return NextResponse.json(
      { success: false, message: "license_key is required" },
      { status: 400 }
    );
  }

  try {
    const rawKey = normalizeLicenseKey(licenseKey);
    const formattedKey = formatLicenseKey(licenseKey);

    const existing = await prisma.mt5FleetLicense.findFirst({
      where: {
        OR: [{ licenseKey }, { licenseKey: formattedKey }, { licenseKey: rawKey }],
      },
    });

    const eaExisting = await prisma.eaLicense.findFirst({
      where: {
        OR: [{ licenseKey }, { licenseKey: formattedKey }, { licenseKey: rawKey }],
      },
    });

    if (!existing && !eaExisting) {
      return NextResponse.json(
        { success: false, message: `License key "${licenseKey}" does not exist` },
        { status: 404 }
      );
    }

    if (existing) {
      await prisma.mt5FleetLicense.update({
        where: { id: existing.id },
        data: {
          boundAccountLogin: null,
          boundAccountServer: null,
          boundAt: null,
          status: "unclaimed",
        },
      });
    }

    if (eaExisting) {
      await prisma.eaLicense.update({
        where: { id: eaExisting.id },
        data: {
          accountNumber: null,
        },
      });
    }

    return NextResponse.json({
      success: true,
      message: `License "${licenseKey}" unbound successfully across both bots`,
      license_key: licenseKey,
      status: "unclaimed",
    });
  } catch (err) {
    console.error("[POST /api/mt5/admin/unbind] error:", err);
    return NextResponse.json(
      { success: false, message: "Internal error unbinding license" },
      { status: 500 }
    );
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, x-admin-secret",
    },
  });
}
