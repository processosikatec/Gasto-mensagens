import { NextResponse } from "next/server";
import { fetchServices } from "@/lib/digisac";
import { encryptSession } from "@/lib/session";

export const dynamic = "force-dynamic";

function normalizeBaseUrl(raw: string): string | null {
  let url = raw.trim().replace(/\/$/, "");
  if (!url) return null;
  if (!/^https?:\/\//i.test(url)) url = "https://" + url;
  try {
    const u = new URL(url);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    return url;
  } catch {
    return null;
  }
}

export async function POST(req: Request) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Corpo da requisição inválido." }, { status: 400 });
  }

  const baseUrl = normalizeBaseUrl(String(body?.baseUrl ?? ""));
  const token = String(body?.token ?? "").trim();

  if (!baseUrl) {
    return NextResponse.json({ error: "Informe a URL da Digisac." }, { status: 400 });
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
