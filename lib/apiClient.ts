"use client";

// Fetch autenticado do lado do cliente: injeta o token de sessão (guardado no
// localStorage, não em cookie — cookies cross-site em iframe são bloqueados por
// Safari ITP e outros navegadores) em toda chamada às rotas /api/*.

export const SESSION_KEY = "digisac_session";

export function getSessionToken(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(SESSION_KEY);
  } catch {
    return null; // localStorage pode estar bloqueado (modo privado, iframe restrito)
  }
}

export function setSessionToken(token: string): void {
  try {
    localStorage.setItem(SESSION_KEY, token);
  } catch {
    // sem storage disponível — sessão não persiste, mas não quebra o fluxo
  }
}

export function clearSessionToken(): void {
  try {
    localStorage.removeItem(SESSION_KEY);
  } catch {
    // ignora
  }
}

/** Redireciona para a tela de login, preservando o caminho atual pra voltar depois. */
export function redirectToLogin(): void {
  if (typeof window === "undefined") return;
  window.location.href = "/login";
}

/**
 * fetch() com o header Authorization já preenchido a partir da sessão local.
 * Em 401, limpa a sessão e redireciona pro login.
 */
export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const token = getSessionToken();
  const headers = new Headers(init.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const res = await fetch(path, { ...init, headers });
  if (res.status === 401) {
    clearSessionToken();
    redirectToLogin();
  }
  return res;
}
