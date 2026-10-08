"use client";

import { useMemo, useRef, useState } from "react";

export interface SeriesPoint {
  t: string | number;
  v: number;
}

export interface Series {
  name: string;
  color: string;
  points: SeriesPoint[];
  fill?: boolean;
}

interface Props {
  series: Series[];
  height?: number;
  formatV?: (v: number) => string;
  formatT?: (t: string | number) => string;
  zeroLine?: boolean;
}

/** Dependency-free SVG line/area chart with hover tooltip (equity curves). */
export default function LineChart({ series, height = 240, formatV, formatT, zeroLine = false }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [hover, setHover] = useState<{ x: number; idx: number } | null>(null);
  const W = 1000;
  const H = height;
  const PAD = { l: 58, r: 12, t: 10, b: 22 };

  const { paths, min, max, count, ticks } = useMemo(() => {
    const all = series.flatMap((s) => s.points);
    const count = Math.max(...series.map((s) => s.points.length), 0);
    let min = Infinity;
    let max = -Infinity;
    for (const p of all) {
      if (p.v < min) min = p.v;
      if (p.v > max) max = p.v;
    }
    if (!Number.isFinite(min)) { min = 0; max = 1; }
    if (zeroLine) { min = Math.min(min, 0); max = Math.max(max, 0); }
    if (min === max) { min -= 1; max += 1; }
    const pad = (max - min) * 0.06;
    min -= pad;
    max += pad;

    const x = (i: number) => PAD.l + (count <= 1 ? 0 : (i / (count - 1)) * (W - PAD.l - PAD.r));
    const y = (v: number) => PAD.t + (1 - (v - min) / (max - min)) * (H - PAD.t - PAD.b);

    const paths = series.map((s) => {
      const pts = s.points.map((p, i) => `${x(i).toFixed(2)},${y(p.v).toFixed(2)}`);
      const line = `M ${pts.join(" L ")}`;
      const area =
        s.fill === false || !pts.length
          ? ""
          : `M ${x(0)},${y(min)} L ${pts.join(" L ")} L ${x(s.points.length - 1)},${y(min)} Z`;
      return { line, area, color: s.color };
    });

    const tickCount = 4;
    const ticks = Array.from({ length: tickCount + 1 }, (_, i) => min + ((max - min) * i) / tickCount);
    return { paths, min, max, count, ticks };
  }, [series, height, zeroLine]);

  const fmtV = formatV ?? ((v: number) => v.toLocaleString("en-US", { maximumFractionDigits: 2 }));
  const fmtT =
    formatT ??
    ((t: string | number) => {
      const d = new Date(t);
      return isNaN(d.getTime()) ? String(t) : d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
    });

  if (count === 0) {
    return (
      <div className="empty" style={{ padding: 30 }}>
        <div className="big">∿</div>
        No series data yet — data appears once the agent reports.
      </div>
    );
  }

  const xOf = (i: number) => PAD.l + (count <= 1 ? 0 : (i / (count - 1)) * (W - PAD.l - PAD.r));
  const yOf = (v: number) => PAD.t + (1 - (v - min) / (max - min)) * (H - PAD.t - PAD.b);

  function onMove(e: React.MouseEvent) {
    const wrap = wrapRef.current;
    if (!wrap) return;
    const rect = wrap.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * W;
    const i = Math.round(((px - PAD.l) / (W - PAD.l - PAD.r)) * (count - 1));
    setHover({ x: e.clientX - rect.left, idx: Math.max(0, Math.min(count - 1, i)) });
  }

  const tipPoints =
    hover !== null
      ? series.map((s) => ({ name: s.name, color: s.color, pt: s.points[Math.min(hover.idx, s.points.length - 1)] }))
      : [];

  return (
    <div ref={wrapRef} style={{ position: "relative" }} onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
      <svg className="chart" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ height: H }}>
        {ticks.map((t, i) => (
          <g key={i}>
            <line x1={PAD.l} x2={W - PAD.r} y1={yOf(t)} y2={yOf(t)} stroke="#1c2742" strokeWidth={1} vectorEffect="non-scaling-stroke" />
            <text x={4} y={yOf(t) + 3.5} fill="#64748b" fontSize={10} fontFamily="var(--mono)">{fmtV(t)}</text>
          </g>
        ))}
        {zeroLine && min < 0 && max > 0 && (
          <line x1={PAD.l} x2={W - PAD.r} y1={yOf(0)} y2={yOf(0)} stroke="#475569" strokeDasharray="4 4" vectorEffect="non-scaling-stroke" />
        )}
        <text x={PAD.l} y={H - 6} fill="#64748b" fontSize={10}>{fmtT(series[0].points[0].t)}</text>
        <text x={W - PAD.r} y={H - 6} fill="#64748b" fontSize={10} textAnchor="end">{fmtT(series[0].points[count - 1].t)}</text>

        {paths.map((p, i) => (
          <g key={i}>
            {p.area && <path d={p.area} fill={p.color} opacity={0.1} />}
            <path d={p.line} fill="none" stroke={p.color} strokeWidth={1.8} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
          </g>
        ))}

        {hover && (
          <line x1={xOf(hover.idx)} x2={xOf(hover.idx)} y1={PAD.t} y2={H - PAD.b} stroke="#475569" strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
        )}
      </svg>

      {hover && (
        <div className="chart-tip" style={{ left: Math.min(Math.max(hover.x + 12, 4), (wrapRef.current?.clientWidth ?? 300) - 190), top: 8 }}>
          <div className="muted small" style={{ marginBottom: 3 }}>
            {tipPoints[0]?.pt ? fmtT(tipPoints[0].pt.t) : ""}
          </div>
          {tipPoints.map((tp, i) => (
            <div key={i} className="flex" style={{ gap: 6, flexWrap: "nowrap" }}>
              <span className="k" style={{ background: tp.color, width: 8, height: 8, borderRadius: 2, display: "inline-block" }} />
              <span>{tp.name}</span>
              <span className="num bold" style={{ marginLeft: "auto" }}>{tp.pt ? fmtV(tp.pt.v) : "—"}</span>
            </div>
          ))}
        </div>
      )}

      <div className="legend">
        {series.map((s, i) => (
          <span key={i}><span className="k" style={{ background: s.color }} />{s.name}</span>
        ))}
      </div>
    </div>
  );
}
