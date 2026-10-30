import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/database/prisma";
import {
  formatLicenseKey,
  normalizeLicenseKey,
  parseAccountNumber,
} from "@/lib/license/keygen";

export const dynamic = "force-dynamic";

interface ExtractedInput {
  licenseKey: string;
  accountNumber: bigint | null;
}

/**
 * Safely parse raw incoming body from MQL5 WebRequest().
 * Strips potential trailing null bytes (\0), BOM characters, and whitespace.
 */
async function parseIncomingPayload(req: NextRequest): Promise<ExtractedInput> {
  const url = new URL(req.url);
  const search = url.searchParams;

  let rawKey =
    search.get("license_key") ||
    search.get("licenseKey") ||
    search.get("LicenseKey") ||
    search.get("key") ||
    "";

  let rawAccount =
    search.get("account_number") ||
    search.get("accountNumber") ||
    search.get("AccountNumber") ||
    search.get("login") ||
    "";

  if (req.method === "POST") {
    try {
      let rawText = await req.text();
      // Safely strip trailing null bytes from MQL5 StringToCharArray, BOM, and trailing whitespace
      rawText = rawText.replace(/\0+$/g, "").replace(/^\uFEFF/, "").trim();

      if (rawText.length > 0) {
        const parsed = JSON.parse(rawText);
        if (parsed && typeof parsed === "object") {
          const bodyKey =
            parsed.license_key ??
            parsed.licenseKey ??
            parsed.LicenseKey ??
            parsed.key;
          if (!rawKey && bodyKey !== undefined && bodyKey !== null) {
            rawKey = String(bodyKey);
          }

          const bodyAccount =
            parsed.account_number ??
            parsed.accountNumber ??
            parsed.AccountNumber ??
            parsed.login;
          if (!rawAccount && bodyAccount !== undefined && bodyAccount !== null) {
            rawAccount = String(bodyAccount);
          }
        }
      }
    } catch {
      // In case body reading fails or is malformed, searchParams remain as fallback
    }
  }

  return {
    licenseKey: String(rawKey || "").trim(),
    accountNumber: parseAccountNumber(rawAccount),
  };
}

/**
 * POST /api/verify (and GET fallback)
 * Public licensing verification endpoint for MT5 Expert Advisor WebRequest().
 * Contract:
 *   Valid (200):   { "status": "success", "valid": true, "message": "License active" }
 *   Invalid (200): { "status": "error", "valid": false, "error": "Exact reason" }
 */
export async function POST(req: NextRequest) {
  try {
    const { licenseKey, accountNumber } = await parseIncomingPayload(req);

    if (!licenseKey || accountNumber === null) {
      return NextResponse.json(
        {
          status: "error",
          valid: false,
          error: "license_key and account_number are required",
        },
        { status: 200 }
      );
    }

    const rawKey = normalizeLicenseKey(licenseKey);
    const formattedKey = formatLicenseKey(licenseKey);

    // 1. Look up licenseKey in database
    const license = await prisma.eaLicense.findFirst({
      where: {
        OR: [{ licenseKey: formattedKey }, { licenseKey: rawKey }],
      },
    });

    if (!license) {
      return NextResponse.json(
        {
          status: "error",
          valid: false,
          error: "Invalid license key",
        },
        { status: 200 }
      );
    }

    // 2. Check isActive and expiresAt
    const now = new Date();
    const isExpired = license.expiresAt !== null && new Date(license.expiresAt) < now;

    if (!license.isActive || isExpired) {
      return NextResponse.json(
        {
          status: "error",
          valid: false,
          error: "License is expired or revoked",
        },
        { status: 200 }
      );
    }

    // 3. First-time use: accountNumber is NULL -> automatically bind to incoming account
    if (license.accountNumber === null) {
      const updateResult = await prisma.eaLicense.updateMany({
        where: {
          id: license.id,
          accountNumber: null,
        },
        data: {
          accountNumber,
          lastVerifiedAt: now,
        },
      });

      if (updateResult.count === 0) {
        // Concurrency check: another terminal bound the key simultaneously
        const current = await prisma.eaLicense.findUnique({
          where: { id: license.id },
        });
        if (current?.accountNumber !== accountNumber) {
          return NextResponse.json(
            {
              status: "error",
              valid: false,
              error: "License key is already locked to another MT5 account",
            },
            { status: 200 }
          );
        }
      }

      return NextResponse.json(
        {
          status: "success",
          valid: true,
          message: "License active",
        },
        { status: 200 }
      );
    }

    // 4. Bound account mismatch -> reject
    if (license.accountNumber !== accountNumber) {
      return NextResponse.json(
        {
          status: "error",
          valid: false,
          error: "License key is already locked to another MT5 account",
        },
        { status: 200 }
      );
    }

    // 5. Valid match -> update lastVerifiedAt and return success
    await prisma.eaLicense.update({
      where: { id: license.id },
      data: { lastVerifiedAt: now },
    });

    return NextResponse.json(
      {
        status: "success",
        valid: true,
        message: "License active",
      },
      { status: 200 }
    );
  } catch (err) {
    console.error("[/api/verify error]", err);
    return NextResponse.json(
      {
        status: "error",
        valid: false,
        error: "Internal verification server error",
      },
      { status: 500 }
    );
  }
}

export const GET = POST;
