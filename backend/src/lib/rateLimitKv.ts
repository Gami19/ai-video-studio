export type ThumbnailRateLimitKind = "analyze" | "generate";

/**
 * レート制限で使う KV の最小面（`KVNamespace` に構造的に互換）。
 * グローバル型を参照せず、IDE / tsserver が単体ファイルでも解決できるようにする。
 */
export type ThumbnailRateLimitKv = {
  get(key: string): Promise<string | null>;
  put(
    key: string,
    value: string,
    options?: { expirationTtl?: number }
  ): Promise<void>;
};

export type RateLimitConsumeResult =
  | { ok: true }
  | { ok: false; retryAfterSec: number };

function parsePositiveInt(value: string | undefined, fallback: number): number {
  if (value === undefined || value === "") return fallback;
  const n = parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export function getRateLimitConfig(env: {
  THUMBNAIL_RL_ANALYZE_MAX?: string;
  THUMBNAIL_RL_GENERATE_MAX?: string;
  THUMBNAIL_RL_WINDOW_SEC?: string;
}): {
  analyzeMax: number;
  generateMax: number;
  windowSec: number;
} {
  return {
    analyzeMax: parsePositiveInt(env.THUMBNAIL_RL_ANALYZE_MAX, 30),
    generateMax: parsePositiveInt(env.THUMBNAIL_RL_GENERATE_MAX, 20),
    windowSec: parsePositiveInt(env.THUMBNAIL_RL_WINDOW_SEC, 60),
  };
}

/**
 * KV 上の固定窓カウンタ。厳密な直列化はしない（ソフト上限）。
 */
export async function consumeRateLimitSlot(
  kv: ThumbnailRateLimitKv,
  kind: ThumbnailRateLimitKind,
  identityKey: string,
  max: number,
  windowSec: number
): Promise<RateLimitConsumeResult> {
  const nowSec = Math.floor(Date.now() / 1000);
  const bucket = Math.floor(nowSec / windowSec);
  const safeId = identityKey.replace(/:/g, "_").slice(0, 200);
  const key = `rl:${kind}:${safeId}:${String(bucket)}`;

  const raw = await kv.get(key);
  const count = raw !== null ? parseInt(raw, 10) || 0 : 0;
  if (count >= max) {
    const windowEnd = (bucket + 1) * windowSec;
    return { ok: false, retryAfterSec: Math.max(1, windowEnd - nowSec) };
  }

  await kv.put(key, String(count + 1), {
    expirationTtl: Math.max(windowSec * 3, 120),
  });
  return { ok: true };
}
