import type { Context } from "hono";
import { sessions } from "../manager/SessionManager";

/**
 * SSE endpoint for real-time insight streaming.
 * Same pattern as New-Mentra-AI's chat stream.
 */
export const insightStream = (c: Context) => {
  const userId = c.req.query("userId");

  if (!userId) {
    return c.json({ error: "userId is required" }, 400);
  }

  // Set up SSE headers
  return new Response(
    new ReadableStream({
      start(controller) {
        const encoder = new TextEncoder();
        let heartbeatInterval: ReturnType<typeof setInterval> | null = null;
        let checkClosedInterval: ReturnType<typeof setInterval> | null = null;
        let cleaned = false;

        // Get or create user first
        const user = sessions.getOrCreate(userId);

        const send = (data: string) => {
          try {
            controller.enqueue(encoder.encode(`data: ${data}\n\n`));
          } catch (err) {
            // Stream closed — trigger cleanup
            doCleanup();
          }
        };

        const doCleanup = () => {
          if (cleaned) return;
          cleaned = true;
          if (heartbeatInterval) clearInterval(heartbeatInterval);
          if (checkClosedInterval) clearInterval(checkClosedInterval);
          user.removeSSEClient(send);
        };

        // Send connected event
        send(JSON.stringify({ type: 'connected' }));

        // Send existing insight history
        const recentInsights = user.insightHistory.getRecentInsights(50);
        const insightMessages = recentInsights.map((insight) => ({
          id: insight.id,
          text: insight.text,
          timestamp: insight.timestamp.toISOString(),
          agentType: insight.agentType,
          reasoning: insight.reasoning,
        }));
        send(JSON.stringify({ type: 'history', insights: insightMessages }));

        // Send current session status
        const isActive = user.appSession !== null;
        send(JSON.stringify({ type: 'session_heartbeat', active: isActive }));

        // Register SSE client for real-time updates
        user.addSSEClient(send);

        // Set up heartbeat to keep connection alive
        heartbeatInterval = setInterval(() => {
          const isActive = user.appSession !== null;
          send(JSON.stringify({ type: 'session_heartbeat', active: isActive }));
        }, 15000);

        // Periodic check if stream is still alive
        checkClosedInterval = setInterval(() => {
          try {
            controller.enqueue(encoder.encode(': keepalive\n\n'));
          } catch {
            doCleanup();
          }
        }, 30000);
      },
      cancel() {
        // Called when the client disconnects — ReadableStream API
        // Note: cleanup is handled by doCleanup which fires when enqueue throws
      },
    }),
    {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
      },
    }
  );
};
