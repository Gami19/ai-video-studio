/**
 * POST /api/video/jobs のボディ（バックエンド videoJobStartSchema と整合）
 */
export type VideoJobConfig = {
  aspectRatio?: "16:9" | "9:16";
  resolution?: "720p" | "1080p" | "4k";
  durationSeconds?: 4 | 6 | 8;
};

export type VideoReferenceType = "ASSET" | "STYLE";

export type VideoJobReferenceImage = {
  imageBase64: string;
  mimeType: "image/jpeg" | "image/png" | "image/webp";
  referenceType?: VideoReferenceType;
};

export type VideoJobStartBody =
  | {
      mode: "image_prompt";
      prompt: string;
      imageBase64: string;
      imageMimeType: "image/jpeg" | "image/png" | "image/webp";
      config?: VideoJobConfig;
    }
  | {
      mode: "reference_three";
      prompt: string;
      references: [
        VideoJobReferenceImage,
        VideoJobReferenceImage,
        VideoJobReferenceImage,
      ];
      config?: VideoJobConfig;
    }
  | {
      mode: "first_last";
      prompt: string;
      firstFrameBase64: string;
      firstMimeType: "image/jpeg" | "image/png" | "image/webp";
      lastFrameBase64: string;
      lastMimeType: "image/jpeg" | "image/png" | "image/webp";
      config?: VideoJobConfig;
    };

export type VideoOperationStatus = {
  operationName: string | null;
  done: boolean;
  error: unknown;
  raiMediaFilteredCount: number | null;
  raiMediaFilteredReasons: unknown;
  videoReady: boolean;
  videoMimeType: string | null;
};
