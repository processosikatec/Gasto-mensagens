"use client";

import { useState } from "react";

type Props = {
  label: string;
  value: string;
  sub?: string;
  info: string;
  accent?: "default" | "danger" | "success";
};

/** Card de indicador com ícone (i) que revela a explicação ao passar o mouse / focar. */
export default function InfoCard({ label, value, sub, info, accent = "default" }: Props) {
  const [open, setOpen] = useState(false);
  return (
    <div className={`infocard infocard--${accent}`}>
      <div className="infocard__head">
        <span className="infocard__label">{label}</span>
        <button
          type="button"
          className="infocard__i"
          aria-label={`Sobre: ${label}`}
          onMouseEnter={() => setOpen(true)}
          onMouseLeave={() => setOpen(false)}
          onFocus={() => setOpen(true)}
          onBlur={() => setOpen(false)}
          onClick={() => setOpen((v) => !v)}
        >
          i
        </button>
        {open && <span className="infocard__tip">{info}</span>}
      </div>
      <div className="infocard__value">{value}</div>
      {sub && <div className="infocard__sub">{sub}</div>}
    </div>
  );
}
