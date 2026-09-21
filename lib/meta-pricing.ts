// Tarifa Meta / WhatsApp Business para o Brasil (server-only).
//
// Contexto: a partir de 01/10/2026 a Meta passa a cobrar por mensagem de serviço
// (free-form, humano OU AI de terceiro). A tarifa é a MESMA da utility/
// authentication do país (rate card oficial confirma isso explicitamente).
//
// Fonte: rate card oficial da Meta "Cost per message in BRL on the WhatsApp
// Business Platform, effective October 1, 2026" (PDF oficial, valores já em
// BRL — não depende de câmbio do dia). Volume tiers de utility/authentication
// confirmados como PROGRESSIVOS (como faixas de IR: cada faixa de volume paga
// sua própria tarifa só sobre o volume que cai nela, não retroativo) via
// developers.facebook.com/documentation/business-messaging/whatsapp/pricing —
// "the rate of the next tier [applies] specifically for messages in that tier".
// Marketing não tem tier — tarifa fixa (list rate) sempre.
//
// Override manual continua disponível via env META_SERVICE_RATE_USD, para o
// caso de a Meta revisar os valores antes do próximo deploy.

export type PricingSource = "env-override" | "brl-fixed";

export type MetaPricing = {
  /** USD por mensagem entregue — mantido só para compatibilidade com o
   *  payload público (`pricing.serviceRateUsd`); o cálculo real usa BRL fixo,
   *  ver `serviceRateBrl`/`marketingRateBrl` */
  serviceRateUsd: number;
  marketingRateUsd: number;
  /** tarifa BRL de utility/auth/service Brasil sem tier (list rate) */
  serviceRateBrl: number;
  /** tarifa BRL de marketing Brasil (sem tier) */
  marketingRateBrl: number;
  source: PricingSource;
  sourceUrl?: string;
  /** data de referencia da tabela */
  asOf: string;
  note: string;
};

/** Faixa de volume tier: mensagens de `from` a `to` (exclusivo do topo, null = sem limite) pagam `rateBrl`. */
export type VolumeTier = { from: number; to: number | null; rateBrl: number };

// Volume tiers oficiais do Brasil para utility/authentication (idênticos entre
// as duas categorias na rate card oficial). Marketing não tem tier.
export const BR_UTILITY_AUTH_TIERS: VolumeTier[] = [
  { from: 0, to: 250_000, rateBrl: 0.035 },
  { from: 250_000, to: 2_000_000, rateBrl: 0.0333 },
  { from: 2_000_000, to: 17_000_000, rateBrl: 0.0315 },
  { from: 17_000_000, to: 35_000_000, rateBrl: 0.0298 },
  { from: 35_000_000, to: 70_000_000, rateBrl: 0.028 },
  { from: 70_000_000, to: null, rateBrl: 0.0263 },
];

/**
 * Custo progressivo (por faixa, como IR) de `count` mensagens sobre `tiers`.
 * As primeiras mensagens pagam a tarifa da 1ª faixa, o excedente vai caindo
 * nas faixas seguintes conforme o volume cresce — nunca retroativo.
 */
export function tieredCost(count: number, tiers: VolumeTier[]): number {
  let remaining = count;
  let total = 0;
  for (const tier of tiers) {
    if (remaining <= 0) break;
    const capacity = tier.to === null ? Infinity : tier.to - tier.from;
    const used = Math.min(remaining, capacity);
    total += used * tier.rateBrl;
    remaining -= used;
  }
  return total;
}

const BR_MARKETING_RATE_BRL = 0.3217;

const FALLBACK: MetaPricing = {
  serviceRateUsd: 0.0068,
  marketingRateUsd: 0.0625,
  serviceRateBrl: 0.035,
  marketingRateBrl: BR_MARKETING_RATE_BRL,
  source: "brl-fixed",
  asOf: "2026-10-01",
  note:
    "Rate card oficial da Meta, efetiva 01/10/2026 (valores em BRL, sem depender de câmbio). " +
    "Utility/authentication/service têm volume tiers progressivos aplicados sobre o volume mensal " +
    "real do cliente; marketing é tarifa fixa.",
};

export async function getMetaPricing(): Promise<MetaPricing> {
  const override = Number(process.env.META_SERVICE_RATE_USD);
  if (override > 0) {
    return {
      serviceRateUsd: override,
      marketingRateUsd: FALLBACK.marketingRateUsd,
      serviceRateBrl: FALLBACK.serviceRateBrl,
      marketingRateBrl: FALLBACK.marketingRateBrl,
      source: "env-override",
      asOf: new Date().toISOString().slice(0, 10),
      note: "Tarifa de serviço USD definida manualmente em META_SERVICE_RATE_USD (.env.local); demais valores usam o fallback BRL fixo.",
    };
  }
  return FALLBACK;
}

// ---- cambio USD -> BRL (informativo — não afeta mais o cálculo de custo, ver acima) ----
const TTL = 1000 * 60 * 60 * 6;
let fxCache: { at: number; rate: number; source: string } | null = null;

export async function getUsdBrl(): Promise<{ rate: number; source: string; asOf: string }> {
  const fixed = Number(process.env.USD_BRL_RATE);
  if (fixed > 0) return { rate: fixed, source: "env", asOf: new Date().toISOString().slice(0, 10) };

  if (fxCache && Date.now() - fxCache.at < TTL) {
    return { rate: fxCache.rate, source: fxCache.source, asOf: new Date().toISOString().slice(0, 10) };
  }

  const providers: { url: string; pick: (j: any) => number | undefined }[] = [
    { url: "https://api.frankfurter.app/latest?from=USD&to=BRL", pick: (j) => j?.rates?.BRL },
    { url: "https://open.er-api.com/v6/latest/USD", pick: (j) => j?.rates?.BRL },
    {
      url: "https://economia.awesomeapi.com.br/json/last/USD-BRL",
      pick: (j) => Number(j?.USDBRL?.bid),
    },
  ];
  for (const p of providers) {
    try {
      const res = await fetch(p.url, { next: { revalidate: 60 * 60 * 3 } });
      if (!res.ok) continue;
      const j = await res.json();
      const rate = p.pick(j);
      if (rate && rate > 0) {
        fxCache = { at: Date.now(), rate, source: new URL(p.url).host };
        return { rate, source: new URL(p.url).host, asOf: new Date().toISOString().slice(0, 10) };
      }
    } catch {
      // proximo
    }
  }
  return { rate: 5.4, source: "fallback", asOf: new Date().toISOString().slice(0, 10) };
}
