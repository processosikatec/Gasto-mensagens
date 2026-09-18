"use client";

import { useState } from "react";
import type { DashboardPayload } from "@/lib/types";
import { apiFetch } from "@/lib/apiClient";

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const NUM = new Intl.NumberFormat("pt-BR");
const brl = (x: number) => BRL.format(x || 0);
const num = (x: number) => NUM.format(Math.round(x || 0));

type TemplateRanking = { hsmId: string; name: string; category: string; count: number; cost: number };
type CampaignRanking = { id: string; title: string; sentCount: number; status: string; estimatedCost: number };

const CAT_LABEL: Record<string, string> = {
  MARKETING: "Marketing",
  UTILITY: "Utility",
  AUTHENTICATION: "Authentication",
  OUTRO: "Outro",
};

export default function RankingsPanel({ data }: { data: DashboardPayload }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<{ templates: TemplateRanking[]; campaigns: CampaignRanking[] } | null>(null);

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const params = new URLSearchParams({
        start: data.currentMonth.range.start,
        end: data.currentMonth.range.end,
        serviceIds: data.filters.serviceIds.join(","),
        serviceRateBrl: String(data.pricing.serviceRateBrl),
        marketingRateBrl: String(data.pricing.marketingRateBrl),
      });
      const res = await apiFetch(`/api/dashboard/rankings?${params}`, { cache: "no-store" });
      const text = await res.text();
      let json: any;
      try {
        json = JSON.parse(text);
      } catch {
        throw new Error("Falha ao carregar rankings. Tente novamente.");
      }
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      setResult(json);
    } catch (e: any) {
      setErr(e?.message || "Falha ao carregar.");
    } finally {
      setLoading(false);
    }
  }

  function onToggle() {
    const next = !open;
    setOpen(next);
    if (next && !result && !loading) load();
  }

  return (
    <details className="details" open={open} onToggle={(e) => onToggle()}>
      <summary>Ranking de templates e campanhas ({data.currentMonth.label})</summary>
      <div className="details-body">
        {loading && (
          <div className="state">
            <span className="pulse" />
            Consultando templates e campanhas…
          </div>
        )}
        {err && (
          <div className="state err">
            <b>Erro:</b> {err}{" "}
            <button type="button" className="login-signout" onClick={load}>
              Tentar de novo
            </button>
          </div>
        )}
        {result && (
          <>
            <h3>Templates mais enviados</h3>
            <p className="hint">
              Top {result.templates.length} templates por volume no mês corrente. Custo calculado com a
              categoria exata de cada template.
            </p>
            <table className="data">
              <thead>
                <tr>
                  <th>Template</th>
                  <th>Categoria</th>
                  <th>Enviadas</th>
                  <th>Custo</th>
                </tr>
              </thead>
              <tbody>
                {result.templates.length === 0 && (
                  <tr>
                    <td colSpan={4}>Nenhum template encontrado no período.</td>
                  </tr>
                )}
                {result.templates.map((t) => (
                  <tr key={t.hsmId}>
                    <td>{t.name}</td>
                    <td>{CAT_LABEL[t.category] || t.category}</td>
                    <td className="strong">{num(t.count)}</td>
                    <td>{brl(t.cost)}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <h3>Campanhas com maior custo</h3>
            <p className="hint">
              Top {result.campaigns.length} campanhas por custo estimado — a API não vincula mensagem a
              campanha, então o custo usa a tarifa média entre marketing e serviço/utility (aproximado).
            </p>
            <table className="data">
              <thead>
                <tr>
                  <th>Campanha</th>
                  <th>Status</th>
                  <th>Enviadas</th>
                  <th>Custo estimado</th>
                </tr>
              </thead>
              <tbody>
                {result.campaigns.length === 0 && (
                  <tr>
                    <td colSpan={4}>Nenhuma campanha encontrada no período.</td>
                  </tr>
                )}
                {result.campaigns.map((c) => (
                  <tr key={c.id}>
                    <td>{c.title}</td>
                    <td>{c.status}</td>
                    <td className="strong">{num(c.sentCount)}</td>
                    <td>{brl(c.estimatedCost)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>
    </details>
  );
}
