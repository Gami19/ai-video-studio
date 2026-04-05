import * as jose from "jose";
import type { Env } from "../types";

const jwksByIssuer = new Map<
  string,
  ReturnType<typeof jose.createRemoteJWKSet>
>();

function normalizedIssuer(issuer: string): string {
  return issuer.replace(/\/$/, "");
}

function getJwks(issuerTrimmed: string): ReturnType<
  typeof jose.createRemoteJWKSet
> {
  const base = normalizedIssuer(issuerTrimmed);
  let jwks = jwksByIssuer.get(base);
  if (!jwks) {
    jwks = jose.createRemoteJWKSet(
      new URL(`${base}/cdn-cgi/access/certs`)
    );
    jwksByIssuer.set(base, jwks);
  }
  return jwks;
}

/** ACCESS_JWT_AUD のカンマ区切りを配列へ */
export function parseAudienceList(raw: string): string[] {
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export type VerifyAccessJwtResult =
  | { ok: true; payload: jose.JWTPayload }
  | { ok: false };

/**
 * Cloudflare Access が発行した JWT を JWKS で検証する。
 * RS256 のみ許可。iss / exp / aud は jose が検証する。
 */
export async function verifyAccessJwt(
  token: string,
  env: Pick<Env, "ACCESS_JWT_ISSUER" | "ACCESS_JWT_AUD">
): Promise<VerifyAccessJwtResult> {
  const issuerRaw = env.ACCESS_JWT_ISSUER?.trim();
  const audRaw = env.ACCESS_JWT_AUD?.trim();
  if (!issuerRaw || !audRaw) {
    return { ok: false };
  }

  const audiences = parseAudienceList(audRaw);
  if (audiences.length === 0) {
    return { ok: false };
  }

  const issuerForVerify = normalizedIssuer(issuerRaw);

  try {
    const JWKS = getJwks(issuerRaw);
    const { payload } = await jose.jwtVerify(token, JWKS, {
      issuer: issuerForVerify,
      audience: audiences,
      algorithms: ["RS256"],
    });
    return { ok: true, payload };
  } catch (e: unknown) {
    console.error(
      "Access JWT verification failed:",
      e instanceof Error ? e.name : "unknown"
    );
    return { ok: false };
  }
}
