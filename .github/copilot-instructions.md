# Copilot instructions

Read [AGENTS.md](../AGENTS.md) at the repository root before making changes. It is the single source of
truth for this repo's product rules, structure and conventions, and [docs/PROGRESS.md](../docs/PROGRESS.md)
says what's done and what's next.

The rules that matter most when suggesting code:

- AI output is stored as a `suggestion` record; only `POST /suggestions/:id/approve` may change tasks,
  polls, ideas or assignments. The team decides by voting; there is no separate decision record.
- Clerk is required (no anonymous mode).
- Every project route goes through `requireProjectMember`, and every repository query filters by `projectId`.
- Only `apps/api/src/repositories/` contains SurrealQL. Shared types and zod schemas live in `packages/shared`.
- `npm run check` must pass (format, lint, typecheck, test).
- Brainstorm web examples need a specific topic or idea and a relevant, linkable source. No match means no card;
  source links attach to ideas only after a member approves them.
- Each brainstorm topic has its own board (`topicId`). Require a topic before creating cards. Prepare
  research and reviewable strategies first, then let members add ideas. Editing/deleting a topic clears
  that topic's board; clear-ideas preserves research and strategies. Existing tasks/polls remain.
- Classify the brainstorming goal before developing ideas. Topic preparation can research any goal;
  later non-product idea exploration stays context-based. Keep every AI draft reviewable.
- Use Option for a direct choice (such as cuisine for dinner), Product for something to build, and Strategy
  for a plan. Research is a sourced evidence section, not an idea theme; older Engagement and Platform
  values remain valid for existing records.
- Strategies are actionable roadmaps: each step names its focus/why, action, deliverable, success criterion
  and next-step gate. Test assumptions, label evidence versus unknowns, and keep product scope realistic;
  simple non-product choices need only a short plan. Never invent sources or feedback.
- Strategy generation uses `strategyPlanSchema` JSON with plain-text fields. Render its sections/steps
  directly; legacy text remains readable without Markdown.
- Chat `@AI brainstorm` creates a reviewable `brainstorm_topic` suggestion alongside idea drafts. Only
  approval creates a separate topic tab. Explicitly targeted older topic-change proposals clear that
  topic's board on approval. Inbox idea drafts need a topic selection when approved.
- Explicit `@AI create topic TITLE` / `@AI add idea TITLE to TOPIC topic` commands are validated member
  input and create records directly without model calls. Unclear topic targets require clarification.
- `@AI create task TITLE` creates an unassigned To Do task without scheduling. With no title, only the
  requesting member's next message in that channel supplies it.
- Meeting idea proposals must identify a relevant existing topic and store its `topicId`; skip ideas
  without a clear match. Show that topic on the suggestion. New topic proposals stay separate until approved.
- Topic changes name their target board and require `replaceTopicId` confirmation on approval. The shared
  new-topic inbox contains only new-board proposals; changes appear on their target board.
