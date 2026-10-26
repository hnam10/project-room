import type {
  Member,
  Message,
  Poll,
  Project,
  ProjectUpdateInput,
  Suggestion,
  SuggestionApproveInput,
  SuggestionUpdateInput,
  Task,
  TaskUpdateInput,
  WorkspaceSnapshot,
} from '@project-room/shared';
import { apiBaseUrl, tunnelHeaders } from '../config';
import { authHeaders } from './auth';

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function request<T>(method: string, path: string, body?: unknown, authenticated = true): Promise<T> {
  const projectId = /^\/projects\/([^/]+)/.exec(path)?.[1];
  const base = apiBaseUrl();
  let res: Response;
  try {
    res = await fetch(`${base}/api${path}`, {
      method,
      headers: {
        'content-type': 'application/json',
        ...tunnelHeaders(base),
        ...(authenticated ? await authHeaders(projectId && decodeURIComponent(projectId)) : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, 'Can’t reach the server. Check EXPO_PUBLIC_API_URL and that the API is running.');
  }
  if (res.status === 204) return undefined as T;
  const data = (await res.json().catch(() => null)) as { error?: string } | null;
  if (data === null) throw new ApiError(res.status, 'The server returned a page instead of data.');
  if (!res.ok) throw new ApiError(res.status, data.error ?? `Request failed (${res.status})`);
  return data as T;
}

export const p = (projectId: string) => `/projects/${encodeURIComponent(projectId)}`;

export interface Me {
  member: Member;
  projects: Project[];
  auth: 'clerk' | 'dev';
  ai: { provider: string; isMock: boolean };
}

export const api = {
  me: () => request<Me>('GET', '/me'),
  snapshot: (projectId: string) => request<WorkspaceSnapshot>('GET', `${p(projectId)}/snapshot`),
  updateProject: (projectId: string, patch: ProjectUpdateInput) => request<Project>('PATCH', p(projectId), patch),

  messages: (projectId: string, channelId: string) =>
    request<Message[]>('GET', `${p(projectId)}/channels/${encodeURIComponent(channelId)}/messages`),
  sendMessage: (projectId: string, channelId: string, text: string) =>
    request<Message>('POST', `${p(projectId)}/channels/${encodeURIComponent(channelId)}/messages`, { text, fileId: null }),

  updateTask: (projectId: string, taskId: string, patch: TaskUpdateInput) =>
    request<Task>('PATCH', `${p(projectId)}/tasks/${taskId}`, patch),

  approveSuggestion: (projectId: string, suggestionId: string, options: SuggestionApproveInput = {}) =>
    request<Suggestion>('POST', `${p(projectId)}/suggestions/${suggestionId}/approve`, options),
  updateSuggestion: (projectId: string, suggestionId: string, input: SuggestionUpdateInput) =>
    request<Suggestion>('PATCH', `${p(projectId)}/suggestions/${suggestionId}`, input),
  dismissSuggestion: (projectId: string, suggestionId: string) =>
    request<Suggestion>('POST', `${p(projectId)}/suggestions/${suggestionId}/dismiss`),

  votePoll: (projectId: string, pollId: string, optionId: string) =>
    request<Poll>('POST', `${p(projectId)}/polls/${pollId}/vote`, { optionId }),
  closePoll: (projectId: string, pollId: string) => request<Poll>('POST', `${p(projectId)}/polls/${pollId}/close`),

  registerPushToken: (token: string, revocationKey: string) => request<void>('POST', '/me/push-token', { token, revocationKey }),
  unregisterPushToken: (token: string, revocationKey: string) =>
    request<void>('DELETE', '/push-token/revoke', { token, revocationKey }, false),
};
