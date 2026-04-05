import type {
  ImageEffect,
  RenderOutputSpec,
  SlideshowSlide,
} from "./timelineSpec";
import { clampOutputSpec } from "./timelineSpec";
import { encodeCanvasToMp4 } from "./encodeMp4";

async function fileToImageBitmap(file: File): Promise<ImageBitmap> {
  const bmp = await createImageBitmap(file);
  return bmp;
}

function segmentAtTime(
  tOut: number,
  items: SlideshowSlide[]
): { index: number; localT: number; duration: number } {
  let acc = 0;
  for (let i = 0; i < items.length; i += 1) {
    const d = Math.max(0.2, items[i].durationSec ?? 3);
    if (tOut < acc + d) {
      return { index: i, localT: tOut - acc, duration: d };
    }
    acc += d;
  }
  const last = items.length - 1;
  const d = Math.max(0.2, items[last]?.durationSec ?? 3);
  return { index: last, localT: 0, duration: d };
}

function totalSlideshowDuration(items: SlideshowSlide[]): number {
  return items.reduce(
    (sum, it) => sum + Math.max(0.2, it.durationSec ?? 3),
    0
  );
}

/**
 * cover 相当：画像をキャンバス全体に収めつつトリミング
 */
function drawCover(
  ctx: CanvasRenderingContext2D,
  bmp: ImageBitmap,
  width: number,
  height: number,
  options: {
    scale: number;
    panX: number;
    panY: number;
    globalAlpha: number;
  }
): void {
  const { scale, panX, panY, globalAlpha } = options;
  const iw = bmp.width;
  const ih = bmp.height;
  const base = Math.max(width / iw, height / ih);
  const dw = iw * base * scale;
  const dh = ih * base * scale;
  const dx = (width - dw) / 2 + panX * width;
  const dy = (height - dh) / 2 + panY * height;
  ctx.globalAlpha = globalAlpha;
  ctx.drawImage(bmp, dx, dy, dw, dh);
  ctx.globalAlpha = 1;
}

function applyEffect(
  ctx: CanvasRenderingContext2D,
  bmp: ImageBitmap,
  width: number,
  height: number,
  effect: ImageEffect | null,
  localT: number,
  duration: number
): void {
  const p = duration > 0 ? Math.min(1, Math.max(0, localT / duration)) : 0;
  let alpha = 1;
  let scale = 1;
  let panX = 0;
  const panY = 0;

  const eff = effect ?? "none";

  if (eff === "fade") {
    const fadeDur = Math.min(0.35, duration * 0.35);
    alpha = fadeDur > 0 ? Math.min(1, localT / fadeDur) : 1;
  } else if (eff === "ken_burns_zoom_in") {
    scale = 1 + p * 0.12;
  } else if (eff === "ken_burns_pan") {
    panX = (p - 0.5) * 0.12;
    scale = 1.04;
  }

  drawCover(ctx, bmp, width, height, { scale, panX, panY, globalAlpha: alpha });
}

/**
 * タイムライン仕様に従い、画像のみの無音 MP4 を生成する
 */
export async function renderImageSlideshowToMp4(options: {
  output: RenderOutputSpec;
  items: SlideshowSlide[];
  filesById: Map<string, File>;
  onProgress?: (p: number) => void;
}): Promise<ArrayBuffer> {
  const { output, items, filesById, onProgress } = options;

  const outSpec = clampOutputSpec(output);
  const { width, height, fps } = outSpec;

  const bitmaps: ImageBitmap[] = [];
  const idToBmp = new Map<string, ImageBitmap>();

  try {
    let li = 0;
    for (const it of items) {
      const file = filesById.get(it.imageId);
      if (!file) {
        throw new Error(`画像 "${it.imageId}" のファイルがありません`);
      }
      onProgress?.(0.05 * (li / items.length));
      const bmp = await fileToImageBitmap(file);
      bitmaps.push(bmp);
      idToBmp.set(it.imageId, bmp);
      li += 1;
    }

    const totalSec = totalSlideshowDuration(items);
    const totalFrames = Math.max(1, Math.ceil(totalSec * fps));

    return await encodeCanvasToMp4({
      width,
      height,
      fps,
      totalFrames,
      drawFrame: (ctx, frameIndex) => {
        const tOut = Math.min(totalSec - 1e-6, frameIndex / fps);
        const { index, localT, duration } = segmentAtTime(tOut, items);
        const it = items[index];
        const bmp = idToBmp.get(it.imageId);
        if (!bmp) return;
        ctx.fillStyle = "#000";
        ctx.fillRect(0, 0, width, height);
        applyEffect(
          ctx,
          bmp,
          width,
          height,
          it.effect,
          localT,
          duration
        );
      },
      onProgress: (p) => onProgress?.(0.1 + p * 0.9),
    });
  } finally {
    for (const b of bitmaps) {
      try {
        b.close();
      } catch {
        /* ignore */
      }
    }
  }
}
