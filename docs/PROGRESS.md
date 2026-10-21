# Progress

Living status for humans and AI agents. Update it at the end of every work session (see AGENTS.md).
Newest entries at the top of each section. Dates are YYYY-MM-DD.

## Done

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
- [ ] **Real AI provider** (Best Overall) — implement `AiProvider` with the Anthropic API (`src/ai/anthropic.ts`,
      `ANTHROPIC_API_KEY`, structured output for action items/open questions). Keep `mock` as default
      when no key is set. Add conversation summarisation ("summarize this channel") as a suggestion kind.
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
- [ ] Files page (needs storage decision: SurrealDB files vs. S3-compatible bucket).
- [ ] **Real AI provider** — implement `AiProvider` with the Anthropic API (`src/ai/anthropic.ts`,
      `ANTHROPIC_API_KEY`, structured output for action items/open questions). Keep `mock` as default
      when no key is set. Add conversation summarisation ("summarize this channel") as a suggestion kind.

## Known gaps

- Dev mode (no Clerk keys) has no auth: anyone who can reach the API can act as any member. Never
  deploy without `CLERK_*` keys.
- Clerk mode: people who leave a Clerk team lose access (their tokens no longer carry that org) but
  stay in the project's member list until webhooks are added. Not yet tested against a real Clerk
  instance in CI; the API tests run in dev mode.
- The web bundle grew ~120 kB (Vite's 500 kB chunk warning) because `@clerk/react` is bundled even in
  dev mode; lazy-load it if load time matters.
- Clerk mode starts teams empty (only `#general`); the demo project stays dev-only.
- Picture-in-Picture chat works in Chrome/Edge only; other browsers get the popup window fallback.
- Messages load the latest 200 per channel; no pagination or search yet. Top-bar search only covers tasks.
- AI only reacts to new messages; it doesn't yet watch deadlines/workload on a schedule (the seeded
  "risk" suggestion shows the intended UX).
- Mind Map and Notes tabs are placeholders.
- Task search logic (`features/board/search.ts`) has no tests: the web app has no unit-test setup yet.

## Decision log

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
