# Copilot instructions

Read [AGENTS.md](../AGENTS.md) at the repository root before making changes. It is the single source of
truth for this repo's product rules, structure and conventions, and [docs/PROGRESS.md](../docs/PROGRESS.md)
says what's done and what's next.

The rules that matter most when suggesting code:

- AI output is stored as a `suggestion` record; only `POST /suggestions/:id/approve` may change tasks,
  decisions or assignments.
- Clerk is required (no anonymous mode). Questions about the project are answered from approved decisions
  only, never from the chat log.
- Every project route goes through `requireProjectMember`, and every repository query filters by `projectId`.
- Only `apps/api/src/repositories/` contains SurrealQL. Shared types and zod schemas live in `packages/shared`.
- `npm run check` must pass (format, lint, typecheck, test).
- Brainstorm web examples need a specific idea and a relevant, linkable source. No match means no card;
  source links attach to ideas only after a member approves them.
- Classify the brainstorming goal before researching: product goals may use web examples, while non-product
  goals get context-based ideas or strategies. Keep every AI draft reviewable.
- Use Option for a direct choice (such as cuisine for dinner), Product for something to build, and Strategy
  for a plan. Research is a sourced evidence section, not an idea theme; older Engagement and Platform
  values remain valid for existing records.
- Chat `@AI brainstorm` creates a reviewable `brainstorm_topic` suggestion alongside idea drafts. Only
  approval creates or updates the board topic; dismissing it leaves the current topic intact.
