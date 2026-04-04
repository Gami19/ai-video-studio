/**
 * ブラウザ内 MP4 生成用のタイムライン（API の edit-plan は使用しない）
 */

export type ImageEffect =
  | "none"
  | "fade"
  | "ken_burns_zoom_in"
  | "ken_burns_pan";

export interface RenderOutputSpec {
  width: number;
  height: number;
  fps: number;
}

export const DEFAULT_RENDER_OUTPUT: RenderOutputSpec = {
  width: 1280,
  height: 720,
  fps: 30,
};

/** クリップ結合：1 クリップ分 */
export interface ClipJoinSegment {
  clipId: string;
  trimStartSec: number | null;
  trimEndSec: number | null;
  transitionAfterType: "none" | "crossfade" | null;
  transitionAfterDurationSec: number | null;
}

/** スライドショー：1 枚分 */
export interface SlideshowSlide {
  imageId: string;
  durationSec: number | null;
  effect: ImageEffect | null;
}

const DEFAULT_CROSSFADE_SEC = 0.45;
const DEFAULT_SLIDE_SEC = 3;

/** 出力解像度・FPS をブラウザ負荷に合わせてクランプ */
export function clampOutputSpec(
  o: RenderOutputSpec,
  maxLongEdge = 1920
): RenderOutputSpec {
  let { width, height, fps } = o;
  fps = Math.min(60, Math.max(12, fps));
  const long = Math.max(width, height);
  if (long > maxLongEdge) {
    const s = maxLongEdge / long;
    width = Math.round(width * s);
    height = Math.round(height * s);
    width = Math.max(2, width & ~1);
    height = Math.max(2, height & ~1);
  }
  return { width, height, fps };
}

/**
 * アップロード順で全尺使用。最後以外はクロスフェード。
 */
export function buildDefaultClipJoinSegments(
  clipIdsInOrder: string[],
  durationById: Map<string, number>
): ClipJoinSegment[] {
  return clipIdsInOrder.map((id, i) => {
    const dur = durationById.get(id);
    if (dur === undefined) {
      throw new Error(`クリップ id "${id}" の長さが不明です`);
    }
    const isLast = i === clipIdsInOrder.length - 1;
    return {
      clipId: id,
      trimStartSec: 0,
      trimEndSec: dur,
      transitionAfterType: isLast ? "none" : "crossfade",
      transitionAfterDurationSec: isLast ? null : DEFAULT_CROSSFADE_SEC,
    };
  });
}

/** アップロード順。各カット同じ秒数・演出なし */
export function buildDefaultSlideshowSlides(
  imageIdsInOrder: string[]
): SlideshowSlide[] {
  return imageIdsInOrder.map((id) => ({
    imageId: id,
    durationSec: DEFAULT_SLIDE_SEC,
    effect: null,
  }));
}
