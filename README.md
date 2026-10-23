# Project Room

An AI-powered collaborative workspace for student and hackathon teams. Chat, a task board and a
brainstorming board are connected by an AI action engine that turns conversation into suggested
tasks, open decisions and risks. The team reviews and approves each suggestion before anything changes.

## Quick start

Requires Node.js 22.9 or newer (`nvm use` reads `.nvmrc`). No database install is needed.

```sh
npm install
npm run dev
```

Open <http://localhost:5173>. The API runs on :4000, with an embedded SurrealDB in `apps/api/data/`.
On first start it loads a demo project, "Hackathon 2026".

Try it:

1. In chat, write something like `I'll build the pitch deck. We still need to book a room. @AI tasks?`
   or `@AI brainstorm ways to reduce food waste on campus`.
2. Review the proposed action items, then choose **Add to Board**. The tasks appear in **To Do**.
3. Open the app in a second browser window. Changes appear live in both.
4. Drag the chat header out of the dock to float it, or use the window button to open it in its own window.

| Command             |                                                              |
| ------------------- | ------------------------------------------------------------ |
| `npm run dev`       | API + web with reload                                        |
| `npm run check`     | Format, lint, typecheck and tests (what CI runs)             |
| `npm test`          | API tests (AI rules, HTTP + realtime flow)                   |
| `npm run typecheck` | TypeScript, all packages                                     |
| `npm run build`     | Production build                                             |
| `npm run db:seed`   | Reset the local database to the demo data (stop `dev` first) |

Configuration lives in `apps/api/.env` (copy `apps/api/.env.example`) and `apps/web/.env.local`. The API will not start without Clerk keys.

## Status

- **AI:** Claude when `ANTHROPIC_API_KEY` is set (structured action items, decisions and risks, each with a
  reason and a quote; plus "Ask the project", answered from approved decisions only). Without a key a local
  rule-based mock runs and is labelled as such in the UI.
- **Brainstorm research:** optional Tavily web search with `TAVILY_API_KEY`. AI idea drafts keep clickable
  sources, require member approval, and stay closed to votes until a member confirms "Start voting".
- **Login:** Clerk is required (`apps/api/.env` and `apps/web/.env.local`, see the `.env.example` files);
  each Clerk organization is a project. There is no anonymous or "Acting as" mode.
- **Demo data:** `npm run db:seed -- --org org_xxx` (or `SEED_ORG_ID` on the server) loads the demo project
  into one of your Clerk organizations.
- **Deploy:** the [Dockerfile](Dockerfile) builds one image that serves the API and the web app; mount a
  volume at `/data` for the embedded database and uploaded files.
- **Placeholders:** Overview, Team and Settings are labelled placeholders. The calendar shows task due dates by week and the project deadline.

## Docs

- [AGENTS.md](AGENTS.md): how to work in this repo. It's written for AI coding agents and the people directing them.
- [docs/PRODUCT_BRIEF.md](docs/PRODUCT_BRIEF.md): what we're building and why.
- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md): how it fits together.
- [docs/PROGRESS.md](docs/PROGRESS.md): what's done, what's next, and the decision log.

## Working with AI assistants

Using Claude Code, Codex, Cursor or similar? Pull `main` and start the session with:

> Read AGENTS.md and docs/PROGRESS.md, then continue with the next task.

In Claude Code you can also run `/continue-build`. Before you finish, the agent updates
`docs/PROGRESS.md`, so the next person (or agent) can pick up where you stopped.
