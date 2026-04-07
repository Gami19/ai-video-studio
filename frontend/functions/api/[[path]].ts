import type { EventContext } from "@cloudflare/workers-types";
import type { PagesBffEnv } from "../env";

/** オリジン Worker へ渡すヘッダのみ（Cookie / エッジ専用ヘッダは送らない） */
const FORWARD_HEADER_NAMES = [
  "authorization",
  "cf-access-jwt-assertion",
  "content-type",
  "accept",
] as const;

function normalizeOrigin(raw: string | undefined): string | null {
  if (raw === undefined || raw === "") return null;
  const t = raw.trim().replace(/\/+$/, "");
  return t.length > 0 ? t : null;
}

/** DOM / Workers の `Headers` 型差を避け、`.get()` だけに依存する */
function buildUpstreamHeaders(headers: { get(name: string): string | null }): Headers {
  const out = new Headers();
  for (const name of FORWARD_HEADER_NAMES) {
    const v = headers.get(name);
    if (v !== null && v !== "") {
      out.set(name, v);
    }
  }
  return out;
}

/**
 * ブラウザ同一オリジンの `/api/*` を Worker にリバースプロキシする BFF。
 * ボディはメモリにためず `ReadableStream` のまま転送する。
 */
export async function onRequest(
  context: EventContext<PagesBffEnv, string, Record<string, unknown>>
): Promise<Response> {
  const { request, env } = context;
  const base = normalizeOrigin(env.BACKEND_API_ORIGIN);
  if (!base) {
    return Response.json(
      { error: "BFF misconfigured: BACKEND_API_ORIGIN is missing" },
      { status: 502, headers: { "Content-Type": "application/json; charset=utf-8" } }
    );
  }

  const incoming = new URL(request.url);
  let target: URL;
  try {
    target = new URL(`${incoming.pathname}${incoming.search}`, `${base}/`);
  } catch {
    return Response.json(
      { error: "Invalid backend URL" },
      { status: 502, headers: { "Content-Type": "application/json; charset=utf-8" } }
    );
  }

  const headers = buildUpstreamHeaders(request.headers);

  const init: RequestInit & { duplex?: "half" } = {
    method: request.method,
    headers,
    redirect: "manual",
  };

  if (request.body !== null) {
    // Workers の ReadableStream と lib.dom の BodyInit の型表現が一致しないが、実行時は有効
    init.body = request.body as unknown as BodyInit;
    init.duplex = "half";
  }

  let upstream: Response;
  try {
    upstream = await fetch(target.toString(), init);
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "Upstream fetch failed";
    return Response.json(
      { error: "Bad gateway", message },
      { status: 502, headers: { "Content-Type": "application/json; charset=utf-8" } }
    );
  }

  const outHeaders = new Headers(upstream.headers);
  outHeaders.delete("transfer-encoding");

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: outHeaders,
  });
}
