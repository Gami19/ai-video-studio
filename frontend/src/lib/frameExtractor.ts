import { debugElapsedMs, debugLog } from "./debugLog";

const DEFAULT_FRAME_COUNT = 4;
const MIN_FRAME_COUNT = 3;
const MAX_FRAME_COUNT = 5;
/** 長辺の上限（px）。Canvas 描画負荷と API ペイロードを抑える */
const MAX_CANVAS_LONG_EDGE = 1280;
const JPEG_QUALITY = 0.85;

export type ExtractStage = "loading_metadata" | "extracting";

/**
 * HTMLVideoElement を指定秒へシークし、seeked を待つ
 */
function seekTo(video: HTMLVideoElement, timeSec: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const safeTime = Math.min(
      Math.max(0, timeSec),
      Math.max(0, video.duration - 0.05)
    );

    const onSeeked = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error("動画のシークに失敗しました"));
    };
    const cleanup = () => {
      video.removeEventListener("seeked", onSeeked);
      video.removeEventListener("error", onError);
    };

    video.addEventListener("seeked", onSeeked);
    video.addEventListener("error", onError);
    video.currentTime = safeTime;
  });
}

/**
 * 動画から均等にフレームを抽出し、base64 文字列配列で返す。
 * ブラウザのネイティブデコーダ + Canvas で描画（ffmpeg.wasm は使わない）。
 */
export async function extractFrames(
  videoFile: File,
  frameCount: number = DEFAULT_FRAME_COUNT,
  hooks?: {
    onStageChange?: (stage: ExtractStage) => void;
    /** 0〜1 の進捗（抽出枚数ベース） */
    onProgress?: (progress: number) => void;
  }
): Promise<string[]> {
  const count = Math.min(
    MAX_FRAME_COUNT,
    Math.max(MIN_FRAME_COUNT, frameCount)
  );

  const url = URL.createObjectURL(videoFile);
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "metadata";
  video.src = url;

  const tAll = performance.now();

  try {
    hooks?.onStageChange?.("loading_metadata");
    debugLog("frameExtractor", "Canvas 抽出: メタデータ待ち", {
      name: videoFile.name,
      sizeBytes: videoFile.size,
      type: videoFile.type,
    });

    await new Promise<void>((resolve, reject) => {
      if (video.readyState >= HTMLMediaElement.HAVE_METADATA) {
        resolve();
        return;
      }
      const onErr = () =>
        reject(new Error("動画のメタデータを読み込めませんでした"));
      video.addEventListener("loadedmetadata", () => resolve(), { once: true });
      video.addEventListener("error", onErr, { once: true });
    });

    const duration = video.duration;
    if (!Number.isFinite(duration) || duration <= 0) {
      throw new Error("動画の長さを取得できませんでした");
    }

    debugElapsedMs("Canvas メタデータ", tAll);

    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Canvas が利用できません");
    }

    const w = video.videoWidth;
    const h = video.videoHeight;
    if (w <= 0 || h <= 0) {
      throw new Error("動画の解像度を取得できませんでした");
    }

    const scale = Math.min(1, MAX_CANVAS_LONG_EDGE / Math.max(w, h));
    canvas.width = Math.round(w * scale);
    canvas.height = Math.round(h * scale);

    hooks?.onStageChange?.("extracting");
    debugLog("frameExtractor", "Canvas 抽出: シーク＆描画開始", {
      durationSec: duration,
      frameCount: count,
      canvasSize: `${canvas.width}x${canvas.height}`,
    });

    const timestamps = Array.from({ length: count }, (_, i) =>
      (duration / (count + 1)) * (i + 1)
    );

    const frames: string[] = [];
    const tExtract = performance.now();

    for (let i = 0; i < timestamps.length; i++) {
      await seekTo(video, timestamps[i]);
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      const base64 = canvas
        .toDataURL("image/jpeg", JPEG_QUALITY)
        .replace(/^data:image\/jpeg;base64,/, "");
      frames.push(base64);
      hooks?.onProgress?.((i + 1) / count);
    }

    debugElapsedMs("Canvas 抽出ループ", tExtract);
    debugElapsedMs("Canvas 抽出 合計", tAll);

    debugLog("frameExtractor", "extractFrames: 完了", {
      frameCount: frames.length,
      approxTotalBase64Chars: frames.reduce((n, f) => n + f.length, 0),
    });

    return frames;
  } finally {
    URL.revokeObjectURL(url);
    video.removeAttribute("src");
    video.load();
  }
}
