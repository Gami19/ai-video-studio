import { z } from "zod";

/**
 * base64 プレフィックス（data:image/jpeg;base64,）を除去して純粋な base64 文字列を返す
 */
function stripBase64Prefix(str: string): string {
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
 * POST /api/generate 用スキーマ
 */
export const generateSchema = z.object({
  prompt: z
    .string()
    .min(1, "prompt は必須です")
    .max(2000, "prompt は最大 2000 文字です"),
});

export type GenerateInput = z.infer<typeof generateSchema>;
