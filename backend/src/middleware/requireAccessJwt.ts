import { createMiddleware } from "hono/factory";
import type { AppEnv } from "../types";
import { verifyAccessJwt } from "../lib/verifyAccessJwt";

const UNAUTHORIZED_BODY = { error: "Unauthorized" } as const;

function extractAccessJwt(c: {
  req: { header: (name: string) => string | undefined };
}): string | null {
  const auth = c.req.header("Authorization");
  if (auth?.startsWith("Bearer ")) {
    const t = auth.slice("Bearer ".length).trim();
    if (t) return t;
  }
  const assertion = c.req.header("Cf-Access-Jwt-Assertion");
  if (assertion?.trim()) {
    return assertion.trim();
  }
  return null;
}

/**
 * `/api/*` 用。`Authorization: Bearer` または `Cf-Access-Jwt-Assertion` の Access JWT を検証し、ペイロードを c.set する。
 */
export const requireAccessJwt = createMiddleware<AppEnv>(async (c, next) => {
  const token = extractAccessJwt(c);
  if (!token) {
    return c.json(UNAUTHORIZED_BODY, 401);
  }

  const result = await verifyAccessJwt(token, c.env);
  if (!result.ok) {
    return c.json(UNAUTHORIZED_BODY, 401);
  }

  c.set("accessJwtPayload", result.payload);
  return next();
});
