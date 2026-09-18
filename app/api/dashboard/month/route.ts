import { NextResponse } from "next/server";
import { fetchMonth } from "@/lib/digisac";
import { getCredsFromRequest } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const creds = getCredsFromRequest(req);
  if (!creds) {
    return NextResponse.json(
      { error: "Sessão expirada ou inválida. Faça login novamente." },
      { status: 401 },
    );
  }

  const url = new URL(req.url);
  const month = url.searchParams.get("month");
  const nowIso = url.searchParams.get("nowIso");
  const serviceIdsParam = url.searchParams.get("serviceIds");

  if (!month || !/^\d{4}-\d{2}$/.test(month)) {
    return NextResponse.json({ error: "Parâmetro 'month' inválido." }, { status: 400 });
  }
  if (!nowIso) {
    return NextResponse.json({ error: "Parâmetro 'nowIso' obrigatório." }, { status: 400 });
  }
  // ausente = todas as conexões (mesma semântica de `undefined` em fetchMonth);
  // string vazia = nenhuma conexão selecionada (força zero, ver scopeToServices)
  const serviceIds = serviceIdsParam === null ? undefined : serviceIdsParam.split(",").filter(Boolean);

  try {
    // fetchMonth nunca lança para falhas da API Digisac — captura internamente
    // e devolve { ...bucket vazio, unavailable: true }, sempre com 200. Um erro
    // aqui é inesperado (bug ou 401 já tratado acima).
    const bucket = await fetchMonth(creds, month, serviceIds, nowIso);
    return NextResponse.json(bucket);
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "erro desconhecido" },
      { status: 500 },
    );
  }
}
