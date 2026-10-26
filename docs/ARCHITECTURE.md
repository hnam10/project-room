# Architecture

```
 Browser (React)                      API (Express)                         SurrealDB
 ─────────────────                    ─────────────                         ─────────
 pages/ + features/  ──REST /api──▶   http/routes ─▶ services ─▶ repositories ──▶ tables
        ▲                                   │                                   │
        │                                   └──▶ ai/ (OpenAI-compatible, or mock) │
        └────────── WebSocket /ws ◀── realtime/hub ◀──── LIVE SELECT ◀──────────┘
```

npm workspaces monorepo: `packages/shared` (types + zod), `apps/api`, `apps/web`. In development
Vite serves the web app on :5173 and proxies `/api` and `/ws` to the API on :4000.

## Data model (SurrealDB, `apps/api/src/db/schema.surql`)

| Table     | Purpose                                                         | Key links            |
| --------- | --------------------------------------------------------------- | -------------------- |
| `member`  | A person                                                        | —                    |
| `project` | Workspace; holds `memberIds` and the `taskCounter` for #numbers | `memberIds → member` |
| `channel` | Chat channel                                                    | `projectId`          |

| `message` | Chat message; `authorId` is a member id or `'ai'`. `fileId` points at a shared file when the message attaches one. | `channelId`, `suggestionId`, `fileId` |

| `task` | Board card; `num` is per-project, `sourceKind/sourceId` record where it came from | `assigneeId → member` |
| `idea` | Central problem or brainstorm card; hearts toggle personal support immediately and members explicitly approve cards; source links and significant edits remain visible | `sourceSuggestionId`, `taskId` once converted |
| `decision` | Retired: old open questions and decisions, no longer written or read (polls replace them) | `raisedById`, `decidedById` |
| `suggestion` | **Structured AI output** awaiting review, including `brainstorm_analysis`, idea drafts and task drafts; `status` = `pending` / `approved` / `dismissed` | `sourceMessageId`, `ideaId`, `originIdeaId`, `createdTaskIds` |

| `file` | Metadata for a shared project file (name, size, type, uploader). The bytes are not in the database. | `uploadedById → member` |
| `note` | Member-written project note (title, body). Only the author may edit or delete it (`ForbiddenError` otherwise). | `authorId → member` |

All records carry `projectId`; repositories always filter by it.

## The AI action engine

Topic preparation returns concise JSON guidance in `FacilitateResult.strategy`: a provisional recommended
direction, two to four concrete steps, and essential scope. Each section and step uses one or two short
sentences. Product plans lead to a small useful version; other topics use a proportionate decision/trial plan.
The provider requests this roadmap directly at the JSON root, avoiding a nested nullable strategy
wrapper and unrelated tasks/ideas fields. The shared structured client retries generation/JSON validation
failures up to twice with correction feedback; request, auth, rate-limit and service errors are not retried.
Topic preparation isolates AI failures from web search: sources can still be reviewed with an explicit
unavailable-summary notice, and strategy failures preserve completed research. A later manual retry
refreshes pending unavailable-summary cards. `AiRequestError` carries upstream status for safe availability
messages; other routes map it to 503 rather than exposing provider details. Preparation records a completed
availability check so teams can add their own ideas even when AI is unavailable.
`strategyPlanSchema` defines only `recommendation` (string), `steps` (up to eight strings), and
`essentialScope` (string); `aiStrategyPlanSchema` caps model output at six steps. Research remains in its separate section rather than being repeated in guidance.
Plans are serialized as JSON in the existing strategy description field (up to `STRATEGY_DESCRIPTION_MAX`,
20,000 characters) through generation, review, approval and editing. `StrategyDetails` reads this schema
and renders three short sections without Markdown. Older detailed JSON is condensed at read time using
its direction, action sentences and essential scope; original saved records are not rewritten.
`StrategyEditor` exposes normal text fields for direction, each step and essential scope in both draft
review and saved-idea editing. It serializes JSON on change, tolerates incomplete form fields while typing,
and relies on required fields plus shared API validation before saving. Members can keep one to eight steps.
Legacy plain text remains readable. Malformed JSON objects are rejected on review/edit. Other facilitation summaries
retain their short limit. Preparation cannot create
direct ideas or tasks; the plan remains a reviewable Strategy draft. Manual refresh keys the draft by its
content, preserving saved guidance while allowing an existing topic to receive the updated roadmap format.

Explicit requests are handled first by `services/chat-commands.ts`, without an `@AI` requirement for
brainstorming. `AiProvider.interpretChatIntent` uses the frequent model host to read the latest message,
the preceding 20 channel messages (up to 2,000 characters each), and all project topic titles/descriptions.
`ai/chat-intent.ts` requests a structured instruction extraction: none, create_topic, add_idea, suggest_idea, use_topic
or clarify. Its prompt interprets typos, creation/contribution verbs, semantic topic matches and explicit
contextual follow-ups while excluding negations, quoted requests and requests for generated ideas.
Direct contributions use add_idea; tentative concrete ideas use suggest_idea and remain pending.
`topicReference` carries the member's target phrase. The model matches topic meaning with chat context;
if it omits an id, the service can resolve a unique reference-word match or default an implicit/generic
reference to the sole topic. An explicitly unknown target never falls back to another board.
The service verifies a nonempty request quote against the latest member message and a verbatim title against
that member's latest/recent messages. Excerpt validation tolerates casing/spacing changes and saves the matched member text rather than
the model's presentation. An unusable extraction or unnecessary clarification gets one bounded recheck
with server validation feedback; a named creation goal needs no existing board or separate idea.
It rechecks selected ids against current project topics after the model call; missing, foreign and removed
targets cannot receive ideas. Existing-topic reuse never resets a board.
Member titles then pass shared creation validation and existing project-scoped repositories/realtime.
Tentative ideas use the existing idea suggestion shape, with reason, quote, source message, topic id and
board version. A per-message suggestion id plus pending-title checks suppress duplicates; the repository's
atomic version guard rejects stale boards. Only member approval creates the idea. Untagged suggestions
stay in the Assistant/Brainstorm review panels without a chat interruption. The Assistant tab and badge
share `pendingAssistantSuggestions`, so newly captured drafts are discoverable immediately.
Literal create/add topic/idea commands remain available if intent interpretation fails. The labelled mock
returns no interpretation and retains template-only commands. Their fallback topic lookup normalizes case,
punctuation and spacing, preferring exact titles before distinctive prefixes with two meaningful words.
An omitted fallback target uses the latest successful command's topic in the same channel, or a sole topic.
Missing/ambiguous targets and duplicate titles return a chat explanation without creating records.
These commands are member instructions; generated proposals still require approval as described below.
`@AI create task TITLE` uses the validated task defaults (unassigned, To Do, no due date). Without a
title, it asks for one and reads only that member's next message in the same channel; another member
or channel cannot supply it. Task creation never infers assignments or dates from the title.

Mute status is stored in `meeting.mutedParticipantIds`. `POST /meetings/:id/mute` atomically updates
only the authenticated participant in a live meeting. Existing meeting realtime events share it with
all project viewers and fresh meeting reads include it. Leave/end operations clear mute membership.
The call provider applies microphone changes immediately and serializes status writes; participant
tiles use the shared state for other members.

1. `POST …/channels/:id/messages` stores the message and responds immediately.
2. `services/ai-engine.ts` then runs on the message:

   - if the text mentions `@AI` plus brainstorm/idea/research language: `classifyBrainstorm` assesses the
     requested goal first. Product requests may use Tavily results; non-product requests use conversation
     context only. `brainstorm` creates a `brainstorm_topic` suggestion and up to two editable idea or strategy suggestions;
   - for other `@AI` mentions: the latest 80 messages in that channel are the thread the model reads,
     including turns from before the AI last spoke. Older lines in the same project are added when SurrealDB
     full-text search (`message_text`, BM25) matches the question. With a model key, `@AI` also calls project
     tools (`list_tasks`, `search_messages`, …), answers in chat, and files `action_items`,
     `risk` and `idea` suggestions. The mock still uses one `analyzeConversation` call. An AI chat message renders the action items;
     the other kinds show in the panel.

3. Members review: edit items (`PATCH /suggestions/:id`), `approve`, or `dismiss`.
4. `services/suggestions.ts#approveSuggestion` is the only place AI output turns into real changes:
   creates tasks / ideas / polls / assigns an owner (risk requires an explicit `assigneeId`).
5. All of the above reach every open browser through realtime.

The provider is chosen in `src/ai/routing.ts`. `OPENAI_API_KEY` handles the longer calls: `@AI`, Ask the
project, chat brainstorm drafts, and the end-of-meeting summary. `NEBIUS_API_KEY` handles the frequent
short calls: the open-question check, live meeting ticks, brainstorm classification, board facilitation,
and research summaries. With one key, that host covers every job. With no key, the labelled mock runs.
`AI_PROVIDER=mock` forces the mock. Both hosts use `ai/openai.ts` (`response_format: json_schema`, `strict: true`).
`api.openai.com` is sent `max_completion_tokens`; Nebius is sent `max_tokens`. The result is then
checked against real data: unknown member/task ids are dropped, and a `quote` is kept only if it appears
verbatim in a message the model was shown (the channel thread, a recalled line, a file passage, or a
`search_messages` hit), so a hallucinated quote never reaches the UI. Brainstorm source URLs are kept only if Tavily
returned them. Chat and search text are passed as data inside tags. Tool handlers live in
`services/ai-engine.ts` and call repositories; the model never sees SurrealQL, and propose tools only create
`suggestion` records. `services/research.ts` owns the Tavily HTTP call; a missing or failed search never
fabricates research and brainstorming falls back to chat context.

## Brainstorm facilitator

`idea.kind = problem` identifies a topic; a project can have several topic tabs. Cards and AI suggestions
carry `topicId` (a link to the topic's idea record). A topic has `topicId = null`; every new board card
requires a valid topic in the same project. Ordinary ideas have `approved`, `researchStale`, and
`significantChangeAt` fields. Members edit cards through `PATCH /ideas/:id` and directly approve a
direction through `POST /ideas/:id/approve` after confirming in the UI. Hearts use `POST /ideas/:id/vote`
to toggle personal support immediately; they do not approve the idea or start a formal vote. The legacy
`shortlisted`/`votingOpen` fields and their endpoints remain compatible with older clients, but are not
prerequisites or controls in the current UI. `services/idea-change.ts` filters minor text edits; a significant edit clears
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
topic. Tasks/polls already approved remain project records. An incrementing `boardVersion` and an
`AsyncLocalStorage` scope capture each AI operation's topic/version; conditional repository writes reject
results after a topic edit, deletion, or clear. The guard also covers nested research and follow-up drafts.
Startup migrates older unscoped boards once per project (`brainstormTopicsMigrated`), preserving their
cards under their existing topic or an "Earlier brainstorming" tab. New projects skip this legacy migration.

The Brainstorm panel groups the guide, sourced research, strategies, and next-step drafts above the
direct-idea grid. Research holds summarized web examples; direct concept drafts stay in the Ideas grid
even when they include source links. Strategy drafts and approved
Strategy ideas retain their review and idea actions in the upper section; the idea grid and theme
filter exclude Strategy cards. Approving an Option does not propose project tasks.

## Polls instead of decisions

The team decides by voting. There is no `decision` record any more (its table definition stays so old rows still
read, but nothing writes it). Polls are opened in a meeting by approving a `poll` suggestion; the snapshot carries
every project poll (`listProjectPolls`, newest first) and `poll` realtime events patch it, so the Polls tab
(`features/chat/PollsTab.tsx`) lists open polls to vote on and closed ones with the winning option highlighted.

## Meetings

Tables live in `schema.meeting.surql` (applied with `schema.surql`):

| Table             | Purpose                                                                                                                                                                   | Key links                          |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| `meeting`         | AI Meeting Room session: `status` = `live` / `summarizing` / `ended`, 60-minute `endsAt`, `participantIds`, `summary`, `carryOver`, `usage`, `summaryError`               | `previousMeetingId`                |
| `live_meeting`    | Reservation with id = project id while a meeting is live; created with the meeting and deleted on live -> summarizing in one transaction, so starts can't race            | `meetingId`                        |
| `transcript_line` | One final speech result or typed meeting-chat message (<= 1000 chars, `source` voice/chat); a shared file is a chat line whose text is the file name; `ai` = an @AI reply | `meetingId`, `speakerId`, `fileId` |
| `poll`            | Meeting poll with 2-5 options; one movable vote per member                                                                                                                | `meetingId`, `sourceSuggestionId`  |

`suggestion` also carries the meeting kinds `brainstorm_topic`, `idea`, `poll`, `meeting_notes` and the fields `meetingId`,
`sourceLineId`, `ideaId`, `ideaDraft`, `pollDraft`.

- **Lifecycle:** `live` (max 60 minutes, then expired) -> `summarizing` -> `ended`. One live meeting per project.
- **Transcript:** with `GROQ_API_KEY`, each browser records its own mic in 6-second clips (silent ones skipped) and
  posts them to `POST /meetings/:id/audio`; the server transcribes with Whisper on Groq (`src/ai/transcribe.ts`) and stores
  the line. Without the key, each browser runs the Web Speech API and posts final results to `POST /meetings/:id/lines`.
  `GET /meetings/rtc-config` tells clients which mode is on. The speaker is always the caller.
- **Voice:** WebRTC mesh. `rtc` offer/answer/ICE signals are relayed between participants over `/ws` (`realtime/rtc-relay.ts`); STUN/TURN
  come from `RTC_ICE_SERVERS`.

- **Live AI:** new lines trigger `MeetingAi` (separate from `AiProvider`; Nebius when `NEBIUS_API_KEY` is set, otherwise the OpenAI fast model) which stores

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
  Mock topic matching requires multiple distinct meaningful words (or an unambiguous single-word topic)
  and abstains on ties. Explicit topic ids and versions use the same conditional repository write as
  board AI scopes, preventing late meeting output from referencing deleted or reset boards.
  Topic-change proposals appear only on their target board, name it during review, and require a
  destructive confirmation plus matching `replaceTopicId` in the approval request. New-board proposals
  alone appear in the shared new-topic inbox.
- **End:** `POST /meetings/:id/end` summarizes on the OpenAI model (Nebius when that key is the only one) into `meeting.summary` plus a `meeting_notes`
  suggestion. Approving it sets `carryOver`; the next meeting's `previousMeetingId` points at it and the web
  shows a "Last time" card. Summary suggestions use fixed ids (`<meetingId>-summary-topic` / `-summary-actions` / `-summary-notes`) and are
  stored before the meeting ends; if a write fails the meeting ends with `summaryError`, and the `/end` rerun skips the
  ones that already exist.

## Realtime

`realtime/hub.ts` opens one `LIVE SELECT` per realtime table at startup. Each change is converted with
`toPlain()` and sent to the WebSocket clients subscribed to that record's `projectId`. Because changes
come from the database, writes from any API instance (or a DB console) reach clients. The web
`WorkspaceProvider` merges events into its snapshot with idempotent upserts and refetches after a reconnect.

## Files

`file` records are metadata only. `POST /projects/:id/files` takes the raw bytes (`Content-Type: application/octet-stream`),
the display name in `x-file-name`, and the media type in `x-file-type`. `services/files.ts` writes the bytes under
`FILES_DIR/<projectId>/<fileId>` and stores the record; downloads are always sent as attachments. A name is reduced to
its last path segment before it is stored, and anything over 10 MB is rejected. Delete removes the record and the bytes.
The chat attach button uses the same upload, then posts a message whose `fileId` is that record.
When `AGENT_MEMORY_ENDPOINT`, `AGENT_MEMORY_API_KEY` and `AGENT_MEMORY_CONTEXT` are set, a PDF, image, or
plain-text upload is also sent to SurrealDB Agent Memory under the scope `project/<projectId>` (`services/project-memory.ts`).
The document id is stored on the file. On `@AI`, the engine asks Agent Memory for a few short passages, using the
latest part of the channel thread as the search, and passes only those to the model; the file bytes are not.
Word and PowerPoint files are stored for download and are not sent.
Deleting a file deletes the Agent Memory document too.

## Notes

The Brainstorm panel's Notes tab (`features/brainstorm/NotesPanel.tsx`) is project-wide. It lists `note` records
(`/projects/:id/notes`, in the snapshot and realtime) and, read-only beside them, the AI summary and confirmed
"Notes for next time" of the two latest ended meetings (older ones: Meeting tab history), read from the meeting records `useMeetingCall().recent` already holds.
Summaries are not copied into `note`; Open meeting shows that meeting's full summary view.

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

- Routes (`App.tsx`): `/p/:projectId/{board,chat,meeting,brainstorm,polls,calendar,files,overview,settings}`
  inside `WorkspaceLayout`; `/p/:projectId/popout/chat` is the standalone chat window. `/team` redirects to
  `settings`. Members and roles belong there; workload stays on the planned Overview page. The sidebar
  lists the working pages plus Settings. Overview has no sidebar item until that dashboard exists.
- Calendar (`features/calendar/`): tasks that have a due date, grouped into Monday-start weeks. This week
  is listed first. Each week is seven columns: the weekday sits above the date, and that day's tasks stack
  underneath. Tasks with no due date stay in a list beside the weeks. Dragging a task onto a day sets or
  moves its due date through the existing task update. The project deadline is a chip in the
  calendar header (`PATCH /api/projects/:projectId`): the chip sets the date, and the day is marked on
  the agenda. Opening a task still edits it in the task dialog.
- State: `SessionProvider` (current member) → `WorkspaceProvider` (project snapshot, messages per channel,
  realtime) → `ChatWindowProvider` (where the chat panel lives) → `MeetingCallProvider` (the meeting call).
- The meeting call (`state/meetingCall.tsx`) lives above the routed pages: mic, peers' audio, transcription and
  the meeting socket keep running on any page, and off the meeting page a floating bar offers mute, leave and a
  link back. A meeting ends when its last participant leaves; a dropped socket (closed tab, refresh) gets 30s
  to rejoin first.
- Chat window modes (`state/chatWindow.tsx`), persisted per browser:
  - `docked` — inside the dock under the board; drag the header out to float it;
  - `floating` — draggable/resizable inside the page; drop it on the dock to re-attach;
  - `pip` — Document Picture-in-Picture window (Chrome/Edge), always on top. Rendered with
    `createPortal` into the PiP document, so it shares React state with the main window;
  - `popup` — fallback `window.open` to the popout route; synced through realtime, docks back via
    `BroadcastChannel`.
- The dock's height and the chat/brainstorm split are draggable (`features/dock/ResizeHandle.tsx`).

## Configuration (`apps/api/.env`)

| Variable                                     | Default                     | Notes                                                          |
| -------------------------------------------- | --------------------------- | -------------------------------------------------------------- |
| `PORT`                                       | 4000                        | API port                                                       |
| `SURREAL_URL`                                | `surrealkv://./data/dev.db` | `mem://` for throwaway; `ws://host:8000` for a server          |
| `SURREAL_NS` / `SURREAL_DB`                  | `project_room` / `dev`      |                                                                |
| `SURREAL_USER` / `SURREAL_PASS`              | —                           | remote connections only                                        |
| `SEED_ORG_ID`                                | —                           | Clerk org id: loads the demo project into it if it has none    |
| `OPENAI_API_KEY`                             | —                           | `@AI`, chat brainstorm drafts, meeting summary                 |
| `OPENAI_BASE_URL`                            | `https://api.openai.com/v1` |                                                                |
| `OPENAI_MODEL` / `OPENAI_FAST_MODEL`         | `gpt-4.1-mini`              | chat model; fast model is live meetings only without Nebius    |
| `NEBIUS_API_KEY`                             | —                           | open-question check, live meeting ticks, brainstorm automation |
| `NEBIUS_BASE_URL`                            | Token Factory `/v1`         | `https://api.tokenfactory.nebius.com/v1`                       |
| `NEBIUS_MODEL`                               | `openai/gpt-oss-120b`       | model for those frequent calls                                 |
| `GROQ_API_KEY`                               | —                           | meeting speech-to-text only; otherwise the browser speech API  |
| `TAVILY_API_KEY`                             | —                           | optional web research for `@AI brainstorm ...`                 |
| `RTC_ICE_SERVERS`                            | Google STUN                 | JSON array of ICE servers for meeting audio (add TURN here)    |
| `AI_PROVIDER`                                | —                           | `mock` forces the mock even when a key is set                  |
| `WEB_DIST`                                   | `apps/web/dist`             | built web app served by the API when it exists                 |
| `FILES_DIR`                                  | `./data/files`              | uploaded bytes; `/data/files` in the Docker image              |
| `CLERK_PUBLISHABLE_KEY` / `CLERK_SECRET_KEY` | —                           | required; web needs `VITE_CLERK_PUBLISHABLE_KEY`               |

To use a SurrealDB server instead of the embedded engine:
`surreal start --user root --pass root rocksdb:./data/server.db`, then `SURREAL_URL=ws://127.0.0.1:8000`.
