import test from "node:test";
import assert from "node:assert/strict";
import { drawdown, aggregatePositions, periodStarts, tradeStats } from "../lib/calculations/risk";
import { deriveEaStatus } from "../lib/status";
import { positionsSchema } from "../lib/validation/agent-schemas";
import { csvCell } from "../lib/validation/schemas";

test("heartbeat boundaries and invalid dates", () => {
  const now = Date.UTC(2026, 9, 8);
  assert.equal(deriveEaStatus(new Date(now - 24999), now), "ONLINE");
  assert.equal(deriveEaStatus(new Date(now - 25000), now), "WARNING");
  assert.equal(deriveEaStatus(new Date(now - 60000), now), "OFFLINE");
  assert.equal(deriveEaStatus("invalid", now), "OFFLINE");
});
test("drawdown tracks recovery separately from maximum loss", () => {
  const series = [100, 120, 60, 110].map((equity, at) => ({ equity, at, balance: 100 }));
  const result = drawdown(series);
  assert.equal(result.maxPct, 50);
  assert.equal(result.peak, 120);
  assert.ok(Math.abs(result.currentPct - 100 / 12) < 1e-9);
  assert.equal(drawdown([]).maxPct, 0);
});
test("exposure is lots; floating includes swap", () => {
  const result = aggregatePositions([{ type: "BUY", volume: 2, currentPrice: 2500, profit: 10, swap: -1 }, { type: "SELL", volume: 1, currentPrice: 2500, profit: -3 }]);
  assert.equal(result.totalExposure, 3);
  assert.equal(result.floatingPl, 6);
});
test("UTC reporting periods and no-loss trade stats remain finite", () => {
  const result = periodStarts(new Date("2026-10-04T23:59:59Z"));
  assert.equal(result.week.toISOString(), "2026-09-28T00:00:00.000Z");
  assert.equal(tradeStats([10, -5, 0]).profitFactor, 2);
  assert.ok(Number.isFinite(tradeStats([10]).profitFactor));
});
test("protocol refuses unsupported versions and requires server identity", () => {
  assert.equal(positionsSchema.safeParse({ v: 1, accountLogin: "1", positions: [] }).success, false);
  assert.equal(positionsSchema.safeParse({ v: 2, accountLogin: "1", server: "demo", positions: [] }).success, false);
});
test("CSV neutralizes formulas without changing numeric losses", () => {
  assert.equal(csvCell("=HYPERLINK(\"https://example.com\")"), '"\'=HYPERLINK(""https://example.com"")"');
  assert.equal(csvCell(-3), "-3");
  assert.equal(csvCell("a,b"), '"a,b"');
});
test("accountInfoSchema validates snapshot with optional monthly profit fields", () => {
  const { accountInfoSchema } = require("../lib/validation/agent-schemas");
  const payload = {
    login: "1001",
    broker: "MetaQuotes",
    server: "Demo-Server",
    currency: "USD",
    balance: 5000,
    equity: 5200,
    credit: 0,
    margin: 100,
    freeMargin: 5100,
    marginLevel: 5200,
    leverage: 100,
    mode: "DEMO",
    tradeAllowed: true,
    algoTrading: true,
    terminalConnected: true,
    todayRealizedPl: 120.5,
    realizedPlDay: "2026-10-13",
    monthlyRealizedPl: 850.75,
    monthlyPlMonth: "2026-10",
  };
  const parsed = accountInfoSchema.safeParse(payload);
  assert.equal(parsed.success, true);
  if (parsed.success) {
    assert.equal(parsed.data.monthlyRealizedPl, 850.75);
    assert.equal(parsed.data.monthlyPlMonth, "2026-10");
  }

  // Exness unlimited leverage (2147483647 or 20000) and USC currency
  const exnessPayload = { ...payload, currency: "USC", leverage: 2147483647 };
  const exnessParsed = accountInfoSchema.safeParse(exnessPayload);
  assert.equal(exnessParsed.success, true);
  if (exnessParsed.success) {
    assert.equal(exnessParsed.data.leverage, 2147483647);
    assert.equal(exnessParsed.data.currency, "USC");
  }
});

