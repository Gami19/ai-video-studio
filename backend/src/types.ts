/**
 * Cloudflare Workers 環境変数・バインディングの型定義
 *
 * GEMINI_API_KEY は wrangler secret put で設定（コードに書かない）
 * ALLOWED_ORIGINS は CORS 許可オリジン（カンマ区切り）
 */
export type Env = {
  GEMINI_API_KEY: string;
  ALLOWED_ORIGINS?: string;
  /** 未設定時は `veo-3.1-fast-generate-preview` */
  VEO_MODEL?: string;
};
