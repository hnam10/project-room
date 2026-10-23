# Architecture

```
 Browser (React)                      API (Express)                         SurrealDB
 ─────────────────                    ─────────────                         ─────────
 pages/ + features/  ──REST /api──▶   http/routes ─▶ services ─▶ repositories ──▶ tables
        ▲                                   │                                   │
        │                                   └──▶ ai/ (AiProvider: Claude or mock)   │
        └────────── WebSocket /ws ◀── realtime/hub ◀──── LIVE SELECT ◀──────────┘
```

npm workspaces monorepo: `packages/shared` (types + zod), `apps/api`, `apps/web`. In development
Vite serves the web app on :5173 and proxies `/api` and `/ws` to the API on :4000.

## Data model (SurrealDB, `apps/api/src/db/schema.surql`)

| Table        | Purpose                                                                                                                                                                     | Key links                                     |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| `member`     | A person                                                                                                                                                                    | —                                             |
| `project`    | Workspace; holds `memberIds` and the `taskCounter` for #numbers                                                                                                             | `memberIds → member`                          |
| `channel`    | Chat channel                                                                                                                                                                | `projectId`                                   |
| `message`    | Chat message; `authorId` is a member id or `'ai'`                                                                                                                           | `channelId`, `suggestionId`                   |
| `task`       | Board card; `num` is per-project, `sourceKind/sourceId` record where it came from                                                                                           | `assigneeId → member`                         |
| `idea`       | Brainstorm card; votes are `voterIds`                                                                                                                                       | `taskId` once converted                       |
| `decision`   | Open question or recorded decision                                                                                                                                          | `raisedById`, `decidedById`                   |
| `suggestion` | **Structured AI output** awaiting review: `kind` = `action_items` / `decision` / `risk`, `status` = `pending` / `approved` / `dismissed`, with `reason`, `quote`, `items[]` | `sourceMessageId`, `taskId`, `createdTaskIds` |

All records carry `projectId`; repositories always filter by it.

## The AI action engine

1. `POST …/channels/:id/messages` stores the message and responds immediately.
2. `services/ai-engine.ts` then runs on the message:
   - `detectOpenQuestion` → a `decision` suggestion (shows in the AI Assistant tab, not in chat). With
     Claude it only runs on messages that read like a question or an unsettled choice;
   - if the text mentions `@AI`: `analyzeConversation` over the messages since the AI last spoke returns
     action items, decisions and risks, each with a `reason` and a verbatim `quote` → an `action_items`
     suggestion (plus an AI chat message that renders it), and `decision` / `risk` suggestions in the panel.
3. Members review: edit items (`PATCH /suggestions/:id`), `approve`, or `dismiss`.
4. `services/suggestions.ts#approveSuggestion` is the only place AI output turns into real changes:
   creates tasks / logs a decision / assigns an owner (risk requires an explicit `assigneeId`).
5. All of the above reach every open browser through realtime.

The provider is chosen in `src/ai/index.ts`: Claude (`ai/anthropic.ts`) when `ANTHROPIC_API_KEY` is set,
otherwise the mock (regex rules, nothing external, labelled in the UI). `AI_PROVIDER=mock` forces the mock.
Claude calls use structured output (`client.messages.parse` with a zod schema). The result is then checked
against real data: unknown member/task ids are dropped, and a `quote` is kept only if it appears verbatim in
a message, so a hallucinated quote never reaches the UI. Chat text is passed as data inside tags.

## Project memory

The memory of a project is its **approved decisions** (`decision.status = 'decided'`, with `outcome`,
`reason`, `quote`). `POST .../decisions/ask` (`services/memory.ts`) hands only those records to
`AiProvider.answerFromDecisions` and returns the answer with the decisions it used as `sources`. The chat log
is never read. A decision becomes "decided" only through a member: approving a `decision` suggestion whose
`outcome` the AI saw settled, or "Mark decided" in the Decisions tab (which asks for the outcome).

## Meetings

Tables live in `schema.meeting.surql` (applied with `schema.surql`):

| Table             | Purpose                                                                                                                                                        | Key links                         |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| `meeting`         | AI Meeting Room session: `status` = `live` / `summarizing` / `ended`, 60-minute `endsAt`, `participantIds`, `summary`, `carryOver`, `usage`, `summaryError`    | `previousMeetingId`               |
| `live_meeting`    | Reservation with id = project id while a meeting is live; created with the meeting and deleted on live -> summarizing in one transaction, so starts can't race | `meetingId`                       |
| `transcript_line` | One final speech result (<= 1000 chars) from a participant's browser                                                                                           | `meetingId`, `speakerId`          |
| `poll`            | Meeting poll with 2-5 options; one movable vote per member                                                                                                     | `meetingId`, `sourceSuggestionId` |

`suggestion` also carries the meeting kinds `idea`, `poll`, `meeting_notes` and the fields `meetingId`,
`sourceLineId`, `ideaId`, `ideaDraft`, `pollDraft`.

- **Lifecycle:** `live` (max 60 minutes, then expired) -> `summarizing` -> `ended`. One live meeting per project.
- **Transcript:** with `GROQ_API_KEY`, each browser records its own mic in 6-second clips (silent ones skipped) and
  posts them to `POST /meetings/:id/audio`; the server transcribes with Whisper on Groq (`src/ai/transcribe.ts`) and stores
  the line. Without the key, each browser runs the Web Speech API and posts final results to `POST /meetings/:id/lines`.
  `GET /meetings/rtc-config` tells clients which mode is on. The speaker is always the caller.
- **Voice:** WebRTC mesh. `rtc` offer/answer/ICE signals are relayed between participants over `/ws` (`realtime/rtc-relay.ts`); STUN/TURN
  come from `RTC_ICE_SERVERS`.
- **Live AI:** new lines trigger `MeetingAi` (separate from `AiProvider`; fast model, running summary + new lines) which stores
  `action_items` / `idea` / `poll` suggestions. A tick runs after 40 new words (at most every 20s) or 15 words then 8s of silence; a meeting is capped at 150 AI calls. Members approve them; AI never writes tasks, ideas or polls.
- **End:** `POST /meetings/:id/end` summarizes on the main model into `meeting.summary` plus a `meeting_notes`
  suggestion. Approving it sets `carryOver`; the next meeting's `previousMeetingId` points at it and the web
  shows a "Last time" card. Summary suggestions use fixed ids (`<meetingId>-summary-actions` / `-summary-notes`) and are
  stored before the meeting ends; if a write fails the meeting ends with `summaryError`, and the `/end` rerun skips the
  ones that already exist.

## Realtime

`realtime/hub.ts` opens one `LIVE SELECT` per realtime table at startup. Each change is converted with
`toPlain()` and sent to the WebSocket clients subscribed to that record's `projectId`. Because changes
come from the database, writes from any API instance (or a DB console) reach clients. The web
`WorkspaceProvider` merges events into its snapshot with idempotent upserts and refetches after a reconnect.

## Auth (`apps/api/src/http/context.ts`, `apps/api/src/auth/clerk.ts`)

- `authenticate` runs on every `/api` route and sets the `Caller` (`memberId`, `orgId`).
  - Clerk mode: `clerkMiddleware()` then `getAuth()`; 401 without a session. The Clerk user id is the
    member id; the member row is created from the Clerk profile on first use.
  - Test-only dev mode (no keys): `x-member-id` header. `index.ts` refuses to start a server in this mode.
- `projectForCaller()` decides project access for both HTTP (`requireProjectMember`) and the WebSocket.
  In Clerk mode the session's `orgId` must equal the project id; the project (with `#general`) and the
  membership are created on first use.
- Web: `api/auth.ts` adds `Authorization: Bearer <token>` with a token scoped to the project's org
  (`getToken({ organizationId })`); the socket passes `?token=`. Clerk UI lives in
  `features/account/ClerkAccount.tsx` (sign-in gate, `OrganizationSwitcher`, `UserButton`, invites).

## Web app

- Routes (`App.tsx`): `/p/:projectId/{board,chat,brainstorm,decisions,calendar,files,overview,team,settings}`
  inside `WorkspaceLayout`; `/p/:projectId/popout/chat` is the standalone chat window.
- State: `SessionProvider` (current member) → `WorkspaceProvider` (project snapshot, messages per channel,
  realtime) → `ChatWindowProvider` (where the chat panel lives).
- Chat window modes (`state/chatWindow.tsx`), persisted per browser:
  - `docked` — inside the dock under the board; drag the header out to float it;
  - `floating` — draggable/resizable inside the page; drop it on the dock to re-attach;
  - `pip` — Document Picture-in-Picture window (Chrome/Edge), always on top. Rendered with
    `createPortal` into the PiP document, so it shares React state with the main window;
  - `popup` — fallback `window.open` to the popout route; synced through realtime, docks back via
    `BroadcastChannel`.
- The dock's height and the chat/brainstorm split are draggable (`features/dock/ResizeHandle.tsx`).

## Configuration (`apps/api/.env`)

| Variable                                     | Default                     | Notes                                                       |
| -------------------------------------------- | --------------------------- | ----------------------------------------------------------- |
| `PORT`                                       | 4000                        | API port                                                    |
| `SURREAL_URL`                                | `surrealkv://./data/dev.db` | `mem://` for throwaway; `ws://host:8000` for a server       |
| `SURREAL_NS` / `SURREAL_DB`                  | `project_room` / `dev`      |                                                             |
| `SURREAL_USER` / `SURREAL_PASS`              | —                           | remote connections only                                     |
| `SEED_ORG_ID`                                | —                           | Clerk org id: loads the demo project into it if it has none |
| `ANTHROPIC_API_KEY` / `ANTHROPIC_MODEL`      | — / `claude-opus-5-5`       | key set = Claude, otherwise the labelled mock               |
| `ANTHROPIC_FAST_MODEL`                       | `claude-haiku-5-5`          | model for frequent live-meeting calls                       |
| `RTC_ICE_SERVERS`                            | Google STUN                 | JSON array of ICE servers for meeting audio (add TURN here) |
| `AI_PROVIDER`                                | —                           | `mock` forces the mock even when a key is set               |
| `WEB_DIST`                                   | `apps/web/dist`             | built web app served by the API when it exists              |
| `CLERK_PUBLISHABLE_KEY` / `CLERK_SECRET_KEY` | —                           | required; web needs `VITE_CLERK_PUBLISHABLE_KEY`            |

To use a SurrealDB server instead of the embedded engine:
`surreal start --user root --pass root rocksdb:./data/server.db`, then `SURREAL_URL=ws://127.0.0.1:8000`.
