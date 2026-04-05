import { createFile, DataStream, Endianness } from "mp4box";

export type TimestampedBitmap = {
  ptsUs: number;
  bitmap: ImageBitmap;
};

type ExtractedSample = {
  data: Uint8Array;
  tsUs: number;
  durationUs: number;
  key: boolean;
};

function isRecord(v: unknown): v is Record<string, unknown> {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

function avcCToDescriptionBytes(entry: unknown): Uint8Array | undefined {
  if (!isRecord(entry)) return undefined;
  const avcC = entry.avcC as { write?: (s: DataStream) => void } | undefined;
  if (!avcC?.write) return undefined;
  const stream = new DataStream(0, undefined, Endianness.BIG_ENDIAN);
  avcC.write(stream);
  return new Uint8Array(stream.buffer, 0, stream.byteLength);
}

function isH264Codec(codec: string): boolean {
  return codec.startsWith("avc1") || codec.startsWith("avc3");
}

function codedSizeFromTrack(vt: {
  track_width: number;
  track_height: number;
  video?: { width: number; height: number };
}): { w: number; h: number } {
  if (vt.video && vt.video.width > 0 && vt.video.height > 0) {
    return { w: vt.video.width, h: vt.video.height };
  }
  return { w: vt.track_width >> 16, h: vt.track_height >> 16 };
}

/**
 * MP4（H.264 / avc1）から圧縮サンプルを抽出する
 */
export async function extractAvcSamplesFromMp4(file: File): Promise<{
  codec: string;
  codedWidth: number;
  codedHeight: number;
  description: Uint8Array;
  timescale: number;
  samples: ExtractedSample[];
}> {
  const arrayBuffer = await file.arrayBuffer();
  Object.defineProperty(arrayBuffer, "fileStart", {
    value: 0,
    writable: true,
    configurable: true,
  });

  return new Promise((resolve, reject) => {
    const mp4 = createFile();
    const samples: ExtractedSample[] = [];
    let trackInfo: {
      codec: string;
      codedWidth: number;
      codedHeight: number;
      description: Uint8Array;
      timescale: number;
    } | null = null;
    let expectedSamples = 0;
    let settled = false;

    const finish = () => {
      if (settled) return;
      if (!trackInfo) {
        settled = true;
        reject(new Error("動画トラックを初期化できませんでした"));
        return;
      }
      if (samples.length === 0) {
        settled = true;
        reject(new Error("動画サンプルを取得できませんでした"));
        return;
      }
      settled = true;
      samples.sort((a, b) => a.tsUs - b.tsUs);
      resolve({
        codec: trackInfo.codec,
        codedWidth: trackInfo.codedWidth,
        codedHeight: trackInfo.codedHeight,
        description: trackInfo.description,
        timescale: trackInfo.timescale,
        samples,
      });
    };

    mp4.onError = (e: string) => {
      if (settled) return;
      settled = true;
      reject(new Error(`MP4 の読み取りに失敗しました: ${e}`));
    };

    mp4.onReady = (info: {
      videoTracks: Array<{
        id: number;
        codec: string;
        track_width: number;
        track_height: number;
        timescale: number;
        nb_samples: number;
        video?: { width: number; height: number };
      }>;
    }) => {
      const vt = info.videoTracks[0];
      if (!vt) {
        if (!settled) {
          settled = true;
          reject(new Error("動画トラックが見つかりません"));
        }
        return;
      }
      if (!isH264Codec(vt.codec)) {
        if (!settled) {
          settled = true;
          reject(
            new Error(
              `対応していないコーデックです（${vt.codec}）。H.264（AVC）の MP4 を使ってください。`
            )
          );
        }
        return;
      }

      const trak = mp4.getTrackById(vt.id);
      const entry = trak?.mdia?.minf?.stbl?.stsd?.entries?.[0];
      const description = avcCToDescriptionBytes(entry) ?? new Uint8Array();

      const { w, h } = codedSizeFromTrack(vt);

      trackInfo = {
        codec: vt.codec,
        codedWidth: Math.max(2, w & ~1),
        codedHeight: Math.max(2, h & ~1),
        description,
        timescale: vt.timescale,
      };

      expectedSamples = Math.max(1, vt.nb_samples);
      mp4.setExtractionOptions(vt.id, null, { nbSamples: expectedSamples });
      mp4.start();
    };

    mp4.onSamples = (_id: number, _user: unknown, batch: unknown[]) => {
      if (!trackInfo) return;
      for (const raw of batch) {
        const s = raw as {
          data?: Uint8Array;
          dts: number;
          duration: number;
          is_sync: boolean;
          timescale?: number;
          description?: unknown;
        };
        if (!s.data || s.data.byteLength === 0) continue;

        const ts = s.timescale ?? trackInfo.timescale;
        const tsUs = Math.round((s.dts / ts) * 1e6);
        const durationUs = Math.round((s.duration / ts) * 1e6);

        if (trackInfo.description.byteLength === 0 && s.description) {
          const desc = avcCToDescriptionBytes(s.description);
          if (desc && desc.byteLength > 0) {
            trackInfo = { ...trackInfo, description: desc };
          }
        }

        samples.push({
          data: s.data,
          tsUs,
          durationUs,
          key: Boolean(s.is_sync),
        });
      }

      if (samples.length >= expectedSamples) {
        finish();
      }
    };

    mp4.appendBuffer(arrayBuffer as ArrayBuffer & { fileStart: number });
    mp4.flush();

    setTimeout(() => {
      if (!settled && trackInfo && samples.length > 0) {
        finish();
      }
    }, 3000);
  });
}

/**
 * H.264 サンプルをデコードし、タイムスタンプ付き ImageBitmap の列にする
 */
export async function decodeAvcSamplesToBitmaps(params: {
  codec: string;
  codedWidth: number;
  codedHeight: number;
  description: Uint8Array;
  samples: ExtractedSample[];
  onProgress?: (p: number) => void;
}): Promise<TimestampedBitmap[]> {
  const { codec, codedWidth, codedHeight, description, samples, onProgress } =
    params;

  const frames: TimestampedBitmap[] = [];
  const pending: Promise<void>[] = [];

  const decoder = new VideoDecoder({
    output: (frame) => {
      pending.push(
        (async () => {
          const bmp = await createImageBitmap(frame);
          frames.push({ ptsUs: frame.timestamp ?? 0, bitmap: bmp });
          frame.close();
        })()
      );
    },
    error: (e) => {
      throw new Error(`VideoDecoder エラー: ${e.message}`);
    },
  });

  const config: VideoDecoderConfig = {
    codec,
    codedWidth,
    codedHeight,
  };
  if (description.byteLength > 0) {
    config.description = description;
  }

  await decoder.configure(config);

  let i = 0;
  for (const s of samples) {
    const chunkInit: EncodedVideoChunkInit = {
      type: s.key ? "key" : "delta",
      timestamp: s.tsUs,
      data: s.data,
    };
    if (s.durationUs > 0) {
      chunkInit.duration = s.durationUs;
    }
    const chunk = new EncodedVideoChunk(chunkInit);
    decoder.decode(chunk);
    i += 1;
    if (i % 30 === 0) {
      onProgress?.(i / samples.length);
    }
  }

  await decoder.flush();
  await Promise.all(pending);
  decoder.close();

  frames.sort((a, b) => a.ptsUs - b.ptsUs);
  return frames;
}

/**
 * 動画ファイルをデコードし、フレーム列を返す
 */
export async function decodeVideoFileToBitmaps(
  file: File,
  onProgress?: (p: number) => void
): Promise<{
  frames: TimestampedBitmap[];
  codedWidth: number;
  codedHeight: number;
}> {
  const extracted = await extractAvcSamplesFromMp4(file);
  onProgress?.(0.2);
  const frames = await decodeAvcSamplesToBitmaps({
    ...extracted,
    onProgress: (p) => onProgress?.(0.2 + p * 0.8),
  });
  return {
    frames,
    codedWidth: extracted.codedWidth,
    codedHeight: extracted.codedHeight,
  };
}

export function bitmapAtOrBefore(
  frames: TimestampedBitmap[],
  timeSec: number
): ImageBitmap {
  const target = timeSec * 1e6;
  let best = frames[0];
  if (!best) {
    throw new Error("フレームがありません");
  }
  for (const f of frames) {
    if (f.ptsUs <= target) {
      best = f;
    } else {
      break;
    }
  }
  return best.bitmap;
}
