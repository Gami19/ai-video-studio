import { useCallback, useEffect, useState } from "react";
import { renderImageSlideshowToMp4 } from "../lib/imageSlideshowMp4";
import {
  buildDefaultSlideshowSlides,
  DEFAULT_RENDER_OUTPUT,
} from "../lib/timelineSpec";
import {
  getWebCodecsCapability,
  webCodecsSupportSummary,
} from "../lib/webCodecsSupport";
import { debugLog } from "../lib/debugLog";

const MAX_IMAGES = 12;

type ImageRow = {
  id: string;
  file: File;
};

function downloadArrayBuffer(buf: ArrayBuffer, filename: string): void {
  const blob = new Blob([buf], { type: "video/mp4" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function ImageSlideshowPanel() {
  const [rows, setRows] = useState<ImageRow[]>([]);
  const [step, setStep] = useState<"idle" | "encoding">("idle");
  const [error, setError] = useState<string | null>(null);
  const [encodeProgress, setEncodeProgress] = useState(0);
  const [wcMsg, setWcMsg] = useState<string>("");

  useEffect(() => {
    void getWebCodecsCapability().then((c) => {
      const msg = webCodecsSupportSummary(c);
      if (!c.videoEncoder || !c.avcEncode) {
        setWcMsg(msg);
      } else {
        setWcMsg("");
      }
    });
  }, []);

  const handleFiles = useCallback((files: FileList | null) => {
    if (!files?.length) return;
    setError(null);
    const list = [...files].slice(0, MAX_IMAGES);
    setRows(
      list.map((file, i) => ({
        id: `img-${i + 1}`,
        file,
      }))
    );
  }, []);

  const handleEncode = async () => {
    if (rows.length < 2 || step !== "idle") return;
    setError(null);
    setStep("encoding");
    setEncodeProgress(0);
    try {
      const filesById = new Map<string, File>();
      const idsInOrder = rows.map((r) => r.id);
      for (const r of rows) {
        filesById.set(r.id, r.file);
      }
      const items = buildDefaultSlideshowSlides(idsInOrder);
      const buf = await renderImageSlideshowToMp4({
        output: DEFAULT_RENDER_OUTPUT,
        items,
        filesById,
        onProgress: setEncodeProgress,
      });
      downloadArrayBuffer(buf, `slideshow-${Date.now()}.mp4`);
      debugLog("ImageSlideshowPanel", "エンコード完了", {
        imageCount: rows.length,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "エンコードに失敗しました");
    } finally {
      setStep("idle");
    }
  };

  const wcEncodeMsg =
    wcMsg ||
    (typeof VideoEncoder === "undefined"
      ? "VideoEncoder が利用できません。"
      : "");

  const disabledEncode =
    rows.length < 2 || step !== "idle" || wcEncodeMsg !== "";

  return (
    <div className="phase2-panel">
      <h2 className="phase2-panel__title">画像スライドショー</h2>
      <p className="phase2-panel__desc">
        複数枚の画像を選び、アップロード順に各 3 秒・演出なしでつないだ無音 MP4
        を書き出します（画像デコードのみのため、VideoDecoder 非対応環境でもエンコードを試せます）。
      </p>

      {wcEncodeMsg ? (
        <div className="phase2-panel__warn" role="alert">
          {wcEncodeMsg}
        </div>
      ) : null}

      <label className="phase2-panel__file">
        <span>画像を選択（複数可）</span>
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          onChange={(e) => handleFiles(e.target.files)}
          disabled={step === "encoding"}
        />
      </label>

      {rows.length > 0 && (
        <ul className="phase2-panel__list">
          {rows.map((r) => (
            <li key={r.id}>
              <strong>{r.id}</strong> — {r.file.name}
            </li>
          ))}
        </ul>
      )}

      <div className="phase2-panel__actions">
        <button
          type="button"
          className="phase2-panel__primary"
          disabled={disabledEncode}
          onClick={() => void handleEncode()}
        >
          MP4 を生成してダウンロード
        </button>
      </div>

      {step === "encoding" && (
        <p className="phase2-panel__status">
          エンコード中… {Math.round(encodeProgress * 100)}%
        </p>
      )}

      {error && (
        <div className="phase2-panel__error" role="alert">
          {error}
        </div>
      )}
    </div>
  );
}
