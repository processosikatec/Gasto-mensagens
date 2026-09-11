import { NextResponse } from "next/server";
import { classifyService, fetchServicesRaw } from "@/lib/digisac";
import { getCredsFromRequest } from "@/lib/session";

export const dynamic = "force-dynamic";

// Debug: lista as conexões da conta com o tipo e a classificação aplicada,
// pra conferir quais entram como "API oficial da Meta".
export async function GET(req: Request) {
  const creds = getCredsFromRequest(req);
  if (!creds) {
    return NextResponse.json(
      { error: "Sessão expirada ou inválida. Faça login novamente." },
      { status: 401 },
    );
  }

  try {
    const raw = await fetchServicesRaw(creds);
    const rows = raw.map((s) => ({
      name: s.name,
      type: s.type,
      kind: classifyService(s),
      connected: !!s?.data?.status?.isConnected,
      archived: !!s?.archivedAt || !!s?.deletedAt,
      // pistas usadas na heuristica:
      hints: {
        hub360PartnerId: s?.data?.hub360PartnerId ?? null,
        tokenSandBox360: s?.settings?.tokenSandBox360 ?? null,
        wabaId: s?.data?.wabaId ?? null,
        phoneNumberId: s?.data?.phoneNumberId ?? null,
        waAutoUpdate: s?.data?.waAutoUpdate !== undefined,
        isMultiDevice: s?.isMultiDevice ?? null,
        waba_account_keys: Object.keys(s?.internalData?.waba_account || {}),
      },
    }));
    const byKind = rows.reduce<Record<string, number>>((a, r) => {
      a[r.kind] = (a[r.kind] || 0) + 1;
      return a;
    }, {});
    return NextResponse.json({ count: rows.length, byKind, rows });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message }, { status: 500 });
  }
}
