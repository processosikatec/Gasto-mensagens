import { NextResponse } from "next/server";
import { fetchServices, monthsBack } from "@/lib/digisac";
import { getMetaPricing, getUsdBrl } from "@/lib/meta-pricing";
import { getCredsFromRequest } from "@/lib/session";
import { RULE_STARTS_AT, ruleActiveAt } from "@/lib/costing";
import type { DashboardMetaPayload } from "@/lib/types";

export const dynamic = "force-dynamic";

const CALC_MONTHS = 12; // histórico usado para calcular a tendência da projeção

type FilterType = "todas" | "oficial" | "standard";

export async function GET(req: Request) {
  const creds = getCredsFromRequest(req);
  if (!creds) {
    return NextResponse.json(
      { error: "Sessão expirada ou inválida. Faça login novamente." },
      { status: 401 },
    );
  }

  const url = new URL(req.url);
  const type: FilterType =
    url.searchParams.get("type") === "standard"
      ? "standard"
      : url.searchParams.get("type") === "todas"
        ? "todas"
        : "oficial";
  const connectionParam = url.searchParams.get("connection");
  const connectionId = !connectionParam || connectionParam === "all" ? null : connectionParam;

  const now = new Date();
  const nowIso = now.toISOString();

  try {
    const [services, pricing, fx] = await Promise.all([
      fetchServices(creds).catch(() => []),
      getMetaPricing(),
      getUsdBrl(),
    ]);

    // conexões de WhatsApp (oficial ou standard), não arquivadas
    const waServices = services.filter(
      (s) => (s.kind === "oficial" || s.kind === "standard") && !s.archived,
    );
    const pool =
      type === "oficial"
        ? waServices.filter((s) => s.kind === "oficial")
        : type === "standard"
          ? waServices.filter((s) => s.kind === "standard")
          : waServices;

    const availableConnections = pool.map((s) => ({
      id: s.id,
      name: s.name,
      kind: s.kind,
      connected: s.connected,
    }));

    const selected =
      connectionId && pool.some((s) => s.id === connectionId)
        ? pool.filter((s) => s.id === connectionId)
        : pool;
    const serviceIds = selected.map((s) => s.id);

    // a seleção gera custo se contém ao menos uma conexão oficial
    const isOfficial = selected.some((s) => s.kind === "oficial");

    const ruleActiveNow = ruleActiveAt(nowIso);
    const currMonth = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;

    const allOfficialIds = waServices
      .filter((s) => s.kind === "oficial")
      .map((s) => s.id);

    const months = monthsBack(CALC_MONTHS, nowIso);

    const payload: DashboardMetaPayload = {
      generatedAt: nowIso,
      filters: {
        type,
        connectionId,
        availableConnections,
        consideredCount: serviceIds.length,
        serviceIds,
        isOfficial,
      },
      serviceIds,
      allOfficialIds,
      currMonth,
      months,
      pricing: {
        serviceRateBrl: pricing.serviceRateUsd * fx.rate,
        marketingRateBrl: pricing.marketingRateUsd * fx.rate,
        serviceRateUsd: pricing.serviceRateUsd,
        marketingRateUsd: pricing.marketingRateUsd,
        source: pricing.source,
        asOf: pricing.asOf,
        sourceUrl: pricing.sourceUrl,
        note: pricing.note,
      },
      fx,
      ruleStartsAt: RULE_STARTS_AT,
      ruleActiveNow,
    };

    return NextResponse.json(payload);
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "erro desconhecido" },
      { status: 500 },
    );
  }
}
