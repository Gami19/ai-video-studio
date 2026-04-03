/**
 * WebCodecs（VideoEncoder / VideoDecoder）の利用可否
 */
export type WebCodecsCapability = {
  videoEncoder: boolean;
  videoDecoder: boolean;
  /** 少なくとも H.264 エンコードが isConfigSupported で通るか */
  avcEncode: boolean;
};

export async function getWebCodecsCapability(): Promise<WebCodecsCapability> {
  const videoEncoder = typeof VideoEncoder !== "undefined";
  const videoDecoder = typeof VideoDecoder !== "undefined";

  let avcEncode = false;
  if (videoEncoder) {
    const tryCodecs = ["avc1.640028", "avc1.4d401f", "avc1.42E01E"] as const;
    for (const codec of tryCodecs) {
      const r = await VideoEncoder.isConfigSupported({
        codec,
        width: 1280,
        height: 720,
        bitrate: 2_000_000,
        framerate: 30,
      });
      if (r.supported) {
        avcEncode = true;
        break;
      }
    }
  }

  return { videoEncoder, videoDecoder, avcEncode };
}

export function webCodecsSupportSummary(c: WebCodecsCapability): string {
  if (!c.videoEncoder || !c.videoDecoder) {
    return "このブラウザでは WebCodecs（VideoEncoder / VideoDecoder）が利用できません。デスクトップの最新版 Chrome または Edge を試してください。";
  }
  if (!c.avcEncode) {
    return "H.264（AVC）のエンコード設定がブラウザでサポートされていません。";
  }
  return "";
}
