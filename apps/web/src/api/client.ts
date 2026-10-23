import type {
  Decision,
  Idea,
  IdeaCreateInput,
  Member,
  MemoryAnswer,
  Message,
  Project,
  ProjectFile,
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

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const projectId = /^\/projects\/([^/]+)/.exec(path)?.[1];
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      method,
      headers: { 'content-type': 'application/json', ...(await authHeaders(projectId && decodeURIComponent(projectId))) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError(0, 'Can’t reach the server. Is the API running?');
  }
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.error ?? `Request failed (${res.status})`);
  return data as T;
}

const p = (projectId: string) => `/projects/${encodeURIComponent(projectId)}`;

async function errorMessage(res: Response): Promise<string> {
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  return data.error ?? `Request failed (${res.status})`;
}

/** Sends the file bytes as-is. The name and media type travel in headers so JSON parsing never sees the body. */
async function upload(projectId: string, file: File): Promise<ProjectFile> {
  let res: Response;
  try {
    res = await fetch(`/api${p(projectId)}/files`, {
      method: 'POST',
      headers: {
        'content-type': 'application/octet-stream',
        'x-file-name': encodeURIComponent(file.name),
        'x-file-type': file.type || 'application/octet-stream',
        ...(await authHeaders(projectId)),
      },
      body: file,
    });
  } catch {
    throw new ApiError(0, 'Can’t reach the server. Is the API running?');
  }
  if (!res.ok) throw new ApiError(res.status, await errorMessage(res));
  return (await res.json()) as ProjectFile;
}

async function download(projectId: string, fileId: string): Promise<Blob> {
  let res: Response;
  try {
    res = await fetch(`/api${p(projectId)}/files/${encodeURIComponent(fileId)}/download`, {
      headers: await authHeaders(projectId),
    });
  } catch {
    throw new ApiError(0, 'Can’t reach the server. Is the API running?');
  }
  if (!res.ok) throw new ApiError(res.status, await errorMessage(res));
  return res.blob();
}

export interface Me {
  member: Member;
  projects: Project[];
  auth: 'clerk' | 'dev';
  ai: { provider: string; isMock: boolean };
}

export const api = {
  me: () => request<Me>('GET', '/me'),
  snapshot: (projectId: string) => request<WorkspaceSnapshot>('GET', `${p(projectId)}/snapshot`),

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

  uploadFile: (projectId: string, file: File) => upload(projectId, file),
  downloadFile: (projectId: string, fileId: string) => download(projectId, fileId),
  deleteFile: (projectId: string, fileId: string) => request<void>('DELETE', `${p(projectId)}/files/${fileId}`),
};
