import { useState } from "react";
import { extractFrames } from "../lib/frameExtractor";
import { debugLog } from "../lib/debugLog";
import type {
  ThumbnailBlocksPayload,
  ThumbnailHero,
  ThumbnailTone,
} from "../types/thumbnailBlocks";

export type UploadStatus =
  | "idle"
  | "loading_metadata"
  | "extracting"
  | "extracted"
  | "error";

export type ThumbnailAnalyzePayload = {
  frames: string[];
  userHint?: string;
  thumbnailBlocks?: ThumbnailBlocksPayload;
};

interface VideoUploaderProps {
  onAnalyze: (payload: ThumbnailAnalyzePayload) => void;
  onReset?: () => void;
  disabled?: boolean;
}

const HERO_OPTIONS: { value: ThumbnailHero; label: string }[] = [
  { value: "face", label: "顔・人物" },
  { value: "screen", label: "画面・UI" },
  { value: "product", label: "モノ・商品" },
  { value: "comparison", label: "比較（並べ）" },
  { value: "scene", label: "風景・場面" },
  { value: "other", label: "その他" },
];

const TONE_OPTIONS: { value: ThumbnailTone; label: string }[] = [
  { value: "bright", label: "明るい" },
  { value: "calm", label: "落ち着いた" },
  { value: "high_contrast", label: "はっきり・コントラスト強め" },
  { value: "dark", label: "ダーク・シネマ" },
  { value: "warm", label: "暖かいトーン" },
  { value: "cool", label: "クール・清涼" },
  { value: "minimal", label: "ミニマル" },
];

function buildThumbnailBlocks(input: {
  mainMessage: string;
  hero: string;
  heroNote: string;
  tone: string;
  toneNote: string;
  overlayTextJa: string;
  noOverlayText: boolean;
  videoTitle: string;
  avoid: string;
}): ThumbnailBlocksPayload | undefined {
  const o: ThumbnailBlocksPayload = {};

  const mm = input.mainMessage.trim();
  if (mm) o.mainMessage = mm;

  if (input.hero && HERO_OPTIONS.some((h) => h.value === input.hero)) {
    o.hero = input.hero as ThumbnailHero;
  }

  const hn = input.heroNote.trim();
  if (hn) o.heroNote = hn;

  if (input.tone && TONE_OPTIONS.some((t) => t.value === input.tone)) {
    o.tone = input.tone as ThumbnailTone;
  }

  const tn = input.toneNote.trim();
  if (tn) o.toneNote = tn;

  if (input.noOverlayText) {
    o.overlayTextJa = null;
  } else {
    const ot = input.overlayTextJa.trim();
    if (ot) o.overlayTextJa = ot;
  }

  const vt = input.videoTitle.trim();
  if (vt) o.videoTitle = vt;

  const av = input.avoid.trim();
  if (av) o.avoid = av;

  return Object.keys(o).length > 0 ? o : undefined;
}

export function VideoUploader({
  onAnalyze,
  onReset,
  disabled = false,
}: VideoUploaderProps) {
  const [uploadStatus, setUploadStatus] = useState<UploadStatus>("idle");
  const [frames, setFrames] = useState<string[]>([]);
  const [userHint, setUserHint] = useState("");
  const [mainMessage, setMainMessage] = useState("");
  const [hero, setHero] = useState("");
  const [heroNote, setHeroNote] = useState("");
  const [tone, setTone] = useState("");
  const [toneNote, setToneNote] = useState("");
  const [overlayTextJa, setOverlayTextJa] = useState("");
  const [noOverlayText, setNoOverlayText] = useState(false);
  const [videoTitle, setVideoTitle] = useState("");
  const [avoid, setAvoid] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [extractProgress, setExtractProgress] = useState<number>(0);

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

  const handleAnalyzeClick = () => {
    if (frames.length > 0) {
      const thumbnailBlocks = buildThumbnailBlocks({
        mainMessage,
        hero,
        heroNote,
        tone,
        toneNote,
        overlayTextJa,
        noOverlayText,
        videoTitle,
        avoid,
      });
      onAnalyze({
        frames,
        userHint: userHint.trim() || undefined,
        thumbnailBlocks,
      });
    }
  };

  const handleReset = () => {
    setFrames([]);
    setUserHint("");
    setMainMessage("");
    setHero("");
    setHeroNote("");
    setTone("");
    setToneNote("");
    setOverlayTextJa("");
    setNoOverlayText(false);
    setVideoTitle("");
    setAvoid("");
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
              ヒント（任意）: 補足したいこと
            </label>
            <textarea
              id="user-hint"
              value={userHint}
              onChange={(e) => setUserHint(e.target.value)}
              placeholder="ブロックで指定しきれないことを自由に入力（ブロック優先で解釈されます）"
              rows={2}
              className="video-uploader__hint-input"
              maxLength={500}
            />
          </div>

          <details className="video-uploader__details">
            <summary className="video-uploader__details-summary">
              詳細を指定（任意）
            </summary>
            <div className="video-uploader__blocks">
              <label className="video-uploader__block-label" htmlFor="tb-main">
                一番伝えたいこと
              </label>
              <input
                id="tb-main"
                type="text"
                value={mainMessage}
                onChange={(e) => setMainMessage(e.target.value)}
                maxLength={120}
                className="video-uploader__block-input"
              />

              <label className="video-uploader__block-label" htmlFor="tb-hero">
                サムネの主役
              </label>
              <select
                id="tb-hero"
                value={hero}
                onChange={(e) => setHero(e.target.value)}
                className="video-uploader__block-select"
              >
                <option value="">（指定なし）</option>
                {HERO_OPTIONS.map((h) => (
                  <option key={h.value} value={h.value}>
                    {h.label}
                  </option>
                ))}
              </select>

              <label className="video-uploader__block-label" htmlFor="tb-hero-note">
                主役の補足
              </label>
              <input
                id="tb-hero-note"
                type="text"
                value={heroNote}
                onChange={(e) => setHeroNote(e.target.value)}
                maxLength={120}
                className="video-uploader__block-input"
              />

              <label className="video-uploader__block-label" htmlFor="tb-tone">
                雰囲気・トーン
              </label>
              <select
                id="tb-tone"
                value={tone}
                onChange={(e) => setTone(e.target.value)}
                className="video-uploader__block-select"
              >
                <option value="">（指定なし）</option>
                {TONE_OPTIONS.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>

              <label className="video-uploader__block-label" htmlFor="tb-tone-note">
                トーンの補足
              </label>
              <input
                id="tb-tone-note"
                type="text"
                value={toneNote}
                onChange={(e) => setToneNote(e.target.value)}
                maxLength={120}
                className="video-uploader__block-input"
              />

              <label className="video-uploader__block-check">
                <input
                  type="checkbox"
                  checked={noOverlayText}
                  onChange={(e) => setNoOverlayText(e.target.checked)}
                />
                画像内に文字を入れない
              </label>
              <label className="video-uploader__block-label" htmlFor="tb-overlay">
                載せたい短い文字（日本語）
              </label>
              <input
                id="tb-overlay"
                type="text"
                value={overlayTextJa}
                onChange={(e) => setOverlayTextJa(e.target.value)}
                maxLength={40}
                disabled={noOverlayText}
                className="video-uploader__block-input"
              />

              <label className="video-uploader__block-label" htmlFor="tb-title">
                動画タイトル（任意・参考）
              </label>
              <input
                id="tb-title"
                type="text"
                value={videoTitle}
                onChange={(e) => setVideoTitle(e.target.value)}
                maxLength={200}
                className="video-uploader__block-input"
              />

              <label className="video-uploader__block-label" htmlFor="tb-avoid">
                入れたくないもの・注意
              </label>
              <textarea
                id="tb-avoid"
                value={avoid}
                onChange={(e) => setAvoid(e.target.value)}
                maxLength={300}
                rows={2}
                className="video-uploader__hint-input"
              />
            </div>
          </details>

          <div className="video-uploader__actions">
            <button
              type="button"
              onClick={handleAnalyzeClick}
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
