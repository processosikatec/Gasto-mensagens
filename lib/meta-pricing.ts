// Tarifa Meta / WhatsApp Business para o Brasil (server-only).
//
// Contexto: a partir de 01/10/2026 a Meta passa a cobrar por mensagem de serviço
// (free-form, humano OU AI de terceiro) e por template de utilidade dentro da janela
// de 24h. A tarifa e a MESMA da utility/authentication do pais. Numeros oficiais
// por pais so publicados ate 01/09/2026.
//
// Estrategia de obtencao (sem depender de editar o front):
//   1. override manual via env META_SERVICE_RATE_USD
//   2. scrape de agregadores publicos que republicam a rate card da Meta
//   3. fallback embutido (rate card de jul/2026, fonte consistente entre varias refs)

export type PricingSource = "env-override" | "scrape" | "fallback";

export type MetaPricing = {
  /** USD por mensagem entregue — categoria utility/authentication BR = tarifa que
   *  a msg de serviço assume em 01/10/2026 */
  serviceRateUsd: number;
  marketingRateUsd: number;
  source: PricingSource;
  sourceUrl?: string;
  /** data de referencia da tabela */
  asOf: string;
  note: string;
};

const FALLBACK: MetaPricing = {
  serviceRateUsd: 0.0068, // utility/auth Brasil — consistente entre Meta rate card e agregadores
  marketingRateUsd: 0.0625,
  source: "fallback",
  asOf: "2026-07-01",
  note: "Rate card Meta jul/2026 (embutido). A tarifa de serviço passa a valer 01/10/2026 e iguala a de utility/auth.",
};

const SCRAPE_TARGETS = [
  "https://whautomate.com/whatsapp-business-api-pricing-brazil",
  "https://www.go4whatsup.com/brazil/whatsapp-business-api-pricing/",
];

// procura, na vizinhanca da palavra "utility"/"marketing", um preco USD com 3-4
// casas decimais (ex: $0.0068). Ignora numeros com 2 casas (podem ser R$0,04 ou %).
function extractRates(html: string): { utilityUsd?: number; marketingUsd?: number } {
  const clean = html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&#36;/g, "$")
    .replace(/\s+/g, " ");

  const near = (label: RegExp, lo: number, hi: number): number | undefined => {
    const re = new RegExp(label.source, "gi");
    let m: RegExpExecArray | null;
    while ((m = re.exec(clean))) {
      const w = clean.slice(m.index, m.index + 180);
      // exige US$ / USD / $ (NAO R$) seguido de 0.xxxx com 3-4 digitos.
      // 3-4 casas descarta "R$0,04" (2 casas). "(?<!R)" evita casar o $ de R$.
      const usd = w.match(/(?:US\$|USD\s*|(?<![A-Za-z])\$)\s*(0?\.\d{3,4})(?!\d)/);
      if (usd) {
        const v = Number(usd[1]);
        if (v >= lo && v <= hi) return v;
      }
    }
    return undefined;
  };

  return {
    utilityUsd: near(/utilit(?:y|ário|ária)/, 0.001, 0.02),
    marketingUsd: near(/marketing/, 0.02, 0.15),
  };
}

async function tryScrape(): Promise<MetaPricing | null> {
  for (const url of SCRAPE_TARGETS) {
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0 (compatible; PainelGastos/1.0)" },
        next: { revalidate: 60 * 60 * 12 },
      });
      if (!res.ok) continue;
      const html = await res.text();
      const { utilityUsd, marketingUsd } = extractRates(html);
      if (utilityUsd && utilityUsd >= 0.001 && utilityUsd <= 0.02) {
        return {
          serviceRateUsd: utilityUsd,
          marketingRateUsd: marketingUsd && marketingUsd > 0 ? marketingUsd : FALLBACK.marketingRateUsd,
          source: "scrape",
          sourceUrl: url,
          asOf: new Date().toISOString().slice(0, 10),
          note: "Tarifa lida de agregador publico que republica a rate card da Meta. Confirme contra a fatura da Digisac.",
        };
      }
    } catch {
      // proximo alvo
    }
  }
  return null;
}

let cache: { at: number; data: MetaPricing } | null = null;
const TTL = 1000 * 60 * 60 * 6;

export async function getMetaPricing(): Promise<MetaPricing> {
  const override = Number(process.env.META_SERVICE_RATE_USD);
  if (override > 0) {
    return {
      serviceRateUsd: override,
      marketingRateUsd: FALLBACK.marketingRateUsd,
      source: "env-override",
      asOf: new Date().toISOString().slice(0, 10),
      note: "Tarifa definida manualmente em META_SERVICE_RATE_USD (.env.local).",
    };
  }
  if (cache && Date.now() - cache.at < TTL) return cache.data;
  const scraped = await tryScrape();
  const data = scraped ?? FALLBACK;
  cache = { at: Date.now(), data };
  return data;
}

// ---- cambio USD -> BRL ----
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
