import { z } from "zod";

export const heroSchema = z.enum([
  "face",
  "screen",
  "product",
  "comparison",
  "scene",
  "other",
]);

export const toneSchema = z.enum([
  "bright",
  "calm",
  "high_contrast",
  "dark",
  "warm",
  "cool",
  "minimal",
]);

/**
 * サムネイル詳細ブロック（すべて任意）。`.strict()` で未知キーを拒否。
 */
export const thumbnailBlocksSchema = z
  .object({
    mainMessage: z.string().max(120).optional(),
    hero: heroSchema.optional(),
    heroNote: z.string().max(120).optional(),
    tone: toneSchema.optional(),
    toneNote: z.string().max(120).optional(),
    overlayTextJa: z.union([z.string().max(40), z.null()]).optional(),
    videoTitle: z.string().max(200).optional(),
    avoid: z.string().max(300).optional(),
  })
  .strict();

export type ThumbnailBlocksInput = z.infer<typeof thumbnailBlocksSchema>;
