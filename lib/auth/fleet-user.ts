import "server-only";
import { prisma } from "@/lib/database/prisma";
import type { AuthUser } from "@/lib/auth/session";

/**
 * Returns the primary fleet user ID for multi-user / multi-role fleet viewing.
 * For OWNER, returns the owner's own ID.
 * For ADMIN and VIEWER, returns the primary OWNER's user ID so that all authorized
 * users view the single authoritative fleet of MT5 accounts and terminals.
 */
export async function getEffectiveFleetUserId(user: AuthUser | { id: string; role: string }): Promise<string> {
  if (user.role === "OWNER") return user.id;

  const owner = await prisma.user.findFirst({
    where: { role: "OWNER" },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });

  return owner?.id || user.id;
}

