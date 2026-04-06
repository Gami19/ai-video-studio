import { Hono } from "hono";
import { GoogleGenAI } from "@google/genai";
import { zValidator } from "@hono/zod-validator";
import { flattenError } from "zod";
import type { AppEnv } from "../types";
import { generateSchema, type GenerateInput } from "../schemas";
import {
  consumeRateLimitSlot,
  getRateLimitConfig,
} from "../lib/rateLimitKv";
import { jobKey, parseJob } from "../lib/thumbnailJobRecord";

const generateRoute = new Hono<AppEnv>()
  .post(
    "/",
    zValidator("json", generateSchema, (result, c) => {
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
      const { jobId } = c.req.valid("json") as GenerateInput;
      const apiKey = c.env.GEMINI_API_KEY;
      const kv = c.env.THUMBNAIL_JOBS;

      if (!apiKey) {
        return c.json(
          { error: "GEMINI_API_KEY is not configured" },
          500
        );
      }

      const payload = c.get("accessJwtPayload");
      const ownerSub = typeof payload.sub === "string" ? payload.sub : "";
      if (!ownerSub) {
        return c.json(
          {
            error: "認証トークンに利用者識別子がありません。",
            code: "ACCESS_JWT_MISSING_SUB" as const,
          },
          401
        );
      }

      const rlCfg = getRateLimitConfig(c.env);
      const rl = await consumeRateLimitSlot(
        kv,
        "generate",
        ownerSub,
        rlCfg.generateMax,
        rlCfg.windowSec
      );
      if (!rl.ok) {
        c.header("Retry-After", String(rl.retryAfterSec));
        return c.json(
          {
            error:
              "リクエストが多すぎます。しばらく待ってから再度お試しください。",
            code: "RATE_LIMITED" as const,
            retryAfterSeconds: rl.retryAfterSec,
          },
          429
        );
      }

      const raw = await kv.get(jobKey(jobId));
      if (raw === null) {
        return c.json(
          {
            error:
              "分析の有効期限が切れたか、ジョブが見つかりません。もう一度「分析を開始」からやり直してください。",
            code: "THUMBNAIL_JOB_EXPIRED" as const,
          },
          410
        );
      }

      const job = parseJob(raw);
      if (job === null) {
        return c.json(
          {
            error:
              "ジョブデータが無効です。分析からやり直してください。",
            code: "THUMBNAIL_JOB_INVALID" as const,
          },
          410
        );
      }

      if (job.ownerSub !== ownerSub) {
        // 403 はフロントの authorizedFetch が Access 再認証を試すため使わない
        return c.json(
          {
            error:
              "このジョブにアクセスできません。分析からやり直してください。",
            code: "THUMBNAIL_JOB_FORBIDDEN" as const,
          },
          422
        );
      }

      const ai = new GoogleGenAI({ apiKey });

      try {
        const response = await ai.models.generateImages({
          model: "imagen-4.0-generate-001",
          prompt: job.imagenPrompt,
          config: {
            numberOfImages: 1,
            aspectRatio: "16:9",
            personGeneration: job.personGeneration,
          },
        });

        const imageBytes =
          response.generatedImages?.[0]?.image?.imageBytes;

        if (!imageBytes) {
          return c.json(
            { error: "Image generation failed" },
            502
          );
        }

        return c.json({ imageBase64: imageBytes });
      } catch (err: unknown) {
        console.error("Imagen generate error:", err);
        const rawMsg =
          err instanceof Error ? err.message : String(err);
        const isPaidPlan =
          rawMsg.includes("paid plans") ||
          rawMsg.includes("upgrade your account") ||
          rawMsg.includes("only available on paid");
        if (isPaidPlan) {
          return c.json(
            {
              error:
                "Imagen の画像生成は有料プランのアカウントでのみ利用できます。Google AI Studio（https://aistudio.google.com/）でプロジェクトの課金・プランを確認してください。",
              code: "IMAGEN_PAID_PLAN_REQUIRED" as const,
            },
            402
          );
        }
        return c.json(
          {
            error:
              "画像生成に失敗しました。しばらくしてから再試行するか、サーバーログの詳細を確認してください。",
            code: "IMAGE_GENERATION_FAILED" as const,
          },
          502
        );
      }
    }
  );

export { generateRoute };
