"use client";

import { useEffect, useState } from "react";
import { apiFetch, clearSessionToken, getSessionToken, setSessionToken } from "@/lib/apiClient";

type Status = "checking" | "authed" | "unauthed";

/**
 * Guarda de sessão do lado do cliente: confirma que há uma sessão válida antes
 * de renderizar o dashboard. Sem sessão em produção -> manda pra /login.
 * Em desenvolvimento, se não houver sessão salva, tenta abrir uma automática a
 * partir de DIGISAC_BASE_URL/DIGISAC_TOKEN do .env.local (ver
 * app/api/auth/dev-session/route.ts), pra não exigir login manual toda hora.
 */
export default function AuthGate({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<Status>("checking");

  useEffect(() => {
    let cancelled = false;

    async function check() {
      const existing = getSessionToken();
      if (existing) {
        const res = await apiFetch("/api/auth/session");
        if (cancelled) return;
        if (res.ok) {
          setStatus("authed");
          return;
        }
        clearSessionToken();
      }

      // sem sessão válida — tenta o atalho de dev (404 em produção)
      try {
        const devRes = await fetch("/api/auth/dev-session");
        if (!cancelled && devRes.ok) {
          const json = await devRes.json();
          setSessionToken(json.sessionToken);
          setStatus("authed");
          return;
        }
      } catch {
        // segue pro login
      }

      if (!cancelled) {
        window.location.href = "/login";
        setStatus("unauthed");
      }
    }

    check();
    return () => {
      cancelled = true;
    };
  }, []);

  if (status !== "authed") {
    return (
      <div className="state">
        <span className="pulse" />
        Verificando sessão…
      </div>
    );
  }

  return <>{children}</>;
}
