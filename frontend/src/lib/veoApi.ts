import {
  apiResultBlob,
  apiResultJson,
  authorizedFetch,
  getApiBase,
  type ApiResult,
} from "./apiClient";
import { debugElapsedMs, debugLog } from "./debugLog";
import type { VideoJobStartBody, VideoOperationStatus } from "./veoTypes";

export type { ApiResult } from "./apiClient";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStartJobResponse(
  u: unknown
): u is { operationName: string } {
  if (!isRecord(u)) {
    return false;
  }
  return (
    typeof u.operationName === "string" && u.operationName.trim().length > 0
  );
}

function isVideoOperationStatus(u: unknown): u is VideoOperationStatus {
  if (!isRecord(u)) {
    return false;
  }
  if (typeof u.done !== "boolean") {
    return false;
  }
  if (typeof u.videoReady !== "boolean") {
    return false;
  }
  const op = u.operationName;
  if (op !== null && typeof op !== "string") {
    return false;
  }
  if (!("error" in u)) {
    return false;
  }
  const rai = u.raiMediaFilteredCount;
  if (rai !== null && typeof rai !== "number") {
    return false;
  }
  const mime = u.videoMimeType;
  if (mime !== null && typeof mime !== "string") {
    return false;
  }
  return true;
}

/**
 * Veo ジョブ開始 → operationName を返す
 */
export async function startVideoJob(
  body: VideoJobStartBody,
  signal?: AbortSignal
): Promise<ApiResult<{ operationName: string }>> {
  const t0 = performance.now();
  const apiBase = getApiBase();
  debugLog("veoApi", "POST /api/video/jobs 開始", {
    mode: body.mode,
    apiBase,
  });

  const fetchRes = await authorizedFetch(`${apiBase}/api/video/jobs`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });

  const jsonRes = await apiResultJson(fetchRes, isStartJobResponse);

  if (jsonRes.ok) {
    debugElapsedMs("POST /api/video/jobs", t0);
    debugLog("veoApi", "POST /api/video/jobs 成功", {
      operationName: jsonRes.data.operationName,
    });
  } else {
    debugElapsedMs("POST /api/video/jobs (失敗)", t0);
    debugLog("veoApi", "POST /api/video/jobs 失敗", { error: jsonRes.error });
  }

  return jsonRes;
}

/**
 * 長時間操作の状態取得（ポーリング用）
 */
export async function getVideoOperation(
  operationName: string,
  signal?: AbortSignal
): Promise<ApiResult<VideoOperationStatus>> {
  const apiBase = getApiBase();
  const q = encodeURIComponent(operationName);
  const fetchRes = await authorizedFetch(
    `${apiBase}/api/video/operations?name=${q}`,
    { signal }
  );
  return apiResultJson(fetchRes, isVideoOperationStatus);
}

/**
 * 完了済みジョブの動画をバイナリで取得
 */
export async function downloadGeneratedVideo(
  operationName: string,
  signal?: AbortSignal
): Promise<ApiResult<Blob>> {
  const t0 = performance.now();
  const apiBase = getApiBase();
  const q = encodeURIComponent(operationName);
  const fetchRes = await authorizedFetch(
    `${apiBase}/api/video/download?name=${q}`,
    { signal }
  );

  const blobRes = await apiResultBlob(fetchRes);

  if (blobRes.ok) {
    debugElapsedMs("GET /api/video/download", t0);
    debugLog("veoApi", "GET /api/video/download 成功", {
      size: blobRes.data.size,
      type: blobRes.data.type,
    });
  } else {
    debugElapsedMs("GET /api/video/download (失敗)", t0);
    debugLog("veoApi", "GET /api/video/download 失敗", {
      error: blobRes.error,
    });
  }

  return blobRes;
}
