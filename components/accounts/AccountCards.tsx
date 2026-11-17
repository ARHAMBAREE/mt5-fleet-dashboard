"use client";
import {useState, useEffect} from "react";
import Link from "next/link";
import {compareAccountIdentity} from "@/shared/account-order";
import type {AccountSummary} from "@/shared/types";
import {apiSend} from "@/lib/client/api";
import {money, signedMoney, fmtPrice} from "@/lib/format";
import {useCurrentUser} from "@/lib/client/useUser";

export default function AccountCards({rows,onUpdated}:{rows:AccountSummary[];onUpdated:()=>void}) {
  const {isViewer} = useCurrentUser();
  const [search,setSearch]=useState("");
  const [filter,setFilter]=useState("");
  const [editing,setEditing]=useState<string|null>(null);
  const [name,setName]=useState("");
  const [pending,setPending]=useState<string|null>(null);
  const [error,setError]=useState("");
  const [openMenu, setOpenMenu] = useState<string | null>(null);

  useEffect(() => {
    if (!openMenu) return;
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as HTMLElement;
      if (!target.closest(".account-menu-container")) {
        setOpenMenu(null);
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpenMenu(null);
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [openMenu]);

  async function save(id:string,data:{displayName?:string;favorite?:boolean;botType?:"SAFE"|"AGGRESSIVE"|"NONE"}) {
    setPending(id);setError("");
    try {await apiSend("PATCH",`/api/accounts/${id}`,data);if(data.displayName!==undefined)setEditing(null);onUpdated();}
    catch(e){setError(e instanceof Error?e.message:"Could not save account");}
    finally{setPending(null);}
  }

  async function makeFirst(id: string) {
    setPending(id);
    setError("");
    try {
      const currentIds = rows.map((r) => r.id);
      const newOrder = [id, ...currentIds.filter((x) => x !== id)];
      await apiSend("PUT", "/api/settings", { key: "accountOrder", value: { order: newOrder } });
      onUpdated();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not reorder accounts");
    } finally {
      setPending(null);
    }
  }

  async function remove(id:string,title:string) {
    if(!confirm(`Delete account "${title}"? All snapshots, positions, orders, and historical data will be permanently removed.`)) return;
    setPending(id);setError("");
    try {await apiSend("DELETE",`/api/accounts/${id}`);onUpdated();}
    catch(e){setError(e instanceof Error?e.message:"Could not delete account");}
    finally{setPending(null);}
  }

  const needle=search.trim().toLowerCase();
  const visible = rows
    .filter(
      (r) =>
        [r.displayName, r.login, r.broker, r.server].some((s) => s?.toLowerCase().includes(needle)) &&
        (!filter || (filter === "favorites" ? r.favorite : r.eaStatus === filter))
    )
    .sort((a, b) => {
      const orderA = a.sortOrder ?? 0;
      const orderB = b.sortOrder ?? 0;
      if (orderA !== orderB) return orderA - orderB;
      return Number(b.favorite) - Number(a.favorite) || compareAccountIdentity(a, b);
    });

  return (
    <section className="portfolio-accounts" aria-label="Account portfolio">
      <div className="portfolio-filters">
        <input
          className="input"
          aria-label="Search accounts"
          placeholder="Search accounts, brokers, logins…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select
          className="select"
          aria-label="Filter accounts"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
        >
          <option value="">All accounts</option>
          <option value="favorites">Favorites</option>
          <option value="ONLINE">Connected</option>
          <option value="WARNING">Connection warning</option>
          <option value="OFFLINE">Offline</option>
        </select>
        {!isViewer && rows.length > 1 && (
          <Link
            href="/settings#account-order"
            className="btn sm"
            style={{ textDecoration: "none", display: "inline-flex", alignItems: "center", gap: 5, whiteSpace: "nowrap" }}
            title="Reorganize accounts in Settings"
          >
            <span>⚙️</span>
            <span>Reorganize</span>
          </Link>
        )}
      </div>
      {error && <p role="alert" className="form-error">{error}</p>}
      <div className="account-card-grid">
        {visible.map((r, index) => {
          const title = r.displayName || `Account ${r.login}`;
          const initials = r.displayName ? r.displayName.trim().slice(0, 2).toUpperCase() : r.login.slice(-2);
          const isShowingFirst = index === 0 && rows.length > 1;

          return (
            <article className="portfolio-account" key={r.id}>
              <header className="account-card-head">
                <span className="account-avatar" aria-hidden="true">{initials}</span>
                <div className="account-identity">
                  <Link href={`/accounts/${r.id}`} className="account-name">{title}</Link>
                  <div className="account-broker">#{r.login} · {r.broker}</div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  {r.botType === "SAFE" && (
                    <span
                      title="Assigned to Safe Bot"
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        padding: "2px 6px",
                        borderRadius: 4,
                        background: "rgba(16, 185, 129, 0.15)",
                        color: "#34d399",
                        border: "1px solid rgba(16, 185, 129, 0.35)",
                        letterSpacing: "0.5px",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 3,
                      }}
                    >
                      <span>🛡️</span>
                      <span>SAFE</span>
                    </span>
                  )}
                  {r.botType === "AGGRESSIVE" && (
                    <span
                      title="Assigned to Aggressive Bot"
                      style={{
                        fontSize: 10,
                        fontWeight: 700,
                        padding: "2px 6px",
                        borderRadius: 4,
                        background: "rgba(249, 115, 22, 0.15)",
                        color: "#fb923c",
                        border: "1px solid rgba(249, 115, 22, 0.35)",
                        letterSpacing: "0.5px",
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 3,
                      }}
                    >
                      <span>⚡</span>
                      <span>AGGR</span>
                    </span>
                  )}
                  {!isViewer && (
                    <>
                      {isShowingFirst && (
                        <span
                          title="This account is set to show first"
                          style={{
                            fontSize: 10,
                            fontWeight: 700,
                            padding: "2px 6px",
                            borderRadius: 4,
                            background: "rgba(59, 130, 246, 0.2)",
                            color: "#60a5fa",
                            border: "1px solid rgba(96, 165, 250, 0.3)",
                            letterSpacing: "0.5px",
                          }}
                        >
                          ★ #1
                        </span>
                      )}
                      <button
                        className={`favorite-button ${r.favorite ? "selected" : ""}`}
                        aria-label={`${r.favorite ? "Unfavorite" : "Favorite"} ${title}`}
                        aria-pressed={r.favorite}
                        disabled={pending === r.id}
                        onClick={() => void save(r.id, { favorite: !r.favorite })}
                      >
                        {r.favorite ? "★" : "☆"}
                      </button>
                    </>
                  )}
                </div>
              </header>
              <div className="account-card-status">
                <span>
                  <i className={`account-dot ${r.eaStatus.toLowerCase()}`} />
                  {r.eaStatus === "ONLINE" ? "Connected" : r.eaStatus === "WARNING" ? "Connection warning" : "Offline · last known values"}
                </span>
                <span>{r.openPositions} open</span>
              </div>
              <dl className="account-metrics">
                <div><dt>Equity</dt><dd>{money(r.equity, r.currency)}</dd></div>
                <div><dt>Floating P&amp;L</dt><dd className={r.floatingPl < 0 ? "neg" : r.floatingPl > 0 ? "pos" : ""}>{signedMoney(r.floatingPl, r.currency)}</dd></div>
                <div><dt>Balance</dt><dd>{money(r.balance, r.currency)}</dd></div>
                <div><dt>Today realized</dt><dd className={r.todayRealizedPl == null ? "muted" : r.todayRealizedPl < 0 ? "neg" : "pos"}>{r.todayRealizedPl == null ? "Awaiting data" : signedMoney(r.todayRealizedPl, r.currency)}</dd><span className="account-day">Broker day</span></div>
                <div><dt>Month realized</dt><dd className={r.monthlyRealizedPl == null ? "muted" : r.monthlyRealizedPl < 0 ? "neg" : "pos"}>{r.monthlyRealizedPl == null ? "Awaiting data" : signedMoney(r.monthlyRealizedPl, r.currency)}</dd><span className="account-day">Broker month</span></div>
                <div>
                  <dt>Take Profit (TP)</dt>
                  <dd style={{ display: "flex", flexDirection: "column", gap: 3, fontSize: "clamp(13px, 3.5vw, 15px)" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", maxWidth: 180 }}>
                      <span style={{ fontSize: 10, fontWeight: 700, padding: "1px 5px", borderRadius: 3, background: "rgba(34, 197, 94, 0.15)", color: "#22c55e", letterSpacing: "0.5px" }}>BUY TP</span>
                      <span style={{ fontVariantNumeric: "tabular-nums", fontWeight: 600, color: r.buyTp ? "#22c55e" : "#8a829d" }}>{fmtPrice(r.buyTp)}</span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", maxWidth: 180 }}>
                      <span style={{ fontSize: 10, fontWeight: 700, padding: "1px 5px", borderRadius: 3, background: "rgba(248, 113, 113, 0.15)", color: "#f87171", letterSpacing: "0.5px" }}>SELL TP</span>
                      <span style={{ fontVariantNumeric: "tabular-nums", fontWeight: 600, color: r.sellTp ? "#f87171" : "#8a829d" }}>{fmtPrice(r.sellTp)}</span>
                    </div>
                  </dd>
                  <span className="account-day">Buy / Sell side</span>
                </div>
              </dl>
              {editing === r.id && !isViewer ? (
                <form className="account-name-form" onSubmit={(e) => { e.preventDefault(); void save(r.id, { displayName: name }); }}>
                  <label htmlFor={`name-${r.id}`}>Account name</label>
                  <input autoFocus id={`name-${r.id}`} className="input" maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
                  <div className="flex">
                    <button className="btn primary" disabled={pending === r.id}>Save</button>
                    <button type="button" className="btn" onClick={() => setEditing(null)}>Cancel</button>
                  </div>
                </form>
              ) : (
                <div className="account-card-footer" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
                  <Link href={`/accounts/${r.id}`} style={{ display: "inline-flex", alignItems: "center", gap: 6, minHeight: 36, flex: 1, minWidth: 0 }}>
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>View account</span>
                    <span aria-hidden="true" style={{ fontSize: 18, lineHeight: 1 }}>›</span>
                  </Link>
                  {!isViewer && (
                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                      <select
                        aria-label="Assign Bot Tab"
                        title="Assign to Safe Bot or Aggressive Bot"
                        style={{
                          background: r.botType === "SAFE" ? "rgba(16, 185, 129, 0.12)" : r.botType === "AGGRESSIVE" ? "rgba(249, 115, 22, 0.12)" : "rgba(255, 255, 255, 0.04)",
                          border: r.botType === "SAFE" ? "1px solid rgba(16, 185, 129, 0.35)" : r.botType === "AGGRESSIVE" ? "1px solid rgba(249, 115, 22, 0.35)" : "1px solid var(--border)",
                          color: r.botType === "SAFE" ? "#34d399" : r.botType === "AGGRESSIVE" ? "#fb923c" : "var(--muted)",
                          borderRadius: 6,
                          padding: "4px 8px",
                          fontSize: 11,
                          fontWeight: 600,
                          cursor: "pointer",
                          outline: "none",
                        }}
                        value={r.botType || "NONE"}
                        disabled={pending === r.id}
                        onChange={(e) => void save(r.id, { botType: e.target.value as "SAFE" | "AGGRESSIVE" | "NONE" })}
                      >
                        <option value="NONE" style={{ background: "#1b1928", color: "#f0edf8" }}>No Bot</option>
                        <option value="SAFE" style={{ background: "#1b1928", color: "#34d399" }}>🛡️ Safe Bot</option>
                        <option value="AGGRESSIVE" style={{ background: "#1b1928", color: "#fb923c" }}>⚡ Aggressive Bot</option>
                      </select>

                      {/* 3-dot Menu for Excess Options */}
                      <div className="account-menu-container" style={{ position: "relative", display: "inline-flex", alignItems: "center" }}>
                        <button
                          type="button"
                          className="account-menu-trigger"
                          aria-label={`More options for ${title}`}
                          aria-expanded={openMenu === r.id}
                          aria-haspopup="true"
                          title="More options"
                          disabled={pending === r.id}
                          onClick={() => setOpenMenu(openMenu === r.id ? null : r.id)}
                          style={{
                            background: openMenu === r.id ? "rgba(255, 255, 255, 0.14)" : "rgba(255, 255, 255, 0.04)",
                            border: "1px solid",
                            borderColor: openMenu === r.id ? "rgba(255, 255, 255, 0.25)" : "var(--border)",
                            borderRadius: 6,
                            width: 28,
                            height: 28,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            color: openMenu === r.id ? "#fff" : "var(--muted)",
                            cursor: "pointer",
                            padding: 0,
                            transition: "all 0.15s ease",
                          }}
                        >
                          <svg width="15" height="15" viewBox="0 0 16 16" fill="currentColor">
                            <circle cx="8" cy="3" r="1.5" />
                            <circle cx="8" cy="8" r="1.5" />
                            <circle cx="8" cy="13" r="1.5" />
                          </svg>
                        </button>

                        {openMenu === r.id && (
                          <div
                            role="menu"
                            className="account-dropdown-menu"
                            style={{
                              position: "absolute",
                              bottom: "calc(100% + 6px)",
                              right: 0,
                              minWidth: 150,
                              background: "#181524",
                              border: "1px solid rgba(255, 255, 255, 0.14)",
                              borderRadius: 10,
                              padding: "4px",
                              boxShadow: "0 10px 25px -4px rgba(0, 0, 0, 0.7), 0 4px 10px -2px rgba(0, 0, 0, 0.5)",
                              zIndex: 50,
                              display: "flex",
                              flexDirection: "column",
                              gap: 2,
                            }}
                          >
                            {!isShowingFirst && rows.length > 1 && (
                              <button
                                type="button"
                                role="menuitem"
                                disabled={pending === r.id}
                                onClick={() => {
                                  setOpenMenu(null);
                                  void makeFirst(r.id);
                                }}
                                style={{
                                  display: "flex",
                                  alignItems: "center",
                                  gap: 8,
                                  width: "100%",
                                  padding: "7px 10px",
                                  border: "none",
                                  borderRadius: 6,
                                  background: "transparent",
                                  color: "#93c5fd",
                                  fontSize: 12,
                                  fontWeight: 500,
                                  textAlign: "left",
                                  cursor: "pointer",
                                }}
                                onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(147, 197, 253, 0.1)")}
                                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                              >
                                <span>⭐</span>
                                <span>Show first</span>
                              </button>
                            )}

                            <button
                              type="button"
                              role="menuitem"
                              disabled={pending === r.id}
                              onClick={() => {
                                setOpenMenu(null);
                                setEditing(r.id);
                                setName(r.displayName ?? "");
                                setError("");
                              }}
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 8,
                                width: "100%",
                                padding: "7px 10px",
                                border: "none",
                                borderRadius: 6,
                                background: "transparent",
                                color: "#e2daf0",
                                fontSize: 12,
                                fontWeight: 500,
                                textAlign: "left",
                                cursor: "pointer",
                              }}
                              onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(255, 255, 255, 0.08)")}
                              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                            >
                              <span>✏️</span>
                              <span>Edit name</span>
                            </button>

                            <div style={{ height: 1, background: "rgba(255, 255, 255, 0.08)", margin: "3px 0" }} />

                            <button
                              type="button"
                              role="menuitem"
                              disabled={pending === r.id}
                              onClick={() => {
                                setOpenMenu(null);
                                void remove(r.id, title);
                              }}
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: 8,
                                width: "100%",
                                padding: "7px 10px",
                                border: "none",
                                borderRadius: 6,
                                background: "transparent",
                                color: "#f87171",
                                fontSize: 12,
                                fontWeight: 500,
                                textAlign: "left",
                                cursor: "pointer",
                              }}
                              onMouseEnter={(e) => (e.currentTarget.style.background = "rgba(248, 113, 113, 0.12)")}
                              onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                            >
                              <span>🗑️</span>
                              <span>Delete</span>
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}
            </article>
          );
        })}
      </div>
      {!visible.length && <div className="empty">{rows.length ? "No accounts match your search." : "No accounts yet. Pair an MT5 terminal to see it here."}</div>}
    </section>
  );
}
