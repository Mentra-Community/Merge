import { User } from "../session/User";
import { SESSION_GRACE_PERIOD_MS } from "../config";

/**
 * SessionManager — user session management with grace period.
 * Same pattern as New-Mentra-AI: soft disconnect keeps User alive for 60s.
 */
export class SessionManager {
  private users: Map<string, User> = new Map();
  private removalTimers: Map<string, NodeJS.Timeout> = new Map();

  /** Get an existing user or create a new one */
  getOrCreate(userId: string): User {
    // Cancel any pending removal
    this.cancelRemoval(userId);

    let user = this.users.get(userId);
    if (!user) {
      user = new User(userId);
      this.users.set(userId, user);
      console.log(`[SessionManager] Created user: ${userId}`);
    }
    return user;
  }

  /** Get an existing user (undefined if not found) */
  get(userId: string): User | undefined {
    return this.users.get(userId);
  }

  /** Soft disconnect — keep user alive for grace period */
  softRemove(userId: string): void {
    const user = this.users.get(userId);
    if (!user) return;

    // Detach the glasses session but keep the user object
    user.clearAppSession();

    // Broadcast disconnection to SSE clients
    user.broadcastInsightEvent({ type: 'session_reconnecting' });

    // Clear any existing timer before creating a new one
    this.cancelRemoval(userId);

    // Start grace period timer
    const timer = setTimeout(() => {
      this.remove(userId);
    }, SESSION_GRACE_PERIOD_MS);

    this.removalTimers.set(userId, timer);
    console.log(`[SessionManager] Soft-removed ${userId}, grace period ${SESSION_GRACE_PERIOD_MS}ms`);
  }

  /** Cancel pending removal (user reconnected within grace period) */
  cancelRemoval(userId: string): void {
    const timer = this.removalTimers.get(userId);
    if (timer) {
      clearTimeout(timer);
      this.removalTimers.delete(userId);
      console.log(`[SessionManager] Cancelled removal for ${userId}`);
    }
  }

  /** Full cleanup and removal */
  remove(userId: string): void {
    // Clear any pending timer first
    this.cancelRemoval(userId);

    const user = this.users.get(userId);
    if (user) {
      user.broadcastInsightEvent({ type: 'session_ended' });
      user.cleanup();
      this.users.delete(userId);
      console.log(`[SessionManager] Removed user: ${userId}`);
    }
  }
}

/** Singleton — import this everywhere */
export const sessions = new SessionManager();
