import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  env: {},
  async headers() {
    return [
      {
        // A tela de login coleta a credencial Digisac do cliente — não deve
        // ser embedável em iframe de terceiros (evita clickjacking/overlay
        // sobre o formulário). O dashboard em si (/) é projetado para ir em
        // iframe de uma plataforma-mãe e por isso não tem essa restrição;
        // quando o domínio da plataforma-mãe for definido, restrinja aqui
        // também com frame-ancestors 'self' https://dominio-do-portal.
        source: "/login",
        headers: [{ key: "Content-Security-Policy", value: "frame-ancestors 'self'" }],
      },
    ];
  },
};

export default nextConfig;
