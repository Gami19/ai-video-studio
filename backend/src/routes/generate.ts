import { Hono } from "hono";
import { GoogleGenAI } from "@google/genai";
import { zValidator } from "@hono/zod-validator";
import { flattenError } from "zod";
import type { AppEnv } from "../types";
import { generateSchema, type GenerateInput } from "../schemas";

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
      const { prompt } = c.req.valid("json") as GenerateInput;
      const apiKey = c.env.GEMINI_API_KEY;

      if (!apiKey) {
        return c.json(
          { error: "GEMINI_API_KEY is not configured" },
          500
        );
      }

      const ai = new GoogleGenAI({ apiKey });

      const enhancedPrompt = `YouTube thumbnail style, eye-catching, high contrast, bold composition, ${prompt}, professional design, 16:9 aspect ratio feel`;

      try {
        const response = await ai.models.generateImages({
          model: "imagen-4.0-generate-001",
          prompt: enhancedPrompt,
          config: {
            numberOfImages: 1,
            aspectRatio: "16:9",
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
        const raw =
          err instanceof Error ? err.message : String(err);
        const isPaidPlan =
          raw.includes("paid plans") ||
          raw.includes("upgrade your account") ||
          raw.includes("only available on paid");
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
