/// <reference types="@cloudflare/workers-types" />
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
  /** サムネ analyze 結果の一時保存（Workers KV） */
  THUMBNAIL_JOBS: KVNamespace;
  /** KV の TTL（秒）。未設定時 3600 */
  THUMBNAIL_JOB_TTL_SECONDS?: string;
  /** レート制限: analyze あたりのウィンドウ内最大回数（既定 30） */
  THUMBNAIL_RL_ANALYZE_MAX?: string;
  /** レート制限: generate あたりのウィンドウ内最大回数（既定 20） */
  THUMBNAIL_RL_GENERATE_MAX?: string;
  /** レート制限ウィンドウ（秒）。既定 60 */
  THUMBNAIL_RL_WINDOW_SEC?: string;
  /**
   * `true` のときのみ、サーバが Imagen プロンプトのプレビューをログに出す。
   * 本番では未設定または false を推奨。
   */
  LOG_PROMPT_PREVIEW?: string;
  /** `development` のとき onError で詳細メッセージを返す（index.ts） */
  ENVIRONMENT?: string;
};

/** Hono コンテキスト変数（認証ミドルウェアが設定） */
export type AppVariables = {
  accessJwtPayload: JWTPayload;
};

export type AppEnv = { Bindings: Env; Variables: AppVariables };
