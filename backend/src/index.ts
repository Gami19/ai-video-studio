import { Hono } from "hono";
import { cors } from "hono/cors";
import type { Env } from "./types";
import { analyzeRoute } from "./routes/analyze";
import { generateRoute } from "./routes/generate";
import { videoRoute } from "./routes/video";

const MAX_BODY_BYTES = 26 * 1024 * 1024; // 26MB (25MB frames + margin)

const app = new Hono<{ Bindings: Env }>()
  .use("*", async (c, next) => {
    const originsStr = c.env.ALLOWED_ORIGINS ?? "http://localhost:5173";
    const origins = originsStr.split(",").map((o) => o.trim()).filter(Boolean);

    return cors({
      origin: (origin) => {
        if (origins.includes(origin)) {
          return origin;
        }
        return null;
      },
      allowMethods: ["GET", "POST", "OPTIONS"],
      allowHeaders: ["Content-Type"],
    })(c, next);
  })
  .use("/api/*", async (c, next) => {
    const contentLength = c.req.header("Content-Length");
    if (contentLength) {
      const size = parseInt(contentLength, 10);
      if (!Number.isNaN(size) && size > MAX_BODY_BYTES) {
        return c.json(
          { error: "Request body too large" },
          400
        );
      }
    }
    return next();
  })
  .get("/", (c) => {
    return c.json({ message: "ai-video-studio API" });
  })
  .route("/api/analyze", analyzeRoute)
  .route("/api/generate", generateRoute)
  .route("/api/video", videoRoute)
  .onError((err, c) => {
    console.error("Unhandled error:", err);

    const isProd = (c.env as Env & { ENVIRONMENT?: string }).ENVIRONMENT !== "development";

    if (isProd) {
      return c.json({ error: "An error occurred" }, 500);
    }

    return c.json(
      {
        error: "An error occurred",
        message: err instanceof Error ? err.message : String(err),
      },
      500
    );
  });

export default app;
