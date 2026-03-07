import type { Context } from "hono";
import { sessions } from "../manager/SessionManager";

/** GET /theme-preference */
export async function getThemePreference(c: Context) {
  const userId = c.req.query("userId");

  if (!userId) return c.json({ error: "userId is required" }, 400);

  const user = sessions.get(userId);
  if (!user?.appSession) {
    return c.json({ error: `No active session for user ${userId}` }, 404);
  }

  try {
    const theme = await user.storage.getTheme();
    return c.json({ theme, userId });
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
}

/** POST /theme-preference */
export async function setThemePreference(c: Context) {
  const { userId, theme } = await c.req.json();

  if (!userId) return c.json({ error: "userId is required" }, 400);
  if (!theme || (theme !== "dark" && theme !== "light")) {
    return c.json({ error: 'theme must be "dark" or "light"' }, 400);
  }

  const user = sessions.get(userId);
  if (!user?.appSession) {
    return c.json({ error: `No active session for user ${userId}` }, 404);
  }

  try {
    await user.storage.setTheme(theme);
    return c.json({ success: true, theme, userId });
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
}
