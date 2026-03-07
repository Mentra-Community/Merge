import { AppSession } from "@mentra/sdk";
import { InsightHistoryManager, type InsightEntry } from "../manager/InsightHistoryManager";
import { LocationManager } from "../manager/LocationManager";
import { MergeResponseHandler } from "../mastra/agents";
import { UTTERANCE_TIMEOUT_MS } from "../config";

const MAX_EVENT_QUEUE_SIZE = 100;

/**
 * User — per-user state container.
 * Composes managers and the Merge response handler.
 * Created on connect, destroyed after grace period.
 */
export class User {
  /** Active glasses connection, null when webview-only */
  appSession: AppSession | null = null;

  /** Location manager with reverse geocoding cache */
  location: LocationManager;

  /** In-memory insight history for webview display */
  insightHistory: InsightHistoryManager;

  /** Merge AI response handler */
  private responseHandler: MergeResponseHandler | null = null;

  /** Transcription buffering state */
  private currentUtteranceBuffer: string = "";
  private utteranceTimer: NodeJS.Timeout | null = null;

  /** SSE clients for broadcasting events */
  private sseClients: Set<(data: string) => void> = new Set();

  /** Event queue for events that arrive before SSE connects */
  private eventQueue: any[] = [];

  /** Event listener unsubscribers for cleanup */
  private eventUnsubscribers: (() => void)[] = [];

  constructor(public readonly userId: string) {
    this.insightHistory = new InsightHistoryManager();
    this.location = new LocationManager(userId);
  }

  /** Wire up the onInsight callback */
  private wireInsightCallback(): void {
    if (!this.responseHandler) return;
    this.responseHandler.onInsight = (insight) => {
      const entry = this.insightHistory.addInsight(
        insight.text,
        insight.agentType,
        insight.reasoning
      );
      this.broadcastInsightEvent({
        type: 'insight',
        id: entry.id,
        text: entry.text,
        timestamp: entry.timestamp.toISOString(),
        agentType: entry.agentType,
        reasoning: entry.reasoning,
      });
    };
  }

  /** Wire up a glasses connection */
  async setAppSession(session: AppSession): Promise<void> {
    this.appSession = session;

    // Unsubscribe any existing listeners from a previous session
    this.unsubscribeEventListeners();

    // Load frequency from SimpleStorage synchronously before setting up listeners
    let frequency: 'low' | 'medium' | 'high' = 'high';
    try {
      const value = await session.simpleStorage.get('insight_frequency');
      frequency = (value as 'low' | 'medium' | 'high') || 'high';
      session.logger.info(`Initial insight frequency: ${frequency}`);
    } catch (err) {
      session.logger.error(`Failed to load frequency setting: ${err}`);
    }

    // Create the response handler BEFORE setting up transcription listener
    this.responseHandler = new MergeResponseHandler(session, this.location, frequency);
    this.wireInsightCallback();

    // Set up transcription listener — responseHandler is guaranteed to exist
    this.setupTranscriptionListener(session);

    // Broadcast session started
    this.broadcastInsightEvent({ type: 'session_started' });
    this.broadcastInsightEvent({ type: 'session_reconnected' });
    console.log(`[User] Merge ready for ${this.userId}`);
  }

  /** Unsubscribe all event listeners from previous session */
  private unsubscribeEventListeners(): void {
    for (const unsub of this.eventUnsubscribers) {
      try { unsub(); } catch {}
    }
    this.eventUnsubscribers = [];
  }

  /** Set up transcription listener with utterance buffering */
  private setupTranscriptionListener(session: AppSession): void {
    const processBufferAndReset = (reason: 'isFinal' | 'timeout') => {
      if (this.utteranceTimer) {
        clearTimeout(this.utteranceTimer);
        this.utteranceTimer = null;
      }

      const textToProcess = this.currentUtteranceBuffer.trim();
      if (textToProcess.length > 0) {
        session.logger.info(`Processing utterance (reason: ${reason}): "${textToProcess}"`);
        // Broadcast processing event for webview thinking indicator
        this.broadcastInsightEvent({ type: 'processing' });
        const timestamp = Date.now();
        this.responseHandler?.processTranscript(textToProcess, timestamp).catch(error => {
          session.logger.error(`Failed to process transcript: ${error}`);
        });
      }

      this.currentUtteranceBuffer = "";
    };

    const unsubTranscription = session.events.onTranscription((data) => {
      session.logger.info(`Transcription Event: "${data.text}", isFinal: ${data.isFinal}`);

      const isNewUtterance = this.currentUtteranceBuffer.length === 0 && data.text.trim().length > 0;

      this.currentUtteranceBuffer = data.text;

      if (isNewUtterance) {
        this.utteranceTimer = setTimeout(() => processBufferAndReset('timeout'), UTTERANCE_TIMEOUT_MS);
      }

      if (data.isFinal) {
        processBufferAndReset('isFinal');
      }
    });

    const unsubDisconnected = session.events.onDisconnected(() => {
      session.logger.info(`Session disconnected for ${this.userId}`);
    });

    // Store unsubscribers for cleanup
    if (typeof unsubTranscription === 'function') {
      this.eventUnsubscribers.push(unsubTranscription);
    }
    if (typeof unsubDisconnected === 'function') {
      this.eventUnsubscribers.push(unsubDisconnected);
    }
  }

  /** Update frequency setting */
  setFrequency(frequency: 'low' | 'medium' | 'high'): void {
    if (this.responseHandler) {
      this.responseHandler.frequency = frequency;
      console.log(`[User] Frequency updated to ${frequency} for ${this.userId}`);
    }
    // Also persist to SimpleStorage
    if (this.appSession) {
      this.appSession.simpleStorage.set('insight_frequency', frequency).catch((err) => {
        console.error(`[User] Failed to save frequency to SimpleStorage: ${err}`);
      });
    }
  }

  /** Get current frequency */
  getFrequency(): 'low' | 'medium' | 'high' {
    return this.responseHandler?.frequency || 'high';
  }

  /** Update cached location from passive updates */
  updateLocation(lat: number, lng: number): void {
    this.location.updateCoordinates(lat, lng);
  }

  /** Disconnect glasses but keep user alive (insights, SSE clients stay) */
  clearAppSession(): void {
    if (this.utteranceTimer) {
      clearTimeout(this.utteranceTimer);
      this.utteranceTimer = null;
    }
    this.unsubscribeEventListeners();
    this.currentUtteranceBuffer = "";
    this.responseHandler = null;
    this.appSession = null;
  }

  /** Register an SSE client */
  addSSEClient(send: (data: string) => void): void {
    this.sseClients.add(send);

    // Flush event queue
    for (const event of this.eventQueue) {
      send(JSON.stringify(event));
    }
    this.eventQueue = [];
  }

  /** Remove an SSE client */
  removeSSEClient(send: (data: string) => void): void {
    this.sseClients.delete(send);
  }

  /** Broadcast an event to all connected SSE clients */
  broadcastInsightEvent(event: any): void {
    const data = JSON.stringify(event);

    if (this.sseClients.size === 0) {
      // Queue for when SSE connects (cap to prevent unbounded growth)
      if (this.eventQueue.length < MAX_EVENT_QUEUE_SIZE) {
        this.eventQueue.push(event);
      }
      return;
    }

    for (const send of this.sseClients) {
      try {
        send(data);
      } catch (err) {
        console.error(`[User] Failed to send SSE event:`, err);
        this.sseClients.delete(send);
      }
    }
  }

  /** Nuke everything */
  cleanup(): void {
    if (this.utteranceTimer) {
      clearTimeout(this.utteranceTimer);
      this.utteranceTimer = null;
    }
    this.unsubscribeEventListeners();
    this.insightHistory.destroy();
    this.location.destroy();
    this.sseClients.clear();
    this.eventQueue = [];
    this.responseHandler = null;
    this.appSession = null;
  }
}
