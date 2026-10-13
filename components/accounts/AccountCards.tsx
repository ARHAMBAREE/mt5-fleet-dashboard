"use client";
import {useState} from "react";
import Link from "next/link";
import {compareAccountIdentity} from "@/shared/account-order";
import type {AccountSummary} from "@/shared/types";
import {apiSend} from "@/lib/client/api";
import {money, signedMoney} from "@/lib/format";

export default function AccountCards({rows,onUpdated}:{rows:AccountSummary[];onUpdated:()=>void}) {
  const [search,setSearch]=useState("");
  const [filter,setFilter]=useState("");
  const [editing,setEditing]=useState<string|null>(null);
  const [name,setName]=useState("");
  const [pending,setPending]=useState<string|null>(null);
  const [error,setError]=useState("");
  async function save(id:string,data:{displayName?:string;favorite?:boolean}) {
    setPending(id);setError("");
    try {await apiSend("PATCH",`/api/accounts/${id}`,data);if(data.displayName!==undefined)setEditing(null);onUpdated();}
    catch(e){setError(e instanceof Error?e.message:"Could not save account");}
    finally{setPending(null);}
  }
  async function remove(id:string,title:string) {
    if(!confirm(`Delete account "${title}"? All snapshots, positions, orders, and historical data will be permanently removed.`)) return;
    setPending(id);setError("");
    try {await apiSend("DELETE",`/api/accounts/${id}`);onUpdated();}
    catch(e){setError(e instanceof Error?e.message:"Could not delete account");}
    finally{setPending(null);}
  }
  const needle=search.trim().toLowerCase();
  const visible=rows.filter(r=>[r.displayName,r.login,r.broker,r.server].some(s=>s?.toLowerCase().includes(needle)) && (!filter || (filter==="favorites"?r.favorite:r.eaStatus===filter))).sort((a,b)=>Number(b.favorite)-Number(a.favorite) || compareAccountIdentity(a,b));
  return <section className="portfolio-accounts" aria-label="Account portfolio">
    <div className="portfolio-filters">
      <input className="input" aria-label="Search accounts" placeholder="Search accounts, brokers, logins…" value={search} onChange={e=>setSearch(e.target.value)}/>
      <select className="select" aria-label="Filter accounts" value={filter} onChange={e=>setFilter(e.target.value)}>
        <option value="">All accounts</option><option value="favorites">Favorites</option><option value="ONLINE">Connected</option><option value="WARNING">Connection warning</option><option value="OFFLINE">Offline</option>
      </select>
    </div>
    {error && <p role="alert" className="form-error">{error}</p>}
    <div className="account-card-grid">
      {visible.map(r=>{
        const title=r.displayName || `Account ${r.login}`;
        const initials=r.displayName ? r.displayName.trim().slice(0,2).toUpperCase() : r.login.slice(-2);
        return <article className="portfolio-account" key={r.id}>
          <header className="account-card-head">
            <span className="account-avatar" aria-hidden="true">{initials}</span>
            <div className="account-identity"><Link href={`/accounts/${r.id}`} className="account-name">{title}</Link><div className="account-broker">#{r.login} · {r.broker}</div></div>
            <button className={`favorite-button ${r.favorite?"selected":""}`} aria-label={`${r.favorite?"Unfavorite":"Favorite"} ${title}`} aria-pressed={r.favorite} disabled={pending===r.id} onClick={()=>void save(r.id,{favorite:!r.favorite})}>{r.favorite?"★":"☆"}</button>
          </header>
          <div className="account-card-status"><span><i className={`account-dot ${r.eaStatus.toLowerCase()}`}/>{r.eaStatus==="ONLINE"?"Connected":r.eaStatus==="WARNING"?"Connection warning":"Offline · last known values"}</span><span>{r.openPositions} open</span></div>
          <dl className="account-metrics">
            <div><dt>Equity</dt><dd>{money(r.equity,r.currency)}</dd></div>
            <div><dt>Floating P&amp;L</dt><dd className={r.floatingPl<0?"neg":r.floatingPl>0?"pos":""}>{signedMoney(r.floatingPl,r.currency)}</dd></div>
            <div><dt>Balance</dt><dd>{money(r.balance,r.currency)}</dd></div>
            <div><dt>Drawdown</dt><dd className={r.drawdownPct>=10?"neg":""}>{r.drawdownPct.toFixed(2)}%</dd><span className="account-day">max {r.maxDrawdownPct.toFixed(2)}%</span></div>
            <div><dt>Today realized</dt><dd className={r.todayRealizedPl==null?"muted":r.todayRealizedPl<0?"neg":"pos"}>{r.todayRealizedPl==null?"Awaiting data":signedMoney(r.todayRealizedPl,r.currency)}</dd><span className="account-day">Pakistan day</span></div>
            <div><dt>Month realized</dt><dd className={r.monthlyRealizedPl==null?"muted":r.monthlyRealizedPl<0?"neg":"pos"}>{r.monthlyRealizedPl==null?"Awaiting data":signedMoney(r.monthlyRealizedPl,r.currency)}</dd><span className="account-day">Pakistan month</span></div>
          </dl>
          {editing===r.id ? <form className="account-name-form" onSubmit={e=>{e.preventDefault();void save(r.id,{displayName:name});}}>
            <label htmlFor={`name-${r.id}`}>Account name</label><input autoFocus id={`name-${r.id}`} className="input" maxLength={80} value={name} onChange={e=>setName(e.target.value)}/>
            <div className="flex"><button className="btn primary" disabled={pending===r.id}>Save</button><button type="button" className="btn" onClick={()=>setEditing(null)}>Cancel</button></div>
          </form> : <div className="account-card-footer"><Link href={`/accounts/${r.id}`}>View account <span aria-hidden="true">›</span></Link><button className="rename-account" onClick={()=>{setEditing(r.id);setName(r.displayName??"");setError("");}}>Edit name</button><button className="rename-account" style={{color:"#ff555e"}} disabled={pending===r.id} onClick={()=>void remove(r.id,title)}>Delete</button></div>}
        </article>;
      })}

    </div>
    {!visible.length&&<div className="empty">{rows.length?"No accounts match your search.":"No accounts yet. Pair an MT5 terminal to see it here."}</div>}
  </section>;
}
