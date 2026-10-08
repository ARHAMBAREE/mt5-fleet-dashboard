"use client";

interface Bar {
  label: string;
  v: number;
}

/** Compact P/L bar chart (green/red) used for daily performance. */
export default function BarChart({ bars, height = 160, formatV }: { bars: Bar[]; height?: number; formatV?: (v: number) => string }) {
  const fmt = formatV ?? ((v: number) => v.toLocaleString("en-US", { maximumFractionDigits: 0 }));

  if (!bars.length) {
    return (
      <div className="empty" style={{ padding: 26 }}>
        <div className="big">▤</div>
        No closed trades today yet.
      </div>
    );
  }

  const maxAbs = Math.max(...bars.map((b) => Math.abs(b.v)), 1);
  const zero = height / 2;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 3, height }}>
        {bars.map((b, i) => {
          const h = (Math.abs(b.v) / maxAbs) * (height / 2 - 6);
          const positive = b.v >= 0;
          return (
            <div
              key={i}
              title={`${b.label}: ${fmt(b.v)}`}
              style={{
                flex: 1,
                height: Math.max(h, 2),
                alignSelf: positive ? "flex-end" : "flex-start",
                marginBottom: positive ? zero - height / 2 + 0 : 0,
                transform: positive ? `translateY(-${zero - 2}px)` : `translateY(${height / 2 - h}px)`,
                background: positive ? "var(--green)" : "var(--red)",
                borderRadius: 2,
                minWidth: 4,
                opacity: 0.85,
              }}
            />
          );
        })}
      </div>
      <div className="flex" style={{ justifyContent: "space-between", marginTop: 6 }}>
        <span className="small muted">{bars[0].label}</span>
        <span className="small muted">{bars[bars.length - 1].label}</span>
      </div>
    </div>
  );
}
