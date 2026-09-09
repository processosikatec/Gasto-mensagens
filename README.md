# Painel de Gastos · Mensagens WhatsApp / Digisac

Dashboard de **previsão e histórico** do custo com mensagens de serviço do WhatsApp
Business (via Digisac) sob a nova regra de cobrança da Meta que entra em
**01/10/2026**.

## O que ele faz

- Consulta a **API Digisac** (server-side, token no `.env.local` — nunca no front) e
  conta mensagens enviadas mês a mês, separando:
  - **serviço (cobrável)** — `isFromMe` ∧ não-comentário ∧ free-form (sem template)
  - por agente humano vs. por bot
  - template/HSM (já cobrado hoje)
  - recebidas
- Busca a **tarifa da Meta para o Brasil** por scrape de agregador público que
  republica a rate card oficial (utility/authentication ≈ US$0,0068 — a mesma que a
  mensagem de serviço passa a custar em out/2026). Fallback embutido + override
  manual por env. Nenhum valor é editado no front.
- Converte USD→BRL com câmbio ao vivo (frankfurter / awesomeapi, com fallback).
- **Histórico**: tabela + gráfico de barras dos meses já ocorridos, valorados pela
  regra nova para comparação.
- **Previsão**: média móvel (3m) + tendência linear por mínimos quadrados, com banda
  de incerteza (MAD dos resíduos, limitada a ±60%). Projeta a partir do próximo mês
  completo; marca quando a cobrança de fato começa (01/10/2026).

## Rodar

```bash
cp .env.local.example .env.local   # e preencha DIGISAC_TOKEN
npm install
npm run dev
```

Abre em `http://localhost:3000` (ou 3001 se ocupado).

## Variáveis de ambiente

| Var | Obrigatória | Descrição |
|-----|-------------|-----------|
| `DIGISAC_BASE_URL` | sim | ex: `https://processosikatec.digisac.io` |
| `DIGISAC_TOKEN` | sim | Bearer token da API Digisac |
| `USD_BRL_RATE` | não | trava o câmbio (senão busca ao vivo) |
| `META_SERVICE_RATE_USD` | não | trava a tarifa Meta em USD/msg (pula o scrape) |

## Estrutura

```
app/
  page.tsx                 layout + cabeçalho
  api/dashboard/route.ts   orquestra Digisac + pricing + forecast
lib/
  digisac.ts               cliente da API (contagem por /messages + query Sequelize)
  meta-pricing.ts          scrape da tarifa + câmbio, com cache e fallback
  forecast.ts              média móvel + regressão linear + banda
components/
  Dashboard.tsx            client: controles, KPIs, orquestração
  VolumeChart / CostChart  recharts (ComposedChart)
  HistoryTable / ForecastTable
```

## Notas sobre a API Digisac (descoberto por probing)

- Host real: `.digisac.io` (o `.chat` não resolve externamente).
- Filtro via `?query=<JSON urlencoded>` com `{where, order}`; operadores
  `$between`, `$ne`, `$gte`, `$lte`. Params planos são ignorados.
- Resposta paginada: `{ data, total, limit, currentPage, lastPage }` — usamos
  `perPage=1` e lemos só `total` para contar.
- `/api/v1/dashboard/general` só retorna dados dos últimos ~meses e diverge da
  contagem por `/messages` — por isso o painel conta direto em `/messages`.
- `hsmId != null` ⇒ mensagem de template/HSM.

## Ressalvas

- A tarifa oficial por país só é publicada pela Meta até **01/09/2026**; até lá o
  número é estimativa. Confirme sempre contra a fatura real da Digisac (pode ter
  markup do BSP).
- A janela de "free entry point" de 72 h (Click-to-WhatsApp / anúncios IG/FB) não é
  descontada nesta versão — a contagem trata toda mensagem de serviço como cobrável,
  o que é conservador (superestima).
