import { MAX_INSIGHT_HISTORY, MAX_INSIGHT_AGE_MS } from '../config';

export interface InsightEntry {
  id: string;
  text: string;
  timestamp: Date;
  agentType: string;
  reasoning: string;
}

/**
 * InsightHistoryManager — in-memory insight storage for webview display.
 * Same pattern as New-Mentra-AI's ChatHistoryManager.
 * Insights survive brief disconnects (grace period) but are lost on server restart.
 */
export class InsightHistoryManager {
  private insights: InsightEntry[] = [];

  addInsight(text: string, agentType: string, reasoning: string): InsightEntry {
    const entry: InsightEntry = {
      id: `${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
      text,
      timestamp: new Date(),
      agentType,
      reasoning,
    };
    this.insights.push(entry);

    // Trim to max size
    if (this.insights.length > MAX_INSIGHT_HISTORY) {
      this.insights = this.insights.slice(-MAX_INSIGHT_HISTORY);
    }

    return entry;
  }

  getRecentInsights(limit?: number): InsightEntry[] {
    const now = Date.now();
    const filtered = this.insights.filter(
      (i) => now - i.timestamp.getTime() < MAX_INSIGHT_AGE_MS
    );
    return limit ? filtered.slice(-limit) : filtered;
  }

  clearAll(): void {
    this.insights = [];
  }

  destroy(): void {
    this.insights = [];
  }
}
