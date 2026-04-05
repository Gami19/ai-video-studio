import type { EventContext } from "@cloudflare/workers-types";

const ACCESS_JWT_HEADER = "Cf-Access-Jwt-Assertion";

const jsonHeaders: HeadersInit = {
  "Content-Type": "application/json; charset=utf-8",
  "Cache-Control": "no-store",
  Pragma: "no-cache",
  Vary: "Cookie",
};

const unauthorizedHeaders: HeadersInit = {
  "Cache-Control": "no-store",
  Pragma: "no-cache",
};

/**
 * Cloudflare Access 通過後にエッジが付与する JWT を同一オリジンで返す。
 * 静的バンドルからは読めないため、Pages Function のみがトークンを取り出す。
 */
export async function onRequestGet({
  request,
}: EventContext<unknown, string, Record<string, unknown>>): Promise<Response> {
  const raw = request.headers.get(ACCESS_JWT_HEADER)?.trim();
  if (!raw) {
    return new Response(null, { status: 401, headers: unauthorizedHeaders });
  }

  return Response.json(
    { token: raw },
    { status: 200, headers: jsonHeaders }
  );
}
