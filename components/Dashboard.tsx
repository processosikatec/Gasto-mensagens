"use client";

import { useCallback, useEffect, useState } from "react";
import type { DashboardComputeRequest, DashboardMetaPayload, DashboardPayload, MonthBucket } from "@/lib/types";
import { apiFetch } from "@/lib/apiClient";
import { mapWithConcurrency } from "@/lib/concurrency";
import InfoCard from "./InfoCard";
import VolumeChart from "./VolumeChart";
import TemplateChart from "./TemplateChart";
import HistoryTable from "./HistoryTable";
import RankingsPanel from "./RankingsPanel";

const MONTH_CONCURRENCY = 5;

function unavailableBucket(month: string): MonthBucket {
  return {
    month,
    range: { start: "", end: "" },
    partial: false,
    elapsedRatio: 1,
    volume: { sent: 0, received: 0, service: 0, campaignFreeform: 0, template: 0, campaignTemplate: 0 },
    templateMix: { marketing: 0, utility: 0, authentication: 0, sample: 0 },
    unavailable: true,
  };
}

async function fetchMonthBucket(month: string, nowIso: string, serviceIds: string[]): Promise<MonthBucket> {
  try {
    const params = new URLSearchParams({ month, nowIso, serviceIds: serviceIds.join(",") });
    const res = await apiFetch(`/api/dashboard/month?${params}`, { cache: "no-store" });
    const text = await res.text();
    const json = JSON.parse(text);
    if (!res.ok) throw new Error(json?.error || `HTTP ${res.status}`);
    return json as MonthBucket;
  } catch {
    // erro de rede, 502 de gateway, corpo vazio/inválido — este mês não carregou;
    // não deve derrubar os demais meses nem o dashboard inteiro.
    return unavailableBucket(month);
  }
}

function sameIds(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const s = new Set(a);
  return b.every((x) => s.has(x));
}

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const BRL4 = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
  minimumFractionDigits: 4,
  maximumFractionDigits: 4,
});
const NUM = new Intl.NumberFormat("pt-BR");
const USD = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const brl = (x: number) => BRL.format(x || 0);
const brl4 = (x: number) => BRL4.format(x || 0);
const num = (x: number) => NUM.format(Math.round(x || 0));
const usd = (x: number) => USD.format(x || 0);
/** "R$ X (US$ Y)" — Y calculado a partir da cotação do dia (data.fx.rate) */
const brlUsd = (brlValue: number, fxRate: number) =>
  fxRate > 0 ? `${brl(brlValue)} (${usd(brlValue / fxRate)})` : brl(brlValue);

type FilterType = "todas" | "oficial" | "standard";

export default function Dashboard() {
  const [type, setType] = useState<FilterType>("oficial");
  const [connection, setConnection] = useState("all");
  const [data, setData] = useState<DashboardPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(
    async (over?: { type?: FilterType; connection?: string }) => {
      const t = over?.type ?? type;
      const c = over?.connection ?? connection;
      setLoading(true);
      setProgress(null);
      setErr(null);
      try {
        // 1) metadados leves: conexões, preço, câmbio, lista de meses a buscar
        const metaRes = await apiFetch(`/api/dashboard/meta?type=${t}&connection=${c}`, {
          cache: "no-store",
        });
        const metaText = await metaRes.text();
        let meta: DashboardMetaPayload;
        try {
          meta = JSON.parse(metaText);
        } catch {
          throw new Error("Falha ao carregar. Tente atualizar a página.");
        }
        if (!metaRes.ok) throw new Error((meta as any).error || `HTTP ${metaRes.status}`);

        // 2) um mês por vez, com concorrência limitada — mês corrente isolado por
        // último, já que é a chamada estruturalmente mais lenta em contas com
        // muito volume (ver lib/digisac.ts). Cada chamada cabe no timeout do
        // gateway do Netlify; se uma falhar, vira bucket "unavailable" sem
        // travar as demais.
        const closedMonths = meta.months.filter((m) => m !== meta.currMonth);
        const currentMonths = meta.months.filter((m) => m === meta.currMonth);

        let done = 0;
        const total = meta.months.length + (sameIds(meta.serviceIds, meta.allOfficialIds) ? 0 : 1);
        setProgress({ done: 0, total });
        const tick = () => setProgress({ done: ++done, total });

        const closedBuckets = await mapWithConcurrency(closedMonths, MONTH_CONCURRENCY, async (m) => {
          const b = await fetchMonthBucket(m, meta.generatedAt, meta.serviceIds);
          tick();
          return b;
        });

        const currentFiltered: MonthBucket[] = [];
        for (const m of currentMonths) {
          currentFiltered.push(await fetchMonthBucket(m, meta.generatedAt, meta.serviceIds));
          tick();
        }

        const byMonth = new Map<string, MonthBucket>();
        closedMonths.forEach((m, i) => byMonth.set(m, closedBuckets[i]));
        currentMonths.forEach((m, i) => byMonth.set(m, currentFiltered[i]));
        const buckets = meta.months.map((m) => byMonth.get(m)!);

        // mês corrente "global" (todas as conexões oficiais, ignora filtro) — só
        // busca de novo se o filtro selecionado for diferente do conjunto oficial completo
        let globalBucket: MonthBucket;
        if (sameIds(meta.serviceIds, meta.allOfficialIds)) {
          globalBucket = buckets[buckets.length - 1];
        } else {
          globalBucket = await fetchMonthBucket(meta.currMonth, meta.generatedAt, meta.allOfficialIds);
          tick();
        }

        // 3) cálculo final — só matemática sobre os buckets já coletados, sem I/O à Digisac
        const computeBody: DashboardComputeRequest = {
          generatedAt: meta.generatedAt,
          filters: meta.filters,
          pricing: meta.pricing,
          fx: meta.fx,
          ruleStartsAt: meta.ruleStartsAt,
          ruleActiveNow: meta.ruleActiveNow,
          months: meta.months,
          buckets,
          globalBucket,
          allOfficialCount: meta.allOfficialIds.length,
        };
        const computeRes = await apiFetch("/api/dashboard/compute", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(computeBody),
          cache: "no-store",
        });
        const computeText = await computeRes.text();
        let json: any;
        try {
          json = JSON.parse(computeText);
        } catch {
          throw new Error("Falha ao calcular o painel. Tente atualizar a página.");
        }
        if (!computeRes.ok) throw new Error(json.error || `HTTP ${computeRes.status}`);
        setData(json);
      } catch (e: any) {
        setErr(e?.message || "Falha ao carregar.");
        setData(null);
      } finally {
        setLoading(false);
        setProgress(null);
      }
    },
    [type, connection],
  );

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const el = document.getElementById("masthead-meta");
    if (!el || !data) return;
    el.innerHTML = `
      <div><b>Consulta</b> ${new Date(data.generatedAt).toLocaleDateString("pt-BR")}</div>
      <div><b>Conexões</b> ${data.filters.consideredCount}</div>
    `;
  }, [data]);

  function onType(t: FilterType) {
    setType(t);
    setConnection("all");
    load({ type: t, connection: "all" });
  }
  function onConnection(c: string) {
    setConnection(c);
    load({ connection: c });
  }

  async function openDebugServices() {
    try {
      const res = await apiFetch("/api/debug/services");
      const json = await res.json();
      const blob = new Blob([JSON.stringify(json, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank", "noopener,noreferrer");
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch {
      // silencioso — é só uma ferramenta de diagnóstico
    }
  }

  const cur = data?.currentMonth;
  const ind = data?.indicators;

  return (
    <>
      {loading && !data && (
        <div className="state">
          <span className="pulse" />
          {progress ? `Consultando meses… ${progress.done}/${progress.total}` : "Consultando…"}
        </div>
      )}

      {err && (
        <div className="state err">
          <b>Erro:</b> {err}
        </div>
      )}

      {data && cur && ind && (
        <>
          {/* Bullet fixo: gasto do mês — soma de todas as conexões oficiais, não muda com filtros */}
          <div className="month-bill">
            <span className="dot" />
            <span className="mb-label">
              Gasto realizado em {cap(cur.label)} · {data.monthGlobal.officialConnections} conexões oficiais
            </span>
            {data.monthGlobal.unavailable ? (
              <span className="mb-val" style={{ color: "var(--danger, #b3261e)" }}>
                Indisponível — tente atualizar a página
              </span>
            ) : (
              <>
                <span className="mb-val">{brlUsd(data.monthGlobal.costNow, data.fx.rate)}</span>
                {!data.ruleActiveNow && (
                  <span className="mb-proj">
                    Com a regra ativa:{" "}
                    <b>{brlUsd(data.monthGlobal.costProjectedIfRuleActive, data.fx.rate)}</b>
                  </span>
                )}
                {data.monthGlobal.elapsedRatio < 0.98 && (
                  <span className="mb-proj">
                    Fechamento estimado: {brlUsd(data.monthGlobal.costProjected, data.fx.rate)}
                  </span>
                )}
              </>
            )}
          </div>

          {/* Filtros */}
          <div className="controls">
            <div className="field">
              <label>Tipo de WhatsApp</label>
              <select value={type} onChange={(e) => onType(e.target.value as FilterType)}>
                <option value="oficial">Oficial (WABA)</option>
                <option value="standard">Standard</option>
                <option value="todas">Todas</option>
              </select>
            </div>
            <div className="field">
              <label>Conexão</label>
              <select value={connection} onChange={(e) => onConnection(e.target.value)}>
                <option value="all">Todas as conexões</option>
                {data.filters.availableConnections.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                    {c.connected ? "" : " (desconectada)"}
                  </option>
                ))}
              </select>
            </div>
            <button className="act" onClick={() => load()} disabled={loading}>
              {loading ? "…" : "Atualizar"}
            </button>
          </div>

          {data.filters.type === "standard" && (
            <div className="scopebar">
              Seleção <b>Standard</b>: a Meta não cobra conexões não-oficiais — custo real é{" "}
              <b>R$ 0</b>. Se virassem <b>oficiais (WABA)</b> hoje, o mês custaria{" "}
              <b>{brl(ind.monthProjectedCostIfOfficial)}</b> (fechamento estimado) e a média
              projetada seria <b>{brl(data.costAfterRuleIfOfficialBrl)}</b>/mês.
            </div>
          )}

          {/* Custo do mês corrente — segregado: Templates x Mensagens de serviço, cada um Realizado x Projetado */}
          <div className="kpis">
            <InfoCard
              accent="danger"
              label="Templates — realizado"
              value={ind.unavailable ? "—" : brlUsd(ind.monthTemplateCostNow, data.fx.rate)}
              sub={
                ind.unavailable
                  ? "Dados indisponíveis — tente atualizar a página"
                  : `${num(ind.monthSentTotal - ind.monthSent)} templates enviados · já cobrado hoje`
              }
              info="Custo já gasto até agora no mês com templates (HSM), avulsos ou por campanha — não inclui mensagem de serviço. Templates são cobrados desde sempre, sem franquia, por categoria (marketing/utility/authentication)."
            />
            <InfoCard
              accent="danger"
              label="Templates — projetado"
              value={ind.unavailable ? "—" : brlUsd(ind.monthProjectedTemplateCost, data.fx.rate)}
              sub={
                ind.unavailable
                  ? "Dados indisponíveis — tente atualizar a página"
                  : `Fechamento estimado · ${Math.round(cur.elapsedRatio * 100)}% do mês decorrido`
              }
              info="Fechamento estimado (pró-rata) do custo de templates do mês corrente, sem mensagem de serviço."
            />
            <InfoCard
              accent="danger"
              label="Mensagens de serviço — realizado"
              value={ind.unavailable ? "—" : brlUsd(ind.monthServiceCostIfRuleActive, data.fx.rate)}
              sub={
                ind.unavailable
                  ? "Dados indisponíveis — tente atualizar a página"
                  : `${num(ind.monthSent)} msgs de serviço · ${
                      data.ruleActiveNow ? "regra já em vigor" : "simulação — regra entra em " + fmtDate(data.ruleStartsAt)
                    }`
              }
              info={`Custo já gasto até agora com mensagens de serviço (atendimento livre, sem template), simulando a regra de 01/10/2026 ativa. Franquia de ${num(data.freeServiceMessagesPerNumber)} msgs grátis por número WABA já descontada, a partir de ${brl4(data.pricing.serviceRateBrl)}/mensagem, com volume tiers aplicados.`}
            />
            <InfoCard
              accent="danger"
              label="Mensagens de serviço — projetado"
              value={ind.unavailable ? "—" : brlUsd(ind.monthProjectedServiceCostIfRuleActive, data.fx.rate)}
              sub={
                ind.unavailable
                  ? "Dados indisponíveis — tente atualizar a página"
                  : `Fechamento estimado · ${
                      data.ruleActiveNow ? "regra já em vigor" : "simulação — regra entra em " + fmtDate(data.ruleStartsAt)
                    }`
              }
              info={`Fechamento estimado (pró-rata) do custo de mensagens de serviço do mês corrente, simulando a regra de 01/10/2026 ativa. Mesma franquia e volume tiers do card "realizado", aplicados sobre o volume projetado.`}
            />
          </div>

          {/* Volume enviado — abaixo do custo */}
          <div className="kpis">
            <InfoCard
              label={`Enviadas em ${cap(cur.label)}`}
              value={ind.unavailable ? "—" : num(ind.monthProjectedSent)}
              sub={
                ind.unavailable
                  ? "Dados indisponíveis — tente atualizar a página"
                  : `Realizado ${num(ind.monthSentTotal)} (${num(ind.monthSent)} serviço + ${num(
                      ind.monthSentTotal - ind.monthSent,
                    )} template) · ${Math.round(cur.elapsedRatio * 100)}% do mês`
              }
              info="Total de mensagens enviadas (serviço + templates + campanhas) no mês corrente: realizado até agora e projeção de fechamento pró-rata. Só o volume de serviço (sem template) entra na franquia/tarifa das mensagens de serviço."
            />
          </div>

          {/* Gráfico principal — o centro da leitura */}
          <section className="block">
            <h2>Volume e custo — histórico e projeção</h2>
            <p className="hint">
              Barras: mensagens enviadas por mês — azul escuro é realizado, azul claro é projeção
              (tendência dos últimos {data.forecastMonthsUsed} meses, um valor por mês). Linha{" "}
              <b style={{ color: "#db2727" }}>vermelha</b> = custo real de hoje; linha{" "}
              <b style={{ color: "#7c3aed" }}>roxa</b> = custo projetado para os meses futuros;
              linha <b style={{ color: "#c48b0a" }}>âmbar</b> = simulação de custo se a mensagem
              de serviço já fosse cobrada. Eixo de custo à direita.
            </p>
            <div className="panel">
              <VolumeChart data={data} />
            </div>
          </section>

          {/* Tabela */}
          <section className="block">
            <h2>Tabela mensal</h2>
            <p className="hint">
              Últimos 3 meses realizados (o mês corrente mostra também o fechamento estimado) e{" "}
              {data.forecast.length} meses de projeção, calculados sobre {data.forecastMonthsUsed}{" "}
              meses de histórico.
            </p>
            <div className="panel scroll-x">
              <HistoryTable data={data} />
            </div>
          </section>

          <RankingsPanel data={data} />

          {/* Detalhes */}
          <details className="details">
            <summary>Templates por categoria, metodologia e fontes</summary>
            <div className="details-body">
              <h3>Templates (HSM): volume por categoria e custo</h3>
              <p className="hint">
                Barras empilhadas por categoria (roxo = marketing, verde = utility, âmbar =
                authentication) — proporção estimada por amostragem. Linha escura = custo total de
                template no mês.
              </p>
              <div className="panel">
                <TemplateChart data={data} />
              </div>

              <h3>Como os números são obtidos</h3>
              <ul className="method">
                <li>
                  <b>Volumetria:</b> contagem direta na API da Digisac (
                  <code>/api/v1/messages</code>) mês a mês, nas{" "}
                  <b>{data.filters.consideredCount}</b> conexão(ões) selecionada(s) (
                  {typeLabel(data.filters.type)}).
                </li>
                <li>
                  <b>Classificação:</b> serviço é a mensagem livre de atendente ou bot fora de
                  campanha; template é <code>type: hsm</code>; campanha é{" "}
                  <code>origin: campaign</code> (livre ou template). Recebidas contam volume, nunca
                  custo.
                </li>
                <li>
                  <b>Projeção do mês:</b> linear pró-rata — volume acumulado dividido pelos dias
                  decorridos, multiplicado pelos dias do mês.
                </li>
                <li>
                  <b>Regra Meta 01/10/2026:</b> a mensagem de serviço passa a ser cobrada.{" "}
                  {data.ruleActiveNow
                    ? "Já em vigor."
                    : `Ainda gratuita até essa data.`}{" "}
                  Templates já são cobrados hoje.
                </li>
                <li>
                  <b>Franquia de {num(data.freeServiceMessagesPerNumber)} mensagens/número:</b>{" "}
                  o cálculo desconta {num(data.freeServiceMessagesPerNumber)} mensagens de serviço
                  grátis por mês para cada número WABA selecionado, antes de aplicar a tarifa —
                  a partir da mensagem seguinte a essa franquia, por número, que não é cumulativa
                  entre números. Confirmado no simulador oficial da Digisac.
                </li>
                <li>
                  <b>Tarifa:</b>{" "}
                  {data.pricing.source === "env-override"
                    ? "definida manualmente (.env.local)"
                    : "rate card oficial da Meta, valores em BRL fixos"}
                  , referência de {data.pricing.asOf}. Marketing a{" "}
                  {brl4(data.pricing.marketingRateBrl)} por mensagem (tarifa fixa, sem desconto por
                  volume). Serviço, utility e authentication começam em{" "}
                  {brl4(data.pricing.serviceRateBrl)} por mensagem e caem progressivamente conforme o
                  volume mensal sobe (volume tiers oficiais do Brasil — como faixas de imposto de
                  renda: cada faixa de volume paga sua própria tarifa).
                </li>
                <li>
                  Conexões Standard (WhatsApp Web) não geram custo. Confirme sempre os valores contra
                  a fatura da Digisac/Meta.
                </li>
                <li>
                  <b>Não considerado:</b> a Meta também isenta por 72h conversas de serviço
                  iniciadas via clique-para-WhatsApp/botão do Facebook (free entry point) — o
                  cálculo aqui cobra toda mensagem de serviço igual, sem diferenciar a origem da
                  conversa.
                </li>
                <li>
                  <button type="button" className="login-signout" onClick={openDebugServices}>
                    Ver classificação das conexões
                  </button>
                </li>
              </ul>
            </div>
          </details>
        </>
      )}
    </>
  );
}

function fmtDate(iso: string) {
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}
function typeLabel(t: string) {
  return t === "oficial" ? "Oficial / WABA" : t === "standard" ? "Standard" : "Todas";
}
/** "ago/26" -> "Ago/26" */
function cap(s: string) {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}
