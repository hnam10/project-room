# Progress

Living status for humans and AI agents. Update it at the end of every work session (see AGENTS.md).
Newest entries at the top of each section. Dates are YYYY-MM-DD.

## Done

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

- [ ] **Real AI provider** — implement `AiProvider` with the Anthropic API (`src/ai/anthropic.ts`,
      `ANTHROPIC_API_KEY`, structured output for action items/open questions). Keep `mock` as default
      when no key is set. Add conversation summarisation ("summarize this channel") as a suggestion kind.
- [ ] **Authentication** — replace the dev `x-member-id` header / `?member=` socket param with real
      sessions (e.g. SurrealDB record access + JWT, or email magic link). Then remove "Acting as".
- [ ] **Create projects, channels and invite members** (buttons currently show "isn't built yet").
- [ ] **Overview page** — progress, overdue tasks, upcoming deadlines, open decisions, workload per member.
- [ ] **Calendar page** — tasks with due dates by week; project deadline.
- [ ] **Brainstorm grouping** — themes as columns, compare proposals, "start a vote" (needs confirmation).
- [ ] **Web tests** — Playwright for: approve AI action items → task appears; drag task; detach chat.
- [ ] Files page (needs storage decision: SurrealDB files vs. S3-compatible bucket).

## Known gaps

- No auth (see Next up). Anyone who can reach the API can act as any member.
- Picture-in-Picture chat works in Chrome/Edge only; other browsers get the popup window fallback.
- Messages load the latest 200 per channel; no pagination or search yet. Top-bar search only filters tasks.
- AI only reacts to new messages; it doesn't yet watch deadlines/workload on a schedule (the seeded
  "risk" suggestion shows the intended UX).
- Mind Map and Notes tabs are placeholders.

## Decision log

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
