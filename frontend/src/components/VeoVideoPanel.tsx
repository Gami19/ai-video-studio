import { useCallback, useEffect, useRef, useState } from "react";
import { downloadGeneratedVideo, startVideoJob } from "../lib/veoApi";
import { readImageFileForVeoJob } from "../lib/veoImageFile";
import { pollVeoUntilVideoReady } from "../lib/veoPoll";
import type { VideoJobConfig } from "../lib/veoTypes";
import { debugLog } from "../lib/debugLog";

type Phase =
  | "idle"
  | "starting"
  | "polling"
  | "downloading"
  | "done"
  | "error";

export function VeoVideoPanel() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [prompt, setPrompt] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [aspectRatio, setAspectRatio] = useState<"" | "16:9" | "9:16">("");
  const [resolution, setResolution] = useState<"" | "720p" | "1080p" | "4k">(
    ""
  );
  const [durationSeconds, setDurationSeconds] = useState<"" | "4" | "6" | "8">(
    ""
  );
  const [statusLine, setStatusLine] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [lastOperationName, setLastOperationName] = useState<string | null>(
    null
  );

  const abortRef = useRef<AbortController | null>(null);
  const previewUrlRef = useRef<string | null>(null);

  const revokePreview = useCallback(() => {
    const u = previewUrlRef.current;
    if (u) {
      URL.revokeObjectURL(u);
      previewUrlRef.current = null;
    }
    setPreviewUrl(null);
  }, []);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      revokePreview();
    };
  }, [revokePreview]);

  const busy =
    phase === "starting" || phase === "polling" || phase === "downloading";

  const buildConfig = (): VideoJobConfig | undefined => {
    const c: VideoJobConfig = {};
    if (aspectRatio) {
      c.aspectRatio = aspectRatio;
    }
    if (resolution) {
      c.resolution = resolution;
    }
    if (durationSeconds) {
      c.durationSeconds = Number(durationSeconds) as 4 | 6 | 8;
    }
    return Object.keys(c).length > 0 ? c : undefined;
  };

  const handleStart = async () => {
    if (!file || !prompt.trim()) {
      setError("開始画像とプロンプトを入力してください");
      return;
    }

    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    const { signal } = ac;

    setError(null);
    revokePreview();
    setLastOperationName(null);
    setStatusLine("ジョブを開始しています…");
    setPhase("starting");

    try {
      const { imageBase64, imageMimeType } = await readImageFileForVeoJob(file);
      const config = buildConfig();

      const { operationName } = await startVideoJob(
        {
          mode: "image_prompt",
          prompt: prompt.trim(),
          imageBase64,
          imageMimeType,
          ...(config ? { config } : {}),
        },
        signal
      );

      setLastOperationName(operationName);
      setPhase("polling");
      setStatusLine("サーバで動画を生成中です。しばらくお待ちください…");

      await pollVeoUntilVideoReady(operationName, {
        signal,
        onStatus: (s) => {
          const done = s.done ? "完了処理中" : "生成中";
          setStatusLine(
            `${done}（${s.videoReady ? "動画準備済み" : "処理待ち"}）`
          );
        },
      });

      setPhase("downloading");
      setStatusLine("動画をダウンロードしています…");

      const blob = await downloadGeneratedVideo(operationName, signal);
      revokePreview();
      const url = URL.createObjectURL(blob);
      previewUrlRef.current = url;
      setPreviewUrl(url);
      setPhase("done");
      setStatusLine("完了しました。");
      debugLog("VeoVideoPanel", "フロー完了", {
        operationName,
        blobSize: blob.size,
      });
    } catch (e) {
      const msg =
        e instanceof Error ? e.message : "予期しないエラーが発生しました";
      if (msg === "処理が中断されました") {
        setPhase("idle");
        setStatusLine("");
        return;
      }
      setError(msg);
      setPhase("error");
      setStatusLine("");
      debugLog("VeoVideoPanel", "フロー失敗", { message: msg });
    }
  };

  const handleReset = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setPhase("idle");
    setError(null);
    setStatusLine("");
    setLastOperationName(null);
    revokePreview();
  };

  return (
    <div className="phase2-panel veo-panel">
      <h2 className="phase2-panel__title">Veo 動画生成（開始画像）</h2>
      <p className="phase2-panel__desc">
        Worker 経由でジョブを開始し、状態をポーリングしてから MP4
        を取得します。API キーはブラウザに送られません。
      </p>

      <div className="phase2-panel__warn" role="note">
        生成には数分かかることがあります。このタブを閉じると進捗表示は失われます（ジョブ自体はサーバ側で継続する場合があります）。
      </div>

      <div className="phase2-panel__file">
        <span>開始画像（JPEG / PNG / WebP、1 枚あたり 8MB 目安）</span>
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          disabled={busy}
          onChange={(e) => {
            const f = e.target.files?.[0] ?? null;
            setFile(f);
          }}
        />
      </div>

      <label className="phase2-panel__hint">
        <span>プロンプト</span>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          disabled={busy}
          placeholder="例: カメラがゆっくりパンし、光が差し込む"
          rows={3}
        />
      </label>

      <div className="veo-panel__options">
        <label className="veo-panel__select-label">
          アスペクト比（任意）
          <select
            value={aspectRatio}
            onChange={(e) =>
              setAspectRatio(e.target.value as typeof aspectRatio)
            }
            disabled={busy}
          >
            <option value="">既定</option>
            <option value="16:9">16:9</option>
            <option value="9:16">9:16</option>
          </select>
        </label>
        <label className="veo-panel__select-label">
          解像度（任意）
          <select
            value={resolution}
            onChange={(e) => setResolution(e.target.value as typeof resolution)}
            disabled={busy}
          >
            <option value="">既定</option>
            <option value="720p">720p</option>
            <option value="1080p">1080p</option>
            <option value="4k">4k</option>
          </select>
        </label>
        <label className="veo-panel__select-label">
          長さ（秒・任意）
          <select
            value={durationSeconds}
            onChange={(e) =>
              setDurationSeconds(e.target.value as typeof durationSeconds)
            }
            disabled={busy}
          >
            <option value="">既定</option>
            <option value="4">4</option>
            <option value="6">6</option>
            <option value="8">8</option>
          </select>
        </label>
      </div>

      <div className="phase2-panel__actions">
        <button
          type="button"
          className="phase2-panel__primary"
          disabled={busy || !file || !prompt.trim()}
          onClick={() => void handleStart()}
        >
          {busy ? "処理中…" : "生成を開始"}
        </button>
        <button
          type="button"
          className="video-uploader__reset"
          onClick={handleReset}
        >
          {busy ? "キャンセル" : "リセット"}
        </button>
      </div>

      {statusLine ? (
        <p className="phase2-panel__status" aria-live="polite">
          {statusLine}
        </p>
      ) : null}

      {lastOperationName && phase !== "idle" ? (
        <p className="phase2-panel__status veo-panel__opid">
          操作 ID（デバッグ用）:{" "}
          <code className="veo-panel__code">{lastOperationName}</code>
        </p>
      ) : null}

      {error ? <div className="phase2-panel__error">{error}</div> : null}

      {previewUrl ? (
        <div className="veo-panel__preview">
          <video
            className="veo-panel__video"
            src={previewUrl}
            controls
            playsInline
          />
          <a
            className="thumbnail-result__download"
            href={previewUrl}
            download={`veo-${Date.now()}.mp4`}
          >
            MP4 を保存
          </a>
        </div>
      ) : null}
    </div>
  );
}
