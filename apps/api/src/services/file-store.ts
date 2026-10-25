import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config.js';
import { NotFoundError } from '../db/records.js';

/** Absolute path for one upload. Rejects ids that would escape the files directory. */
export function storedFilePath(projectId: string, fileId: string): string {
  if (projectId.includes('..') || fileId.includes('..') || /[/\\]/.test(projectId) || /[/\\]/.test(fileId)) {
    throw new NotFoundError('File');
  }
  const root = path.resolve(config.filesDir);
  const full = path.resolve(root, projectId, fileId);
  const relative = path.relative(root, full);
  if (relative.startsWith('..') || path.isAbsolute(relative)) throw new NotFoundError('File');
  return full;
}

export async function writeStoredFile(projectId: string, fileId: string, bytes: Buffer): Promise<void> {
  const full = storedFilePath(projectId, fileId);
  await mkdir(path.dirname(full), { recursive: true });
  await writeFile(full, bytes);
}

export async function readStoredFile(projectId: string, fileId: string): Promise<Buffer | null> {
  try {
    return await readFile(storedFilePath(projectId, fileId));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

export async function removeStoredFile(projectId: string, fileId: string): Promise<void> {
  await rm(storedFilePath(projectId, fileId), { force: true });
}
