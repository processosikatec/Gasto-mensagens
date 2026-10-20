// Regressão: Top 10 templates exibia "(sem nome)" / célula vazia porque o
// painel lia só `hsm.internalName` (rótulo interno, pode vir nulo ou só com
// espaços) e ignorava `hsm.name` (nome do template na Meta).
import { test } from "node:test";
import assert from "node:assert/strict";
import { templateDisplayName } from "./templateName.ts";

test("internalName nulo -> usa name (nome Meta)", () => {
  assert.equal(templateDisplayName({ internalName: null, name: "boas_vindas_v2" }), "boas_vindas_v2");
});

test("internalName só espaços -> usa name", () => {
  assert.equal(templateDisplayName({ internalName: "  ", name: "boas_vindas_v2" }), "boas_vindas_v2");
});

test("internalName preenchido tem prioridade sobre name", () => {
  assert.equal(templateDisplayName({ internalName: "Boas-vindas", name: "boas_vindas_v2" }), "Boas-vindas");
});

test("valor com espaços nas pontas sai aparado", () => {
  assert.equal(templateDisplayName({ internalName: "  Boas-vindas ", name: "x" }), "Boas-vindas");
});

test("hsm nulo/indefinido ou sem nomes -> (sem nome)", () => {
  assert.equal(templateDisplayName(null), "(sem nome)");
  assert.equal(templateDisplayName(undefined), "(sem nome)");
  assert.equal(templateDisplayName({ internalName: "", name: " " }), "(sem nome)");
});
