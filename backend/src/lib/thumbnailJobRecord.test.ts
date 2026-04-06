import { describe, expect, it } from "vitest";
import { PersonGeneration } from "@google/genai";
import { jobKey, parseJob, serializeJob } from "./thumbnailJobRecord";

describe("thumbnailJobRecord", () => {
  it("serialize / parse が往復する", () => {
    const record = {
      v: 1 as const,
      imagenPrompt: "A photo of a coffee cup",
      personGeneration: PersonGeneration.DONT_ALLOW,
      ownerSub: "user-123",
    };
    const key = jobKey("550e8400-e29b-41d4-a716-446655440000");
    expect(key).toBe("thumb:550e8400-e29b-41d4-a716-446655440000");

    const raw = serializeJob(record);
    const back = parseJob(raw);
    expect(back).toEqual(record);
  });

  it("不正 JSON は null", () => {
    expect(parseJob("not json")).toBeNull();
  });
});
