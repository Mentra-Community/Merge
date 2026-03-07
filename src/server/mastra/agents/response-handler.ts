import { AppSession } from '@mentra/sdk';
import { Action, AgentType, type AgentResponse, type AgentInsight, type Conversation, type AgentRoute } from "../types";
import { processConversation } from "./initial-agent";
import { routeToSpecialist } from "./specialist-agents";
import { INSIGHTS_HISTORY_LENGTH, TRANSCRIPT_HISTORY_LENGTH, INSIGHT_CACHE_SIZE, SIMILARITY_THRESHOLD, INSIGHT_DISPLAY_DURATION_MS } from '../../config';
import { findBestMatch } from 'string-similarity';
import { LocationManager } from '../../manager/LocationManager';

export class MergeResponseHandler {
  private session: AppSession;
  private locationManager: LocationManager;
  private conversation: Conversation;
  private isDisplaying: boolean = false;
  private displayTimer: NodeJS.Timeout | null = null;
  private currentDisplayText: string | null = null;
  private recentInsightCache: string[] = [];
  public frequency: 'low' | 'medium' | 'high';

  // Callback for when an insight is generated (for webview SSE broadcasting)
  public onInsight?: (insight: { text: string; timestamp: number; agentType: string; reasoning: string }) => void;

  constructor(session: AppSession, locationManager: LocationManager, initialFrequency: 'low' | 'medium' | 'high' = 'high') {
    this.session = session;
    this.locationManager = locationManager;
    this.conversation = [];
    this.frequency = initialFrequency;
  }

  /**
   * Process a new transcript and update the conversation
   */
  async processTranscript(text: string, timestamp: number): Promise<void> {
    // Add the transcript to conversation
    this.conversation.push({
      type: 'transcript',
      text,
      timestamp
    });

    // --- CONTEXT ASSEMBLY ---
    const recentTranscripts = this.conversation
      .filter(item => item.type === 'transcript' || item.type === 'silent')
      .slice(-TRANSCRIPT_HISTORY_LENGTH);

    const recentInsights = this.conversation
      .filter(item => item.type === 'insight' || item.type === 'route')
      .slice(-INSIGHTS_HISTORY_LENGTH);

    // Combine and sort them by timestamp to create the context
    const context: Conversation = [...recentTranscripts, ...recentInsights]
      .sort((a, b) => a.timestamp - b.timestamp);

    // Get Initial Agent's decision, passing the current frequency
    const response = await processConversation(context, this.frequency);

    // Add the response to conversation history
    this.conversation.push(response);

    // Handle the response based on action type
    await this.handleAgentResponse(response);
    this.session.logger.info({conversation: this.conversation}, `Conversation`);

    // Trim conversation history if it gets too long
    if (this.conversation.length > (TRANSCRIPT_HISTORY_LENGTH + INSIGHTS_HISTORY_LENGTH)) {
      this.conversation = this.conversation.slice(-(TRANSCRIPT_HISTORY_LENGTH + INSIGHTS_HISTORY_LENGTH));
    }
  }

  /**
   * Handle the agent's response based on its action type
   */
  private async handleAgentResponse(response: AgentResponse): Promise<void> {
    this.session.logger.info(`Agent action: ${response.type}, reasoning: ${response.reasoning}`);

    switch (response.type) {
      case Action.INSIGHT:
        this.tryShowInsight(response.output, INSIGHT_DISPLAY_DURATION_MS, {}, response);
        break;

      case Action.SILENT:
        // Do nothing - agent decided to stay quiet
        this.session.logger.info("Agent staying silent");
        break;

      case Action.ROUTE:
        // If routing to web search, show a loading message first
        if (response.targetAgent === AgentType.WebSearch) {
          this.tryShowInsight("web searching...", 10000, { skipCache: true });
        } else if (response.targetAgent === AgentType.PlacesAgent) {
          this.tryShowInsight("locating...", 10000, { skipCache: true });
        }
        // Route to specialist agent
        this.session.logger.info(`Routing to ${response.targetAgent}`);
        await this.handleRouting(response);
        break;
    }
  }

  /**
   * Handle routing to specialist agents
   */
  private async handleRouting(routeResponse: AgentRoute): Promise<void> {
    try {
      // Get specialist response
      const specialistResponse = await routeToSpecialist(
        this.session,
        routeResponse.targetAgent,
        routeResponse.payload,
        routeResponse.timestamp,
        this.locationManager
      );

      // Add specialist response to conversation
      this.conversation.push(specialistResponse);

      // --- THE SCALPEL ---
      if (this.currentDisplayText === "web searching..." || this.currentDisplayText === "locating...") {
        if (this.displayTimer) {
          clearTimeout(this.displayTimer);
          this.displayTimer = null;
        }
        this.isDisplaying = false;
        this.currentDisplayText = null;
        this.tryShowInsight(specialistResponse.output, INSIGHT_DISPLAY_DURATION_MS, {}, specialistResponse);
      } else if (!this.isDisplaying) {
        this.tryShowInsight(specialistResponse.output, INSIGHT_DISPLAY_DURATION_MS, {}, specialistResponse);
      } else {
        this.session.logger.info(`Display is busy with a final result, dropping insight: "${specialistResponse.output}"`);
      }

    } catch (error) {
      this.session.logger.error(`Routing error: ${error}`);
    }
  }

  /**
   * Shows an insight on the display if it's not already busy.
   */
  private tryShowInsight(
    output: string,
    durationMs: number,
    options: { skipCache?: boolean } = {},
    agentResponse?: AgentInsight
  ): void {
    if (this.isDisplaying) {
      this.session.logger.info(`Display is busy, dropping insight: "${output}"`);
      return;
    }

    // --- DUPLICATION CHECK ---
    if (!options.skipCache && this.recentInsightCache.length > 0) {
      const { bestMatch } = findBestMatch(output, this.recentInsightCache);
      if (bestMatch.rating > SIMILARITY_THRESHOLD) {
        this.session.logger.info(`Duplicate insight detected (Similarity: ${bestMatch.rating.toFixed(2)}). Dropping: "${output}"`);
        return;
      }
    }


    this.isDisplaying = true;
    this.currentDisplayText = output;
    const formattedOutput = `// Merge\n${output}`;
    this.session.logger.info(`Showing insight: "${formattedOutput}" for ${durationMs}ms`);
    this.session.layouts.showTextWall(formattedOutput, { durationMs });

    // Broadcast to webview via callback
    if (!options.skipCache && this.onInsight) {
      this.onInsight({
        text: output,
        timestamp: Date.now(),
        agentType: agentResponse?.metadata?.agentType || 'Initial',
        reasoning: agentResponse?.reasoning || '',
      });
    }

    // Add to cache and trim if necessary
    if (!options.skipCache) {
      this.recentInsightCache.push(output);
      if (this.recentInsightCache.length > INSIGHT_CACHE_SIZE) {
        this.recentInsightCache.shift();
      }
    }

    // Clear any existing timer and set a new one to release the lock.
    if (this.displayTimer) {
      clearTimeout(this.displayTimer);
    }
    this.displayTimer = setTimeout(() => {
      this.isDisplaying = false;
      this.displayTimer = null;
      this.currentDisplayText = null;
      this.session.logger.info(`Display is now free.`);
    }, durationMs);
  }

  /**
   * Get the current conversation for debugging/testing
   */
  getConversation(): Conversation {
    return [...this.conversation];
  }

  /**
   * Clear the conversation history
   */
  clearConversation(): void {
    this.conversation = [];
  }
}
