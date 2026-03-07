import type { Context } from "hono";
import { sessions } from "../manager/SessionManager";

/** POST /speak — text-to-speech on the glasses */
export async function speak(c: Context) {
  const { text, userId } = await c.req.json();

  if (!text) return c.json({ error: "text is required" }, 400);
  if (!userId) return c.json({ error: "userId is required" }, 400);

  const user = sessions.get(userId);
  if (!user?.appSession) {
    return c.json({ error: `No active session for user ${userId}` }, 404);
  }

  try {
    await user.audio.speak(text);
    return c.json({ success: true, message: "Text-to-speech started", userId });
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
}

/** POST /stop-audio — stop audio playback */
export async function stopAudio(c: Context) {
  const { userId } = await c.req.json();

  if (!userId) return c.json({ error: "userId is required" }, 400);

  const user = sessions.get(userId);
  if (!user?.appSession) {
    return c.json({ error: `No active session for user ${userId}` }, 404);
  }

  try {
    await user.audio.stopAudio();
    return c.json({ success: true, message: "Audio stopped", userId });
  } catch (error: any) {
    return c.json({ error: error.message }, 500);
  }
}
