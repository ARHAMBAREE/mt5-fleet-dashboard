"use client";
import { groupGoldGrids, type GoldTarget } from "@/shared/gold";
import { fmtDateTime } from "@/lib/format";

const price = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 3 });

export default function GoldTargets({ targets, error, loading }: { targets: GoldTarget[]; error: string | null; loading: boolean }) {
  const grids = groupGoldGrids(targets);
  const values = grids.flatMap(p => [p.currentPrice, p.tp]).filter(n => Number.isFinite(n) && n > 0);
  const low = values.length ? values.reduce((a, b) => Math.min(a, b), Infinity) : 0;
  const high = values.length ? values.reduce((a, b) => Math.max(a, b), -Infinity) : 1;
  const pad = Math.max((high - low) * 0.08, 1);
  const min = low - pad, max = high + pad;
  const x = (n: number) => 30 + (n - min) / (max - min) * 660;
  const accounts = new Set(targets.map(p => p.accountId)).size;
  return <section className="card mb" aria-label="Gold grid take-profit chart">
    <div className="card-title">Gold · Grid take profits <span className="right small muted">{accounts} accounts · {grids.length} grids · {targets.length} positions</span></div>
    <p className="small muted">XAUUSD / GOLD · prices in USD per ounce. Each row shows a grid’s last reported price (●) and shared take profit (◆). All accounts, regardless of the currency filter.</p>
    <p className="small muted">Grids are grouped by account, symbol, EA magic and direction. This is a price-level chart, not a candlestick feed. Broker prices may differ. Green = buy · red = sell · faded = stale or offline.</p>
    {error && <p role="alert" className="neg">Gold levels could not refresh: {error}. Previously loaded levels may be outdated.</p>}
    {!targets.length ? <div className="empty">{loading ? "Loading gold positions…" : "No open XAUUSD or GOLD positions. Attach the MT5 agent to each account to see its take-profit levels here."}</div> : <div className="gold-scroll">
      <div className="gold-chart">
        <div className="gold-axis">
          <span className="small muted">Account / grid</span>
          <svg viewBox="0 0 720 36" width="100%" height="36" aria-hidden="true">
            {Array.from({length: 5}, (_, i) => min + (max-min)*i/4).map(n => <text key={n} x={x(n)} y="24" fill="currentColor" textAnchor="middle" fontSize="12">{price(n)}</text>)}
          </svg><span className="small muted">Price / TP</span>
        </div>
        {grids.map(p => {
          const color = p.type === "BUY" ? "#22c55e" : "#f87171";
          return <div key={p.id} className="gold-row" style={{ opacity: p.online && !error ? 1 : 0.6 }}>
            <div className="gold-account"><a href={`/accounts/${p.accountId}`}>{p.login}</a> <span style={{color}}>{p.type}</span> <span className="small muted">{p.volume} lots</span>
              <div className="small muted">{p.server} · {p.symbol} · EA {p.magic} · {p.positionCount} trades</div>
              <div className="small muted">{p.online ? "Reported" : "Stale/offline"}: {fmtDateTime(p.updatedAt)}</div>
            </div>
            <svg className="gold-level" viewBox="0 0 720 60" width="100%" height="60" role="img" aria-label={`Account ${p.login}, ${p.type}, price ${p.currentPrice}, ${p.tp > 0 ? `take profit ${p.tp}` : "no shared grid take profit"}`}>
              <line x1="30" x2="690" y1="30" y2="30" stroke="#334155" />
              {p.currentPrice > 0 && p.tp > 0 && <line x1={x(p.currentPrice)} x2={x(p.tp)} y1="30" y2="30" stroke={color} strokeWidth="2" />}
              {p.currentPrice > 0 && <circle cx={x(p.currentPrice)} cy="30" r="5" fill="#fbbf24" />}
              {p.tp > 0 && <path d={`M ${x(p.tp)} 22 l 8 8 l -8 8 l -8 -8 Z`} fill={color} />}
            </svg>
            <div className="gold-prices num small"><div>Price {p.currentPrice > 0 ? price(p.currentPrice) : "No price"}</div><div style={{color}}>TP {p.tp > 0 ? price(p.tp) : p.tpState === "mixed" ? "differs across trades" : "not reported"}</div></div>
          </div>;
        })}
      </div>
    </div>}
  </section>;
}
