import { createHash } from 'node:crypto';
import { z } from 'zod';
import { getProject } from '../repositories/projects.js';
import { deletePushToken, listPushTokensForMembers } from '../repositories/push-tokens.js';

const EXPO_PUSH_URL = 'https://exp.host/--/api/v2/push/send';

export function isReviewableSuggestion(record: { kind?: string; status?: string; title?: string }): boolean {
  if (record.status && record.status !== 'pending') return false;
  const kind = record.kind ?? '';
  const title = record.title ?? '';
  if (kind === 'brainstorm_analysis') return /^(Similar work:|Topic research:)/.test(title);
  return (
    kind === 'risk' ||
    kind === 'idea' ||
    kind === 'brainstorm_topic' ||
    kind === 'action_items' ||
    kind === 'poll' ||
    kind === 'meeting_notes'
  );
}

function pushEnabled(): boolean {
  if (process.env.NODE_ENV === 'test' || process.env.AI_PROVIDER === 'mock') return process.env.EXPO_PUSH === '1';
  return process.env.EXPO_PUSH !== '0';
}

/** Best-effort Expo push when a reviewable suggestion is created. Never throws to callers. */
export function notifySuggestionCreated(record: { projectId?: string; id?: string; kind?: string; status?: string; title?: string }): void {
  if (!pushEnabled() || !record.projectId || !isReviewableSuggestion(record)) return;
  void send(record.projectId).catch((error) => {
    console.error('Expo push failed', error);
  });
}

const ticketSchema = z.object({
  status: z.enum(['ok', 'error']),
  message: z.string().optional(),
  details: z.object({ error: z.string().optional() }).optional(),
});
const responseSchema = z.object({
  data: z.array(ticketSchema).optional(),
  errors: z.array(z.object({ code: z.string().optional(), message: z.string().optional() })).optional(),
});

async function send(projectId: string): Promise<void> {
  const project = await getProject(projectId);
  if (!project) return;
  const tokens = await listPushTokensForMembers(project.memberIds);
  for (let i = 0; i < tokens.length; i += 100) {
    const chunk = tokens.slice(i, i + 100);
    const context = { projectId, batchOffset: i, batchSize: chunk.length };
    try {
      const response = await fetch(EXPO_PUSH_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        // Devices can remain registered during offline sign-out. Never include workspace content or ids.
        body: JSON.stringify(
          chunk.map(({ token }) => ({
            to: token,
            title: 'AI suggestion waiting for your approval',
            body: 'Open the app to check for updates.',
          })),
        ),
      });
      if (!response.ok) {
        console.error('Expo push HTTP error', { ...context, status: response.status, detail: (await response.text()).slice(0, 1000) });
        continue;
      }
      const result = responseSchema.safeParse(await response.json());
      if (!result.success || !result.data.data || result.data.data.length !== chunk.length) {
        console.error('Expo push invalid ticket response', {
          ...context,
          errors: result.success ? result.data.errors : result.error.issues,
        });
        continue;
      }
      for (const [index, ticket] of result.data.data.entries()) {
        if (ticket.status !== 'error') continue;
        const row = chunk[index]!;
        console.error('Expo push ticket error', {
          ...context,
          ticketIndex: index,
          tokenId: createHash('sha256').update(row.token).digest('hex').slice(0, 12),
          code: ticket.details?.error,
          message: ticket.message,
        });
        if (ticket.details?.error === 'DeviceNotRegistered') {
          try {
            await deletePushToken(row.memberId, row.token);
          } catch (error) {
            console.error('Expo push token cleanup failed', { ...context, ticketIndex: index, error });
          }
        }
      }
    } catch (error) {
      console.error('Expo push batch failed', { ...context, error });
    }
  }
}
