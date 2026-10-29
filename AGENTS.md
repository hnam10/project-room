# AGENTS.md — working on Project Room

Instructions for AI coding agents (Claude Code, Codex, Cursor, Copilot, …) and for the humans
directing them. Read this first, then follow the "Start of every session" steps. `CLAUDE.md`
imports this file, so there is one source of truth.

## What this is

Project Room is an AI-powered collaborative workspace for individuals and teams of any kind. Chat,
a task board and a brainstorming board are connected by an **AI action engine** that turns
conversation into structured suggestions (tasks, ideas, polls, risks) which the team reviews
and approves. Core loop: **Conversations → Insights → Decisions → Actions → Progress**.

- Product spec (what & why): [docs/PRODUCT_BRIEF.md](docs/PRODUCT_BRIEF.md)
- Structure (how): [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)
- Status, next steps, decision log: [docs/PROGRESS.md](docs/PROGRESS.md)
- Hackathon prize plan (what we build next and why): [docs/HACKATHON.md](docs/HACKATHON.md)

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

| Command                    | What it does                                                              |
| -------------------------- | ------------------------------------------------------------------------- |
| `npm run dev`              | API (http://localhost:4000) + web (http://localhost:5173) with reload     |
| `npm run check`            | Everything CI runs except the build: format, lint, typecheck, test        |
| `npm test`                 | API tests (vitest): AI rules + full HTTP/realtime flow on an in-memory DB |
| `npm run typecheck`        | TypeScript across all workspaces                                          |
| `npm run lint`             | ESLint (TypeScript + React hooks rules); warnings fail too                |
| `npm run format`           | Prettier rewrite; `format:check` only reports                             |
| `npm run build`            | Production build of shared, api, web                                      |
| `npm run db:seed`          | Wipe the local DB and reload the demo project (stop `npm run dev` first)  |
| `npm run eval -w apps/api` | Score AI action-item extraction against an answer key (`src/eval/`)       |
| `npm run prototype`        | The original static HTML prototype (reference only)                       |

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
  src/ai/          AiProvider interface + OpenAI-compatible client and mock
  src/http/        project-membership middleware, error mapping, routes per feature
  src/realtime/    LIVE SELECT → WebSocket fan-out
apps/web/          React 19 + Vite + React Router
  src/pages/       one route per feature (Board, Chat, Brainstorm, Polls, placeholders)
  src/features/    feature components: board/, chat/, brainstorm/, dock/
  src/components/  shared UI primitives (Icon, Avatar, Modal, Feedback = toast/confirm)
  src/state/       session (current member), workspace (project data + realtime), chatWindow, meetingCall
  src/api/         REST client + realtime hook
  src/styles/      plain CSS split by feature; tokens in base.css
prototype/         the first static prototype; do not build on it
```

## Product rules (non-negotiable — from the brief)

- **AI suggests, people decide.** AI output is stored as a `suggestion` record. Only an explicit
  member action (`POST /suggestions/:id/approve`) may create or change tasks, polls, ideas or
  assignments. Never let AI code write to `task`/`poll`/`idea` directly.
- Assigning people, scheduling, notifying and starting votes always need confirmation from a member.
  The team decides by voting: polls opened in meetings are listed in the Polls tab with their results.
- Brainstorm hearts are personal support toggles, available immediately without opening a formal vote.
  Approve is a separate, confirmed member action with no shortlist prerequisite. Hearts never approve an idea.
- Every suggestion carries `reason` (why the AI made it) and, when available, the quoted context.
- Keep suggestion → approved → completed distinct. Never show something as done because AI proposed it.
- Don't fake integrations or data. If a feature isn't built, the UI says so (see `PlaceholderPage`
  and the "isn't built yet" toasts). The mock AI is labelled as mock in the UI.
- Proactive AI goes to the AI Assistant panel; it doesn't interrupt the chat unless @AI is mentioned.
- Explicit member chat requests create member-authored brainstorm records through validated repositories,
  with or without `@AI`: `create topic TITLE`, `I would like to create a Fitness app for students`,
  `add idea TITLE to TOPIC topic`, or `I have an idea for TITLE to TOPIC`. Check existing project topics
  first. A structured intent interpreter reads the latest message, recent channel conversation and all
  project topics, tolerating typos, verb synonyms and semantic topic references. Only a clear latest-member
  request with a verified quote and a verbatim same-member title may create a record. Validate selected
  topic ids against current project data; clarify unknown/ambiguous targets. Reusing a topic never resets
  its board. Ordinary discussion is not a creation request, and AI-generated brainstorming still creates
  pending suggestions. Literal commands remain available without AI; the labelled mock has template-only
  support. Task commands still require `@AI`.
- Natural idea contributions need no `idea` keyword. “I want to add X to the fitness app” directly
  adds the member's idea; tentative phrasing such as “I am thinking of adding X” creates a reviewable
  pending idea suggestion instead. Infer the target from topic names/descriptions and chat context;
  use the sole topic for an omitted/generic target, but never redirect an explicitly unknown target.
  Preserve ambiguity when several topics fit. Pending drafts appear in the Assistant tab and its count.
- `@AI create task TITLE` creates an unassigned To Do task without a due date. A bare `@AI create task`
  asks for a title and consumes only that member's next message in the same channel.
- Data never crosses projects: every project route goes through `requireProjectMember`, and every
  repository query filters by `projectId`.
- Brainstorming starts with a member-selected topic. Each topic has its own board: research and
  reviewable strategies come first, then member ideas and iteration. Changing or deleting a topic
  clears its board; clearing only ideas preserves its research and strategies. Other topics and
  tasks or polls already created are unaffected. New AI topics never replace a topic automatically.
- Topic strategies contain only a recommended direction, a short step-by-step plan and essential scope.
  Each section and each step uses one or two short sentences; no separate focus/why, deliverables,
  success criteria or next-step gates. AI product plans usually have three or four steps (never more than six), simple choices fewer; members may add up to eight.
  Keep guidance specific and provisional; never invent research or user feedback. Take the team's problem as
  stated: no survey, interview or validation steps. Base steps on surveys/studies from the topic's web search
  (last four years only) when found, citing the URL.
- New strategies use the shared `strategyPlanSchema` JSON format with plain-text field values, rendered
  as sections and steps. Preserve legacy text strategies; do not require Markdown rendering.
- Members edit strategies through ordinary text fields for the direction, steps and scope. JSON is an
  internal storage format, never the normal editing interface.
- Brainstorm categories are internal: do not show category selectors, filters or saved-card tags.
  Strategies stay in their section; direct options/ideas share a consistent card style. Preserve existing
  internal themes on edit so older records and AI workflows keep their meaning.
- Idea and strategy cards do not expose Make task. Relevant approval-generated task drafts stay
  reviewable before a member adds them to the task board.
- Meeting idea suggestions must identify a relevant existing topic, retain its `topicId`, and display
  its title. Skip ideas without a clear topic match; a proposed new topic must be approved first.
- Topic-change proposals name the board they replace and require explicit confirmation of that target
  before clearing it. Only proposals for new topics appear in the shared new-topic inbox.

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

Clerk is required; there is no anonymous or "Acting as" mode. Set `CLERK_PUBLISHABLE_KEY` +
`CLERK_SECRET_KEY` in `apps/api/.env` and `VITE_CLERK_PUBLISHABLE_KEY` in `apps/web/.env.local`. The API
refuses to start without them and the web app shows a setup screen. The API verifies the Clerk session
token; a Clerk Organization is a project (same id), and a token only opens the project of the org it is
scoped to.

The only exception is the test suite: with no keys `authMode` is `'dev'` and `x-member-id` / `?member=`
identify the caller, so tests can act as several members. That path never runs in a server (`index.ts`
exits first). Routes read the caller with `caller(res)` / `ctx(res)`; never read `x-member-id` or Clerk directly.

## AI status

`getAiProvider()` splits work across two OpenAI-compatible hosts (`src/ai/openai.ts`, structured output via
`response_format: json_schema` + zod). `OPENAI_API_KEY` runs `@AI`, chat brainstorm drafts
and the end-of-meeting summary. `NEBIUS_API_KEY` runs live meeting ticks, brainstorm
classification, board facilitation, and research summaries. One key covers every job; with neither key the
labelled mock runs. `GROQ_API_KEY` is only meeting speech-to-text. Tests force the mock
(`AI_PROVIDER=mock` in `vitest.config.ts`) so they never call the API. The model's output is a proposal:
ids, tasks and quotes are validated against project data before a suggestion is stored. `@AI` reads the
latest channel thread, older lines that match the question, and Agent Memory passages from uploaded files
when `AGENT_MEMORY_*` is set.
