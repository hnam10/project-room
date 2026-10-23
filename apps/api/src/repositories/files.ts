import type { ProjectFile } from '@project-room/shared';
import { queryMany, queryOne } from '../db/query.js';
import { NotFoundError, rid } from '../db/records.js';

export function listFiles(projectId: string): Promise<ProjectFile[]> {
  return queryMany<ProjectFile>('SELECT * FROM file WHERE projectId = $project ORDER BY createdAt DESC', {
    project: rid('project', projectId),
  });
}

export async function getFile(projectId: string, fileId: string): Promise<ProjectFile> {
  const file = await queryOne<ProjectFile>('SELECT * FROM ONLY $id WHERE projectId = $project', {
    id: rid('file', fileId),
    project: rid('project', projectId),
  });
  if (!file) throw new NotFoundError('File');
  return file;
}

export async function createFile(
  projectId: string,
  uploadedById: string,
  input: { id: string; name: string; size: number; contentType: string },
): Promise<ProjectFile> {
  const file = await queryOne<ProjectFile>('CREATE ONLY file CONTENT $content', {
    content: {
      id: rid('file', input.id),
      projectId: rid('project', projectId),
      name: input.name,
      size: input.size,
      contentType: input.contentType,
      uploadedById: rid('member', uploadedById),
    },
  });
  if (!file) throw new Error('File creation returned nothing');
  return file;
}

export async function deleteFileRecord(projectId: string, fileId: string): Promise<void> {
  await getFile(projectId, fileId);
  await queryOne('DELETE $id WHERE projectId = $project', {
    id: rid('file', fileId),
    project: rid('project', projectId),
  });
}
