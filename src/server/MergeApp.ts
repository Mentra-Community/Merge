/**
 * MergeApp — MentraOS AppServer for Merge.
 *
 * Handles the glasses lifecycle (onSession/onStop).
 * All per-user state is managed by the User class via SessionManager.
 */

import { AppServer, AppSession } from "@mentra/sdk";
import { sessions } from "./manager/SessionManager";

export interface MergeAppConfig {
  packageName: string;
  apiKey: string;
  port: number;
  cookieSecret?: string;
}

export class MergeApp extends AppServer {
  constructor(config: MergeAppConfig) {
    super({
      packageName: config.packageName,
      apiKey: config.apiKey,
      port: config.port,
      cookieSecret: config.cookieSecret,
    });
  }

  /** Called when a user launches the app on their glasses */
  protected async onSession(
    session: AppSession,
    sessionId: string,
    userId: string,
  ): Promise<void> {
    console.log(`[Merge] Session started for ${userId}`);
    const user = sessions.getOrCreate(userId);

    // Passively cache location updates for faster agent lookups
    session.events.onLocation((data) => {
      user.updateLocation(data.lat, data.lng);
    });

    // Set timezone from SDK settings
    const userTimezone = session.settings.getMentraOS<string>('userTimezone');
    if (userTimezone) {
      user.location.setTimezone(userTimezone);
    }
    session.settings.onMentraosChange<string>('userTimezone', (newTimezone) => {
      user.location.setTimezone(newTimezone);
    });

    await user.setAppSession(session);
  }

  /** Called when a user closes the app or disconnects */
  protected async onStop(
    sessionId: string,
    userId: string,
    reason: string,
  ): Promise<void> {
    console.log(`[Merge] Session ended for ${userId}: ${reason}`);
    try {
      sessions.softRemove(userId);
    } catch (err) {
      console.error(`Error during session cleanup for ${userId}:`, err);
    }
  }
}
