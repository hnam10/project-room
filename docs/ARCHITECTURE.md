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

| Table        | Purpose                                                                                                                                                                             | Key links                                                     |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- |
| `member`     | A person                                                                                                                                                                            | —                                                             |
| `project`    | Workspace; holds `memberIds` and the `taskCounter` for #numbers                                                                                                                     | `memberIds → member`                                          |
| `channel`    | Chat channel                                                                                                                                                                        | `projectId`                                                   |
| `message`    | Chat message; `authorId` is a member id or `'ai'`                                                                                                                                   | `channelId`, `suggestionId`                                   |
| `task`       | Board card; `num` is per-project, `sourceKind/sourceId` record where it came from                                                                                                   | `assigneeId → member`                                         |
| `idea`       | Central problem or brainstorm card; cards can be shortlisted and explicitly approved; voting starts only after a member opens it; source links and significant edits remain visible | `sourceSuggestionId`, `taskId` once converted                 |
| `decision`   | Open question or recorded decision                                                                                                                                                  | `raisedById`, `decidedById`                                   |
| `suggestion` | **Structured AI output** awaiting review, including `brainstorm_analysis`, idea drafts and task drafts; `status` = `pending` / `approved` / `dismissed`                             | `sourceMessageId`, `ideaId`, `originIdeaId`, `createdTaskIds` |

All records carry `projectId`; repositories always filter by it.

## The AI action engine

1. `POST …/channels/:id/messages` stores the message and responds immediately.
2. `services/ai-engine.ts` then runs on the message:
   - `detectOpenQuestion` → a `decision` suggestion (shows in the AI Assistant tab, not in chat). With
     Claude it only runs on messages that read like a question or an unsettled choice;
   - if the text mentions `@AI` plus brainstorm/idea/research language: `classifyBrainstorm` assesses the
     requested goal first. Product requests may use Tavily results; non-product requests use conversation
     context only. `brainstorm` creates up to two editable `idea` or `Strategy` suggestions;
   - for other `@AI` mentions: `analyzeConversation` over the messages since the AI last spoke returns
     action items, decisions and risks, each with a `reason` and a verbatim `quote` → an `action_items`
     suggestion (plus an AI chat message that renders it), and `decision` / `risk` suggestions in the panel.
3. Members review: edit items (`PATCH /suggestions/:id`), `approve`, or `dismiss`.
4. `services/suggestions.ts#approveSuggestion` is the only place AI output turns into real changes:
   creates tasks / ideas / logs a decision / assigns an owner (risk requires an explicit `assigneeId`).
5. All of the above reach every open browser through realtime.

The provider is chosen in `src/ai/index.ts`: Claude (`ai/anthropic.ts`) when `ANTHROPIC_API_KEY` is set,
otherwise the mock (regex rules, nothing external, labelled in the UI). `AI_PROVIDER=mock` forces the mock.
Claude calls use structured output (`client.messages.parse` with a zod schema). The result is then checked
against real data: unknown member/task ids are dropped, and a `quote` is kept only if it appears verbatim in
a message, so a hallucinated quote never reaches the UI. Brainstorm source URLs are kept only if Tavily
returned them. Chat and search text are passed as data inside tags. `services/research.ts` owns the Tavily
HTTP call; a missing or failed search never fabricates research and brainstorming falls back to chat context.

## Brainstorm facilitator

`idea.kind = problem` identifies a topic; a project can have several topic tabs. Cards and AI suggestions
carry `topicId` (a link to the topic's idea record). A topic has `topicId = null`; every new board card
requires a valid topic in the same project. Ordinary ideas have `shortlisted`, `approved`,
`researchStale`, and `significantChangeAt` fields. Members edit cards through `PATCH /ideas/:id`, shortlist
through `POST /ideas/:id/shortlist`, and explicitly approve a shortlisted direction through
`POST /ideas/:id/approve`. `services/idea-change.ts` filters minor text edits; a significant edit clears
approval, flags existing research as stale, and exposes a re-evaluation trigger. Saving the form groups edits
before this check, rather than invoking the model for each keystroke.

`BrainstormGuide` first prepares the selected topic: relevant web sources are summarized and a
reviewable Strategy is proposed before idea entry is enabled. Missing keys, failed searches, and no
matching sources produce an honest status message; topic-context strategies and member ideas remain
available. A hidden check records that preparation completed. Subsequent exploration develops ideas
once per meaningful state. Concurrent requests for the same topic/version/action share one operation.
Chat `@AI brainstorm` produces a separate `brainstorm_topic` suggestion with an editable `ideaDraft`
as well as direct idea suggestions. Approving a new topic suggestion creates a separate topic tab;
AI generation never writes the topic directly. Inbox ideas require a member-selected topic on approval.
Pending topic cards appear
beside the current topic so members can review or dismiss them before changing the board.
`AiProvider.classifyBrainstorm` returns product, non-product, or unclear. Topic preparation can research
any topic and uses `facilitateBrainstorm` for a starting strategy. Later product ideas may receive a
reviewable concept and up to two sourced
`brainstorm_analysis` cards, filtered by topic overlap and distinct hosts. `AiProvider.summarizeResearch`
turns the supplied search snippets into short descriptions of what each related idea does; copied or
unsupported summaries are omitted. Earlier pending cards can be summarized on demand through
`POST /suggestions/:id/summarize-research`. For non-product goals the model
proposes a reviewable `Option` for a direct choice or `Strategy` for a plan without searching the web.
`Product`, `Option`, and `Strategy` are the selectable categories; stored `Engagement` and `Platform`
values remain valid for older cards. A hidden, dismissed check suggestion
records the assessed mode so the board does not repeat calls on every visit. Older web cards are hidden
when a newer non-product assessment supersedes them. Only a member's approval attaches source links to
an idea or creates an AI-drafted idea. `originIdeaId` links a new draft to its prompting idea so deletion
dismisses the related pending draft without making approval update that original idea. Approved directions may receive reviewable next-step tasks; the
language is specific to the classified goal. Old generic problem, comparison, and inactivity cards are not
shown.

`repositories/brainstorm-topics.ts` resets boards in one transaction. Editing a topic's title/details
removes all of its cards and suggestions and clears saved topic research. Deleting a topic also removes
the topic itself. `POST /ideas/:topicId/clear-ideas` removes direct ideas/drafts and related task drafts,
but preserves saved strategies and Strategy drafts; research linked to removed ideas is retained on the
topic. Tasks/decisions already approved remain project records. An incrementing `boardVersion` and an
`AsyncLocalStorage` scope capture each AI operation's topic/version; conditional repository writes reject
results after a topic edit, deletion, or clear. The guard also covers nested research and follow-up drafts.
Startup migrates older unscoped boards once per project (`brainstormTopicsMigrated`), preserving their
cards under their existing topic or an "Earlier brainstorming" tab. New projects skip this legacy migration.
The Brainstorm panel groups the guide, sourced research, strategies, and next-step drafts above the
direct-idea grid. Research holds summarized web examples; direct concept drafts stay in the Ideas grid
even when they include source links. Strategy drafts and approved
Strategy ideas retain their review and idea actions in the upper section; the idea grid and theme
filter exclude Strategy cards. Approving an Option does not propose project tasks.

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
| `transcript_line` | One final speech result or typed meeting-chat message (<= 1000 chars, `source` voice/chat)                                                                     | `meetingId`, `speakerId`          |
| `poll`            | Meeting poll with 2-5 options; one movable vote per member                                                                                                     | `meetingId`, `sourceSuggestionId` |

`suggestion` also carries the meeting kinds `brainstorm_topic`, `idea`, `poll`, `meeting_notes` and the fields `meetingId`,
`sourceLineId`, `ideaId`, `ideaDraft`, `pollDraft`.

- **Lifecycle:** `live` (max 60 minutes, then expired) -> `summarizing` -> `ended`. One live meeting per project.
- **Transcript:** with `GROQ_API_KEY`, each browser records its own mic in 6-second clips (silent ones skipped) and
  posts them to `POST /meetings/:id/audio`; the server transcribes with Whisper on Groq (`src/ai/transcribe.ts`) and stores
  the line. Without the key, each browser runs the Web Speech API and posts final results to `POST /meetings/:id/lines`.
  `GET /meetings/rtc-config` tells clients which mode is on. The speaker is always the caller.
- **Voice:** WebRTC mesh. `rtc` offer/answer/ICE signals are relayed between participants over `/ws` (`realtime/rtc-relay.ts`); STUN/TURN
  come from `RTC_ICE_SERVERS`.
- **Live AI:** new lines trigger `MeetingAi` (separate from `AiProvider`; fast model, running summary + new lines) which stores
  `brainstorm_topic` / `action_items` / `idea` / `poll` suggestions. A tick runs after 40 new words (at most every 20s) or 15 words then 8s of silence; a meeting is capped at 150 AI calls. Members approve them; AI never writes tasks, ideas or polls.
- **Topic review:** a live meeting can propose distinct new topics, separate from its ideas; matching titles
  from the same meeting and pending matching proposals are suppressed. The end summary can propose a topic
  from the full transcript if live analysis missed it. New proposals appear in the meeting and in a shared
  inbox above Brainstorm's topic tabs. Approval creates a separate board; existing topics and pending idea
  drafts remain intact.
  Both live and summary prompts include every existing topic and ask for semantic matches by id.
  `ai/meeting-topics.ts` suppresses normalized title or matched-id duplicates; the topic proposal service
  re-reads all saved topics before storing output to catch boards approved while the AI was running.
- **Meeting idea scope:** the model receives all existing topic titles and descriptions and each existing
  idea's topic. Every idea proposal must return a matching existing `topicId`; validation and the live
  service reject missing/unknown topics and developments belonging to a different topic. The stored
  suggestion carries the topic and board version, and its topic is labelled on meeting and board cards.
  A pending topic proposal cannot receive idea suggestions until a member approves it.
- **End:** `POST /meetings/:id/end` summarizes on the main model into `meeting.summary` plus a `meeting_notes`
  suggestion. Approving it sets `carryOver`; the next meeting's `previousMeetingId` points at it and the web
  shows a "Last time" card. Summary suggestions use fixed ids (`<meetingId>-summary-topic` / `-summary-actions` / `-summary-notes`) and are
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
  membership are created on first use. Parallel first-load requests can race, so project plus channel
  creation is one transaction and provisioning writes use the SurrealDB SDK's bounded conflict retry.
- Web: `api/auth.ts` adds `Authorization: Bearer <token>` with a token scoped to the project's org
  (`getToken({ organizationId })`); the socket passes `?token=`. Clerk UI lives in
  `features/account/ClerkAccount.tsx` (sign-in gate, `OrganizationSwitcher`, `UserButton`, invites).
  URL-to-organization synchronization lives above the signed-in gate and runs once per project URL
  change: Clerk temporarily remounts signed-in content while switching, so syncing there would restore
  the previous organization. Workspace data and its child UI are keyed by project id to discard the
  previous project's snapshot, messages, selected channel, and open dialogs together.

## Web app

- Routes (`App.tsx`): `/p/:projectId/{board,chat,meeting,brainstorm,decisions,calendar,files,overview,team,settings}`
  inside `WorkspaceLayout`; `/p/:projectId/popout/chat` is the standalone chat window.
- Calendar (`features/calendar/`): tasks that have a due date, grouped into Monday-start weeks. This week
  is listed first. Each week is seven columns: the weekday sits above the date, and that day's tasks stack
  underneath. Tasks with no due date stay in a list beside the weeks. The project deadline is a chip in the
  calendar header (`PATCH /api/projects/:projectId`): the chip sets the date, and the day is marked on
  the agenda. Changing a task date goes through the existing task dialog.
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
| `TAVILY_API_KEY`                             | —                           | optional web research for `@AI brainstorm ...`              |
| `RTC_ICE_SERVERS`                            | Google STUN                 | JSON array of ICE servers for meeting audio (add TURN here) |
| `AI_PROVIDER`                                | —                           | `mock` forces the mock even when a key is set               |
| `WEB_DIST`                                   | `apps/web/dist`             | built web app served by the API when it exists              |
| `CLERK_PUBLISHABLE_KEY` / `CLERK_SECRET_KEY` | —                           | required; web needs `VITE_CLERK_PUBLISHABLE_KEY`            |

To use a SurrealDB server instead of the embedded engine:
`surreal start --user root --pass root rocksdb:./data/server.db`, then `SURREAL_URL=ws://127.0.0.1:8000`.
