import { NextResponse } from "next/server";
import { withAuth, readJson, ApiError } from "@/lib/auth/guard";
import { createUserSchema } from "@/lib/validation/schemas";
import { hashPassword, passwordIssue } from "@/lib/auth/password";
import { prisma } from "@/lib/database/prisma";

export const dynamic = "force-dynamic";

/**
 * GET /api/users — list all dashboard users.
 * Accessible only to ADMIN and OWNER.
 */
export const GET = withAuth({ minRole: "ADMIN" }, async () => {
  const users = await prisma.user.findMany({
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      createdAt: true,
    },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json({ ok: true, users });
});

/**
 * POST /api/users — create a new user (ADMIN or VIEWER login).
 * Accessible only to ADMIN and OWNER.
 */
export const POST = withAuth({ minRole: "ADMIN" }, async (req) => {
  const body = await readJson(req, createUserSchema);

  const issue = passwordIssue(body.password);
  if (issue) throw new ApiError(400, "VALIDATION", issue);

  const existing = await prisma.user.findUnique({
    where: { email: body.email },
  });
  if (existing) {
    throw new ApiError(409, "USER_EXISTS", "A user with this email address already exists");
  }

  const user = await prisma.user.create({
    data: {
      email: body.email,
      name: body.name || body.email.split("@")[0],
      passwordHash: await hashPassword(body.password),
      role: body.role,
    },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      createdAt: true,
    },
  });

  return NextResponse.json({ ok: true, user });
});
