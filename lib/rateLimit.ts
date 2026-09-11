// Rate limit simples em memória, por chave (ex: IP). Suficiente para um único
// processo Node (Netlify Functions são efêmeras, mas isso já corta a maioria
// dos scripts de abuso ingênuos); não substitui um rate limiter distribuído
// se o tráfego justificar um no futuro.

type Bucket = { count: number; resetAt: number };

const buckets = new Map<string, Bucket>();

/** true se a chamada deve ser bloqueada (limite excedido). */
export function isRateLimited(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  const bucket = buckets.get(key);

  if (!bucket || now > bucket.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return false;
  }

  bucket.count += 1;
  return bucket.count > limit;
}

/** Extrai um identificador de cliente razoável a partir dos headers da request. */
export function clientKey(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return req.headers.get("x-real-ip") || "unknown";
}
