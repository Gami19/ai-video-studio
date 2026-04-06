import { PersonGeneration } from "@google/genai";

export type ThumbnailJobRecordV1 = {
  v: 1;
  imagenPrompt: string;
  personGeneration: PersonGeneration;
  ownerSub: string;
};

export function jobKey(jobId: string): string {
  return `thumb:${jobId}`;
}

export function serializeJob(record: ThumbnailJobRecordV1): string {
  return JSON.stringify({
    v: record.v,
    imagenPrompt: record.imagenPrompt,
    personGeneration: record.personGeneration,
    ownerSub: record.ownerSub,
  });
}

export function parseJob(raw: string): ThumbnailJobRecordV1 | null {
  try {
    const u = JSON.parse(raw) as {
      v?: unknown;
      imagenPrompt?: unknown;
      personGeneration?: unknown;
      ownerSub?: unknown;
    };
    if (u.v !== 1) return null;
    if (typeof u.imagenPrompt !== "string" || u.imagenPrompt.length === 0) {
      return null;
    }
    if (
      u.personGeneration !== PersonGeneration.DONT_ALLOW &&
      u.personGeneration !== PersonGeneration.ALLOW_ADULT
    ) {
      return null;
    }
    if (typeof u.ownerSub !== "string") return null;
    return {
      v: 1,
      imagenPrompt: u.imagenPrompt,
      personGeneration: u.personGeneration,
      ownerSub: u.ownerSub,
    };
  } catch {
    return null;
  }
}
