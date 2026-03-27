/**
 * 開発用デバッグログ。
 * - `npm run dev` では常に有効
 * - 本番ビルドで有効にする場合は `.env` に `VITE_DEBUG=true`
 *
 * DevTools のフィルタに `ai-video-studio` と入力すると絞り込みやすい。
 */
const PREFIX = "[ai-video-studio]";

export function isDebugEnabled(): boolean {
  return (
    import.meta.env.DEV || import.meta.env.VITE_DEBUG === "true"
  );
}

export function debugLog(
  scope: string,
  message: string,
  detail?: Record<string, unknown>
): void {
  if (!isDebugEnabled()) return;
  if (detail !== undefined) {
    console.log(`${PREFIX} [${scope}] ${message}`, detail);
  } else {
    console.log(`${PREFIX} [${scope}] ${message}`);
  }
}

export function debugElapsedMs(label: string, startMs: number): void {
  if (!isDebugEnabled()) return;
  console.log(
    `${PREFIX} [timing] ${label}: ${Math.round(performance.now() - startMs)}ms`
  );
}
