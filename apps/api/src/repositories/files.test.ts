import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { closeDb, connectDb } from '../db/client.js';
import * as query from '../db/query.js';
import { NotFoundError, rid } from '../db/records.js';
import { createFile, deleteFileRecord, getFile } from './files.js';

beforeAll(async () => {
  await connectDb('mem://');
});

afterEach(() => {
  vi.restoreAllMocks();
});

afterAll(async () => {
  await closeDb();
});

describe('file deletion project boundary', () => {
  it('rejects deletion of a file belonging to another project', async () => {
    const file = await createFile('owner', 'alex', { id: 'private', name: 'notes.txt', size: 1, contentType: 'text/plain' });

    await expect(deleteFileRecord('other', file.id)).rejects.toBeInstanceOf(NotFoundError);
    expect(await getFile('owner', file.id)).toEqual(file);
  });

  it('preserves a file whose project changes between the lookup and the delete', async () => {
    const file = await createFile('owner', 'alex', { id: 'moved', name: 'notes.txt', size: 1, contentType: 'text/plain' });
    const queryOne = query.queryOne;
    vi.spyOn(query, 'queryOne').mockImplementationOnce(async <T>(sql: string, vars: Record<string, unknown> = {}) => {
      const selected = await queryOne<T>(sql, vars);
      await queryOne('UPDATE ONLY $id SET projectId = $project', {
        id: rid('file', file.id),
        project: rid('project', 'other'),
      });
      return selected;
    });

    await deleteFileRecord('owner', file.id);

    expect(await getFile('other', file.id)).toMatchObject({ id: file.id, projectId: 'other' });
  });
});
