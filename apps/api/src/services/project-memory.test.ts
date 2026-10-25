import { describe, expect, it, vi } from 'vitest';
import { clipExcerpts, createProjectMemory, memoryMediaType, memorySearchQuery, projectScope } from './project-memory.js';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function memoryWith(handler: (url: string, init?: RequestInit) => Promise<Response> | Response) {
  const fetchImpl = vi.fn(async (url: string, init?: RequestInit) => handler(url, init));
  const memory = createProjectMemory({
    endpoint: 'https://memory.example',
    apiKey: 'secret',
    context: 'ctx',
    fetchImpl,
  });
  return { memory, fetchImpl };
}

describe('project memory', () => {
  it('reads pdf and images, and skips office files', () => {
    expect(memoryMediaType('rubric.pdf', 'application/pdf')).toBe('application/pdf');
    expect(memoryMediaType('shot.png', 'application/octet-stream')).toBe('image/png');
    expect(memoryMediaType('notes.docx', 'application/octet-stream')).toBeNull();
  });

  it('scopes a project id and rejects one that is not a path segment', () => {
    expect(projectScope('org_abc')).toBe('project/org_abc');
    expect(projectScope('org_3KzH02XTbR1zERhgsjjDduXpwBx')).toBe('project/org_3kzh02xtbr1zerhgsjjdduxpwbx');
    expect(projectScope('a/b')).toBeNull();
  });

  it('keeps four short passages and drops duplicates', () => {
    const excerpts = clipExcerpts([
      { name: 'a.pdf', text: `  ${'word '.repeat(300)}` },
      { name: 'a.pdf', text: 'same' },
      { name: 'a.pdf', text: 'same' },
      { name: 'b.pdf', text: 'two' },
      { name: 'c.pdf', text: 'three' },
      { name: 'd.pdf', text: 'four' },
    ]);
    expect(excerpts).toHaveLength(4);
    expect(excerpts[0]?.text.length).toBeLessThanOrEqual(800);
    expect(excerpts.filter((item) => item.text === 'same')).toHaveLength(1);
  });

  it('uploads a pdf into the project scope and returns the document id', async () => {
    const { memory, fetchImpl } = memoryWith(async (url, init) => {
      if (url.endsWith('/scopes')) return jsonResponse(201, { path: 'project/' });
      expect(init?.method).toBe('POST');
      const form = init?.body as FormData;
      const metadata = JSON.parse(String(form.get('metadata'))) as { scopes: string[][]; mimeType: string };
      expect(metadata.scopes).toEqual([['project/org_abc']]);
      expect(metadata.mimeType).toBe('application/pdf');
      expect(new Headers(init?.headers).get('Authorization')).toBe('Bearer secret');
      return jsonResponse(202, { id: 'doc1', status: 'queued' });
    });

    await expect(
      memory.rememberFile({ projectId: 'org_abc', name: 'rubric.pdf', contentType: 'application/pdf', bytes: Buffer.from('%PDF') }),
    ).resolves.toBe('doc1');
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  it('does not call Agent Memory for a Word file', async () => {
    const { memory, fetchImpl } = memoryWith(() => jsonResponse(500, {}));
    await expect(
      memory.rememberFile({
        projectId: 'org_abc',
        name: 'slides.pptx',
        contentType: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        bytes: Buffer.from('ppt'),
      }),
    ).resolves.toBeNull();
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it('queries only that project and clips the hits', async () => {
    const { memory } = memoryWith(async (_url, init) => {
      const body = JSON.parse(String(init?.body)) as { lens: string[][]; query: string };
      expect(body.lens).toEqual([['project/org_abc']]);
      expect(body.query).toContain('@AI what is due');
      return jsonResponse(200, {
        results: [{ chunk: { text: 'The report is due Friday.' }, document: { id: 'doc_1', title: 'rubric.pdf' } }],
      });
    });
    await expect(memory.excerpts('org_abc', '@AI what is due')).resolves.toEqual([
      { name: 'rubric.pdf', text: 'The report is due Friday.', documentId: 'doc_1' },
    ]);
  });

  it('searches with the latest part of a long conversation', () => {
    const query = `${'earlier discussion '.repeat(200)}@AI what is due`;
    const searched = memorySearchQuery(query);
    expect(searched.length).toBeLessThanOrEqual(1500);
    expect(searched.endsWith('@AI what is due')).toBe(true);
    expect(searched.startsWith('earlier')).toBe(false);
  });

  it('treats a missing document as already forgotten', async () => {
    const { memory } = memoryWith(async () => new Response(null, { status: 404 }));
    await expect(memory.forgetFile('doc1')).resolves.toBeUndefined();
  });
});
