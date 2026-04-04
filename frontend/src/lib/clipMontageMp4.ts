import type { ClipJoinSegment, RenderOutputSpec } from "./timelineSpec";
import { clampOutputSpec } from "./timelineSpec";
import {
  decodeVideoFileToBitmaps,
  bitmapAtOrBefore,
  type TimestampedBitmap,
} from "./demuxDecodeMp4";
import { encodeCanvasToMp4 } from "./encodeMp4";

function clamp(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, n));
}

type InternalSeg = {
  clipId: string;
  trimStart: number;
  trimEnd: number;
  fadeAfter: number;
};

function buildInternalSegments(
  items: ClipJoinSegment[],
  durationById: Map<string, number>
): InternalSeg[] {
  return items.map((it) => {
    const dur = durationById.get(it.clipId);
    if (dur === undefined) {
      throw new Error(`クリップ id "${it.clipId}" の長さが不明です`);
    }
    const t0 = it.trimStartSec ?? 0;
    const t1 = it.trimEndSec ?? dur;
    const ts = Math.max(0, Math.min(t0, dur));
    const te = Math.max(ts, Math.min(t1, dur));
    const fadeRaw =
      it.transitionAfterType === "crossfade"
        ? Math.max(0, it.transitionAfterDurationSec ?? 0.4)
        : 0;
    const fade = Math.min(fadeRaw, te - ts, 1.5);
    return { clipId: it.clipId, trimStart: ts, trimEnd: te, fadeAfter: fade };
  });
}

function totalOutputDuration(segs: InternalSeg[]): number {
  let sumD = 0;
  let sumF = 0;
  for (let i = 0; i < segs.length; i += 1) {
    const s = segs[i];
    sumD += s.trimEnd - s.trimStart;
    if (i < segs.length - 1) {
      const D = s.trimEnd - s.trimStart;
      const Dnext = segs[i + 1].trimEnd - segs[i + 1].trimStart;
      sumF += Math.min(s.fadeAfter, D, Dnext);
    }
  }
  return Math.max(0.1, sumD - sumF);
}

type Composition =
  | {
      mode: "single";
      clipId: string;
      tSource: number;
    }
  | {
      mode: "blend";
      clipIdA: string;
      tSourceA: number;
      clipIdB: string;
      tSourceB: number;
      alphaB: number;
    };

function sampleComposition(
  tOut: number,
  segs: InternalSeg[]
): Composition {
  let acc = 0;
  for (let i = 0; i < segs.length; i += 1) {
    const s = segs[i];
    const D = s.trimEnd - s.trimStart;
    const F =
      i < segs.length - 1
        ? Math.min(
            s.fadeAfter,
            D,
            segs[i + 1].trimEnd - segs[i + 1].trimStart
          )
        : 0;

    const singleEnd = acc + Math.max(0, D - F);
    const blockEnd = acc + D;

    if (F === 0) {
      if (tOut < acc + D) {
        const local = tOut - acc + s.trimStart;
        return {
          mode: "single",
          clipId: s.clipId,
          tSource: clamp(local, s.trimStart, s.trimEnd - 1e-4),
        };
      }
      acc += D;
      continue;
    }

    if (tOut < singleEnd) {
      const local = tOut - acc + s.trimStart;
      return {
        mode: "single",
        clipId: s.clipId,
        tSource: clamp(local, s.trimStart, s.trimEnd - 1e-4),
      };
    }

    if (tOut < blockEnd) {
      const u = tOut - singleEnd;
      const alphaB = F > 0 ? u / F : 0;
      const tA = s.trimEnd - F + u;
      const sn = segs[i + 1];
      const tB = sn.trimStart + u;
      return {
        mode: "blend",
        clipIdA: s.clipId,
        tSourceA: clamp(tA, s.trimStart, s.trimEnd - 1e-4),
        clipIdB: sn.clipId,
        tSourceB: clamp(tB, sn.trimStart, sn.trimEnd - 1e-4),
        alphaB: clamp(alphaB, 0, 1),
      };
    }

    acc += D - F;
  }

  const last = segs[segs.length - 1];
  return {
    mode: "single",
    clipId: last.clipId,
    tSource: last.trimEnd - 1e-4,
  };
}

/**
 * タイムライン仕様に従い、複数 MP4 をクロスフェードで結合した無音 MP4 を生成する
 */
export async function renderClipJoinToMp4(options: {
  output: RenderOutputSpec;
  items: ClipJoinSegment[];
  filesById: Map<string, File>;
  clipDurationSecById: Map<string, number>;
  onProgress?: (p: number) => void;
}): Promise<ArrayBuffer> {
  const { output, items: clipItems, filesById, clipDurationSecById, onProgress } =
    options;

  const outSpec = clampOutputSpec(output);
  const { width, height, fps } = outSpec;

  const segs = buildInternalSegments(clipItems, clipDurationSecById);
  const totalSec = totalOutputDuration(segs);
  const totalFrames = Math.max(1, Math.ceil(totalSec * fps));

  const timelineByClip = new Map<string, TimestampedBitmap[]>();
  const bitmapsToClose: ImageBitmap[] = [];

  const uniqueIds = [...new Set(clipItems.map((it) => it.clipId))];
  let decodeIdx = 0;
  for (const id of uniqueIds) {
    const file = filesById.get(id);
    if (!file) {
      throw new Error(`クリップ "${id}" のファイルがありません`);
    }
    onProgress?.(0.05 + (0.45 * decodeIdx) / uniqueIds.length);
    const { frames } = await decodeVideoFileToBitmaps(file, (p) => {
      onProgress?.(
        0.05 + ((decodeIdx + p) / uniqueIds.length) * 0.45
      );
    });
    timelineByClip.set(id, frames);
    for (const f of frames) {
      bitmapsToClose.push(f.bitmap);
    }
    decodeIdx += 1;
  }

  const getBmp = (clipId: string, tSource: number): ImageBitmap => {
    const tl = timelineByClip.get(clipId);
    if (!tl || tl.length === 0) {
      throw new Error(`クリップ "${clipId}" にフレームがありません`);
    }
    return bitmapAtOrBefore(tl, tSource);
  };

  try {
    const buffer = await encodeCanvasToMp4({
      width,
      height,
      fps,
      totalFrames,
      drawFrame: (ctx, frameIndex) => {
        const tOut = Math.min(
          totalSec - 1e-6,
          (frameIndex / fps)
        );
        const comp = sampleComposition(tOut, segs);
        if (comp.mode === "single") {
          const bmp = getBmp(comp.clipId, comp.tSource);
          ctx.drawImage(bmp, 0, 0, width, height);
          return;
        }
        const bmpA = getBmp(comp.clipIdA, comp.tSourceA);
        const bmpB = getBmp(comp.clipIdB, comp.tSourceB);
        ctx.globalAlpha = 1 - comp.alphaB;
        ctx.drawImage(bmpA, 0, 0, width, height);
        ctx.globalAlpha = comp.alphaB;
        ctx.drawImage(bmpB, 0, 0, width, height);
        ctx.globalAlpha = 1;
      },
      onProgress: (p) => onProgress?.(0.5 + p * 0.5),
    });
    return buffer;
  } finally {
    for (const b of bitmapsToClose) {
      try {
        b.close();
      } catch {
        /* ignore */
      }
    }
  }
}
