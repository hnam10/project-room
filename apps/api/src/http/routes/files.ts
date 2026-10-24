import express, { Router } from 'express';
import { MAX_FILE_BYTES } from '@project-room/shared';
import { listFiles } from '../../repositories/files.js';
import { contentDisposition, deleteFile, openFile, uploadFile } from '../../services/files.js';
import { ctx } from '../context.js';

export const filesRouter = Router({ mergeParams: true });

filesRouter.get('/', async (_req, res) => {
  res.json(await listFiles(ctx(res).project.id));
});

// The body is the file itself. A .json file is still sent as octet-stream (the real type goes in
// x-file-type) so the global JSON parser does not consume it.
filesRouter.post('/', express.raw({ type: 'application/octet-stream', limit: MAX_FILE_BYTES }), async (req, res) => {
  const { project, memberId } = ctx(res);
  const bytes = Buffer.isBuffer(req.body) ? req.body : Buffer.alloc(0);
  const file = await uploadFile(project.id, memberId, {
    nameHeader: req.get('x-file-name'),
    typeHeader: req.get('x-file-type'),
    bytes,
  });
  res.status(201).json(file);
});

filesRouter.get('/:fileId/download', async (req, res) => {
  const { project } = ctx(res);
  const { file, bytes } = await openFile(project.id, req.params.fileId);
  res.set({
    'Content-Type': file.contentType,
    'Content-Length': String(bytes.length),
    'Content-Disposition': contentDisposition(file.name),
    'X-Content-Type-Options': 'nosniff',
    'Cache-Control': 'private, no-store',
  });
  res.send(bytes);
});

filesRouter.delete('/:fileId', async (req, res) => {
  await deleteFile(ctx(res).project.id, req.params.fileId);
  res.status(204).end();
});
