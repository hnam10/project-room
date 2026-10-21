# Architecture

```
 Browser (React)                      API (Express)                         SurrealDB
 ─────────────────                    ─────────────                         ─────────
 pages/ + features/  ──REST /api──▶   http/routes ─▶ services ─▶ repositories ──▶ tables
        ▲                                   │                                   │
        │                                   └──▶ ai/ (AiProvider: mock today)   │
        └────────── WebSocket /ws ◀── realtime/hub ◀──── LIVE SELECT ◀──────────┘
```

npm workspaces monorepo: `packages/shared` (types + zod), `apps/api`, `apps/web`. In development
Vite serves the web app on :5173 and proxies `/api` and `/ws` to the API on :4000.

## Data model (SurrealDB, `apps/api/src/db/schema.surql`)

| Table        | Purpose                                                                                                                                                                     | Key links                                     |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| `member`     | A person                                                                                                                                                                    | —                                             |
| `project`    | Workspace; holds `memberIds` and the `taskCounter` for #numbers                                                                                                             | `memberIds → member`                          |
| `channel`    | Chat channel                                                                                                                                                                | `projectId`                                   |
| `message`    | Chat message; `authorId` is a member id or `'ai'`                                                                                                                           | `channelId`, `suggestionId`                   |
| `task`       | Board card; `num` is per-project, `sourceKind/sourceId` record where it came from                                                                                           | `assigneeId → member`                         |
| `idea`       | Brainstorm card; votes are `voterIds`                                                                                                                                       | `taskId` once converted                       |
| `decision`   | Open question or recorded decision                                                                                                                                          | `raisedById`, `decidedById`                   |
| `suggestion` | **Structured AI output** awaiting review: `kind` = `action_items` / `decision` / `risk`, `status` = `pending` / `approved` / `dismissed`, with `reason`, `quote`, `items[]` | `sourceMessageId`, `taskId`, `createdTaskIds` |

All records carry `projectId`; repositories always filter by it.

## The AI action engine

1. `POST …/channels/:id/messages` stores the message and responds immediately.
2. `services/ai-engine.ts` then runs on the message:
   - `detectOpenQuestion` → a `decision` suggestion (shows in the AI Assistant tab, not in chat);
   - if the text mentions `@AI`: `extractActionItems` over the messages since the AI last spoke →
     an `action_items` suggestion plus an AI chat message that renders it.
3. Members review: edit items (`PATCH /suggestions/:id`), `approve`, or `dismiss`.
4. `services/suggestions.ts#approveSuggestion` is the only place AI output turns into real changes:
   creates tasks / logs a decision / assigns an owner (risk requires an explicit `assigneeId`).
5. All of the above reach every open browser through realtime.

The provider is chosen by `AI_PROVIDER` (`src/ai/index.ts`). `mock` uses regex rules and calls nothing
external; it is labelled in the UI.

## Realtime

`realtime/hub.ts` opens one `LIVE SELECT` per realtime table at startup. Each change is converted with
`toPlain()` and sent to the WebSocket clients subscribed to that record's `projectId`. Because changes
come from the database, writes from any API instance (or a DB console) reach clients. The web
`WorkspaceProvider` merges events into its snapshot with idempotent upserts and refetches after a reconnect.

## Auth (`apps/api/src/http/context.ts`, `apps/api/src/auth/clerk.ts`)

- `authenticate` runs on every `/api` route and sets the `Caller` (`memberId`, `orgId`).
  - Clerk mode: `clerkMiddleware()` then `getAuth()`; 401 without a session. The Clerk user id is the
    member id; the member row is created from the Clerk profile on first use.
  - Dev mode: `x-member-id` header (no security).
- `projectForCaller()` decides project access for both HTTP (`requireProjectMember`) and the WebSocket.
  In Clerk mode the session's `orgId` must equal the project id; the project (with `#general`) and the
  membership are created on first use.
- Web: `api/auth.ts` adds `Authorization: Bearer <token>` with a token scoped to the project's org
  (`getToken({ organizationId })`); the socket passes `?token=`. Clerk UI lives in
  `features/account/ClerkAccount.tsx` (sign-in gate, `OrganizationSwitcher`, `UserButton`, invites).

## Web app

- Routes (`App.tsx`): `/p/:projectId/{board,chat,brainstorm,decisions,calendar,files,overview,team,settings}`
  inside `WorkspaceLayout`; `/p/:projectId/popout/chat` is the standalone chat window.
- State: `SessionProvider` (current member) → `WorkspaceProvider` (project snapshot, messages per channel,
  realtime) → `ChatWindowProvider` (where the chat panel lives).
- Chat window modes (`state/chatWindow.tsx`), persisted per browser:
  - `docked` — inside the dock under the board; drag the header out to float it;
  - `floating` — draggable/resizable inside the page; drop it on the dock to re-attach;
  - `pip` — Document Picture-in-Picture window (Chrome/Edge), always on top. Rendered with
    `createPortal` into the PiP document, so it shares React state with the main window;
  - `popup` — fallback `window.open` to the popout route; synced through realtime, docks back via
    `BroadcastChannel`.
- The dock's height and the chat/brainstorm split are draggable (`features/dock/ResizeHandle.tsx`).

## Configuration (`apps/api/.env`)

| Variable                                     | Default                     | Notes                                                         |
| -------------------------------------------- | --------------------------- | ------------------------------------------------------------- |
| `PORT`                                       | 4000                        | API port                                                      |
| `SURREAL_URL`                                | `surrealkv://./data/dev.db` | `mem://` for throwaway; `ws://host:8000` for a server         |
| `SURREAL_NS` / `SURREAL_DB`                  | `project_room` / `dev`      |                                                               |
| `SURREAL_USER` / `SURREAL_PASS`              | —                           | remote connections only                                       |
| `SEED_WHEN_EMPTY`                            | `true`                      | loads the demo project into an empty DB                       |
| `AI_PROVIDER`                                | `mock`                      |                                                               |
| `CLERK_PUBLISHABLE_KEY` / `CLERK_SECRET_KEY` | —                           | both set = Clerk mode; web needs `VITE_CLERK_PUBLISHABLE_KEY` |

To use a SurrealDB server instead of the embedded engine:
`surreal start --user root --pass root rocksdb:./data/server.db`, then `SURREAL_URL=ws://127.0.0.1:8000`.
