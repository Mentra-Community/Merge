import { User } from "../session/User";

/**
 * SessionManager — thin lookup for User objects.
 *
 * Just a Map<userId, User> with getOrCreate/get/remove.
 * All per-user state lives inside the User class itself.
 */
export class SessionManager {
  private users: Map<string, User> = new Map();

  /** Get an existing user or create a new one */
  getOrCreate(userId: string): User {
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

  /** Clean up and remove a user */
  remove(userId: string): void {
    const user = this.users.get(userId);
    if (user) {
      user.cleanup();
      this.users.delete(userId);
      console.log(`[SessionManager] Removed user: ${userId}`);
    }
  }
}

/** Singleton — import this everywhere */
export const sessions = new SessionManager();
