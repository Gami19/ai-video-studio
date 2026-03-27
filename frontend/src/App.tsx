import { useState } from "react";
import { VideoUploader } from "./components/VideoUploader";
import { ThumbnailResult } from "./components/ThumbnailResult";
import { analyzeFrames, generateThumbnail } from "./lib/api";
import { debugLog } from "./lib/debugLog";
import "./App.css";

type FlowStep =
  | "upload"
  | "analyzing"
  | "generating"
  | "done"
  | "error";

function App() {
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
    <>
      <section className="app-section app-section--main">
        <h1>AI サムネイル生成</h1>
        <p className="app-description">
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
            <h2>生成されたサムネイル</h2>
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
            <ThumbnailResult error={error ?? undefined} onRetry={handleRetry} />
          </div>
        )}
      </section>
    </>
  );
}

export default App;
