import { NextResponse } from "next/server";
import { topCampaigns, topTemplates, type Range } from "@/lib/digisac";
import { getCredsFromRequest } from "@/lib/session";
import { templateCost, type Rates } from "@/lib/costing";
import type { TemplateMix } from "@/lib/types";

export const dynamic = "force-dynamic";

const LIMIT = 10;

export async function GET(req: Request) {
  const creds = getCredsFromRequest(req);
  if (!creds) {
    return NextResponse.json(
      { error: "Sessão expirada ou inválida. Faça login novamente." },
      { status: 401 },
    );
  }

  const url = new URL(req.url);
  const start = url.searchParams.get("start");
  const end = url.searchParams.get("end");
  const serviceIdsParam = url.searchParams.get("serviceIds");
  const serviceRateBrl = Number(url.searchParams.get("serviceRateBrl"));
  const marketingRateBrl = Number(url.searchParams.get("marketingRateBrl"));

  if (!start || !end) {
    return NextResponse.json({ error: "Parâmetros 'start' e 'end' obrigatórios." }, { status: 400 });
  }
  if (!(serviceRateBrl > 0) || !(marketingRateBrl > 0)) {
    return NextResponse.json({ error: "Tarifas inválidas." }, { status: 400 });
  }
  const serviceIds = serviceIdsParam === null ? undefined : serviceIdsParam.split(",").filter(Boolean);
  const range: Range = { start, end };
  const rates: Rates = { serviceRateBrl, marketingRateBrl };

  try {
    const [templates, campaigns] = await Promise.all([
      topTemplates(creds, range, serviceIds, LIMIT),
      topCampaigns(creds, range, serviceIds, LIMIT),
    ]);

    const templatesWithCost = templates.map((t) => {
      const mix: TemplateMix = {
        marketing: t.category === "MARKETING" ? 1 : 0,
        utility: t.category === "UTILITY" ? 1 : 0,
        authentication: t.category === "AUTHENTICATION" ? 1 : 0,
        sample: 1,
      };
      return { ...t, cost: templateCost(t.count, mix, rates) };
    });

    // custo de campanha é estimado: a API não vincula mensagem individual a
    // campanha, então não dá pra saber a categoria exata do template usado —
    // aplica a tarifa média entre marketing e serviço/utility como aproximação.
    const avgRateBrl = (rates.marketingRateBrl + rates.serviceRateBrl) / 2;
    const campaignsWithCost = campaigns
      .map((c) => ({ ...c, estimatedCost: c.sentCount * avgRateBrl }))
      .sort((a, b) => b.estimatedCost - a.estimatedCost);

    return NextResponse.json({ templates: templatesWithCost, campaigns: campaignsWithCost });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "erro desconhecido" },
      { status: 500 },
    );
  }
}
