import { PersonGeneration } from "@google/genai";
import type { ThumbnailBlocksInput } from "../schemas/thumbnailBlocks";

/** Imagen 公式の目安に合わせたプロンプト最大文字数（トークン上限の近似） */
export const IMAGEN_PROMPT_MAX_CHARS = 1800;

const FACE_AVOID_PATTERN =
  /顔出し|顔は出さ|顔を出さ|人物を?出さ|顔不要|ノーフェイス|顔なし|no\s*face/i;

/**
 * サムネイル用の人物生成ポリシー。
 * - NG（avoid）に顔関連があれば常に DONT_ALLOW
 * - 主役が face のときのみ ALLOW_ADULT
 * - それ以外は DONT_ALLOW
 */
export function resolvePersonGeneration(
  blocks: ThumbnailBlocksInput | undefined
): PersonGeneration {
  const avoid = blocks?.avoid ?? "";
  if (FACE_AVOID_PATTERN.test(avoid)) {
    return PersonGeneration.DONT_ALLOW;
  }
  if (blocks?.hero === "face") {
    return PersonGeneration.ALLOW_ADULT;
  }
  return PersonGeneration.DONT_ALLOW;
}

export function truncateImagenPrompt(prompt: string, maxChars: number): string {
  const t = prompt.trim();
  if (t.length <= maxChars) return t;
  return t.slice(0, maxChars).trimEnd();
}

/**
 * Gemini 用: ブロックを日本語テキストに展開（ブロック優先・userHint は別途補足として渡す）
 */
export function formatThumbnailBlocksForPrompt(
  blocks: ThumbnailBlocksInput | undefined
): string {
  if (!blocks) return "";

  const lines: string[] = [];

  if (blocks.mainMessage?.trim()) {
    lines.push(`一番伝えたいこと: ${blocks.mainMessage.trim()}`);
  }
  if (blocks.hero) {
    const heroLabels: Record<NonNullable<ThumbnailBlocksInput["hero"]>, string> =
      {
        face: "顔・人物",
        screen: "画面・UI",
        product: "モノ・商品",
        comparison: "比較（並べ）",
        scene: "風景・場面",
        other: "その他",
      };
    lines.push(`サムネの主役: ${heroLabels[blocks.hero]}`);
  }
  if (blocks.heroNote?.trim()) {
    lines.push(`主役の補足: ${blocks.heroNote.trim()}`);
  }
  if (blocks.tone) {
    const toneLabels: Record<NonNullable<ThumbnailBlocksInput["tone"]>, string> =
      {
        bright: "明るい",
        calm: "落ち着いた",
        high_contrast: "はっきり・コントラスト強め",
        dark: "ダーク・シネマ",
        warm: "暖かいトーン",
        cool: "クール・清涼",
        minimal: "ミニマル",
      };
    lines.push(`雰囲気・トーン: ${toneLabels[blocks.tone]}`);
  }
  if (blocks.toneNote?.trim()) {
    lines.push(`トーンの補足: ${blocks.toneNote.trim()}`);
  }
  if (blocks.overlayTextJa === null) {
    lines.push("画像内の文字: なし（テキストを描かない）");
  } else if (blocks.overlayTextJa?.trim()) {
    lines.push(`画像に載せたい短い文字（日本語）: ${blocks.overlayTextJa.trim()}`);
  }
  if (blocks.videoTitle?.trim()) {
    lines.push(`動画タイトル（参考・サムネ文案と被らないように）: ${blocks.videoTitle.trim()}`);
  }
  if (blocks.avoid?.trim()) {
    lines.push(`入れたくないもの・注意: ${blocks.avoid.trim()}`);
  }

  return lines.join("\n");
}
