import { Router } from 'express';
import { noteCreateSchema, noteUpdateSchema } from '@project-room/shared';
import { createNote, deleteNote, updateNote } from '../../repositories/notes.js';
import { ctx } from '../context.js';

export const notesRouter = Router({ mergeParams: true });

notesRouter.post('/', async (req, res) => {
  const { project, memberId } = ctx(res);
  res.status(201).json(await createNote(project.id, memberId, noteCreateSchema.parse(req.body)));
});

notesRouter.patch('/:noteId', async (req, res) => {
  const { project, memberId } = ctx(res);
  res.json(await updateNote(project.id, req.params.noteId, memberId, noteUpdateSchema.parse(req.body)));
});

notesRouter.delete('/:noteId', async (req, res) => {
  const { project, memberId } = ctx(res);
  await deleteNote(project.id, req.params.noteId, memberId);
  res.status(204).end();
});
