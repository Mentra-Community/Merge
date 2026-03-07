import type { Context } from "hono";

export const getHealth = (c: Context) => {
  return c.json({ status: "ok", app: "mentra-merge", timestamp: new Date().toISOString() });
};
