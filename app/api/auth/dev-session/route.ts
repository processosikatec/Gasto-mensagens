import { NextResponse } from "next/server";
import { encryptSession } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * Atalho SÓ de desenvolvimento: gera uma sessão a partir de DIGISAC_BASE_URL /
 * DIGISAC_TOKEN em .env.local, pra não exigir login manual a cada `npm run dev`.
 * Sempre 404 em produção — nunca deve vazar credencial fixa pra um deploy real.
 */
export async function GET() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "not found" }, { status: 404 });
  }

  const baseUrl = process.env.DIGISAC_BASE_URL;
  const token = process.env.DIGISAC_TOKEN;
  if (!baseUrl || !token) {
    return NextResponse.json(
      { error: "DIGISAC_BASE_URL / DIGISAC_TOKEN não configurados em .env.local" },
      { status: 404 },
    );
  }

  try {
    const { sessionToken, expiresAt } = encryptSession({ baseUrl, token });
    return NextResponse.json({ sessionToken, expiresAt });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "Falha ao criar sessão." }, { status: 500 });
  }
}
