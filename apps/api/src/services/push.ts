import { getProject } from '../repositories/projects.js';
import { listPushTokensForMembers } from '../repositories/push-tokens.js';

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
  void send(record.projectId, record.title || 'New suggestion', record.id).catch((error) => {
    console.error('Expo push failed', error);
  });
}

async function send(projectId: string, title: string, suggestionId?: string): Promise<void> {
  const project = await getProject(projectId);
  if (!project) return;
  const tokens = (await listPushTokensForMembers(project.memberIds)).map((row) => row.token);
  if (tokens.length === 0) return;
  const messages = tokens.map((to) => ({
    to,
    title: 'AI suggestion waiting for your approval',
    body: title,
    data: { projectId, suggestionId: suggestionId ?? null },
  }));
  for (let i = 0; i < messages.length; i += 100) {
    const chunk = messages.slice(i, i + 100);
    await fetch(EXPO_PUSH_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify(chunk),
    });
  }
}
