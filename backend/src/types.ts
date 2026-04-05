import type { JWTPayload } from "jose";

/**
 * Cloudflare Workers 環境変数・バインディングの型定義
 *
 * GEMINI_API_KEY は wrangler secret put で設定（コードに書かない）
 * ALLOWED_ORIGINS は CORS 許可オリジン（カンマ区切り）
 *
 * Access JWT 検証: 本番では ACCESS_JWT_ISSUER / ACCESS_JWT_AUD を必ず設定する。
 * aud はカンマ区切りで複数許可可能（いずれかがトークンの aud に含まれればよい）。
 */
export type Env = {
  GEMINI_API_KEY: string;
  ALLOWED_ORIGINS?: string;
  /** 未設定時は `veo-3.1-fast-generate-preview` */
  VEO_MODEL?: string;
  /** 例: https://<team>.cloudflareaccess.com（JWT の iss と一致） */
  ACCESS_JWT_ISSUER?: string;
  /** 許可する aud（カンマ区切り可）。実トークンをデコードして確定させる */
  ACCESS_JWT_AUD?: string;
};

/** Hono コンテキスト変数（認証ミドルウェアが設定） */
export type AppVariables = {
  accessJwtPayload: JWTPayload;
};

export type AppEnv = { Bindings: Env; Variables: AppVariables };
