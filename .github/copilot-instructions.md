# Copilot instructions

Read [AGENTS.md](../AGENTS.md) at the repository root before making changes. It is the single source of
truth for this repo's product rules, structure and conventions, and [docs/PROGRESS.md](../docs/PROGRESS.md)
says what's done and what's next.

The rules that matter most when suggesting code:

- AI output is stored as a `suggestion` record; only `POST /suggestions/:id/approve` may change tasks,
  decisions or assignments.
- Every project route goes through `requireProjectMember`, and every repository query filters by `projectId`.
- Only `apps/api/src/repositories/` contains SurrealQL. Shared types and zod schemas live in `packages/shared`.
- `npm run check` must pass (format, lint, typecheck, test).
