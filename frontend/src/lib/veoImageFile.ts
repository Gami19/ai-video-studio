const ALLOWED_MIME = ["image/jpeg", "image/png", "image/webp"] as const;

export type VeoImageMimeType = (typeof ALLOWED_MIME)[number];

function isVeoImageMimeType(t: string): t is VeoImageMimeType {
  return (ALLOWED_MIME as readonly string[]).includes(t);
}

/**
 * 先頭画像 1 枚を Data URL 文字列として読み、Veo API 用に返す（サーバが base64 プレフィックスを除去）
 */
export function readImageFileForVeoJob(
  file: File
): Promise<{ imageBase64: string; imageMimeType: VeoImageMimeType }> {
  if (!isVeoImageMimeType(file.type)) {
    return Promise.reject(
      new Error("画像は JPEG / PNG / WebP のみ対応しています")
    );
  }

  const imageMimeType: VeoImageMimeType = file.type;

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== "string" || !result.startsWith("data:")) {
        reject(new Error("画像の読み込み結果が不正です"));
        return;
      }
      resolve({
        imageBase64: result,
        imageMimeType,
      });
    };
    reader.onerror = () =>
      reject(new Error("画像の読み込みに失敗しました"));
    reader.readAsDataURL(file);
  });
}
