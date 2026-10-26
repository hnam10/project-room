import type { Note, NoteCreateInput, NoteUpdateInput } from '@project-room/shared';
import { queryMany, queryOne } from '../db/query.js';
import { ForbiddenError, NotFoundError, rid } from '../db/records.js';

export function listNotes(projectId: string): Promise<Note[]> {
  return queryMany<Note>('SELECT * FROM note WHERE projectId = $project ORDER BY createdAt DESC', {
    project: rid('project', projectId),
  });
}

/** Loads a note the caller wrote; other members' notes are read-only. */
async function getOwnNote(projectId: string, noteId: string, memberId: string): Promise<Note> {
  const note = await queryOne<Note>('SELECT * FROM ONLY $id WHERE projectId = $project', {
    id: rid('note', noteId),
    project: rid('project', projectId),
  });
  if (!note) throw new NotFoundError('Note');
  if (note.authorId !== memberId) throw new ForbiddenError('Only the author can change this note');
  return note;
}

export async function createNote(projectId: string, authorId: string, input: Required<NoteCreateInput>): Promise<Note> {
  const note = await queryOne<Note>('CREATE ONLY note CONTENT $content', {
    content: { ...input, projectId: rid('project', projectId), authorId: rid('member', authorId) },
  });
  if (!note) throw new Error('Note creation returned nothing');
  return note;
}

export async function updateNote(projectId: string, noteId: string, memberId: string, patch: NoteUpdateInput): Promise<Note> {
  await getOwnNote(projectId, noteId, memberId);
  const note = await queryOne<Note>('UPDATE ONLY $id MERGE $patch RETURN AFTER', { id: rid('note', noteId), patch });
  if (!note) throw new NotFoundError('Note');
  return note;
}

export async function deleteNote(projectId: string, noteId: string, memberId: string): Promise<void> {
  await getOwnNote(projectId, noteId, memberId);
  await queryOne('DELETE $id', { id: rid('note', noteId) });
}
