"use client";

import type { DashboardPayload } from "@/lib/types";

const NUM = new Intl.NumberFormat("pt-BR");
const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const n = (x: number) => NUM.format(Math.round(x || 0));
const r = (x: number) => BRL.format(x || 0);
const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

/**
 * Tabela mensal: Mês | Enviadas | Recebidas | Volume Atual | Projeção | Custo.
 * Meses passados: valores realizados. Mês corrente: realizado → fechamento
 * estimado. Meses futuros: volume e custo projetados (linha marcada).
 */
export default function HistoryTable({ data }: { data: DashboardPayload }) {
  const rows = data.history;
  const done = rows.filter((h) => !h.partial);
  const sum = (f: (h: (typeof rows)[number]) => number) => done.reduce((a, h) => a + f(h), 0);

  return (
    <table className="data">
      <thead>
        <tr>
          <th>Mês</th>
          <th>Enviadas</th>
          <th>Recebidas</th>
          <th>Volume atual</th>
          <th>Projeção</th>
          <th>Custo</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((h) => (
          <tr key={h.month} className={h.partial ? "partial" : ""}>
            <td>{cap(h.label)}</td>
            <td className="strong">{n(h.volume.sent)}</td>
            <td>{n(h.volume.received)}</td>
            <td>{n(h.volume.sent)}</td>
            <td>{h.projectedVolume ? n(h.projectedVolume.sent) : "—"}</td>
            <td className="strong">
              {h.projectedCost ? `${r(h.cost.total)} → ${r(h.projectedCost.total)}` : r(h.cost.total)}
            </td>
          </tr>
        ))}
        {data.forecast.map((f) => (
          <tr key={f.month} className="future">
            <td>{cap(f.label)} · Projeção</td>
            <td>{n(f.volume.sent)}</td>
            <td>{n(f.volume.received)}</td>
            <td>—</td>
            <td>
              {n(f.volumeLow.sent)} – {n(f.volumeHigh.sent)}
            </td>
            <td>
              {r(f.cost.total)}
              <span className="range">
                {" "}
                ({r(f.costLow)} – {r(f.costHigh)})
              </span>
              {!f.serviceCharged && f.cost.total > 0 ? " · só templates" : ""}
            </td>
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr>
          <td>Total (meses completos)</td>
          <td>{n(sum((h) => h.volume.sent))}</td>
          <td>{n(sum((h) => h.volume.received))}</td>
          <td colSpan={2}></td>
          <td>{r(sum((h) => h.cost.total))}</td>
        </tr>
      </tfoot>
    </table>
  );
}
