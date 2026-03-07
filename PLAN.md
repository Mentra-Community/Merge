# Mentra Merge Rebuild Plan

## Overview

Rebuild Mentra Merge in this repo using the **new Mentra SDK v3.0.0** (Hono-based `AppServer`, Bun runtime). Port all logic from `OLDMentraMerge` identically, and add a webview modeled after `New-Mentra-AI`'s chat interface to display insights.

---

## Three Source Projects

| Project | Role | SDK Version | Framework |
|---------|------|-------------|-----------|
| **NEWMentraMerge** (this repo) | Template — new SDK reference | `@mentra/sdk@3.0.0-hono.6` | Bun + Hono + React 19 |
| **OLDMentraMerge** | Old Merge — all business logic | `@mentra/sdk@2.1.3` | Node/Bun + Express |
| **New-Mentra-AI** | Webview reference — copy UI | `@mentra/sdk@3.0.0-hono.6` | Bun + Hono + React 19 |

---

## What Merge Does (Unchanged)

Merge is a "proactive conversation intelligence" system for smart glasses:

1. **Listens** to live conversations via transcription
2. **Buffers** utterances with a 2-second timeout window
3. **Decides** via a 3-agent AI pipeline whether to surface an insight:
   - **Initial Agent** (traffic controller) — frequency-aware decision (HIGH/MEDIUM/LOW modes)
   - **Specialist Agents** — Definer, FactChecker, WebSearch (SerpAPI), Computation
4. **Deduplicates** insights (string-similarity, 70% threshold)
5. **Displays** max-60-char insights on glasses for 10 seconds (with display locking)
6. **Information-seeking override** — direct questions bypass frequency restrictions

All of this logic is ported **identically** from OLDMentraMerge.

---

## What's New

### 1. New SDK v3.0.0 API Mapping

| Old SDK (v2.1.3) | New SDK (v3.0.0) | Notes |
|-------------------|-------------------|-------|
| `new AppServer({packageName, apiKey, port})` | `new AppServer({packageName, apiKey, port})` | Same pattern |
| `session.events.onTranscription(cb)` | `session.events.onTranscription(cb)` | Same API |
| `session.layouts.showTextWall(text, {durationMs})` | `session.layouts.showTextWall(text, {durationMs})` | Same API |
| `session.settings.get(key, default)` | **REMOVED** — use `session.simpleStorage.get(key)` | Settings system replaced by SimpleStorage |
| `session.settings.onValueChange(cb)` | **REMOVED** — poll or manage via webview | No more TPA settings listeners |
| Express routes | Hono routes | Framework swap |

### 2. Webview (New Feature)

A React SPA webview modeled after New-Mentra-AI's ChatInterface that:

- Shows a **scrollable list of all insights** generated during the session
- Each insight displayed as a message bubble (similar to chat messages in New-Mentra-AI)
- **Persists insights in-memory** with a 60-second grace period on disconnect (same pattern as New-Mentra-AI's ChatHistoryManager)
- Sends history on frontend reconnect via SSE `history` event
- **Settings page** with insight frequency toggle (LOW/MEDIUM/HIGH) — stored via `session.simpleStorage`

### 3. Webview Styling

- Copy New-Mentra-AI's theme system (`theme.css` with light/dark mode CSS variables)
- Copy UI component library (shadcn/ui + Radix)
- Copy `MentraAuthProvider` wrapper from `@mentra/react`
- **KEEP**: Lottie logo animation, Framer Motion animations (insight fade-in, message transitions)
- **EXCLUDE**: Mira background animation only

---

## File Structure (Target)

```
src/
├── index.ts                              # Server entry point (from template pattern)
├── env.d.ts                              # Type declarations
├── frontend/
│   ├── frontend.tsx                      # React entry (MentraAuthProvider)
│   ├── index.html                        # HTML shell
│   ├── index.css                         # Tailwind + global styles
│   ├── App.tsx                           # Root component (theme context, auth)
│   ├── styles/
│   │   └── theme.css                     # Design tokens (from New-Mentra-AI)
│   ├── pages/
│   │   ├── InsightsInterface.tsx         # Main page — list of insights via SSE
│   │   └── Settings.tsx                  # Frequency setting (LOW/MED/HIGH)
│   ├── components/
│   │   ├── Header.tsx                    # App header
│   │   ├── BottomHeader.tsx              # Footer
│   │   └── ui/                           # shadcn/ui components (from template)
│   │       ├── button.tsx
│   │       ├── card.tsx
│   │       ├── badge.tsx
│   │       ├── input.tsx
│   │       ├── tabs.tsx
│   │       ├── switch.tsx
│   │       ├── scroll-area.tsx
│   │       ├── skeleton.tsx
│   │       ├── utils.ts
│   │       └── index.ts
│   └── api/
│       └── settings.api.ts              # Fetch/update frequency setting
├── server/
│   ├── MergeApp.ts                      # AppServer subclass (onSession/onStop)
│   ├── session/
│   │   └── User.ts                      # Per-user state container
│   ├── manager/
│   │   ├── SessionManager.ts            # User session lookup (with grace period)
│   │   ├── TranscriptionManager.ts      # Transcription buffering (2s timeout)
│   │   ├── InsightHistoryManager.ts     # In-memory insight history (like ChatHistoryManager)
│   │   └── StorageManager.ts            # SimpleStorage wrapper (frequency setting)
│   ├── routes/
│   │   └── routes.ts                    # Hono route definitions
│   ├── api/
│   │   ├── health.ts                    # GET /api/health
│   │   ├── insights.ts                  # SSE: GET /api/insight-stream (real-time insights)
│   │   └── settings.ts                  # GET/POST /api/settings (frequency)
│   └── mastra/                          # === PORTED IDENTICALLY FROM OLDMentraMerge ===
│       ├── agents/
│       │   ├── index.ts                 # Agent exports
│       │   ├── initial-agent.ts         # Traffic controller (3 frequency modes)
│       │   ├── response-handler.ts      # MergeResponseHandler (buffering, dedup, display lock)
│       │   └── specialist-agents.ts     # Definer, FactChecker, WebSearch, Computation
│       ├── tools/
│       │   ├── index.ts                 # Tool exports
│       │   └── serpapi-search.ts        # SerpAPI wrapper
│       └── types.ts                     # TypeScript types
├── public/
│   └── assets/                          # Static assets (icons, etc.)
plugins/
│   └── react-dedupe.ts                  # Bun plugin (from template)
```

---

## Implementation Steps

### Phase 1: Scaffold & Dependencies

1. Update `package.json`:
   - Keep: `@mentra/sdk`, `@mentra/react`, `hono`, `react`, `react-dom`, `tailwindcss`, Radix UI, `lucide-react`
   - Add: `@mastra/core`, `@ai-sdk/openai`, `zod`, `string-similarity`, `cors`, `framer-motion`, `lottie-react`
   - Remove: camera-specific deps if any
2. Create `.env` with all required keys:
   ```
   PORT=3000
   PACKAGE_NAME=com.mentra.merge.dev
   MENTRAOS_API_KEY=<key>
   OPENAI_API_KEY=<key>
   SERPAPI_API_KEY=<key>
   ```
3. Update `.env.example` with placeholder values

### Phase 2: Port Merge Backend

4. Create `src/server/MergeApp.ts` — `AppServer` subclass with `onSession`/`onStop`
5. Port `src/server/mastra/` directory **identically** from OLDMentraMerge:
   - `agents/initial-agent.ts` — all 3 frequency mode prompts unchanged
   - `agents/specialist-agents.ts` — Definer, FactChecker, WebSearch, Computation unchanged
   - `agents/response-handler.ts` — `MergeResponseHandler` with buffering, dedup, display lock
   - `tools/serpapi-search.ts` — SerpAPI tool unchanged
   - `types.ts` — type definitions unchanged
6. Create `src/server/manager/TranscriptionManager.ts` — utterance buffering (2s timeout)
7. Create `src/server/manager/InsightHistoryManager.ts` — in-memory insight storage with grace period
8. Create `src/server/manager/SessionManager.ts` — user session management with 60s grace period
9. Create `src/server/manager/StorageManager.ts` — SimpleStorage wrapper for frequency setting
10. Create `src/server/session/User.ts` — per-user state (composed of managers)
11. Wire up `onSession`:
    - Load frequency from `session.simpleStorage.get('insight_frequency')`
    - Start transcription listener → buffer → agent pipeline → display on glasses
    - On insight generated → add to InsightHistoryManager → broadcast via SSE
12. Update `src/index.ts` — mount routes, auth, serve frontend

### Phase 3: API Routes

13. `GET /api/health` — health check
14. `GET /api/insight-stream?userId={userId}` — SSE endpoint that:
    - Sends `history` event on connect (all previous insights)
    - Broadcasts new `insight` events in real-time
    - Sends `session_started`, `session_ended`, `session_reconnected` status events
15. `GET /api/settings?userId={userId}` — get current frequency
16. `POST /api/settings` — update frequency (writes to SimpleStorage)

### Phase 4: Build Webview

17. Copy theme system from New-Mentra-AI (`theme.css`, light/dark mode)
18. Copy UI components from template (already in place)
19. Build `InsightsInterface.tsx` — main page:
    - SSE connection to `/api/insight-stream`
    - Renders scrollable list of insight messages (like ChatInterface but simpler)
    - Each insight shows: the insight text, timestamp, optionally what triggered it
    - Welcome screen when no insights yet ("Listening for conversations...")
    - Auto-scroll to latest insight
    - Loading state while connecting
20. Build `Settings.tsx` — settings page:
    - Frequency toggle: LOW / MEDIUM / HIGH (3 options)
    - Dark/light mode toggle
    - Reads/writes via `/api/settings`
21. Build `Header.tsx` and `BottomHeader.tsx` — navigation/branding
22. Wire up `App.tsx` — theme context, auth provider, routing between Insights and Settings

### Phase 5: Remove Camera Code

23. Delete all camera-related files (PhotoManager, PhotoStream, AudioControls, etc.)
24. Remove camera-related routes and SSE endpoints
25. Clean up any remaining template-specific code

### Phase 6: Config & Polish

26. Update `porter.yaml` with correct service name
27. Update `Dockerfile` if needed
28. Update `README.md` with Merge-specific setup instructions
29. Verify `.env.example` is complete
30. Test the full flow

---

## Key Design Decisions

1. **Insight History = In-Memory with Grace Period** — same pattern as New-Mentra-AI's ChatHistoryManager. Insights survive brief disconnects (60s) but are lost on server restart (MVP behavior).

2. **Frequency Setting via SimpleStorage** — replaces the old TPA settings system. The webview Settings page reads/writes frequency via API, which uses `session.simpleStorage.set('insight_frequency', value)`.

3. **SSE for Real-Time Updates** — same communication pattern as both the template and New-Mentra-AI. No postMessage bridge needed.

4. **Mastra Pipeline Unchanged** — the entire agent decision pipeline (initial-agent, specialist-agents, response-handler) is copied verbatim. Only the SDK integration layer changes.

5. **Animations Included** — Lottie logo animation, Framer Motion fade-in/transitions for new insights. Only the Mira background animation is excluded.

6. **No Hardcoded API Keys** — All API keys/secrets must live in `.env` only. If any hardcoded keys are found while porting code from either OLDMentraMerge or New-Mentra-AI, they will be extracted into `.env` variables and referenced via `process.env`. (Verified: OLDMentraMerge source code is clean — all keys use `process.env`. New-Mentra-AI has keys in its `.env` file but source code also uses `process.env` properly.)

---

## Environment Variables (.env)

```env
PORT=3000
PACKAGE_NAME=com.mentra.merge.dev
MENTRAOS_API_KEY=<your-mentra-api-key>
OPENAI_API_KEY=<your-openai-api-key>
SERPAPI_API_KEY=<your-serpapi-api-key>
```

---

## Dependencies to Add

```json
{
  "@mastra/core": "^0.10.15",
  "@ai-sdk/openai": "^1.3.23",
  "zod": "^3.25.76",
  "string-similarity": "^4.0.4",
  "framer-motion": "^12.34.0",
  "lottie-react": "^2.4.1"
}
```

## Dependencies to Keep (from template)

```json
{
  "@mentra/sdk": "3.0.0-hono.6",
  "@mentra/react": "2.1.2",
  "hono": "^4.11.3",
  "react": "^19",
  "react-dom": "^19",
  "tailwindcss": "^4.1.17",
  "@radix-ui/*": "existing versions",
  "lucide-react": "existing version"
}
```
