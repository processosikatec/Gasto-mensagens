// Token de sessão multi-tenant: carrega a credencial Digisac do cliente
// (baseUrl + token) criptografada, sem precisar de banco de dados nem cookie
// (cookies cross-site em iframe são bloqueados por Safari ITP e outros).
//
// Formato: AES-256-GCM. O payload {baseUrl, token, exp} vai cifrado dentro —
// o tag de autenticação do GCM já garante integridade, sem precisar de HMAC
// separado. Token adulterado ou expirado -> decryptSession retorna null.

import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const SESSION_TTL_MS = 8 * 60 * 60 * 1000; // 8 horas

export type DigisacCreds = {
  baseUrl: string;
  token: string;
};

type SessionPayload = DigisacCreds & { exp: number };

function getKey(): Buffer {
  const secret = process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error(
      "AUTH_SECRET ausente. Configure uma chave aleatória forte em .env.local (dev) e nas env vars do Netlify (produção).",
    );
  }
  // deriva uma chave de 32 bytes (AES-256) a partir do secret, tamanho qualquer
  return createHash("sha256").update(secret).digest();
}

function b64url(buf: Buffer): string {
  return buf.toString("base64url");
}

/** Cria um token de sessão opaco a partir das credenciais Digisac do cliente. */
export function encryptSession(creds: DigisacCreds): { sessionToken: string; expiresAt: number } {
  const exp = Date.now() + SESSION_TTL_MS;
  const payload: SessionPayload = { baseUrl: creds.baseUrl, token: creds.token, exp };
  const plaintext = Buffer.from(JSON.stringify(payload), "utf8");

  const iv = randomBytes(12); // recomendado para GCM
  const cipher = createCipheriv("aes-256-gcm", getKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();

  const sessionToken = `${b64url(iv)}.${b64url(ciphertext)}.${b64url(tag)}`;
  return { sessionToken, expiresAt: exp };
}

/** Decifra e valida um token de sessão. Retorna null se inválido, adulterado ou expirado. */
export function decryptSession(sessionToken: string | null | undefined): DigisacCreds | null {
  if (!sessionToken) return null;
  const parts = sessionToken.split(".");
  if (parts.length !== 3) return null;

  try {
    const [ivB64, dataB64, tagB64] = parts;
    const iv = Buffer.from(ivB64, "base64url");
    const ciphertext = Buffer.from(dataB64, "base64url");
    const tag = Buffer.from(tagB64, "base64url");

    const decipher = createDecipheriv("aes-256-gcm", getKey(), iv);
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    const payload = JSON.parse(plaintext.toString("utf8")) as SessionPayload;

    if (typeof payload.exp !== "number" || Date.now() > payload.exp) return null;
    if (!payload.baseUrl || !payload.token) return null;

    return { baseUrl: payload.baseUrl, token: payload.token };
  } catch {
    return null; // tag inválida, JSON corrompido, chave errada, etc.
  }
}

/** Extrai as credenciais Digisac de uma Request via header Authorization: Bearer <sessionToken>. */
export function getCredsFromRequest(req: Request): DigisacCreds | null {
  const auth = req.headers.get("authorization") || "";
  const match = auth.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;
  return decryptSession(match[1]);
}
