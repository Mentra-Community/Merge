/**
 * API Route Definitions
 */

import { Hono } from "hono";
import { getHealth } from "../api/health";
import { insightStream } from "../api/insights";
import { getSettings, updateSettings } from "../api/settings";

export const api = new Hono();

// Health
api.get("/health", getHealth);

// SSE stream for insights
api.get("/insight-stream", insightStream);

// Settings (frequency, theme)
api.get("/settings", getSettings);
api.patch("/settings", updateSettings);
