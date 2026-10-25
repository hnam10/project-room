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
- Internally use Option for a direct choice (such as cuisine for dinner), Product for something to build, and Strategy
  for a plan. Research is a sourced evidence section, not an idea theme; older Engagement and Platform
  values remain valid for existing records.
- Keep category selectors, filters and saved-card tags out of brainstorming. Direct options/ideas share
  one card style; strategies stay separate. Preserve internal themes when editing existing records.
- Brainstorm hearts toggle personal support immediately; no Start voting stage. Approve is shown directly
  and still requires confirmation, without shortlisting. A heart never approves or creates a decision.
- No Make task shortcut on idea or strategy cards; approval-generated next-step tasks remain reviewable.
- Strategies contain only recommended direction, short steps and essential scope. Use one or two
  sentences per section/step, at most four steps, without separate focus/why or deliverable/criteria
  fields. Keep guidance specific and realistic; never invent sources or feedback.
- Strategy generation uses `strategyPlanSchema` JSON with plain-text fields. Render its sections/steps
  directly; legacy text remains readable without Markdown.
- Edit strategies through ordinary direction, step and scope fields; serialize JSON internally.
- Chat `@AI brainstorm` creates a reviewable `brainstorm_topic` suggestion alongside idea drafts. Only
  approval creates a separate topic tab. Explicitly targeted older topic-change proposals clear that
  topic's board on approval. Inbox idea drafts need a topic selection when approved.
- Explicit brainstorm requests work without `@AI`: `create topic TITLE`, `I would like to create a Fitness
app for students`, `add idea TITLE to TOPIC topic`, or `I have an idea for TITLE to TOPIC`. These create
  validated member-authored records without model calls. Reuse exact or unique distinctive shortened
  existing topic names without resetting boards; clarify unknown/ambiguous targets. Ordinary discussion
  never authorizes creation, and AI-generated drafts remain pending. Task commands still require `@AI`.
- `@AI create task TITLE` creates an unassigned To Do task without scheduling. With no title, only the
  requesting member's next message in that channel supplies it.
- Meeting idea proposals must identify a relevant existing topic and store its `topicId`; skip ideas
  without a clear match. Show that topic on the suggestion. New topic proposals stay separate until approved.
- Topic changes name their target board and require `replaceTopicId` confirmation on approval. The shared
  new-topic inbox contains only new-board proposals; changes appear on their target board.
