"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";
import { apiSend, ApiClientError } from "@/lib/client/api";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await apiSend("POST", "/api/auth/login", { email, password, remember: true });
      const next = params.get("next");
      router.replace(next && /^\/(?![\/\\])/.test(next) ? next : "/dashboard");
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : "Login failed — check your connection");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-wrap">
      <form className="auth-card" onSubmit={submit}>
        <div className="logo-row">
          <span className="brand-logo">F5</span>
          <h1>MT5 Fleet Dashboard</h1>
        </div>
        <div className="tag">Sign in to monitor your MT5 fleet</div>
        {error && <div className="form-error">{error}</div>}
        <label className="field">
          <span className="lbl">EMAIL</span>
          <input className="input" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" placeholder="you@company.com" />
        </label>
        <label className="field">
          <span className="lbl">PASSWORD</span>
          <input className="input" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" placeholder="••••••••••" />
        </label>
        <button className="btn primary block" disabled={busy} type="submit">
          {busy ? "Signing in…" : "Sign in"}
        </button>
        <div className="small muted" style={{ marginTop: 16, textAlign: "center" }}>
          No account yet? <Link href="/register">Create the owner account</Link>
        </div>
      </form>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
