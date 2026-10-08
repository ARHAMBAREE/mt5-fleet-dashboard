/** User-requested display convention: label USC as USD without scaling amounts.
 * This is a display override, not a cent-to-dollar or foreign exchange conversion. */
export function accountMoneyUnit(currency: string): { currency: string; factor: number } {
  const code = currency.trim().toUpperCase();
  return code === "USC" ? { currency: "USD", factor: 1 } : { currency: code, factor: 1 };
}
