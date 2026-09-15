import { NextResponse } from "next/server";
import { fetchServices } from "@/lib/digisac";
import { clientKey, isRateLimited } from "@/lib/rateLimit";
import { encryptSession } from "@/lib/session";

export const dynamic = "force-dynamic";

const LOGIN_LIMIT = 10; // tentativas
const LOGIN_WINDOW_MS = 5 * 60 * 1000; // por 5 minutos, por IP

// Allowlist: só aceita hosts reais da Digisac. Sem isso, baseUrl vira um vetor
// de SSRF — o servidor faria fetch() para qualquer host que o cliente mandasse
// (rede interna, metadata de cloud, localhost etc.).
const ALLOWED_HOST_SUFFIXES = [
  ".digisac.chat",
  ".digisac.io",
  ".digisac.ai",
  ".digisac.me",
  ".digisac.co",
  ".digisac.biz",
  ".digisac.net",
];

function normalizeBaseUrl(raw: string): string | null {
  let url = raw.trim().replace(/\/$/, "");
  if (!url) return null;
  if (!/^https?:\/\//i.test(url)) url = "https://" + url;

  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  if (u.protocol !== "https:") return null; // só https — não relaxa nem para http

  const host = u.hostname.toLowerCase();
  const isAllowed = ALLOWED_HOST_SUFFIXES.some(
    (suffix) => host === suffix.slice(1) || host.endsWith(suffix),
  );
  if (!isAllowed) return null;

  return `https://${host}`;
}

export async function POST(req: Request) {
  if (isRateLimited(`login:${clientKey(req)}`, LOGIN_LIMIT, LOGIN_WINDOW_MS)) {
    return NextResponse.json(
      { error: "Muitas tentativas. Aguarde alguns minutos e tente novamente." },
      { status: 429 },
    );
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Corpo da requisição inválido." }, { status: 400 });
  }

  const baseUrl = normalizeBaseUrl(String(body?.baseUrl ?? ""));
  const token = String(body?.token ?? "").trim();

  if (!baseUrl) {
    return NextResponse.json(
      { error: "URL inválida. Use o endereço da sua conta Digisac (ex: suaempresa.digisac.chat)." },
      { status: 400 },
    );
  }
  if (!token) {
    return NextResponse.json({ error: "Informe o token de acesso." }, { status: 400 });
  }

  // valida a credencial com uma chamada real à API Digisac antes de aceitar
  try {
    await fetchServices({ baseUrl, token });
  } catch (err: any) {
    return NextResponse.json(
      { error: "URL ou token inválidos. Confira os dados e tente novamente." },
      { status: 400 },
    );
  }

  try {
    const { sessionToken, expiresAt } = encryptSession({ baseUrl, token });
    return NextResponse.json({ sessionToken, expiresAt });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "Falha ao criar sessão." },
      { status: 500 },
    );
  }
}
