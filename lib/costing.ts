// Precificação — aplica a rate card da Meta sobre a volumetria.
//
// Regras (ver alteracao_projeto_volumetria.md + decisões):
//  - Standard (whatsapp-web): custo R$ 0 sempre (Meta só cobra WABA).
//  - Recebidas: R$ 0 sempre (só volumetria).
//  - Mensagem de serviço (livre + campanha free-form): grátis até 30/09/2026,
//    passa a custar `serviceRateBrl` a partir de 01/10/2026 (data-aware).
//  - Template (avulso + campanha): já cobrado hoje.
//      · categoria MARKETING  -> marketingRateBrl
//      · categoria UTILITY/AUTH -> serviceRateBrl (mesma tarifa)

import type { TemplateMix, Volume } from "./digisac";

export const RULE_STARTS_AT = "2026-10-01";

export type Rates = {
  serviceRateBrl: number; // utility/auth = tarifa que serviço assume em out/2026
  marketingRateBrl: number;
};

export type CostBreakdown = {
  service: number; // msg de serviço + campanha free-form
  template: number; // templates avulsos + de campanha, por categoria
  total: number;
};

/** A regra de cobrança de serviço está ativa nesta data de referência (ISO ou YYYY-MM-DD)? */
export function ruleActiveAt(refIso: string): boolean {
  return refIso.slice(0, 10) >= RULE_STARTS_AT;
}

/** Custo de um bloco de templates dado o mix de categoria. */
function templateCost(count: number, mix: TemplateMix, rates: Rates): number {
  const mkt = count * mix.marketing * rates.marketingRateBrl;
  const util = count * (mix.utility + mix.authentication) * rates.serviceRateBrl;
  return mkt + util;
}

/**
 * @param volume volumetria do período
 * @param mix    proporção de categoria dos templates do período
 * @param rates  tarifas em BRL
 * @param isOfficial conexão(ões) via API oficial da Meta? Standard => tudo R$ 0
 * @param serviceCharged a regra de cobrança de serviço vale para o período?
 */
export function costOf(
  volume: Volume,
  mix: TemplateMix,
  rates: Rates,
  isOfficial: boolean,
  serviceCharged: boolean,
): CostBreakdown {
  if (!isOfficial) return { service: 0, template: 0, total: 0 };

  const service = serviceCharged
    ? (volume.service + volume.campaignFreeform) * rates.serviceRateBrl
    : 0;
  const template =
    templateCost(volume.template, mix, rates) +
    templateCost(volume.campaignTemplate, mix, rates);

  return { service, template, total: service + template };
}

/** Projeção linear pró-rata do fechamento do mês: cada contagem / elapsedRatio. */
export function projectVolume(volume: Volume, elapsedRatio: number): Volume {
  const r = elapsedRatio > 0 ? elapsedRatio : 1;
  const up = (n: number) => Math.round(n / r);
  return {
    sent: up(volume.sent),
    received: up(volume.received),
    service: up(volume.service),
    campaignFreeform: up(volume.campaignFreeform),
    template: up(volume.template),
    campaignTemplate: up(volume.campaignTemplate),
  };
}

const EMPTY_VOLUME: Volume = {
  sent: 0,
  received: 0,
  service: 0,
  campaignFreeform: 0,
  template: 0,
  campaignTemplate: 0,
};

/** Média campo-a-campo de N volumes (para projetar meses futuros). */
export function averageVolume(volumes: Volume[]): Volume {
  if (volumes.length === 0) return { ...EMPTY_VOLUME };
  const acc = volumes.reduce(
    (a, v) => ({
      sent: a.sent + v.sent,
      received: a.received + v.received,
      service: a.service + v.service,
      campaignFreeform: a.campaignFreeform + v.campaignFreeform,
      template: a.template + v.template,
      campaignTemplate: a.campaignTemplate + v.campaignTemplate,
    }),
    { ...EMPTY_VOLUME },
  );
  const n = volumes.length;
  return {
    sent: Math.round(acc.sent / n),
    received: Math.round(acc.received / n),
    service: Math.round(acc.service / n),
    campaignFreeform: Math.round(acc.campaignFreeform / n),
    template: Math.round(acc.template / n),
    campaignTemplate: Math.round(acc.campaignTemplate / n),
  };
}

/** Média campo-a-campo de N TemplateMix. */
export function averageMix(mixes: TemplateMix[]): TemplateMix {
  const usable = mixes.filter((m) => m.sample > 0);
  if (usable.length === 0) {
    return { marketing: 0, utility: 0, authentication: 0, sample: 0 };
  }
  const n = usable.length;
  return {
    marketing: usable.reduce((a, m) => a + m.marketing, 0) / n,
    utility: usable.reduce((a, m) => a + m.utility, 0) / n,
    authentication: usable.reduce((a, m) => a + m.authentication, 0) / n,
    sample: Math.round(usable.reduce((a, m) => a + m.sample, 0) / n),
  };
}

/** Lista de "YYYY-MM" dos próximos `n` meses após `fromMonth` (exclusivo). */
export function nextMonths(fromMonth: string, n: number): string[] {
  const [y, m] = fromMonth.split("-").map(Number);
  const out: string[] = [];
  for (let i = 1; i <= n; i++) {
    const d = new Date(Date.UTC(y, m - 1 + i, 1));
    out.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  return out;
}
