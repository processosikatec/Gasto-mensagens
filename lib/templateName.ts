// Nome exibível de um template WhatsApp Business (hsm) da Digisac.
//  - `internalName`: rótulo interno dado na Digisac — pode vir nulo, vazio ou
//    só com espaços.
//  - `name`: nome do template na Meta — campo obrigatório no template.
// Ordem de exibição: internalName → name → "(sem nome)".

export const SEM_NOME = "(sem nome)";

type HsmLike = { internalName?: unknown; name?: unknown } | null | undefined;

function nonBlank(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s ? s : null;
}

/** Primeiro nome não vazio (após trim) em internalName → name; null se nenhum. */
export function pickTemplateName(hsm: HsmLike): string | null {
  return nonBlank(hsm?.internalName) ?? nonBlank(hsm?.name);
}

/** Nome para exibir no painel: internalName → name → "(sem nome)". */
export function templateDisplayName(hsm: HsmLike): string {
  return pickTemplateName(hsm) ?? SEM_NOME;
}
