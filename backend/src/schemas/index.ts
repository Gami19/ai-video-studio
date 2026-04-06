import { z } from "zod";
import { thumbnailBlocksSchema } from "./thumbnailBlocks";

export { thumbnailBlocksSchema } from "./thumbnailBlocks";
export type { ThumbnailBlocksInput } from "./thumbnailBlocks";

/**
 * base64 プレフィックス（data:image/jpeg;base64,）を除去して純粋な base64 文字列を返す
 */
export function stripBase64Prefix(str: string): string {
  const match = str.match(/^data:image\/\w+;base64,(.+)$/);
  return match ? match[1] : str;
}

/**
 * base64 文字列のバイトサイズを計算
 * base64 は 4 文字で 3 バイトなので、length * 3/4 で概算
 */
function base64ByteSize(str: string): number {
  const clean = stripBase64Prefix(str);
  return Math.ceil((clean.length * 3) / 4);
}

const MAX_FRAME_COUNT = 5;
const MAX_FRAME_SIZE_BYTES = 5 * 1024 * 1024; // 5MB
const MAX_TOTAL_FRAMES_BYTES = 25 * 1024 * 1024; // 25MB (5枚 × 5MB)

/**
 * POST /api/analyze 用スキーマ
 */
export const analyzeSchema = z
  .object({
    frames: z
      .array(z.string())
      .min(1, "frames は 1 枚以上必要です")
      .max(MAX_FRAME_COUNT, `frames は最大 ${MAX_FRAME_COUNT} 枚です`),
    userHint: z
      .string()
      .max(500, "userHint は最大 500 文字です")
      .optional(),
    thumbnailBlocks: thumbnailBlocksSchema.optional(),
  })
  .refine(
    (data) => {
      const totalBytes = data.frames.reduce(
        (sum, f) => sum + base64ByteSize(f),
        0
      );
      return totalBytes <= MAX_TOTAL_FRAMES_BYTES;
    },
    {
      message: `frames の合計サイズは ${MAX_TOTAL_FRAMES_BYTES / 1024 / 1024}MB 以内にしてください`,
    }
  )
  .refine(
    (data) => {
      return data.frames.every(
        (f) => base64ByteSize(f) <= MAX_FRAME_SIZE_BYTES
      );
    },
    {
      message: `各フレームは ${MAX_FRAME_SIZE_BYTES / 1024 / 1024}MB 以内にしてください`,
    }
  );

export type AnalyzeInput = z.infer<typeof analyzeSchema>;

/**
 * base64 プレフィックスを除去した frames を返すユーティリティ
 */
export function normalizeFrames(frames: string[]): string[] {
  return frames.map(stripBase64Prefix);
}

/**
 * POST /api/generate 用スキーマ（フェーズ A: jobId のみ）
 */
export const generateSchema = z.object({
  jobId: z.uuid("jobId は有効な UUID である必要があります"),
});

export type GenerateInput = z.infer<typeof generateSchema>;

const VIDEO_JOB_MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const VIDEO_JOB_MAX_TOTAL_BASE64_BYTES = 24 * 1024 * 1024;

const videoOptionalConfigSchema = z
  .object({
    aspectRatio: z.enum(["16:9", "9:16"]).optional(),
    resolution: z.enum(["720p", "1080p", "4k"]).optional(),
    durationSeconds: z.union([z.literal(4), z.literal(6), z.literal(8)]).optional(),
  })
  .strict()
  .optional();

const referenceImageSchema = z.object({
  imageBase64: z.string().min(1),
  mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]),
  referenceType: z.enum(["ASSET", "STYLE"]).optional(),
});

const videoJobBodyUnion = z.union([
  z.object({
    mode: z.literal("image_prompt"),
    prompt: z.string().min(1).max(4000),
    imageBase64: z.string().min(1),
    imageMimeType: z.enum(["image/jpeg", "image/png", "image/webp"]),
    config: videoOptionalConfigSchema,
  }),
  z.object({
    mode: z.literal("reference_three"),
    prompt: z.string().min(1).max(4000),
    references: z.tuple([
      referenceImageSchema,
      referenceImageSchema,
      referenceImageSchema,
    ]),
    config: videoOptionalConfigSchema,
  }),
  z.object({
    mode: z.literal("first_last"),
    prompt: z.string().min(1).max(4000),
    firstFrameBase64: z.string().min(1),
    firstMimeType: z.enum(["image/jpeg", "image/png", "image/webp"]),
    lastFrameBase64: z.string().min(1),
    lastMimeType: z.enum(["image/jpeg", "image/png", "image/webp"]),
    config: videoOptionalConfigSchema,
  }),
]);

/**
 * POST /api/video/jobs — Veo ジョブ開始（discriminated by mode）
 */
export const videoJobStartSchema = videoJobBodyUnion.superRefine((data, ctx) => {
  const checkSize = (label: string, raw: string) => {
    const sz = base64ByteSize(raw);
    if (sz > VIDEO_JOB_MAX_IMAGE_BYTES) {
      ctx.addIssue({
        code: "custom",
        message: `${label} は ${VIDEO_JOB_MAX_IMAGE_BYTES / 1024 / 1024}MB 以内にしてください`,
        path: [],
      });
    }
    return sz;
  };

  let total = 0;
  if (data.mode === "image_prompt") {
    total += checkSize("imageBase64", data.imageBase64);
  } else if (data.mode === "reference_three") {
    data.references.forEach((r, i) => {
      total += checkSize(`references[${i}].imageBase64`, r.imageBase64);
    });
  } else {
    total += checkSize("firstFrameBase64", data.firstFrameBase64);
    total += checkSize("lastFrameBase64", data.lastFrameBase64);
  }

  if (total > VIDEO_JOB_MAX_TOTAL_BASE64_BYTES) {
    ctx.addIssue({
      code: "custom",
      message: `画像データの合計は ${VIDEO_JOB_MAX_TOTAL_BASE64_BYTES / 1024 / 1024}MB 以内にしてください`,
      path: [],
    });
  }
});

export type VideoJobStartInput = z.infer<typeof videoJobStartSchema>;
