"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { setSessionToken } from "@/lib/apiClient";

export default function LoginPage() {
  const router = useRouter();
  const [baseUrl, setBaseUrl] = useState("");
  const [token, setToken] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setErr(null);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ baseUrl, token }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || "Não foi possível entrar.");
      }
      setSessionToken(json.sessionToken);
      router.push("/");
    } catch (e: any) {
      setErr(e?.message || "Falha ao entrar.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="wrap login-wrap">
      <div className="login-card panel">
        <p className="kicker">
          <span className="wordmark">digisac</span> · WhatsApp Business
        </p>
        <h1 className="login-title">Entrar</h1>
        <p className="hint">
          Informe a URL e o token de acesso da sua conta Digisac para ver a volumetria e os
          custos das suas mensagens.
        </p>

        <form onSubmit={onSubmit} className="login-form">
          <div className="field">
            <label htmlFor="baseUrl">URL da Digisac</label>
            <input
              id="baseUrl"
              type="text"
              placeholder="suaempresa.digisac.chat"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              autoComplete="url"
              required
            />
          </div>
          <div className="field">
            <label htmlFor="token">Token de acesso</label>
            <input
              id="token"
              type="password"
              placeholder="Token da API Digisac"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              autoComplete="off"
              required
            />
          </div>

          {err && <div className="login-error">{err}</div>}

          <button type="submit" className="act login-submit" disabled={loading}>
            {loading ? "Verificando…" : "Entrar"}
          </button>
        </form>
      </div>
    </main>
  );
}
