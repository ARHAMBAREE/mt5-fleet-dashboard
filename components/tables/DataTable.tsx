"use client";

import { useEffect, useRef, useState } from "react";

export interface Column<T> {
  key: string;
  label: string;
  align?: "right";
  /** cell renderer */
  render?: (row: T) => React.ReactNode;
  /** comparable value for local sorting */
  value?: (row: T) => string | number;
  /** allow hiding via column picker (default true) */
  hideable?: boolean;
}

interface Props<T> {
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  storageKey?: string;
  sortKey?: string;
  sortDir?: "asc" | "desc";
  onSortChange?: (key: string, dir: "asc" | "desc") => void;
  onRowClick?: (row: T) => void;
  empty?: React.ReactNode;
  minWidth?: number;
}

/**
 * Sortable table with persisted column visibility (column customization).
 * Sorting: local via column.value, or delegated through onSortChange.
 */
export default function DataTable<T>({
  columns,
  rows,
  rowKey,
  storageKey,
  sortKey,
  sortDir = "asc",
  onSortChange,
  onRowClick,
  empty,
  minWidth,
}: Props<T>) {
  const [localSort, setLocalSort] = useState<{ key: string; dir: "asc" | "desc" }>({ key: "", dir: "asc" });
  const effectiveKey = sortKey ?? localSort.key;
  const effectiveDir = sortKey ? sortDir : localSort.dir;
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [pickerOpen, setPickerOpen] = useState(false);
  const pickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!storageKey) return;
    try {
      const raw = localStorage.getItem(`${storageKey}.cols`);
      if (raw) setHidden(new Set(JSON.parse(raw) as string[]));
    } catch { /* ignore */ }
  }, [storageKey]);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) setPickerOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  function toggle(key: string) {
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      if (storageKey) {
        try {
          localStorage.setItem(`${storageKey}.cols`, JSON.stringify([...next]));
        } catch { /* ignore */ }
      }
      return next;
    });
  }

  function headerClick(col: Column<T>) {
    if (col.value === undefined) return;
    const dir = effectiveKey === col.key && effectiveDir === "asc" ? "desc" : "asc";
    if (onSortChange) onSortChange(col.key, dir);
    else setLocalSort({ key: col.key, dir });
  }

  const sortingColumn = columns.find(c => c.key === effectiveKey);
  const sorted = onSortChange || !sortingColumn?.value ? rows : [...rows].sort((a, b) => {
    const x = sortingColumn.value!(a), y = sortingColumn.value!(b);
    return (effectiveDir === "asc" ? 1 : -1) * (typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y)));
  });
  const visible = columns.filter((c) => !hidden.has(c.key));
  const hideableCount = columns.filter((c) => c.hideable !== false).length;

  if (!rows.length && empty) return <>{empty}</>;

  return (
    <div>
      {storageKey && hideableCount > 1 && (
        <div style={{ display: "flex", justifyContent: "flex-end", position: "relative", marginBottom: 8 }} ref={pickerRef}>
          <button className="btn sm" onClick={() => setPickerOpen((o) => !o)}>⚙ Columns</button>
          {pickerOpen && (
            <div
              className="card"
              style={{ position: "absolute", top: 34, right: 0, zIndex: 20, width: 230, padding: 12 }}
            >
              <div className="small muted bold" style={{ marginBottom: 8 }}>VISIBLE COLUMNS</div>
              {columns.filter((c) => c.hideable !== false).map((c) => (
                <label key={c.key} className="flex" style={{ gap: 8, padding: "4px 0", cursor: "pointer" }}>
                  <input type="checkbox" checked={!hidden.has(c.key)} onChange={() => toggle(c.key)} />
                  <span className="small">{c.label}</span>
                </label>
              ))}
              <button className="btn sm block mt" onClick={() => { setHidden(new Set()); if (storageKey) localStorage.removeItem(`${storageKey}.cols`); }}>
                Reset
              </button>
            </div>
          )}
        </div>
      )}

      <div className="table-wrap">
        <table className="data" style={minWidth ? { minWidth } : undefined}>
          <thead>
            <tr>
              {visible.map((c) => (
                <th
                  key={c.key}
                  className={c.align === "right" ? "right" : ""}
                  onClick={() => headerClick(c)}
                  title={c.value ? "Sort" : undefined}
                >
                  {c.label}
                  {effectiveKey === c.key && <span className="arrow">{effectiveDir === "asc" ? "▲" : "▼"}</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((row) => (
              <tr
                key={rowKey(row)}
                className={onRowClick ? "clickable" : ""}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
              >
                {visible.map((c) => (
                  <td key={c.key} className={c.align === "right" ? "right" : ""}>
                    {c.render ? c.render(row) : String(c.value?.(row) ?? "")}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
