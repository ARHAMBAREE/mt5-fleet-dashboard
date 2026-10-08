"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiSend, ApiClientError } from "@/lib/client/api";

export default function RegisterPage() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await apiSend("POST", "/api/auth/register", { name, email, password });
      router.replace("/dashboard");
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Registration failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-wrap">
      <form className="auth-card" onSubmit={submit}>
        <div className="logo-row">
          <span className="brand-logo">F5</span>
          <h1>Create owner account</h1>
        </div>
        <div className="tag">First account becomes the workspace OWNER</div>
        {error && <div className="form-error">{error}</div>}
        <label className="field">
          <span className="lbl">NAME</span>
          <input className="input" required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" placeholder="Alex Trader" />
        </label>
        <label className="field">
          <span className="lbl">EMAIL</span>
          <input className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" placeholder="you@company.com" />
        </label>
        <label className="field">
          <span className="lbl">PASSWORD (10+ CHARS, LETTER + DIGIT)</span>
          <input className="input" type="password" required minLength={10} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" placeholder="••••••••••" />
        </label>
        <button className="btn primary block" disabled={busy} type="submit">
          {busy ? "Creating…" : "Create account"}
        </button>
        <div className="small muted" style={{ marginTop: 16, textAlign: "center" }}>
          Already registered? <Link href="/login">Sign in</Link>
        </div>
      </form>
    </div>
  );
}
