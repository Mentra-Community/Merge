import type { Context } from "hono";
import { sessions } from "../manager/SessionManager";

/**
 * GET /api/settings — get current settings for a user
 */
export const getSettings = (c: Context) => {
  const userId = c.req.query("userId");

  if (!userId) {
    return c.json({ error: "userId is required" }, 400);
  }

  const user = sessions.get(userId);

  return c.json({
    userId,
    frequency: user?.getFrequency() || 'high',
    theme: 'light', // Default, frontend manages theme via localStorage
  });
};

/**
 * PATCH /api/settings — update settings for a user
 */
export const updateSettings = async (c: Context) => {
  try {
    const body = await c.req.json();
    const { userId, frequency, theme } = body;

    if (!userId) {
      return c.json({ error: "userId is required" }, 400);
    }

    const user = sessions.get(userId);

    if (frequency && ['low', 'medium', 'high'].includes(frequency)) {
      if (user) {
        user.setFrequency(frequency);
      }
    }

    return c.json({
      userId,
      frequency: user?.getFrequency() || frequency || 'high',
      theme: theme || 'light',
    });
  } catch (err) {
    return c.json({ error: "Invalid request body" }, 400);
  }
};
