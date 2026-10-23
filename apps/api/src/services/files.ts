import { randomUUID } from 'node:crypto';
import { fileNameSchema, fileSizeSchema, type ProjectFile } from '@project-room/shared';
import { createFile, deleteFileRecord, getFile } from '../repositories/files.js';
import { NotFoundError } from '../db/records.js';
import { readStoredFile, removeStoredFile, writeStoredFile } from './file-store.js';

/** Last path segment of a header value, so a name like `../../notes.txt` is stored as `notes.txt`. */
export function fileNameFromHeader(value: string | undefined): string {
  const raw = value?.trim() ?? '';
  let decoded: string;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    decoded = raw;
  }
  const base = decoded.replaceAll('\\', '/').split('/').pop() ?? '';
  const cleaned = stripControlChars(base).trim();
  return fileNameSchema.parse(cleaned);
}

function stripControlChars(value: string): string {
  let out = '';
  for (const char of value) {
    const code = char.charCodeAt(0);
    if (code >= 32 && code !== 127) out += char;
  }
  return out;
}

/** The type we store and send back. Anything that isn't a simple media type becomes a generic download. */
export function contentTypeFromHeader(value: string | undefined): string {
  const raw = (value ?? '').split(';')[0]?.trim().toLowerCase() ?? '';
  if (/^[\w.+-]+\/[\w.+-]+$/.test(raw) && raw.length <= 120) return raw;
  return 'application/octet-stream';
}

export function contentDisposition(name: string): string {
  const ascii = name.replace(/[^\x20-\x7E]/g, '_').replace(/["\\]/g, '_');
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`;
}

/** Writes the bytes, then the metadata. A failed record does not leave a listed file. */
export async function uploadFile(
  projectId: string,
  uploadedById: string,
  input: { nameHeader: string | undefined; typeHeader: string | undefined; bytes: Buffer },
): Promise<ProjectFile> {
  const name = fileNameFromHeader(input.nameHeader);
  const size = fileSizeSchema.parse(input.bytes.length);
  const contentType = contentTypeFromHeader(input.typeHeader);
  const id = randomUUID();
  await writeStoredFile(projectId, id, input.bytes);
  try {
    return await createFile(projectId, uploadedById, { id, name, size, contentType });
  } catch (error) {
    await removeStoredFile(projectId, id);
    throw error;
  }
}

export async function openFile(projectId: string, fileId: string): Promise<{ file: ProjectFile; bytes: Buffer }> {
  const file = await getFile(projectId, fileId);
  const bytes = await readStoredFile(projectId, fileId);
  if (!bytes) throw new NotFoundError('File');
  return { file, bytes };
}

/** Drops the record first, so a missing disk file still disappears from the project. */
export async function deleteFile(projectId: string, fileId: string): Promise<void> {
  await deleteFileRecord(projectId, fileId);
  await removeStoredFile(projectId, fileId);
}
