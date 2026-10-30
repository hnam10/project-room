# Project Room

An AI-powered collaborative workspace for individuals and teams of any kind. Chat, a task board and a
brainstorming board are connected by an AI action engine that turns conversation into suggested
tasks, open decisions and risks. The team reviews and approves each suggestion before anything changes.

## Quick start

Requires Node.js 22.9 or newer (`nvm use` reads `.nvmrc`). No database install is needed.

```sh
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.example apps/web/.env.local
npm install
npm run dev
```

In `apps/api/.env`, set the sign-in keys (`CLERK_PUBLISHABLE_KEY`, `CLERK_SECRET_KEY`) and the same publishable key in `apps/web/.env.local` (`VITE_CLERK_PUBLISHABLE_KEY`). The API will not start without them. Enable Organizations in the Clerk dashboard; each organization is a project.

For the model, set a [Nebius Token Factory](https://tokenfactory.nebius.com) key and leave the model id as follows:

```sh
NEBIUS_API_KEY=
NEBIUS_BASE_URL=https://api.tokenfactory.nebius.com/v1
NEBIUS_MODEL=nvidia/Nemotron-3.5-Super-VL
```

Without `NEBIUS_API_KEY`, chat and meetings still run, and the UI labels the AI as a mock.

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

## NVIDIA Nemotron on Nebius Token Factory

The model is **NVIDIA Nemotron 3.5 Super VL** (`nvidia/Nemotron-3.5-Super-VL`), an open NVIDIA model. **Nebius Token Factory** is the service that runs it.

Nemotron is the model. Token Factory is the API in front of it. This app does not download weights and does not start a GPU server. `apps/api/src/ai/routing.ts` sends each model call to `https://api.tokenfactory.nebius.com/v1`. Token Factory runs Nemotron and returns the tokens. That is the difference: the same open model, already hosted, so the project only needs an API key.

With `NEBIUS_API_KEY` set, that one model covers the whole AI loop. People still approve every change. The model only proposes.

| Where it runs     | What Nemotron does                                                                                                                                                     |
| ----------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Chat (`@AI`)      | Reads the channel and proposes tasks, ideas, and risks, each with a reason and a quote from the conversation.                                                          |
| Ordinary messages | Reads a clear request such as "I want to add a student discount to the fitness topic" and turns it into a topic or idea. Tentative wording stays a pending suggestion. |
| Brainstorm board  | Classifies the goal, drafts a short strategy (direction, steps, scope), and summarizes research into cards the team can edit.                                          |
| Live meeting      | On each tick, proposes ideas and tasks from what was just said. At the end, writes the meeting summary.                                                                |

Token Factory is what made those calls practical during a hackathon. Meeting ticks and brainstorm steps fire while people are still talking. Each one is a short request to a model Nebius already serves. Standing up Nemotron ourselves would have meant renting GPUs, loading the weights, and running an inference server before any of those features worked. Token Factory removed that step: point `NEBIUS_BASE_URL` at Token Factory and the same client talks to Nemotron.

No other Nebius product is used. Only Token Factory.

## Status

- **AI:** NVIDIA Nemotron 3.5 Super VL on Nebius Token Factory. Suggestions include action items, ideas, and risks, each with a reason and a quote. Nothing is created until a member approves it.
- **Brainstorm:** idea and strategy drafts require member approval. Hearts are personal support and do not approve an idea.
- **Login:** Clerk is required (`apps/api/.env` and `apps/web/.env.local`, see the `.env.example` files);
  each Clerk organization is a project. There is no anonymous or "Acting as" mode.
- **Demo data:** `npm run db:seed -- --org org_xxx` (or `SEED_ORG_ID` on the server) loads the demo project
  into one of your Clerk organizations.
- **Deploy:** the [Dockerfile](Dockerfile) builds one image that serves the API and the web app; mount a
  volume at `/data` for the embedded database and uploaded files.
- **Placeholders:** Overview and Settings are labelled placeholders. Team membership will live on Settings; `/team` redirects there. The calendar shows task due dates by week and the project deadline. Files are uploaded project files.

## License

[ISC License](LICENSE).

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
