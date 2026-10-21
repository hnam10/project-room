import type { Server } from 'node:http';
import { WebSocket, WebSocketServer } from 'ws';
import { Table, type LiveSubscription, type Surreal } from 'surrealdb';
import type { ClientSubscribe, RealtimeAction, RealtimeTable, ServerMessage } from '@project-room/shared';
import { toPlain } from '../db/records.js';
import { ensureClerkMember, verifySessionToken } from '../auth/clerk.js';
import { authMode } from '../config.js';
import { devMemberId, projectForCaller, type Caller } from '../http/context.js';

// Pushes database changes to browsers. SurrealDB LIVE SELECT queries report every change to the
// realtime tables; each change is forwarded to the sockets subscribed to that record's project.
// Because the source is the database, changes made by any API instance or tool reach clients.

const TABLES: RealtimeTable[] = ['task', 'message', 'idea', 'decision', 'suggestion'];
const ACTIONS: Record<string, RealtimeAction | undefined> = { CREATE: 'create', UPDATE: 'update', DELETE: 'delete' };

export interface RealtimeHub {
  close(): Promise<void>;
}

export async function startRealtime(server: Server, db: Surreal): Promise<RealtimeHub> {
  const wss = new WebSocketServer({ server, path: '/ws' });
  const socketsByProject = new Map<string, Set<WebSocket>>();

  wss.on('connection', (socket, request) => {
    // Browsers can't set headers on a WebSocket, so the identity comes from the query string:
    // a Clerk session token (`?token=`), or in dev mode the member id (`?member=`).
    const url = new URL(request.url ?? '/', 'http://localhost');
    const caller = authenticateSocket(url).catch(() => null);
    let projectId: string | null = null;

    socket.on('message', async (raw) => {
      let msg: ClientSubscribe;
      try {
        msg = JSON.parse(String(raw));
      } catch {
        return;
      }
      if (msg.type !== 'subscribe' || typeof msg.projectId !== 'string') return;
      const who = await caller;
      const project = who && (await projectForCaller(who, msg.projectId));
      if (!project) {
        socket.close(4403, 'Not a member of this project');
        return;
      }
      if (projectId) socketsByProject.get(projectId)?.delete(socket);
      projectId = project.id;
      if (!socketsByProject.has(projectId)) socketsByProject.set(projectId, new Set());
      socketsByProject.get(projectId)!.add(socket);
      send(socket, { type: 'ready', projectId });
    });

    socket.on('close', () => {
      if (projectId) socketsByProject.get(projectId)?.delete(socket);
    });
  });

  const subscriptions: LiveSubscription[] = [];
  for (const table of TABLES) {
    const subscription = await db.live(new Table(table));
    subscriptions.push(subscription);
    void (async () => {
      for await (const { action, value } of subscription) {
        const realtimeAction = ACTIONS[action];
        if (!realtimeAction || !value) continue;
        const record = toPlain<{ projectId?: string }>(value);
        const sockets = record.projectId ? socketsByProject.get(record.projectId) : undefined;
        if (!sockets?.size) continue;
        const message = { type: 'change', table, action: realtimeAction, record } as ServerMessage;
        for (const socket of sockets) send(socket, message);
      }
    })().catch((error) => console.error(`Live query on ${table} stopped`, error));
  }

  return {
    async close() {
      await Promise.allSettled(subscriptions.map((s) => s.kill()));
      for (const client of wss.clients) client.terminate();
      await new Promise<void>((resolve) => wss.close(() => resolve()));
    },
  };
}

async function authenticateSocket(url: URL): Promise<Caller | null> {
  if (authMode === 'dev') return { memberId: devMemberId(url.searchParams.get('member')), orgId: null };
  const token = url.searchParams.get('token');
  const auth = token ? await verifySessionToken(token) : null;
  if (!auth) return null;
  await ensureClerkMember(auth.userId);
  return { memberId: auth.userId, orgId: auth.orgId };
}

function send(socket: WebSocket, message: ServerMessage): void {
  if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
}
