import { createMiddleware } from "hono/factory";
import type { AppEnv } from "../types";
import { verifyAccessJwt } from "../lib/verifyAccessJwt";

const UNAUTHORIZED_BODY = { error: "Unauthorized" } as const;

/**
 * `/api/*` 用。Authorization: Bearer の Access JWT を検証し、ペイロードを c.set する。
 */
export const requireAccessJwt = createMiddleware<AppEnv>(async (c, next) => {
  const auth = c.req.header("Authorization");
  if (!auth?.startsWith("Bearer ")) {
    return c.json(UNAUTHORIZED_BODY, 401);
  }

  const token = auth.slice("Bearer ".length).trim();
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
