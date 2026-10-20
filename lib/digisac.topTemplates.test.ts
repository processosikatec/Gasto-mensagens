// Regressão do ranking "Top 10 templates": nome do template vazio/"(sem nome)".
// fetch é stubado — nenhuma chamada sai para a Digisac.
import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { topTemplates } from "./digisac.ts";

const creds = { baseUrl: "https://conta.digisac.test", token: "t" };
const range = { start: "2026-10-01T00:00:00.000Z", end: "2026-10-31T23:59:59.999Z" };

type Call = { path: string; query: any; perPage: string | null };

function stubFetch(opts: {
  asc: any[];
  desc: any[];
  counts: Record<string, number>;
  templates?: { status: number; data?: any[] };
}): Call[] {
  const calls: Call[] = [];
  globalThis.fetch = (async (input: any) => {
    const url = new URL(String(input));
    const query = JSON.parse(url.searchParams.get("query") || "{}");
    calls.push({ path: url.pathname, query, perPage: url.searchParams.get("perPage") });
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
afterEach(() => {
  globalThis.fetch = realFetch;
});

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

test("erro no endpoint de templates (ex.: 403 sem hsm.view) não derruba o ranking", async () => {
  stubFetch({
    asc: [{ id: "m1", hsmId: "C", hsm: null }],
    desc: [],
    counts: { C: 12 },
    templates: { status: 403 },
  });

  const out = await topTemplates(creds, range, undefined, 10);

  assert.deepEqual(out, [{ hsmId: "C", name: "(sem nome)", category: "OUTRO", count: 12 }]);
});
