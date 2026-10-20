# AGENTS.md — working on Project Room

Instructions for AI coding agents (Claude Code, Codex, Cursor, Copilot, …) and for the humans
directing them. Read this first, then follow the "Start of every session" steps. `CLAUDE.md`
imports this file, so there is one source of truth.

## What this is

Project Room is an AI-powered collaborative workspace for student and hackathon teams. Chat,
a task board and a brainstorming board are connected by an **AI action engine** that turns
conversation into structured suggestions (tasks, open decisions, risks) which the team reviews
and approves. Core loop: **Conversations → Insights → Decisions → Actions → Progress**.

- Product spec (what & why): [docs/PRODUCT_BRIEF.md](docs/PRODUCT_BRIEF.md)
- Structure (how): [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- Status, next steps, decision log: [docs/PROGRESS.md](docs/PROGRESS.md)

## Working notes

- The team works in Korean and English: reply in the language the person writes in. Code, comments,
  commit messages and docs stay in English.
- SurrealDB SDK is `surrealdb` 2.x with the embedded engine `@surrealdb/node` (SurrealDB 3.x). Its API
  differs from older examples online — check `node_modules/surrealdb/README.md` before using a new method.
- Tool-specific entry files (`CLAUDE.md`, `GEMINI.md`, `.github/copilot-instructions.md`) point here.
  Put shared rules in this file. If you change a product rule, also update the short summary in
  `.github/copilot-instructions.md` (Copilot can't import files).

## Start of every session

1. `git pull`, then `npm install` if `package-lock.json` changed.
2. Read [docs/PROGRESS.md](docs/PROGRESS.md) — what's done, what's next, known gaps, and why past
   decisions were made. Don't re-litigate a logged decision without a new reason.
3. If the person hasn't said what to work on, propose the top unclaimed item from
   "Next up" in PROGRESS.md and confirm before starting.
4. Run `npm run check` before changing anything, so you know the baseline.

## End of every session (or before opening a PR)

1. `npm run check` passes (the same checks CI runs on every PR; `npm run format` and `npm run lint:fix`
   fix most failures). For UI changes, run the app and check the flow in a browser.
2. Update [docs/PROGRESS.md](docs/PROGRESS.md): move finished items to "Done", add anything you
   discovered to "Known gaps", and log any significant decision with its reason (one line each).
3. Update docs/ARCHITECTURE.md if you added a layer, table, route group, or cross-cutting pattern.
4. Commit on a branch (`feat/…`, `fix/…`), never directly to `main`. One topic per PR.

## Commands

| Command             | What it does                                                              |
| ------------------- | ------------------------------------------------------------------------- |
| `npm run dev`       | API (http://localhost:4000) + web (http://localhost:5173) with reload     |
| `npm run check`     | Everything CI runs except the build: format, lint, typecheck, test        |
| `npm test`          | API tests (vitest): AI rules + full HTTP/realtime flow on an in-memory DB |
| `npm run typecheck` | TypeScript across all workspaces                                          |
| `npm run lint`      | ESLint (TypeScript + React hooks rules); warnings fail too                |
| `npm run format`    | Prettier rewrite; `format:check` only reports                             |
| `npm run build`     | Production build of shared, api, web                                      |
| `npm run db:seed`   | Wipe the local DB and reload the demo project (stop `npm run dev` first)  |
| `npm run prototype` | The original static HTML prototype (reference only)                       |

Node ≥ 22.9 (see `.nvmrc`). No database server is needed for development: SurrealDB runs
embedded and stores data in `apps/api/data/` (git-ignored). Config is in `apps/api/.env`
(copy `apps/api/.env.example`).

## Repository map

```
packages/shared/   Domain types, zod request schemas, realtime event types — used by api AND web
apps/api/          Express 5 + SurrealDB (embedded or remote) + WebSocket realtime
  src/db/          connection, schema.surql (applied on start), seed, record-id helpers
  src/repositories/  one file per table; only place that writes SurrealQL
  src/services/    business rules (AI engine, suggestion approval)
  src/ai/          AiProvider interface + providers (mock only, today)
  src/http/        project-membership middleware, error mapping, routes per feature
  src/realtime/    LIVE SELECT → WebSocket fan-out
apps/web/          React 19 + Vite + React Router
  src/pages/       one route per feature (Board, Chat, Brainstorm, Decisions, placeholders)
  src/features/    feature components: board/, chat/, brainstorm/, dock/
  src/components/  shared UI primitives (Icon, Avatar, Modal, Feedback = toast/confirm)
  src/state/       session (current member), workspace (project data + realtime), chatWindow
  src/api/         REST client + realtime hook
  src/styles/      plain CSS split by feature; tokens in base.css
prototype/         the first static prototype; do not build on it
```

## Product rules (non-negotiable — from the brief)

- **AI suggests, people decide.** AI output is stored as a `suggestion` record. Only an explicit
  member action (`POST /suggestions/:id/approve`) may create or change tasks, decisions or
  assignments. Never let AI code write to `task`/`decision`/`idea` directly.
- Assigning people, scheduling, notifying, starting votes, and making something an official
  decision always need confirmation from a member.
- Every suggestion carries `reason` (why the AI made it) and, when available, the quoted context.
- Keep suggestion → approved → completed distinct. Never show something as done because AI proposed it.
- Don't fake integrations or data. If a feature isn't built, the UI says so (see `PlaceholderPage`
  and the "isn't built yet" toasts). The mock AI is labelled as mock in the UI.
- Proactive AI goes to the AI Assistant panel; it doesn't interrupt the chat unless @AI is mentioned.
- Data never crosses projects: every project route goes through `requireProjectMember`, and every
  repository query filters by `projectId`.

## Engineering conventions

- **Types first:** new entities/fields go in `packages/shared/src/domain.ts`; request bodies get a
  zod schema in `schemas.ts`. The API validates with the schema; the web uses the inferred type.
- **Schema:** add tables/fields to `apps/api/src/db/schema.surql` (`DEFINE … OVERWRITE`, SCHEMAFULL,
  with ASSERTs). Reference fields keep API names (`projectId`, `assigneeId`) but hold record links;
  `toPlain()` turns them back into plain ids. Nullable fields use `TYPE null | …`.
- **Layers:** route → service (if there's a business rule) → repository. Routes stay thin; only
  repositories contain SurrealQL. Throw `NotFoundError`/`ConflictError`; `errorHandler` maps them.
- **Realtime:** tables listed in `realtime/hub.ts` broadcast automatically via LIVE SELECT. A new
  realtime table needs a `projectId` field and an entry in `RealtimeRecords` (shared).
- **AI:** call AI only through `getAiProvider()`. To add a model provider, implement `AiProvider`
  in `src/ai/<name>.ts`, read the key from env, register it in `src/ai/index.ts`. Keys stay server-side.
- **Web state:** read project data via `useSnapshot()`/`useWorkspace()`; after an API call, pass the
  returned record to `applyRecord()` (the realtime echo is an idempotent upsert).
- **UI:** reuse classes from `src/styles/*` and primitives from `src/components/`; light theme,
  tokens in `base.css`. Confirm destructive or sensitive actions with `useFeedback().confirm`.
  Modals render in place (no portal) so they work inside the Picture-in-Picture chat window.
- Match the surrounding code's style; Prettier owns formatting (`.prettierrc.json`), ESLint owns
  correctness (`eslint.config.mjs`). Don't silence a rule inline without a comment saying why.
- No new dependencies without a reason noted in PROGRESS.md.
- CI (`.github/workflows/ci.yml`) runs format, lint, typecheck, test, build and a production
  dependency audit on every PR and on `main`. Keep it green; don't merge a red PR.
- Tests: business rules and API flows get vitest tests in `apps/api/src/**/*.test.ts`.

## Auth status

There is **no real authentication yet**. The web sends `x-member-id` (picked in the sidebar,
"Acting as"); the WebSocket uses `?member=`. This is dev-only and must be replaced before any
shared deployment (tracked in PROGRESS.md).
