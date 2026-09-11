# Painel de Gastos · Mensagens WhatsApp / Digisac

Dashboard de **volumetria, custos e projeções** de mensagens do WhatsApp Business
(via Digisac), considerando a nova regra de cobrança da Meta para mensagens de
serviço que entra em vigor em **01/10/2026**. Multi-tenant: cada cliente entra com
a própria URL e token da conta Digisac dele.

## Login (multi-tenant)

O painel não tem credencial fixa de nenhuma conta Digisac. Cada visitante loga em
`/login` com a **URL** e o **token de acesso** da própria conta. O login:

1. Valida a credencial com uma chamada real à API Digisac.
2. Se válida, gera um **token de sessão** (AES-256-GCM, `lib/session.ts`) que
   carrega a credencial de forma criptografada — sem banco de dados.
3. O front guarda esse token no `localStorage` (não em cookie — cookies
   cross-site são bloqueados dentro de iframe por Safari e outros navegadores) e
   manda em toda chamada via `Authorization: Bearer <token>`.
4. Sessão expira em 8 horas; expirando, o painel redireciona pro login de novo.

Pensado para ser **embedado em iframe** dentro de outra plataforma — cada cliente
loga e vê só os dados da própria conta.

### Modo desenvolvimento

Se `DIGISAC_BASE_URL` e `DIGISAC_TOKEN` estiverem em `.env.local`, o painel entra
automaticamente sem passar pela tela de login (`app/api/auth/dev-session`). Essa
rota sempre retorna 404 em produção — nunca vaza uma credencial fixa para um
deploy real.

## O que ele faz

- Consulta a **API Digisac** (server-side) e conta mensagens mês a mês, separando:
  - **serviço** (livre, fora de template) — cobrado pela Meta a partir de 01/10/2026
  - **templates (HSM)** — já cobrados hoje, por categoria (marketing/utility/authentication)
  - **campanhas** (livres ou template)
  - **recebidas** (só volumetria, nunca custo)
- Busca a **tarifa da Meta para o Brasil** por scrape de agregador público que
  republica a rate card oficial. Fallback embutido + override manual por env.
- Converte USD→BRL com câmbio ao vivo (frankfurter / awesomeapi, com fallback).
- **Histórico**: últimos 3 meses reais (mês corrente com fechamento estimado
  pró-rata) + tabela completa.
- **Projeção**: tendência linear (mínimos quadrados) sobre os últimos meses
  completos — cada mês futuro tem seu próprio valor, sem sazonalidade.
- **Simulações**: custo do mês se a regra da Meta já estivesse ativa; custo de
  conexões Standard como se fossem oficiais (WABA).
- Filtro por tipo de conexão (Oficial / Standard / Todas) e por conexão específica.

## Rodar

```bash
npm install
cp .env.local.example .env.local   # gere AUTH_SECRET; DIGISAC_* opcionais p/ dev
npm run dev
```

Abre em `http://localhost:3000` (ou porta seguinte se ocupada). Sem
`DIGISAC_BASE_URL`/`DIGISAC_TOKEN` em `.env.local`, você cai em `/login`.

## Variáveis de ambiente

| Var | Obrigatória | Descrição |
|-----|-------------|-----------|
| `AUTH_SECRET` | **sim** | chave para criptografar o token de sessão. Gere com `openssl rand -base64 32` |
| `DIGISAC_BASE_URL` | não | só dev — pula o login local |
| `DIGISAC_TOKEN` | não | só dev — pula o login local |
| `USD_BRL_RATE` | não | trava o câmbio (senão busca ao vivo) |
| `META_SERVICE_RATE_USD` | não | trava a tarifa Meta em USD/msg (pula o scrape) |

Em produção (Netlify), configure pelo menos `AUTH_SECRET` nas env vars do site —
**não** configure `DIGISAC_BASE_URL`/`DIGISAC_TOKEN` lá, ou o modo dev vazaria uma
conta fixa (na prática essa rota já é bloqueada em produção, mas por clareza é
melhor nem definir essas duas em produção).

## Estrutura

```
app/
  page.tsx                    dashboard (atrás de AuthGate)
  login/page.tsx               formulário de login
  api/auth/login/route.ts      valida credencial Digisac + emite sessão
  api/auth/session/route.ts    checa se a sessão ainda é válida
  api/auth/dev-session/route.ts atalho de dev (404 em produção)
  api/dashboard/route.ts       orquestra Digisac + pricing + projeção (exige sessão)
  api/debug/services/route.ts  lista conexões e sua classificação (exige sessão)
lib/
  session.ts                  cripto do token de sessão (AES-256-GCM)
  digisac.ts                  cliente da API (recebe credenciais por parâmetro)
  meta-pricing.ts             scrape da tarifa + câmbio, com cache e fallback
  costing.ts                  regras de precificação + projeção de tendência
  apiClient.ts                fetch autenticado do lado do cliente (localStorage)
components/
  AuthGate.tsx                guarda de sessão no client
  Dashboard.tsx               controles, KPIs, orquestração
  VolumeChart / TemplateChart recharts (ComposedChart)
  HistoryTable
```

## Notas sobre a API Digisac (descoberto por probing)

- Filtro via `?query=<JSON urlencoded>` com `{where, order, include}`; operadores
  `$between`, `$ne`, `$gte`, `$lte`, `$in`. Params planos são ignorados.
- Resposta paginada: `{ data, total, limit, currentPage, lastPage }` — usamos
  `perPage=1` e lemos só `total` para contar.
- `hsmId != null` / `type: "hsm"` ⇒ mensagem de template; categoria vem via
  `include: ["hsm"]`, estimada por amostragem (a API não permite contar por
  categoria diretamente).
- `origin: "campaign"` ⇒ mensagem disparada por campanha (livre ou template).

## Ressalvas

- A tarifa oficial por país só é publicada pela Meta até **01/09/2026**; até lá o
  número é estimativa. Confirme sempre contra a fatura real da Digisac (pode ter
  markup do BSP).
- A janela de "free entry point" de 72 h (Click-to-WhatsApp / anúncios IG/FB) não é
  descontada nesta versão — a contagem trata toda mensagem de serviço como cobrável,
  o que é conservador (superestima).
- Sessão só existe no navegador que fez login (localStorage) — sem persistência
  entre dispositivos, sem "lembrar-me" além das 8h.
