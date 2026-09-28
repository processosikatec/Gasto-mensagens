export type Currency = "BRL" | "USD";

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const BRL0 = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const USD = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const USD0 = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

/** Formata um valor em BRL na moeda selecionada, convertendo via fxRate se USD. */
export function formatMoney(brlValue: number, currency: Currency, fxRate: number, wholeOnly = false): string {
  if (currency === "USD" && fxRate > 0) {
    return (wholeOnly ? USD0 : USD).format((brlValue || 0) / fxRate);
  }
  return (wholeOnly ? BRL0 : BRL).format(brlValue || 0);
}
