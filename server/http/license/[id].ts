import { NextResponse } from "next/server";
import { withAuth, readJson, ApiError } from "@/lib/auth/guard";
import { updateLicenseSchema } from "@/lib/validation/schemas";
import { prisma } from "@/lib/database/prisma";
import { parseAccountNumber, serializeLicense } from "@/lib/license/keygen";

export const dynamic = "force-dynamic";

/**
 * PATCH /api/licenses/[id] — Update license status, expiry, notes, or reset bound account.
 * Accessible strictly to OWNER only.
 */
export const PATCH = withAuth<{ id: string }>({ minRole: "OWNER" }, async (req, ctx) => {
  const { id } = await ctx.params;
  const body = await readJson(req, updateLicenseSchema);

  const existing = await prisma.eaLicense.findUnique({ where: { id } });
  if (!existing) {
    throw new ApiError(404, "NOT_FOUND", "License not found");
  }

  const data: {
    isActive?: boolean;
    expiresAt?: Date | null;
    accountNumber?: bigint | null;
    notes?: string | null;
  } = {};

  if (body.isActive !== undefined) {
    data.isActive = body.isActive;
  }

  if (body.notes !== undefined) {
    data.notes = body.notes || null;
  }

  if (body.expiryDate !== undefined) {
    if (body.expiryDate === null || body.expiryDate === "") {
      data.expiresAt = null;
    } else {
      const exp = new Date(body.expiryDate);
      if (isNaN(exp.getTime())) throw new ApiError(400, "VALIDATION", "Invalid expiryDate");
      data.expiresAt = exp;
    }
  }

  if (body.accountNumber !== undefined) {
    if (body.accountNumber === null) {
      // Unbind account so it can bind to a new MT5 account
      data.accountNumber = null;
    } else {
      const parsed = parseAccountNumber(body.accountNumber);
      if (parsed === null) throw new ApiError(400, "VALIDATION", "Invalid accountNumber");
      data.accountNumber = parsed;
    }
  }

  const updated = await prisma.eaLicense.update({
    where: { id },
    data,
  });

  return NextResponse.json({ ok: true, license: serializeLicense(updated) });
});

/**
 * DELETE /api/licenses/[id] — Permanently delete a license.
 * Accessible strictly to OWNER only.
 */
export const DELETE = withAuth<{ id: string }>({ minRole: "OWNER" }, async (req, ctx) => {
  const { id } = await ctx.params;

  const existing = await prisma.eaLicense.findUnique({ where: { id } });
  if (!existing) {
    throw new ApiError(404, "NOT_FOUND", "License not found");
  }

  await prisma.eaLicense.delete({ where: { id } });

  return NextResponse.json({ ok: true, message: "License deleted" });
});
