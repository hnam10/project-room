import type {
  Decision,
  Idea,
  IdeaCreateInput,
  Member,
  MemoryAnswer,
  Message,
  Project,
  ProjectUpdateInput,
  Suggestion,
  SuggestionUpdateInput,
  Task,
  TaskCreateInput,
  TaskUpdateInput,
  WorkspaceSnapshot,
} from '@project-room/shared';
import { authHeaders } from './auth';

// Thin typed wrapper over the REST API. Every call carries the caller's credentials (see ./auth).

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function request<T>(method: string, path: string, body?: unknown, init?: RequestInit): Promise<T> {
  const projectId = /^\/projects\/([^/]+)/.exec(path)?.[1];
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      ...init,
      method,
      headers: {
        'content-type': body instanceof Blob ? body.type : 'application/json',
        ...(await authHeaders(projectId && decodeURIComponent(projectId))),
      },
      body: body instanceof Blob || body === undefined ? body : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, 'Can’t reach the server. Is the API running?');
  }
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
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

  createTask: (projectId: string, input: TaskCreateInput) => request<Task>('POST', `${p(projectId)}/tasks`, input),
  updateTask: (projectId: string, taskId: string, patch: TaskUpdateInput) =>
    request<Task>('PATCH', `${p(projectId)}/tasks/${taskId}`, patch),
  deleteTask: (projectId: string, taskId: string) => request<void>('DELETE', `${p(projectId)}/tasks/${taskId}`),

  messages: (projectId: string, channelId: string) => request<Message[]>('GET', `${p(projectId)}/channels/${channelId}/messages`),
  sendMessage: (projectId: string, channelId: string, text: string) =>
    request<Message>('POST', `${p(projectId)}/channels/${channelId}/messages`, { text }),

  createIdea: (projectId: string, input: IdeaCreateInput) => request<Idea>('POST', `${p(projectId)}/ideas`, input),
  voteIdea: (projectId: string, ideaId: string) => request<Idea>('POST', `${p(projectId)}/ideas/${ideaId}/vote`),
  convertIdea: (projectId: string, ideaId: string) =>
    request<{ idea: Idea; task: Task }>('POST', `${p(projectId)}/ideas/${ideaId}/convert`),

  decide: (projectId: string, decisionId: string, details: { outcome: string; reason?: string }) =>
    request<Decision>('POST', `${p(projectId)}/decisions/${decisionId}/decide`, details),
  askProject: (projectId: string, question: string) => request<MemoryAnswer>('POST', `${p(projectId)}/decisions/ask`, { question }),

  updateSuggestion: (projectId: string, suggestionId: string, input: SuggestionUpdateInput) =>
    request<Suggestion>('PATCH', `${p(projectId)}/suggestions/${suggestionId}`, input),
  approveSuggestion: (projectId: string, suggestionId: string, options: { assigneeId?: string } = {}) =>
    request<Suggestion>('POST', `${p(projectId)}/suggestions/${suggestionId}/approve`, options),
  dismissSuggestion: (projectId: string, suggestionId: string) =>
    request<Suggestion>('POST', `${p(projectId)}/suggestions/${suggestionId}/dismiss`),
};
