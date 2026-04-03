import { Muxer, ArrayBufferTarget } from "mp4-muxer";

export async function pickAvcEncoderConfig(
  width: number,
  height: number,
  fps: number
): Promise<VideoEncoderConfig> {
  const tryCodecs = ["avc1.640028", "avc1.4d401f", "avc1.42E01E"] as const;
  for (const codec of tryCodecs) {
    const r = await VideoEncoder.isConfigSupported({
      codec,
      width,
      height,
      bitrate: 4_000_000,
      framerate: fps,
    });
    if (r.supported && r.config) {
      return {
        ...r.config,
        width,
        height,
        bitrate: 4_000_000,
        framerate: fps,
      };
    }
  }
  throw new Error("利用可能な H.264 エンコーダ設定が見つかりません");
}

/**
 * Canvas に毎フレーム描画し、無音 MP4（ArrayBuffer）を生成する
 */
export async function encodeCanvasToMp4(params: {
  width: number;
  height: number;
  fps: number;
  totalFrames: number;
  drawFrame: (ctx: CanvasRenderingContext2D, frameIndex: number) => void;
  onProgress?: (p: number) => void;
}): Promise<ArrayBuffer> {
  const { width, height, fps, totalFrames, drawFrame, onProgress } = params;

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    throw new Error("Canvas 2D を取得できませんでした");
  }

  const encConfig = await pickAvcEncoderConfig(width, height, fps);

  const target = new ArrayBufferTarget();
  const muxer = new Muxer({
    target,
    video: {
      codec: "avc",
      width,
      height,
      frameRate: fps,
    },
    fastStart: "in-memory",
    firstTimestampBehavior: "offset",
  });

  const encoder = new VideoEncoder({
    output: (chunk, meta) => muxer.addVideoChunk(chunk, meta),
    error: (e) => {
      throw new Error(`VideoEncoder: ${e.message}`);
    },
  });

  await encoder.configure(encConfig);

  const frameDurationUs = Math.round(1e6 / fps);

  for (let i = 0; i < totalFrames; i += 1) {
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, width, height);
    drawFrame(ctx, i);

    const vf = new VideoFrame(canvas, {
      timestamp: i * frameDurationUs,
      duration: frameDurationUs,
    });

    encoder.encode(vf, { keyFrame: i % (fps * 2) === 0 });
    vf.close();

    if (i % 10 === 0) {
      onProgress?.((i + 1) / totalFrames);
    }
  }

  await encoder.flush();
  encoder.close();
  muxer.finalize();

  return target.buffer;
}
