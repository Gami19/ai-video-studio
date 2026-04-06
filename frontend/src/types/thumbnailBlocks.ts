/**
 * POST /api/analyze の thumbnailBlocks（バックエンド Zod と整合）
 */
export type ThumbnailHero =
  | "face"
  | "screen"
  | "product"
  | "comparison"
  | "scene"
  | "other";

export type ThumbnailTone =
  | "bright"
  | "calm"
  | "high_contrast"
  | "dark"
  | "warm"
  | "cool"
  | "minimal";

export type ThumbnailBlocksPayload = {
  mainMessage?: string;
  hero?: ThumbnailHero;
  heroNote?: string;
  tone?: ThumbnailTone;
  toneNote?: string;
  overlayTextJa?: string | null;
  videoTitle?: string;
  avoid?: string;
};
