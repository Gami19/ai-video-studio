import { debugElapsedMs, debugLog } from "./debugLog";
import type { VideoJobStartBody, VideoOperationStatus } from "./veoTypes";

const API_BASE =
  import.meta.env.VITE_API_URL || "http://localhost:8787";

export interface ApiErrorBody {
  error: string;
  message?: string;
  details?: unknown;
  raiMediaFilteredReasons?: unknown;
}

async function handleJsonResponse<T>(res: Response): Promise<T> {
  const data = (await res.json().catch(() => ({}))) as T | ApiErrorBody;

  if (!res.ok) {
    const err = data as ApiErrorBody;
    throw new Error(err.error || err.message || `HTTP ${res.status}`);
  }

  return data as T;
}

/**
 * Veo ジョブ開始 → operationName を返す
 */
export async function startVideoJob(
  body: VideoJobStartBody,
  signal?: AbortSignal
): Promise<{ operationName: string }> {
  const t0 = performance.now();
  debugLog("veoApi", "POST /api/video/jobs 開始", {
    mode: body.mode,
    apiBase: API_BASE,
  });

  try {
    const res = await fetch(`${API_BASE}/api/video/jobs`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });
    const data = await handleJsonResponse<{ operationName: string }>(res);
    if (!data.operationName?.trim()) {
      throw new Error("operationName が返されませんでした");
    }
    debugElapsedMs("POST /api/video/jobs", t0);
    debugLog("veoApi", "POST /api/video/jobs 成功", {
      operationName: data.operationName,
    });
    return data;
  } catch (e) {
    debugElapsedMs("POST /api/video/jobs (失敗)", t0);
    debugLog("veoApi", "POST /api/video/jobs 失敗", { message: String(e) });
    throw e;
  }
}

/**
 * 長時間操作の状態取得（ポーリング用）
 */
export async function getVideoOperation(
  operationName: string,
  signal?: AbortSignal
): Promise<VideoOperationStatus> {
  const q = encodeURIComponent(operationName);
  const res = await fetch(`${API_BASE}/api/video/operations?name=${q}`, {
    signal,
  });
  return handleJsonResponse<VideoOperationStatus>(res);
}

/**
 * 完了済みジョブの動画をバイナリで取得
 */
export async function downloadGeneratedVideo(
  operationName: string,
  signal?: AbortSignal
): Promise<Blob> {
  const t0 = performance.now();
  const q = encodeURIComponent(operationName);
  const res = await fetch(`${API_BASE}/api/video/download?name=${q}`, {
    signal,
  });

  if (res.ok) {
    const blob = await res.blob();
    debugElapsedMs("GET /api/video/download", t0);
    debugLog("veoApi", "GET /api/video/download 成功", {
      size: blob.size,
      type: blob.type,
    });
    return blob;
  }

  const data = (await res.json().catch(() => ({}))) as ApiErrorBody;
  const msg = data.error || data.message || `HTTP ${res.status}`;
  debugElapsedMs("GET /api/video/download (失敗)", t0);
  debugLog("veoApi", "GET /api/video/download 失敗", { message: msg });
  throw new Error(msg);
}
