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

Configuration lives in `apps/api/.env`. Copy `apps/api/.env.example` to start.

## Status

- **AI:** it's a local mock (rule-based, no external calls) and is labelled as such in the UI.
  A real model plugs in behind `AiProvider` in `apps/api/src/ai/`.
- **Login:** there isn't one yet. Pick who you are with "Acting as" in the sidebar. This is for
  development only.
- **Placeholders:** Calendar, Files, Overview, Team and Settings are labelled placeholders.

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
