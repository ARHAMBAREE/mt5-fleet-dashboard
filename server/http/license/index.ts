import { NextResponse } from "next/server";
import { withAuth, readJson, ApiError } from "@/lib/auth/guard";
import { createLicenseSchema } from "@/lib/validation/schemas";
import { prisma } from "@/lib/database/prisma";
import {
  generateLicenseKey,
  parseAccountNumber,
  serializeLicense,
  ensureEaLicensesTable,
} from "@/lib/license/keygen";

export const dynamic = "force-dynamic";

/**
 * GET /api/licenses — List all EA licenses.
 * Accessible strictly to OWNER only.
 */
export const GET = withAuth({ minRole: "OWNER" }, async (req) => {
  await ensureEaLicensesTable(prisma);
  const url = new URL(req.url);
  const page = Math.max(1, parseInt(url.searchParams.get("page") || "1", 10));
  const pageSize = Math.min(100, Math.max(1, parseInt(url.searchParams.get("pageSize") || "50", 10)));
  const search = (url.searchParams.get("q") || "").trim();
  const status = url.searchParams.get("status"); // "active" | "inactive" | "expired"

  const where: Record<string, unknown> = {};

  if (status === "active") {
    where.isActive = true;
    where.OR = [
      { expiresAt: null },
      { expiresAt: { gte: new Date() } },
    ];
  } else if (status === "inactive") {
    where.isActive = false;
  } else if (status === "expired") {
    where.expiresAt = { lt: new Date() };
  }

  if (search) {
    const searchNumber = parseAccountNumber(search);
    where.OR = [
      { licenseKey: { contains: search } },
      { notes: { contains: search } },
      ...(searchNumber !== null ? [{ accountNumber: searchNumber }] : []),
    ];
  }

  const [total, items] = await Promise.all([
    prisma.eaLicense.count({ where }),
    prisma.eaLicense.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      include: {
        createdBy: {
          select: { id: true, name: true, email: true },
        },
      },
    }),
  ]);

  return NextResponse.json({
    ok: true,
    total,
    page,
    pageSize,
    licenses: items.map(serializeLicense),
  });
});

/**
 * POST /api/licenses — Generate one or more new 16-character license keys.
 * Accessible strictly to logged-in OWNER only.
 */
export const POST = withAuth({ minRole: "OWNER" }, async (req, ctx) => {
  await ensureEaLicensesTable(prisma);
  const body = await readJson(req, createLicenseSchema);

  const count = body.count || 1;
  if (count < 1 || count > 50) {
    throw new ApiError(400, "VALIDATION", "Count must be between 1 and 50");
  }

  // Calculate expiry date
  let expiry: Date | null = null;
  if (body.expiryDate) {
    expiry = new Date(body.expiryDate);
    if (isNaN(expiry.getTime())) {
      throw new ApiError(400, "VALIDATION", "Invalid expiryDate format");
    }
  } else if (body.expiryDays && body.expiryDays > 0) {
    expiry = new Date();
    expiry.setDate(expiry.getDate() + body.expiryDays);
  }

  // Optional pre-bound account number
  const parsedAccount = body.accountNumber !== undefined ? parseAccountNumber(body.accountNumber) : null;

  // Generate unique keys
  const createdLicenses = [];
  for (let i = 0; i < count; i++) {
    let key = "";
    let attempts = 0;

    // Retry in the improbable case of collision
    while (attempts < 5) {
      key = generateLicenseKey(true);
      const exists = await prisma.eaLicense.findUnique({ where: { licenseKey: key } });
      if (!exists) break;
      attempts++;
    }

    if (!key) {
      throw new ApiError(500, "INTERNAL", "Failed to generate unique key");
    }

    const license = await prisma.eaLicense.create({
      data: {
        licenseKey: key,
        accountNumber: parsedAccount,
        expiresAt: expiry,
        isActive: true,
        notes: body.notes || null,
        createdById: ctx.user.id,
      },
    });

    createdLicenses.push(serializeLicense(license));
  }

  return NextResponse.json({
    ok: true,
    count: createdLicenses.length,
    licenses: createdLicenses,
  });
});
