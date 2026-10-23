# Architecture

```
 Browser (React)                      API (Express)                         SurrealDB
 ─────────────────                    ─────────────                         ─────────
 pages/ + features/  ──REST /api──▶   http/routes ─▶ services ─▶ repositories ──▶ tables
        ▲                                   │                                   │
        │                                   └──▶ ai/ (AiProvider: Claude or mock)   │
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
| `file`       | Metadata for a shared project file (name, size, type, uploader). The bytes are not in the database.                                                                         | `uploadedById → member`                       |

All records carry `projectId`; repositories always filter by it.

## The AI action engine

1. `POST …/channels/:id/messages` stores the message and responds immediately.
2. `services/ai-engine.ts` then runs on the message:
   - `detectOpenQuestion` → a `decision` suggestion (shows in the AI Assistant tab, not in chat). With
     Claude it only runs on messages that read like a question or an unsettled choice;
   - if the text mentions `@AI`: `analyzeConversation` over the messages since the AI last spoke returns
     action items, decisions and risks, each with a `reason` and a verbatim `quote` → an `action_items`
     suggestion (plus an AI chat message that renders it), and `decision` / `risk` suggestions in the panel.
3. Members review: edit items (`PATCH /suggestions/:id`), `approve`, or `dismiss`.
4. `services/suggestions.ts#approveSuggestion` is the only place AI output turns into real changes:
   creates tasks / logs a decision / assigns an owner (risk requires an explicit `assigneeId`).
5. All of the above reach every open browser through realtime.

The provider is chosen in `src/ai/index.ts`: Claude (`ai/anthropic.ts`) when `ANTHROPIC_API_KEY` is set,
otherwise the mock (regex rules, nothing external, labelled in the UI). `AI_PROVIDER=mock` forces the mock.
Claude calls use structured output (`client.messages.parse` with a zod schema). The result is then checked
against real data: unknown member/task ids are dropped, and a `quote` is kept only if it appears verbatim in
a message, so a hallucinated quote never reaches the UI. Chat text is passed as data inside tags.

## Project memory

The memory of a project is its **approved decisions** (`decision.status = 'decided'`, with `outcome`,
`reason`, `quote`). `POST .../decisions/ask` (`services/memory.ts`) hands only those records to
`AiProvider.answerFromDecisions` and returns the answer with the decisions it used as `sources`. The chat log
is never read. A decision becomes "decided" only through a member: approving a `decision` suggestion whose
`outcome` the AI saw settled, or "Mark decided" in the Decisions tab (which asks for the outcome).

## Realtime

`realtime/hub.ts` opens one `LIVE SELECT` per realtime table at startup. Each change is converted with
`toPlain()` and sent to the WebSocket clients subscribed to that record's `projectId`. Because changes
come from the database, writes from any API instance (or a DB console) reach clients. The web
`WorkspaceProvider` merges events into its snapshot with idempotent upserts and refetches after a reconnect.

## Files

`file` records are metadata only. `POST /projects/:id/files` takes the raw bytes (`Content-Type: application/octet-stream`),
the display name in `x-file-name`, and the media type in `x-file-type`. `services/files.ts` writes the bytes under
`FILES_DIR/<projectId>/<fileId>` and stores the record; downloads are always sent as attachments. A name is reduced to
its last path segment before it is stored, and anything over 10 MB is rejected. Delete removes the record and the bytes.

## Auth (`apps/api/src/http/context.ts`, `apps/api/src/auth/clerk.ts`)

- `authenticate` runs on every `/api` route and sets the `Caller` (`memberId`, `orgId`).
  - Clerk mode: `clerkMiddleware()` then `getAuth()`; 401 without a session. The Clerk user id is the
    member id; the member row is created from the Clerk profile on first use.
  - Test-only dev mode (no keys): `x-member-id` header. `index.ts` refuses to start a server in this mode.
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

| Variable                                     | Default                     | Notes                                                       |
| -------------------------------------------- | --------------------------- | ----------------------------------------------------------- |
| `PORT`                                       | 4000                        | API port                                                    |
| `SURREAL_URL`                                | `surrealkv://./data/dev.db` | `mem://` for throwaway; `ws://host:8000` for a server       |
| `SURREAL_NS` / `SURREAL_DB`                  | `project_room` / `dev`      |                                                             |
| `SURREAL_USER` / `SURREAL_PASS`              | —                           | remote connections only                                     |
| `SEED_ORG_ID`                                | —                           | Clerk org id: loads the demo project into it if it has none |
| `ANTHROPIC_API_KEY` / `ANTHROPIC_MODEL`      | — / `claude-opus-5-5`       | key set = Claude, otherwise the labelled mock               |
| `AI_PROVIDER`                                | —                           | `mock` forces the mock even when a key is set               |
| `WEB_DIST`                                   | `apps/web/dist`             | built web app served by the API when it exists              |
| `FILES_DIR`                                  | `./data/files`              | uploaded bytes; `/data/files` in the Docker image           |
| `CLERK_PUBLISHABLE_KEY` / `CLERK_SECRET_KEY` | —                           | required; web needs `VITE_CLERK_PUBLISHABLE_KEY`            |

To use a SurrealDB server instead of the embedded engine:
`surreal start --user root --pass root rocksdb:./data/server.db`, then `SURREAL_URL=ws://127.0.0.1:8000`.
