import { useState, useRef } from "react";
import { extractFrames } from "../lib/frameExtractor";
import { debugLog } from "../lib/debugLog";

export type UploadStatus =
  | "idle"
  | "loading_metadata"
  | "extracting"
  | "extracted"
  | "error";

interface VideoUploaderProps {
  onFramesExtracted: (frames: string[], userHint?: string) => void;
  onReset?: () => void;
  disabled?: boolean;
}

export function VideoUploader({
  onFramesExtracted,
  onReset,
  disabled = false,
}: VideoUploaderProps) {
  const [uploadStatus, setUploadStatus] = useState<UploadStatus>("idle");
  const [frames, setFrames] = useState<string[]>([]);
  const [userHint, setUserHint] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [extractProgress, setExtractProgress] = useState<number>(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError(null);
    setFrames([]);
    setExtractProgress(0);

    debugLog("VideoUploader", "ファイル選択", {
      name: file.name,
      sizeBytes: file.size,
      type: file.type,
    });

    try {
      setUploadStatus("loading_metadata");
      debugLog("VideoUploader", "状態: loading_metadata");

      const extracted = await extractFrames(
        file,
        4,
        {
          onStageChange: (stage) => {
            setUploadStatus(stage);
            debugLog("VideoUploader", `状態: ${stage}`);
          },
          onProgress: (progress) => {
            setExtractProgress(progress);
          },
        }
      );

      setFrames(extracted);
      setUploadStatus("extracted");
      debugLog("VideoUploader", "状態: extracted", { frameCount: extracted.length });
    } catch (err) {
      setUploadStatus("error");
      const message =
        err instanceof Error ? err.message : "フレーム抽出に失敗しました";
      setError(message);
      debugLog("VideoUploader", "エラー", {
        message,
        stack: err instanceof Error ? err.stack : undefined,
      });
    }

    e.target.value = "";
  };

  const handleAnalyze = () => {
    if (frames.length > 0) {
      onFramesExtracted(frames, userHint.trim() || undefined);
    }
  };

  const handleReset = () => {
    setFrames([]);
    setUserHint("");
    setError(null);
    setExtractProgress(0);
    setUploadStatus("idle");
    onReset?.();
  };

  const isExtracting =
    uploadStatus === "loading_metadata" || uploadStatus === "extracting";
  const isExtracted = uploadStatus === "extracted";

  return (
    <div className="video-uploader">
      {uploadStatus === "idle" && (
        <label
          className={`video-uploader__dropzone ${disabled ? "video-uploader__dropzone--disabled" : ""}`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="video/*"
            onChange={handleFileChange}
            disabled={disabled}
            className="video-uploader__input"
          />
          <span className="video-uploader__prompt">
            動画をドラッグ＆ドロップ、またはクリックして選択
          </span>
        </label>
      )}

      {isExtracting && (
        <div className="video-uploader__loading">
          <div className="video-uploader__spinner" aria-hidden />
          <p>
            {uploadStatus === "loading_metadata" &&
              "動画メタデータを読み込み中…"}
            {uploadStatus === "extracting" &&
              `フレームを抽出中… ${Math.round(extractProgress * 100)}%`}
          </p>
        </div>
      )}

      {uploadStatus === "error" && error && (
        <div className="video-uploader__error">
          <p>{error}</p>
          <button type="button" onClick={handleReset} className="video-uploader__retry">
            最初からやり直す
          </button>
        </div>
      )}

      {isExtracted && frames.length > 0 && (
        <div className="video-uploader__extracted">
          <p className="video-uploader__extracted-label">抽出したフレーム</p>
          <div className="video-uploader__frames">
            {frames.map((base64, i) => (
              <img
                key={i}
                src={`data:image/jpeg;base64,${base64}`}
                alt={`フレーム ${i + 1}`}
                className="video-uploader__frame"
              />
            ))}
          </div>
          <div className="video-uploader__hint">
            <label htmlFor="user-hint" className="video-uploader__hint-label">
              ヒント（任意）: サムネイルに含めたい要素を入力
            </label>
            <textarea
              id="user-hint"
              value={userHint}
              onChange={(e) => setUserHint(e.target.value)}
              placeholder="例: 赤い背景、大胆な文字"
              rows={2}
              className="video-uploader__hint-input"
              maxLength={500}
            />
          </div>
          <div className="video-uploader__actions">
            <button
              type="button"
              onClick={handleAnalyze}
              disabled={disabled}
              className="video-uploader__analyze"
            >
              分析を開始
            </button>
            <button
              type="button"
              onClick={handleReset}
              className="video-uploader__reset"
            >
              動画を変更
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
