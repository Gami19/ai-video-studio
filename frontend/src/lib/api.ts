import {
  apiResultJson,
  authorizedFetch,
  getApiBase,
  type ApiResult,
} from "./apiClient";
import { debugElapsedMs, debugLog } from "./debugLog";
import type { ThumbnailBlocksPayload } from "../types/thumbnailBlocks";

export type { ApiResult } from "./apiClient";
export type { ThumbnailBlocksPayload } from "../types/thumbnailBlocks";

export interface AnalyzeResponse {
  jobId: string;
  analysis: string;
}

export interface GenerateResponse {
  imageBase64: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function shouldLogApiBodyPreview(): boolean {
  return import.meta.env.VITE_LOG_API_BODY_PREVIEW === "true";
}

function isAnalyzeResponse(u: unknown): u is AnalyzeResponse {
  if (!isRecord(u)) {
    return false;
  }
  return (
    typeof u.jobId === "string" &&
    typeof u.analysis === "string"
  );
}

function isGenerateResponse(u: unknown): u is GenerateResponse {
  if (!isRecord(u)) {
    return false;
  }
  return typeof u.imageBase64 === "string";
}

export type AnalyzeFramesOptions = {
  userHint?: string;
  thumbnailBlocks?: ThumbnailBlocksPayload;
};

/**
 * フレーム画像を Gemini で分析し、ジョブ ID と日本語分析を取得（英語プロンプトはサーバのみ保持）
 */
export async function analyzeFrames(
  frames: string[],
  options?: AnalyzeFramesOptions
): Promise<ApiResult<AnalyzeResponse>> {
  const t0 = performance.now();
  const apiBase = getApiBase();
  const userHint = options?.userHint;
  const thumbnailBlocks = options?.thumbnailBlocks;
  debugLog("api", "POST /api/analyze: リクエスト開始", {
    frameCount: frames.length,
    hasUserHint: Boolean(userHint?.trim()),
    hasThumbnailBlocks: Boolean(
      thumbnailBlocks && Object.keys(thumbnailBlocks).length > 0
    ),
    apiBase,
  });

  const body: Record<string, unknown> = { frames };
  if (userHint !== undefined && userHint.trim() !== "") {
    body.userHint = userHint;
  }
  if (thumbnailBlocks !== undefined && Object.keys(thumbnailBlocks).length > 0) {
    body.thumbnailBlocks = thumbnailBlocks;
  }

  const fetchRes = await authorizedFetch(`${apiBase}/api/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const jsonRes = await apiResultJson(fetchRes, isAnalyzeResponse);

  if (jsonRes.ok) {
    debugElapsedMs("POST /api/analyze", t0);
    if (shouldLogApiBodyPreview()) {
      debugLog("api", "POST /api/analyze: 成功（プレビュー）", {
        jobId: jsonRes.data.jobId,
        analysisPreview: jsonRes.data.analysis.slice(0, 120),
      });
    } else {
      debugLog("api", "POST /api/analyze: 成功", {
        jobId: jsonRes.data.jobId,
      });
    }
  } else {
    debugElapsedMs("POST /api/analyze (失敗)", t0);
    debugLog("api", "POST /api/analyze: 失敗", { error: jsonRes.error });
  }

  return jsonRes;
}

/**
 * 保存済みジョブ ID からサムネイル画像を生成
 */
export async function generateThumbnail(
  jobId: string
): Promise<ApiResult<GenerateResponse>> {
  const t0 = performance.now();
  const apiBase = getApiBase();
  debugLog("api", "POST /api/generate: リクエスト開始", {
    jobId,
    apiBase,
  });

  const fetchRes = await authorizedFetch(`${apiBase}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jobId }),
  });

  const jsonRes = await apiResultJson(fetchRes, isGenerateResponse);

  if (jsonRes.ok) {
    debugElapsedMs("POST /api/generate", t0);
    debugLog("api", "POST /api/generate: 成功", {
      imageBase64Length: jsonRes.data.imageBase64.length,
    });
  } else {
    debugElapsedMs("POST /api/generate (失敗)", t0);
    debugLog("api", "POST /api/generate: 失敗", { error: jsonRes.error });
  }

  return jsonRes;
}
