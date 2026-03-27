import { Hono } from "hono";
import { GoogleGenAI, Type } from "@google/genai";
import { zValidator } from "@hono/zod-validator";
import { flattenError } from "zod";
import type { Env } from "../types";
import {
  analyzeSchema,
  normalizeFrames,
  type AnalyzeInput,
} from "../schemas";

/** Imagen 用。モデルが prompt を返さない・切れたときの最低限の英語プロンプト */
const FALLBACK_IMAGEN_PROMPT =
  "Professional YouTube thumbnail, eye-catching composition, vivid lighting, high detail, cinematic, matching the video subject and mood.";

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
        "Imagen 用の英語サムネイル生成プロンプト。具体的で視覚的な記述。",
    },
  },
  required: ["analysis", "prompt"],
} as const;

const analyzeRoute = new Hono<{ Bindings: Env }>()
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
      const { frames, userHint } = c.req.valid("json") as AnalyzeInput;
      const apiKey = c.env.GEMINI_API_KEY;

      if (!apiKey) {
        return c.json(
          { error: "GEMINI_API_KEY is not configured" },
          500
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

      const promptText = `
これらは動画のキーフレームです。
${userHint ? `ユーザーのヒント: ${userHint}` : ""}

以下を分析してください：
1. 動画のジャンル・内容
2. 主なビジュアル要素・雰囲気
3. Imagen用のサムネイル生成プロンプト(英語)

出力はスキーマに従うJSONのみ。マークダウンのコードブロックや説明文は付けない。
analysis は必ず1つの文字列（日本語）。オブジェクトやフィールド分割は禁止。
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

        return c.json({
          analysis: parsed.analysis,
          prompt: parsed.prompt,
        });
      } catch (err) {
        console.error("Gemini analyze error:", err);
        throw err;
      }
    }
  );

export { analyzeRoute };
