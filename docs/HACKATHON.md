# Hackathon plan

We're entering Project Room for three prizes: Clerk, SurrealDB Agent Memory and Best Overall. This file says how each sponsor fits the
product, so the whole team builds toward the same demo. Status and owners live in
[PROGRESS.md](PROGRESS.md) ("Next up"); product rules in [AGENTS.md](../AGENTS.md) still apply.

None of the sponsor tools are mandatory, and Best Overall is open to any stack. For the sponsor prizes, judges
look for **evidence that the platform materially shaped what we built**, so each section below names that
evidence. Judges reward depth over checkbox integrations: go deep on steps 1–3. We are not entering Eon or
Expo (see the end of this file).

## Build order (one branch / PR each)

| #   | Work                       | Prizes it serves           | Depends on |
| --- | -------------------------- | -------------------------- | ---------- |
| 1   | Clerk auth + organizations | Clerk, Best Overall        | —          |
| 2   | Claude provider (real AI)  | Best Overall               | —          |
| 3   | SurrealDB Agent Memory     | Agent Memory, Best Overall | 2          |

## 1. Clerk — real auth, teams and invites

- Sign-in/up and the user menu use Clerk components; the API verifies the Clerk session token
  (`clerkMiddleware()` + `getAuth()`), and the WebSocket verifies a token too.
- **A Clerk Organization is a Project Room project.** Creating a team, switching teams and inviting
  members use Clerk's `<OrganizationSwitcher>` / organization UI, so we don't build invite flows.
- Org roles map to product rules: e.g. only `org:admin` can make a suggestion an official decision.
- Keys: `CLERK_PUBLISHABLE_KEY` + `CLERK_SECRET_KEY` (api), `VITE_CLERK_PUBLISHABLE_KEY` (web), and
  **Organizations enabled** in the Clerk dashboard. They are required: the dev "Acting as" picker is gone
  and the API will not start without keys (only the test suite runs keyless).
- Status: sign-in, org = project, team switcher and invites are built (see PROGRESS.md); roles are next.

## 2. Best Overall — the core loop with a real model

- Built: `AiProvider` over an OpenAI-compatible API (`src/ai/openai.ts`, `OPENAI_API_KEY`), structured output
  for action items, decisions and risks, each with a reason and a verbatim quote. The mock runs only when the
  key is missing and stays labelled in the UI.
- Built: "Ask the project" (`POST .../decisions/ask`) answers from approved decisions, not the chat log.
- Still open: "summarize this channel" as a suggestion kind.
- Demo script (≈2 min): chat → @AI → suggestions with reason + quoted message → approve → task on the
  board → progress bar moves. Pitch line: **AI suggests, people decide.**

## 3. SurrealDB Agent Memory — the project's long-term memory

[Agent Memory](https://surrealdb.com/docs/agent-memory) turns conversations into persistent, typed,
time-aware memory with provenance. SDK: `@surrealdb/memory` (`remember`, `rememberMany`, `recall`).

- Write messages, approved decisions and task changes to memory with scope `project/<id>`, so memory
  never crosses projects (same rule as the database).
- Before the AI suggests anything, `recall` related memory so it can say "already decided on Oct 3
  (see message)" or "Mina owns auth" instead of proposing duplicates.
- Time-aware facts fit decisions that get reversed ("chose Postgres → switched to SurrealDB").
- "Ask the project" panel: "why did we pick X?" answered with linked sources — memory output is still
  shown as a suggestion/answer with its source, never written to tasks directly.
- Needs an Agent Memory Cloud endpoint + API key (`AGENT_MEMORY_ENDPOINT`, `AGENT_MEMORY_API_KEY`);
  check whether the hackathon provides access (the product may be waitlisted).

## Keys we need

Put them in `apps/api/.env` / `apps/web/.env.local` (git-ignored); never commit them.

| Service           | Variables                                                                 |
| ----------------- | ------------------------------------------------------------------------- |
| Clerk             | `CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`, `VITE_CLERK_PUBLISHABLE_KEY` |
| OpenAI-compatible | `OPENAI_API_KEY`, optional `OPENAI_BASE_URL` / `OPENAI_MODEL`             |
| Agent Memory      | `AGENT_MEMORY_ENDPOINT`, `AGENT_MEMORY_API_KEY`                           |

## Not entering: Eon and Expo

Decided 2026-10-25 to spend the time on steps 1–3.

- **Eon (Era).** Era's answer keys are for questions over a simulated enterprise, and nothing in its docs links
  Slack conversations to the Jira tickets they produced, which is what scoring our action-item extraction
  needs. Fitting it anyway would not show Era shaping the product, and real-model runs share the free model
  quota with the demo. The local scorer stays: `npm run eval -w apps/api [dataset.json] [--details]` checks
  prompt or model changes against a hand-written answer key.
- **Expo.** A mobile companion (`apps/mobile`, push approvals, Clerk Expo sign-in, EAS) is a second app built from
  scratch; nothing of it exists yet.
