import { describe, expect, it } from "vitest";
import { PersonGeneration } from "@google/genai";
import {
  formatThumbnailBlocksForPrompt,
  resolvePersonGeneration,
  truncateImagenPrompt,
} from "./thumbnailIntent";
import type { ThumbnailBlocksInput } from "../schemas/thumbnailBlocks";

describe("resolvePersonGeneration", () => {
  it("顔主役で allow_adult", () => {
    expect(
      resolvePersonGeneration({ hero: "face" } as ThumbnailBlocksInput)
    ).toBe(PersonGeneration.ALLOW_ADULT);
  });

  it("画面主役は dont_allow", () => {
    expect(
      resolvePersonGeneration({ hero: "screen" } as ThumbnailBlocksInput)
    ).toBe(PersonGeneration.DONT_ALLOW);
  });

  it("avoid に顔出し不要があれば NG 優先で dont_allow", () => {
    expect(
      resolvePersonGeneration({
        hero: "face",
        avoid: "顔出しはしたくない",
      } as ThumbnailBlocksInput)
    ).toBe(PersonGeneration.DONT_ALLOW);
  });
});

describe("truncateImagenPrompt", () => {
  it("max を超えたら切り詰める", () => {
    const s = "a".repeat(100);
    expect(truncateImagenPrompt(s, 20).length).toBe(20);
  });
});

describe("formatThumbnailBlocksForPrompt", () => {
  it("未指定は空文字", () => {
    expect(formatThumbnailBlocksForPrompt(undefined)).toBe("");
  });

  it("主役とトーンを含む", () => {
    const t = formatThumbnailBlocksForPrompt({
      hero: "product",
      tone: "minimal",
    });
    expect(t).toContain("モノ・商品");
    expect(t).toContain("ミニマル");
  });
});
