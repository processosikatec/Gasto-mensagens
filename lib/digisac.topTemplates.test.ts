// Regressão do ranking "Top 10 templates": nome do template vazio/"(sem nome)".
// fetch é stubado — nenhuma chamada sai para a Digisac.
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { topTemplates } from "./digisac.ts";

const creds = { baseUrl: "https://conta.digisac.test", token: "tok-teste-nao-logar" };
const range = { start: "2026-10-01T00:00:00.000Z", end: "2026-10-31T23:59:59.999Z" };

type Call = { path: string; query: any; perPage: string | null; timeoutMs: number | undefined };

// AbortSignal.timeout é envolvido para registrar o timeout de cada chamada.
const realTimeout = AbortSignal.timeout.bind(AbortSignal);
const timeoutOf = new WeakMap<AbortSignal, number>();
AbortSignal.timeout = (ms: number) => {
  const s = realTimeout(ms);
  timeoutOf.set(s, ms);
  return s;
};

function stubFetch(opts: {
  asc: any[];
  desc: any[];
  counts: Record<string, number>;
  templates?: { status: number; data?: any[] };
}): Call[] {
  const calls: Call[] = [];
  globalThis.fetch = (async (input: any, init?: RequestInit) => {
    const url = new URL(String(input));
    const query = JSON.parse(url.searchParams.get("query") || "{}");
    const timeoutMs = init?.signal ? timeoutOf.get(init.signal) : undefined;
    calls.push({ path: url.pathname, query, perPage: url.searchParams.get("perPage"), timeoutMs });
    const json = (status: number, body: unknown) =>
      new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

    if (url.pathname === "/api/v1/messages") {
      if (query.include) {
        const dir = query.order?.[0]?.[1];
        return json(200, { data: dir === "ASC" ? opts.asc : opts.desc });
      }
      return json(200, { data: [], total: opts.counts[query.where?.hsmId] ?? 0 });
    }
    if (url.pathname === "/api/v1/whatsapp-business-templates") {
      const t = opts.templates ?? { status: 200, data: [] };
      return json(t.status, t.status === 200 ? { data: t.data ?? [] } : { error: "Forbidden" });
    }
    return json(404, {});
  }) as typeof fetch;
  return calls;
}

const realFetch = globalThis.fetch;
const realWarn = console.warn;
afterEach(() => {
  globalThis.fetch = realFetch;
  console.warn = realWarn;
});

const TPL = "/api/v1/whatsapp-business-templates";

test("1ª mensagem do hsmId sem hsm não trava o nome: completa com mensagem posterior", async () => {
  const calls = stubFetch({
    asc: [
      { id: "m1", hsmId: "A", hsm: null },
      { id: "m2", hsmId: "B", hsm: { internalName: null, name: "b_meta", category: "UTILITY" } },
    ],
    desc: [{ id: "m3", hsmId: "A", hsm: { internalName: "  ", name: "boas_vindas_v2", category: "MARKETING" } }],
    counts: { A: 50, B: 7 },
  });

  const out = await topTemplates(creds, range, undefined, 10);

  assert.deepEqual(out, [
    { hsmId: "A", name: "boas_vindas_v2", category: "MARKETING", count: 50 },
    { hsmId: "B", name: "b_meta", category: "UTILITY", count: 7 },
  ]);
  // nada faltando -> não consulta o endpoint de templates
  assert.equal(calls.filter((c) => c.path === "/api/v1/whatsapp-business-templates").length, 0);
});

test("hsmId sem hsm em toda a amostra: busca nome/categoria em /whatsapp-business-templates (1 chamada)", async () => {
  const calls = stubFetch({
    asc: [
      { id: "m1", hsmId: "C", hsm: null },
      { id: "m2", hsmId: "A", hsm: { internalName: "Boas-vindas", name: "boas_vindas_v2", category: "MARKETING" } },
    ],
    desc: [{ id: "m3", hsmId: "C", hsm: null }],
    counts: { A: 3, C: 90 },
    templates: { status: 200, data: [{ id: "C", internalName: null, name: "lembrete_consulta", category: "UTILITY" }] },
  });

  const out = await topTemplates(creds, range, undefined, 10);

  assert.deepEqual(out, [
    { hsmId: "C", name: "lembrete_consulta", category: "UTILITY", count: 90 },
    { hsmId: "A", name: "Boas-vindas", category: "MARKETING", count: 3 },
  ]);
  const tpl = calls.filter((c) => c.path === "/api/v1/whatsapp-business-templates");
  assert.equal(tpl.length, 1);
  assert.deepEqual(tpl[0].query, { where: { id: { $in: ["C"] } } });
  assert.equal(tpl[0].perPage, "1");
});

test("erro no endpoint de templates (ex.: 403 sem hsm.view) não derruba o ranking e loga só a mensagem", async () => {
  const calls = stubFetch({
    asc: [{ id: "m1", hsmId: "C", hsm: null }],
    desc: [],
    counts: { C: 12 },
    templates: { status: 403 },
  });
  const warns: unknown[][] = [];
  console.warn = (...args: unknown[]) => void warns.push(args);

  const out = await topTemplates(creds, range, undefined, 10);

  assert.deepEqual(out, [{ hsmId: "C", name: "(sem nome)", category: "OUTRO", count: 12 }]);
  // o fallback foi de fato tentado (e falhou com 403) antes de cair no "(sem nome)"
  assert.equal(calls.filter((c) => c.path === TPL).length, 1);
  // falha registrada sem token nem corpo da resposta
  assert.equal(warns.length, 1);
  const logged = warns[0].map(String).join(" ");
  assert.match(logged, /\[topTemplates\] fallback templates falhou:/);
  assert.match(logged, /HTTP 403/);
  assert.ok(!logged.includes(creds.token), "token não pode ir para o log");
  assert.doesNotMatch(logged, /Bearer|Forbidden/); // nem header nem corpo da resposta
});

test("nome presente mas categoria ausente: fallback completa só a categoria (nome da amostra preservado)", async () => {
  const calls = stubFetch({
    asc: [{ id: "m1", hsmId: "D", hsm: { internalName: "X", name: "x", category: null } }],
    desc: [],
    counts: { D: 20 },
    templates: { status: 200, data: [{ id: "D", internalName: "outro_nome", name: "x", category: "UTILITY" }] },
  });

  const out = await topTemplates(creds, range, undefined, 10);

  assert.deepEqual(out, [{ hsmId: "D", name: "X", category: "UTILITY", count: 20 }]);
  const tpl = calls.filter((c) => c.path === TPL);
  assert.equal(tpl.length, 1);
  assert.deepEqual(tpl[0].query, { where: { id: { $in: ["D"] } } });
});

test("fallback consulta só os hsmIds que entraram no top (limit)", async () => {
  const calls = stubFetch({
    asc: [
      { id: "m1", hsmId: "E", hsm: null },
      { id: "m2", hsmId: "F", hsm: null },
    ],
    desc: [],
    counts: { E: 50, F: 5 },
    templates: { status: 200, data: [{ id: "E", internalName: "lembrete", name: "lembrete", category: "UTILITY" }] },
  });

  const out = await topTemplates(creds, range, undefined, 1);

  assert.deepEqual(out, [{ hsmId: "E", name: "lembrete", category: "UTILITY", count: 50 }]);
  const tpl = calls.filter((c) => c.path === TPL);
  assert.equal(tpl.length, 1);
  assert.deepEqual(tpl[0].query, { where: { id: { $in: ["E"] } } });
  assert.equal(tpl[0].perPage, "1");
});

test("fallback usa timeout curto (5 s); demais chamadas mantêm o timeout padrão (30 s)", async () => {
  const calls = stubFetch({
    asc: [{ id: "m1", hsmId: "C", hsm: null }],
    desc: [],
    counts: { C: 12 },
    templates: { status: 200, data: [{ id: "C", internalName: "c", name: "c", category: "UTILITY" }] },
  });

  await topTemplates(creds, range, undefined, 10);

  const tpl = calls.filter((c) => c.path === TPL);
  assert.equal(tpl.length, 1);
  assert.equal(tpl[0].timeoutMs, 5_000);
  const others = calls.filter((c) => c.path !== TPL);
  assert.ok(others.length > 0);
  for (const c of others) assert.equal(c.timeoutMs, 30_000);
});
