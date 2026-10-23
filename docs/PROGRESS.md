# Progress

Living status for humans and AI agents. Update it at the end of every work session (see AGENTS.md).
Newest entries at the top of each section. Dates are YYYY-MM-DD.

## Done

- 2026-10-23 — **Calendar review fixes.** Deadline controls wait for the pending save, including clear and error rollback.
  Week columns switch to day rows when the agenda is too narrow for task metadata, including beside the undated rail.
  Project and task due dates reject impossible calendar dates, with leap-year checks; clearing still uses null.

- 2026-10-23 — **Project deadline reads as a deadline.** The calendar header chip always says Deadline, shows the
  weekday and how soon (soon, today, or past). A calendar icon opens the date picker, and × clears it.
  With no date, the whole chip says Set a date and opens the picker. Empty and set are both only as wide
  as their text. A set date colors the whole chip (later, soon, today, or past).
- 2026-10-23 — **Project deadline is a short chip.** A flag, the short date, and how soon, only as wide as the text.
  The date jumps to that week. A calendar icon changes it, and × clears it.
- 2026-10-23 — **Month view removed.** The calendar is the week columns only. Tasks with no due date stay in the
  side list. Every dated task is already on a week, so nothing is hidden by dropping the month grid.
- 2026-10-23 — **Week view is columns, month view stays the grid.** This week is listed first. Each week is seven
  vertical days: the weekday sits above the date, and tasks stack under it. Earlier weeks sit under "Earlier".
  The project deadline is a card under the title: the date written out, how soon it is, Change, and clear.
  Clicking the date jumps to that week or month. Its day keeps a flag on the agenda and on the month grid.
- 2026-10-23 — **Month view keeps the tasks it does not draw.** Beside the grid: tasks with no due date, and tasks
  whose date falls on another month (open one, or jump to that month). Week view is still the full agenda:
  a week is listed when it has a task. The two views answer different questions.
- 2026-10-23 — **Project deadline can be set from the calendar.** A compact date field in the calendar header
  saves `project.dueDate` (`PATCH /api/projects/:id`). The old banner is gone; the day on the grid still
  shows a flag, and the relative date ("in 4 days") jumps to that week or month.
- 2026-10-23 — **Calendar month view.** A Week / Month switch in the header (remembered in the browser). Month
  view shows one month at a time, with previous, next, and Today. A day still opens or creates a task.
  The project deadline and the overdue jump land on that month. Days from the neighboring months stay
  visible so a task on the edge of the month does not disappear.
- 2026-10-22 — **Calendar page.** Tasks with a due date are grouped by week (Monday start), and the project
  deadline is marked on its day. A task opens in the existing dialog; a day can also start a new task
  already dated. Overdue uses the local calendar day, on the board as well as here, and done tasks are not overdue.
- 2026-10-21 — **AI Meeting Room** (Hansol). In-app voice meetings (WebRTC mesh, 60-minute cap) with a live
  transcript from each browser's speech recognition. Claude (fast model) joins read-only and proposes tickets,
  ideas and polls as suggestions; ending the meeting writes an AI summary and a "Notes for next time"
  checklist. Confirmed notes become the next meeting's "Last time" card. Spec:
  [superpowers/specs/2026-10-21-ai-meeting-room-design.md](superpowers/specs/2026-10-21-ai-meeting-room-design.md).

- 2026-10-20 — **Claude provider, structured suggestions and project memory.** `ANTHROPIC_API_KEY` switches
  the AI from the mock to Claude (`src/ai/anthropic.ts`, `messages.parse` + zod). One `@AI` call returns
  action items, decisions and risks, each with a `reason` and a `quote`. Output is validated before use
  (unknown member/task ids dropped, quotes kept only if verbatim in a message). New "Ask the project" box
  in the Decisions tab (`POST .../decisions/ask`) answers from approved decisions only, with the decisions
  as sources. Decisions now carry `outcome`/`reason`/`quote`; "Mark decided" asks for the outcome. The mock
  runs only without a key and keeps its UI label. Seed rewritten around this (five approved decisions
  including a reversed hosting choice, items with reasons and quotes).
- 2026-10-20 — **"Acting as" removed; Clerk is required.** The API exits at startup without Clerk keys and
  the web app shows a setup screen. Only the test suite runs keyless (`x-member-id`).
- 2026-10-20 — **Deployable image.** `Dockerfile` builds one image where the API also serves the built web
  app; the demo loads into a Clerk organization via `SEED_ORG_ID` / `npm run db:seed -- --org org_xxx`.
- 2026-10-20 — **Clerk authentication + organizations.** With Clerk keys set, the web app shows Clerk
  sign-in and the API verifies Clerk session tokens (`clerkMiddleware` + `getAuth`; the WebSocket gets
  `?token=`). A Clerk Organization is a project: the sidebar uses `<OrganizationSwitcher>` to create and
  switch teams, the top-bar "+" opens Clerk's invite dialog, and members/projects (with `#general`) are
  created on first use. Without keys the app stays in dev mode ("Acting as"), which tests use.
- 2026-10-20 — **AI tool entry files.** `GEMINI.md` and `.github/copilot-instructions.md` point to
  AGENTS.md like `CLAUDE.md` does; shared notes moved from CLAUDE.md into AGENTS.md; personal AI settings
  (`CLAUDE.local.md`, `.claude/settings.local.json`, …) are git-ignored.
- 2026-10-20 — **CI and code quality.** GitHub Actions on every PR and `main`: Prettier check, ESLint
  (typescript-eslint + react-hooks), typecheck, tests, build, `npm audit` (production deps). `npm run check`
  runs the same locally. Fixed the issues the new React hooks rules found (ref writes during render,
  form resets in effects).
- 2026-10-20 — **Full-stack scaffold.** npm workspaces (`packages/shared`, `apps/api`, `apps/web`).
  - API: Express 5 + SurrealDB 3 (embedded `surrealkv`, or remote via `SURREAL_URL`), schema with
    ASSERTs, per-project membership checks, zod validation, demo seed, realtime via LIVE SELECT → WebSocket.
  - AI action engine with a mock provider: @AI action-item extraction, open-question detection,
    approve/edit/dismiss workflow; risk suggestions require choosing an assignee.
  - Web: React + Router pages per feature (Board, Chat, Brainstorm, Decisions, placeholders),
    task CRUD with drag-and-drop and grouping, chat channels, AI Assistant, decisions log,
    ideas (add, vote, convert to task), live sync across browsers.
  - Chat can be docked, floated in the page, or opened in a separate window (PiP / popup);
    dock height and chat/brainstorm split are resizable.
  - Tests: mock AI rules + HTTP/realtime end-to-end flow (`npm test`).
- 2026-10-19 — Static HTML prototype of the light-theme UI (`prototype/`).

## Next up

Pick from the top unless the team agrees otherwise. Put your name next to an item when you start it.

Hackathon prizes first — the plan for each sponsor is in [HACKATHON.md](HACKATHON.md).

- [ ] **Clerk roles** (Clerk prize, follow-up) — use org roles for product rules, e.g. only `org:admin`
      can make a suggestion an official decision; Clerk webhooks to drop members who leave a team.
- [ ] **Live URL** (needs a host account) — build and deploy the Dockerfile with a persistent volume at
      `/data`, set the env vars from `apps/api/.env.example`, `SEED_ORG_ID`, and the Clerk production keys.
- [ ] **Summarize this channel** as a suggestion kind (Claude provider follow-up).
- [ ] **SurrealDB Agent Memory** (Agent Memory prize) — project-scoped long-term memory: remember
      messages/decisions, recall before suggesting, "Ask the project" with sources.
- [ ] **Era eval harness** (Eon prize) — score action-item extraction against Era's simulated
      Slack/Jira ground truth; compare mock vs. Claude vs. Claude + memory.
- [ ] **Expo mobile companion** (Expo prize) — `apps/mobile`: approval notifications, approve/dismiss,
      chat, my tasks; Clerk Expo sign-in; EAS Build/Update.
- [ ] **Create channels** (buttons currently show "isn't built yet"; projects and invites come from Clerk).
- [ ] **Overview page** — progress, overdue tasks, upcoming deadlines, open decisions, workload per member.
- [ ] **Brainstorm grouping** — themes as columns, compare proposals, "start a vote" (needs confirmation).
- [ ] **Web tests** — Playwright for: approve AI action items → task appears; drag task; detach chat.
- [ ] Files page (needs storage decision: SurrealDB files vs. S3-compatible bucket).

## Known gaps

- Meeting page has no sidebar link yet (reachable at /p/<id>/meeting); add one line in WorkspaceLayout after
  feat/task-search merges.
- Meetings: no TURN relay, so peer connections may fail on strict networks (transcript and AI still work).
- Meetings: live state, the AI trigger and the signaling relay are in-process (single API instance).
- Meetings: trigger state (cooldowns, running summary, call counts) is in memory and resets on API restart.
- Meetings: when Claude is re-invited it reads lines spoken while it was removed, and the end-of-meeting summary
  reads the full transcript (up to the line cap).
- Meetings: no rate limit on `POST /meetings/:id/lines`.
- Meetings: poll votes are read-modify-write, so two simultaneous votes can overwrite each other.
- Meetings: without `GROQ_API_KEY`, transcription is Chrome/Edge only (Web Speech API; audio goes to Google) and fails
  with `network` behind VPNs/strict networks.
- Meetings (Groq Whisper): fixed 6s clips can split a word at the boundary; no interim text while speaking; Groq's free
  tier has daily request limits (about one request per speaking participant every 6s). Not yet tried in a real browser.
- With `OPENAI_API_KEY` set, the UI and consent dialog still say "Claude" although the transcript goes to the
  OpenAI-compatible provider.
- Meetings: no meeting or transcript deletion; mixed-language speech is transcribed in one language.
- The web meeting UI has no automated tests and hasn't been tried in a real browser by the agents.
- The Claude provider is covered by tests with a fake client (validation, prompts) but has not been run
  against the live API in CI; try it once with a real key (`@AI` in #general, then "Ask the project").
- Claude is called synchronously on `@AI` and, for messages that look like a question, on post. The model
  is `claude-opus-5-5` by default (`ANTHROPIC_MODEL` to change); a cheaper model for the per-message check
  would cut cost. Refusal fallbacks (`server-side-fallback`) are not enabled; a refusal posts an error message.
- Demo teammates (Alex, Jamie, Taylor, Morgan) are placeholder members with no login; real Clerk users are
  added to the project the first time they open it.
- Existing local databases created before this change lack the new decision/suggestion fields until
  reseeded (`npm run db:seed -- --org <id>`).
- Clerk mode: people who leave a Clerk team lose access (their tokens no longer carry that org) but
  stay in the project's member list until webhooks are added. Not yet tested against a real Clerk
  instance in CI; the API tests run in dev mode.
- The web bundle grew ~120 kB (Vite's 500 kB chunk warning) because `@clerk/react` is bundled even in
  dev mode; lazy-load it if load time matters.
- Clerk mode starts teams empty (only `#general`); the demo project stays dev-only.
- Picture-in-Picture chat works in Chrome/Edge only; other browsers get the popup window fallback.
- Messages load the latest 200 per channel; no pagination or search yet. Top-bar search only filters tasks.
- AI only reacts to new messages; it doesn't yet watch deadlines/workload on a schedule (the seeded
  "risk" suggestion shows the intended UX).
- Mind Map and Notes tabs are placeholders.

## Decision log

- 2026-10-23 — **The deadline chip is the date control.** Clicking the date used to jump to the week, while a
  calendar icon opened the picker and × cleared it, so the chip looked like a tag. The chip now sets the
  date. Clear is a separate label. With no date, the whole chip opens the picker. It sits in the calendar header.
- 2026-10-23 — **No month view.** The week columns already list every week that has a task, so a second grid
  repeated the same work. The Week / Month switch and its saved preference are gone.
- 2026-10-23 — **Week view is seven vertical days; month view is the only month grid.** A horizontal day row was
  hard to scan, and one week at a time copied the month's previous / next pattern. Each week is columns,
  this week first, earlier weeks below. The deadline
  stays a card under the title, because a date field next to Week / Month looked like a form control. It
  still edits `project.dueDate` from the calendar.
- 2026-10-23 — **Month view is one month plus a side list.** The side list holds tasks with no due date and tasks
  on other months, so the grid can show empty days without hiding work.
- 2026-10-23 — **The project deadline is edited on the calendar, not in settings.** Settings is still a placeholder.
- 2026-10-23 — **Calendar layout is a per-browser preference, still with no new table.** Weeks start on Monday.
- 2026-10-22 — **Calendar is a view, weeks start Monday.** Task due dates and the project deadline are already
  on the records, so the page adds no table or API. A due date is a local calendar day (`YYYY-MM-DD`). Voice
  meetings stay off this page; they are live calls, not scheduled events.
- 2026-10-21 — **Voice via WebRTC mesh with WS signaling, no new dependency**: teams are <= 6, and a hosted SFU would add a vendor and key.
- 2026-10-21 — **Each participant transcribes their own mic with the browser speech API**: exact speaker labels, no speech-to-text vendor or cost.
- 2026-10-21 — **Meetings are capped at 60 minutes and live AI reads a bounded context** (running summary + new lines + project titles): cost stays bounded.
- 2026-10-21 — **Carry-over is a member-confirmed note, not the transcript**: consistent with "memory = confirmed records".
- 2026-10-22 — **Live meeting AI reacts faster** (40 words / 20s, or 15 words + 8s silence; cap 150 calls, silence check every 2s): the old 80 words / 45s felt like a post-meeting summary, not a participant. About 2-3x the calls.
- 2026-10-22 — **One live meeting per project via a `live_meeting:<projectId>` reservation record** (from PR review): SurrealDB 3.1 has no conditional unique index, and a fixed record id makes concurrent starts fail atomically without one.
- 2026-10-22 — **Summary suggestions are written before the meeting ends, under fixed ids** (from PR review): a failed write now sets `summaryError` so `/end` can retry, and retries never duplicate a suggestion.
- 2026-10-22 — **Meeting transcription via Whisper on Groq when `GROQ_API_KEY` is set** (replaces the 2026-10-21 browser-only choice): Chrome's speech service failed with `network` for the team; Groq's free tier costs nothing, works in any browser and keeps exact speaker labels (each client sends its own mic). Web Speech stays as the fallback.
- 2026-10-22 — **OpenAI-compatible provider via a `messages.parse` adapter (`src/ai/openai.ts`), plain `fetch`**: lets the team test without Claude credits (OpenAI, or Groq's free tier via `OPENAI_BASE_URL`) while reusing the Claude prompts and validation; no new dependency.
- 2026-10-21 — **`ANTHROPIC_FAST_MODEL`** (default `claude-haiku-5-5`) for frequent live calls; summaries stay on `ANTHROPIC_MODEL`.
- 2026-10-20 — **Memory = approved decisions** (not a vector store over chat): answers must be traceable to
  something a member confirmed, which fits "AI suggests, people decide" and avoids answering from
  half-remembered chat. Decisions gained `outcome`/`reason`/`quote` so there is something to answer from.
  Agent Memory (SurrealDB) can still be layered on later for raw messages.
- 2026-10-20 — **No anonymous mode.** Removing "Acting as" is the security story for the Clerk prize; the
  test-only keyless path stays because tests act as several members, and the server refuses to start in it.
- 2026-10-20 — **New dependency `@anthropic-ai/sdk`** (api): official SDK; `messages.parse` + its zod helper
  give validated structured output without hand-written JSON parsing.
- 2026-10-20 — **Clerk for auth** (`@clerk/express`, `@clerk/react`; Clerk prize): a Clerk Organization
  _is_ a project (same id), so team creation, switching and invites come from Clerk instead of our own
  UI. Projects check membership from the org in the session token; the web asks for a token scoped to the
  URL's project (`getToken({ organizationId })`). Members/projects are created lazily on first request
  rather than via webhooks, so local development needs no public URL. Dev mode stays when keys are
  unset so tests and teammates without keys keep working.
- 2026-10-20 — **Hackathon: enter all five prizes** in the order in [HACKATHON.md](HACKATHON.md)
  (Clerk → Claude → Agent Memory → Era → Expo): auth unblocks everything, memory builds on the real
  model, the Era eval measures both, and the mobile app reuses auth and the API.
- 2026-10-20 — **ESLint + Prettier** (not Biome): the React hooks rules (incl. the React Compiler checks)
  only exist as an ESLint plugin. Prettier uses the existing style (single quotes, 140 columns) so the
  first format pass was small. Lint warnings fail CI so they don't pile up.
- 2026-10-20 — **SurrealDB** chosen by the team for the database: live queries fit realtime chat/board;
  record links model "message → suggestion → task" provenance. No ORM; schema lives in `schema.surql`.
- 2026-10-20 — **Embedded SurrealDB for development** (`@surrealdb/node`): no server to install; the
  same code connects to a server with `SURREAL_URL=ws://…`.
- 2026-10-20 — **React + Vite / Express** over Next.js: the UI is an app-like workspace (no SEO/SSR
  need) and a separate API keeps AI keys and the realtime hub server-side.
- 2026-10-20 — **Realtime from LIVE SELECT**, not an in-process event bus, so multiple API instances and
  direct DB writes stay in sync.
- 2026-10-20 — **Chat windows:** Document Picture-in-Picture first (Zoom-like always-on-top window,
  shares React state), popup fallback; a desktop app (Tauri) is deferred until notifications/tray are needed.
- 2026-10-20 — AI suggestions are **records with status**, never direct writes; approval is a separate
  endpoint so the confirmation rule is enforced server-side.
