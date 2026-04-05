import { userFacingApiError } from "./apiClient";
import { getVideoOperation } from "./veoApi";
import type { VideoOperationStatus } from "./veoTypes";

function delay(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new Error("処理が中断されました"));
      return;
    }
    const id = window.setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      window.clearTimeout(id);
      signal?.removeEventListener("abort", onAbort);
      reject(new Error("処理が中断されました"));
    };
    signal?.addEventListener("abort", onAbort);
  });
}

function formatOperationError(error: unknown): string {
  if (error == null || error === false) {
    return "不明なエラー";
  }
  if (typeof error === "string") {
    return error;
  }
  if (typeof error === "object" && error !== null && "message" in error) {
    const m = (error as { message?: unknown }).message;
    if (typeof m === "string") {
      return m;
    }
  }
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

/**
 * GET /api/video/operations をポーリングし、videoReady になるまで待つ。
 */
export async function pollVeoUntilVideoReady(
  operationName: string,
  options?: {
    intervalMs?: number;
    maxWaitMs?: number;
    signal?: AbortSignal;
    onStatus?: (status: VideoOperationStatus) => void;
  }
): Promise<VideoOperationStatus> {
  const intervalMs = options?.intervalMs ?? 4000;
  const maxWaitMs = options?.maxWaitMs ?? 15 * 60 * 1000;
  const signal = options?.signal;
  const start = performance.now();

  for (;;) {
    if (signal?.aborted) {
      throw new Error("処理が中断されました");
    }
    if (performance.now() - start > maxWaitMs) {
      throw new Error(
        "動画生成の待機がタイムアウトしました。時間をおいて再度お試しください。"
      );
    }

    const opRes = await getVideoOperation(operationName, signal);
    if (!opRes.ok) {
      throw new Error(userFacingApiError(opRes.error));
    }
    const status = opRes.data;
    options?.onStatus?.(status);

    if (status.done) {
      if (status.error != null && status.error !== false) {
        throw new Error(
          `生成エラー: ${formatOperationError(status.error)}`
        );
      }
      if (!status.videoReady) {
        const rai = status.raiMediaFilteredCount;
        if (rai != null && rai > 0) {
          const reasons = status.raiMediaFilteredReasons;
          const detail =
            reasons !== undefined && reasons !== null
              ? ` 詳細: ${typeof reasons === "string" ? reasons : JSON.stringify(reasons)}`
              : "";
          throw new Error(
            `コンテンツがポリシーによりフィルタされました。${detail}`
          );
        }
        throw new Error(
          "動画データを取得できませんでした（ジョブは完了しています）。"
        );
      }
      return status;
    }

    await delay(intervalMs, signal);
  }
}
