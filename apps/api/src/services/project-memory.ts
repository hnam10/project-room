import type { FileExcerpt } from '../ai/provider.js';
import { config } from '../config.js';

// Project files are read by SurrealDB Agent Memory. @AI later receives a few short passages.
// The chat model never sees the file bytes. "Ask the project" still uses approved decisions only.

const MEDIA_BY_EXTENSION: Record<string, string> = {
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  txt: 'text/plain',
  md: 'text/markdown',
  csv: 'text/csv',
  json: 'application/json',
  html: 'text/html',
  htm: 'text/html',
};

const MEDIA_TYPES = new Set(Object.values(MEDIA_BY_EXTENSION));

const MAX_EXCERPTS = 4;
const MAX_EXCERPT_CHARS = 800;
const MAX_QUERY_CHARS = 1500;

/** Keeps the end of a long query so the latest message is what gets searched. */
export function memorySearchQuery(query: string): string {
  const trimmed = query.trim();
  if (trimmed.length <= MAX_QUERY_CHARS) return trimmed;
  return trimmed.slice(-MAX_QUERY_CHARS).trimStart();
}

/** A media type Agent Memory can extract, or null when the file should stay download-only. */
export function memoryMediaType(name: string, contentType: string): string | null {
  const header = contentType.split(';')[0]?.trim().toLowerCase() ?? '';
  if (header === 'image/jpg') return 'image/jpeg';
  if (MEDIA_TYPES.has(header)) return header;
  const extension = name.split('.').pop()?.toLowerCase() ?? '';
  return MEDIA_BY_EXTENSION[extension] ?? null;
}

/** Scope path for one project. Null when the id could not be a safe path segment. */
export function projectScope(projectId: string): string | null {
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,79}$/.test(projectId)) return null;
  return `project/${projectId}`;
}

/** Keeps the passages short enough to send on to the chat model. */
export function clipExcerpts(hits: { name: string; text: string }[]): FileExcerpt[] {
  const excerpts: FileExcerpt[] = [];
  const seen = new Set<string>();
  for (const hit of hits) {
    if (excerpts.length >= MAX_EXCERPTS) break;
    const text = hit.text.replace(/\s+/g, ' ').trim().slice(0, MAX_EXCERPT_CHARS);
    if (!text) continue;
    const key = `${hit.name}\n${text}`;
    if (seen.has(key)) continue;
    seen.add(key);
    excerpts.push({ name: hit.name || 'file', text });
  }
  return excerpts;
}

export interface ProjectMemory {
  /** Sends a supported file. Returns the Agent Memory document id, or null when the type is skipped. */
  rememberFile(input: { projectId: string; name: string; contentType: string; bytes: Buffer }): Promise<string | null>;
  forgetFile(documentId: string): Promise<void>;
  excerpts(projectId: string, query: string): Promise<FileExcerpt[]>;
}

interface MemoryOptions {
  endpoint: string;
  apiKey: string;
  context: string;
  fetchImpl?: (input: string, init?: RequestInit) => Promise<Response>;
}

interface QueryHit {
  chunk?: { text?: unknown };
  document?: { title?: unknown };
}

export function createProjectMemory(options: MemoryOptions): ProjectMemory {
  const endpoint = options.endpoint.replace(/\/$/, '');
  const fetchImpl = options.fetchImpl ?? fetch;
  const ready = new Set<string>();

  async function call(path: string, init: RequestInit): Promise<Response> {
    const headers = new Headers(init.headers);
    headers.set('Authorization', `Bearer ${options.apiKey}`);
    headers.set('Accept', 'application/json');
    return fetchImpl(`${endpoint}/api/v1/${encodeURIComponent(options.context)}${path}`, { ...init, headers });
  }

  async function ensureScope(path: string): Promise<void> {
    if (ready.has(path)) return;
    const response = await call('/scopes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path }),
    });
    if (response.ok || response.status === 409) {
      ready.add(path);
      return;
    }
    throw new Error(`Agent Memory rejected scope ${path} (${response.status})`);
  }

  return {
    async rememberFile(input) {
      const mediaType = memoryMediaType(input.name, input.contentType);
      const scope = projectScope(input.projectId);
      if (!mediaType || !scope) return null;
      await ensureScope('project');
      await ensureScope(scope);
      const form = new FormData();
      form.append('file', new Blob([Uint8Array.from(input.bytes)], { type: mediaType }), input.name);
      form.append('metadata', JSON.stringify({ title: input.name, mimeType: mediaType, scopes: [[scope]] }));
      const response = await call('/documents', { method: 'POST', body: form });
      if (!response.ok) throw new Error(`Agent Memory rejected ${input.name} (${response.status})`);
      const body = (await response.json()) as { id?: unknown };
      if (typeof body.id !== 'string' || !body.id) throw new Error('Agent Memory returned no document id');
      return body.id;
    },

    async forgetFile(documentId) {
      const response = await call(`/documents/${encodeURIComponent(documentId)}`, { method: 'DELETE' });
      if (response.ok || response.status === 404) return;
      throw new Error(`Agent Memory could not delete document ${documentId} (${response.status})`);
    },

    async excerpts(projectId, query) {
      const scope = projectScope(projectId);
      const trimmed = memorySearchQuery(query);
      if (!scope || !trimmed) return [];
      const response = await call('/documents/query', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: trimmed, k: MAX_EXCERPTS, mode: 'hybrid', lens: [[scope]] }),
      });
      if (!response.ok) throw new Error(`Agent Memory query failed (${response.status})`);
      const body = (await response.json()) as { results?: QueryHit[] };
      const hits = (body.results ?? []).flatMap((hit) => {
        const text = hit.chunk?.text;
        const name = hit.document?.title;
        if (typeof text !== 'string') return [];
        return [{ name: typeof name === 'string' ? name : 'file', text }];
      });
      return clipExcerpts(hits);
    },
  };
}

let singleton: ProjectMemory | null | undefined;

/** The configured client, or null when the three Agent Memory variables are unset. */
export function getProjectMemory(): ProjectMemory | null {
  if (singleton !== undefined) return singleton;
  if (!config.agentMemoryEndpoint || !config.agentMemoryApiKey || !config.agentMemoryContext) {
    singleton = null;
    return null;
  }
  singleton = createProjectMemory({
    endpoint: config.agentMemoryEndpoint,
    apiKey: config.agentMemoryApiKey,
    context: config.agentMemoryContext,
  });
  return singleton;
}
