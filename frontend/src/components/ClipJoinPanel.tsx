import { useCallback, useEffect, useState } from "react";
import { getVideoDurationSec } from "../lib/videoMetadata";
import { renderClipJoinToMp4 } from "../lib/clipMontageMp4";
import {
  buildDefaultClipJoinSegments,
  DEFAULT_RENDER_OUTPUT,
} from "../lib/timelineSpec";
import {
  getWebCodecsCapability,
  webCodecsSupportSummary,
} from "../lib/webCodecsSupport";
import { debugLog } from "../lib/debugLog";

const MAX_CLIPS = 5;

type ClipRow = {
  id: string;
  file: File;
  durationSec: number;
  status: "pending" | "extracting" | "ready" | "error";
  error?: string;
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

export function ClipJoinPanel() {
  const [rows, setRows] = useState<ClipRow[]>([]);
  const [step, setStep] = useState<"idle" | "extracting" | "encoding">("idle");
  const [error, setError] = useState<string | null>(null);
  const [encodeProgress, setEncodeProgress] = useState(0);
  const [wcMsg, setWcMsg] = useState<string>("");

  useEffect(() => {
    void getWebCodecsCapability().then((c) => {
      setWcMsg(webCodecsSupportSummary(c));
    });
  }, []);

  const handleFiles = useCallback(async (files: FileList | null) => {
    if (!files?.length) return;
    setError(null);
    const list = [...files].slice(0, MAX_CLIPS);
    const initial: ClipRow[] = list.map((file, i) => ({
      id: `clip-${i + 1}`,
      file,
      durationSec: 0,
      status: "pending",
    }));
    setRows(initial);
    setStep("extracting");

    for (let i = 0; i < initial.length; i += 1) {
      const file = initial[i].file;
      try {
        const durationSec = await getVideoDurationSec(file);
        setRows((prev) => {
          const next = [...prev];
          const idx = next.findIndex((r) => r.file === file);
          if (idx >= 0) {
            next[idx] = {
              ...next[idx],
              durationSec,
              status: "ready",
            };
          }
          return next;
        });
      } catch (e) {
        const msg = e instanceof Error ? e.message : "抽出に失敗しました";
        setRows((prev) => {
          const next = [...prev];
          const idx = next.findIndex((r) => r.file === file);
          if (idx >= 0) {
            next[idx] = { ...next[idx], status: "error", error: msg };
          }
          return next;
        });
      }
    }
    setStep("idle");
  }, []);

  const readyRows = rows.filter((r) => r.status === "ready");

  const handleEncode = async () => {
    if (readyRows.length < 2 || step !== "idle") return;
    setError(null);
    setStep("encoding");
    setEncodeProgress(0);
    try {
      const filesById = new Map<string, File>();
      const durById = new Map<string, number>();
      const idsInOrder = readyRows.map((r) => r.id);
      for (const r of readyRows) {
        filesById.set(r.id, r.file);
        durById.set(r.id, r.durationSec);
      }
      const items = buildDefaultClipJoinSegments(idsInOrder, durById);
      const buf = await renderClipJoinToMp4({
        output: DEFAULT_RENDER_OUTPUT,
        items,
        filesById,
        clipDurationSecById: durById,
        onProgress: setEncodeProgress,
      });
      downloadArrayBuffer(buf, `clip-join-${Date.now()}.mp4`);
      debugLog("ClipJoinPanel", "エンコード完了", { clipCount: readyRows.length });
    } catch (e) {
      setError(e instanceof Error ? e.message : "エンコードに失敗しました");
    } finally {
      setStep("idle");
    }
  };

  const disabledEncode = readyRows.length < 2 || step !== "idle" || wcMsg !== "";

  return (
    <div className="phase2-panel">
      <h2 className="phase2-panel__title">動画をつなぐ（クロスフェード）</h2>
      <p className="phase2-panel__desc">
        H.264 の MP4 を 2〜{MAX_CLIPS}
        本まで選び、アップロード順に全尺でつなぎ、クリップ間はクロスフェード（約
        0.45 秒）します。ブラウザ内で無音 MP4 を書き出します。
      </p>

      {wcMsg ? (
        <div className="phase2-panel__warn" role="alert">
          {wcMsg}
        </div>
      ) : null}

      <label className="phase2-panel__file">
        <span>動画を選択（複数可）</span>
        <input
          type="file"
          accept="video/*,.mp4"
          multiple
          onChange={(e) => void handleFiles(e.target.files)}
          disabled={step === "extracting"}
        />
      </label>

      {rows.length > 0 && (
        <ul className="phase2-panel__list">
          {rows.map((r) => (
            <li key={r.id}>
              <strong>{r.id}</strong> — {r.file.name}{" "}
              {r.status === "extracting" && "（抽出中…）"}
              {r.status === "ready" &&
                `（${r.durationSec.toFixed(2)} 秒）`}
              {r.status === "error" && (
                <span className="phase2-panel__err"> — {r.error}</span>
              )}
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

      {(step === "extracting" || step === "encoding") && (
        <p className="phase2-panel__status">
          {step === "extracting" && "フレーム抽出中…"}
          {step === "encoding" &&
            `エンコード中… ${Math.round(encodeProgress * 100)}%`}
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
