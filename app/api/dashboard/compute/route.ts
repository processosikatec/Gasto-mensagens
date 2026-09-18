import { NextResponse } from "next/server";
import { getCredsFromRequest } from "@/lib/session";
import {
  averageMix,
  costOf,
  nextMonths,
  projectTrend,
  projectVolume,
  ruleActiveAt,
  templateByCategory,
  type Rates,
} from "@/lib/costing";
import type {
  DashboardComputeRequest,
  DashboardPayload,
  ForecastRow,
  MonthBucket,
  MonthRow,
} from "@/lib/types";

export const dynamic = "force-dynamic";

const CALC_MONTHS = 12;
const VIEW_MONTHS = 3;
const FORECAST_HORIZON = 5;

const MES = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"];
function label(month: string): string {
  const [y, m] = month.split("-");
  return `${MES[Number(m) - 1]}/${y.slice(2)}`;
}

function isValidBucket(b: any): b is MonthBucket {
  return (
    b &&
    typeof b.month === "string" &&
    typeof b.partial === "boolean" &&
    typeof b.elapsedRatio === "number" &&
    b.volume &&
    b.templateMix
  );
}

export async function POST(req: Request) {
  // guarda de autenticação — este endpoint não faz I/O à Digisac (só
  // matemática sobre dados já coletados pelo client), mas mesmo assim exige
  // sessão válida por consistência com as demais rotas /api/dashboard/*.
  const creds = getCredsFromRequest(req);
  if (!creds) {
    return NextResponse.json(
      { error: "Sessão expirada ou inválida. Faça login novamente." },
      { status: 401 },
    );
  }

  let body: DashboardComputeRequest;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Corpo da requisição inválido." }, { status: 400 });
  }

  const { generatedAt, filters, pricing, fx, ruleStartsAt, months, buckets, globalBucket, allOfficialCount } =
    body || ({} as DashboardComputeRequest);

  if (
    !generatedAt ||
    !filters ||
    !pricing ||
    !fx ||
    !ruleStartsAt ||
    !Array.isArray(months) ||
    !Array.isArray(buckets) ||
    !globalBucket ||
    typeof allOfficialCount !== "number"
  ) {
    return NextResponse.json({ error: "Corpo da requisição incompleto." }, { status: 400 });
  }
  if (buckets.length !== months.length) {
    return NextResponse.json(
      { error: "Número de buckets não confere com o número de meses." },
      { status: 400 },
    );
  }
  if (!buckets.every(isValidBucket) || !isValidBucket(globalBucket)) {
    return NextResponse.json({ error: "Bucket de mês malformado." }, { status: 400 });
  }

  try {
    const nowIso = generatedAt;
    const isOfficial = filters.isOfficial;
    const currMonth = months[months.length - 1];

    const rates: Rates = {
      serviceRateBrl: pricing.serviceRateBrl,
      marketingRateBrl: pricing.marketingRateBrl,
    };
    const ruleActiveNow = ruleActiveAt(nowIso);

    // ---- custo global do mês corrente: TODAS as conexões oficiais, ignora filtros ----
    const serviceChargedNow = ruleActiveAt(nowIso.slice(0, 10));
    const globalCost = costOf(globalBucket.volume, globalBucket.templateMix, rates, true, serviceChargedNow);
    const globalProjectedVolume = projectVolume(globalBucket.volume, globalBucket.elapsedRatio);
    const globalProjected = costOf(globalProjectedVolume, globalBucket.templateMix, rates, true, serviceChargedNow);
    const globalProjectedIfRule = costOf(globalProjectedVolume, globalBucket.templateMix, rates, true, true);

    const fullHistory: MonthRow[] = buckets.map((b) => {
      const refDay = b.partial ? nowIso.slice(0, 10) : `${b.month}-15`;
      const serviceCharged = ruleActiveAt(refDay);
      const cost = costOf(b.volume, b.templateMix, rates, isOfficial, serviceCharged);
      const costIfRule = costOf(b.volume, b.templateMix, rates, isOfficial, true).total;

      let projectedVolume = null;
      let projectedCost = null;
      let projectedCostIfRule = null;
      if (b.partial) {
        projectedVolume = projectVolume(b.volume, b.elapsedRatio);
        projectedCost = costOf(projectedVolume, b.templateMix, rates, isOfficial, serviceCharged);
        projectedCostIfRule = costOf(projectedVolume, b.templateMix, rates, isOfficial, true).total;
      }

      return {
        month: b.month,
        label: label(b.month),
        partial: b.partial,
        elapsedRatio: b.elapsedRatio,
        range: b.range,
        unavailable: b.unavailable,
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
    const history = fullHistory.slice(-VIEW_MONTHS);

    // ---- simulação: e se a regra de serviço JÁ estivesse ativa no mês atual? ----
    const currBucket = buckets[buckets.length - 1];
    const simRealizedCost = costOf(currBucket.volume, currBucket.templateMix, rates, isOfficial, true);
    const simProjectedVolume = projectVolume(currBucket.volume, currBucket.elapsedRatio);
    const simProjectedCost = costOf(simProjectedVolume, currBucket.templateMix, rates, isOfficial, true);

    // ---- simulação: e se essas conexões Standard fossem oficiais (WABA)? ----
    const standardAsOfficialNow = costOf(currBucket.volume, currBucket.templateMix, rates, true, true);
    const standardAsOfficialProjected = costOf(simProjectedVolume, currBucket.templateMix, rates, true, true);

    // ---- projeção: tendência linear (mínimos quadrados) sobre os últimos meses completos ----
    const completeBuckets = buckets.filter((b) => !b.partial && !b.unavailable);
    const forecastBase = completeBuckets.slice(-CALC_MONTHS);
    const forecastVolumes = projectTrend(forecastBase.map((b) => b.volume), FORECAST_HORIZON);
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

    const charged = forecast.filter((f) => f.serviceCharged);
    const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
    const costAfterRuleBrl = charged.length
      ? avg(charged.map((f) => f.cost.total))
      : (forecast[0]?.cost.total ?? 0);
    const costAsOfficialAvgBrl = avg(forecast.map((f) => f.costAsOfficial));

    const indicators = {
      unavailable: current.unavailable,
      monthSentTotal: current.volume.sent,
      monthSent: current.volume.service + current.volume.campaignFreeform,
      monthReceived: current.volume.received,
      monthCostNow: current.cost.total,
      monthProjectedSent: current.projectedVolume?.sent ?? current.volume.sent,
      monthProjectedReceived: current.projectedVolume?.received ?? current.volume.received,
      monthProjectedCost: current.projectedCost?.total ?? current.cost.total,
      monthCostIfRuleActive: simRealizedCost.total,
      monthProjectedCostIfRuleActive: current.partial ? simProjectedCost.total : simRealizedCost.total,
      monthCostIfOfficial: standardAsOfficialNow.total,
      monthProjectedCostIfOfficial: current.partial
        ? standardAsOfficialProjected.total
        : standardAsOfficialNow.total,
      costAfterRuleIfOfficialBrl: costAsOfficialAvgBrl,
    };

    const payload: DashboardPayload = {
      generatedAt: nowIso,
      filters,
      pricing,
      fx,
      ruleStartsAt,
      ruleActiveNow,
      monthGlobal: {
        month: currMonth,
        label: label(currMonth),
        officialConnections: allOfficialCount,
        costNow: globalCost.total,
        costProjected: globalProjected.total,
        costProjectedIfRuleActive: globalProjectedIfRule.total,
        elapsedRatio: globalBucket.elapsedRatio,
        unavailable: globalBucket.unavailable,
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
      { error: err?.message || "erro desconhecido" },
      { status: 500 },
    );
  }
}
