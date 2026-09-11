import { NextResponse } from "next/server";
import { fetchHistory, fetchMonth, fetchServices, monthsBack } from "@/lib/digisac";
import { getMetaPricing, getUsdBrl } from "@/lib/meta-pricing";
import { getCredsFromRequest } from "@/lib/session";
import {
  averageMix,
  costOf,
  nextMonths,
  projectTrend,
  projectVolume,
  RULE_STARTS_AT,
  ruleActiveAt,
  templateByCategory,
  type Rates,
} from "@/lib/costing";
import type { DashboardPayload, ForecastRow, MonthRow } from "@/lib/types";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const CALC_MONTHS = 12; // histórico usado para calcular a tendência da projeção
const VIEW_MONTHS = 3; // meses reais mostrados no front
const FORECAST_HORIZON = 5; // meses projetados mostrados no front

const MES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
function label(month: string): string {
  const [y, m] = month.split("-");
  return `${MES[Number(m) - 1]}/${y.slice(2)}`;
}

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

    const rates: Rates = {
      serviceRateBrl: pricing.serviceRateUsd * fx.rate,
      marketingRateBrl: pricing.marketingRateUsd * fx.rate,
    };
    const ruleActiveNow = ruleActiveAt(nowIso);
    const currMonth = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;

    // ---- custo global do mês corrente: TODAS as conexões oficiais, ignora filtros ----
    const allOfficialIds = waServices
      .filter((s) => s.kind === "oficial")
      .map((s) => s.id);
    // busca 24 meses para o cálculo da projeção (mais veracidade + sazonalidade)
    const months = monthsBack(CALC_MONTHS, nowIso);

    const [buckets, globalBucket] = await Promise.all([
      fetchHistory(creds, months, serviceIds, nowIso),
      fetchMonth(creds, currMonth, allOfficialIds, nowIso),
    ]);

    const serviceChargedNow = ruleActiveAt(nowIso.slice(0, 10));
    const globalCost = costOf(
      globalBucket.volume,
      globalBucket.templateMix,
      rates,
      true, // são conexões oficiais
      serviceChargedNow,
    );
    const globalProjectedVolume = projectVolume(
      globalBucket.volume,
      globalBucket.elapsedRatio,
    );
    const globalProjected = costOf(
      globalProjectedVolume,
      globalBucket.templateMix,
      rates,
      true,
      serviceChargedNow,
    );
    // mesmo mês, mas simulando a regra de serviço ativa
    const globalProjectedIfRule = costOf(
      globalProjectedVolume,
      globalBucket.templateMix,
      rates,
      true,
      true,
    );

    const fullHistory: MonthRow[] = buckets.map((b) => {
      // regra de serviço: para meses passados usa o mês; para o corrente usa hoje
      const refDay = b.partial ? nowIso.slice(0, 10) : `${b.month}-15`;
      const serviceCharged = ruleActiveAt(refDay);
      const cost = costOf(b.volume, b.templateMix, rates, isOfficial, serviceCharged);
      const costIfRule = costOf(b.volume, b.templateMix, rates, isOfficial, true).total;

      let projectedVolume = null;
      let projectedCost = null;
      let projectedCostIfRule = null;
      if (b.partial) {
        projectedVolume = projectVolume(b.volume, b.elapsedRatio);
        projectedCost = costOf(
          projectedVolume,
          b.templateMix,
          rates,
          isOfficial,
          serviceCharged,
        );
        projectedCostIfRule = costOf(
          projectedVolume,
          b.templateMix,
          rates,
          isOfficial,
          true,
        ).total;
      }

      return {
        month: b.month,
        label: label(b.month),
        partial: b.partial,
        elapsedRatio: b.elapsedRatio,
        volume: b.volume,
        cost,
        costIfRule,
        templateByCategory: templateByCategory(b.volume, b.templateMix),
        projectedVolume,
        projectedCost,
        projectedCostIfRule,
      };
    });

    const current = fullHistory[fullHistory.length - 1];
    // só os últimos VIEW_MONTHS aparecem no front (inclui o mês corrente parcial)
    const history = fullHistory.slice(-VIEW_MONTHS);

    // ---- simulação: e se a regra de serviço JÁ estivesse ativa no mês atual? ----
    const currBucket = buckets[buckets.length - 1];
    const simRealizedCost = costOf(
      currBucket.volume,
      currBucket.templateMix,
      rates,
      isOfficial,
      true, // força a cobrança do serviço
    );
    const simProjectedVolume = projectVolume(
      currBucket.volume,
      currBucket.elapsedRatio,
    );
    const simProjectedCost = costOf(
      simProjectedVolume,
      currBucket.templateMix,
      rates,
      isOfficial,
      true,
    );

    // ---- simulação: e se essas conexões Standard fossem oficiais (WABA)? ----
    // ignora a data da regra — assume que virando oficial hoje, o serviço já é cobrado
    const standardAsOfficialNow = costOf(
      currBucket.volume,
      currBucket.templateMix,
      rates,
      true, // força "oficial"
      true, // força cobrança de serviço
    );
    const standardAsOfficialProjected = costOf(
      simProjectedVolume,
      currBucket.templateMix,
      rates,
      true,
      true,
    );

    // ---- projeção: tendência linear (mínimos quadrados) sobre os últimos meses
    // completos — cada mês projetado tem seu próprio valor, sem sazonalidade ----
    const completeBuckets = buckets.filter((b) => !b.partial);
    const forecastBase = completeBuckets.slice(-CALC_MONTHS);
    const forecastVolumes = projectTrend(
      forecastBase.map((b) => b.volume),
      FORECAST_HORIZON,
    );
    // mix de categoria: média dos meses usados na base (estável, categoria não tem tendência clara)
    const forecastMix = averageMix(forecastBase.map((b) => b.templateMix));
    const forecastMonths = nextMonths(current.month, FORECAST_HORIZON);

    const forecast: ForecastRow[] = forecastMonths.map((m, i) => {
      const serviceCharged = ruleActiveAt(`${m}-15`);
      const v = forecastVolumes[i];
      return {
        month: m,
        label: label(m),
        volume: v,
        cost: costOf(v, forecastMix, rates, isOfficial, serviceCharged),
        costIfRule: costOf(v, forecastMix, rates, isOfficial, true).total,
        costAsOfficial: costOf(v, forecastMix, rates, true, true).total,
        templateByCategory: templateByCategory(v, forecastMix),
        serviceCharged,
      };
    });

    const forecastMethod = `Tendência linear sobre os últimos ${forecastBase.length} meses completos — cada mês projetado segue o ritmo de crescimento ou queda observado, sem sazonalidade.`;

    // custo mensal médio dos meses já cobrados pela regra (cada mês tem valor próprio)
    const charged = forecast.filter((f) => f.serviceCharged);
    const avg = (xs: number[]) =>
      xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
    const costAfterRuleBrl = charged.length
      ? avg(charged.map((f) => f.cost.total))
      : forecast[0]?.cost.total ?? 0;
    // média mensal projetada como se fosse oficial (relevante só para o filtro Standard)
    const costAsOfficialAvgBrl = avg(forecast.map((f) => f.costAsOfficial));

    const indicators = {
      monthSentTotal: current.volume.sent,
      monthSent: current.volume.service + current.volume.campaignFreeform,
      monthReceived: current.volume.received,
      monthCostNow: current.cost.total,
      monthProjectedSent: current.projectedVolume?.sent ?? current.volume.sent,
      monthProjectedReceived:
        current.projectedVolume?.received ?? current.volume.received,
      monthProjectedCost: current.projectedCost?.total ?? current.cost.total,
      // simulação: mês atual como se a regra de serviço já valesse
      monthCostIfRuleActive: simRealizedCost.total,
      monthProjectedCostIfRuleActive: current.partial
        ? simProjectedCost.total
        : simRealizedCost.total,
      // simulação: conexão(ões) Standard como se fossem oficiais (WABA)
      monthCostIfOfficial: standardAsOfficialNow.total,
      monthProjectedCostIfOfficial: current.partial
        ? standardAsOfficialProjected.total
        : standardAsOfficialNow.total,
      costAfterRuleIfOfficialBrl: costAsOfficialAvgBrl,
    };

    const payload: DashboardPayload = {
      generatedAt: nowIso,
      filters: {
        type,
        connectionId,
        availableConnections,
        consideredCount: serviceIds.length,
        isOfficial,
      },
      pricing: {
        serviceRateBrl: rates.serviceRateBrl,
        marketingRateBrl: rates.marketingRateBrl,
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
      // fixo: independe dos filtros
      monthGlobal: {
        month: currMonth,
        label: label(currMonth),
        officialConnections: allOfficialIds.length,
        costNow: globalCost.total,
        costProjected: globalProjected.total,
        costProjectedIfRuleActive: globalProjectedIfRule.total,
        elapsedRatio: globalBucket.elapsedRatio,
      },
      currentMonth: current,
      history,
      forecast,
      forecastMethod,
      forecastMonthsUsed: forecastBase.length,
      costAfterRuleBrl,
      costAfterRuleIfOfficialBrl: costAsOfficialAvgBrl,
      indicators,
    };

    return NextResponse.json(payload);
  } catch (err: any) {
    return NextResponse.json(
      {
        error: err?.message || "erro desconhecido",
        stack: process.env.NODE_ENV === "development" ? err?.stack : undefined,
      },
      { status: 500 },
    );
  }
}
