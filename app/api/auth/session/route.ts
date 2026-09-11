import { NextResponse } from "next/server";
import { getCredsFromRequest } from "@/lib/session";

export const dynamic = "force-dynamic";

/** Confirma se o token de sessão enviado no header Authorization ainda é válido. */
export async function GET(req: Request) {
  const creds = getCredsFromRequest(req);
  if (!creds) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  return NextResponse.json({ ok: true, baseUrl: creds.baseUrl });
}
