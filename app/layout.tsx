import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Painel de Gastos · Mensagens WhatsApp",
  description:
    "Previsão e histórico de custo com mensagens de serviço da Digisac sob a nova regra da Meta (01/10/2026).",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
