import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  env: {},
  async headers() {
    return [
      {
        // A tela de login é embedada em iframe pela própria plataforma Digisac
        // do cliente (ex: ikatec.digisac.chat) quando a sessão expira/não
        // existe e o AuthGate redireciona pra cá dentro do iframe. Libera os
        // mesmos sufixos de host aceitos como baseUrl em
        // app/api/auth/login/route.ts (ALLOWED_HOST_SUFFIXES) mais o próprio
        // domínio, e bloqueia qualquer outro terceiro (evita clickjacking/
        // overlay sobre o formulário de credenciais). Se ALLOWED_HOST_SUFFIXES
        // mudar, atualize aqui também.
        source: "/login",
        headers: [
          {
            key: "Content-Security-Policy",
            value:
              "frame-ancestors 'self' https://*.digisac.chat https://*.digisac.io " +
              "https://*.digisac.ai https://*.digisac.me https://*.digisac.co " +
              "https://*.digisac.biz https://*.digisac.net https://*.digisac.app",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
