#!/usr/bin/env node
/**
 * CLI License Generator for investmentsview.com
 *
 * Usage:
 *   node scripts/generate-license.cjs [options]
 *
 * Options:
 *   --days <number>     Number of days until expiry (default: 365, or 0 for lifetime)
 *   --account <number>  Pre-bind to a specific MT5 account (optional)
 *   --notes <string>    Description or client name (optional)
 *   --count <number>    Number of licenses to generate (default: 1)
 *
 * Example:
 *   node scripts/generate-license.cjs --days 365 --notes "VIP Client"
 */

const crypto = require("node:crypto");
const { PrismaClient } = require("@prisma/client");

const prisma = new PrismaClient();

const CHARSET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function generateKey() {
  const bytes = crypto.randomBytes(16);
  let raw = "";
  for (let i = 0; i < 16; i++) {
    raw += CHARSET[bytes[i] % CHARSET.length];
  }
  return `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8, 12)}-${raw.slice(12, 16)}`;
}

function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    days: 365,
    account: null,
    notes: null,
    count: 1,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--days" && args[i + 1]) {
      options.days = parseInt(args[++i], 10);
    } else if (arg === "--account" && args[i + 1]) {
      options.account = BigInt(args[++i]);
    } else if (arg === "--notes" && args[i + 1]) {
      options.notes = args[++i];
    } else if (arg === "--count" && args[i + 1]) {
      options.count = Math.max(1, parseInt(args[++i], 10));
    }
  }

  return options;
}

async function main() {
  const options = parseArgs();

  // Find owner user if exists
  const owner = await prisma.user.findFirst({
    where: { role: "OWNER" },
    select: { id: true, email: true },
  });

  let expiry = null;
  if (options.days > 0) {
    expiry = new Date();
    expiry.setDate(expiry.getDate() + options.days);
  }

  console.log(`\n======================================================`);
  console.log(`  MT5 EA License Generator — investmentsview.com`);
  console.log(`======================================================`);
  console.log(`Generating ${options.count} license(s)...`);
  console.log(`Expiry:  ${expiry ? `${expiry.toISOString().split("T")[0]} (${options.days} days)` : "Lifetime (no expiry)"}`);
  if (options.account) {
    console.log(`Locked to Account: ${options.account}`);
  } else {
    console.log(`Account Binding:   Automatic on first MT5 EA connection`);
  }
  if (options.notes) console.log(`Notes:   ${options.notes}`);
  console.log(`------------------------------------------------------`);

  for (let i = 0; i < options.count; i++) {
    let key = "";
    while (true) {
      key = generateKey();
      const existing = await prisma.eaLicense.findUnique({ where: { licenseKey: key } });
      if (!existing) break;
    }

    const license = await prisma.eaLicense.create({
      data: {
        licenseKey: key,
        accountNumber: options.account,
        expiresAt: expiry,
        isActive: true,
        notes: options.notes,
        createdById: owner?.id || null,
      },
    });

    console.log(`[#${i + 1}] KEY: ${license.licenseKey}`);
  }

  console.log(`======================================================\n`);
}

main()
  .catch((err) => {
    console.error("Error generating license:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
