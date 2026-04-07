/**
 * Pages Functions が参照する環境（ダッシュボード / .dev.vars）。
 * `VITE_` プレフィックスは付けない（クライアントにバンドルされない）。
 */
export interface PagesBffEnv {
  /** 例: https://ai-video-studio-backend.xxx.workers.dev（末尾スラッシュなし） */
  BACKEND_API_ORIGIN?: string;
}
