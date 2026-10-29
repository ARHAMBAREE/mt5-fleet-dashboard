import { NextResponse } from "next/server";
import { withAuth, readJson, ApiError } from "@/lib/auth/guard";
import { updateUserSchema } from "@/lib/validation/schemas";
import { hashPassword, passwordIssue } from "@/lib/auth/password";
import { prisma } from "@/lib/database/prisma";

export const dynamic = "force-dynamic";

/**
 * DELETE /api/users/[id] — remove a user account.
 * Accessible only to ADMIN and OWNER.
 */
export const DELETE = withAuth<{ id: string }>({ minRole: "ADMIN" }, async (req, ctx) => {
  const { id } = await ctx.params;

  if (id === ctx.user.id) {
    throw new ApiError(400, "CANNOT_DELETE_SELF", "You cannot delete your own account");
  }

  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) {
    throw new ApiError(404, "NOT_FOUND", "User not found");
  }

  if (target.role === "OWNER") {
    throw new ApiError(403, "CANNOT_DELETE_OWNER", "The primary account owner cannot be deleted");
  }

  // Delete all sessions first, then the user
  await prisma.session.deleteMany({ where: { userId: id } });
  await prisma.user.delete({ where: { id } });

  return NextResponse.json({ ok: true });
});

/**
 * PATCH /api/users/[id] — update user role, name, or password.
 * Accessible only to ADMIN and OWNER.
 */
export const PATCH = withAuth<{ id: string }>({ minRole: "ADMIN" }, async (req, ctx) => {
  const { id } = await ctx.params;
  const body = await readJson(req, updateUserSchema);

  const target = await prisma.user.findUnique({ where: { id } });
  if (!target) {
    throw new ApiError(404, "NOT_FOUND", "User not found");
  }

  if (target.role === "OWNER" && body.role) {
    throw new ApiError(403, "CANNOT_DEMOTE_OWNER", "The primary account owner role cannot be changed");
  }

  const data: { role?: "ADMIN" | "VIEWER"; name?: string; passwordHash?: string } = {};

  if (body.role) {
    data.role = body.role;
  }
  if (body.name) {
    data.name = body.name;
  }
  if (body.password) {
    const issue = passwordIssue(body.password);
    if (issue) throw new ApiError(400, "VALIDATION", issue);
    data.passwordHash = await hashPassword(body.password);
  }

  const updated = await prisma.user.update({
    where: { id },
    data,
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      createdAt: true,
    },
  });

  return NextResponse.json({ ok: true, user: updated });
});
