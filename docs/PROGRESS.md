# Progress

Living status for humans and AI agents. Update it at the end of every work session (see AGENTS.md).
Newest entries at the top of each section. Dates are YYYY-MM-DD.

## Done

- 2026-10-23 — **File deletion and batch upload fixes.** Deletes enforce the project boundary in the write
  and retain metadata when disk removal fails so DELETE can be retried. Batch uploads continue after each failed file.
- 2026-10-21 — **Files page.** Members can upload, download, and delete project files from the Files nav item.
  Metadata is a `file` record (in the snapshot and over realtime); the bytes live on disk under `FILES_DIR`
  (default `./data/files`, `/data/files` in the image). Uploads are capped at 10 MB and always download as
  attachments. A file name is stored as its last path segment.
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
- [ ] **Calendar page** — tasks with due dates by week; project deadline.
- [ ] **Brainstorm grouping** — themes as columns, compare proposals, "start a vote" (needs confirmation).
- [ ] **Web tests** — Playwright for: approve AI action items → task appears; drag task; detach chat.

## Known gaps

- The Files picker clears its live `FileList` before starting uploads; use drag and drop until that separate issue is fixed.
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
- Files have no in-browser preview or version history. Delete removes the record and the bytes.

## Decision log

- 2026-10-21 — **File bytes on disk, metadata in SurrealDB** (no S3): team uploads are small, and the same
  `/data` volume that keeps the embedded database keeps `FILES_DIR`. The snapshot and realtime carry only
  the `file` record, so a download is a separate authenticated request.
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
