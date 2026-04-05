import {
  apiResultJson,
  authorizedFetch,
  getApiBase,
  type ApiResult,
} from "./apiClient";
import { debugElapsedMs, debugLog } from "./debugLog";

export type { ApiResult } from "./apiClient";

export interface AnalyzeResponse {
  analysis: string;
  prompt: string;
}

export interface GenerateResponse {
  imageBase64: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isAnalyzeResponse(u: unknown): u is AnalyzeResponse {
  if (!isRecord(u)) {
    return false;
  }
  return typeof u.analysis === "string" && typeof u.prompt === "string";
}

function isGenerateResponse(u: unknown): u is GenerateResponse {
  if (!isRecord(u)) {
    return false;
  }
  return typeof u.imageBase64 === "string";
}

/**
 * フレーム画像を Gemini で分析し、サムネイル生成用プロンプトを取得
 */
export async function analyzeFrames(
  frames: string[],
  userHint?: string
): Promise<ApiResult<AnalyzeResponse>> {
  const t0 = performance.now();
  const apiBase = getApiBase();
  debugLog("api", "POST /api/analyze: リクエスト開始", {
    frameCount: frames.length,
    hasUserHint: Boolean(userHint?.trim()),
    apiBase,
  });

  const fetchRes = await authorizedFetch(`${apiBase}/api/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ frames, userHint }),
  });

  const jsonRes = await apiResultJson(fetchRes, isAnalyzeResponse);

  if (jsonRes.ok) {
    debugElapsedMs("POST /api/analyze", t0);
    debugLog("api", "POST /api/analyze: 成功", {
      analysisPreview: jsonRes.data.analysis.slice(0, 120),
      promptPreview: jsonRes.data.prompt.slice(0, 120),
    });
  } else {
    debugElapsedMs("POST /api/analyze (失敗)", t0);
    debugLog("api", "POST /api/analyze: 失敗", { error: jsonRes.error });
  }

  return jsonRes;
}

/**
 * プロンプトからサムネイル画像を生成
 */
export async function generateThumbnail(
  prompt: string
): Promise<ApiResult<GenerateResponse>> {
  const t0 = performance.now();
  const apiBase = getApiBase();
  debugLog("api", "POST /api/generate: リクエスト開始", {
    promptLength: prompt.length,
    apiBase,
  });

  const fetchRes = await authorizedFetch(`${apiBase}/api/generate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ prompt }),
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
