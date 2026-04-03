import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import {
  GenerateVideosOperation,
  GoogleGenAI,
  type GenerateVideosParameters,
} from "@google/genai";
import { flattenError } from "zod";
import type { Env } from "../types";
import {
  stripBase64Prefix,
  videoJobStartSchema,
  type VideoJobStartInput,
} from "../schemas";

const DEFAULT_VEO_MODEL = "veo-3.1-fast-generate-preview";

function operationStub(name: string): GenerateVideosOperation {
  const op = new GenerateVideosOperation();
  op.name = name;
  return op;
}

function buildGenerateParams(
  body: VideoJobStartInput,
  model: string
): GenerateVideosParameters {
  const baseConfig = {
    numberOfVideos: 1,
    personGeneration: "allow_adult",
    ...(body.config?.aspectRatio
      ? { aspectRatio: body.config.aspectRatio }
      : {}),
    ...(body.config?.resolution ? { resolution: body.config.resolution } : {}),
    ...(body.config?.durationSeconds !== undefined
      ? { durationSeconds: body.config.durationSeconds }
      : {}),
  };

  if (body.mode === "image_prompt") {
    return {
      model,
      prompt: body.prompt,
      image: {
        imageBytes: stripBase64Prefix(body.imageBase64),
        mimeType: body.imageMimeType,
      },
      config: baseConfig,
    };
  }

  if (body.mode === "reference_three") {
    return {
      model,
      prompt: body.prompt,
      config: {
        ...baseConfig,
        referenceImages: body.references.map((r) => ({
          image: {
            imageBytes: stripBase64Prefix(r.imageBase64),
            mimeType: r.mimeType,
          },
          referenceType: r.referenceType ?? "ASSET",
        })),
      },
    };
  }

  return {
    model,
    prompt: body.prompt,
    image: {
      imageBytes: stripBase64Prefix(body.firstFrameBase64),
      mimeType: body.firstMimeType,
    },
    config: {
      ...baseConfig,
      lastFrame: {
        imageBytes: stripBase64Prefix(body.lastFrameBase64),
        mimeType: body.lastMimeType,
      },
    },
  };
}

function operationStatusJson(op: GenerateVideosOperation): Record<string, unknown> {
  const gv = op.response?.generatedVideos?.[0];
  const v = gv?.video;
  const hasBytes = Boolean(v?.videoBytes && v.videoBytes.length > 0);
  const hasUri = Boolean(v?.uri && v.uri.length > 0);

  return {
    operationName: op.name ?? null,
    done: op.done ?? false,
    error: op.error ?? null,
    raiMediaFilteredCount: op.response?.raiMediaFilteredCount ?? null,
    raiMediaFilteredReasons: op.response?.raiMediaFilteredReasons ?? null,
    videoReady: Boolean(op.done && v && (hasUri || hasBytes)),
    videoMimeType: v?.mimeType ?? null,
  };
}

function base64ToArrayBuffer(b64: string): ArrayBuffer {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i += 1) {
    out[i] = bin.charCodeAt(i);
  }
  return out.buffer;
}

async function videoToArrayBuffer(
  video: { uri?: string; videoBytes?: string; mimeType?: string },
  apiKey: string
): Promise<{ buffer: ArrayBuffer; mimeType: string }> {
  if (video.videoBytes && video.videoBytes.length > 0) {
    const clean = stripBase64Prefix(video.videoBytes);
    return {
      buffer: base64ToArrayBuffer(clean),
      mimeType: video.mimeType ?? "video/mp4",
    };
  }

  if (video.uri && video.uri.length > 0) {
    const res = await fetch(video.uri, {
      headers: { "x-goog-api-key": apiKey },
    });
    if (!res.ok) {
      throw new Error(`Video fetch failed: HTTP ${res.status}`);
    }
    const buffer = await res.arrayBuffer();
    const mime =
      video.mimeType ?? res.headers.get("content-type") ?? "video/mp4";
    return { buffer, mimeType: mime };
  }

  throw new Error("No video bytes or URI in generation result");
}

const videoRoute = new Hono<{ Bindings: Env }>()
  .post(
    "/jobs",
    zValidator("json", videoJobStartSchema, (result, c) => {
      if (!result.success) {
        const flattened = flattenError(result.error);
        const msg =
          Object.values(flattened.fieldErrors).flat().join(", ") ||
          flattened.formErrors.join(", ") ||
          "Validation failed";
        return c.json({ error: msg }, 400);
      }
    }),
    async (c) => {
      const apiKey = c.env.GEMINI_API_KEY;
      if (!apiKey) {
        return c.json({ error: "GEMINI_API_KEY is not configured" }, 500);
      }

      const body = c.req.valid("json") as VideoJobStartInput;
      const model =
        c.env.VEO_MODEL?.trim() && c.env.VEO_MODEL.trim().length > 0
          ? c.env.VEO_MODEL.trim()
          : DEFAULT_VEO_MODEL;

      const ai = new GoogleGenAI({ apiKey });

      try {
        const params = buildGenerateParams(body, model);
        const operation = await ai.models.generateVideos(params);
        const name = operation.name;
        if (!name) {
          console.error("Veo: missing operation.name");
          return c.json({ error: "Failed to start video generation" }, 502);
        }
        return c.json({ operationName: name });
      } catch (err) {
        console.error("Veo generateVideos error:", err);
        const message = err instanceof Error ? err.message : String(err);
        return c.json({ error: "Video generation start failed", message }, 502);
      }
    }
  )
  .get("/operations", async (c) => {
    const apiKey = c.env.GEMINI_API_KEY;
    if (!apiKey) {
      return c.json({ error: "GEMINI_API_KEY is not configured" }, 500);
    }

    const name = c.req.query("name")?.trim();
    if (!name) {
      return c.json({ error: "Query parameter \"name\" is required" }, 400);
    }

    const ai = new GoogleGenAI({ apiKey });
    const stub = operationStub(name);

    try {
      const op = await ai.operations.getVideosOperation({ operation: stub });
      return c.json(operationStatusJson(op));
    } catch (err) {
      console.error("Veo getVideosOperation error:", err);
      const message = err instanceof Error ? err.message : String(err);
      return c.json({ error: "Failed to get operation status", message }, 502);
    }
  })
  .get("/download", async (c) => {
    const apiKey = c.env.GEMINI_API_KEY;
    if (!apiKey) {
      return c.json({ error: "GEMINI_API_KEY is not configured" }, 500);
    }

    const name = c.req.query("name")?.trim();
    if (!name) {
      return c.json({ error: "Query parameter \"name\" is required" }, 400);
    }

    const ai = new GoogleGenAI({ apiKey });
    const stub = operationStub(name);

    try {
      const op = await ai.operations.getVideosOperation({ operation: stub });

      if (!op.done) {
        return c.json({ error: "Video generation not finished yet" }, 409);
      }

      if (op.error) {
        return c.json(
          { error: "Video generation failed", details: op.error },
          502
        );
      }

      const video = op.response?.generatedVideos?.[0]?.video;
      if (!video) {
        const rai = op.response?.raiMediaFilteredCount;
        if (rai !== undefined && rai > 0) {
          return c.json(
            {
              error: "Video was filtered (RAI)",
              raiMediaFilteredReasons:
                op.response?.raiMediaFilteredReasons ?? [],
            },
            502
          );
        }
        return c.json({ error: "No video in completed operation" }, 502);
      }

      const { buffer, mimeType } = await videoToArrayBuffer(video, apiKey);

      return new Response(buffer, {
        status: 200,
        headers: {
          "Content-Type": mimeType.split(";")[0]?.trim() || "video/mp4",
          "Cache-Control": "private, no-store",
        },
      });
    } catch (err) {
      console.error("Veo download error:", err);
      const message = err instanceof Error ? err.message : String(err);
      return c.json({ error: "Failed to download video", message }, 502);
    }
  });

export { videoRoute };
