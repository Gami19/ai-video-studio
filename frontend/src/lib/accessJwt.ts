/**
 * Cloudflare Access の JWT を同一オリジンで取得する（Pages Function 経由）。
 * トークンはメモリのみ（localStorage / sessionStorage は使わない）。
 */

const ACCESS_JWT_PATH = "/auth/access-jwt";

declare const accessJwtBrand: unique symbol;

/** Worker の `Authorization: Bearer` に渡す文字列（URL 等と混同しないためのブランド） */
export type AccessJwtToken = string & { readonly [accessJwtBrand]: true };

function toAccessJwtToken(value: string): AccessJwtToken {
  return value as AccessJwtToken;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseTokenFromJson(data: unknown): AccessJwtToken | null {
  if (!isRecord(data)) {
    return null;
  }
  const raw = data.token;
  if (typeof raw !== "string") {
    return null;
  }
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }
  return toAccessJwtToken(trimmed);
}

export type GetAccessJwtOptions = {
  /** true のときキャッシュを無視して再取得（401 後の再試行など） */
  readonly forceRefresh?: boolean;
};

/** `getAccessJwt` の結果（タグ付きユニオン） */
export type AccessJwtResult =
  | { readonly status: "ok"; readonly token: AccessJwtToken }
  | { readonly status: "unauthorized" }
  | { readonly status: "invalid_response" }
  | { readonly status: "network"; readonly message: string };

let memoryCache: AccessJwtToken | null = null;

/** メモリ上の JWT を破棄する（ログアウト相当・401 後の再試行前など） */
export function clearAccessJwt(): void {
  memoryCache = null;
}

/**
 * Access JWT を取得する。成功時はモジュールスコープにキャッシュする。
 * 本番では Access 通過後にのみ 200 となる。`vite` 単体では 404 になりうる。
 */
export async function getAccessJwt(
  options?: GetAccessJwtOptions
): Promise<AccessJwtResult> {
  if (!options?.forceRefresh && memoryCache !== null) {
    return { status: "ok", token: memoryCache };
  }

  try {
    const res = await fetch(ACCESS_JWT_PATH, {
      credentials: "include",
      headers: { Accept: "application/json" },
    });

    if (res.status === 401) {
      memoryCache = null;
      return { status: "unauthorized" };
    }

    if (!res.ok) {
      memoryCache = null;
      return { status: "network", message: `HTTP ${String(res.status)}` };
    }

    const data: unknown = await res.json().catch(() => null);
    if (data === null) {
      memoryCache = null;
      return { status: "invalid_response" };
    }

    const token = parseTokenFromJson(data);
    if (token === null) {
      memoryCache = null;
      return { status: "invalid_response" };
    }

    memoryCache = token;
    return { status: "ok", token };
  } catch (e: unknown) {
    memoryCache = null;
    const message = e instanceof Error ? e.message : "Network error";
    return { status: "network", message };
  }
}
