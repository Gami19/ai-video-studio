import type { AccessJwtToken } from "./accessJwt";
import { clearAccessJwt, getAccessJwt } from "./accessJwt";

export function getApiBase(): string {
  return import.meta.env.VITE_API_URL || "http://localhost:8787";
}

export type ApiClientError =
  | { readonly tag: "auth"; readonly code: "no_token" | "session_expired" }
  | { readonly tag: "http"; readonly status: number; readonly message: string }
  | { readonly tag: "network"; readonly message: string }
  | { readonly tag: "parse"; readonly message: string };

export type ApiResult<T> =
  | { readonly ok: true; readonly data: T }
  | { readonly ok: false; readonly error: ApiClientError };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

async function readHttpErrorMessage(res: Response): Promise<string> {
  const raw: unknown = await res.json().catch(() => null);
  if (isRecord(raw)) {
    const err = raw.error;
    const msg = raw.message;
    if (typeof err === "string" && err.trim()) {
      return err.trim();
    }
    if (typeof msg === "string" && msg.trim()) {
      return msg.trim();
    }
  }
  return `HTTP ${String(res.status)}`;
}

function mergeAuthHeaders(
  init: RequestInit,
  token: AccessJwtToken
): Headers {
  const h = new Headers(init.headers ?? undefined);
  h.set("Authorization", `Bearer ${token}`);
  return h;
}

async function fetchWithToken(
  url: string,
  init: RequestInit,
  token: AccessJwtToken
): Promise<Response> {
  const headers = mergeAuthHeaders(init, token);
  return fetch(url, { ...init, headers });
}

/**
 * Bearer 付き fetch。401/403 時はトークン再取得後に1回だけ再試行する。
 */
export async function authorizedFetch(
  url: string,
  init: RequestInit
): Promise<ApiResult<Response>> {
  let jwt = await getAccessJwt();
  if (jwt.status !== "ok") {
    return {
      ok: false,
      error: { tag: "auth", code: "no_token" },
    };
  }

  try {
    let res = await fetchWithToken(url, init, jwt.token);

    if (res.ok) {
      return { ok: true, data: res };
    }

    if (res.status === 401 || res.status === 403) {
      clearAccessJwt();
      const jwt2 = await getAccessJwt({ forceRefresh: true });
      if (jwt2.status !== "ok") {
        return {
          ok: false,
          error: { tag: "auth", code: "session_expired" },
        };
      }
      res = await fetchWithToken(url, init, jwt2.token);
      if (res.ok) {
        return { ok: true, data: res };
      }
      if (res.status === 401 || res.status === 403) {
        return {
          ok: false,
          error: { tag: "auth", code: "session_expired" },
        };
      }
      return {
        ok: false,
        error: {
          tag: "http",
          status: res.status,
          message: await readHttpErrorMessage(res),
        },
      };
    }

    return {
      ok: false,
      error: {
        tag: "http",
        status: res.status,
        message: await readHttpErrorMessage(res),
      },
    };
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Network error";
    return { ok: false, error: { tag: "network", message } };
  }
}

/**
 * `authorizedFetch` の成功レスポンスから JSON を取り出し型ガードで検証する。
 */
export async function apiResultJson<T>(
  result: ApiResult<Response>,
  isT: (u: unknown) => u is T
): Promise<ApiResult<T>> {
  if (!result.ok) {
    return result;
  }
  let raw: unknown;
  try {
    raw = await result.data.json();
  } catch {
    return {
      ok: false,
      error: { tag: "parse", message: "レスポンスの JSON が無効です" },
    };
  }
  if (!isT(raw)) {
    return {
      ok: false,
      error: { tag: "parse", message: "想定と異なるレスポンス形式です" },
    };
  }
  return { ok: true, data: raw };
}

/**
 * `authorizedFetch` の成功レスポンスから Blob を取り出す。
 */
export async function apiResultBlob(
  result: ApiResult<Response>
): Promise<ApiResult<Blob>> {
  if (!result.ok) {
    return result;
  }
  try {
    const blob = await result.data.blob();
    return { ok: true, data: blob };
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Blob の取得に失敗しました";
    return { ok: false, error: { tag: "network", message } };
  }
}

/** UI 向けの短いエラーメッセージ */
export function userFacingApiError(error: ApiClientError): string {
  switch (error.tag) {
    case "auth":
      return error.code === "session_expired"
        ? "Access のセッションが切れた可能性があります。ページを再読み込みしてください。"
        : "認証トークンを取得できませんでした。ページを再読み込みするか、本番 URL・Access 経由で開いているか確認してください。";
    case "http":
      return error.message;
    case "network":
      return error.message;
    case "parse":
      return error.message;
  }
}
