import { useState } from "react";
import { VideoUploader } from "./components/VideoUploader";
import { ThumbnailResult } from "./components/ThumbnailResult";
import { ClipJoinPanel } from "./components/ClipJoinPanel";
import { ImageSlideshowPanel } from "./components/ImageSlideshowPanel";
import { VeoVideoPanel } from "./components/VeoVideoPanel";
import { analyzeFrames, generateThumbnail } from "./lib/api";
import { debugLog } from "./lib/debugLog";
import "./App.css";

type FlowStep =
  | "upload"
  | "analyzing"
  | "generating"
  | "done"
  | "error";

type MainTab = "thumbnail" | "veo" | "clip_join" | "image_show";

function App() {
  const [mainTab, setMainTab] = useState<MainTab>("thumbnail");
  const [step, setStep] = useState<FlowStep>("upload");
  const [imageBase64, setImageBase64] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleFramesExtracted = async (
    frames: string[],
    userHint?: string
  ) => {
    setError(null);

    try {
      setStep("analyzing");
      debugLog("App", "フロー: analyzing 開始", {
        frameCount: frames.length,
        hasUserHint: Boolean(userHint?.trim()),
      });

      const { prompt } = await analyzeFrames(frames, userHint);
      setStep("generating");
      debugLog("App", "フロー: generating 開始");

      const { imageBase64: img } = await generateThumbnail(prompt);
      setImageBase64(img);
      setStep("done");
      debugLog("App", "フロー: done");
    } catch (err) {
      setStep("error");
      const msg = err instanceof Error ? err.message : "エラーが発生しました";
      setError(msg);
      debugLog("App", "フロー: error", { message: msg });
    }
  };

  const handleRetry = () => {
    setStep("upload");
    setImageBase64(null);
    setError(null);
  };

  const handleReset = () => {
    setStep("upload");
    setImageBase64(null);
    setError(null);
  };

  const isLoading = step === "analyzing" || step === "generating";

  return (
    <div className="app-page">
      <header className="app-masthead" aria-labelledby="app-title">
        <div className="app-masthead__accent" aria-hidden />
        <h1 id="app-title" className="app-masthead__title">
          AI Video Studio
        </h1>
        <p className="app-masthead__lede">
          サムネイル・Veo 動画生成・動画の結合・画像スライドショーを、ひとつの画面から切り替えて利用できます。
        </p>
      </header>

      <nav
        className="app-tabs"
        role="tablist"
        aria-label="機能の切り替え"
      >
        <button
          type="button"
          role="tab"
          aria-selected={mainTab === "thumbnail"}
          className={
            mainTab === "thumbnail"
              ? "app-tabs__btn app-tabs__btn--active"
              : "app-tabs__btn"
          }
          onClick={() => setMainTab("thumbnail")}
        >
          サムネイル
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mainTab === "veo"}
          className={
            mainTab === "veo"
              ? "app-tabs__btn app-tabs__btn--active"
              : "app-tabs__btn"
          }
          onClick={() => setMainTab("veo")}
        >
          Veo 動画
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mainTab === "clip_join"}
          className={
            mainTab === "clip_join"
              ? "app-tabs__btn app-tabs__btn--active"
              : "app-tabs__btn"
          }
          onClick={() => setMainTab("clip_join")}
        >
          動画をつなぐ
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mainTab === "image_show"}
          className={
            mainTab === "image_show"
              ? "app-tabs__btn app-tabs__btn--active"
              : "app-tabs__btn"
          }
          onClick={() => setMainTab("image_show")}
        >
          画像スライド
        </button>
      </nav>

      <section
        className="app-section app-section--main"
        aria-label="メインコンテンツ"
      >

        {mainTab === "thumbnail" && (
          <>
            <h2 className="app-subtitle">AI サムネイル生成</h2>
            <p className="app-description app-description--sub">
              動画をアップロードすると、AI が内容を分析してサムネイルを生成します。
            </p>

            {step === "upload" && (
              <VideoUploader
                onFramesExtracted={handleFramesExtracted}
                onReset={handleReset}
                disabled={false}
              />
            )}

            {isLoading && (
              <div className="app-loading">
                <div className="app-loading__spinner" aria-hidden />
                <p>
                  {step === "analyzing"
                    ? "動画を分析中…"
                    : "サムネイルを生成中…"}
                </p>
              </div>
            )}

            {step === "done" && imageBase64 && (
              <div className="app-result">
                <h3 className="app-result__heading">生成されたサムネイル</h3>
                <ThumbnailResult imageBase64={imageBase64} />
                <button
                  type="button"
                  onClick={handleRetry}
                  className="app-result__retry"
                >
                  別の動画で試す
                </button>
              </div>
            )}

            {step === "error" && (
              <div className="app-error">
                <ThumbnailResult
                  error={error ?? undefined}
                  onRetry={handleRetry}
                />
              </div>
            )}
          </>
        )}

        {mainTab === "veo" && <VeoVideoPanel />}
        {mainTab === "clip_join" && <ClipJoinPanel />}
        {mainTab === "image_show" && <ImageSlideshowPanel />}
      </section>
    </div>
  );
}

export default App;
