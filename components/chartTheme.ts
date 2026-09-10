// Paleta Nebula. Lê os tokens do CSS em runtime (browser); fallback = tema claro.
const LIGHT = {
  bg: "#ffffff",
  line: "#d7dbe0", // neutral-200
  ink: "#24272d", // neutral-950
  dim: "#586171", // neutral-600
  faint: "#8c97a4", // neutral-400
};

function readVar(name: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  const v = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return v || fallback;
}

export const C = {
  get bg() {
    return readVar("--bg-raise", LIGHT.bg);
  },
  get line() {
    return readVar("--line", LIGHT.line);
  },
  get ink() {
    return readVar("--ink", LIGHT.ink);
  },
  get dim() {
    return readVar("--ink-dim", LIGHT.dim);
  },
  get faint() {
    return readVar("--ink-faint", LIGHT.faint);
  },
};

// Séries (fixas — cada uma com identidade própria, sem repetir tom/cor entre si).
// As 3 linhas de custo usam cores bem distintas para não se confundirem:
// vermelho = custo real de hoje, roxo = custo projetado, âmbar = simulação
// "se a regra da Meta já valesse".
export const SERIES = {
  service: "#4679ca", // primary-600 — volume realizado
  template: "#7ab0e0", // primary-400
  campaign: "#324b7d", // primary-900
  received: "#8c97a4", // neutral-400 (linha)
  projected: "#a5cbeb", // primary-300 — barras de projeção de volume
  cost: "#db2727", // danger-600 — custo real (hoje)
  costForecast: "#7c3aed", // violet-600 — custo projetado (meses futuros)
  costRule: "#c48b0a", // warning-600 — custo simulado "se a regra valesse"
};

export const AXIS = {
  get stroke() {
    return C.faint;
  },
  fontSize: 11,
  fontFamily: "'IBM Plex Mono', monospace",
} as { stroke: string; fontSize: number; fontFamily: string };

export function monthLabel(m: string) {
  const [y, mo] = m.split("-");
  const nome = ["Jan", "Fev", "Mar", "Abr", "Mai", "Jun", "Jul", "Ago", "Set", "Out", "Nov", "Dez"][
    Number(mo) - 1
  ];
  return `${nome}/${y.slice(2)}`;
}

export const tooltipStyle = {
  get background() {
    return C.bg;
  },
  get border() {
    return `1px solid ${C.line}`;
  },
  borderRadius: 8,
  fontFamily: "'IBM Plex Mono', monospace",
  fontSize: 12,
  get color() {
    return C.ink;
  },
  boxShadow: "0 8px 24px -12px rgba(13,27,51,0.25)",
} as Record<string, string | number>;
