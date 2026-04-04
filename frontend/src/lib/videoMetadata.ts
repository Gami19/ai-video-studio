/**
 * 動画ファイルの再生時間（秒）を取得
 */
export function getVideoDurationSec(file: File): Promise<number> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement("video");
    video.muted = true;
    video.preload = "metadata";
    video.src = url;

    const cleanup = () => {
      URL.revokeObjectURL(url);
      video.removeAttribute("src");
      video.load();
    };

    video.addEventListener("loadedmetadata", () => {
      const d = video.duration;
      cleanup();
      if (!Number.isFinite(d) || d <= 0) {
        reject(new Error("動画の長さを取得できませんでした"));
        return;
      }
      resolve(d);
    });

    video.addEventListener("error", () => {
      cleanup();
      reject(new Error("動画のメタデータを読み込めませんでした"));
    });
  });
}
