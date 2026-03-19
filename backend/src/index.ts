import { Hono } from "hono";

const app = new Hono();

app.get("/", (c) => {
  return c.json({ message: "ai-video-studio API" });
});

export default app;
