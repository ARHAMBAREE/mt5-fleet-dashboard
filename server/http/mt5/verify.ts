import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/database/prisma";
import {
  ensureMt5FleetLicensesTable,
  sanitizeMql5Payload,
  parseAccountLogin,
  checkFleetRateLimit,
} from "@/lib/license/fleet-keygen";
import { formatLicenseKey, normalizeLicenseKey } from "@/lib/license/keygen";

export const dynamic = "force-dynamic";

interface ExtractedFleetInput {
  licenseKey: string;
  accountLogin: bigint | null;
  accountServer: string | null;
  symbol: string | null;
}

/**
 * Parses incoming MQL5 payload safely.
 * Strips \0 null bytes before JSON.parse to prevent syntax errors.
 */
async function parseFleetPayload(req: NextRequest): Promise<ExtractedFleetInput> {
  const url = new URL(req.url);
  const search = url.searchParams;

  let rawKey = search.get("license_key") || search.get("licenseKey") || search.get("key") || "";
  let rawAccount = search.get("account_login") || search.get("accountLogin") || search.get("login") || "";
  let rawServer = search.get("account_server") || search.get("accountServer") || search.get("server") || null;
  let rawSymbol = search.get("symbol") || null;

  if (req.method === "POST") {
    try {
      const rawBody = await req.text();
      const sanitized = sanitizeMql5Payload(rawBody);

      if (sanitized.length > 0) {
        const parsed = JSON.parse(sanitized);
        if (parsed && typeof parsed === "object") {
          const bodyKey = parsed.license_key ?? parsed.licenseKey ?? parsed.key;
          if (!rawKey && bodyKey !== undefined && bodyKey !== null) {
            rawKey = String(bodyKey);
          }

          const bodyAccount = parsed.account_login ?? parsed.accountLogin ?? parsed.login;
          if (!rawAccount && bodyAccount !== undefined && bodyAccount !== null) {
            rawAccount = String(bodyAccount);
          }

          const bodyServer = parsed.account_server ?? parsed.accountServer ?? parsed.server;
          if (!rawServer && bodyServer !== undefined && bodyServer !== null) {
            rawServer = String(bodyServer);
          }

          const bodySymbol = parsed.symbol;
          if (!rawSymbol && bodySymbol !== undefined && bodySymbol !== null) {
            rawSymbol = String(bodySymbol);
          }
        }
      }
    } catch {
      // Fallback to query params if json reading fails
    }
  }

  return {
    licenseKey: String(rawKey || "").trim(),
    accountLogin: parseAccountLogin(rawAccount),
    accountServer: rawServer ? String(rawServer).trim() : null,
    symbol: rawSymbol ? String(rawSymbol).trim() : null,
  };
}

/** Helper to construct flat JSON responses (required by lightweight MQL5 parsers) */
function flatResponse(data: {
  valid: boolean;
  success: boolean;
  status: string;
  account_login?: number;
  message: string;
}) {
  return NextResponse.json(data, {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store, no-cache, must-revalidate",
    },
  });
}

/**
 * POST /api/mt5/verify (and GET fallback)
 * MT5 Fleet Licensing Verification Endpoint
 */
export async function handleVerify(req: NextRequest) {
  // 1. Rate limiting (max 30 req/min per IP)
  const clientIp =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "127.0.0.1";

  const rateCheck = checkFleetRateLimit(clientIp, 30, 60);
  if (!rateCheck.allowed) {
    return flatResponse({
      valid: false,
      success: false,
      status: "invalid",
      message: "Rate limit exceeded (max 30 requests/min). Please try again shortly.",
    });
  }

  // 2. Ensure table exists and seed keys are present
  await ensureMt5FleetLicensesTable();

  // 3. Parse input
  const { licenseKey, accountLogin, accountServer, symbol } = await parseFleetPayload(req);

  // Validate required fields
  if (!licenseKey || accountLogin === null) {
    return flatResponse({
      valid: false,
      success: false,
      status: "invalid",
      message: "Missing or invalid license_key or account_login",
    });
  }

  const now = new Date();

  // 4. Atomic database verification using Prisma transaction to prevent race conditions
  try {
    const result = await prisma.$transaction(async (tx) => {
      let record = await tx.mt5FleetLicense.findUnique({
        where: { licenseKey },
      });

      // Key not found in mt5_fleet_licenses -> Universal check in ea_licenses
      if (!record) {
        const rawKey = normalizeLicenseKey(licenseKey);
        const formattedKey = formatLicenseKey(licenseKey);

        const eaRecord = await tx.eaLicense.findFirst({
          where: {
            OR: [{ licenseKey }, { licenseKey: formattedKey }, { licenseKey: rawKey }],
          },
        });

        if (!eaRecord) {
          return {
            valid: false,
            success: false,
            status: "invalid",
            message: "License key does not exist",
          };
        }

        // Check revoked
        if (!eaRecord.isActive) {
          return {
            valid: false,
            success: false,
            status: "invalid",
            message: "License key has been revoked by administrator",
          };
        }

        // Check expired
        if (eaRecord.expiresAt && eaRecord.expiresAt.getTime() < now.getTime()) {
          return {
            valid: false,
            success: false,
            status: "expired",
            message: "License key has expired",
          };
        }

        // First use auto-bind on eaRecord
        if (eaRecord.accountNumber === null) {
          await tx.eaLicense.update({
            where: { id: eaRecord.id },
            data: { accountNumber: accountLogin, lastVerifiedAt: now },
          });

          await tx.mt5FleetLicense.create({
            data: {
              licenseKey: eaRecord.licenseKey,
              boundAccountLogin: accountLogin,
              boundAccountServer: accountServer,
              boundAt: now,
              status: "bound",
              lastCheckInAt: now,
              lastSymbol: symbol,
              lastIp: clientIp,
              checkInCount: 1,
              expiresAt: eaRecord.expiresAt,
            },
          }).catch(() => {});

          return {
            valid: true,
            success: true,
            status: "bound",
            account_login: Number(accountLogin),
            message: `License bound to MT5 account ${accountLogin}`,
          };
        }

        // Account mismatch
        if (eaRecord.accountNumber !== accountLogin) {
          return {
            valid: false,
            success: false,
            status: "locked",
            message: `License key is locked to another MT5 account (${eaRecord.accountNumber.toString()})`,
          };
        }

        // Returning match
        await tx.eaLicense.update({
          where: { id: eaRecord.id },
          data: { lastVerifiedAt: now },
        });

        await tx.mt5FleetLicense.upsert({
          where: { licenseKey: eaRecord.licenseKey },
          create: {
            licenseKey: eaRecord.licenseKey,
            boundAccountLogin: accountLogin,
            boundAccountServer: accountServer,
            boundAt: now,
            status: "active",
            lastCheckInAt: now,
            lastSymbol: symbol,
            lastIp: clientIp,
            checkInCount: 1,
            expiresAt: eaRecord.expiresAt,
          },
          update: {
            status: "active",
            lastCheckInAt: now,
            lastSymbol: symbol,
            lastIp: clientIp,
            checkInCount: { increment: 1 },
          },
        }).catch(() => {});

        return {
          valid: true,
          success: true,
          status: "active",
          account_login: Number(accountLogin),
          message: "License verified",
        };
      }

      // Revoked
      if (record.status === "revoked") {
        return {
          valid: false,
          success: false,
          status: "invalid",
          message: "License key has been revoked by administrator",
        };
      }

      // Expired
      if (record.expiresAt && record.expiresAt.getTime() < now.getTime()) {
        if (record.status !== "expired") {
          await tx.mt5FleetLicense.update({
            where: { id: record.id },
            data: { status: "expired" },
          });
        }
        return {
          valid: false,
          success: false,
          status: "expired",
          message: "License key has expired",
        };
      }

      // First-use Auto-Bind (bound_account_login is NULL)
      if (record.boundAccountLogin === null) {
        await tx.mt5FleetLicense.update({
          where: { id: record.id },
          data: {
            boundAccountLogin: accountLogin,
            boundAccountServer: accountServer || record.boundAccountServer,
            boundAt: now,
            status: "bound",
            lastCheckInAt: now,
            lastSymbol: symbol || record.lastSymbol,
            lastIp: clientIp,
            checkInCount: { increment: 1 },
          },
        });

        // Sync binding to ea_licenses if exists
        await tx.eaLicense.updateMany({
          where: {
            OR: [
              { licenseKey: record.licenseKey },
              { licenseKey: formatLicenseKey(record.licenseKey) },
              { licenseKey: normalizeLicenseKey(record.licenseKey) },
            ],
            accountNumber: null,
          },
          data: {
            accountNumber: accountLogin,
            lastVerifiedAt: now,
          },
        }).catch(() => {});

        return {
          valid: true,
          success: true,
          status: "bound",
          account_login: Number(accountLogin),
          message: `License bound to MT5 account ${accountLogin}`,
        };
      }

      // Account Mismatch
      if (record.boundAccountLogin !== accountLogin) {
        return {
          valid: false,
          success: false,
          status: "locked",
          message: `License key is locked to another MT5 account (${record.boundAccountLogin.toString()})`,
        };
      }

      // Authorized Returning Account
      await tx.mt5FleetLicense.update({
        where: { id: record.id },
        data: {
          status: "active",
          lastCheckInAt: now,
          lastSymbol: symbol || record.lastSymbol,
          lastIp: clientIp,
          checkInCount: { increment: 1 },
          ...(accountServer ? { boundAccountServer: accountServer } : {}),
        },
      });

      await tx.eaLicense.updateMany({
        where: {
          OR: [
            { licenseKey: record.licenseKey },
            { licenseKey: formatLicenseKey(record.licenseKey) },
            { licenseKey: normalizeLicenseKey(record.licenseKey) },
          ],
        },
        data: { lastVerifiedAt: now },
      }).catch(() => {});

      return {
        valid: true,
        success: true,
        status: "active",
        account_login: Number(accountLogin),
        message: "License verified",
      };
    });

    return flatResponse(result);
  } catch (err) {
    console.error("[POST /api/mt5/verify] transaction error:", err);
    return flatResponse({
      valid: false,
      success: false,
      status: "error",
      message: "Internal verification error",
    });
  }
}

export async function POST(req: NextRequest) {
  return handleVerify(req);
}

export async function GET(req: NextRequest) {
  return handleVerify(req);
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    },
  });
}

