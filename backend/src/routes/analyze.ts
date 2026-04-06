import { Hono } from "hono";
import { GoogleGenAI, Type } from "@google/genai";
import { zValidator } from "@hono/zod-validator";
import { flattenError } from "zod";
import type { AppEnv } from "../types";
import {
  analyzeSchema,
  normalizeFrames,
  type AnalyzeInput,
} from "../schemas";
import {
  formatThumbnailBlocksForPrompt,
  IMAGEN_PROMPT_MAX_CHARS,
  resolvePersonGeneration,
  truncateImagenPrompt,
} from "../lib/thumbnailIntent";
import {
  consumeRateLimitSlot,
  getRateLimitConfig,
} from "../lib/rateLimitKv";
import { jobKey, serializeJob } from "../lib/thumbnailJobRecord";

/** Imagen 用。モデルが prompt を返さない・切れたときの最低限の英語プロンプト */
const FALLBACK_IMAGEN_PROMPT =
  "Professional YouTube thumbnail, 16:9, clear subject, readable at small size, matching the video mood.";

function normalizeAnalysisField(value: unknown): string | null {
  if (typeof value === "string") {
    const t = value.trim();
    return t.length > 0 ? t : null;
  }
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    const rec = value as Record<string, unknown>;
    const parts: string[] = [];
    for (const [k, v] of Object.entries(rec)) {
      if (typeof v === "string") {
        const t = v.trim();
        if (t) parts.push(`${k}: ${t}`);
      } else if (v !== null && typeof v === "object" && !Array.isArray(v)) {
        const inner = normalizeAnalysisField(v);
        if (inner) parts.push(`${k}:\n${inner}`);
      }
    }
    if (parts.length > 0) return parts.join("\n\n");
  }
  return null;
}

function parseGeminiJson(text: string): { analysis: string; prompt: string } | null {
  const raw = text.trim();
  const withoutFence = raw
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/, "")
    .trim();

  const candidates = [withoutFence];
  const firstBrace = withoutFence.indexOf("{");
  const lastBrace = withoutFence.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    candidates.push(withoutFence.slice(firstBrace, lastBrace + 1));
  }

  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as {
        analysis?: unknown;
        prompt?: unknown;
      };
      const analysis = normalizeAnalysisField(parsed.analysis);
      if (!analysis) continue;

      const promptRaw =
        typeof parsed.prompt === "string" ? parsed.prompt.trim() : "";
      const prompt =
        promptRaw.length > 0 ? promptRaw : FALLBACK_IMAGEN_PROMPT;

      return { analysis, prompt };
    } catch {
      // try next candidate
    }
  }

  return null;
}

const analyzeResponseSchema = {
  type: Type.OBJECT,
  properties: {
    analysis: {
      type: Type.STRING,
      description:
        "日本語で1本の文字列。ジャンル・内容・ビジュアル・雰囲気をまとめて記述。ネストやオブジェクトにしない。",
    },
    prompt: {
      type: Type.STRING,
      description:
        "Imagen 用の英語サムネイル生成プロンプト。16:9 YouTube 向け。約480トークン以下の密度。具体的で視覚的。",
    },
  },
  required: ["analysis", "prompt"],
} as const;

function parseJobTtlSeconds(raw: string | undefined): number {
  const n = parseInt(raw ?? "3600", 10);
  if (!Number.isFinite(n)) return 3600;
  return Math.min(Math.max(n, 60), 86_400);
}

const analyzeRoute = new Hono<AppEnv>()
  .post(
    "/",
    zValidator("json", analyzeSchema, (result, c) => {
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
      const input = c.req.valid("json") as AnalyzeInput;
      const { frames, userHint, thumbnailBlocks } = input;
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
        "analyze",
        ownerSub,
        rlCfg.analyzeMax,
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

      const ai = new GoogleGenAI({ apiKey });
      const normalizedFrames = normalizeFrames(frames);

      const imageParts = normalizedFrames.map((base64) => ({
        inlineData: {
          mimeType: "image/jpeg" as const,
          data: base64,
        },
      }));

      const blockSection = formatThumbnailBlocksForPrompt(thumbnailBlocks);

      const promptText = `
あなたは動画サムネイル用のプロンプト設計者です。

【重要: 優先順位】
- 次の「構造化された指示（ブロック）」を最優先してください。
- 「ユーザーの補足ヒント」はブロックで足りない情報の補足のみに使い、ブロックと矛盾する解釈は禁止です。

【構造化された指示（ブロック）】
${blockSection || "（未指定）"}

【ユーザーの補足ヒント】
${userHint ? userHint.trim() : "（なし）"}

【出力要件】
1. analysis: 日本語の1文字列のみ。動画の内容・雰囲気を利用者向けに簡潔に。
2. prompt: Imagen 向けの英語1文字列。Subject / Context / Style を含む具体的な視覚記述。
   - 16:9 の YouTube サムネイル向け。一覧の小さな表示でも主題が分かる構図。
   - 英語トークン数はおおよそ 480 以下になるよう、簡潔に。
   - ブロックで「画像内の文字: なし」とある場合は、画像内に文字を描かない。
   - ブロックで短い日本語の載せ文字がある場合のみ、画像内の短い英語テキストを含めてよい（極めて短く）。
   - 主役が「顔・人物」でない、または注意事項で顔出し不可のときは、人物や顔を含めない。
   - 注意事項（avoid）を尊重する。

出力はスキーマに従う JSON のみ。マークダウンや説明文は付けない。
analysis は必ず1つの文字列（日本語）。オブジェクト分割は禁止。
prompt は英語の1文字列。
`.trim();

      const contents = [...imageParts, { text: promptText }];

      try {
        const response = await ai.models.generateContent({
          model: "gemini-2.5-flash",
          contents,
          config: {
            responseMimeType: "application/json",
            responseSchema: analyzeResponseSchema,
            maxOutputTokens: 4096,
          },
        });

        const text = response.text ?? "";

        if (!text) {
          return c.json(
            { error: "No response from Gemini" },
            502
          );
        }

        const parsed = parseGeminiJson(text);
        if (!parsed) {
          console.error("Invalid Gemini JSON response:", text.slice(0, 500));
          return c.json(
            { error: "Invalid JSON response from Gemini" },
            502
          );
        }

        const imagenPrompt = truncateImagenPrompt(
          parsed.prompt,
          IMAGEN_PROMPT_MAX_CHARS
        );
        const personGeneration = resolvePersonGeneration(thumbnailBlocks);

        if (c.env.LOG_PROMPT_PREVIEW === "true") {
          console.log(
            "[thumbnail] imagen prompt preview:",
            imagenPrompt.slice(0, 200)
          );
        }

        const jobId = crypto.randomUUID();
        const ttlSec = parseJobTtlSeconds(c.env.THUMBNAIL_JOB_TTL_SECONDS);
        const record = serializeJob({
          v: 1,
          imagenPrompt,
          personGeneration,
          ownerSub,
        });

        try {
          await kv.put(jobKey(jobId), record, { expirationTtl: ttlSec });
        } catch (kvErr) {
          console.error("KV put failed:", kvErr);
          return c.json(
            {
              error:
                "一時的にジョブを保存できませんでした。しばらくしてから再度お試しください。",
              code: "THUMBNAIL_JOB_STORE_FAILED" as const,
            },
            503
          );
        }

        return c.json({
          jobId,
          analysis: parsed.analysis,
        });
      } catch (err) {
        console.error("Gemini analyze error:", err);
        throw err;
      }
    }
  );

export { analyzeRoute };
