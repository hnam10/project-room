# Hackathon plan

We're entering Project Room for all five non-cash prizes. This file says how each sponsor fits the
product, so the whole team builds toward the same demo. Status and owners live in
[PROGRESS.md](PROGRESS.md) ("Next up"); product rules in [AGENTS.md](../AGENTS.md) still apply.

Judges reward depth over checkbox integrations. If time runs short, go deep on steps 1–3, keep step 4
small but real, and only do step 5 if there's time left.

## Build order (one branch / PR each)

| #   | Work                       | Prizes it serves                | Depends on |
| --- | -------------------------- | ------------------------------- | ---------- |
| 1   | Clerk auth + organizations | Clerk, Best Overall             | —          |
| 2   | Claude provider (real AI)  | Best Overall                    | —          |
| 3   | SurrealDB Agent Memory     | Agent Memory, Best Overall      | 2          |
| 4   | Era eval harness           | Eon, Agent Memory, Best Overall | 2 (3)      |
| 5   | Expo mobile companion      | Expo                            | 1          |

## 1. Clerk — real auth, teams and invites

- Sign-in/up and the user menu use Clerk components; the API verifies the Clerk session token
  (`clerkMiddleware()` + `getAuth()`), and the WebSocket verifies a token too.
- **A Clerk Organization is a Project Room project.** Creating a team, switching teams and inviting
  members use Clerk's `<OrganizationSwitcher>` / organization UI, so we don't build invite flows.
- Org roles map to product rules: e.g. only `org:admin` can make a suggestion an official decision.
- Keys: `CLERK_SECRET_KEY` (api), `VITE_CLERK_PUBLISHABLE_KEY` (web). Without them the app keeps the
  dev "Acting as" mode, so tests and teammates without keys still work.

## 2. Best Overall — the core loop with a real model

- Implement `AiProvider` with Claude (`src/ai/anthropic.ts`, `ANTHROPIC_API_KEY`, structured output
  for action items and open questions). Keep `mock` as the default when no key is set.
- Add "summarize this channel" as a suggestion kind.
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

## 4. Eon (Era) — measure the AI instead of claiming it works

[Era](https://www.eon.io/blog/era-build-and-test-ai-agents) generates simulated companies (Slack, Jira, …)
with exact answer keys, reachable over MCP/REST, graded by code instead of an LLM judge.

- Feed Era's simulated Slack conversations into our action-item extractor and score the suggestions
  against Era's Jira tickets as ground truth.
- Run it as a script / CI job and show a table: mock vs. Claude vs. Claude + Agent Memory. That one
  number supports the Eon, Agent Memory and Best Overall entries.
- Era simulates enterprises, not student teams: use it for evaluation, not as product data.

## 5. Expo — a mobile companion, not a port

- `apps/mobile` (Expo Router) in the monorepo, reusing `packages/shared` types and the same API;
  sign-in with Clerk's Expo SDK.
- Only what phones are good at: push notification "AI suggestion waiting for your approval",
  approve / edit / dismiss, chat, my tasks.
- EAS Build for installable builds; EAS Update to ship fixes during judging.

## Keys we need

Put them in `apps/api/.env` / `apps/web/.env.local` (git-ignored); never commit them.

| Service      | Variables                                        |
| ------------ | ------------------------------------------------ |
| Clerk        | `CLERK_SECRET_KEY`, `VITE_CLERK_PUBLISHABLE_KEY` |
| Anthropic    | `ANTHROPIC_API_KEY`                              |
| Agent Memory | `AGENT_MEMORY_ENDPOINT`, `AGENT_MEMORY_API_KEY`  |
| Era          | from the Era console setup (`.env` it generates) |
| Expo         | Expo account for EAS (`eas login`)               |
