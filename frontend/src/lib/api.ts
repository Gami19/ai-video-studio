import { debugElapsedMs, debugLog } from "./debugLog";

const API_BASE =
  import.meta.env.VITE_API_URL || "http://localhost:8787";

export interface AnalyzeResponse {
  analysis: string;
  prompt: string;
}

export interface GenerateResponse {
  imageBase64: string;
}

export interface ApiError {
  error: string;
  message?: string;
}

async function handleResponse<T>(res: Response): Promise<T> {
  const data = (await res.json().catch(() => ({}))) as T | ApiError;

  if (!res.ok) {
    const err = data as ApiError;
    throw new Error(err.error || err.message || `HTTP ${res.status}`);
  }

  return data as T;
}

/**
 * フレーム画像を Gemini で分析し、サムネイル生成用プロンプトを取得
 */
export async function analyzeFrames(
  frames: string[],
  userHint?: string
): Promise<AnalyzeResponse> {
  const t0 = performance.now();
  debugLog("api", "POST /api/analyze: リクエスト開始", {
    frameCount: frames.length,
    hasUserHint: Boolean(userHint?.trim()),
    apiBase: API_BASE,
  });

  try {
    const res = await fetch(`${API_BASE}/api/analyze`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ frames, userHint }),
    });

    const data = await handleResponse<AnalyzeResponse>(res);
    debugElapsedMs("POST /api/analyze", t0);
    debugLog("api", "POST /api/analyze: 成功", {
      analysisPreview: data.analysis.slice(0, 120),
      promptPreview: data.prompt.slice(0, 120),
    });
    return data;
  } catch (e) {
    debugElapsedMs("POST /api/analyze (失敗)", t0);
    debugLog("api", "POST /api/analyze: 失敗", { message: String(e) });
    throw e;
  }
}

/**
 * プロンプトからサムネイル画像を生成
 */
export async function generateThumbnail(
  prompt: string
): Promise<GenerateResponse> {
  const t0 = performance.now();
  debugLog("api", "POST /api/generate: リクエスト開始", {
    promptLength: prompt.length,
    apiBase: API_BASE,
  });

  try {
    const res = await fetch(`${API_BASE}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt }),
    });

    const data = await handleResponse<GenerateResponse>(res);
    debugElapsedMs("POST /api/generate", t0);
    debugLog("api", "POST /api/generate: 成功", {
      imageBase64Length: data.imageBase64.length,
    });
    return data;
  } catch (e) {
    debugElapsedMs("POST /api/generate (失敗)", t0);
    debugLog("api", "POST /api/generate: 失敗", { message: String(e) });
    throw e;
  }
}
