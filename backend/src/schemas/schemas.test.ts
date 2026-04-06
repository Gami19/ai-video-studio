import { describe, expect, it } from "vitest";
import { analyzeSchema, generateSchema } from "./index";

describe("generateSchema", () => {
  it("有効な UUID を受け付ける", () => {
    const r = generateSchema.safeParse({
      jobId: "550e8400-e29b-41d4-a716-446655440000",
    });
    expect(r.success).toBe(true);
  });

  it("不正な jobId を拒否する", () => {
    const r = generateSchema.safeParse({ jobId: "not-a-uuid" });
    expect(r.success).toBe(false);
  });
});

describe("analyzeSchema + thumbnailBlocks", () => {
  it("thumbnailBlocks strict で未知キーを拒否", () => {
    const r = analyzeSchema.safeParse({
      frames: ["abcd"],
      thumbnailBlocks: { extra: "x" },
    });
    expect(r.success).toBe(false);
  });

  it("有効な thumbnailBlocks を受け付ける", () => {
    const r = analyzeSchema.safeParse({
      frames: ["abcd"],
      thumbnailBlocks: {
        hero: "face",
        tone: "bright",
      },
    });
    expect(r.success).toBe(true);
  });
});
