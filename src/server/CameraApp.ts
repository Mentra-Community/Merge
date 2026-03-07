/**
 * CameraApp — MentraOS AppServer for the Camera template.
 *
 * Handles the glasses lifecycle (onSession/onStop).
 * All per-user state is managed by the User class via SessionManager.
 */

import { AppServer, AppSession } from "@mentra/sdk";
import { sessions } from "./manager/SessionManager";

export interface CameraAppConfig {
  packageName: string;
  apiKey: string;
  port: number;
  cookieSecret?: string;
}

export class CameraApp extends AppServer {
  constructor(config: CameraAppConfig) {
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
    console.log(`📸 Camera session started for ${userId}`);
    const user = sessions.getOrCreate(userId);
    user.setAppSession(session);
  }

  /** Called when a user closes the app or disconnects */
  protected async onStop(
    sessionId: string,
    userId: string,
    reason: string,
  ): Promise<void> {
    console.log(`👋 Camera session ended for ${userId}: ${reason}`);
    try {
      sessions.remove(userId);
      console.log(`Cleaned up session for ${userId}`);
    } catch (err) {
      console.error(`Error during session cleanup for ${userId}:`, err);
    }
  }
}
